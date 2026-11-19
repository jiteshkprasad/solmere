/**
 * Shared HUD helpers: static content lookups (names, locations, currency),
 * colour maps, formatting. No store subscriptions here.
 */
import type { EventType, Mood, RelationshipType, WorldEvent } from "@npcworld/schema";
import castJson from "../../../../../content/cast.json";
import townJson from "../../../../../content/town.json";
import economyJson from "../../../../../content/economy.json";
import { useWorld } from "@/lib/store";

export interface CastEntry { id: string; name: string; age: number; job: string; jobTitle: string; employer: string | null; workplace: string; home: string; household: string; wealthClass: string; traits: string[]; speakingStyle: string }

export const CAST: CastEntry[] = (castJson as { npcs: CastEntry[] }).npcs.map((n) => ({
  id: n.id, name: n.name, age: n.age, job: n.job, jobTitle: n.jobTitle, employer: n.employer, workplace: n.workplace,
  home: n.home, household: n.household, wealthClass: n.wealthClass, traits: n.traits, speakingStyle: n.speakingStyle,
}));
export const CAST_BY_ID: Record<string, CastEntry> = Object.fromEntries(CAST.map((n) => [n.id, n]));
export const TOWN_NAME: string = (castJson as { town: string }).town ?? "Solmere";

interface LocationEntry { id: string; name: string; type: string; district: string; pos: [number, number] }
export const LOCATIONS: LocationEntry[] = (townJson as unknown as { locations: LocationEntry[] }).locations;
export const LOCATION_BY_ID: Record<string, LocationEntry> = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));

const SIM_HOUR_REAL_MIN: number = (townJson as unknown as { clock: { simHourRealMinutes: number } }).clock.simHourRealMinutes || 5;
/** sim minutes per real second at 1× (town.json clock) */
export const SPEED_1X = 60 / (SIM_HOUR_REAL_MIN * 60);
export const SIM_HOUR_REAL_MINUTES = SIM_HOUR_REAL_MIN;
export function speedMultiplier(simMinPerSec: number): number { return Math.round((simMinPerSec / SPEED_1X) * 10) / 10; }

const econ = economyJson as { currency: { symbol: string; name: string; plural: string }; goods: Record<string, { label: string; unit: string; basePrice: number }> };
export const CURRENCY = econ.currency.symbol;
export const GOODS = econ.goods;

/** Name for an npc id: static cast first, live store second, then a prettified id. */
export function npcName(id: string | null | undefined): string {
  if (!id) return "—";
  const c = CAST_BY_ID[id];
  if (c) return c.name;
  const live = useWorld.getState().npcs[id];
  if (live) return live.name;
  return id.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
/** First name only, for chips & banners. */
export function firstName(id: string | null | undefined): string {
  const n = npcName(id);
  const bare = n.replace(/^(Dr|Captain|Sister|Mayor)\s+/, "");
  return bare.split(" ")[0];
}
/** Short display name: strips honorifics but keeps the nickname if present ("Dolores 'Dolly' Quinn" → "Dolly Quinn"). */
export function shortName(id: string | null | undefined): string {
  const n = npcName(id);
  const nick = n.match(/'([^']+)'/);
  const parts = n.replace(/^(Dr|Captain|Sister)\s+/, "").replace(/\s*'[^']+'\s*/, " ").trim().split(" ");
  return nick ? `${nick[1]} ${parts[parts.length - 1]}` : parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : parts.join(" ");
}
export function initials(name: string): string {
  const bare = name.replace(/^(Dr|Captain|Sister|Mayor)\s+/, "").replace(/'[^']+'/g, "").trim();
  const p = bare.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[p.length - 1]?.[0] ?? "")).toUpperCase();
}
export function locationName(id: string | null | undefined): string {
  if (!id) return "";
  return LOCATION_BY_ID[id]?.name ?? id.replace(/_/g, " ");
}
/** "at the docks" / "at Café Moreno" phrasing for banners */
export function atLocation(id: string | null | undefined): string {
  if (!id) return "";
  const n = locationName(id);
  if (/^(Docks|Lighthouse|Town Square|Town Hall|Schoolhouse|Post Office|Fish Market|Chapel Rectory)$/.test(n)) return `at the ${n.toLowerCase()}`;
  if (/^The /.test(n)) return `at ${n.replace(/^The /, "the ")}`;
  return `at ${n}`;
}

/* ---------- colours ---------- */
export function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}
export function hashColor(id: string, s = 55, l = 42): string { return `hsl(${hashHue(id)} ${s}% ${l}%)`; }

export const MOOD_COLOR: Record<Mood, string> = {
  elated: "#fbbf24", happy: "#34d399", content: "#2dd4bf", neutral: "#94a3b8",
  tense: "#fb923c", sad: "#60a5fa", angry: "#f87171", afraid: "#a78bfa",
};
export const MOOD_LABEL: Record<Mood, string> = {
  elated: "Elated", happy: "Happy", content: "Content", neutral: "Neutral", tense: "Tense", sad: "Sad", angry: "Angry", afraid: "Afraid",
};
export function moodColor(m: string | undefined): string { return (m && (MOOD_COLOR as Record<string, string>)[m]) || MOOD_COLOR.neutral; }

export const REL_COLOR: Record<RelationshipType, string> = {
  romantic: "#f472b6", spouse: "#f472b6", family: "#fbbf24", friend: "#34d399", mentor: "#34d399",
  colleague: "#94a3b8", business: "#94a3b8", rival: "#f87171", enemy: "#ef4444", tenant: "#a78bfa",
};
export function relColor(t: string): string { return (REL_COLOR as Record<string, string>)[t] ?? "#94a3b8"; }

/* ---------- events ---------- */
export type FeedFilter = "all" | "drama" | "economy" | "politics" | "society";
const ECON: EventType[] = ["transaction", "wage", "wage_missed", "rent", "rent_missed", "eviction", "loan", "loan_default", "hired", "fired", "quit", "price_change", "windfall", "crime"];
const POL: EventType[] = ["policy_proposed", "policy_vote", "election_declared", "speech", "vote", "election_result"];
const SOC: EventType[] = ["conversation", "argument", "romance", "breakup", "friendship", "feud", "gossip", "confessional", "reflection", "sick", "recovered", "festival", "arrival"];
export const EVENT_GROUP: Record<EventType, "economy" | "politics" | "society" | "world"> = Object.fromEntries([
  ...ECON.map((t) => [t, "economy"]), ...POL.map((t) => [t, "politics"]), ...SOC.map((t) => [t, "society"]),
  ["system", "world"], ["world_event", "world"], ["newspaper", "world"], ["storyline", "world"],
]) as Record<EventType, "economy" | "politics" | "society" | "world">;

export function eventMatches(e: WorldEvent, f: FeedFilter): boolean {
  if (f === "all") return true;
  if (f === "drama") return e.drama >= 5;
  return EVENT_GROUP[e.type] === f;
}
export const EVENT_ICON: Partial<Record<EventType, string>> = {
  transaction: "₡", wage: "₡", wage_missed: "!", rent: "⌂", rent_missed: "⌂", eviction: "⌂", loan: "%", loan_default: "%",
  hired: "+", fired: "−", quit: "−", price_change: "↕", conversation: "❝", argument: "⚡", romance: "♥", breakup: "♡",
  friendship: "☺", feud: "✕", gossip: "…", policy_proposed: "§", policy_vote: "§", election_declared: "★", speech: "♪",
  vote: "✓", election_result: "★", world_event: "◉", newspaper: "▤", confessional: "▶", reflection: "◌", sick: "+",
  recovered: "+", festival: "✦", crime: "☠", windfall: "$", storyline: "▮", system: "·", arrival: "→",
};
export const EVENT_TINT: Record<"economy" | "politics" | "society" | "world", string> = {
  economy: "#c98500", politics: "#3987e5", society: "#d55181", world: "#199e70",
};

/* ---------- formatting ---------- */
export const pad2 = (n: number) => String(n).padStart(2, "0");
export function fmtClock(h: number, m: number): string { return `${pad2(h)}:${pad2(m)}`; }
export function fmtMoney(n: number | undefined | null, digits = 0): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const s = abs >= 100000 ? `${(abs / 1000).toFixed(0)}k` : abs >= 10000 ? `${(abs / 1000).toFixed(1)}k` : abs.toFixed(digits);
  return `${n < 0 ? "−" : ""}${CURRENCY}${s}`;
}
export function fmtPct(x: number | undefined | null, digits = 0): string { return x === undefined || x === null ? "—" : `${(x * 100).toFixed(digits)}%`; }
export function fmtNum(x: number | undefined | null, digits = 0): string { return x === undefined || x === null ? "—" : x.toFixed(digits); }
export function hourLabel(h: number): string { return `${pad2(Math.floor(h))}:${pad2(Math.round((h % 1) * 60))}`; }
export function clamp(x: number, a: number, b: number): number { return Math.max(a, Math.min(b, x)); }
export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");
