import type { EventCard, Policy } from "@npcworld/schema";
import type { ActiveEffect, World } from "./types.js";
import { emit } from "./eventlog.js";
import { addMemory } from "./memory.js";
import { bizAcct, npcAcct, OUTSIDE, round, transfer, TREASURY } from "./ledger.js";
import { collectTax } from "./finance.js";
import { addGossip } from "./relationships.js";
import { endConversationsOf } from "./conversations.js";

const MAX_CARDS_PER_DAY = 2;

/** 06:00 every day: draw from the deck per events.json rules. */
export function drawDailyEvents(w: World): void {
  const deck = w.content.events.deck;
  let fired = 0;
  // scheduled cards (everyNDays) first, then the random ones
  const drama = deck.filter((c) => c.kind !== "everyday");
  const ordered = [...drama.filter((c) => c.everyNDays), ...w.rng.shuffle(drama.filter((c) => !c.everyNDays))];
  for (const card of ordered) {
    if (fired >= MAX_CARDS_PER_DAY) break;
    if (!cardEligible(w, card)) continue;
    if (card.everyNDays) {
      if (w.clock.day % card.everyNDays !== 0) continue;
      fireCard(w, card); // scheduled cards (tax day) don't use up the daily random slots
      continue;
    }
    if (!w.rng.chance(card.weight / 100)) continue;
    fireCard(w, card);
    fired++;
  }
  drawEverydayEvents(w);
}

const lastFiredByWorld = new WeakMap<World, Map<string, number>>();

/** Small village news: one card every day, sometimes two, never the same card twice in a week. */
function drawEverydayEvents(w: World): void {
  const last = lastFiredByWorld.get(w) ?? new Map<string, number>();
  lastFiredByWorld.set(w, last);
  const pool = w.content.events.deck.filter((c) => c.kind === "everyday" && w.clock.day - (last.get(c.id) ?? -99) >= 7);
  const n = w.rng.chance(0.5) ? 2 : 1;
  for (let i = 0; i < n && pool.length; i++) {
    const total = pool.reduce((a, c) => a + c.weight, 0);
    let r = w.rng.next() * total;
    const idx = pool.findIndex((c) => (r -= c.weight) <= 0);
    const card = pool.splice(Math.max(0, idx), 1)[0];
    last.set(card.id, w.clock.day);
    fireCard(w, card);
  }
}

/** Fill {name}/{name2} in an everyday card with random awake people and make them the card's targets. */
function personalise(w: World, card: EventCard): EventCard {
  const n = typeof card.effects.randomTargets === "number" ? card.effects.randomTargets : 0;
  const effects = { ...card.effects };
  delete effects.randomTargets;
  if (effects.gathering && typeof effects.gathering === "object" && (effects.gathering as { npcs: unknown }).npcs === "any") {
    // an everyday gathering draws a crowd, not the whole town
    const crowd = w.rng.shuffle(Object.keys(w.npcs).filter((id) => w.npcs[id].sickDays === 0)).slice(0, 8 + w.rng.int(5));
    effects.gathering = { ...(effects.gathering as object), npcs: crowd };
  }
  if (!n) return { ...card, effects };
  const people = w.rng.shuffle(Object.keys(w.npcs).filter((id) => w.npcs[id].sickDays === 0)).slice(0, n);
  let text = card.text;
  people.forEach((id, i) => { text = text.replaceAll(i === 0 ? "{name}" : `{name${i + 1}}`, w.npcs[id].name); });
  return { ...card, text, targets: people, effects };
}

function cardEligible(w: World, card: EventCard): boolean {
  if (card.once && w.firedOnce.has(card.id)) return false;
  if (card.requiresFlag && !w.flags.has(card.requiresFlag)) return false;
  if (card.requiresDay && w.clock.day < card.requiresDay) return false;
  if (w.effects.some((e) => e.cardId === card.id)) return false;
  return true;
}

export function fireCard(w: World, raw: EventCard): void {
  const card = raw.kind === "everyday" ? personalise(w, raw) : raw;
  if (card.once) w.firedOnce.add(card.id);
  const audience = broadcastAudience(w, card.broadcast);
  const targets = (card.targets ?? []).filter((t) => w.npcs[t]);
  emit(w, "world_event", card.text, {
    actors: targets,
    locationId: Array.isArray(card.broadcast) ? card.broadcast.find((b) => w.content.locations[b]) ?? null : "town_square",
    drama: card.drama,
    importance: Math.max(3, card.drama - 1),
    witnesses: audience.filter((id) => !targets.includes(id)),
    data: { cardId: card.id, title: card.title },
  });
  for (const t of targets) {
    addMemory(w, t, "event", card.text, 8, targets);
    w.rt[t].triggers.push(`EVENT: ${card.title} — ${card.text}`);
  }
  applyEffects(w, card.effects, { cardId: card.id, title: card.title });
}

/** Everyone in town, or NPCs whose current/work/home location (or district) is listed. */
export function broadcastAudience(w: World, b: EventCard["broadcast"]): string[] {
  const all = Object.keys(w.npcs);
  if (b === "town") return all;
  const set = new Set(b);
  return all.filter((id) => {
    const n = w.npcs[id];
    for (const locId of [n.locationId, n.workplace, n.home]) {
      const loc = w.content.locations[locId];
      if (!loc) continue;
      if (set.has(locId) || set.has(loc.district)) return true;
    }
    return false;
  });
}

/** Apply a card's or policy's effects. Everything used by content/events.json is implemented here. */
export function applyEffects(w: World, effects: Record<string, unknown>, src: { cardId: string; title: string }): void {
  const sym = w.content.economy.currency.symbol;
  const duration = typeof effects.durationDays === "number" ? effects.durationDays : 0;
  const timed: ActiveEffect = { cardId: src.cardId, title: src.title, endsDay: w.clock.day + Math.max(0, duration - 1) };
  let hasTimed = false;
  for (const key of ["produceMultiplier", "demandMultiplier", "closeLocations", "outsideMarketPriceMultiplier", "outsideMarketCapMultiplier", "importBlocked"] as const) {
    if (effects[key] !== undefined) {
      (timed as unknown as Record<string, unknown>)[key] = effects[key];
      hasTimed = true;
    }
  }
  if (hasTimed) {
    if (duration === 0) timed.endsDay = w.clock.day;
    w.effects.push(timed);
    for (const locId of timed.closeLocations ?? []) for (const n of Object.values(w.npcs)) if (n.locationId === locId) w.rt[n.id].triggers.push(`${w.content.locations[locId]?.name ?? locId} is closed today (${src.title}).`);
  }
  if (typeof effects.moodDelta === "number") {
    for (const n of Object.values(w.npcs)) n.happiness = Math.max(0, Math.min(100, n.happiness + effects.moodDelta));
  }
  if (typeof effects.treasuryCost === "number") {
    const to = typeof effects.contract === "string" && w.businesses[effects.contract] ? bizAcct(effects.contract) : OUTSIDE;
    transfer(w, TREASURY, to, effects.treasuryCost, { trade: false, allowNegative: true });
    if (to.kind === "business") emit(w, "transaction", `The town pays ${sym}${effects.treasuryCost} to ${w.content.locations[to.id].name} under a council contract.`, { actors: [w.businesses[to.id].owner, w.election.mayor], locationId: "town_hall", importance: 6, drama: 5 });
  }
  if (typeof effects.scheduleFestivalInDays === "number") {
    w.festivalDay = w.clock.day + effects.scheduleFestivalInDays;
    w.gatherings.push({ day: w.festivalDay, hour: 18, location: "town_square", npcs: "any", reason: "the Tide Festival", done: false });
  }
  if (effects.randomSick && typeof effects.randomSick === "object") {
    const { count = 3, days = 2 } = effects.randomSick as { count?: number; days?: number };
    const pool = w.rng.shuffle(Object.values(w.npcs).filter((n) => n.sickDays === 0));
    for (const n of pool.slice(0, count)) {
      n.sickDays = days;
      endConversationsOf(w, n.id);
      emit(w, "sick", `${n.name} has come down with the fever and is staying home.`, { actors: [n.id], locationId: n.home, importance: 6, witnesses: [n.id, "samuel_achebe", "hana_kimura"] });
      w.rt[n.id].triggers.push(`You are sick with a fever. You should stay home for ${days} days.`);
    }
  }
  if (effects.randomWindfall && typeof effects.randomWindfall === "object") {
    const { amount = 1000, excludeWealthClass = [] } = effects.randomWindfall as { amount?: number; excludeWealthClass?: string[] };
    const pool = Object.values(w.npcs).filter((n) => !excludeWealthClass.includes(w.content.npcs[n.id].wealthClass));
    const lucky = w.rng.pick(pool);
    transfer(w, OUTSIDE, npcAcct(lucky.id), amount, { trade: false });
    emit(w, "windfall", `${lucky.name} holds the winning ticket: ${sym}${amount}.`, { actors: [lucky.id], locationId: lucky.locationId, importance: 9, witnesses: Object.keys(w.npcs) });
    w.rt[lucky.id].triggers.push(`You just won ${sym}${amount} in the regional lottery!`);
  }
  if (effects.randomBusinessLoss && typeof effects.randomBusinessLoss === "object") {
    const { district, amount = 200 } = effects.randomBusinessLoss as { district?: string; amount?: number };
    const pool = Object.values(w.businesses).filter((b) => !district || w.content.locations[b.locationId].district === district);
    if (pool.length) {
      const victim = w.rng.pick(pool);
      transfer(w, bizAcct(victim.locationId), OUTSIDE, Math.min(amount, victim.account), { trade: false });
      emit(w, "crime", `${w.content.locations[victim.locationId].name} was broken into overnight. ${sym}${amount} gone from the till.`, { actors: [victim.owner, "ben_carter"], locationId: victim.locationId, importance: 8 });
      w.rt[victim.owner].triggers.push(`Your shop was burgled last night. ${sym}${amount} is gone.`);
    }
  }
  if (effects.npcCost && typeof effects.npcCost === "object") {
    for (const [id, cost] of Object.entries(effects.npcCost as Record<string, number>)) {
      if (!w.npcs[id]) continue;
      const paid = Math.min(cost, w.npcs[id].wallet);
      transfer(w, npcAcct(id), OUTSIDE, paid, { trade: false });
      addMemory(w, id, "event", `${src.title} cost me ${sym}${paid}.`, 6);
    }
  }
  if (typeof effects.flag === "string") w.flags.add(effects.flag);
  if (typeof effects.clearFlag === "string") w.flags.delete(effects.clearFlag);
  if (typeof effects.policyProposal === "string") proposePolicy(w, effects.policyProposal, "petition");
  if (effects.gathering && typeof effects.gathering === "object") {
    const g = effects.gathering as { location: string; hour: number; npcs: string[] | "any" };
    w.gatherings.push({ day: w.clock.day, hour: g.hour, location: g.location, npcs: g.npcs, reason: src.title, done: false });
  }
  if (typeof effects.gossipSeed === "string") {
    for (const n of w.rng.shuffle(Object.keys(w.npcs)).slice(0, 4)) addGossip(w, n, `Heard a rumour: ${effects.gossipSeed}.`);
  }
  if (effects.collectTax === true) collectTax(w);
  if (effects.treasuryLike && typeof effects.treasuryLike === "object") {
    const { target, amount = 0 } = effects.treasuryLike as { target: string; amount?: number };
    w.funds[target] = round((w.funds[target] ?? 0) + amount);
  }
  // policy-only effects
  if (typeof effects.rentMultiplier === "number") w.rentMultiplier = effects.rentMultiplier;
  if (typeof effects.taxRate === "number") w.taxRate = effects.taxRate;
  if (typeof effects.clinicFunding === "number") w.funds.clinic = round((w.funds.clinic ?? 0) + effects.clinicFunding);
  if (effects.addSells && typeof effects.addSells === "object") {
    for (const [locId, goods] of Object.entries(effects.addSells as Record<string, string[]>)) {
      const loc = w.content.locations[locId];
      const biz = w.businesses[locId];
      if (!loc || !biz) continue;
      loc.sells = [...new Set([...(loc.sells ?? []), ...goods])];
      for (const g of goods) {
        biz.prices[g] ??= w.content.economy.goods[g]?.basePrice ?? 5;
        biz.inventory[g] ??= 0;
        const from = w.content.economy.goods[g]?.from;
        if (from && !loc.buys?.includes(from)) loc.buys = [...(loc.buys ?? []), from];
      }
    }
  }
  if (effects.allowDirectFishSales === true) w.flags.add("direct_fish_sales");
}

/** Expire timed effects at the start of a new day. */
export function expireEffects(w: World): void {
  const before = w.effects.length;
  w.effects = w.effects.filter((e) => e.endsDay >= w.clock.day);
  if (w.effects.length !== before) w.log(`D${w.clock.day} 00:00  [system] ${before - w.effects.length} world effect(s) ended.`);
}

/** Create a proposed policy from content/events.json policyProposals. */
export function proposePolicy(w: World, id: string, proposedBy: string): Policy | null {
  const def = w.content.events.policyProposals[id];
  if (!def) return null;
  if (w.policies.some((p) => p.status === "proposed")) return null; // one open policy at a time
  const policy: Policy = { id: `${id}_${w.clock.day}`, title: def.title, proposedBy, proposedDay: w.clock.day, status: "proposed", votes: {}, effects: { ...def.effects, _policyId: id } };
  w.policies.push(policy);
  const who = proposedBy === "petition" ? "A petition" : w.npcs[proposedBy]?.name ?? proposedBy;
  emit(w, "policy_proposed", `${who} puts a policy to the council: "${def.title}". The council votes tomorrow.`, {
    actors: [w.election.mayor, ...w.election.council], locationId: "town_hall", importance: 6, witnesses: Object.keys(w.npcs),
  });
  return policy;
}

/** Festival day: the whole town gathers in the square in the evening. */
export function festivalMorning(w: World): void {
  if (w.festivalDay !== w.clock.day) return;
  emit(w, "festival", `It is the day of the Tide Festival. Stalls go up in the square; the bonfire is being built on the beach.`, {
    actors: [w.election.mayor], locationId: "town_square", importance: 6, witnesses: Object.keys(w.npcs),
  });
  for (const n of Object.values(w.npcs)) n.happiness = Math.min(100, n.happiness + 5);
}

export function activeWorldEvents(w: World): Array<{ cardId: string; title: string; endsDay: number }> {
  return w.effects.map((e) => ({ cardId: e.cardId, title: e.title, endsDay: e.endsDay }));
}
