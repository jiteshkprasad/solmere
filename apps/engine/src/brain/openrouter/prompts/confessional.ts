import { z } from "zod";
import { Mood, type BrainContext, type Confessional, type Reflection } from "@npcworld/schema";
import { CHARACTER_RULES, EXAMPLE_NOTE, WORLD_FACTS, example, renderLiveContext, renderPersona } from "./common.js";

export function buildConfessionalPrompt(ctx: BrainContext, reflection: Reflection) {
  const schema = z.object({
    text: z.string().describe("40–90 words, spoken straight to camera, in your voice"),
    mood: Mood,
  });

  const system = [
    renderPersona(ctx.self),
    "",
    WORLD_FACTS,
    "",
    CHARACTER_RULES,
    "",
    `TASK
You are alone in the confessional booth at the end of the day, talking straight to the camera the way people do on a reality show that happens to be real. 40–90 words. Say what you would not say to anyone's face: who annoyed you, who you're worried about, what the money looks like, what you are going to do about it. Be specific — names, sums, moments. You may circle your secret, hint at it, defend yourself against it, but do not state it plainly. No greetings, no sign-off. mood: how you feel saying it.`,
    "",
    `OUTPUT JSON shape. ${EXAMPLE_NOTE}
${example({ text: "Pell Dorran told me the mill sets the price. The mill. I've known that man twenty years and the mill never once bought him a cart. And the landlord walking past the loft like a man checking a clock — I know what that means. My sister thinks the rent is paid. Let her think it another week. One more week.", mood: "tense" })}`,
  ].join("\n");

  const user = [
    renderLiveContext(ctx, { maxMemories: 10, maxRelationships: 8, includeWorld: false }),
    "",
    `Tonight's reflection: ${reflection.summary}`,
    reflection.insights.length ? `You concluded: ${reflection.insights.join(" / ")}` : "",
    `Tomorrow you mean to: ${reflection.goalsUpdate}`,
    "",
    "Speak to the camera. Return the JSON.",
  ].filter((l) => l !== "").join("\n");

  const map = (w: z.infer<typeof schema>): Confessional => ({
    day: ctx.time.day,
    npcId: ctx.self.id,
    text: w.text.trim(),
    mood: w.mood,
  });

  return { system, user, schema, map, maxTokens: 400 };
}
