/**
 * Choosing and framing moments: the "best bit" order, where a jump lands, and the
 * opening scene. Pure functions over the manifest (no store, safe on the server).
 */
import type { Chapter, Manifest, Moment } from "./types";

export const KIND_COLOR: Record<string, string> = {
  election: "#f5b942", decision: "#ff3b5c", incident: "#a78bfa", romance: "#f472b6", feud: "#fb923c", town: "#38bdf8",
};
export const KIND_LABEL: Record<string, string> = {
  election: "Election", decision: "Decision", incident: "Story begins", romance: "Romance", feud: "Feud", town: "Town",
};
export const kindColor = (k: string) => KIND_COLOR[k] ?? "#94a3b8";

/** Story beats are written overnight (00:00); their effects play out the next morning. */
export const isOvernight = (m: { hour: number; minute: number }) => m.hour === 0 && m.minute === 0;

/** Last sim-minute with recorded frames (the final day file is a stub at midnight). */
export function playableEnd(man: Manifest): number {
  const days = Object.keys(man.dayStarts).map(Number).sort((a, b) => a - b);
  const last = days[days.length - 1];
  // the stub day starts exactly where the previous one ends
  return Math.min(man.end, man.dayStarts[String(last)] ?? man.end) - 1;
}
export function playableStart(man: Manifest): number {
  return Math.min(...Object.values(man.dayStarts));
}

/**
 * Where to seek for a moment: ~20 sim-minutes before it, or for an overnight story
 * beat, the next morning (07:40) when the people involved are up and acting on it.
 */
export function jumpTarget(man: Manifest, m: { s: number; hour: number; minute: number }): number {
  const t = isOvernight(m) ? m.s + 7 * 60 + 40 : m.s - 20;
  return Math.max(playableStart(man), Math.min(playableEnd(man) - 30, t));
}

/** "Jump to the best bit" cycle: the election, then every story decision in order, then the rest by score. */
export function bestOrder(man: Manifest): number[] {
  const idx = man.moments.map((_, i) => i);
  const rank = (m: Moment) => (m.kind === "election" ? 0 : m.kind === "decision" ? 1 : 2);
  return idx.sort((a, b) => {
    const A = man.moments[a], B = man.moments[b];
    return rank(A) - rank(B) || (rank(A) === 2 ? B.score - A.score : 0) || A.s - B.s;
  }).filter((i) => man.moments[i].score >= 7 || man.moments[i].kind === "election");
}

/** The first scene a visitor sees: day 2's first story incident, else the first incident at all. */
export function openingMoment(man: Manifest): number {
  const inc = man.moments.map((m, i) => ({ m, i })).filter(({ m }) => m.kind === "incident").sort((a, b) => a.m.s - b.m.s);
  const d2 = inc.find(({ m }) => m.day >= 2);
  return (d2 ?? inc[0])?.i ?? 0;
}

/** The manifest moment that matches a chapter stage (same title and minute), if any. */
export function stageMoment(man: Manifest, ch: Chapter, stageIdx: number): number | null {
  const st = ch.stages[stageIdx];
  if (!st) return null;
  const i = man.moments.findIndex((m) => m.s === st.s && m.title === ch.title);
  return i >= 0 ? i : null;
}

export function momentWhen(m: Moment): string {
  return isOvernight(m) ? `Day ${m.day} · overnight` : `Day ${m.day} · ${String(m.hour).padStart(2, "0")}:${String(m.minute).padStart(2, "0")}`;
}
