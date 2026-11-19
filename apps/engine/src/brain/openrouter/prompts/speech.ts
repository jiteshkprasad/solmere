import { z } from "zod";
import type { BrainContext } from "@npcworld/schema";
import { CHARACTER_RULES, EXAMPLE_NOTE, WORLD_FACTS, example, renderLiveContext, renderPersona } from "./common.js";

export function buildSpeechPrompt(ctx: BrainContext, platform: string) {
  const schema = z.object({
    speech: z.string().describe("120–220 words, spoken aloud in the town square, in your voice"),
  });

  const system = [
    renderPersona(ctx.self),
    "",
    WORLD_FACTS,
    "",
    CHARACTER_RULES,
    "",
    `TASK
You are standing on the steps of Town Hall giving your election speech to the whole town. 120–220 words, spoken aloud, in your own voice — not a politician's. Name real problems people in the square have (rent, wages, fish prices, the clinic, the harbour) and say what you would do. Take a swipe at the current mayor or your rival if that is who you are. Promise things you might actually keep. One memorable line the Herald could quote. No stage directions, no title, just the words.`,
    "",
    `OUTPUT JSON shape. ${EXAMPLE_NOTE}
${example({ speech: "Neighbours. You know me; I've mended your nets for thirty years and never once asked for your vote... (120–220 words in YOUR voice)" })}`,
  ].join("\n");

  const user = [
    renderLiveContext(ctx, { maxMemories: 10, maxRelationships: 10 }),
    "",
    `Your declared platform: ${platform}`,
    "",
    "Give the speech. Return the JSON.",
  ].join("\n");

  const map = (w: z.infer<typeof schema>): string => w.speech.trim();

  return { system, user, schema, map, maxTokens: 700 };
}
