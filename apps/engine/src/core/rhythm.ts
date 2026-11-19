/**
 * Parses the free-text `rhythm` field of a cast sheet ("up at 4, market till 14, tavern at 18")
 * into numbers the engine and MockBrain can use. Best-effort; defaults are sensible.
 */
export interface Rhythm {
  wake: number; // float hour
  bed: number; // float hour; may be < wake for night people
  /** first "A–B" range found: usually the work shift */
  work: [number, number] | null;
}

const DASH = /(\d{1,2})(?::(\d{2}))?\s*[–\-]\s*(\d{1,2})(?::(\d{2}))?/g;

export function parseRhythm(text: string, fallbackWake = 6.5): Rhythm {
  const t = text.toLowerCase();
  let wake: number | null = null;
  let bed: number | null = null;
  const up = /up at (\d{1,2})(?::(\d{2}))?/.exec(t);
  if (up) wake = Number(up[1]) + (up[2] ? Number(up[2]) / 60 : 0);
  const sleeps = /sleeps (\d{1,2})\s*[–\-]\s*(\d{1,2})/.exec(t);
  if (sleeps) {
    bed = Number(sleeps[1]);
    wake = Number(sleeps[2]);
  }
  if (wake === null && /late riser|up late/.test(t)) wake = 8.5;
  const asleep = /asleep by (\d{1,2})/.exec(t);
  if (asleep) bed = Number(asleep[1]);
  const till = /till (\d{1,2}) a\.?m/.exec(t);
  if (till) bed = Number(till[1]);
  let work: [number, number] | null = null;
  for (const m of t.matchAll(DASH)) {
    const a = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
    const b = Number(m[3]) + (m[4] ? Number(m[4]) / 60 : 0);
    if (sleeps && a === Number(sleeps[1])) continue;
    if (b < a) {
      // past midnight ("16–01", "20–6")
      if (bed === null && b <= 6 && !sleeps) bed = b;
      if (!work) work = [a, 24];
    } else if (!work) work = [a, b];
  }
  if (wake === null) wake = fallbackWake;
  if (bed === null) bed = wake < 5 ? 21 : wake < 7 ? 22 : 23;
  return { wake, bed, work };
}

/** true when `hour` is inside the personal sleep window [bed, wake). */
export function isSleepHour(hour: number, r: Rhythm): boolean {
  if (r.bed > r.wake) return hour >= r.bed || hour < r.wake; // normal: bed 22, wake 6
  return hour >= r.bed && hour < r.wake; // night shift: bed 6, wake 13
}
