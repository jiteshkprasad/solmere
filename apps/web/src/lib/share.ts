/**
 * Arrival & shareability helpers — OWNED BY THE STORY/SHARE AGENT.
 *
 * Isomorphic on purpose: imported by server components (`/npc/[id]`, `/day/[n]`,
 * the OG routes) *and* by client components (ArrivalCard, CatchUp). So:
 *   - no "use client" directive
 *   - no import of `lib/store` or `components/hud/lib` (both are client-tainted)
 *   - no node builtins (see `lib/shareServer.ts` for the fs/engine side)
 *
 * Everything degrades to the static `content/*.json` files when the engine is
 * unreachable, which is the normal case in a sandbox.
 */
import type { Confessional, Newspaper, NpcState, RelationshipState, Storyline, WorldEvent } from "@npcworld/schema";
import castJson from "../../../../content/cast.json";
import relJson from "../../../../content/relationships.json";
import townJson from "../../../../content/town.json";
import economyJson from "../../../../content/economy.json";

/* ------------------------------------------------------------------ */
/* Static content                                                      */
/* ------------------------------------------------------------------ */

export interface CastPerson {
  id: string; name: string; age: number; gender: string; origin: string;
  job: string; jobTitle: string; employer: string | null; workplace: string; home: string;
  household: string; wealthClass: string; traits: string[]; want: string; fear: string;
  opinions: string[]; speakingStyle: string;
}

interface RawCast extends CastPerson { secret?: string }

/** The cast, with `secret` deliberately dropped — permalinks are public pages. */
export const CAST: CastPerson[] = ((castJson as { npcs: RawCast[] }).npcs ?? []).map((n) => ({
  id: n.id, name: n.name, age: n.age, gender: n.gender, origin: n.origin, job: n.job, jobTitle: n.jobTitle,
  employer: n.employer, workplace: n.workplace, home: n.home, household: n.household, wealthClass: n.wealthClass,
  traits: n.traits ?? [], want: n.want, fear: n.fear, opinions: n.opinions ?? [], speakingStyle: n.speakingStyle,
}));
export const CAST_BY_ID: Record<string, CastPerson> = Object.fromEntries(CAST.map((n) => [n.id, n]));
export const TOWN_NAME: string = (castJson as { town?: string }).town ?? "Solmere";

export interface SeededConflict { id: string; title: string; actors: string[]; fuse: string; domain: "economy" | "politics" | "society" }
export const SEEDED_CONFLICTS: SeededConflict[] = (relJson as { seededConflicts?: SeededConflict[] }).seededConflicts ?? [];

export interface StaticEdge { a: string; b: string; type: string; affinity: number; note?: string }
export const STATIC_EDGES: StaticEdge[] = (relJson as { edges?: StaticEdge[] }).edges ?? [];

interface LocationEntry { id: string; name: string; type: string; district: string }
const LOCATIONS: LocationEntry[] = (townJson as unknown as { locations: LocationEntry[] }).locations ?? [];
export const LOCATION_BY_ID: Record<string, LocationEntry> = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));
export const TOWN_TAGLINE: string = (townJson as unknown as { tagline?: string }).tagline ?? "";
export const CURRENCY: string = (economyJson as { currency?: { symbol?: string } }).currency?.symbol ?? "₡";

/* ------------------------------------------------------------------ */
/* Names, colours, formatting (mirrors hud/lib.ts without the store)   */
/* ------------------------------------------------------------------ */

export function npcName(id: string | null | undefined, live?: Record<string, NpcState>): string {
  if (!id) return "—";
  return CAST_BY_ID[id]?.name ?? live?.[id]?.name ?? id.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
export function firstName(id: string | null | undefined): string {
  return npcName(id).replace(/^(Dr|Captain|Sister|Mayor)\s+/, "").split(" ")[0];
}
export function initials(name: string): string {
  const bare = name.replace(/^(Dr|Captain|Sister|Mayor)\s+/, "").replace(/'[^']+'/g, "").trim();
  const p = bare.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[p.length - 1]?.[0] ?? "")).toUpperCase();
}
export function locationName(id: string | null | undefined): string {
  if (!id) return "";
  return LOCATION_BY_ID[id]?.name ?? id.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
export function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}
/** Deterministic portrait-less avatar background, matching the HUD's Avatar. */
export function hashGradient(id: string): string {
  const h = hashHue(id);
  return `linear-gradient(135deg, hsl(${h} 55% 46%), hsl(${(h + 30) % 360} 55% 34%))`;
}
export const MOOD_COLOR: Record<string, string> = {
  elated: "#fbbf24", happy: "#34d399", content: "#2dd4bf", neutral: "#94a3b8",
  tense: "#fb923c", sad: "#60a5fa", angry: "#f87171", afraid: "#a78bfa",
};
export const moodColor = (m: string | undefined) => MOOD_COLOR[m ?? ""] ?? MOOD_COLOR.neutral;
export const REL_COLOR: Record<string, string> = {
  romantic: "#f472b6", spouse: "#f472b6", family: "#fbbf24", friend: "#34d399", mentor: "#34d399",
  colleague: "#94a3b8", business: "#94a3b8", rival: "#f87171", enemy: "#ef4444", tenant: "#a78bfa",
};
export const relColor = (t: string) => REL_COLOR[t] ?? "#94a3b8";
export const pad2 = (n: number) => String(n).padStart(2, "0");
export const fmtClock = (h: number, m: number) => `${pad2(h)}:${pad2(m)}`;
export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const s = abs >= 10000 ? `${(abs / 1000).toFixed(1)}k` : Math.round(abs).toString();
  return `${n < 0 ? "−" : ""}${CURRENCY}${s}`;
}
export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");
export function clip(s: string, n: number): string {
  const t = (s ?? "").trim();
  if (t.length <= n) return t;
  // prefer ending on a sentence, then a word, before falling back to a hard cut
  const head = t.slice(0, n);
  const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "));
  if (stop > n * 0.55) return head.slice(0, stop + 1);
  const space = head.lastIndexOf(" ");
  const cut = space > n * 0.5 ? head.slice(0, space) : head.slice(0, n - 1);
  return `${cut.replace(/[\s,;:.–—-]+$/, "")}…`;
}

/* ------------------------------------------------------------------ */
/* Portrait atlas                                                      */
/* ------------------------------------------------------------------ */

export interface AtlasIndex { version: number; size: number; cols: number; ids: string[] }
export interface TileRect { url: string; size: number; x: number; y: number; sheetW: number; sheetH: number }

/** Where `id`'s face sits in /portraits/atlas.webp, or null (→ initials fallback). */
export function atlasTile(index: AtlasIndex | null, id: string): TileRect | null {
  if (!index?.ids?.length || !index.size || !index.cols) return null;
  const slot = index.ids.indexOf(id);
  if (slot < 0) return null;
  const rows = Math.ceil(index.ids.length / index.cols);
  return {
    url: "/portraits/atlas.webp", size: index.size,
    x: (slot % index.cols) * index.size, y: Math.floor(slot / index.cols) * index.size,
    sheetW: index.cols * index.size, sheetH: rows * index.size,
  };
}

/* ------------------------------------------------------------------ */
/* Story selection — "who should I care about, what is happening"      */
/* ------------------------------------------------------------------ */

/** Live storylines ranked by heat, with a static fallback built from seeded conflicts. */
export function hottestStorylines(storylines: Storyline[], limit = 3): Storyline[] {
  const live = storylines.filter((s) => s.status !== "resolved");
  const pool = live.length ? live : storylines;
  return [...pool]
    .sort((a, b) => b.heat - a.heat || b.updatedDay - a.updatedDay)
    .slice(0, limit);
}

/** Seeded dramas dressed up as storylines, for a world with no history yet. */
export function seededAsStorylines(limit = 3, day = 1): Storyline[] {
  return SEEDED_CONFLICTS.slice(0, limit).map((c) => ({
    id: c.id, title: c.title, summary: c.fuse, actors: c.actors, eventIds: [],
    status: "brewing" as const, startedDay: day, updatedDay: day, heat: 4,
  }));
}

/**
 * The storylines to show on arrival. Live arcs first, topped up with seeded
 * conflicts that no live arc has swallowed yet — so a world on hour two still
 * shows three real dramas instead of one lonely card.
 */
export function arrivalStorylines(storylines: Storyline[], day = 1, limit = 3): { items: Storyline[]; live: number; seededIds: Set<string> } {
  const live = hottestStorylines(storylines, limit);
  const items = [...live];
  const seededIds = new Set<string>();
  if (items.length < limit) {
    const taken = new Set(items.map((s) => s.id));
    const named = items.map((s) => s.title.toLowerCase());
    for (const s of seededAsStorylines(SEEDED_CONFLICTS.length, day)) {
      if (items.length >= limit) break;
      if (taken.has(s.id) || named.some((t) => t === s.title.toLowerCase())) continue;
      items.push(s);
      seededIds.add(s.id);
    }
  }
  return { items, live: live.length, seededIds };
}

/** Highest-drama recent event, preferring events with named actors. */
export function hottestEvent(events: WorldEvent[], withinDays = 2): WorldEvent | null {
  if (!events.length) return null;
  const maxDay = events[events.length - 1].day;
  const recent = events.filter((e) => e.day >= maxDay - withinDays);
  const pool = recent.length ? recent : events;
  let best: WorldEvent | null = null;
  for (const e of pool) {
    const score = e.drama + (e.actors.length ? 1.5 : 0) + e.seq * 1e-9;
    const bs = best ? best.drama + (best.actors.length ? 1.5 : 0) + best.seq * 1e-9 : -1;
    if (score > bs) best = e;
  }
  return best;
}

/**
 * "Show me someone": the NPC with the strongest pull right now — an actor in the
 * hottest live storyline, else the most recent high-drama actor, else the most
 * polarised relationship in the static cast.
 */
export function mostInterestingNpc(args: {
  storylines?: Storyline[]; events?: WorldEvent[]; npcs?: Record<string, NpcState>;
}): string {
  const { storylines = [], events = [], npcs = {} } = args;
  const score = new Map<string, number>();
  const add = (id: string, n: number) => score.set(id, (score.get(id) ?? 0) + n);

  for (const s of storylines) {
    if (s.status === "resolved") continue;
    const w = s.heat * (s.status === "climax" ? 1.6 : s.status === "active" ? 1.2 : 0.8);
    s.actors.forEach((a, i) => add(a, w / (1 + i * 0.35)));
  }
  const recent = events.slice(-120);
  recent.forEach((e, i) => {
    if (e.drama < 4) return;
    const recency = 0.4 + (i / Math.max(1, recent.length)) * 1.6;
    e.actors.forEach((a) => add(a, e.drama * recency * 0.4));
  });
  if (!score.size) {
    for (const e of STATIC_EDGES) add(e.a, Math.abs(e.affinity) / 100);
    for (const c of SEEDED_CONFLICTS) c.actors.forEach((a, i) => add(a, 3 / (1 + i)));
  }
  // prefer someone who is awake and doing something
  for (const [id, v] of score) {
    const n = npcs[id];
    if (n && n.action !== "sleep") score.set(id, v * 1.25);
  }
  let bestId = CAST[0]?.id ?? "mira_okafor", bestV = -Infinity;
  for (const [id, v] of score) if (v > bestV && (CAST_BY_ID[id] || npcs[id])) { bestV = v; bestId = id; }
  return bestId;
}

/** One-line "why this person matters right now", from live data or the seeded fuse. */
export function dramaLine(id: string, args: { storylines?: Storyline[]; events?: WorldEvent[]; npcs?: Record<string, NpcState> } = {}): string {
  const { storylines = [], events = [], npcs = {} } = args;
  const live = npcs[id];
  const inStory = storylines.filter((s) => s.actors.includes(id) && s.status !== "resolved").sort((a, b) => b.heat - a.heat)[0];
  if (inStory) return clip(inStory.summary || inStory.title, 150);
  const ev = [...events].reverse().find((e) => e.actors.includes(id) && e.drama >= 4);
  if (ev) return clip(ev.text, 150);
  if (live?.activity) return clip(live.activity, 150);
  const seeded = SEEDED_CONFLICTS.find((c) => c.actors.includes(id));
  if (seeded) return clip(seeded.fuse, 150);
  const c = CAST_BY_ID[id];
  return c ? clip(c.want, 150) : "";
}

/** Group events into descending sim-days, newest first, capped per day. */
export function byDay(events: WorldEvent[], days: number[], perDay = 8): Array<{ day: number; events: WorldEvent[] }> {
  return days.map((day) => {
    const all = events.filter((e) => e.day === day);
    const top = [...all].sort((a, b) => b.drama - a.drama || b.seq - a.seq).slice(0, perDay);
    top.sort((a, b) => b.seq - a.seq);
    return { day, events: top };
  });
}

/** Relationship edges for one NPC, deduped to one per counterpart, strongest first. */
export function topRelationships(id: string, live: RelationshipState[] | null | undefined, limit = 8): Array<{ other: string; type: string; affinity: number; note?: string }> {
  const src: Array<{ a: string; b: string; type: string; affinity: number; note?: string }> =
    live && live.length ? live : STATIC_EDGES;
  const best = new Map<string, { other: string; type: string; affinity: number; note?: string }>();
  for (const r of src) {
    if (r.a !== id && r.b !== id) continue;
    const other = r.a === id ? r.b : r.a;
    const mine = r.a === id;
    const cur = best.get(other);
    if (!cur || mine) best.set(other, { other, type: r.type, affinity: r.affinity, note: r.note });
  }
  return [...best.values()].sort((x, y) => Math.abs(y.affinity) - Math.abs(x.affinity)).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Share metadata copy                                                 */
/* ------------------------------------------------------------------ */

export function npcShareTitle(id: string): string {
  const c = CAST_BY_ID[id];
  return c ? `${c.name} — ${c.jobTitle} in ${TOWN_NAME}` : `${npcName(id)} — ${TOWN_NAME}`;
}
export function npcShareDescription(id: string, line: string): string {
  const c = CAST_BY_ID[id];
  const who = c ? `${c.name}, ${c.age}, ${c.job}.` : `${npcName(id)}.`;
  return clip(line ? `${who} ${line}` : `${who} One of 50 people living unscripted lives in ${TOWN_NAME}.`, 200);
}
export function dayShareTitle(day: number, paper: Newspaper | null): string {
  return paper?.headline ? `${clip(paper.headline, 80)} — ${TOWN_NAME}, day ${day}` : `${TOWN_NAME} — day ${day}`;
}

/** Pick up to n distinct actor ids that a day's stories are about. */
export function dayFaces(events: WorldEvent[], confessionals: Confessional[], n = 3): string[] {
  const seen: string[] = [];
  const push = (id: string) => { if (id && !seen.includes(id) && (CAST_BY_ID[id] || true)) seen.push(id); };
  for (const e of [...events].sort((a, b) => b.drama - a.drama)) { for (const a of e.actors) push(a); if (seen.length >= n) break; }
  for (const c of confessionals) { push(c.npcId); if (seen.length >= n) break; }
  return seen.slice(0, n);
}
