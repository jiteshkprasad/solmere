import type { World } from "./types.js";
import { emit } from "./eventlog.js";

/** Money accounts: npc wallet, business account, the treasury, or the off-screen outside market. */
export type Account = { kind: "npc"; id: string } | { kind: "business"; id: string } | { kind: "treasury" } | { kind: "outside" };

export const npcAcct = (id: string): Account => ({ kind: "npc", id });
export const bizAcct = (id: string): Account => ({ kind: "business", id });
export const TREASURY: Account = { kind: "treasury" };
export const OUTSIDE: Account = { kind: "outside" };

export function balance(w: World, a: Account): number {
  switch (a.kind) {
    case "npc":
      return w.npcs[a.id]?.wallet ?? 0;
    case "business":
      return w.businesses[a.id]?.account ?? 0;
    case "treasury":
      return w.treasury;
    case "outside":
      return Number.POSITIVE_INFINITY;
  }
}

function adjust(w: World, a: Account, delta: number, revenue: boolean): void {
  switch (a.kind) {
    case "npc":
      if (w.npcs[a.id]) w.npcs[a.id].wallet = round(w.npcs[a.id].wallet + delta);
      return;
    case "business": {
      const b = w.businesses[a.id];
      if (!b) return;
      b.account = round(b.account + delta);
      if (revenue) {
        if (delta > 0) b.revenueToday = round(b.revenueToday + delta);
        else b.costsToday = round(b.costsToday - delta);
      }
      return;
    }
    case "treasury":
      w.treasury = round(w.treasury + delta);
      return;
    case "outside":
      return;
  }
}

export const round = (n: number) => Math.round(n * 100) / 100;

export interface TransferOpts {
  /** counts toward GDP (default true) and business revenue/costs */
  trade?: boolean;
  /** allow the payer to go negative (never for npcs/businesses by default) */
  allowNegative?: boolean;
}

/** Move money. Returns false (and moves nothing) when the payer cannot cover it. */
export function transfer(w: World, from: Account, to: Account, amount: number, opts: TransferOpts = {}): boolean {
  amount = round(amount);
  if (!(amount > 0)) return true;
  if (!opts.allowNegative && from.kind !== "outside" && balance(w, from) < amount) return false;
  const trade = opts.trade !== false;
  adjust(w, from, -amount, trade);
  adjust(w, to, amount, trade);
  if (trade && from.kind !== "outside" && to.kind !== "outside") w.gdpToday = round(w.gdpToday + amount);
  return true;
}

/** A visible purchase: npc buys `qty` of `good` from a business. Emits a quiet transaction event. */
export function purchase(w: World, npcId: string, bizId: string, good: string, qty: number, unitPrice: number): boolean {
  const total = round(unitPrice * qty);
  if (!transfer(w, npcAcct(npcId), bizAcct(bizId), total)) return false;
  const b = w.businesses[bizId];
  if (b.inventory[good] !== undefined) b.inventory[good] = Math.max(0, b.inventory[good] - qty);
  const label = w.content.economy.goods[good]?.label ?? good;
  const sym = w.content.economy.currency.symbol;
  emit(w, "transaction", `${w.npcs[npcId].name} buys ${qty} ${label.toLowerCase()} at ${w.content.locations[bizId].name} for ${sym}${total}.`, {
    actors: [npcId],
    locationId: bizId,
    importance: 1,
    drama: 1,
    data: { good, qty, total, business: bizId },
    quiet: true,
  });
  return true;
}
