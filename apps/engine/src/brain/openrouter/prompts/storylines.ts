import { z } from "zod";
import type { Storyline, WorldEvent } from "@npcworld/schema";
import { EXAMPLE_NOTE, clamp, example, pad2 } from "./common.js";

const MAX_STORYLINES = 8;
const MAX_EVENTS = 80;

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "storyline";
}

export function buildStorylinesPrompt(existing: Storyline[], recentEvents: WorldEvent[], day: number) {
  const ranked = [...recentEvents].sort((a, b) => b.drama + b.importance - (a.drama + a.importance)).slice(0, MAX_EVENTS).sort((a, b) => a.seq - b.seq);
  const knownEventIds = new Set([...ranked.map((e) => e.id), ...existing.flatMap((s) => s.eventIds)]);

  const schema = z.object({
    storylines: z.array(z.object({
      id: z.string().describe("stable slug; reuse the existing id when continuing a storyline"),
      title: z.string().describe("under 8 words, like a TV episode thread"),
      summary: z.string().describe("2–3 sentences: what has happened and what is at stake now"),
      actors: z.array(z.string()).describe("npc ids"),
      eventIds: z.array(z.string()).describe("ids of the events in this thread"),
      status: z.enum(["brewing", "active", "climax", "resolved"]),
      startedDay: z.number().int(),
      updatedDay: z.number().int(),
      heat: z.number().min(0).max(10),
    })).max(MAX_STORYLINES),
  });

  const system = [
    `You are the story editor of a reality show that is real: a small port town called Solmere where 50 adults live, work, trade, feud and vote. Nothing is scripted; you only track what actually happened. You never invent events.`,
    "",
    `TASK
Merge the existing storylines with the day's recent events into at most ${MAX_STORYLINES} storylines a viewer would want to follow.
- Continue an existing storyline by reusing its id exactly; update summary, actors, eventIds (append the new event ids), status, updatedDay and heat.
- Start a new storyline only for a thread with real stakes (money, love, power, reputation) and at least one event; give it a short lowercase snake_case id (e.g. "bakery_loan"), startedDay = today.
- Drop storylines that have been "resolved" for more than a few days, or the coldest ones, when over the cap. Never keep more than ${MAX_STORYLINES}.
- status: "brewing" (signs only), "active" (things are happening), "climax" (confrontation, vote, deadline imminent), "resolved" (played out). heat 0–10: how much a viewer should watch this right now — a climax with money on the line is 8–10, a cooling feud 2–3.
- summary: 2–3 sentences, present tense, names and sums; end with what is at stake next.
- actors: npc ids only (lowercase firstname_lastname). eventIds: only ids you were given.
Output every storyline you want to keep (the result replaces the list).`,
    "",
    `OUTPUT JSON shape. ${EXAMPLE_NOTE}
${example({ storylines: [{ id: "net_loft_rent", title: "The Net Loft Rent", summary: "Hattie Ryn has missed two weeks' rent on the net loft and the landlord has stopped bending. Her sister still doesn't know. The next missed week forces an eviction notice.", actors: ["hattie_ryn", "pell_dorran"], eventIds: ["evt_12", "evt_19"], status: "active", startedDay: 1, updatedDay: 3, heat: 7 }] })}`,
  ].join("\n");

  const user = [
    `Today is day ${day}.`,
    "",
    `EXISTING STORYLINES (${existing.length}):`,
    ...(existing.length ? existing.map((s) => `- ${s.id} | "${s.title}" | ${s.status} | heat ${s.heat} | started day ${s.startedDay}, updated day ${s.updatedDay} | actors ${s.actors.join(", ")} | events ${s.eventIds.slice(-8).join(", ")}\n  ${s.summary}`) : ["- (none yet)"]),
    "",
    `RECENT EVENTS (${ranked.length}):`,
    ...(ranked.length ? ranked.map((e) => `[${e.id}] day ${e.day} ${pad2(e.hour)}:${pad2(e.minute)} ${e.type} drama ${e.drama}: ${e.text}${e.actors.length ? ` — ${e.actors.join(", ")}` : ""}`) : ["- (quiet day; keep existing storylines, cool their heat a little)"]),
    "",
    "Return the merged storylines as JSON.",
  ].join("\n");

  const map = (w: z.infer<typeof schema>): Storyline[] => {
    const byId = new Map(existing.map((s) => [s.id, s]));
    const seen = new Set<string>();
    const out: Storyline[] = [];
    for (const s of w.storylines) {
      let id = slugify(s.id);
      if (!byId.has(id)) {
        // stable id for continued storylines even if the model retitled the slug
        const match = existing.find((e) => slugify(e.title) === slugify(s.title));
        if (match) id = match.id;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      const prev = byId.get(id);
      const eventIds = [...new Set([...(prev?.eventIds ?? []), ...s.eventIds.filter((e) => knownEventIds.has(e))])];
      out.push({
        id,
        title: s.title.trim() || prev?.title || id,
        summary: s.summary.trim() || prev?.summary || "",
        actors: [...new Set(s.actors.map((a) => a.trim().toLowerCase().replace(/\s+/g, "_")).filter(Boolean))],
        eventIds,
        status: s.status,
        startedDay: prev?.startedDay ?? clamp(Math.round(s.startedDay), 1, day),
        updatedDay: clamp(Math.round(s.updatedDay), prev?.startedDay ?? 1, day),
        heat: clamp(Math.round(s.heat), 0, 10),
      });
    }
    return out.sort((a, b) => b.heat - a.heat).slice(0, MAX_STORYLINES);
  };

  return { system, user, schema, map, maxTokens: 2000 };
}
