import { z } from "zod";
import { Mood, type BrainContext, type DayPlan } from "@npcworld/schema";
import { ACTIONS, CHARACTER_RULES, EXAMPLE_NOTE, WORLD_FACTS, example, normalizeSteps, placeIds, planStepWire, renderLiveContext, renderPersona } from "./common.js";

export function buildPlanPrompt(ctx: BrainContext) {
  const ids = placeIds(ctx);
  const schema = z.object({
    steps: z.array(planStepWire(ids)).min(3).max(12),
    morningThought: z.string().describe("one inner line, under 30 words"),
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
It is wake-up time. Plan your day from now until you sleep, as a list of 3–12 steps that cover the hours in order without gaps. Each step has a startHour and endHour (24h integers), an action, a location id from the list you are given, a short first-person intent, and the ids of anyone you hope to meet there.
- action must be one of: ${ACTIONS.join(", ")}.
- location must be one of the place ids provided (the part before the colon). Never invent places.
- Work when you have work; eat when you are hungry; go where the people you need are. Money and debts shape the day: a broke person does not lunch at the inn.
- Follow the "Today:" note in your context. If it gives you a story beat, let one or two steps serve it (a visit, a talk, a favour, a confrontation). If it is an ordinary day, your want, fear and secret stay in the background: most steps are work, meals, errands, small pleasures and the people you like, and at least one step involves the small thing on your mind.
- Vary your day from yesterday's: a different lunch spot, a different friend, a different evening.
- The last step should end at your usual bedtime.
- npc ids are lowercase firstname_lastname, e.g. devendra_rao.
- morningThought: one inner line in your voice, under 30 words.`,
    "",
    `OUTPUT JSON shape. ${EXAMPLE_NOTE}
${example({ steps: [{ startHour: 7, endHour: 12, action: "work", location: "net_loft", intent: "Mend the Dorran nets before the tide turns", with: ["pell_dorran"] }, { startHour: 12, endHour: 13, action: "eat", location: "chandlery", intent: "Bread and whatever Pell has going cheap", with: [] }, { startHour: 13, endHour: 17, action: "work", location: "net_loft", intent: "Finish the trawl net, collect the twelve crowns owed", with: [] }, { startHour: 17, endHour: 18, action: "talk", location: "quay", intent: "Ask Pell why twine went up again", with: ["pell_dorran"] }, { startHour: 18, endHour: 21, action: "leisure", location: "home_ryn", intent: "Feet up, do not think about the rent", with: [] }, { startHour: 21, endHour: 24, action: "sleep", location: "home_ryn", intent: "Sleep if the wind lets me", with: [] }], morningThought: "Twelve crowns owed, forty due Friday. Mend fast, talk little.", mood: "tense" })}`,
  ].join("\n");

  const user = [
    renderLiveContext(ctx, { includePlaces: true, maxMemories: 15 }),
    "",
    `Plan your day from ${ctx.time.hour}:00. Return the JSON.`,
  ].join("\n");

  const map = (w: z.infer<typeof schema>): DayPlan => ({
    steps: normalizeSteps(w.steps),
    morningThought: w.morningThought.trim(),
    mood: w.mood,
  });

  return { system, user, schema, map, maxTokens: 1200 };
}
