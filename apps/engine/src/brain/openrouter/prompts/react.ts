import { z } from "zod";
import { ActionKind, Mood, type BrainContext, type Reaction } from "@npcworld/schema";
import { ACTIONS, CHARACTER_RULES, EXAMPLE_NOTE, WORLD_FACTS, example, normalizeSteps, placeIds, planStepWire, renderLiveContext, renderPersona } from "./common.js";

export function buildReactPrompt(ctx: BrainContext) {
  const ids = placeIds(ctx);
  const schema = z.object({
    decision: z.enum(["continue", "replan", "interrupt"]),
    thought: z.string().describe("inner line, under 30 words"),
    mood: Mood,
    newSteps: z.array(planStepWire(ids)).max(8).describe("replacement plan from the current hour; empty unless decision is replan"),
    immediate: z
      .object({
        action: ActionKind,
        location: z.enum(ids).nullable(),
        target: z.string().nullable().describe("npc id, e.g. chen_wei"),
      })
      .nullable()
      .describe("one-off action right now; only for interrupt"),
  });

  const system = [
    renderPersona(ctx.self),
    "",
    WORLD_FACTS,
    "",
    CHARACTER_RULES,
    "",
    `TASK
Something just happened (the trigger). Decide, in character, what you do next:
- "continue": keep your current plan. newSteps empty, immediate null.
- "replan": replace the rest of today's plan from the current hour with newSteps (2–8 steps, same format as a day plan: integer hours, action from ${ACTIONS.join("/")}, location from the place ids given, short intent, npc ids you hope to meet).
- "interrupt": do one thing right now (immediate: action + optional location id + optional npc id target, e.g. go talk to someone, walk somewhere, eat), then resume the plan. newSteps empty.
Most triggers deserve "continue" with an honest thought; save replans for things that change your day (money, work, a person you must see). Let your traits, secret and money situation decide. thought: under 30 words, in your voice.`,
    "",
    `OUTPUT JSON shape (three examples). ${EXAMPLE_NOTE}
${example({ decision: "continue", thought: "Twine's up two crowns. Fine. I'll mend tighter and say nothing.", mood: "tense", newSteps: [], immediate: null })}
${example({ decision: "interrupt", thought: "Pell Dorran at my door before noon? He wants his twelve crowns. Face him now, not later.", mood: "afraid", newSteps: [], immediate: { action: "talk", location: "net_loft", target: "pell_dorran" } })}
${example({ decision: "replan", thought: "Boat's in early with a torn trawl. That's the afternoon gone and forty crowns found.", mood: "content", newSteps: [{ startHour: 14, endHour: 18, action: "work", location: "quay", intent: "Patch the trawl on the quay, cash in hand", with: ["pell_dorran"] }, { startHour: 18, endHour: 21, action: "leisure", location: "home_ryn", intent: "Count the forty twice, then rest", with: [] }, { startHour: 21, endHour: 24, action: "sleep", location: "home_ryn", intent: "Early night", with: [] }], immediate: null })}`,
  ].join("\n");

  const user = [
    renderLiveContext(ctx, { includePlaces: true, includePlan: true, maxMemories: 10, maxRelationships: 10 }),
    "",
    `TRIGGER: ${ctx.trigger ?? "A quiet moment; nothing in particular happened."}`,
    "",
    "What do you do? Return the JSON.",
  ].join("\n");

  const map = (w: z.infer<typeof schema>): Reaction => {
    const out: Reaction = { decision: w.decision, thought: w.thought.trim(), mood: w.mood };
    if (w.decision === "replan" && w.newSteps.length) out.newSteps = normalizeSteps(w.newSteps);
    else if (w.decision === "replan") out.decision = "continue"; // replan without steps is a no-op
    if (w.decision === "interrupt" && w.immediate) {
      out.immediate = { action: w.immediate.action };
      if (w.immediate.location) out.immediate.location = w.immediate.location;
      if (w.immediate.target) out.immediate.target = w.immediate.target.trim().toLowerCase().replace(/\s+/g, "_");
    } else if (w.decision === "interrupt") out.decision = "continue";
    return out;
  };

  return { system, user, schema, map, maxTokens: 900 };
}
