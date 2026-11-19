import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BrainError, OpenRouterClient, extractJson, toStrictJsonSchema } from "../src/brain/openrouter/client.js";
import { createOpenRouterBrain } from "../src/brain/openrouter/index.js";
import { buildPlanPrompt } from "../src/brain/openrouter/prompts/plan.js";
import { buildConversePrompt } from "../src/brain/openrouter/prompts/converse.js";
import { buildReactPrompt } from "../src/brain/openrouter/prompts/react.js";
import { buildStorylinesPrompt } from "../src/brain/openrouter/prompts/storylines.js";
import { needWord } from "../src/brain/openrouter/prompts/common.js";
import { devendraContext, existingStorylines, fakeEvents, miraContext } from "../src/brain/openrouter/fixtures.js";

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

function completion(content: string, cost = 0.001, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50, cost }, ...extra }), { status: 200, headers: { "content-type": "application/json" } });
}

function mockFetch(responses: Array<Response | (() => Response)>) {
  const calls: Array<{ url: string; body: any }> = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const next = responses.shift();
    if (!next) throw new Error("no more mock responses");
    return typeof next === "function" ? next() : next;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const noSleep = async () => {};
const quiet = () => {};

function client(fetchImpl: typeof fetch, opts: Partial<ConstructorParameters<typeof OpenRouterClient>[0]> = {}) {
  return new OpenRouterClient({ apiKey: "test", dailyBudgetUsd: 1, logPath: null, fetchImpl, sleep: noSleep, log: quiet, ...opts });
}

const Out = z.object({ greeting: z.string(), mood: z.enum(["happy", "tense"]) });

/* ------------------------------------------------------------------ */
/* prompts                                                              */
/* ------------------------------------------------------------------ */

describe("prompt rendering", () => {
  it("is deterministic and includes the persona's speaking style, marked as mandatory", () => {
    const a = buildPlanPrompt(miraContext());
    const b = buildPlanPrompt(miraContext());
    expect(a.system).toBe(b.system);
    expect(a.user).toBe(b.user);
    const mira = miraContext().self;
    expect(a.system).toContain(mira.speakingStyle);
    expect(a.system).toContain("speak ONLY in this style");
    expect(a.system).toContain(mira.secret);
    expect(a.system).toContain("known only to you");
    expect(a.system).toContain(mira.opinions[0]);
    expect(a.user).toContain("Places you can go");
    expect(a.user).toContain("bakery: Okafor's Bakery");
  });

  it("renders needs as plain words and money in crowns", () => {
    const ctx = miraContext({ needs: { food: 10, rest: 35 }, wallet: 118, debt: 4000 });
    const { user } = buildReactPrompt({ ...ctx, trigger: "The bank sent a second notice" });
    expect(user).toContain("starving");
    expect(user).toContain("very tired");
    expect(user).toContain("₡118 in pocket");
    expect(user).toContain("₡4,000 owed to the bank");
    expect(user).toContain("TRIGGER: The bank sent a second notice");
    expect(needWord("social", 90)).toBe("well connected");
  });

  it("converse renders both personas with their own speaking styles and constrains speakers to participant ids", () => {
    const input = { participants: [miraContext(), devendraContext()], locationName: "Fish Market", pretext: "Mira came to complain about fish prices" };
    const p = buildConversePrompt(input);
    expect(p.system).toContain(input.participants[0].self.speakingStyle);
    expect(p.system).toContain(input.participants[1].self.speakingStyle);
    expect(p.user).toContain("PRETEXT: Mira came to complain about fish prices");
    const js = toStrictJsonSchema(p.schema) as any;
    expect(js.properties.lines.items.properties.speaker.enum).toEqual(["mira_okafor", "devendra_rao"]);
    expect(js.required).toContain("outcomes");
    expect(js.additionalProperties).toBe(false);
  });

  it("converse map fills an outcome per participant and turns affinity pairs into a record", () => {
    const p = buildConversePrompt({ participants: [miraContext(), devendraContext()], locationName: "Fish Market", pretext: "x" });
    const out = p.map({
      lines: [
        { speaker: "mira_okafor", text: "a" }, { speaker: "devendra_rao", text: "b" }, { speaker: "mira_okafor", text: "c" }, { speaker: "devendra_rao", text: "d" },
      ],
      summary: "s",
      outcomes: [
        { npcId: "mira_okafor", memory: "m", importance: 4, mood: "tense", affinityDelta: [{ npcId: "devendra_rao", delta: -40 }], gossipLearned: null },
        { npcId: "devendra_rao", memory: "", importance: 3, mood: "content", affinityDelta: [], gossipLearned: "g" },
      ],
      drama: 4,
      eventType: "argument",
    });
    expect(out.outcomes).toHaveLength(2);
    expect(out.outcomes[0].affinityDelta).toEqual({ devendra_rao: -30 });
    expect(out.outcomes[1].affinityDelta).toEqual({ mira_okafor: 0 });
    expect(out.outcomes[1].memory).toContain("Mira Okafor");
    expect(out.outcomes[1].gossipLearned).toBe("g");
    expect(out.eventType).toBe("argument");
  });

  it("storylines map keeps ids stable, merges event ids and caps at 8", () => {
    const p = buildStorylinesPrompt(existingStorylines(), fakeEvents(), 3);
    const evs = fakeEvents();
    const w = {
      storylines: [
        { id: "The Bakery Loan", title: "The Bakery Loan", summary: "s", actors: ["Mira Okafor"], eventIds: [evs[0].id, "made_up"], status: "climax" as const, startedDay: 3, updatedDay: 3, heat: 9 },
        ...Array.from({ length: 9 }, (_, i) => ({ id: `new_${i}`, title: `New ${i}`, summary: "s", actors: [], eventIds: [], status: "brewing" as const, startedDay: 3, updatedDay: 3, heat: i })),
      ],
    };
    const out = p.map(w);
    expect(out.length).toBe(8);
    const loan = out.find((s) => s.id === "bakery_loan")!;
    expect(loan).toBeDefined();
    expect(loan.startedDay).toBe(1); // preserved from existing
    expect(loan.eventIds).toEqual(["evt_12", "evt_19", evs[0].id]);
    expect(loan.actors).toEqual(["mira_okafor"]);
    expect(out[0].heat).toBe(9);
  });
});

/* ------------------------------------------------------------------ */
/* client                                                               */
/* ------------------------------------------------------------------ */

describe("OpenRouterClient", () => {
  it("sends the expected headers, strict json_schema and provider sort", async () => {
    const { fn, calls } = mockFetch([completion(JSON.stringify({ greeting: "hi", mood: "happy" }))]);
    const c = client(fn);
    const res = await c.chat({ model: "m", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "plan", sortByPrice: true });
    expect(res.data).toEqual({ greeting: "hi", mood: "happy" });
    const init = (fn as any).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test");
    expect(headers["HTTP-Referer"]).toBe("https://npcworld.local");
    expect(headers["X-Title"]).toBe("NPC World");
    expect(calls[0].body.response_format.type).toBe("json_schema");
    expect(calls[0].body.response_format.json_schema.strict).toBe(true);
    expect(calls[0].body.provider).toEqual({ sort: "price" });
    expect(calls[0].body.reasoning).toEqual({ enabled: false });
  });

  it("retries once with the validation error appended when JSON is invalid, then succeeds", async () => {
    const { fn, calls } = mockFetch([
      completion("{ greeting: oops"),
      completion(JSON.stringify({ greeting: "fixed", mood: "tense" })),
    ]);
    const c = client(fn);
    const res = await c.chat({ model: "m", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "react" });
    expect(res.data.greeting).toBe("fixed");
    expect(res.attempts).toBe(2);
    expect(res.repaired).toBe(true);
    expect(calls).toHaveLength(2);
    const secondUser = calls[1].body.messages[1].content as string;
    expect(secondUser).toContain("Your previous answer was rejected");
    expect(secondUser).toContain("invalid JSON");
    expect(secondUser).toContain("{ greeting: oops");
  });

  it("retries once on a schema mismatch, then throws a typed BrainError on the second failure", async () => {
    const { fn, calls } = mockFetch([
      completion(JSON.stringify({ greeting: "hi", mood: "furious" })),
      completion(JSON.stringify({ greeting: "hi", mood: "still wrong" })),
    ]);
    const c = client(fn);
    const err = await c.chat({ model: "m", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "plan" }).catch((e) => e);
    expect(err).toBeInstanceOf(BrainError);
    expect(err.code).toBe("schema");
    expect(err.kind).toBe("plan");
    expect(err.attempts).toBe(2);
    expect(calls[1].body.messages[1].content).toContain("mood");
    expect(c.getStats().failures).toBe(1);
  });

  it("accumulates stats, byKind and the ring across calls", async () => {
    const { fn } = mockFetch([
      completion(JSON.stringify({ greeting: "a", mood: "happy" }), 0.002),
      completion(JSON.stringify({ greeting: "b", mood: "happy" }), 0.003),
      completion("nope"),
      completion("nope again"),
    ]);
    const c = client(fn);
    await c.chat({ model: "m", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "plan" });
    await c.chat({ model: "m", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "converse" });
    await c.chat({ model: "m", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "converse" }).catch(() => {});
    const s = c.getStats();
    expect(s.calls).toBe(3);
    expect(s.failures).toBe(1);
    expect(s.costUsd).toBeCloseTo(0.007, 6);
    expect(s.costTodayUsd).toBeCloseTo(0.007, 6);
    expect(s.byKind.plan.calls).toBe(1);
    expect(s.byKind.converse.calls).toBe(2);
    expect(s.byKind.converse.failures).toBe(1);
    expect(c.recent(10)).toHaveLength(3);
    expect(c.recent(10)[2].ok).toBe(false);
  });

  it("retries 429/5xx with backoff and then succeeds", async () => {
    const { fn, calls } = mockFetch([
      new Response("rate limited", { status: 429 }),
      new Response("boom", { status: 503 }),
      completion(JSON.stringify({ greeting: "ok", mood: "happy" })),
    ]);
    const c = client(fn);
    const res = await c.chat({ model: "m", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "plan" });
    expect(res.data.greeting).toBe("ok");
    expect(calls).toHaveLength(3);
    expect(res.attempts).toBe(1); // http retries are not repair passes
  });

  it("gives up after 2 http retries with a typed error", async () => {
    const { fn } = mockFetch([new Response("x", { status: 500 }), new Response("x", { status: 500 }), new Response("x", { status: 500 })]);
    const c = client(fn);
    const err = await c.chat({ model: "m", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "plan" }).catch((e) => e);
    expect(err).toBeInstanceOf(BrainError);
    expect(err.code).toBe("http");
    expect(err.status).toBe(500);
  });

  it("falls back to json_object when the provider rejects json_schema, and remembers it per model", async () => {
    const { fn, calls } = mockFetch([
      new Response(JSON.stringify({ error: { message: "Invalid schema for response_format" } }), { status: 400 }),
      completion(JSON.stringify({ greeting: "ok", mood: "happy" })),
      completion(JSON.stringify({ greeting: "ok2", mood: "happy" })),
    ]);
    const c = client(fn);
    await c.chat({ model: "m", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "plan" });
    await c.chat({ model: "m", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "plan" });
    expect(calls[0].body.response_format.type).toBe("json_schema");
    expect(calls[1].body.response_format.type).toBe("json_object");
    expect(calls[1].body.messages[0].content).toContain("JSON Schema");
    expect(calls[2].body.response_format.type).toBe("json_object");
  });

  it("switches to effort:low when a provider says reasoning cannot be disabled", async () => {
    const { fn, calls } = mockFetch([
      new Response(JSON.stringify({ error: { message: "Reasoning is mandatory for this endpoint and cannot be disabled.", code: 400 } }), { status: 400 }),
      completion(JSON.stringify({ greeting: "ok", mood: "happy" })),
    ]);
    const c = client(fn);
    const res = await c.chat({ model: "glm", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "plan" });
    expect(res.data.greeting).toBe("ok");
    expect(calls[0].body.reasoning).toEqual({ enabled: false });
    expect(calls[1].body.reasoning).toEqual({ effort: "low", exclude: true });
  });

  it("over the daily budget: bulk model still runs, mid model falls back to bulk, warns once", async () => {
    const logs: string[] = [];
    const { fn, calls } = mockFetch([
      completion(JSON.stringify({ greeting: "1", mood: "happy" }), 0.5),
      completion(JSON.stringify({ greeting: "2", mood: "happy" }), 0.5),
      completion(JSON.stringify({ greeting: "3", mood: "happy" }), 0.0),
      completion(JSON.stringify({ greeting: "4", mood: "happy" }), 0.0),
    ]);
    const c = client(fn, { dailyBudgetUsd: 0.75, budgetFallbackModel: "bulk", budgetExemptModels: ["bulk"], log: (m) => logs.push(m) });
    await c.chat({ model: "mid", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "reflect" });
    await c.chat({ model: "mid", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "reflect" });
    expect(c.getStats().costTodayUsd).toBeCloseTo(1.0, 6);
    await c.chat({ model: "mid", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "reflect" });
    await c.chat({ model: "bulk", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "plan" });
    expect(calls.map((x) => x.body.model)).toEqual(["mid", "mid", "bulk", "bulk"]);
    expect(logs.filter((l) => l.includes("daily budget"))).toHaveLength(1);
    expect(c.getStats().budgetExceeded).toBe(true);
    expect(c.recent(1)[0].requestedModel).toBe("bulk");
    expect(c.recent(2)[0].requestedModel).toBe("mid");
    expect(c.recent(2)[0].model).toBe("bulk");
  });

  it("limits concurrency to 8", async () => {
    let active = 0, peak = 0;
    const fn = vi.fn(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return completion(JSON.stringify({ greeting: "x", mood: "happy" }));
    }) as unknown as typeof fetch;
    const c = client(fn);
    await Promise.all(Array.from({ length: 20 }, () => c.chat({ model: "m", system: "s", user: "u", schema: Out, temperature: 0.5, maxTokens: 100, kind: "plan" })));
    expect(peak).toBeLessThanOrEqual(8);
    expect(c.getStats().calls).toBe(20);
  });

  it("extractJson strips code fences and trailing prose", () => {
    expect(extractJson('Sure! ```json\n{"a":1}\n``` hope that helps')).toBe('{"a":1}');
    expect(extractJson('{"a":1} trailing')).toBe('{"a":1}');
  });

  it("toStrictJsonSchema makes every property required and forbids extras", () => {
    const js = toStrictJsonSchema(z.object({ a: z.string(), b: z.number().nullable(), c: z.array(z.object({ d: z.enum(["x", "y"]) })) })) as any;
    expect(js.required).toEqual(["a", "b", "c"]);
    expect(js.additionalProperties).toBe(false);
    expect(js.properties.c.items.required).toEqual(["d"]);
    expect(js.properties.c.items.additionalProperties).toBe(false);
    expect(js.$schema).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* brain                                                                */
/* ------------------------------------------------------------------ */

describe("createOpenRouterBrain", () => {
  it("routes plan to the bulk model and reflect to the mid model, maps wire shapes, and reports stats", async () => {
    const { fn, calls } = mockFetch([
      completion(JSON.stringify({
        steps: [
          { startHour: 8, endHour: 6, action: "work", location: "bakery", intent: "bake", with: ["Teodor Ilic"] },
          { startHour: 6, endHour: 8, action: "eat", location: "cafe", intent: "eat", with: [] },
          { startHour: 8, endHour: 24, action: "sleep", location: "home_okafor", intent: "sleep", with: [] },
        ],
        morningThought: "t", mood: "tense",
      }), 0.0001),
      completion(JSON.stringify({ summary: "s", insights: ["i"], mayorOpinionDelta: -12.6, happiness: 40.4, goalsUpdate: "g", mood: "sad", storylineTags: ["The Loan"] }), 0.001),
    ]);
    const brain = createOpenRouterBrain({ apiKey: "k", bulkModel: "bulk-m", midModel: "mid-m", dailyBudgetUsd: 3, client: { fetchImpl: fn, logPath: null, sleep: noSleep, log: quiet } });
    const plan = await brain.plan(miraContext());
    expect(calls[0].body.model).toBe("bulk-m");
    expect(calls[0].body.temperature).toBe(0.7);
    expect(plan.steps.map((s) => s.startHour)).toEqual([6, 8, 8]); // sorted
    expect(plan.steps[1].endHour).toBe(9); // end clamped after start
    expect(plan.steps[1].with).toEqual(["teodor_ilic"]);
    expect(plan.steps[0].with).toBeUndefined();
    const refl = await brain.reflect(miraContext());
    expect(calls[1].body.model).toBe("mid-m");
    expect(refl.mayorOpinionDelta).toBe(-13);
    expect(refl.happiness).toBe(40);
    expect(refl.storylineTags).toEqual(["the loan"]);
    const s = brain.stats();
    expect(s).toEqual({ calls: 2, costUsd: expect.closeTo(0.0011, 6), failures: 0, bulkModel: "bulk-m", midModel: "mid-m" });
    expect(brain.telemetry().byKind.plan.calls).toBe(1);
    expect(await brain.embed(["a", "b"])).toEqual([[], []]);
  });

  it("rejects a plan whose location is not a known place id, then accepts the repaired one", async () => {
    const good = { steps: [{ startHour: 6, endHour: 12, action: "work", location: "bakery", intent: "x", with: [] }, { startHour: 12, endHour: 13, action: "eat", location: "cafe", intent: "x", with: [] }, { startHour: 13, endHour: 24, action: "sleep", location: "home_okafor", intent: "x", with: [] }], morningThought: "t", mood: "content" };
    const bad = { ...good, steps: [{ ...good.steps[0], location: "the_moon" }, ...good.steps.slice(1)] };
    const { fn, calls } = mockFetch([completion(JSON.stringify(bad)), completion(JSON.stringify(good))]);
    const brain = createOpenRouterBrain({ apiKey: "k", bulkModel: "b", midModel: "m", dailyBudgetUsd: 3, client: { fetchImpl: fn, logPath: null, sleep: noSleep, log: quiet } });
    const plan = await brain.plan(miraContext());
    expect(plan.steps[0].location).toBe("bakery");
    expect(calls).toHaveLength(2);
    expect(calls[1].body.messages[1].content).toContain("steps.0.location");
  });

  it("writePaper fixes the masthead and drops story sources that were not supplied", async () => {
    const evs = fakeEvents();
    const { fn } = mockFetch([completion(JSON.stringify({ headline: "H", stories: [{ headline: "h", body: "b", sourceEventIds: [evs[0].id] }, { headline: "h2", body: "b2", sourceEventIds: [evs[1].id] }], pricesColumn: "p", gossipCorner: "g", editorial: null }))]);
    const brain = createOpenRouterBrain({ apiKey: "k", bulkModel: "b", midModel: "m", dailyBudgetUsd: 3, client: { fetchImpl: fn, logPath: null, sleep: noSleep, log: quiet } });
    const paper = await brain.writePaper(3, evs, { bread: 4 }, miraContext());
    expect(paper.masthead).toBe("The Solmere Herald");
    expect(paper.day).toBe(3);
    expect(paper.editorial).toBeUndefined();
    expect(paper.stories[0].sourceEventIds).toEqual([evs[0].id]);
  });
});
