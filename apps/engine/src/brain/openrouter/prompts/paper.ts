import { z } from "zod";
import type { BrainContext, Newspaper, WorldEvent } from "@npcworld/schema";
import { CHARACTER_RULES, EXAMPLE_NOTE, WORLD_FACTS, example, pad2, renderPersona, renderPrices } from "./common.js";

export const MASTHEAD = "The Solmere Herald";
const MAX_EVENTS = 60;

export function buildPaperPrompt(day: number, events: WorldEvent[], prices: Record<string, number>, journalist: BrainContext) {
  // most dramatic + most important first, cap the prompt
  const ranked = [...events].sort((a, b) => b.drama + b.importance - (a.drama + a.importance)).slice(0, MAX_EVENTS).sort((a, b) => a.seq - b.seq);
  const eventIds = ranked.map((e) => e.id);
  const idSchema = eventIds.length ? z.enum(eventIds as [string, ...string[]]) : z.string();

  const schema = z.object({
    headline: z.string().describe("front-page headline, under 12 words, punchy"),
    stories: z.array(z.object({
      headline: z.string().describe("under 10 words"),
      body: z.string().describe("60–120 words, small-town newspaper prose, names and sums"),
      sourceEventIds: z.array(idSchema).min(1).describe("the event ids this story is built from"),
    })).min(ranked.length ? 2 : 1).max(4),
    pricesColumn: z.string().describe("3–5 lines: today's prices with a wry note on what moved"),
    gossipCorner: z.string().describe("3–5 lines of 'Heard at the Anchor' items, unattributed, based on the events"),
    editorial: z.string().nullable().describe("60–100 words of opinion in the editor's voice, or null"),
  });

  const system = [
    renderPersona(journalist.self),
    "",
    WORLD_FACTS,
    "",
    CHARACTER_RULES,
    "",
    `TASK
You are writing today's edition of ${MASTHEAD}, the town's only newspaper, which you edit and report alone. Produce:
- headline: the front-page headline, punchy, under 12 words. Pick the day's genuinely biggest story.
- stories: 2–4 stories (fewer if the day was quiet), each with its own short headline and a body of 60–120 words. Every story must be built ONLY from the supplied events; cite their ids in sourceEventIds. Do not invent facts, quotes or people. Combine related events into one story where it makes sense. Small-town newspaper prose: concrete names, sums in crowns, a little dry humour, nothing cruel.
- pricesColumn: 3–5 lines listing today's prices from the supplied price list, with one wry line on what moved and why (as far as the events say).
- gossipCorner: 3–5 lines of "Heard at the Anchor" — unattributed items drawn from the events, teasing what might happen next without inventing.
- editorial: 60–100 words of opinion in your own voice on the day's biggest issue, or null if you have nothing to say. You are ${journalist.self.name}; your opinions and your grudges show here.`,
    "",
    `OUTPUT JSON shape. ${EXAMPLE_NOTE}
${example({ headline: "Twine Up Again — Net Loft Feels the Pinch", stories: [{ headline: "Dorran Raises Prices Third Week Running", body: "Twine rose to nine crowns a spool on Tuesday, the third rise in as many weeks. Pell Dorran, who owns the chandlery, blamed \"the mill\" and the cart tax. Hattie Ryn of the net loft, seen haggling at the counter, was less convinced... (60–120 words)", sourceEventIds: ["evt_1", "evt_2"] }, { headline: "Quay Repair Vote Slips Again", body: "...", sourceEventIds: ["evt_5"] }], pricesColumn: "Twine ₡9 (up 2). Rope ₡14 (steady). Bread ₡4. Rent for a room ₡40/week.\nThe twine did not raise itself; someone did.", gossipCorner: "Heard at the Anchor: a certain net-mender has been seen at the bank twice this week and bought nothing.\nHeard at the Anchor: two skippers were spotted comparing notebooks on the quay.", editorial: "This paper has asked three times what the cart tax pays for... (60–100 words)" })}`,
  ].join("\n");

  const eventLines = ranked.map((e) => `[${e.id}] day ${e.day} ${pad2(e.hour)}:${pad2(e.minute)} (${e.type}, drama ${e.drama}) ${e.text}${e.actors.length ? ` — involving ${e.actors.join(", ")}` : ""}`);
  const user = [
    `Edition for day ${day}. You are ${journalist.self.name}.`,
    `Mayor: ${journalist.world.mayor}; election in ${journalist.world.daysToElection} day(s).${journalist.world.activeEvents.length ? ` Ongoing: ${journalist.world.activeEvents.join("; ")}.` : ""}`,
    "",
    `EVENTS OF THE DAY (${ranked.length}):`,
    ...(eventLines.length ? eventLines : ["(nothing was recorded — a quiet day; write a short 'nothing happened' story with honest charm)"]),
    "",
    `TODAY'S PRICES: ${renderPrices(prices, 20)}`,
    journalist.memories.length ? `\nWhat you personally know: ${journalist.memories.slice(0, 5).join(" / ")}` : "",
    "",
    "Write the edition. Return the JSON.",
  ].filter((l) => l !== "").join("\n");

  const map = (w: z.infer<typeof schema>): Newspaper => ({
    day,
    masthead: MASTHEAD,
    headline: w.headline.trim(),
    stories: w.stories.slice(0, 4).map((s) => ({
      headline: s.headline.trim(),
      body: s.body.trim(),
      sourceEventIds: s.sourceEventIds.filter((id) => !eventIds.length || eventIds.includes(id)),
    })),
    pricesColumn: w.pricesColumn.trim(),
    gossipCorner: w.gossipCorner.trim(),
    ...(w.editorial && w.editorial.trim() ? { editorial: w.editorial.trim() } : {}),
  });

  return { system, user, schema, map, maxTokens: 1800 };
}
