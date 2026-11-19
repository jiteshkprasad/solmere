import type { BusinessState, NpcState } from "@npcworld/schema";
import type { World } from "./types.js";
import { emit } from "./eventlog.js";
import { addMemory } from "./memory.js";
import { bizAcct, npcAcct, OUTSIDE, purchase, round, transfer, TREASURY, type Account } from "./ledger.js";
import { satisfy } from "./needs.js";
import { isService } from "./world.js";

/** units of output per unit of input for goods with a `from` chain (see NOTES-core.md) */
const YIELD: Record<string, number> = { fish: 5, bread: 12, pastry: 5, beer_wholesale: 2, beer: 12, clothes: 2, goods: 8, furniture: 1 };
/** units produced per worker-hour at a producing workplace */
const PRODUCE_RATE: Record<string, number> = { fish_raw: 0.5, grain: 0.8, fruit: 0.7 };
const FOOD_PRIORITY = ["meal", "snack", "bread", "pastry", "fish", "fruit"];
const FOOD_VALUE: Record<string, number> = { meal: 55, snack: 30, bread: 30, pastry: 25, fish: 35, fruit: 20 };
const NOT_SHOPPABLE = new Set(["loan", "rent", "lodging", "treatment", "beer_wholesale", "goods_wholesale", "fish_raw"]);
const INPUT_TARGET = 8;
const MARKET_MAX_CRATES = 9;
/** expected off-screen customers per open hour per business (the outside market buying retail) */
const WALK_IN_PER_HOUR = 0.5;
const OUTPUT_TARGET = 10;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export function isOpen(w: World, locId: string): boolean {
  const loc = w.content.locations[locId];
  if (!loc) return false;
  for (const e of w.effects) if (e.closeLocations?.includes(locId)) return false;
  if (!loc.hours) return loc.type !== "business";
  const [open, close] = loc.hours;
  const h = w.clock.dayMinutes / 60;
  if (open === 0 && close === 24) return true;
  return close < open ? h >= open || h < close : h >= open && h < close;
}

export function produceMultiplier(w: World, locId: string): number {
  let m = 1;
  for (const e of w.effects) if (e.produceMultiplier?.[locId] !== undefined) m *= e.produceMultiplier[locId];
  return m;
}

export function demandMultiplier(w: World, locId: string): number {
  let m = 1;
  for (const e of w.effects) if (e.demandMultiplier?.[locId] !== undefined) m *= e.demandMultiplier[locId];
  if (w.festivalDay === w.clock.day) m *= 1.5;
  return m;
}

function outsideCapMultiplier(w: World): number {
  let m = 1;
  for (const e of w.effects) if (e.outsideMarketCapMultiplier) m *= e.outsideMarketCapMultiplier;
  return m;
}

function outsidePriceMultiplier(w: World, good: string): number {
  let m = 1;
  for (const e of w.effects) if (e.outsideMarketPriceMultiplier?.[good]) m *= e.outsideMarketPriceMultiplier[good];
  return m;
}

function importBlocked(w: World, good: string): boolean {
  return w.effects.some((e) => e.importBlocked?.includes(good));
}

export function priceOf(w: World, bizId: string, good: string): number {
  return w.businesses[bizId]?.prices[good] ?? w.content.economy.goods[good]?.basePrice ?? 0;
}

function staffed(w: World, bizId: string): boolean {
  const b = w.businesses[bizId];
  if (!b) return false;
  const ids = [b.owner, ...b.employees];
  return ids.some((id) => w.npcs[id] && w.npcs[id].locationId === bizId && !w.npcs[id].targetLocationId && w.npcs[id].action === "work");
}

export function workersAt(w: World, locId: string): NpcState[] {
  return Object.values(w.npcs).filter((n) => n.locationId === locId && !n.targetLocationId && n.action === "work");
}

/* ------------------------------------------------------------------ */
/* hourly production / trade                                           */
/* ------------------------------------------------------------------ */

/** Harbour dues and regional transfers: a daily trickle into the treasury (see NOTES-core.md). */
export function treasuryDues(w: World): void {
  const daily = Number(process.env.TREASURY_DAILY_GRANT ?? Math.round(w.content.economy.treasury.publicPayrollPerDay * 0.45));
  if (daily > 0) transfer(w, OUTSIDE, TREASURY, daily, { trade: false });
}

/** Called once per sim-hour. */
export function economyHour(w: World): void {
  for (const b of Object.values(w.businesses)) b.open = isOpen(w, b.locationId) && staffed(w, b.locationId);
  produce(w);
  marketBuysCatch(w);
  busking(w);
  for (const b of Object.values(w.businesses)) {
    if (!b.open) continue;
    restock(w, b);
    convert(w, b);
    walkInDemand(w, b);
  }
}

function produce(w: World): void {
  for (const loc of w.content.town.locations) {
    if (!loc.produces?.length) continue;
    const workers = workersAt(w, loc.id);
    if (!workers.length) continue;
    const mult = produceMultiplier(w, loc.id);
    if (mult <= 0) continue;
    const biz = w.businesses[loc.id];
    for (const good of loc.produces) {
      const rate = (PRODUCE_RATE[good] ?? 0.4) * mult;
      if (biz) {
        biz.inventory[good] = round((biz.inventory[good] ?? 0) + rate * workers.length);
      } else {
        // town-owned workplace (the docks): output belongs to each worker or their employer
        for (const n of workers) {
          const employer = w.content.npcs[n.id]?.employer;
          const owner = employer && w.npcs[employer] ? employer : n.id;
          const stock = w.rt[owner].stock;
          stock[good] = round((stock[good] ?? 0) + rate);
        }
      }
    }
  }
}

/** The fish market buys every crate the fishers have, while it is open and can pay. */
function marketBuysCatch(w: World): void {
  const market = w.businesses.fish_market;
  if (!market || !market.open) return;
  const unit = round(w.content.economy.goods.fish_raw.basePrice * 0.9);
  for (const [fisherId, stock] of Object.entries(w.rt).map(([id, r]) => [id, r.stock] as const)) {
    const crates = Math.floor(stock.fish_raw ?? 0);
    if (crates <= 0) continue;
    // the market only takes what it can shift before it spoils; the rest goes to the outside buyer at the floor price
    const room = Math.floor(MARKET_MAX_CRATES - w.outside.marketCratesToday);
    const affordable = Math.min(crates, room, Math.floor(market.account / unit));
    if (affordable <= 0) continue;
    const total = round(affordable * unit);
    if (!transfer(w, bizAcct("fish_market"), npcAcct(fisherId), total)) continue;
    stock.fish_raw = round(stock.fish_raw - affordable);
    w.outside.marketCratesToday += affordable;
    market.inventory.fish_raw = round((market.inventory.fish_raw ?? 0) + affordable);
    const sym = w.content.economy.currency.symbol;
    emit(w, "transaction", `${w.npcs[fisherId].name} sells ${affordable} crates of catch to the Fish Market for ${sym}${total}.`, {
      actors: [fisherId, "devendra_rao"], locationId: "fish_market", importance: 2, drama: 1, quiet: true, data: { good: "fish_raw", qty: affordable, total },
    });
  }
}

function localSellers(w: World, good: string, except: string): BusinessState[] {
  return Object.values(w.businesses).filter((b) => {
    if (b.locationId === except) return false;
    const loc = w.content.locations[b.locationId];
    const offers = loc.sells?.includes(good) || loc.produces?.includes(good);
    return offers && (b.inventory[good] ?? 0) >= 1;
  }).sort((a, b) => priceOf(w, a.locationId, good) - priceOf(w, b.locationId, good));
}

function restock(w: World, b: BusinessState): void {
  const loc = w.content.locations[b.locationId];
  for (const good of loc.buys ?? []) {
    const have = b.inventory[good] ?? 0;
    if (have >= INPUT_TARGET / 2) continue;
    let want = INPUT_TARGET - have;
    for (const seller of localSellers(w, good, b.locationId)) {
      if (want <= 0) break;
      const qty = Math.min(want, Math.floor(seller.inventory[good]));
      if (qty <= 0) continue;
      const price = priceOf(w, seller.locationId, good);
      if (b.prices[good] !== undefined && price >= b.prices[good] * 0.9) break; // no margin in it
      if (!transfer(w, bizAcct(b.locationId), bizAcct(seller.locationId), qty * price)) break;
      seller.inventory[good] = round(seller.inventory[good] - qty);
      b.inventory[good] = round((b.inventory[good] ?? 0) + qty);
      want -= qty;
    }
    if (want > 0) importFromOutside(w, b, good, want);
  }
}

/** Off-screen market: sells imports at basePrice (x event multiplier), other goods at the ceiling. */
function importFromOutside(w: World, b: BusinessState, good: string, qty: number): void {
  const g = w.content.economy.goods[good];
  if (!g || importBlocked(w, good)) return;
  const cap = w.content.economy.outsideMarket.dailyImportCap * outsideCapMultiplier(w);
  const room = Math.floor(cap - w.outside.importedToday);
  qty = Math.min(qty, room);
  if (qty <= 0) return;
  const mult = g.import ? 1 : w.content.economy.outsideMarket.sellCeilingMultiplier;
  const unit = round(g.basePrice * mult * outsidePriceMultiplier(w, good));
  const affordable = Math.min(qty, Math.floor(b.account / unit));
  if (affordable <= 0) return;
  if (!transfer(w, bizAcct(b.locationId), OUTSIDE, affordable * unit)) return;
  b.inventory[good] = round((b.inventory[good] ?? 0) + affordable);
  w.outside.importedToday += affordable;
}

function convert(w: World, b: BusinessState): void {
  const loc = w.content.locations[b.locationId];
  for (const out of loc.sells ?? []) {
    const from = w.content.economy.goods[out]?.from;
    if (!from) continue;
    let batches = 2;
    while (batches-- > 0 && (b.inventory[out] ?? 0) < OUTPUT_TARGET && (b.inventory[from] ?? 0) >= 1) {
      b.inventory[from] = round(b.inventory[from] - 1);
      b.inventory[out] = round((b.inventory[out] ?? 0) + (YIELD[out] ?? 1));
    }
  }
}

/** Off-screen customers (sailors, visitors, farms out of town) keep every shop's till moving. */
function walkInDemand(w: World, b: BusinessState): void {
  const loc = w.content.locations[b.locationId];
  const goods = (loc.sells ?? []).filter((g) => !NOT_SHOPPABLE.has(g) && g !== "loan" && g !== "rent");
  if (!goods.length) return;
  const good = w.rng.pick(goods);
  // cheap goods sell in volume, dear ones rarely: scale by sqrt(12 / price)
  const scale = Math.sqrt(12 / Math.max(1, priceOf(w, b.locationId, good)));
  const expected = WALK_IN_PER_HOUR * scale * demandMultiplier(w, b.locationId) * outsideCapMultiplier(w);
  let sales = Math.floor(expected);
  if (w.rng.chance(expected - sales)) sales += 1;
  for (let i = 0; i < sales; i++) sell(w, b, good, 1, OUTSIDE);
}

/** Sell `qty` of `good` from business stock to `buyer`. Services are made to order. Returns total paid or -1. */
export function sell(w: World, b: BusinessState, good: string, qty: number, buyer: Account): number {
  const service = isService(w.content, good);
  if (!service && (b.inventory[good] ?? 0) < qty) return -1;
  const price = priceOf(w, b.locationId, good);
  const total = round(price * qty);
  if (!transfer(w, buyer, bizAcct(b.locationId), total)) return -1;
  if (buyer.kind === "outside") w.gdpToday = round(w.gdpToday + total);
  if (service) consumeIngredients(w, b, good, total);
  else b.inventory[good] = round(b.inventory[good] - qty);
  return total;
}

/** A meal or coffee uses up something the business bought, or costs a share of the price. */
function consumeIngredients(w: World, b: BusinessState, good: string, total: number): void {
  const loc = w.content.locations[b.locationId];
  const inputs = (loc.buys ?? []).filter((g) => (b.inventory[g] ?? 0) >= 0.5);
  if (inputs.length && ["meal", "snack"].includes(good)) {
    const g = w.rng.pick(inputs);
    b.inventory[g] = round(b.inventory[g] - 0.25);
    return;
  }
  transfer(w, bizAcct(b.locationId), OUTSIDE, round(total * 0.3));
}

/* ------------------------------------------------------------------ */
/* NPC actions with money                                              */
/* ------------------------------------------------------------------ */

export function npcEat(w: World, npc: NpcState): void {
  const loc = w.content.locations[npc.locationId];
  if (!loc) return;
  if (loc.type === "home" || !w.businesses[npc.locationId]) {
    if (loc.type === "home") buyGroceries(w, npc);
    satisfy(npc, "food", loc.type === "home" ? 35 : 15);
    return;
  }
  const b = w.businesses[npc.locationId];
  const good = FOOD_PRIORITY.find((g) => loc.sells?.includes(g) && (isService(w.content, g) || (b.inventory[g] ?? 0) >= 1));
  if (!good) {
    addMemory(w, npc.id, "observation", `${loc.name} had nothing to eat when I got there.`, 2);
    return;
  }
  if (!buyOrRemember(w, npc, b, good, 1)) return;
  satisfy(npc, "food", FOOD_VALUE[good] ?? 30);
}

/** A home meal is cooked from something bought earlier: one unit from the cheapest local food seller. */
function buyGroceries(w: World, npc: NpcState): void {
  const sellers = Object.values(w.businesses)
    .map((b) => ({ b, good: ["bread", "fish", "fruit", "grain"].find((g) => (w.content.locations[b.locationId].sells ?? []).includes(g) && (b.inventory[g] ?? 0) >= 1) }))
    .filter((x): x is { b: BusinessState; good: string } => !!x.good)
    .sort((x, y) => priceOf(w, x.b.locationId, x.good) - priceOf(w, y.b.locationId, y.good));
  const pick = sellers[(w.clock.day + npc.id.length) % Math.max(1, sellers.length)];
  if (!pick) return;
  const price = priceOf(w, pick.b.locationId, pick.good);
  if (npc.wallet < price) return;
  purchase(w, npc.id, pick.b.locationId, pick.good, 1, price);
}

export function npcDrink(w: World, npc: NpcState): void {
  const loc = w.content.locations[npc.locationId];
  const b = w.businesses[npc.locationId];
  if (!loc || !b) {
    satisfy(npc, "leisure", 10);
    return;
  }
  const good = ["beer", "coffee", "tea"].find((g) => loc.sells?.includes(g) && (isService(w.content, g) || (b.inventory[g] ?? 0) >= 1));
  if (!good) return;
  if (buyOrRemember(w, npc, b, good, 1)) satisfy(npc, "leisure", 20);
}

export function npcShop(w: World, npc: NpcState): void {
  const loc = w.content.locations[npc.locationId];
  const b = w.businesses[npc.locationId];
  if (!loc || !b) return;
  const candidates = (loc.sells ?? []).filter((g) => !NOT_SHOPPABLE.has(g) && (isService(w.content, g) || (b.inventory[g] ?? 0) >= 1));
  const affordable = candidates.filter((g) => priceOf(w, b.locationId, g) <= npc.wallet / 4);
  if (!affordable.length) {
    if (candidates.length) addMemory(w, npc.id, "observation", `Looked at the prices at ${loc.name} and walked out. Can't afford it right now.`, 3);
    return;
  }
  const good = affordable.sort((x, y) => priceOf(w, b.locationId, x) - priceOf(w, b.locationId, y))[0];
  if (buyOrRemember(w, npc, b, good, 1)) {
    if (FOOD_VALUE[good]) satisfy(npc, "food", FOOD_VALUE[good]);
    else satisfy(npc, "leisure", 12);
  }
}

function buyOrRemember(w: World, npc: NpcState, b: BusinessState, good: string, qty: number): boolean {
  if (!isOpen(w, b.locationId)) {
    addMemory(w, npc.id, "observation", `${w.content.locations[b.locationId].name} was closed.`, 2);
    return false;
  }
  const price = priceOf(w, b.locationId, good);
  const total = round(price * qty);
  const label = w.content.economy.goods[good]?.label.toLowerCase() ?? good;
  if (npc.wallet < total) {
    const sym = w.content.economy.currency.symbol;
    addMemory(w, npc.id, "observation", `Couldn't afford ${label} at ${w.content.locations[b.locationId].name} (${sym}${total}; I have ${sym}${Math.floor(npc.wallet)}).`, 5);
    return false;
  }
  if (isService(w.content, good)) return sell(w, b, good, qty, npcAcct(npc.id)) >= 0 && (logSale(w, npc, b, good, qty, total), true);
  return purchase(w, npc.id, b.locationId, good, qty, price);
}

function logSale(w: World, npc: NpcState, b: BusinessState, good: string, qty: number, total: number): void {
  const label = w.content.economy.goods[good]?.label.toLowerCase() ?? good;
  const sym = w.content.economy.currency.symbol;
  emit(w, "transaction", `${npc.name} buys ${qty} ${label} at ${w.content.locations[b.locationId].name} for ${sym}${total}.`, {
    actors: [npc.id], locationId: b.locationId, importance: 1, drama: 1, quiet: true, data: { good, qty, total, business: b.locationId },
  });
}

/* ------------------------------------------------------------------ */
/* wages, owner draws, perishing, daily reset                          */
/* ------------------------------------------------------------------ */

export function wageFor(w: World, npc: NpcState): number {
  const wages = w.content.economy.wages;
  const employer = w.content.npcs[npc.id]?.employer;
  if (employer && w.businesses[employer]?.wageOverrides?.[npc.id] !== undefined) return w.businesses[employer].wageOverrides![npc.id];
  return wages.public[npc.job] ?? wages.private[npc.job] ?? 35;
}

export function employerAccount(w: World, npc: NpcState): Account | null {
  const employer = w.content.npcs[npc.id]?.employer;
  if (!employer || employer === "self") return null;
  if (employer === "town") return TREASURY;
  if (w.businesses[employer]) return bizAcct(employer);
  if (w.npcs[employer]) return npcAcct(employer);
  return null;
}

/** Pay today's wage once, at the end of the shift. Missing money becomes a wage_missed event. */
export function payWage(w: World, npc: NpcState): void {
  const rt = w.rt[npc.id];
  if (rt.wagePaidDay === w.clock.day || !npc.employed || rt.fired) return;
  const acct = employerAccount(w, npc);
  if (!acct) return;
  rt.wagePaidDay = w.clock.day;
  const wage = wageFor(w, npc);
  const sym = w.content.economy.currency.symbol;
  const employerName = acct.kind === "treasury" ? "the town" : acct.kind === "business" ? w.content.locations[acct.id].name : acct.kind === "npc" ? w.npcs[acct.id].name : "someone";
  if (transfer(w, acct, npcAcct(npc.id), wage, { trade: acct.kind !== "treasury" })) {
    emit(w, "wage", `${npc.name} is paid ${sym}${wage} by ${employerName}.`, { actors: [npc.id], locationId: npc.workplace, importance: 1, quiet: true, data: { wage } });
  } else {
    w.missedWagesToday += 1;
    const employerId = acct.kind === "business" ? w.businesses[acct.id].owner : acct.kind === "npc" ? acct.id : w.election.mayor;
    emit(w, "wage_missed", `${employerName} could not pay ${npc.name}'s wage of ${sym}${wage} today.`, {
      actors: [npc.id, employerId], locationId: npc.workplace, importance: 7, data: { wage },
    });
    rt.triggers.push(`Your wage of ${sym}${wage} was NOT paid today by ${employerName}.`);
  }
}

const PENSION_PER_DAY = 22;
const ALLOWANCE_PER_DAY = 8;
const JOURNALIST_FEE = 40;
const JOBLESS = new Set(["unemployed", "drifter", "odd_jobs"]);

/**
 * Non-wage incomes, once a day: retirees draw a town pension, students get an allowance from
 * the richest member of their household, the jobless pick up odd-job money, the journalist is
 * paid per edition. Keeps people who have no employer from starving in week two.
 */
export function dailyIncomes(w: World): void {
  const sym = w.content.economy.currency.symbol;
  for (const npc of Object.values(w.npcs)) {
    const me = w.content.npcs[npc.id];
    if (npc.job === "retiree") {
      if (transfer(w, TREASURY, npcAcct(npc.id), PENSION_PER_DAY, { trade: false })) emit(w, "wage", `${npc.name} collects the ${sym}${PENSION_PER_DAY} town pension.`, { actors: [npc.id], locationId: "town_hall", importance: 1, quiet: true, data: { wage: PENSION_PER_DAY } });
      else w.rt[npc.id].triggers.push(`The town could not pay your pension today.`);
    } else if (npc.job === "student") {
      const family = Object.values(w.npcs).filter((o) => o.id !== npc.id && w.content.npcs[o.id].household === me.household && o.wallet > 60).sort((a, b) => b.wallet - a.wallet)[0];
      if (family) transfer(w, npcAcct(family.id), npcAcct(npc.id), ALLOWANCE_PER_DAY, { trade: false });
    } else if (JOBLESS.has(npc.job) || (!npc.employed && !Object.values(w.businesses).some((b) => b.owner === npc.id) && me.employer === null)) {
      const earned = w.rng.int(17);
      if (earned > 0) transfer(w, OUTSIDE, npcAcct(npc.id), earned, { trade: false });
    } else if (npc.job === "journalist" && w.papers.some((p) => p.day === w.clock.day - 1)) {
      transfer(w, OUTSIDE, npcAcct(npc.id), JOURNALIST_FEE, { trade: false });
      emit(w, "wage", `${npc.name} is paid ${sym}${JOURNALIST_FEE} for today's Herald.`, { actors: [npc.id], locationId: "cafe", importance: 1, quiet: true, data: { wage: JOURNALIST_FEE } });
    }
  }
}

/** Hourly: a musician or painter working in public collects small tips from whoever is there. */
export function busking(w: World): void {
  for (const npc of Object.values(w.npcs)) {
    if (npc.action !== "create" || npc.targetLocationId) continue;
    const loc = w.content.locations[npc.locationId];
    if (!loc || loc.type === "home" || loc.id === "studio") continue;
    let tips = 0;
    for (const other of Object.values(w.npcs)) {
      if (other.id === npc.id || other.locationId !== npc.locationId || other.targetLocationId || other.wallet < 20) continue;
      if (w.rng.chance(0.5) && transfer(w, npcAcct(other.id), npcAcct(npc.id), 1)) tips += 1;
    }
    if (tips > 0) satisfy(npc, "purpose", tips * 2);
  }
}

/** Money moves inside a household: nobody starves while a spouse has savings, and an owner keeps the shop stocked from their own pocket. */
export function householdSupport(w: World): void {
  for (const npc of Object.values(w.npcs)) {
    if (npc.wallet >= 15) continue;
    const me = w.content.npcs[npc.id];
    const donor = Object.values(w.npcs).filter((o) => o.id !== npc.id && w.content.npcs[o.id].household === me.household && o.wallet > 200).sort((a, b) => b.wallet - a.wallet)[0];
    if (donor) transfer(w, npcAcct(donor.id), npcAcct(npc.id), 30, { trade: false });
  }
  for (const b of Object.values(w.businesses)) {
    const owner = w.npcs[b.owner];
    if (owner && b.account < 60 && owner.wallet > 120) transfer(w, npcAcct(owner.id), bizAcct(b.locationId), round(Math.min(owner.wallet * 0.4, 150)), { trade: false });
  }
}

/** Owners take a draw from the day's profit (no fixed wage). */
export function ownerDraws(w: World): void {
  const sym = w.content.economy.currency.symbol;
  for (const b of Object.values(w.businesses)) {
    const owner = w.npcs[b.owner];
    if (!owner) continue;
    const profit = b.revenueToday - b.costsToday;
    let draw = profit > 0 ? Math.min(profit * 0.6, b.account - 100) : 0;
    if (owner.wallet < 40 && b.account > 200) draw = Math.max(draw, 30);
    draw = round(Math.max(0, draw));
    if (draw > 0 && transfer(w, bizAcct(b.locationId), npcAcct(owner.id), draw, { trade: false })) {
      addMemory(w, owner.id, "observation", `Took ${sym}${draw} out of ${w.content.locations[b.locationId].name} today (revenue ${sym}${round(b.revenueToday)}, costs ${sym}${round(b.costsToday)}).`, 2);
    } else if (profit < -50) {
      addMemory(w, owner.id, "observation", `${w.content.locations[b.locationId].name} lost ${sym}${round(-profit)} today. Account: ${sym}${round(b.account)}.`, 5);
    }
  }
}

export function perishStock(w: World): void {
  const goods = w.content.economy.goods;
  const decay = (inv: Record<string, number>) => {
    for (const [g, qty] of Object.entries(inv)) {
      const p = goods[g]?.perishDays ?? 0;
      if (p <= 0 || qty <= 0) continue;
      inv[g] = round(qty * (1 - 1 / p));
    }
  };
  for (const b of Object.values(w.businesses)) decay(b.inventory);
  for (const r of Object.values(w.rt)) decay(r.stock);
}

/** Producers sell surplus to the outside market at the floor price (export cap per day). */
export function exportSurplus(w: World): void {
  const eco = w.content.economy;
  const cap = eco.outsideMarket.dailyExportCap * outsideCapMultiplier(w);
  for (const b of Object.values(w.businesses)) {
    const loc = w.content.locations[b.locationId];
    for (const good of loc.produces ?? []) {
      const surplus = Math.floor((b.inventory[good] ?? 0) - 30);
      const qty = Math.min(surplus, Math.floor(cap - w.outside.exportedToday));
      if (qty <= 0) continue;
      const unit = round(eco.goods[good].basePrice * eco.outsideMarket.buyFloorMultiplier * outsidePriceMultiplier(w, good));
      transfer(w, OUTSIDE, bizAcct(b.locationId), qty * unit);
      b.inventory[good] = round(b.inventory[good] - qty);
      w.outside.exportedToday += qty;
    }
  }
  for (const [id, r] of Object.entries(w.rt)) {
    const crates = Math.floor(r.stock.fish_raw ?? 0);
    if (crates <= 0) continue;
    const unit = round(eco.goods.fish_raw.basePrice * eco.outsideMarket.buyFloorMultiplier);
    transfer(w, OUTSIDE, npcAcct(id), crates * unit);
    r.stock.fish_raw = round(r.stock.fish_raw - crates);
  }
}

/** New sim-day: close the books. */
export function economyNewDay(w: World): void {
  for (const b of Object.values(w.businesses)) {
    b.pnlHistory.push({ day: w.clock.day - 1, revenue: round(b.revenueToday), costs: round(b.costsToday) });
    if (b.pnlHistory.length > 60) b.pnlHistory.splice(0, b.pnlHistory.length - 60);
    b.revenueToday = 0;
    b.costsToday = 0;
  }
  w.outside = { importedToday: 0, exportedToday: 0, marketCratesToday: 0 };
  w.gdpToday = 0;
  w.missedRentToday = 0;
  w.missedWagesToday = 0;
  for (const r of Object.values(w.rt)) {
    r.workedToday = false;
    r.reactsToday = 0;
  }
}
