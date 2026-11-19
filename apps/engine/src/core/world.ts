import type { Brain, BusinessState, ElectionState, Loan, Metrics, NpcState } from "@npcworld/schema";
import type { Content } from "./content.js";
import type { NpcRuntime, World } from "./types.js";
import { createRng } from "./rng.js";
import { makeClock, toSimTime } from "./clock.js";
import { parseRhythm } from "./rhythm.js";
import { relKey } from "./relationships.js";
import { computeMetrics } from "./metrics.js";

export const INITIAL_MAYOR = "ingrid_halvorsen";
export const INITIAL_COUNCIL = ["devendra_rao", "elias_brand", "sigrid_vale", "cornelius_ashdown", "rosa_moreno"];
export const LANDLORD = "marcus_vale";

/** Goods that are services: made on demand, never stocked. */
export function isService(content: Content, good: string): boolean {
  const g = content.economy.goods[good];
  return !!g && !g.from && !g.producedAt && !g.import;
}

export function makeNpcRuntime(rhythm: string, wakeFallback: number): NpcRuntime {
  const r = parseRhythm(rhythm, wakeFallback);
  return {
    wakeHour: r.wake,
    bedHour: r.bed,
    plannedDay: 0,
    reflectedDay: 0,
    hereSinceMin: 0,
    lastConvAbsHour: -10,
    convCheckedAbsHour: -1,
    lastReactAbsMin: -1000,
    reactsToday: 0,
    notable: [],
    triggers: [],
    criticalNeedDay: {},
    wagePaidDay: 0,
    workedToday: false,
    stock: {},
    tenancy: { missedRent: 0, arrears: 0 },
    busy: false,
    lastReflection: null,
    stepKey: null,
    acted: false,
    actionStartMin: 0,
    sleeping: true,
    fired: false,
    evicted: false,
    injected: [],
  };
}

function initialInventory(content: Content, locId: string): Record<string, number> {
  const loc = content.locations[locId];
  const inv: Record<string, number> = {};
  for (const g of loc.sells ?? []) if (!isService(content, g)) inv[g] = 15;
  for (const g of loc.buys ?? []) inv[g] = Math.max(inv[g] ?? 0, 6);
  for (const g of loc.produces ?? []) inv[g] = Math.max(inv[g] ?? 0, 4);
  return inv;
}

export function createWorld(content: Content, brain: Brain, opts: { seed?: string | number; headless?: boolean; log?: (s: string) => void } = {}): World {
  const seed = String(opts.seed ?? Date.now());
  const rng = createRng(seed);
  const eco = content.economy;

  const npcs: Record<string, NpcState> = {};
  const rt: Record<string, NpcRuntime> = {};
  for (const n of content.cast.npcs) {
    const home = content.locations[n.home];
    const wallet = eco.startingWallets[n.wealthClass];
    npcs[n.id] = {
      id: n.id,
      name: n.name,
      pos: [home.pos[0], home.pos[1]],
      locationId: n.home,
      targetLocationId: null,
      action: "sleep",
      activity: "asleep",
      thought: "",
      mood: "neutral",
      needs: { food: 70 + rng.int(25), rest: 90, social: 60 + rng.int(30), leisure: 60 + rng.int(30), purpose: 60 + rng.int(30) },
      wallet: typeof wallet === "number" ? wallet : 100,
      debt: 0,
      employed: n.employer !== null,
      job: n.job,
      jobTitle: n.jobTitle,
      home: n.home,
      workplace: n.workplace,
      plan: [],
      planStepIndex: 0,
      conversationId: null,
      sickDays: 0,
      mayorOpinion: 0,
      happiness: 55,
    };
    rt[n.id] = makeNpcRuntime(n.rhythm, 6 + rng.range(0, 1.2));
  }

  const businesses: Record<string, BusinessState> = {};
  for (const [locId, account] of Object.entries(eco.startingBusinessAccounts)) {
    const loc = content.locations[locId];
    if (!loc) continue;
    const prices: Record<string, number> = {};
    // retailers mark up goods they buy in to resell (general store grain/fruit/clothes)
    for (const g of loc.sells ?? []) prices[g] = loc.buys?.includes(g) ? Math.round(eco.goods[g].basePrice * 1.25 * 100) / 100 : eco.goods[g].basePrice;
    for (const g of loc.produces ?? []) prices[g] = eco.goods[g].basePrice;
    businesses[locId] = {
      locationId: locId,
      owner: loc.owner,
      account,
      inventory: initialInventory(content, locId),
      prices,
      employees: content.cast.npcs.filter((n) => n.employer === locId).map((n) => n.id),
      wageOverrides: {},
      revenueToday: 0,
      costsToday: 0,
      pnlHistory: [],
      open: false,
    };
  }

  const rel = new Map<string, import("@npcworld/schema").RelationshipState>();
  for (const e of content.relationships.edges) {
    rel.set(relKey(e.a, e.b), { a: e.a, b: e.b, type: e.type, affinity: e.affinity, lastInteractionDay: null });
  }
  // missing reverse edges start at 0 (strangers/acquaintances) with the same type
  for (const e of content.relationships.edges) {
    if (!rel.has(relKey(e.b, e.a))) rel.set(relKey(e.b, e.a), { a: e.b, b: e.a, type: e.type, affinity: 0, lastInteractionDay: null });
  }

  const election: ElectionState = {
    nextElectionDay: content.town.clock.electionEveryDays,
    phase: "quiet",
    candidates: [],
    speeches: [],
    lastResult: null,
    mayor: INITIAL_MAYOR,
    council: [...INITIAL_COUNCIL],
    approval: 0,
    approvalHistory: [],
  };

  const loans: Loan[] = [
    { id: "loan_bakery", borrower: "mira_okafor", principal: 4000, balance: 4000, weeklyRate: eco.bank.loanRateWeekly, missedPayments: 2, createdDay: -14 },
    { id: "loan_haddad", borrower: "fatima_haddad", principal: 1500, balance: 1500, weeklyRate: eco.bank.loanRateWeekly, missedPayments: 1, createdDay: -7 },
  ];
  for (const l of loans) npcs[l.borrower].debt += l.balance;
  rt.tomas_reyes.tenancy = { missedRent: 2, arrears: 2 * eco.rent.weekly.room };

  const stats = brain.stats();
  const w: World = {
    content,
    rng,
    seed,
    brain,
    clock: makeClock(!!opts.headless, content.town.clock.simHourRealMinutes),
    time: undefined as unknown as World["time"],
    npcs,
    rt,
    businesses,
    rel,
    conversations: [],
    conversationLog: [],
    election,
    policies: [],
    loans,
    metrics: undefined as unknown as Metrics,
    metricsHistory: [],
    storylines: [],
    papers: [],
    confessionals: [],
    memories: {},
    unsavedMemories: [],
    events: [],
    unsavedEvents: [],
    todayEvents: [],
    yesterdayEvents: [],
    eventsTotal: 0,
    lastEventSeq: 0,
    treasury: eco.treasury.start,
    taxRate: eco.treasury.taxRate,
    rentMultiplier: 1,
    funds: {},
    flags: new Set(),
    firedOnce: new Set(),
    effects: [],
    gatherings: [],
    festivalDay: null,
    arcs: [],
    story: null,
    outside: { importedToday: 0, exportedToday: 0, marketCratesToday: 0 },
    gdpToday: 0,
    missedRentToday: 0,
    missedWagesToday: 0,
    degraded: false,
    llm: { calls: 0, failures: 0, costUsd: 0, byKind: {}, last50: [], callsToday: 0, costTodayUsd: 0, dayCostBase: stats.costUsd, dayCallsBase: stats.calls },
    listeners: new Set(),
    nightlyHooks: [],
    pending: new Set(),
    log: opts.log ?? (() => {}),
    startedAt: Date.now(),
  };
  w.time = toSimTime(w);
  w.metrics = computeMetrics(w);
  return w;
}

/** Weekly rent tier from the home location id. */
export function rentTier(homeId: string): "room" | "flat" | "house" {
  if (homeId.startsWith("room_") || homeId === "inn") return "room";
  if (homeId.startsWith("flat_") || homeId === "studio") return "flat";
  return "house";
}

/** The landlord an NPC pays rent to, or null if they own/share their home. */
export function landlordOf(w: World, npcId: string): string | null {
  const npc = w.npcs[npcId];
  const loc = w.content.locations[npc.home];
  if (!loc) return null;
  const owner = loc.owner;
  if (owner === "town" || owner === npcId) return null;
  const ownerNpc = w.content.npcs[owner];
  const me = w.content.npcs[npcId];
  if (!ownerNpc || !me) return null;
  if (ownerNpc.home === npc.home) return null; // shares the owner's house
  if (ownerNpc.household === me.household) return null;
  return owner;
}
