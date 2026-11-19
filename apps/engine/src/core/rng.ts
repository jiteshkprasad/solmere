import seedrandom from "seedrandom";

/** Seeded RNG so a headless run with --seed N is reproducible. */
export interface Rng {
  next(): number; // [0,1)
  int(maxExclusive: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  range(min: number, max: number): number;
}

export function createRng(seed: string | number): Rng {
  const r = seedrandom(String(seed));
  const rng: Rng = {
    next: () => r(),
    int: (n) => Math.floor(r() * n),
    chance: (p) => r() < p,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    shuffle: (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    range: (min, max) => min + r() * (max - min),
  };
  return rng;
}

/** Small deterministic string hash (for MockBrain choices and ids). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
