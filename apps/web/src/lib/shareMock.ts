/**
 * Deterministic offline stand-in for the engine, used ONLY when
 * NEXT_PUBLIC_MOCK_WORLD=1 (same flag the scene/HUD dev mocks use). It lets the
 * permalink pages and OG cards be developed and screenshotted without a running
 * simulation. Never loaded in a normal build — `shareServer` imports it lazily
 * behind the flag.
 *
 * Everything is derived from content/*.json so the names, jobs and dramas are
 * the real ones; only the live numbers are invented.
 * OWNED BY THE STORY/SHARE AGENT.
 */
import type { Confessional, Memory, Mood, Newspaper, NpcState, RelationshipState, Storyline, WorldEvent } from "@npcworld/schema";
import { CAST, CAST_BY_ID, SEEDED_CONFLICTS, STATIC_EDGES, firstName, locationName } from "./share";
import type { NpcDossier } from "./shareServer";

export const MOCK_DAY = 12;

/* deterministic rng keyed by a string, so every render matches */
function rng(key: string) {
  let s = 0;
  for (let i = 0; i < key.length; i++) s = (s * 31 + key.charCodeAt(i)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)];

const MOODS: Mood[] = ["elated", "happy", "content", "neutral", "tense", "sad", "angry", "afraid"];
const WALLET: Record<string, [number, number]> = { wealthy: [1800, 3200], comfortable: [500, 1100], getting_by: [150, 420], tight: [30, 160], broke: [0, 40] };

export function mockNpcState(id: string): NpcState | null {
  const c = CAST_BY_ID[id];
  if (!c) return null;
  const r = rng(`state:${id}`);
  const [lo, hi] = WALLET[c.wealthClass] ?? [100, 400];
  const at = r() > 0.45 ? c.workplace : pick(r, ["town_square", "tavern", "cafe", "fish_market", c.home]);
  return {
    id, name: c.name, pos: [0, 0], locationId: at, targetLocationId: null,
    action: r() > 0.5 ? "work" : "talk",
    activity: pick(r, [`working at ${locationName(at)}`, `talking things over at ${locationName(at)}`, `counting the day's takings at ${locationName(at)}`, `waiting for someone at ${locationName(at)}`]),
    thought: c.fear ? `${c.want.split(";")[0]}. And underneath it, always: ${c.fear[0].toLowerCase()}${c.fear.slice(1)}.` : c.want,
    mood: pick(r, MOODS), needs: { food: r(), rest: r(), social: r(), leisure: r(), purpose: r() },
    wallet: Math.round(lo + r() * (hi - lo)), debt: r() > 0.7 ? Math.round(r() * 4000) : 0,
    employed: c.employer !== null, job: c.job, jobTitle: c.jobTitle, home: c.home, workplace: c.workplace,
    plan: [], planStepIndex: 0, conversationId: null, sickDays: 0,
    mayorOpinion: Math.round(r() * 160 - 80), happiness: Math.round(30 + r() * 60),
  };
}

export function mockRelationships(id: string): RelationshipState[] {
  return STATIC_EDGES.filter((e) => e.a === id || e.b === id).map((e, i) => ({
    a: e.a, b: e.b, type: e.type as RelationshipState["type"],
    affinity: Math.max(-100, Math.min(100, e.affinity + Math.round(rng(`${e.a}${e.b}${i}`)() * 20 - 10))),
    lastInteractionDay: MOCK_DAY - Math.floor(rng(`d${e.a}${e.b}`)() * 4),
  }));
}

export function mockMemories(id: string): Memory[] {
  const c = CAST_BY_ID[id];
  if (!c) return [];
  const r = rng(`mem:${id}`);
  const conflicts = SEEDED_CONFLICTS.filter((k) => k.actors.includes(id));
  const others = STATIC_EDGES.filter((e) => e.a === id).slice(0, 4).map((e) => e.b);
  const lines: string[] = [
    ...conflicts.map((k) => k.fuse),
    `${firstName(others[0] ?? id)} looked straight past me in the square this morning.`,
    `Counted the till twice. The second count was worse.`,
    `${c.want}. Said it out loud for the first time.`,
    `Rain all afternoon. Nobody came in.`,
    `${firstName(others[1] ?? id)} asked about the loan. I said it was handled.`,
  ];
  return lines.slice(0, 6).map((text, i) => ({
    id: `m_${id}_${i}`, npcId: id, day: MOCK_DAY - Math.floor(i / 2), hour: 7 + Math.floor(r() * 14),
    kind: (["reflection", "conversation", "observation", "event"] as const)[i % 4],
    text, importance: Math.round(4 + r() * 5), about: others.slice(0, 2),
  }));
}

export function mockConfessionalsFor(id: string): Confessional[] {
  const c = CAST_BY_ID[id];
  if (!c) return [];
  const r = rng(`conf:${id}`);
  const fear = `${c.fear[0].toLowerCase()}${c.fear.slice(1)}`;
  const openers = [
    `Nobody asks, so I'll say it here: ${fear}. That's the whole of it.`,
    `Everyone thinks I'm managing. What I'm actually doing is ${fear}, slowly, in public.`,
    `I said the opposite of this in the square today. Here: ${fear}, and I'm tired of pretending otherwise.`,
    `You want the honest version? ${c.fear}. Say it out there and I'd never hear the end of it.`,
  ];
  const seconds = [
    `${c.want}. I keep telling myself it's one good week away. It has been one good week away for a while now.`,
    `${c.want}. And every day I don't, somebody notices a little more.`,
    `${c.want}. That's the plan. There is no second plan.`,
  ];
  return [
    { day: MOCK_DAY, npcId: id, text: pick(r, openers), mood: pick(r, MOODS) },
    { day: MOCK_DAY - 2, npcId: id, text: pick(r, seconds), mood: pick(r, MOODS) },
  ];
}

export function mockDossier(id: string): NpcDossier {
  return { online: false, state: mockNpcState(id), memories: mockMemories(id), relationships: mockRelationships(id), confessionals: mockConfessionalsFor(id) };
}

const STATUSES: Storyline["status"][] = ["climax", "active", "active", "brewing", "brewing", "resolved"];
export function mockStorylines(): Storyline[] {
  return SEEDED_CONFLICTS.slice(0, 8).map((c, i) => {
    const r = rng(`sl:${c.id}`);
    return {
      id: c.id, title: c.title, summary: c.fuse, actors: c.actors, eventIds: [],
      status: STATUSES[i % STATUSES.length],
      startedDay: 1 + Math.floor(r() * 5), updatedDay: MOCK_DAY - Math.floor(r() * 2),
      heat: Math.round(10 - i * 0.9),
    };
  });
}

const EVENT_KINDS: WorldEvent["type"][] = ["argument", "romance", "gossip", "rent_missed", "hired", "speech", "feud", "transaction", "crime", "friendship"];
export function mockEvents(day: number): WorldEvent[] {
  const r = rng(`ev:${day}`);
  const out: WorldEvent[] = [];
  const used = new Set<string>();
  for (let i = 0; i < 26; i++) {
    const conflict = SEEDED_CONFLICTS[(i * 7 + Math.floor(r() * 3)) % SEEDED_CONFLICTS.length];
    const a = pick(r, conflict.actors);
    const b = conflict.actors.find((x) => x !== a) ?? a;
    const type = EVENT_KINDS[(i + Math.floor(r() * 2)) % EVENT_KINDS.length];
    const where = pick(r, ["town_square", "tavern", "fish_market", "bakery", "town_hall", "docks", "cafe"]);
    const TEXT: Record<string, string> = {
      argument: `${firstName(a)} and ${firstName(b)} went at it in front of everyone at ${locationName(where)}.`,
      romance: `${firstName(a)} walked ${firstName(b)} home the long way. Twice.`,
      gossip: `Word is out about ${conflict.title.toLowerCase()} — ${firstName(a)} told three people before noon.`,
      rent_missed: `${firstName(a)} missed rent again. Marcus wrote it in the ledger without looking up.`,
      hired: `${firstName(a)} took ${firstName(b)} on for the week. Nobody said the word "favour".`,
      speech: `${firstName(a)} stood on the steps and said the quiet part loudly.`,
      feud: `${firstName(a)} will not be served at ${locationName(where)} again, and both parties seem fine with that.`,
      transaction: `${firstName(a)} paid over the odds at ${locationName(where)} rather than ask ${firstName(b)} for credit.`,
      crime: `Something went missing from ${locationName(where)}. ${firstName(a)} was the last one in.`,
      friendship: `${firstName(a)} sat with ${firstName(b)} until closing. Neither of them mentioned the money.`,
    };
    const text = TEXT[type] ?? `${firstName(a)} did something worth noticing.`;
    if (used.has(text)) continue;
    used.add(text);
    out.push({
      id: `e_${day}_${i}`, seq: day * 1000 + i, day, hour: 6 + Math.floor(r() * 17), minute: Math.floor(r() * 60),
      type, actors: [a, b], locationId: where, text,
      importance: Math.round(3 + r() * 6), drama: Math.round(2 + r() * 8),
    });
  }
  return out.sort((x, y) => x.hour - y.hour || x.minute - y.minute).map((e, i) => ({ ...e, seq: day * 1000 + i }));
}

export function mockConfessionals(day: number): Confessional[] {
  const r = rng(`confday:${day}`);
  const ids = SEEDED_CONFLICTS.slice(0, 6).map((c) => c.actors[Math.floor(r() * c.actors.length)]);
  return [...new Set(ids)].slice(0, 4).map((id) => ({ ...mockConfessionalsFor(id)[0], day }));
}

export function mockPaper(day: number): Newspaper {
  const r = rng(`paper:${day}`);
  const picks = [...SEEDED_CONFLICTS].sort(() => r() - 0.5).slice(0, 3);
  const lead = picks[0];
  return {
    day, masthead: "The Solmere Herald",
    headline: pick(r, [`${lead.title} reaches the council steps`, `${lead.title} comes to a head`, `Nobody will say it, so the Herald will: ${lead.title.toLowerCase()}`]),
    stories: picks.map((c, i) => ({
      headline: i === 0 ? `${c.title}: "one bad week away"` : c.title,
      body: `${c.fuse} ${firstName(c.actors[0])} declined to comment; ${firstName(c.actors[1] ?? c.actors[0])} commented at length. This paper prints both, and neither comes off well.`,
    })),
    pricesColumn: ["bread     4 crowns  (+1)", "fish      7 crowns  (—)", "ale       3 crowns  (−1)", "cloth    18 crowns  (+2)"].join("\n"),
    gossipCorner: `Someone was seen leaving ${locationName("tavern")} at an hour this column is too polite to specify, in company this column is delighted to specify: ${firstName(picks[1]?.actors[0] ?? CAST[0].id)}.`,
    editorial: `Fifty people, one harbour, and an increasingly thin pretence that any of us are minding our own business.`,
  };
}
