import type { ActionKind, Needs, NpcState } from "@npcworld/schema";
import type { World } from "./types.js";

export type NeedKey = keyof Needs;
const NEED_KEYS: NeedKey[] = ["food", "rest", "social", "leisure", "purpose"];

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Decay every need by economy.needs decayPerHour; actions restore the need they serve. */
export function stepNeeds(w: World, npc: NpcState, dtMinutes: number): void {
  const h = dtMinutes / 60;
  const cfg = w.content.economy.needs;
  for (const k of NEED_KEYS) {
    const decay = cfg[k]?.decayPerHour ?? 2;
    npc.needs[k] = clamp(npc.needs[k] - decay * h);
  }
  const restore = restoreRates(npc.action);
  for (const k of NEED_KEYS) if (restore[k]) npc.needs[k] = clamp(npc.needs[k] + restore[k] * h);
}

/** points per hour restored while performing an action */
function restoreRates(action: ActionKind): Partial<Needs> {
  switch (action) {
    case "sleep":
      return { rest: 12 };
    case "work":
      return { purpose: 6 };
    case "talk":
      return { social: 25 };
    case "leisure":
      return { leisure: 18, social: 4 };
    case "worship":
      return { purpose: 10, leisure: 4 };
    case "create":
      return { purpose: 12, leisure: 6 };
    case "eat":
      return { food: 40 };
    case "drink":
      return { leisure: 20, social: 6 };
    case "speech":
    case "vote":
      return { purpose: 8, social: 4 };
    case "confess":
      return { leisure: 6 };
    case "sick":
      return { rest: 6 };
    default:
      return { leisure: 2 };
  }
}

/** One-off boost when a purchase/meal happens. */
export function satisfy(npc: NpcState, k: NeedKey, amount: number): void {
  npc.needs[k] = clamp(npc.needs[k] + amount);
}

/** Needs below their critical threshold that have not yet fired a trigger today. */
export function newlyCritical(w: World, npc: NpcState): NeedKey[] {
  const cfg = w.content.economy.needs;
  const rt = w.rt[npc.id];
  const out: NeedKey[] = [];
  for (const k of NEED_KEYS) {
    const crit = cfg[k]?.critical ?? 15;
    if (npc.needs[k] < crit && rt.criticalNeedDay[k] !== w.clock.day) {
      rt.criticalNeedDay[k] = w.clock.day;
      out.push(k);
    }
  }
  return out;
}

export function describeNeeds(n: Needs): string {
  return NEED_KEYS.map((k) => `${k} ${Math.round(n[k])}`).join(", ");
}
