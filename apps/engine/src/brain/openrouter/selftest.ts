/**
 * Live self-test: `pnpm brain:test` (from apps/engine).
 * Exercises every Brain method once against OpenRouter with realistic fixtures
 * and prints the results plus cost. Target: < ~90 s, < $0.02.
 */
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenRouterBrain } from "./index.js";
import { bakeryBusiness, basePrices, candidatesFixture, devendraContext, electionFixture, existingStorylines, fakeEvents, miraContext, buildContext } from "./fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("OPENROUTER_API_KEY missing (apps/engine/.env)"); process.exit(1); }

const brain = createOpenRouterBrain({
  apiKey,
  bulkModel: process.env.BULK_MODEL ?? "deepseek/deepseek-v4-flash-0731",
  midModel: process.env.MID_MODEL ?? "openai/gpt-5.6-luna",
  dailyBudgetUsd: Number(process.env.DAILY_BUDGET_USD ?? 3),
});

const t0 = Date.now();
const section = (title: string) => console.log(`\n${"=".repeat(8)} ${title} ${"=".repeat(Math.max(0, 60 - title.length))}`);
const show = (v: unknown) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  const s = Date.now();
  try {
    const r = await fn();
    section(`${label} (${((Date.now() - s) / 1000).toFixed(1)} s)`);
    show(r);
    return r;
  } catch (e) {
    section(`${label} FAILED (${((Date.now() - s) / 1000).toFixed(1)} s)`);
    console.error((e as Error).message);
    return undefined;
  }
}

const mira = miraContext();
const devendra = devendraContext();

// Group 1 — independent calls in parallel (client caps concurrency at 8).
const [plan, reaction, convo, reflection, business, vote, paper, storylines] = await Promise.all([
  timed("plan (mira, bulk)", () => brain.plan(mira)),
  timed("react (mira, bulk) — trigger: bank second notice", () => brain.react(miraContext({ hour: 11, trigger: "The bank sent a second notice: pay ₡400 by Friday or the loan is called in.", activity: "kneading the afternoon batch" }))),
  timed("converse (mira × devendra at the fish market, bulk)", () =>
    brain.converse({
      participants: [
        miraContext({ hour: 9, locationId: "fish_market", present: ["Devendra Rao", "Bakary Diallo"] }),
        devendraContext({ hour: 9, present: ["Mira Okafor", "Bakary Diallo"] }),
      ],
      locationName: "Fish Market",
      pretext: "Mira came to complain about fish prices",
    }),
  ),
  timed("reflect (mira, mid)", () => brain.reflect(miraContext({ hour: 21, memories: [
    "Day 3, 09:00 — Argued with Devendra Rao at the fish market; got fish at ₡5 but told him I'd tell Chen he bends.",
    "Day 3, 11:00 — The bank sent a second notice: ₡400 by Friday or the loan is called in.",
    "Day 3, 15:00 — Sold out of pastry by three. Bread went slow; Rosa's toast again.",
    "Day 3, 19:00 — Tunde came home with 13 a crate from Devendra and said 'it's what everyone gets'.",
    ...miraContext().memories,
  ] }))),
  timed("businessDecision (bakery, mid)", () => brain.businessDecision(miraContext({ hour: 20 }), bakeryBusiness(), { "cafe toast": 3, "general_store bread": 4.5 })),
  timed("vote (mira, mid)", () => brain.vote(miraContext({ hour: 10, locationId: "town_hall" }), candidatesFixture)),
  timed("writePaper (priya, mid)", () => brain.writePaper(3, fakeEvents(), basePrices, buildContext("priya_nair", { hour: 20, locationId: "cafe", memories: ["Day 3, 13:00 — Sal Romano says Devendra's speech was 'a haircut with no scissors'."] }))),
  timed("updateStorylines (mid)", () => brain.updateStorylines(existingStorylines(), fakeEvents(), 3)),
]);

// Group 2 — depends on the reflection.
if (reflection) {
  await timed("confessional (mira, bulk)", () => brain.confessional(miraContext({ hour: 22 }), reflection));
}

// Optional extras (politics + speech) — cheap, useful to eyeball.
await Promise.all([
  timed("politics (devendra, mid)", () => brain.politics(devendra, electionFixture(), null, { rent_cap: "Cap weekly rents at 80% of current", harbour_tender: "Put the harbour concession out to tender" })),
  timed("speech (devendra, mid)", () => brain.speech(devendraContext({ hour: 18, locationId: "town_square" }), candidatesFixture[1].platform)),
]);

section("TELEMETRY");
const t = brain.telemetry();
const rows = Object.entries(t.byKind).map(([kind, k]) => ({ kind, calls: k.calls, failures: k.failures, costUsd: +k.costUsd.toFixed(5), avgLatencyMs: Math.round(k.latencyMsTotal / Math.max(1, k.calls)), inTok: k.promptTokens, outTok: k.completionTokens }));
console.table(rows);
console.log(`total: ${t.calls} calls, ${t.failures} failures, $${t.costUsd.toFixed(5)}; wall ${((Date.now() - t0) / 1000).toFixed(1)} s`);
void plan; void reaction; void convo; void business; void vote; void paper; void storylines;
