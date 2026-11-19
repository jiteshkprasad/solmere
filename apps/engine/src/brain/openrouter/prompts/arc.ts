import { z } from "zod";
import type { ArcChoice, BrainContext } from "@npcworld/schema";
import { CHARACTER_RULES, WORLD_FACTS, enumOf, renderLiveContext, renderPersona } from "./common.js";

/** The decider in a story arc chooses one of the authored outcomes, in character. */
export function buildArcPrompt(ctx: BrainContext, question: string, options: Array<{ id: string; fact: string }>) {
  const schema = z.object({
    optionId: enumOf(options.map((o) => o.id), options[0]?.id ?? "none"),
    reason: z.string().describe("one first-person sentence, in your voice, why you chose it; under 30 words"),
  });
  const system = [
    renderPersona(ctx.self),
    "",
    WORLD_FACTS,
    "",
    CHARACTER_RULES,
    "",
    `TASK
A decision is yours today. Choose what YOU would really do, given your traits, want, fear, secret, money, the people involved and what you remember. Do not pick the kindest or the most dramatic option by default; pick the one this person would pick.
OPTIONS (id: what happens)
${options.map((o) => `- ${o.id}: ${o.fact}`).join("\n")}

OUTPUT JSON: {"optionId": "<one id>", "reason": "<one sentence>"}`,
  ].join("\n");
  const user = [renderLiveContext(ctx, { maxMemories: 15, maxRelationships: 12 }), "", `The question: ${question}`, "Choose. Return the JSON."].join("\n");
  const map = (w: z.infer<typeof schema>): ArcChoice => ({ optionId: w.optionId, reason: w.reason.trim() });
  return { system, user, schema, map, maxTokens: 900 };
}
