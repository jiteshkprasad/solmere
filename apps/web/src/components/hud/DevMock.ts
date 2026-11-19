/**
 * Dev preview data. Loaded only when NEXT_PUBLIC_MOCK_WORLD=1 (see Hud.tsx).
 * Fills the store with a plausible day-12 snapshot of Solmere, patches `api.*`
 * so on-demand fetches work without the engine, and runs a tiny ticker so the
 * feed, clock and live conversation lines move.
 *
 * Rules: sets only fields this HUD reads; never overwrites `npcs` if the scene
 * agent's mock already populated them; ui fields are only filled when empty.
 */
import type {
  ActionKind, BusinessState, Confessional, Conversation, ElectionState, Loan, Memory, Metrics, Mood, Newspaper, NpcState,
  PlanStep, Policy, RelationshipState, Storyline, WorldEvent, WorldSnapshot, EventType,
} from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { api } from "@/lib/engineClient";
import { CAST, LOCATIONS, LOCATION_BY_ID, GOODS, firstName } from "./lib";
import relJson from "../../../../../content/relationships.json";

/* ---------- deterministic rng ---------- */
let seed = 20260913;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const rf = (a: number, b: number) => a + rnd() * (b - a);

const DAY = 12, HOUR = 14, MINUTE = 35;
const MOODS: Mood[] = ["elated", "happy", "content", "neutral", "tense", "sad", "angry", "afraid"];
const MOOD_W = [1, 5, 8, 9, 5, 3, 2, 1];
const wmood = (): Mood => { let r = rnd() * MOOD_W.reduce((a, b) => a + b, 0); for (let i = 0; i < MOODS.length; i++) { r -= MOOD_W[i]; if (r <= 0) return MOODS[i]; } return "neutral"; };
const WALLET: Record<string, [number, number]> = { wealthy: [1800, 3200], comfortable: [500, 1100], getting_by: [150, 420], tight: [30, 160], broke: [0, 40] };

const THOUGHTS = [
  "If the price of flour goes up again I'm done pretending.", "Stars above, let this afternoon be quiet.", "He knows. I can tell by the way he didn't look at me.",
  "Thirty crowns short. Again.", "Nobody at the tavern tonight will hear it from me.", "The mayor smiled at me. That's never good.",
  "One more week and I tell her about the letter.", "I could buy the whole loft and nobody would blink.", "Why does everyone assume I'm fine?",
  "The stone was moved. I know exactly who moved it.", "Rent's Friday. Friday is a problem.", "I should apologise. I won't.",
  "Big Jonah's running on fumes and he doesn't even know.", "Best catch of the season and Devendra still lowballs.", "I'll play the tavern Friday and then we'll see.",
];
const ACTIVITY: Record<ActionKind, string[]> = {
  sleep: ["asleep"], walk: ["walking to {loc}", "heading over to {loc}"], work: ["working at {loc}", "on shift at {loc}", "behind the counter at {loc}"],
  eat: ["eating at {loc}"], drink: ["nursing a pint at {loc}"], shop: ["buying groceries at {loc}"], talk: ["talking with {with} at {loc}", "arguing with {with} about prices"],
  idle: ["loitering at {loc}", "watching the harbour"], leisure: ["taking the afternoon off at {loc}"], worship: ["at the chapel"], create: ["painting in the loft"],
  speech: ["giving a speech in the square"], vote: ["voting at Town Hall"], confess: ["in the confessional chair"], sick: ["in bed with a fever"],
};

function planFor(c: (typeof CAST)[number]): PlanStep[] {
  const wp = c.workplace, home = c.home;
  const social = pick(["tavern", "cafe", "chai_stall", "town_square", "park", "beach"]);
  const shop = pick(["general_store", "bakery", "fish_market"]);
  const steps: PlanStep[] = [
    { startHour: 6, endHour: 7, action: "eat", location: home, intent: "Breakfast, quickly." },
    { startHour: 7, endHour: 12, action: "work", location: wp, intent: pick(["Open up and get through the morning.", "Get the stock out before the rush.", "Keep my head down and work."]) },
    { startHour: 12, endHour: 13, action: "eat", location: pick(["cafe", "chai_stall", home]), intent: "Lunch. Maybe run into someone." },
    { startHour: 13, endHour: 17, action: c.employer === null ? "idle" : "work", location: c.employer === null ? "town_square" : wp, intent: c.employer === null ? "Ask around for work. Again." : "Afternoon shift." },
    { startHour: 17, endHour: 18, action: "shop", location: shop, intent: "Pick up something for dinner." },
    { startHour: 18, endHour: 21, action: pick(["drink", "leisure", "talk"]), location: social, intent: pick(["See who's about.", "Find out what people are saying.", "Not go home yet."]), with: [pick(CAST).id] },
    { startHour: 21, endHour: 23, action: "sleep", location: home, intent: "Bed." },
  ];
  return steps;
}

function makeNpcs(): Record<string, NpcState> {
  const out: Record<string, NpcState> = {};
  for (const c of CAST) {
    const plan = planFor(c);
    const idx = plan.findIndex((s) => HOUR >= s.startHour && HOUR < s.endHour);
    const step = plan[Math.max(0, idx)];
    const loc = LOCATION_BY_ID[step.location] ?? LOCATION_BY_ID[c.home];
    const [wa, wb] = WALLET[c.wealthClass] ?? [50, 200];
    const withId = step.with?.[0];
    const act = pick(ACTIVITY[step.action]).replace("{loc}", loc?.name ?? step.location).replace("{with}", withId ? firstName(withId) : "someone");
    out[c.id] = {
      id: c.id, name: c.name, pos: [loc.pos[0] + rf(-4, 4), loc.pos[1] + rf(-4, 4)], locationId: step.location, targetLocationId: null,
      action: step.action, activity: act, thought: pick(THOUGHTS), mood: wmood(),
      needs: { food: rf(0.3, 1), rest: rf(0.3, 1), social: rf(0.1, 1), leisure: rf(0.1, 0.9), purpose: rf(0.2, 1) },
      wallet: Math.round(rf(wa, wb)), debt: c.wealthClass === "tight" || c.wealthClass === "broke" ? (rnd() < 0.4 ? ri(50, 900) : 0) : c.id === "mira_okafor" ? 3400 : 0,
      employed: c.employer !== null, job: c.job, jobTitle: c.jobTitle, home: c.home, workplace: c.workplace, plan, planStepIndex: Math.max(0, idx),
      conversationId: null, sickDays: rnd() < 0.05 ? ri(1, 3) : 0, mayorOpinion: Math.round(rf(-60, 60)), happiness: Math.round(rf(25, 85)),
    };
  }
  return out;
}

function makeBusinesses(): Record<string, BusinessState> {
  const out: Record<string, BusinessState> = {};
  for (const l of LOCATIONS.filter((x) => x.type === "business")) {
    const loc = l as typeof l & { owner: string; sells?: string[] };
    const prices: Record<string, number> = {};
    const inventory: Record<string, number> = {};
    for (const g of loc.sells ?? []) { prices[g] = Math.round(GOODS[g].basePrice * rf(0.85, 1.35) * 10) / 10; inventory[g] = ri(0, 60); }
    const scale = rf(40, 400);
    const pnlHistory = Array.from({ length: 7 }, (_, i) => ({ day: DAY - 7 + i, revenue: Math.round(scale * rf(0.6, 1.4)), costs: Math.round(scale * rf(0.5, 1.2)) }));
    out[l.id] = {
      locationId: l.id, owner: loc.owner, account: Math.round(rf(-200, 2600)), inventory, prices,
      employees: CAST.filter((c) => c.employer === l.id).map((c) => c.id), revenueToday: Math.round(scale * rf(0.3, 0.9)), costsToday: Math.round(scale * rf(0.3, 0.8)),
      pnlHistory, open: rnd() > 0.15,
    };
  }
  out.tavern.account = -140; // Jonah is running at a loss
  return out;
}

function makeRelationships(): RelationshipState[] {
  const edges = (relJson as { edges: Array<{ a: string; b: string; type: RelationshipState["type"]; affinity: number }> }).edges;
  return edges.map((e) => ({ a: e.a, b: e.b, type: e.type, affinity: Math.max(-100, Math.min(100, e.affinity + ri(-8, 8))), lastInteractionDay: rnd() < 0.7 ? ri(DAY - 5, DAY) : null }));
}

let seq = 1000;
const ev = (day: number, hour: number, minute: number, type: EventType, actors: string[], locationId: string | null, text: string, drama: number): WorldEvent =>
  ({ id: `ev_${seq}`, seq: seq++, day, hour, minute, type, actors, locationId, text, importance: Math.min(10, drama + 1), drama });

function makeEvents(): WorldEvent[] {
  const E: WorldEvent[] = [
    ev(11, 6, 10, "system", [], null, "Day 11 begins. Overcast, wind from the west.", 0),
    ev(11, 6, 40, "transaction", ["devendra_rao", "tunde_okafor"], "fish_market", "Devendra buys Tunde's catch at ₡14/crate — two under yesterday's price.", 4),
    ev(11, 7, 5, "price_change", ["mira_okafor"], "bakery", "Okafor's Bakery raises bread to ₡3.40 (flour again).", 3),
    ev(11, 8, 30, "conversation", ["priya_nair", "ben_carter"], "cafe", "Priya and Ben share a table and say nothing about the council loan. Both notice.", 5),
    ev(11, 9, 15, "wage", ["dolores_quinn", "lakshmi_rao"], "general_store", "Lakshmi pays Dolly ₡38 for yesterday's shift.", 1),
    ev(11, 10, 0, "policy_proposed", ["jay_whitlock"], "town_hall", "Jay Whitlock files a rent-cap petition with 14 signatures.", 7),
    ev(11, 10, 45, "gossip", ["dmitri_volkov", "sal_romano"], "barber", "Dmitri lets slip at the barber's that Hana got a postcard from the city.", 5),
    ev(11, 11, 20, "argument", ["chen_wei", "devendra_rao"], "fish_market", "Chen accuses Devendra of double-pricing in front of the porters.", 7),
    ev(11, 12, 0, "transaction", ["rosa_moreno", "wojciech_kowalski"], "brewery", "Rosa quietly buys two kegs from Wojtek. Jonah is not told.", 5),
    ev(11, 13, 30, "hired", ["elias_brand", "sunny_adebayo"], "carpentry", "Elias takes on Sunny for three days of loft work.", 3),
    ev(11, 14, 10, "rent_missed", ["tomas_reyes", "marcus_vale"], "realty", "Tomas misses rent for the second week. Marcus makes a note.", 6),
    ev(11, 15, 0, "romance", ["per_lindqvist", "fatima_haddad"], "beach", "Per and Fatima meet at dusk by the boundary stone. Gus sees.", 8),
    ev(11, 16, 20, "world_event", [], "docks", "Storm off the point — boats stay in, the harbour office shutters early.", 7),
    ev(11, 17, 0, "speech", ["ingrid_halvorsen"], "town_square", "Mayor Halvorsen promises the harbour wall ‘this year, funded’ to a wet crowd of nine.", 6),
    ev(11, 18, 30, "friendship", ["kofi_mensah", "bakary_diallo"], "studio", "Kofi and Bakary work the night shift on a boat nobody knows about.", 4),
    ev(11, 19, 15, "feud", ["walter_finch", "samuel_achebe"], "tavern", "Walter tells the Anchor, again, that the doctor killed his wife. Samuel was at the door.", 8),
    ev(11, 20, 0, "loan", ["mira_okafor", "cornelius_ashdown"], "bank", "Neil extends the bakery loan another week. Off the books.", 6),
    ev(11, 21, 30, "confessional", ["zara_okafor"], "home_okafor", "Zara records a confessional about leaving.", 3),
    ev(12, 0, 5, "newspaper", ["priya_nair"], "cafe", "The Solmere Herald prints: ‘STORM SHUTS HARBOUR; RENT-CAP PETITION REACHES TOWN HALL’.", 5),
    ev(12, 0, 10, "reflection", ["jonah_kowalski"], "home_kowalski", "Jonah reflects: the till was light again and he can't say why.", 4),
    ev(12, 6, 0, "system", [], null, "Day 12 begins. Clearing after the storm; heavy swell.", 0),
    ev(12, 6, 30, "sick", ["osman_kaya"], "home_demir", "Osman is down with the fever from Salt Lane.", 4),
    ev(12, 7, 10, "transaction", ["hamish_mcbride", "lakshmi_rao"], "general_store", "Hamish sells the orchard glut to Lakshmi at ₡7/crate.", 2),
    ev(12, 8, 0, "price_change", ["devendra_rao"], "fish_market", "Fish Market drops fish to ₡5.20 — storm stock must move.", 3),
    ev(12, 8, 45, "policy_vote", ["marcus_vale", "sigrid_vale", "idris_bello", "anna_lindqvist", "cornelius_ashdown"], "town_hall", "Council votes on the rent cap: 2 for, 3 against. Rejected.", 8),
    ev(12, 9, 30, "argument", ["jay_whitlock", "marcus_vale"], "town_hall", "Jay calls Marcus a landlord with a council in his pocket. Ben steps between them.", 8),
    ev(12, 10, 15, "wage_missed", ["jonah_kowalski", "rafael_costa"], "tavern", "Jonah can't pay Rafa for Friday's set. Rafa shrugs. Publicly.", 5),
    ev(12, 10, 50, "gossip", ["beatrice_fontaine", "sigrid_vale"], "inn", "Bea asks Sigrid, very carefully, how old Sunny is.", 6),
    ev(12, 11, 0, "election_declared", ["jay_whitlock"], "town_square", "Jay Whitlock declares for mayor on a rent-cap platform.", 9),
    ev(12, 11, 30, "conversation", ["leo_petrov", "idris_bello"], "harbour_office", "Leo tells the harbourmaster about the weighted crate.", 6),
    ev(12, 12, 0, "transaction", ["ines_larsson", "meena_pillai"], "chai_stall", "Ines buys tea for everyone at the stall. Meena's best hour all week.", 2),
    ev(12, 12, 20, "breakup", ["teodor_ilic", "zara_okafor"], "park", "Teodor tells Zara about the city job. She walks off without a word.", 8),
    ev(12, 12, 45, "storyline", ["chen_wei", "tunde_okafor", "leo_petrov"], "docks", "Storyline update: ‘Two fishers, one buyer’ heats up — a cooperative meeting is called.", 5),
    ev(12, 13, 10, "crime", ["ben_carter"], "general_store", "Back door of the Rao store forced overnight. Nothing missing but the ledger.", 8),
    ev(12, 13, 30, "quit", ["noor_rahman", "sigrid_vale"], "school", "Noor hands in her notice. Sigrid says ‘fine’ and means the opposite.", 7),
    ev(12, 13, 45, "festival", ["agnes_duarte"], "temple", "Sister Agnes announces the Tide Festival will go ahead, roof or no roof.", 3),
    ev(12, 14, 0, "windfall", ["moe_tanaka"], "tavern", "Moe wins ₡120 at cards. Sal says it's a loan.", 4),
    ev(12, 14, 10, "recovered", ["hana_kimura"], "clinic", "Hana clears the last of the fever cases.", 2),
    ev(12, 14, 20, "conversation", ["chen_wei", "tunde_okafor"], "docks", "Chen and Tunde compare Devendra's prices, crate for crate.", 6),
    ev(12, 14, 30, "eviction", ["marcus_vale", "jay_whitlock"], "room_whitlock", "Marcus serves Jay notice: seven days. The petition just got a face.", 9),
  ];
  return E;
}

function makeConversations(): Conversation[] {
  return [
    {
      id: "conv_docks_1", day: 12, hour: 14, locationId: "docks", participants: ["chen_wei", "tunde_okafor"], cursor: 1, done: false, drama: 6,
      summary: "Chen and Tunde compare Devendra's prices and float a cooperative.",
      lines: [
        { speaker: "chen_wei", text: "Fourteen a crate. He gave you fourteen. He gave me twelve for the same fish." },
        { speaker: "tunde_okafor", text: "Same fish, same morning. Mira's going to ask why the money's short again." },
        { speaker: "chen_wei", text: "So we stop selling to him. Both of us. Same day." },
        { speaker: "tunde_okafor", text: "And sell to who, Chen? The sea?" },
        { speaker: "chen_wei", text: "Rosa. The inn. Straight to kitchens. Leo saw his weighted crate — we have proof." },
        { speaker: "tunde_okafor", text: "…Thursday. If the boat's fixed by Thursday, I'm in." },
      ],
    },
    {
      id: "conv_inn_2", day: 12, hour: 14, locationId: "inn", participants: ["beatrice_fontaine", "sunny_adebayo"], cursor: 0, done: false, drama: 5,
      summary: "Bea gently asks Sunny about family.",
      lines: [
        { speaker: "beatrice_fontaine", text: "You've got his way of standing, you know. Hands in pockets, weight on the left." },
        { speaker: "sunny_adebayo", text: "Whose, Mrs Fontaine?" },
        { speaker: "beatrice_fontaine", text: "Never mind me. Room's paid through Sunday, that's all I meant." },
        { speaker: "sunny_adebayo", text: "…Do you know him well? Mr Vale." },
      ],
    },
  ];
}

function makeMetrics(): Metrics[] {
  const goods = Object.keys(GOODS);
  const base: Record<string, number> = Object.fromEntries(goods.map((g) => [g, GOODS[g].basePrice]));
  const out: Metrics[] = [];
  let cpi = 1.0, treasury = 12400, unemployment = 0.12, happiness = 58, gini = 0.45;
  for (let d = DAY - 4; d <= DAY; d++) {
    cpi += rf(-0.01, 0.03); treasury += rf(-600, 250); unemployment = Math.max(0.04, Math.min(0.3, unemployment + rf(-0.02, 0.03))); happiness += rf(-4, 3); gini += rf(-0.01, 0.015);
    for (const g of goods) base[g] = Math.max(0.5, base[g] * rf(0.96, 1.06));
    out.push({
      day: d, gdpToday: Math.round(rf(2600, 4200)), cpi: Math.round(cpi * 100) / 100, unemployment, treasury: Math.round(treasury), gini: Math.round(gini * 100) / 100, happiness: Math.round(happiness),
      loansOutstanding: Math.round(rf(6000, 9000)), missedRent: ri(1, 5), missedWages: ri(0, 3), priceIndex: { ...base }, cohesion: rf(0.5, 0.65),
      lonely: d === DAY ? ["walter_finch", "moe_tanaka", "gus_ferreira", "sunny_adebayo"] : ["walter_finch", "moe_tanaka", "gus_ferreira"],
    });
  }
  return out;
}

function makeElection(): ElectionState {
  const hist = Array.from({ length: 11 }, (_, i) => ({ day: i + 1, approval: Math.round(28 - i * 3.5 + rf(-6, 6)) }));
  return {
    nextElectionDay: 30, phase: "declared", mayor: "ingrid_halvorsen", council: ["marcus_vale", "sigrid_vale", "idris_bello", "anna_lindqvist", "cornelius_ashdown"],
    approval: hist[hist.length - 1].approval, approvalHistory: hist,
    candidates: [
      { npcId: "ingrid_halvorsen", platform: "Steady hands. The harbour wall, funded and built. No experiments with other people's rent.", declaredDay: 10 },
      { npcId: "jay_whitlock", platform: "Cap the rent at a third of wages. Publish the treasury. Give the fishers a market that isn't one man's shop.", declaredDay: 12 },
    ],
    speeches: [
      { npcId: "ingrid_halvorsen", day: 11, text: "I have stood in this square through four storms and three elections. The wall will be built this year — I have the figures, and I have the will. What I will not do is promise you what the town cannot pay for." },
      { npcId: "jay_whitlock", day: 12, text: "Eleven houses. One man. Four of us behind on rent and he sits on the council that votes on the cap. You tell me that's a town. I say it's a shop, and we're the stock." },
    ],
    lastResult: { day: 1, tally: { ingrid_halvorsen: 27, marcus_vale: 14, moe_tanaka: 2 }, winner: "ingrid_halvorsen" },
  };
}

function makePolicies(): Policy[] {
  return [
    { id: "pol_rent_cap_12", title: "Rent cap at one third of wages", proposedBy: "jay_whitlock", proposedDay: 11, status: "rejected", votes: { marcus_vale: false, sigrid_vale: true, idris_bello: true, anna_lindqvist: false, cornelius_ashdown: false }, effects: {} },
    { id: "pol_liquor_9", title: "Liquor licence for Café Moreno", proposedBy: "rosa_moreno", proposedDay: 9, status: "proposed", votes: { sigrid_vale: true, idris_bello: true }, effects: {} },
    { id: "pol_harbour_6", title: "Fund the harbour wall (₡3,000)", proposedBy: "ingrid_halvorsen", proposedDay: 6, status: "passed", votes: { marcus_vale: true, sigrid_vale: true, idris_bello: true, anna_lindqvist: true, cornelius_ashdown: false }, effects: {} },
    { id: "pol_tax_3", title: "Raise sales tax to 6%", proposedBy: "cornelius_ashdown", proposedDay: 3, status: "rejected", votes: { marcus_vale: true, sigrid_vale: false, idris_bello: false, anna_lindqvist: false, cornelius_ashdown: true }, effects: {} },
  ];
}

function makeLoans(): Loan[] {
  return [
    { id: "loan_1", borrower: "mira_okafor", principal: 4000, balance: 3400, weeklyRate: 0.02, missedPayments: 2, createdDay: 1 },
    { id: "loan_2", borrower: "jonah_kowalski", principal: 1200, balance: 1150, weeklyRate: 0.02, missedPayments: 0, createdDay: 5 },
    { id: "loan_3", borrower: "yusuf_demir", principal: 800, balance: 520, weeklyRate: 0.02, missedPayments: 0, createdDay: 2 },
    { id: "loan_4", borrower: "sal_romano", principal: 300, balance: 310, weeklyRate: 0.02, missedPayments: 1, createdDay: 9 },
    { id: "loan_5", borrower: "fatima_haddad", principal: 1500, balance: 1380, weeklyRate: 0.02, missedPayments: 0, createdDay: 4 },
  ];
}

function makeStorylines(events: WorldEvent[]): Storyline[] {
  const ids = (types: EventType[], actors: string[]) => events.filter((e) => types.includes(e.type) && e.actors.some((a) => actors.includes(a))).map((e) => e.id);
  return [
    { id: "st_rent_cap", title: "The rent cap", summary: "Jay Whitlock's petition reached Town Hall and died 3–2 on the council. The same afternoon Marcus served him notice. Jay has declared for mayor.", actors: ["jay_whitlock", "marcus_vale", "ingrid_halvorsen", "tomas_reyes", "dolores_quinn"], eventIds: ids(["policy_proposed", "policy_vote", "argument", "election_declared", "eviction", "rent_missed"], ["jay_whitlock", "tomas_reyes"]), status: "climax", startedDay: 8, updatedDay: 12, heat: 9 },
    { id: "st_fish", title: "Two fishers, one buyer", summary: "Chen has a year of Devendra's price logs; Leo has told the harbourmaster about the weighted crate. Tunde is one bad week from joining a cooperative.", actors: ["chen_wei", "tunde_okafor", "devendra_rao", "leo_petrov", "idris_bello"], eventIds: ids(["argument", "conversation", "storyline", "transaction", "price_change"], ["chen_wei", "leo_petrov", "devendra_rao"]), status: "active", startedDay: 9, updatedDay: 12, heat: 7 },
    { id: "st_bakery", title: "The bakery loan", summary: "Two payments missed; Neil is bending policy for Mira and Tunde still doesn't know. Felix has seen the ledger.", actors: ["mira_okafor", "cornelius_ashdown", "tunde_okafor", "felix_ashdown"], eventIds: ids(["loan", "price_change"], ["mira_okafor"]), status: "brewing", startedDay: 6, updatedDay: 11, heat: 5 },
    { id: "st_boundary", title: "The boundary stone", summary: "Per and Fatima's dusk meetings by the disputed stone are no longer a secret to Gus. Anna still thinks the stone moved by itself.", actors: ["anna_lindqvist", "fatima_haddad", "per_lindqvist", "gus_ferreira"], eventIds: ids(["romance"], ["per_lindqvist"]), status: "brewing", startedDay: 10, updatedDay: 11, heat: 4 },
  ];
}

function makePapers(): Record<number, Newspaper> {
  return {
    12: {
      day: 12, masthead: "The Solmere Herald", headline: "Storm shuts harbour; rent-cap petition reaches Town Hall",
      stories: [
        { headline: "Fourteen signatures and one very angry mechanic", body: "Jay Whitlock, unemployed since the garage let him go in the spring, walked a rent-cap petition up the Town Hall steps at ten o'clock yesterday. Council member Marcus Vale — who owns eleven of the town's rentals, including Mr Whitlock's room — declined to comment, then commented at length. The council votes this morning." },
        { headline: "Boats stay in as the point takes the worst of it", body: "Harbourmaster Bello closed the office at four; the 'Patience' and the 'Second Chance' rode it out at the moorings. Fish Market stock will be sold cheap today. Your correspondent notes that the harbour wall, promised at every election since 2019, would have made this a smaller story." },
        { headline: "Anchor takings ‘light’, says landlord", body: "Big Jonah Kowalski told regulars the Drowned Anchor's till has been short three nights running. Nobody at the bar had a theory. Nobody at the bar had paid, either." },
      ],
      pricesColumn: "bread        ₡3.40  ▲\nfish         ₡5.20  ▼\ngrain       ₡14.80  ▲\nbeer         ₡4.00  –\nmeal         ₡9.50  ▲\nrent (wk)   ₡60.00  –",
      gossipCorner: "Seen: a certain postman reading a certain postcard twice. Heard: the doctor was at the tavern door long enough to hear his name. Asked: how old, exactly, is the newcomer at the inn?",
      editorial: "A harbour wall is not a campaign promise. It is a wall. The difference is that one of them stops water.",
    },
    11: {
      day: 11, masthead: "The Solmere Herald", headline: "Bakery raises bread again as flour bites",
      stories: [
        { headline: "Three-forty a loaf", body: "Okafor's Bakery lifted the price of a loaf for the second time this month. Mira Okafor blamed the grain shortage regionally and the bank locally, in that order." },
        { headline: "Teachers at odds over discipline", body: "Sources at the Schoolhouse describe a ‘frosty’ staff room after junior teacher Noor Rahman let the final-years run their own debate." },
      ],
      pricesColumn: "bread        ₡3.40  ▲\nfish         ₡6.10  –\ngrain       ₡14.20  ▲\nbeer         ₡4.00  –",
      gossipCorner: "Who bought two kegs from the brewery at noon, and why wasn't it the tavern?",
    },
  };
}

function makeConfessionals(): Confessional[] {
  return [
    { day: 11, npcId: "zara_okafor", mood: "sad", text: "Everyone under twenty-six in this town has an opinion about me and not one of them has asked what I want. I want out. I want to come back. Both. Is that allowed?" },
    { day: 11, npcId: "jonah_kowalski", mood: "tense", text: "Till's light. Third night. I'm not saying anyone's stealing. I'm saying I count it twice now and I hate that I count it twice." },
    { day: 11, npcId: "priya_nair", mood: "neutral", text: "I have a story that ends a man's career and I had coffee with him this morning. We talked about the weather. It was very good coffee." },
    { day: 12, npcId: "jay_whitlock", mood: "angry", text: "Seven days. He put it in writing the same afternoon the council threw the petition out. That's not a landlord, that's a message. Fine. I've got one too." },
    { day: 12, npcId: "beatrice_fontaine", mood: "content", text: "I run an inn. People tell an inn things. The boy stands like his father. I've said nothing. I'll say nothing. For now." },
    { day: 12, npcId: "walter_finch", mood: "sad", text: "They say leave it. Thirty-one years married and they say leave it. He was at the door. Good. Let him hear it." },
  ];
}

const NEW_EVENTS: Array<[EventType, string[], string | null, string, number]> = [
  ["transaction", ["lucia_moreno", "rosa_moreno"], "cafe", "Lucía closes out the lunch till: ₡84, best since the storm.", 1],
  ["gossip", ["sal_romano", "gus_ferreira"], "barber", "Gus tells Sal about the dusk meetings at the boundary stone.", 6],
  ["conversation", ["hana_kimura", "lucia_moreno"], "flat_kimura", "Hana and Lucía both admit they're leaving. Neither says when.", 5],
  ["argument", ["devendra_rao", "bakary_diallo"], "fish_market", "Devendra docks Bakary an hour for ‘talking to Chen’.", 7],
  ["romance", ["rafael_costa", "zara_okafor"], "town_square", "Rafa plays Zara's song in the square. She stops walking.", 7],
  ["policy_proposed", ["ingrid_halvorsen"], "town_hall", "The mayor moves to fund the harbour wall from the festival budget.", 8],
  ["world_event", [], "town_square", "The regional inspector arrives unannounced, clipboard first.", 8],
  ["price_change", ["lakshmi_rao"], "general_store", "Rao General Store raises grain to ₡15.10.", 3],
  ["friendship", ["sunny_adebayo", "kofi_mensah"], "carpentry", "Sunny and Kofi split a lunch and a secret about the loft.", 4],
  ["feud", ["jonah_kowalski", "wojciech_kowalski"], "brewery", "Jonah finds the café's kegs on Wojtek's delivery slate. Doors slam.", 9],
];

export function installDevMock(): () => void {
  const st = useWorld.getState();
  if (st.snapshot?.town === "Solmere (mock)") return () => {};

  const npcs = Object.keys(st.npcs).length ? st.npcs : makeNpcs();
  const businesses = makeBusinesses();
  const relationships = makeRelationships();
  const conversations = makeConversations();
  const events = makeEvents();
  const metricsHistory = makeMetrics();
  const metrics = metricsHistory[metricsHistory.length - 1];
  const election = makeElection();
  const policies = makePolicies();
  const loans = makeLoans();
  const storylines = makeStorylines(events);
  const papers = makePapers();
  const confessionals = makeConfessionals();
  const time = st.time ?? { day: DAY, hour: HOUR, minute: MINUTE, sleeping: false, wallMs: Date.now(), speed: 0.2, paused: false };

  const snapshot: WorldSnapshot = {
    town: "Solmere (mock)", time, npcs, businesses, relationships, conversations, election, policies, loans, metrics, metricsHistory, storylines,
    latestPaper: papers[12], activeWorldEvents: [{ cardId: "storm", title: "Storm off the point", endsDay: 13 }], lastEventSeq: seq - 1,
    llm: { callsToday: 412, costTodayUsd: 0.87, costTotalUsd: 9.42, failRate: 0.012, bulkModel: "deepseek/deepseek-v4-flash", midModel: "openai/gpt-5.6-luna" },
  };

  // link the live conversations to their participants
  for (const c of conversations) for (const p of c.participants) if (npcs[p]) npcs[p] = { ...npcs[p], conversationId: c.id, action: "talk", locationId: c.locationId };

  const convs: Record<string, Conversation> = {};
  for (const c of conversations) convs[c.id] = c;
  useWorld.setState({
    snapshot, time, npcs, businesses, conversations: convs, events, metrics, metricsHistory, election, storylines, confessionals,
    papers: { ...st.papers, ...papers },
    ui: {
      ...st.ui,
      connected: true,
      directorFocus: st.ui.directorFocus ?? { npcIds: ["chen_wei", "tunde_okafor"], locationId: "docks", reason: "prices again" },
    },
  });

  // ---- patch on-demand fetches ----
  const orig = { npc: api.npc, paper: api.paper, confessionals: api.confessionals, llm: api.llm, admin: api.admin };
  api.npc = async (id: string) => {
    const s = useWorld.getState();
    const state = s.npcs[id];
    if (!state) throw new Error(`${id}: 404`);
    const cast = CAST.find((c) => c.id === id);
    const rels = relationships.filter((r) => r.a === id);
    const memories: Memory[] = s.events.filter((e) => e.actors.includes(id)).slice(-12).map((e, i): Memory => ({
      id: `mem_${id}_${i}`, npcId: id, day: e.day, hour: e.hour, kind: e.type === "conversation" ? "conversation" : e.type === "gossip" ? "gossip" : "event", text: e.text, importance: e.importance, about: e.actors.filter((a) => a !== id),
    }));
    memories.push({ id: `mem_${id}_r`, npcId: id, day: DAY - 1, hour: 23, kind: "reflection", text: `Reflected on day ${DAY - 1}: ${pick(THOUGHTS)}`, importance: 8, about: [] });
    return { state, content: cast ? { age: cast.age, origin: "Born in Solmere; everyone remembers their parents.", traits: cast.traits, jobTitle: cast.jobTitle } : null, memories, relationships: rels, confessionals: s.confessionals.filter((c) => c.npcId === id) };
  };
  api.paper = async (day) => { const p = day === "latest" ? papers[12] : papers[day]; if (!p) throw new Error(`paper ${day}: 404`); return p; };
  api.confessionals = async (day) => confessionals.filter((c) => c.day === day);
  api.llm = async () => ({ calls: 4210, costUsd: 9.42, failures: 51, byKind: { plan: { calls: 600, costUsd: 0.9 }, react: { calls: 1900, costUsd: 1.6 }, converse: { calls: 1100, costUsd: 2.7 }, reflect: { calls: 550, costUsd: 3.1 }, paper: { calls: 12, costUsd: 0.4 }, business: { calls: 48, costUsd: 0.72 } } });
  api.admin = async (path, body) => {
    await new Promise((r) => setTimeout(r, 300));
    const s = useWorld.getState();
    if (path === "pause" || path === "resume") useWorld.setState({ time: { ...(s.time as NonNullable<typeof s.time>), paused: path === "pause" } });
    if (path === "speed") useWorld.setState({ time: { ...(s.time as NonNullable<typeof s.time>), speed: (body as { simMinutesPerRealSecond: number }).simMinutesPerRealSecond } });
    if (path === "inject") { const b = body as { cardId?: string; text?: string; targets?: string[]; drama?: number }; const t = s.time as NonNullable<typeof s.time>; s.applyFrame({ kind: "events", events: [ev(t.day, t.hour, t.minute, "world_event", b.targets ?? [], null, b.text ?? `Card played: ${b.cardId}`, b.drama ?? 7)] }); }
    return { ok: true };
  };

  // ---- ticker: the world moves a little ----
  let tick = 0;
  const timer = setInterval(() => {
    const s = useWorld.getState();
    if (!s.time || s.time.paused) return;
    tick++;
    let { hour, minute, day } = s.time;
    minute += 3; if (minute >= 60) { minute -= 60; hour++; } if (hour >= 24) { hour = 0; day++; }
    const changed = Object.values(s.npcs).filter(() => rnd() < 0.08).map((n) => ({
      id: n.id, pos: [n.pos[0] + rf(-1, 1), n.pos[1] + rf(-1, 1)] as [number, number], locationId: n.locationId, targetLocationId: n.targetLocationId, action: n.action,
      activity: n.activity, mood: rnd() < 0.3 ? wmood() : n.mood, thought: rnd() < 0.3 ? pick(THOUGHTS) : n.thought, conversationId: n.conversationId,
    }));
    s.applyFrame({ kind: "tick", time: { ...s.time, hour, minute, day, wallMs: Date.now() }, npcs: changed });
    if (tick % 4 === 0) {
      const t = NEW_EVENTS[(tick / 4 - 1) % NEW_EVENTS.length];
      s.applyFrame({ kind: "events", events: [ev(day, hour, minute, t[0], t[1], t[2], t[3], t[4])] });
    }
    if (tick % 40 === 0) {
      // start the conversations again so the live lines keep demoing
      for (const c of makeConversations()) s.applyFrame({ kind: "conversation", conversation: { ...c, id: `${c.id}_${tick}`, day, hour } });
    }
    if (tick % 3 === 0) {
      for (const c of Object.values(s.conversations)) {
        if (c.done) continue;
        const cursor = c.cursor + 1;
        s.applyFrame({ kind: "conversation", conversation: cursor >= c.lines.length ? { ...c, cursor: c.lines.length - 1, done: true } : { ...c, cursor } });
      }
    }
  }, 1500);

  return () => { clearInterval(timer); Object.assign(api, orig); };
}
