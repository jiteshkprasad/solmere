import { z } from "zod";
import { Mood, type BrainContext, type Reflection } from "@npcworld/schema";
import { CHARACTER_RULES, EXAMPLE_NOTE, WORLD_FACTS, clamp, example, renderLiveContext, renderPersona } from "./common.js";

export function buildReflectPrompt(ctx: BrainContext) {
  const schema = z.object({
    summary: z.string().describe("the day in 2–3 first-person sentences; this becomes a long-term memory"),
    insights: z.array(z.string()).max(3).describe("up to 3 conclusions about people, money or yourself"),
    mayorOpinionDelta: z.number().min(-30).max(30),
    happiness: z.number().min(0).max(100),
    goalsUpdate: z.string().describe("what you will do differently tomorrow, one or two sentences"),
    mood: Mood,
    storylineTags: z.array(z.string()).max(3).describe("2–4 word tags for the threads you are caught in, in your own words"),
  });

  const system = [
    renderPersona(ctx.self),
    "",
    WORLD_FACTS,
    "",
    CHARACTER_RULES,
    "",
    `TASK
It is bedtime. Reflect honestly on the day, in your own voice. Weigh what actually happened (your memories) against what you want and fear. Update how you feel about the mayor (mayorOpinionDelta, -30..30: most days ±0–5; a policy that hit your wallet or a public snub can be ±10–25). Set your happiness 0..100 for today (your money, your people, your work). Name up to three insights — about specific people, sums, or yourself. goalsUpdate: what you will do differently tomorrow. storylineTags: the threads you are tangled in, in your words ("the bakery loan", "Chen's price logs").`,
    "",
    `OUTPUT JSON shape. ${EXAMPLE_NOTE}
${example({ summary: "Mended two nets, which never happens, and still came home short because twine went up again. Pell walked past the loft twice. My sister asked nothing, which is worse than asking.", insights: ["Pell bends on price when he thinks you'll talk — remember that.", "The landlord won't wait a third week; the walk-bys are a warning.", "I can't keep the rent letter from my sister past Sunday."], mayorOpinionDelta: -4, happiness: 38, goalsUpdate: "Tomorrow: collect the twelve crowns first thing, and ask Pell if he'll take nets in part payment.", mood: "tense", storylineTags: ["the loft rent", "twine prices", "telling my sister"] })}`,
  ].join("\n");

  const user = [
    renderLiveContext(ctx, { maxMemories: 20, maxRelationships: 12 }),
    "",
    "Reflect on the day. Return the JSON.",
  ].join("\n");

  const map = (w: z.infer<typeof schema>): Reflection => ({
    summary: w.summary.trim(),
    insights: w.insights.slice(0, 3).map((s) => s.trim()).filter(Boolean),
    mayorOpinionDelta: clamp(Math.round(w.mayorOpinionDelta), -30, 30),
    happiness: clamp(Math.round(w.happiness), 0, 100),
    goalsUpdate: w.goalsUpdate.trim(),
    mood: w.mood,
    storylineTags: w.storylineTags.slice(0, 3).map((s) => s.trim().toLowerCase()).filter(Boolean),
  });

  return { system, user, schema, map, maxTokens: 1200 };
}
