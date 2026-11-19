/**
 * Thin OpenRouter chat client with JSON-schema output, validation + one repair
 * retry, HTTP retries with backoff, a concurrency gate, a daily budget, and
 * telemetry (in-memory ring + cumulative stats + JSONL log).
 *
 * No SDK: uses global fetch. All calls from the brain go through `chat()`.
 */
import { mkdirSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ZodTypeAny, z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type BrainErrorCode = "http" | "timeout" | "network" | "invalid_json" | "schema" | "empty" | "budget";

export class BrainError extends Error {
  readonly code: BrainErrorCode;
  readonly kind: string;
  readonly model: string;
  readonly attempts: number;
  readonly status?: number;
  readonly raw?: string;
  constructor(code: BrainErrorCode, message: string, info: { kind: string; model: string; attempts: number; status?: number; raw?: string; cause?: unknown }) {
    super(`[brain:${info.kind}:${code}] ${message}`, info.cause !== undefined ? { cause: info.cause } : undefined);
    this.name = "BrainError";
    this.code = code;
    this.kind = info.kind;
    this.model = info.model;
    this.attempts = info.attempts;
    this.status = info.status;
    this.raw = info.raw;
  }
}

export interface ChatRequest<S extends ZodTypeAny | undefined = undefined> {
  model: string;
  system: string;
  user: string;
  schema?: S;
  temperature: number;
  maxTokens: number;
  /** telemetry bucket: "plan" | "react" | "converse" | ... */
  kind: string;
  /** "off" (default) disables thinking entirely; "minimal" = effort low; "default" = provider default */
  reasoning?: "minimal" | "off" | "default";
  /** cheapest provider first (bulk model) */
  sortByPrice?: boolean;
}

export interface ChatResult<T> {
  data: T;
  raw: string;
  model: string; // model actually used (may differ from requested after fallback)
  costUsd: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  attempts: number;
  repaired: boolean;
}

export interface CallRecord {
  ts: string;
  kind: string;
  model: string;
  requestedModel: string;
  ok: boolean;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  costUsd: number;
  attempts: number;
  repaired: boolean;
  jsonMode: "json_schema" | "json_object";
  error?: string;
}

export interface KindStats { calls: number; costUsd: number; failures: number; latencyMsTotal: number; promptTokens: number; completionTokens: number }
export interface ClientStats {
  calls: number;
  costUsd: number;
  failures: number;
  byKind: Record<string, KindStats>;
  costTodayUsd: number;
  callsToday: number;
  budgetExceeded: boolean;
}

export interface ClientOptions {
  apiKey: string;
  /** USD per local calendar day before the mid model is downgraded to bulk */
  dailyBudgetUsd: number;
  /** model used instead of the requested one when over budget (set by the brain to the bulk model) */
  budgetFallbackModel?: string;
  /** models that are allowed to run even over budget (the bulk model) */
  budgetExemptModels?: string[];
  baseUrl?: string;
  timeoutMs?: number;
  maxConcurrency?: number;
  /** JSONL log path; null disables. default apps/engine/data/llm_calls.jsonl */
  logPath?: string | null;
  fetchImpl?: typeof fetch;
  /** sleep override for tests */
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const RING_SIZE = 200;
const HTTP_RETRIES = 2;

function defaultLogPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../../data/llm_calls.jsonl");
}

function localDayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** zod -> JSON schema that OpenAI-style strict mode accepts: no $ref, all properties required, additionalProperties:false. */
export function toStrictJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const js = zodToJsonSchema(schema, { $refStrategy: "none", target: "jsonSchema7" }) as Record<string, unknown>;
  delete js.$schema;
  strictify(js);
  return js;
}

function strictify(node: unknown): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach(strictify); return; }
  const n = node as Record<string, unknown>;
  if (n.properties && typeof n.properties === "object") {
    n.required = Object.keys(n.properties as object);
    n.additionalProperties = false;
    for (const v of Object.values(n.properties as object)) strictify(v);
  }
  for (const key of ["items", "anyOf", "oneOf", "allOf", "not"]) if (n[key]) strictify(n[key]);
  if (n.additionalProperties && typeof n.additionalProperties === "object") strictify(n.additionalProperties);
}

/** Pull JSON out of a completion that may wrap it in code fences or prose. */
export function extractJson(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  if (!t.startsWith("{") && !t.startsWith("[")) {
    const start = t.search(/[{[]/);
    if (start >= 0) t = t.slice(start);
  }
  // trim trailing prose after the last closing brace/bracket
  const lastBrace = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (lastBrace >= 0) t = t.slice(0, lastBrace + 1);
  return t;
}

function formatZodError(err: z.ZodError): string {
  return err.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly limit: number) {}
  async acquire(): Promise<() => void> {
    if (this.active < this.limit) { this.active++; return () => this.release(); }
    await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    return () => this.release();
  }
  private release() {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
  get pending() { return this.queue.length; }
}

/* ------------------------------------------------------------------ */
/* Client                                                               */
/* ------------------------------------------------------------------ */

export class OpenRouterClient {
  private readonly opts: Required<Pick<ClientOptions, "apiKey" | "dailyBudgetUsd" | "baseUrl" | "timeoutMs" | "maxConcurrency">> & ClientOptions;
  private readonly sem: Semaphore;
  private readonly ring: CallRecord[] = [];
  private readonly stats: ClientStats = { calls: 0, costUsd: 0, failures: 0, byKind: {}, costTodayUsd: 0, callsToday: 0, budgetExceeded: false };
  private dayKey = localDayKey();
  private budgetWarned = false;
  /** models whose provider rejected json_schema; we use json_object + instructions for them */
  private readonly noJsonSchema = new Set<string>();
  /** models whose provider refuses reasoning:{enabled:false}; we send effort:"low" instead */
  private readonly noReasoningOff = new Set<string>();
  private readonly logPath: string | null;
  private logDirReady = false;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: (msg: string) => void;

  constructor(options: ClientOptions) {
    this.opts = {
      baseUrl: "https://openrouter.ai/api/v1",
      timeoutMs: 45_000,
      maxConcurrency: 8,
      ...options,
    };
    this.sem = new Semaphore(this.opts.maxConcurrency);
    this.logPath = options.logPath === undefined ? defaultLogPath() : options.logPath;
    this.fetchImpl = options.fetchImpl ?? ((...a) => fetch(...a));
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.log = options.log ?? ((m) => console.warn(m));
  }

  /* ---------------- telemetry ---------------- */

  getStats(): ClientStats {
    this.rollDay();
    return { ...this.stats, byKind: Object.fromEntries(Object.entries(this.stats.byKind).map(([k, v]) => [k, { ...v }])) };
  }

  recent(n = 50): CallRecord[] { return this.ring.slice(-n); }

  private rollDay() {
    const k = localDayKey();
    if (k !== this.dayKey) {
      this.dayKey = k;
      this.stats.costTodayUsd = 0;
      this.stats.callsToday = 0;
      this.stats.budgetExceeded = false;
      this.budgetWarned = false;
    }
  }

  private record(rec: CallRecord) {
    this.ring.push(rec);
    if (this.ring.length > RING_SIZE) this.ring.splice(0, this.ring.length - RING_SIZE);
    this.stats.calls++;
    this.stats.callsToday++;
    this.stats.costUsd += rec.costUsd;
    this.stats.costTodayUsd += rec.costUsd;
    if (!rec.ok) this.stats.failures++;
    const k = (this.stats.byKind[rec.kind] ??= { calls: 0, costUsd: 0, failures: 0, latencyMsTotal: 0, promptTokens: 0, completionTokens: 0 });
    k.calls++;
    k.costUsd += rec.costUsd;
    k.latencyMsTotal += rec.latencyMs;
    k.promptTokens += rec.promptTokens;
    k.completionTokens += rec.completionTokens;
    if (!rec.ok) k.failures++;
    if (this.logPath) {
      try {
        if (!this.logDirReady) { mkdirSync(dirname(this.logPath), { recursive: true }); this.logDirReady = true; }
        appendFileSync(this.logPath, JSON.stringify(rec) + "\n");
      } catch (e) { this.log(`[brain] could not write llm log: ${(e as Error).message}`); }
    }
  }

  /** Budget gate: returns the model to actually use. */
  resolveModel(requested: string): string {
    this.rollDay();
    const over = this.stats.costTodayUsd > this.opts.dailyBudgetUsd;
    if (!over) return requested;
    if (!this.budgetWarned) {
      this.budgetWarned = true;
      this.stats.budgetExceeded = true;
      this.log(`[brain] daily budget $${this.opts.dailyBudgetUsd.toFixed(2)} exceeded (spent $${this.stats.costTodayUsd.toFixed(4)} today). Bulk calls continue; mid-model calls fall back to ${this.opts.budgetFallbackModel ?? "the bulk model"}.`);
    }
    const exempt = this.opts.budgetExemptModels ?? [];
    if (exempt.includes(requested)) return requested;
    return this.opts.budgetFallbackModel ?? requested;
  }

  /* ---------------- main entry ---------------- */

  async chat<S extends ZodTypeAny>(req: ChatRequest<S> & { schema: S }): Promise<ChatResult<z.infer<S>>>;
  async chat(req: ChatRequest<undefined>): Promise<ChatResult<unknown>>;
  async chat(req: ChatRequest<ZodTypeAny | undefined>): Promise<ChatResult<unknown>> {
    const requestedModel = req.model;
    const model = this.resolveModel(requestedModel);
    const release = await this.sem.acquire();
    const t0 = Date.now();
    let attempts = 0;
    let cost = 0;
    let promptTokens = 0, completionTokens = 0, reasoningTokens = 0;
    let jsonMode: "json_schema" | "json_object" = req.schema && !this.noJsonSchema.has(model) ? "json_schema" : "json_object";
    const jsonSchema = req.schema ? toStrictJsonSchema(req.schema) : undefined;

    let recorded = false;
    const finish = (ok: boolean, error?: string) => {
      if (recorded) return;
      recorded = true;
      const rec: CallRecord = { ts: new Date().toISOString(), kind: req.kind, model, requestedModel, ok, latencyMs: Date.now() - t0, promptTokens, completionTokens, reasoningTokens, costUsd: cost, attempts, repaired: attempts > 1 && ok, jsonMode, error };
      this.record(rec);
      release();
    };

    try {
      let userPrompt = req.user;
      let maxTokens = req.maxTokens;
      let lastErr: { code: BrainErrorCode; message: string; raw: string } | null = null;

      for (let pass = 0; pass < 2; pass++) {
        attempts++;
        const messages = [
          { role: "system", content: req.system + (jsonMode === "json_object" && jsonSchema ? `\n\nRespond with a single JSON object that matches this JSON Schema exactly:\n${JSON.stringify(jsonSchema)}` : "") },
          { role: "user", content: userPrompt },
        ];
        const body: Record<string, unknown> = {
          model,
          messages,
          temperature: req.temperature,
          max_tokens: maxTokens,
          response_format: jsonMode === "json_schema" && jsonSchema
            ? { type: "json_schema", json_schema: { name: req.kind.replace(/[^a-zA-Z0-9_-]/g, "_"), strict: true, schema: jsonSchema } }
            : { type: "json_object" },
        };
        // "off" is the only setting that actually stops DeepSeek V4 Flash from thinking (effort:"low" still burns ~1k tokens).
        // A mid call downgraded to the bulk model over budget runs without thinking: on DeepSeek V4 Flash even effort:"low"
        // spent 4.8-5.2k reasoning tokens on storylines and returned nothing (season 1: 28 of 30 nights failed).
        const reasoning = model !== requestedModel ? "off" : (req.reasoning ?? "off");
        if (reasoning === "minimal" || (reasoning === "off" && this.noReasoningOff.has(model))) body.reasoning = { effort: "low", exclude: true };
        else if (reasoning === "off") body.reasoning = { enabled: false };
        if (req.sortByPrice) body.provider = { sort: "price" };

        const res = await this.post(body, req.kind, model);
        if (res.kind === "reasoning_rejected") {
          this.noReasoningOff.add(model);
          this.log(`[brain] ${model} requires reasoning; using effort:"low" for this model`);
          pass--;
          attempts--;
          continue;
        }
        if (res.kind === "schema_rejected") {
          // provider does not support json_schema: switch mode and redo this pass
          this.noJsonSchema.add(model);
          jsonMode = "json_object";
          this.log(`[brain] ${model} rejected json_schema; falling back to json_object for this model`);
          pass--;
          attempts--;
          continue;
        }
        cost += res.costUsd;
        promptTokens += res.promptTokens;
        completionTokens += res.completionTokens;
        reasoningTokens += res.reasoningTokens;

        const text = res.content;
        if (!text.trim()) {
          lastErr = { code: "empty", message: res.finishReason === "length" ? "empty output: max_tokens hit before any content (reasoning ate the budget?)" : "empty completion", raw: text };
        } else if (!req.schema) {
          finish(true);
          return { data: text, raw: text, model, costUsd: cost, latencyMs: Date.now() - t0, promptTokens, completionTokens, reasoningTokens, attempts, repaired: attempts > 1 } satisfies ChatResult<unknown>;
        } else {
          let parsed: unknown;
          try {
            parsed = JSON.parse(extractJson(text));
          } catch (e) {
            lastErr = { code: "invalid_json", message: `invalid JSON (${(e as Error).message})${res.finishReason === "length" ? " — output was truncated by max_tokens" : ""}`, raw: text };
          }
          if (parsed !== undefined) {
            const v = req.schema.safeParse(parsed);
            if (v.success) {
              finish(true);
              return { data: v.data, raw: text, model, costUsd: cost, latencyMs: Date.now() - t0, promptTokens, completionTokens, reasoningTokens, attempts, repaired: attempts > 1 };
            }
            lastErr = { code: "schema", message: formatZodError(v.error), raw: text };
          }
        }
        // repair pass: append the error and the offending output
        if (pass === 0) {
          if (res.finishReason === "length") maxTokens = Math.ceil(maxTokens * 1.6);
          userPrompt = `${req.user}\n\n---\nYour previous answer was rejected: ${lastErr!.message}\nPrevious answer (do not repeat its mistakes):\n${lastErr!.raw.slice(0, 1500)}\nReturn ONLY a corrected JSON object.`;
        }
      }
      const err = new BrainError(lastErr!.code, lastErr!.message, { kind: req.kind, model, attempts, raw: lastErr!.raw });
      finish(false, err.message);
      throw err;
    } catch (e) {
      if (e instanceof BrainError) { finish(false, e.message); throw e; }
      const err = new BrainError("network", (e as Error).message, { kind: req.kind, model, attempts, cause: e });
      finish(false, err.message);
      throw err;
    } finally {
      finish(true); // no-op if already recorded; guarantees the semaphore is released
    }
  }

  /* ---------------- HTTP with retries ---------------- */

  private async post(body: Record<string, unknown>, kind: string, model: string): Promise<
    | { kind: "ok"; content: string; finishReason: string; costUsd: number; promptTokens: number; completionTokens: number; reasoningTokens: number }
    | { kind: "schema_rejected" }
    | { kind: "reasoning_rejected" }
  > {
    let lastError: BrainError | null = null;
    for (let attempt = 0; attempt <= HTTP_RETRIES; attempt++) {
      if (attempt > 0) await this.sleep(500 * 3 ** (attempt - 1) + Math.random() * 300);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
      try {
        const res = await this.fetchImpl(`${this.opts.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.opts.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://npcworld.local",
            "X-Title": "NPC World",
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const text = await res.text();
        const reasoningOff = (body.reasoning as { enabled?: boolean } | undefined)?.enabled === false;
        if (res.status === 400 && reasoningOff && /reasoning/i.test(text)) return { kind: "reasoning_rejected" };
        if (res.status === 400 && /schema|response_format|structured/i.test(text) && body.response_format && (body.response_format as { type: string }).type === "json_schema") {
          return { kind: "schema_rejected" };
        }
        if (res.status === 429 || res.status >= 500) {
          lastError = new BrainError("http", `HTTP ${res.status}: ${text.slice(0, 300)}`, { kind, model, attempts: attempt + 1, status: res.status });
          continue;
        }
        if (!res.ok) {
          throw new BrainError("http", `HTTP ${res.status}: ${text.slice(0, 300)}`, { kind, model, attempts: attempt + 1, status: res.status });
        }
        let json: any;
        try { json = JSON.parse(text); } catch {
          lastError = new BrainError("http", `non-JSON response body: ${text.slice(0, 200)}`, { kind, model, attempts: attempt + 1, status: res.status });
          continue;
        }
        if (json.error) {
          // OpenRouter returns 200 with an error object for some upstream failures
          const msg = String(json.error.message ?? JSON.stringify(json.error));
          const code = Number(json.error.code ?? 500);
          if (reasoningOff && code === 400 && /reasoning/i.test(msg)) return { kind: "reasoning_rejected" };
          if (/schema|response_format|structured/i.test(msg) && (body.response_format as { type: string }).type === "json_schema") return { kind: "schema_rejected" };
          lastError = new BrainError("http", `upstream error ${code}: ${msg.slice(0, 300)}`, { kind, model, attempts: attempt + 1, status: code });
          if (code === 429 || code >= 500) continue;
          throw lastError;
        }
        const choice = json.choices?.[0];
        const content: string = typeof choice?.message?.content === "string" ? choice.message.content : Array.isArray(choice?.message?.content) ? choice.message.content.map((p: any) => p.text ?? "").join("") : "";
        const usage = json.usage ?? {};
        return {
          kind: "ok",
          content,
          finishReason: String(choice?.finish_reason ?? choice?.native_finish_reason ?? ""),
          costUsd: Number(usage.cost ?? 0),
          promptTokens: Number(usage.prompt_tokens ?? 0),
          completionTokens: Number(usage.completion_tokens ?? 0),
          reasoningTokens: Number(usage.completion_tokens_details?.reasoning_tokens ?? 0),
        };
      } catch (e) {
        if (e instanceof BrainError) { if (e.status && e.status < 500 && e.status !== 429) throw e; lastError = e; continue; }
        const aborted = (e as Error).name === "AbortError";
        lastError = new BrainError(aborted ? "timeout" : "network", aborted ? `timeout after ${this.opts.timeoutMs} ms` : (e as Error).message, { kind, model, attempts: attempt + 1, cause: e });
        continue;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new BrainError("network", "unknown failure", { kind, model, attempts: HTTP_RETRIES + 1 });
  }
}
