/**
 * Replay mode switch. With NEXT_PUBLIC_REPLAY=<season> (e.g. s1) the viewer plays a
 * recorded season from static files under /season/<season>/ instead of talking to
 * the engine. Unset = live mode, unchanged.
 */
export const REPLAY: string = process.env.NEXT_PUBLIC_REPLAY ?? "";
export const IS_REPLAY = REPLAY !== "";
export const SEASON_BASE = `/season/${REPLAY || "s1"}`;

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** sim-minute → "Day 4 · 10:32" parts. s is absolute: day d starts at (d-1)*1440. */
export function simClock(s: number): { day: number; hour: number; minute: number } {
  const m = Math.max(0, Math.floor(s));
  return { day: Math.floor(m / 1440) + 1, hour: Math.floor((m % 1440) / 60), minute: m % 60 };
}
export function fmtSim(s: number): string {
  const c = simClock(s);
  return `Day ${c.day} · ${pad2(c.hour)}:${pad2(c.minute)}`;
}
