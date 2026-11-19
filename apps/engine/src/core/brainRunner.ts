import type { World } from "./types.js";

/** Tiny p-limit: at most N brain calls in flight. */
export function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    const fn = queue.shift();
    if (fn) fn();
  };
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(next);
      };
      if (active < max) run();
      else queue.push(run);
    });
  };
}

export const MAX_CONCURRENT_BRAIN_CALLS = 8;
const limit = createLimiter(MAX_CONCURRENT_BRAIN_CALLS);

export function dailyBudgetUsd(): number {
  const n = Number(process.env.DAILY_BUDGET_USD ?? 3);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/**
 * Every brain call goes through here: concurrency-limited, timed, counted, and never throws.
 * On failure the fallback is returned so the sim keeps going.
 */
export function brainCall<T>(w: World, kind: string, npc: string | null, fn: () => Promise<T>, fallback: () => T): Promise<T> {
  const before = w.brain.stats();
  const started = Date.now();
  const p = limit(async () => {
    try {
      const out = await fn();
      record(w, kind, npc, started, true, before.costUsd);
      return out;
    } catch (e) {
      record(w, kind, npc, started, false, before.costUsd, e instanceof Error ? e.message : String(e));
      console.warn(`[brain] ${kind}${npc ? ` (${npc})` : ""} failed: ${e instanceof Error ? e.message : e}`);
      return fallback();
    }
  });
  track(w, p);
  return p;
}

function record(w: World, kind: string, npc: string | null, started: number, ok: boolean, costBefore: number, error?: string): void {
  const after = w.brain.stats();
  const cost = Math.max(0, after.costUsd - costBefore);
  const t = w.llm;
  t.calls += 1;
  if (!ok) t.failures += 1;
  t.costUsd = after.costUsd;
  const k = (t.byKind[kind] ??= { calls: 0, costUsd: 0, failures: 0 });
  k.calls += 1;
  k.costUsd += cost;
  if (!ok) k.failures += 1;
  t.callsToday = after.calls - t.dayCallsBase;
  t.costTodayUsd = Math.max(0, after.costUsd - t.dayCostBase);
  t.last50.push({ kind, npc, day: w.clock.day, hour: Math.floor(w.clock.dayMinutes / 60), ms: Date.now() - started, ok, costUsd: cost, error });
  if (t.last50.length > 50) t.last50.splice(0, t.last50.length - 50);
  w.degraded = t.costTodayUsd > dailyBudgetUsd();
}

/** Register an in-flight task so headless mode can await it. */
export function track(w: World, p: Promise<unknown>): void {
  w.pending.add(p);
  p.finally(() => w.pending.delete(p)).catch(() => {});
}

/** Wait until every in-flight brain task (and tasks they spawn) has settled. */
export async function drain(w: World): Promise<void> {
  while (w.pending.size) await Promise.allSettled([...w.pending]);
}

export function newLlmDay(w: World): void {
  const s = w.brain.stats();
  w.llm.dayCostBase = s.costUsd;
  w.llm.dayCallsBase = s.calls;
  w.llm.callsToday = 0;
  w.llm.costTodayUsd = 0;
  w.degraded = false;
}
