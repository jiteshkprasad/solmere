/**
 * OpenRouter-backed implementation of the `Brain` contract.
 *
 *   bulk model  — plan, react, converse, confessional   (cheap, fast, role-play strong)
 *   mid model   — reflect, businessDecision, politics, speech, vote, writePaper, updateStorylines
 *
 * Every method renders a prompt (./prompts/*), asks the client for strict JSON
 * against a wire schema, then maps the wire shape onto the contract type.
 * Validation failures retry once inside the client; a second failure throws a
 * BrainError, which the engine core catches and falls back from.
 */
import type {
  ArcChoice, Brain, BrainContext, BusinessDecision, BusinessState, Confessional, ConverseInput, ConverseOutput, DayPlan,
  ElectionState, Newspaper, Policy, PoliticsDecision, Reaction, Reflection, Storyline, VoteDecision, WorldEvent,
} from "@npcworld/schema";
import { ConverseInput as ConverseInputSchema } from "@npcworld/schema";
import type { ZodTypeAny, z } from "zod";
import { BrainError, OpenRouterClient, type CallRecord, type ClientOptions, type ClientStats } from "./client.js";
import { buildPlanPrompt } from "./prompts/plan.js";
import { buildReactPrompt } from "./prompts/react.js";
import { buildConversePrompt } from "./prompts/converse.js";
import { buildReflectPrompt } from "./prompts/reflect.js";
import { buildConfessionalPrompt } from "./prompts/confessional.js";
import { buildBusinessPrompt } from "./prompts/business.js";
import { buildPoliticsPrompt } from "./prompts/politics.js";
import { buildSpeechPrompt } from "./prompts/speech.js";
import { buildVotePrompt } from "./prompts/vote.js";
import { buildPaperPrompt } from "./prompts/paper.js";
import { buildStorylinesPrompt } from "./prompts/storylines.js";
import { buildArcPrompt } from "./prompts/arc.js";

export { BrainError } from "./client.js";
export type { CallRecord, ClientStats } from "./client.js";

export interface OpenRouterBrainOptions {
  apiKey: string;
  bulkModel: string;
  midModel: string;
  dailyBudgetUsd: number;
  /** test/bakeoff hooks; all optional */
  client?: Partial<Omit<ClientOptions, "apiKey" | "dailyBudgetUsd">>;
}

export interface OpenRouterBrain extends Brain {
  /** richer telemetry than Brain.stats(): byKind, today, ring */
  telemetry(): ClientStats & { last50: CallRecord[] };
  readonly client: OpenRouterClient;
}

interface PromptSpec<W extends ZodTypeAny, Out> {
  system: string;
  user: string;
  schema: W;
  map: (w: z.infer<W>) => Out;
  maxTokens: number;
}

const TEMPERATURE = {
  plan: 0.7, react: 0.7, converse: 0.9, confessional: 0.9,
  reflect: 0.7, business: 0.7, politics: 0.7, speech: 0.7, vote: 0.7, paper: 0.8, storylines: 0.7, arc: 0.6,
} as const;

export function createOpenRouterBrain(opts: OpenRouterBrainOptions): OpenRouterBrain {
  const client = new OpenRouterClient({
    apiKey: opts.apiKey,
    dailyBudgetUsd: opts.dailyBudgetUsd,
    budgetFallbackModel: opts.bulkModel,
    budgetExemptModels: [opts.bulkModel],
    ...opts.client,
  });

  async function run<W extends ZodTypeAny, Out>(kind: keyof typeof TEMPERATURE, tier: "bulk" | "mid", spec: PromptSpec<W, Out>): Promise<Out> {
    const model = tier === "bulk" ? opts.bulkModel : opts.midModel;
    const res = await client.chat({
      model,
      system: spec.system,
      user: spec.user,
      schema: spec.schema,
      temperature: TEMPERATURE[kind],
      maxTokens: spec.maxTokens,
      kind,
      reasoning: tier === "bulk" ? "off" : "minimal",
      sortByPrice: tier === "bulk",
    });
    try {
      return spec.map(res.data);
    } catch (e) {
      throw new BrainError("schema", `post-processing failed: ${(e as Error).message}`, { kind, model: res.model, attempts: res.attempts, raw: res.raw, cause: e });
    }
  }

  const brain: OpenRouterBrain = {
    client,

    plan: (ctx: BrainContext): Promise<DayPlan> => run("plan", "bulk", buildPlanPrompt(ctx)),

    react: (ctx: BrainContext): Promise<Reaction> => run("react", "bulk", buildReactPrompt(ctx)),

    converse: (input: ConverseInput): Promise<ConverseOutput> => {
      const n = input.participants.length;
      if (n < 2 || n > 3) throw new BrainError("schema", `converse needs 2–3 participants, got ${n}`, { kind: "converse", model: opts.bulkModel, attempts: 0 });
      ConverseInputSchema.pick({ locationName: true, pretext: true }).parse({ locationName: input.locationName, pretext: input.pretext });
      return run("converse", "bulk", buildConversePrompt(input));
    },

    reflect: (ctx: BrainContext): Promise<Reflection> => run("reflect", "mid", buildReflectPrompt(ctx)),

    confessional: (ctx: BrainContext, reflection: Reflection): Promise<Confessional> => run("confessional", "bulk", buildConfessionalPrompt(ctx, reflection)),

    businessDecision: (ctx: BrainContext, business: BusinessState, competitors: Record<string, number>): Promise<BusinessDecision> =>
      run("business", "mid", buildBusinessPrompt(ctx, business, competitors)),

    politics: (ctx: BrainContext, election: ElectionState, openPolicy: Policy | null, proposals: Record<string, string>): Promise<PoliticsDecision> =>
      run("politics", "mid", buildPoliticsPrompt(ctx, election, openPolicy, proposals)),

    speech: (ctx: BrainContext, platform: string): Promise<string> => run("speech", "mid", buildSpeechPrompt(ctx, platform)),

    vote: (ctx: BrainContext, candidates: Array<{ npcId: string; name: string; platform: string; speech: string }>): Promise<VoteDecision> => {
      if (!candidates.length) throw new BrainError("schema", "vote needs at least one candidate", { kind: "vote", model: opts.midModel, attempts: 0 });
      return run("vote", "mid", buildVotePrompt(ctx, candidates));
    },

    writePaper: (day: number, events: WorldEvent[], prices: Record<string, number>, journalist: BrainContext): Promise<Newspaper> =>
      run("paper", "mid", buildPaperPrompt(day, events, prices, journalist)),

    updateStorylines: (existing: Storyline[], recentEvents: WorldEvent[], day: number): Promise<Storyline[]> =>
      run("storylines", "mid", buildStorylinesPrompt(existing, recentEvents, day)),

    resolveArc: (ctx: BrainContext, question: string, options: Array<{ id: string; fact: string }>): Promise<ArcChoice> =>
      run("arc", "mid", buildArcPrompt(ctx, question, options)),

    // No embedding model is available on this account; the core uses lexical retrieval.
    embed: async (texts: string[]): Promise<number[][]> => texts.map(() => []),

    stats: () => {
      const s = client.getStats();
      return { calls: s.calls, costUsd: s.costUsd, failures: s.failures, bulkModel: opts.bulkModel, midModel: opts.midModel };
    },

    telemetry: () => ({ ...client.getStats(), last50: client.recent(50) }),
  };

  return brain;
}
