/**
 * Bulk-model bake-off: `pnpm bakeoff` (from apps/engine).
 * Runs converse() for the same 3 fixture pairs on several candidate bulk models
 * and prints the dialogue side by side with cost and latency, so a human can
 * judge voice quality. Override candidates: BAKEOFF_MODELS="a,b,c".
 */
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConverseInput, ConverseOutput } from "@npcworld/schema";
import { createOpenRouterBrain } from "./index.js";
import { buildContext, devendraContext, miraContext } from "./fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("OPENROUTER_API_KEY missing (apps/engine/.env)"); process.exit(1); }

const CANDIDATES = (process.env.BAKEOFF_MODELS ?? "deepseek/deepseek-v4-flash-0731,z-ai/glm-5.3-flash,xiaomi/mimo-v2.5").split(",").map((s) => s.trim()).filter(Boolean);

const pairs: Array<{ label: string; input: ConverseInput }> = [
  {
    label: "Mira × Devendra — fish prices at the market",
    input: {
      participants: [miraContext({ hour: 9, locationId: "fish_market", present: ["Devendra Rao"] }), devendraContext({ hour: 9, present: ["Mira Okafor"] })],
      locationName: "Fish Market",
      pretext: "Mira came to complain about fish prices",
    },
  },
  {
    label: "Chen × Tunde — on the docks after landing",
    input: {
      participants: [
        buildContext("chen_wei", { hour: 13, locationId: "docks", present: ["Tunde Okafor", "Leo Petrov"], wallet: 320, mood: "tense", memories: [
          "Day 2, 07:00 — Devendra paid me 15 a crate. He told me Tunde got 13. Wrote it down: page 41.",
          "Day 2, 14:00 — Leo said he saw a weighted crate on the market scales.",
          "Day 1, 19:00 — Tunde said 'Devendra looks after us' at the Anchor. He does not.",
        ] }),
        buildContext("tunde_okafor", { hour: 13, locationId: "docks", present: ["Chen Wei", "Leo Petrov"], wallet: 95, mood: "neutral", memories: [
          "Day 2, 07:00 — Devendra paid 13 a crate and said Chen got 12. Fair enough.",
          "Day 2, 20:00 — Mira went quiet when I asked about the loan. She said it's fine.",
          "Day 1, 12:00 — Zara wants to leave Solmere. Mira took it badly.",
        ] }),
      ],
      locationName: "Docks",
      pretext: "Chen asked Tunde, flatly, what Devendra paid him this morning",
    },
  },
  {
    label: "Priya × Ben — flat above the café, evening",
    input: {
      participants: [
        buildContext("priya_nair", { hour: 21, locationId: "flat_cafe", present: ["Ben Carter"], wallet: 210, mood: "tense", memories: [
          "Day 2, 16:00 — Bjorn Halvorsen, three beers in, said Marcus Vale lent the council 2,000 crowns last spring. Off the record, he said. Everything Bjorn says is off the record.",
          "Day 3, 10:00 — Idris Bello proposed a tender for the harbour concession. That's a story if anyone reads to paragraph three.",
          "Day 1, 22:00 — Ben said he'd 'hate to be the constable whose girlfriend brought down the council'. He laughed. I didn't.",
        ] }),
        buildContext("ben_carter", { hour: 21, locationId: "flat_cafe", present: ["Priya Nair"], wallet: 260, mood: "content", memories: [
          "Day 3, 15:00 — Marcus Vale asked me, friendly, whether Priya was 'working on anything about the council'.",
          "Day 2, 09:00 — Jay Whitlock missed rent again; Marcus wants me to 'have a word'.",
          "Day 1, 22:00 — Told Priya the council joke. She didn't laugh. She's sitting on something.",
        ] }),
      ],
      locationName: "Flat above Café",
      pretext: "Ben mentioned, too casually, that Marcus asked what Priya is working on",
    },
  },
];

interface Row { model: string; label: string; ok: boolean; latencyMs: number; costUsd: number; out?: ConverseOutput; error?: string }

const rows: Row[] = [];
for (const model of CANDIDATES) {
  const brain = createOpenRouterBrain({ apiKey, bulkModel: model, midModel: model, dailyBudgetUsd: 5, client: { logPath: null } });
  for (const pair of pairs) {
    const t0 = Date.now();
    try {
      const out = await brain.converse(pair.input);
      const rec = brain.telemetry().last50.at(-1);
      rows.push({ model, label: pair.label, ok: true, latencyMs: Date.now() - t0, costUsd: rec?.costUsd ?? 0, out });
    } catch (e) {
      rows.push({ model, label: pair.label, ok: false, latencyMs: Date.now() - t0, costUsd: 0, error: (e as Error).message });
    }
  }
}

for (const pair of pairs) {
  console.log(`\n${"#".repeat(90)}\n# ${pair.label}\n# pretext: ${pair.input.pretext}\n${"#".repeat(90)}`);
  for (const model of CANDIDATES) {
    const r = rows.find((x) => x.model === model && x.label === pair.label)!;
    console.log(`\n--- ${model}  (${(r.latencyMs / 1000).toFixed(1)} s, $${r.costUsd.toFixed(5)}) ---`);
    if (!r.ok || !r.out) { console.log(`FAILED: ${r.error}`); continue; }
    for (const l of r.out.lines) console.log(`  ${l.speaker.padEnd(16)} ${l.text}`);
    console.log(`  → ${r.out.summary}`);
    console.log(`  → drama ${r.out.drama}, ${r.out.eventType ?? "no event"}; ` + r.out.outcomes.map((o) => `${o.npcId}: ${o.mood}, ${Object.entries(o.affinityDelta).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join(" ")}`).join(" | "));
  }
}

console.log(`\n${"=".repeat(90)}\nSUMMARY`);
console.table(CANDIDATES.map((model) => {
  const mine = rows.filter((r) => r.model === model);
  const ok = mine.filter((r) => r.ok);
  return {
    model,
    ok: `${ok.length}/${mine.length}`,
    avgLatencyS: +(ok.reduce((a, r) => a + r.latencyMs, 0) / Math.max(1, ok.length) / 1000).toFixed(1),
    totalCostUsd: +mine.reduce((a, r) => a + r.costUsd, 0).toFixed(5),
    avgLines: +(ok.reduce((a, r) => a + (r.out?.lines.length ?? 0), 0) / Math.max(1, ok.length)).toFixed(1),
    avgWordsPerLine: +(ok.reduce((a, r) => a + (r.out ? r.out.lines.reduce((x, l) => x + l.text.split(/\s+/).length, 0) / r.out.lines.length : 0), 0) / Math.max(1, ok.length)).toFixed(1),
  };
}));
