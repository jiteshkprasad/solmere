/**
 * Small, allocation-free 2D noise toolkit for the procedural terrain and
 * scatter (hash → value noise → fbm → ridged). Deterministic everywhere.
 */

/** 0..1 hash of an integer lattice point */
export function hash2(ix: number, iy: number, seed = 0): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** smooth value noise, -1..1 */
export function vnoise(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fade(fx), v = fade(fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  const r = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  return r * 2 - 1;
}

/** fractal brownian motion, roughly -1..1 */
export function fbm(x: number, y: number, octaves = 4, seed = 0, lacunarity = 2.03, gain = 0.5): number {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f + i * 17.1, y * f - i * 9.7, seed + i);
    norm += amp;
    amp *= gain; f *= lacunarity;
  }
  return sum / norm;
}

/** ridged multifractal 0..1 — sharp crests for rocky ground */
export function ridged(x: number, y: number, octaves = 3, seed = 0): number {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(vnoise(x * f + i * 31.3, y * f + i * 7.7, seed + 100 + i));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5; f *= 2.1;
  }
  return sum / norm;
}
