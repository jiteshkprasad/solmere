import type { Metrics } from "@npcworld/schema";
import type { World } from "./types.js";
import { socialMetrics } from "./relationships.js";

const NON_LABOUR_JOBS = new Set(["student", "retiree"]);
const JOBLESS = new Set(["unemployed", "drifter", "odd_jobs"]);

export function gini(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).map((x) => Math.max(0, x)).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return 0;
  const sum = v.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (i + 1) * v[i];
  return (2 * acc) / (n * sum) - (n + 1) / n;
}

/** Mean current price per good across the businesses that sell it (basePrice when nobody does). */
export function priceIndex(w: World): Record<string, number> {
  const out: Record<string, number> = {};
  for (const good of Object.keys(w.content.economy.goods)) {
    const prices: number[] = [];
    for (const b of Object.values(w.businesses)) if (b.prices[good] !== undefined) prices.push(b.prices[good]);
    out[good] = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : w.content.economy.goods[good].basePrice;
  }
  if (w.rentMultiplier !== 1) out.rent = (out.rent ?? 60) * w.rentMultiplier;
  return out;
}

export function cpi(w: World, prices: Record<string, number>): number {
  const basket = w.content.economy.metrics.cpiBasket;
  let now = 0;
  let base = 0;
  for (const [good, qty] of Object.entries(basket)) {
    now += (prices[good] ?? 0) * qty;
    base += (w.content.economy.goods[good]?.basePrice ?? 0) * qty;
  }
  return base > 0 ? now / base : 1;
}

export function computeMetrics(w: World): Metrics {
  const npcs = Object.values(w.npcs);
  const labour = npcs.filter((n) => !NON_LABOUR_JOBS.has(n.job));
  const unemployed = labour.filter((n) => !n.employed || JOBLESS.has(n.job));
  const prices = priceIndex(w);
  const social = socialMetrics(w);
  const wallets = npcs.map((n) => n.wallet);
  const happiness = npcs.reduce((a, n) => a + n.happiness, 0) / Math.max(1, npcs.length);
  const m: Metrics = {
    day: w.clock.day,
    gdpToday: round2(w.gdpToday),
    cpi: round2(cpi(w, prices)),
    unemployment: round2(labour.length ? unemployed.length / labour.length : 0),
    treasury: round2(w.treasury),
    gini: round2(gini(wallets)),
    happiness: round2(happiness),
    loansOutstanding: round2(w.loans.reduce((a, l) => a + l.balance, 0)),
    missedRent: w.missedRentToday,
    missedWages: w.missedWagesToday,
    priceIndex: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, round2(v)])),
    cohesion: round2(social.cohesion),
    lonely: social.lonely,
  };
  return m;
}

export function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
