import { z } from "zod";
import type { BrainContext, VoteDecision } from "@npcworld/schema";
import { CHARACTER_RULES, EXAMPLE_NOTE, WORLD_FACTS, enumOf, example, renderLiveContext, renderPersona } from "./common.js";

export type Candidate = { npcId: string; name: string; platform: string; speech: string };

export function buildVotePrompt(ctx: BrainContext, candidates: Candidate[]) {
  const ids = candidates.map((c) => c.npcId);
  const schema = z.object({
    candidate: enumOf(ids, "abstain"),
    reasoning: z.string().describe("1–2 sentences in your voice"),
  });

  const system = [
    renderPersona(ctx.self),
    "",
    WORLD_FACTS,
    "",
    CHARACTER_RULES,
    "",
    `TASK
Election day. Pick one candidate by id. Vote the way this person actually would: what each candidate has done to you or for you, what their platform means for your rent, wages and prices, who your friends and enemies back, and your own opinions. You may vote for yourself if you are running. reasoning: 1–2 sentences in your voice, naming the reason that decided it.`,
    "",
    `OUTPUT JSON shape. ${EXAMPLE_NOTE}
${example({ candidate: "pell_dorran", reasoning: "The old mayor means well and listens to the landlord. Pell is a showman, but he pays his boys on Fridays and he'd fight the bank. I can't believe I'm doing this." })}`,
  ].join("\n");

  const user = [
    renderLiveContext(ctx, { maxMemories: 10, maxRelationships: 12 }),
    "",
    "CANDIDATES:",
    ...candidates.map((c) => `- ${c.npcId} — ${c.name}. Platform: ${c.platform}${c.speech ? `\n  Speech: "${c.speech.slice(0, 600)}"` : ""}`),
    "",
    "Cast your vote. Return the JSON.",
  ].join("\n");

  const map = (w: z.infer<typeof schema>): VoteDecision => ({
    candidate: ids.includes(w.candidate) ? w.candidate : ids[0] ?? w.candidate,
    reasoning: w.reasoning.trim(),
  });

  return { system, user, schema, map, maxTokens: 600 };
}
