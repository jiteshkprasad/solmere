/**
 * Small fixture builder for the self-test and bake-off scripts. Loads the
 * content files directly (no dependency on src/core) and builds realistic
 * BrainContext / BusinessState / WorldEvent values.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CastContent, EconomyContent, RelationshipsContent, TownContent,
  type BrainContext, type BusinessState, type ElectionState, type NpcContent, type NpcState, type Storyline, type WorldEvent,
} from "@npcworld/schema";

const here = dirname(fileURLToPath(import.meta.url));
const contentDir = resolve(here, "../../../../../content");
const readJson = (name: string) => JSON.parse(readFileSync(resolve(contentDir, name), "utf8"));

export const cast = CastContent.parse(readJson("cast.json"));
export const town = TownContent.parse(readJson("town.json"));
export const relationships = RelationshipsContent.parse(readJson("relationships.json"));
export const economy = EconomyContent.parse(readJson("economy.json"));

const npcById = new Map(cast.npcs.map((n) => [n.id, n]));
const locById = new Map(town.locations.map((l) => [l.id, l]));

export function npc(id: string): NpcContent {
  const n = npcById.get(id);
  if (!n) throw new Error(`fixture: unknown npc ${id}`);
  return n;
}

export const basePrices: Record<string, number> = Object.fromEntries(
  ["bread", "fish", "meal", "beer", "coffee", "pastry", "fruit", "grain", "rent", "haircut"].filter((g) => economy.goods[g]).map((g) => [g, economy.goods[g].basePrice]),
);

export function renderRelationships(id: string): string[] {
  return relationships.edges
    .filter((e) => e.a === id)
    .map((e) => {
      const other = npcById.get(e.b);
      const job = other ? other.job.replace(/_/g, " ") : "?";
      return `${other?.name ?? e.b} (${job}) — ${e.type}, ${e.affinity > 0 ? "+" : ""}${e.affinity}${e.note ? `: ${e.note}` : ""}`;
    });
}

export interface ContextOverrides {
  day?: number;
  hour?: number;
  minute?: number;
  locationId?: string;
  present?: string[];
  memories?: string[];
  needs?: Partial<NpcState["needs"]>;
  wallet?: number;
  debt?: number;
  mood?: NpcState["mood"];
  thought?: string;
  activity?: string;
  trigger?: string | null;
  lastReflection?: string | null;
  headlines?: string[];
  activeEvents?: string[];
  plan?: NpcState["plan"];
}

export function buildContext(id: string, o: ContextOverrides = {}): BrainContext {
  const self = npc(id);
  const locationId = o.locationId ?? self.workplace;
  const loc = locById.get(locationId) ?? locById.get(self.home)!;
  const hour = o.hour ?? 9;
  const wallet = o.wallet ?? Number(economy.startingWallets[self.wealthClass] ?? 100);
  const state: NpcState = {
    id: self.id,
    name: self.name,
    pos: loc.pos,
    locationId: loc.id,
    targetLocationId: null,
    action: hour >= 23 || hour < 6 ? "sleep" : "work",
    activity: o.activity ?? "",
    thought: o.thought ?? "",
    mood: o.mood ?? "neutral",
    needs: { food: 55, rest: 70, social: 45, leisure: 40, purpose: 65, ...o.needs },
    wallet,
    debt: o.debt ?? 0,
    employed: self.employer !== null,
    job: self.job,
    jobTitle: self.jobTitle,
    home: self.home,
    workplace: self.workplace,
    plan: o.plan ?? [],
    planStepIndex: 0,
    conversationId: null,
    sickDays: 0,
    mayorOpinion: 5,
    happiness: 55,
  };
  const openNow = !loc.hours || (loc.hours[0] <= loc.hours[1] ? hour >= loc.hours[0] && hour < loc.hours[1] : hour >= loc.hours[0] || hour < loc.hours[1]);
  return {
    self,
    state,
    time: { day: o.day ?? 3, hour, minute: o.minute ?? 0, sleeping: false, wallMs: 0, speed: 12, paused: false },
    relationships: renderRelationships(id),
    memories: o.memories ?? [],
    here: { locationId: loc.id, locationName: loc.name, present: o.present ?? [], openNow },
    world: {
      mayor: "Ingrid Halvorsen",
      daysToElection: 12,
      headlines: o.headlines ?? ["Council delays clinic grant vote again", "Fish up to ₡6 a kilo, third rise this month"],
      prices: basePrices,
      activeEvents: o.activeEvents ?? [],
    },
    lastReflection: o.lastReflection ?? null,
    trigger: o.trigger ?? null,
    places: town.locations.filter((l) => l.type !== "home" || l.id === self.home).map((l) => ({ id: l.id, name: l.name, type: l.type })),
  };
}

/* ------------------------------------------------------------------ */
/* Ready-made scenarios                                                 */
/* ------------------------------------------------------------------ */

export function miraContext(o: ContextOverrides = {}): BrainContext {
  return buildContext("mira_okafor", {
    hour: 6,
    wallet: 118,
    debt: 4000,
    needs: { food: 48, rest: 35, social: 40, leisure: 25, purpose: 70 },
    mood: "tense",
    present: ["Teodor Ilic"],
    memories: [
      "Day 2, 17:00 — Cornelius Ashdown walked past the bakery window twice and did not come in.",
      "Day 2, 09:00 — Devendra Rao raised market fish to 6 crowns a kilo; the fish pies barely break even now.",
      "Day 1, 20:00 — Tunde asked if the loan was fine. I said yes. It is not fine; two payments missed.",
      "Day 2, 12:00 — Teodor sold out the noon batch before I got back from the mill. He's good. Better than I say.",
      "Day 2, 19:00 — Zara said she'd rather leave Solmere than 'inherit a debt with a sign on it'.",
      "Day 1, 08:00 — Rosa Moreno is selling toast with her coffee again. Toast. With my bread's customers.",
    ],
    lastReflection: "Sold out by three, which never happens, and still came home short. The bank letter is unopened on the dresser; Sunday at the latest I tell Tunde.",
    ...o,
  });
}

export function devendraContext(o: ContextOverrides = {}): BrainContext {
  return buildContext("devendra_rao", {
    hour: 9,
    wallet: 940,
    needs: { food: 60, rest: 65, social: 70, leisure: 50, purpose: 80 },
    mood: "content",
    present: ["Bakary Diallo", "Leo Petrov"],
    memories: [
      "Day 2, 07:00 — Paid Chen 15 a crate and Tunde 13 and told each the other got less. Chen wrote something in that notebook again.",
      "Day 2, 11:00 — Idris Bello wants the harbour concession put to tender. Over my dead body.",
      "Day 1, 16:00 — Told the square the sea sets the price. Big laugh. Mira Okafor did not laugh.",
      "Day 2, 14:00 — Leo Petrov looked at the weighted crate too long. Boy sees things.",
      "Day 1, 18:00 — Bought a round at the Anchor; Jonah says I'm the only man who tips and complains in the same breath.",
    ],
    lastReflection: "Good week on paper: 3,200 in the account and the Herald still calls it 'the sea'. Chen's notebook is a problem I am not going to solve by being nicer.",
    ...o,
  });
}

export function bakeryBusiness(): BusinessState {
  return {
    locationId: "bakery",
    owner: "mira_okafor",
    account: 640,
    inventory: { bread: 22, pastry: 9, grain: 3, fruit: 1 },
    prices: { bread: 4, pastry: 6 },
    employees: ["teodor_ilic"],
    revenueToday: 61,
    costsToday: 38,
    pnlHistory: [
      { day: 1, revenue: 210, costs: 172 },
      { day: 2, revenue: 236, costs: 190 },
      { day: 3, revenue: 198, costs: 205 },
    ],
    open: true,
  };
}

export function electionFixture(): ElectionState {
  return {
    nextElectionDay: 30,
    phase: "campaign",
    candidates: [
      { npcId: "ingrid_halvorsen", platform: "Steady hands: keep the treasury sound, fund the clinic match when we can afford it.", declaredDay: 20 },
      { npcId: "devendra_rao", platform: "A harbour that pays for itself: lower fees, a tender for nothing, and a council that has met a payroll.", declaredDay: 21 },
    ],
    speeches: [],
    lastResult: null,
    mayor: "ingrid_halvorsen",
    council: ["marcus_vale", "cornelius_ashdown", "idris_bello", "agnes_duarte", "anna_lindqvist"],
    approval: 12,
    approvalHistory: [],
  };
}

export const candidatesFixture = [
  { npcId: "ingrid_halvorsen", name: "Ingrid Halvorsen", platform: "Steady hands: keep the treasury sound, fund the clinic match when we can afford it.", speech: "Neighbours, I will not promise you money the town does not have. I will promise you a clinic that stays open and rents that are argued about in this hall, not in the street." },
  { npcId: "devendra_rao", name: "Devendra Rao", platform: "A harbour that pays for itself: lower fees, a tender for nothing, and a council that has met a payroll.", speech: "Am I a politician? No. I am a man who came up that road with one handcart. The harbour fees pay for a harbourmaster's office and nothing else. Vote for someone who has made payroll." },
];

export function makeEventAt(seq: number, partial: Partial<WorldEvent> & { text: string; type: WorldEvent["type"] }): WorldEvent {
  return { id: `evt_${seq}`, seq, day: 3, hour: 12, minute: 0, actors: [], locationId: null, importance: 5, drama: 5, ...partial };
}

/** Deterministic: ids evt_101..evt_106 every call. */
export function fakeEvents(): WorldEvent[] {
  let seq = 100;
  const makeEvent = (partial: Parameters<typeof makeEventAt>[1]) => makeEventAt(++seq, partial);
  return [
    makeEvent({ type: "price_change", hour: 7, actors: ["devendra_rao"], locationId: "fish_market", text: "Devendra Rao raised market fish to ₡6 a kilo, the third rise this month.", importance: 5, drama: 4 }),
    makeEvent({ type: "argument", hour: 9, actors: ["mira_okafor", "devendra_rao"], locationId: "fish_market", text: "Mira Okafor and Devendra Rao argued over fish prices at the market; she left with five kilos at ₡5 and a warning.", importance: 6, drama: 6 }),
    makeEvent({ type: "rent_missed", hour: 10, actors: ["jay_whitlock", "marcus_vale"], locationId: "realty", text: "Jay Whitlock missed rent for the second week; Marcus Vale gave him until Friday.", importance: 6, drama: 6 }),
    makeEvent({ type: "policy_proposed", hour: 14, actors: ["idris_bello"], locationId: "town_hall", text: "Harbourmaster Idris Bello proposed putting the harbour concession out to tender.", importance: 7, drama: 7 }),
    makeEvent({ type: "gossip", hour: 16, actors: ["leo_petrov", "chen_wei"], locationId: "docks", text: "Leo Petrov told Chen Wei he saw a weighted crate on the Fish Market scales.", importance: 7, drama: 8 }),
    makeEvent({ type: "speech", hour: 18, actors: ["devendra_rao"], locationId: "town_square", text: "Devendra Rao gave a campaign speech in the square promising lower harbour fees; about thirty people listened, some laughed.", importance: 6, drama: 5 }),
  ];
}

export function existingStorylines(): Storyline[] {
  return [
    { id: "bakery_loan", title: "The Bakery Loan", summary: "Mira Okafor has missed two payments on the bakery's 4,000-crown loan and hasn't told Tunde. Cornelius Ashdown is running out of patience.", actors: ["mira_okafor", "cornelius_ashdown", "tunde_okafor"], eventIds: ["evt_12", "evt_19"], status: "active", startedDay: 1, updatedDay: 2, heat: 6 },
    { id: "fish_prices", title: "Two Fishers, One Buyer", summary: "Devendra Rao pays Chen and Tunde different prices for the same fish. Chen has been keeping a notebook.", actors: ["devendra_rao", "chen_wei", "tunde_okafor"], eventIds: ["evt_15"], status: "brewing", startedDay: 2, updatedDay: 2, heat: 4 },
  ];
}
