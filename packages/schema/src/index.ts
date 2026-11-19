/**
 * @npcworld/schema — the single source of truth for every type shared between
 * content files, the simulation engine, the LLM brain, and the web viewer.
 *
 * Rules:
 *  - Content JSON in /content must parse with the *Content* schemas.
 *  - The engine's public API (HTTP + SSE) speaks only the *State/Event* types.
 *  - The Brain interface is what the engine core depends on; the LLM package
 *    implements it, and a MockBrain implements it for tests.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

export const WealthClass = z.enum(["wealthy", "comfortable", "getting_by", "tight", "broke"]);
export type WealthClass = z.infer<typeof WealthClass>;

export const NpcContent = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().int().min(18),
  gender: z.string(),
  origin: z.string(),
  job: z.string(),
  jobTitle: z.string(),
  /** location id, "self" (owner), "town" (public payroll), an npc id (private employer) or null (no employer) */
  employer: z.string().nullable(),
  workplace: z.string(),
  home: z.string(),
  household: z.string(),
  wealthClass: WealthClass,
  traits: z.array(z.string()).length(3),
  want: z.string(),
  fear: z.string(),
  secret: z.string(),
  opinions: z.array(z.string()).length(2),
  speakingStyle: z.string(),
  rhythm: z.string(),
});
export type NpcContent = z.infer<typeof NpcContent>;

export const CastContent = z.object({
  version: z.number(),
  town: z.string(),
  rules: z.record(z.string()).optional(),
  npcs: z.array(NpcContent).length(50),
});
export type CastContent = z.infer<typeof CastContent>;

export const LocationType = z.enum(["business", "public", "workplace", "home", "open"]);
export const LocationContent = z.object({
  id: z.string(),
  name: z.string(),
  type: LocationType,
  district: z.string(),
  pos: z.tuple([z.number(), z.number()]),
  owner: z.string(), // npc id or "town"
  hours: z.tuple([z.number(), z.number()]).optional(), // [open, close]; close < open means past midnight
  capacity: z.number().int(),
  sells: z.array(z.string()).optional(),
  buys: z.array(z.string()).optional(),
  produces: z.array(z.string()).optional(),
});
export type LocationContent = z.infer<typeof LocationContent>;

export const TownContent = z.object({
  name: z.string(),
  tagline: z.string().optional(),
  mapSizeMeters: z.tuple([z.number(), z.number()]),
  clock: z.object({
    simHourRealMinutes: z.number(),
    sleepStart: z.number(),
    sleepEnd: z.number(),
    sleepBlockRealMinutes: z.number(),
    electionEveryDays: z.number(),
    rentEveryDays: z.number(),
    businessDecisionEveryDays: z.number(),
  }),
  districts: z.array(z.object({ id: z.string(), name: z.string(), center: z.tuple([z.number(), z.number()]) })),
  locations: z.array(LocationContent),
  note: z.string().optional(),
});
export type TownContent = z.infer<typeof TownContent>;

export const RelationshipType = z.enum(["family", "spouse", "romantic", "friend", "colleague", "rival", "business", "tenant", "mentor", "enemy"]);
export type RelationshipType = z.infer<typeof RelationshipType>;

export const RelationshipEdge = z.object({
  a: z.string(),
  b: z.string(),
  type: RelationshipType,
  affinity: z.number().min(-100).max(100),
  note: z.string().optional(),
});
export type RelationshipEdge = z.infer<typeof RelationshipEdge>;

export const SeededConflict = z.object({
  id: z.string(),
  title: z.string(),
  actors: z.array(z.string()),
  fuse: z.string(),
  domain: z.enum(["economy", "politics", "society"]),
});
export const RelationshipsContent = z.object({
  version: z.number(),
  scale: z.string().optional(),
  types: z.array(z.string()).optional(),
  edges: z.array(RelationshipEdge),
  seededConflicts: z.array(SeededConflict),
});
export type RelationshipsContent = z.infer<typeof RelationshipsContent>;

export const GoodContent = z.object({
  label: z.string(),
  unit: z.string(),
  basePrice: z.number(),
  perishDays: z.number(),
  producedAt: z.array(z.string()).optional(),
  from: z.string().optional(),
  import: z.boolean().optional(),
});
export const EconomyContent = z.object({
  currency: z.object({ name: z.string(), plural: z.string(), symbol: z.string() }),
  goods: z.record(GoodContent),
  needs: z.record(z.object({ decayPerHour: z.number(), satisfiedBy: z.array(z.string()), critical: z.number() })),
  wages: z.object({ note: z.string().optional(), public: z.record(z.number()), private: z.record(z.number()), ownerDraw: z.string().optional() }),
  startingWallets: z.record(z.union([z.number(), z.string()])),
  startingBusinessAccounts: z.record(z.number()),
  treasury: z.object({ start: z.number(), taxRate: z.number(), publicPayrollPerDay: z.number(), festivalBudgetDefault: z.number() }),
  bank: z.object({ loanRateWeekly: z.number(), maxLoanMultipleOfWallet: z.number(), defaultAfterMissedPayments: z.number() }),
  rent: z.object({ weekly: z.record(z.number()), evictAfterMissed: z.number() }),
  outsideMarket: z.object({ note: z.string().optional(), buyFloorMultiplier: z.number(), sellCeilingMultiplier: z.number(), dailyImportCap: z.number(), dailyExportCap: z.number() }),
  metrics: z.object({ cpiBasket: z.record(z.number()), publish: z.array(z.string()) }),
});
export type EconomyContent = z.infer<typeof EconomyContent>;

export const EventCard = z.object({
  id: z.string(),
  title: z.string(),
  weight: z.number(),
  once: z.boolean().optional(),
  everyNDays: z.number().optional(),
  requiresFlag: z.string().optional(),
  requiresDay: z.number().optional(),
  broadcast: z.union([z.literal("town"), z.array(z.string())]),
  text: z.string(),
  targets: z.array(z.string()).optional(),
  effects: z.record(z.any()),
  drama: z.number().min(0).max(10),
  /** "everyday" cards are small village news, drawn in their own daily slot */
  kind: z.enum(["drama", "everyday"]).optional(),
});
export type EventCard = z.infer<typeof EventCard>;
export const EventsContent = z.object({
  version: z.number(),
  rules: z.record(z.string()).optional(),
  deck: z.array(EventCard),
  policyProposals: z.record(z.object({ title: z.string(), effects: z.record(z.any()), for: z.array(z.string()).optional(), against: z.array(z.string()).optional() })),
});
export type EventsContent = z.infer<typeof EventsContent>;

/* ------------------------------------------------------------------ */
/* Live state                                                          */
/* ------------------------------------------------------------------ */

export const SimTime = z.object({
  day: z.number().int(), // 1-based
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  /** true while the 23:00–06:00 block is being fast-forwarded */
  sleeping: z.boolean(),
  /** wall-clock ms of the last tick, for the viewer to interpolate */
  wallMs: z.number(),
  /** sim minutes per real second; viewer uses it to tween positions */
  speed: z.number(),
  paused: z.boolean(),
});
export type SimTime = z.infer<typeof SimTime>;

export const Mood = z.enum(["elated", "happy", "content", "neutral", "tense", "sad", "angry", "afraid"]);
export type Mood = z.infer<typeof Mood>;

export const ActionKind = z.enum(["sleep", "walk", "work", "eat", "drink", "shop", "talk", "idle", "leisure", "worship", "create", "speech", "vote", "confess", "sick"]);
export type ActionKind = z.infer<typeof ActionKind>;

export const Needs = z.object({ food: z.number(), rest: z.number(), social: z.number(), leisure: z.number(), purpose: z.number() });
export type Needs = z.infer<typeof Needs>;

export const PlanStep = z.object({
  startHour: z.number().min(0).max(23),
  endHour: z.number().min(0).max(24),
  action: ActionKind,
  location: z.string(), // location id
  intent: z.string(), // short first-person text, shown as subtitle
  with: z.array(z.string()).optional(), // npc ids they hope to meet
});
export type PlanStep = z.infer<typeof PlanStep>;

export const NpcState = z.object({
  id: z.string(),
  name: z.string(),
  pos: z.tuple([z.number(), z.number()]),
  /** where they are or are walking to */
  locationId: z.string(),
  targetLocationId: z.string().nullable(),
  action: ActionKind,
  /** short present-tense line for the viewer: "arguing with Devendra about prices" */
  activity: z.string(),
  /** the NPC's current inner line, from the last LLM call */
  thought: z.string(),
  mood: Mood,
  needs: Needs,
  wallet: z.number(),
  debt: z.number(),
  employed: z.boolean(),
  job: z.string(),
  jobTitle: z.string(),
  home: z.string(),
  workplace: z.string(),
  plan: z.array(PlanStep),
  planStepIndex: z.number().int(),
  /** ids of the conversation they are in, if any */
  conversationId: z.string().nullable(),
  sickDays: z.number().int().default(0),
  /** opinion of the mayor -100..100, updated in reflections */
  mayorOpinion: z.number(),
  /** 0..100 rolling happiness from reflections */
  happiness: z.number(),
});
export type NpcState = z.infer<typeof NpcState>;

export const BusinessState = z.object({
  locationId: z.string(),
  owner: z.string(),
  account: z.number(),
  inventory: z.record(z.number()),
  prices: z.record(z.number()),
  employees: z.array(z.string()),
  wageOverrides: z.record(z.number()).optional(),
  revenueToday: z.number(),
  costsToday: z.number(),
  pnlHistory: z.array(z.object({ day: z.number(), revenue: z.number(), costs: z.number() })),
  open: z.boolean(),
});
export type BusinessState = z.infer<typeof BusinessState>;

export const Loan = z.object({ id: z.string(), borrower: z.string(), principal: z.number(), balance: z.number(), weeklyRate: z.number(), missedPayments: z.number(), createdDay: z.number() });
export type Loan = z.infer<typeof Loan>;

export const Policy = z.object({ id: z.string(), title: z.string(), proposedBy: z.string(), proposedDay: z.number(), status: z.enum(["proposed", "passed", "rejected"]), votes: z.record(z.boolean()), effects: z.record(z.any()) });
export type Policy = z.infer<typeof Policy>;

export const ElectionState = z.object({
  nextElectionDay: z.number(),
  phase: z.enum(["quiet", "declared", "campaign", "voting", "counted"]),
  candidates: z.array(z.object({ npcId: z.string(), platform: z.string(), declaredDay: z.number() })),
  speeches: z.array(z.object({ npcId: z.string(), day: z.number(), text: z.string() })),
  lastResult: z.object({ day: z.number(), tally: z.record(z.number()), winner: z.string() }).nullable(),
  mayor: z.string(),
  council: z.array(z.string()).length(5),
  approval: z.number(), // -100..100 aggregate of mayorOpinion
  approvalHistory: z.array(z.object({ day: z.number(), approval: z.number() })),
});
export type ElectionState = z.infer<typeof ElectionState>;

export const Metrics = z.object({
  day: z.number(),
  gdpToday: z.number(),
  cpi: z.number(), // 1.0 = starting basket
  unemployment: z.number(), // 0..1
  treasury: z.number(),
  gini: z.number(),
  happiness: z.number(), // 0..100 mean
  loansOutstanding: z.number(),
  missedRent: z.number(),
  missedWages: z.number(),
  priceIndex: z.record(z.number()), // good -> current mean price
  cohesion: z.number(), // 0..1 mean positive-edge density
  lonely: z.array(z.string()), // npcs with no positive edge
});
export type Metrics = z.infer<typeof Metrics>;

export const RelationshipState = z.object({ a: z.string(), b: z.string(), type: RelationshipType, affinity: z.number(), lastInteractionDay: z.number().nullable() });
export type RelationshipState = z.infer<typeof RelationshipState>;

export const ConversationLine = z.object({ speaker: z.string(), text: z.string() });
export const Conversation = z.object({
  id: z.string(),
  day: z.number(),
  hour: z.number(),
  locationId: z.string(),
  participants: z.array(z.string()),
  lines: z.array(ConversationLine),
  /** index of the line currently being "spoken" in the viewer */
  cursor: z.number().int(),
  done: z.boolean(),
  summary: z.string(),
  drama: z.number().min(0).max(10),
});
export type Conversation = z.infer<typeof Conversation>;

export const EventType = z.enum([
  "system", "arrival", "transaction", "wage", "wage_missed", "rent", "rent_missed", "eviction", "loan", "loan_default",
  "hired", "fired", "quit", "price_change", "conversation", "argument", "romance", "breakup", "friendship", "feud",
  "gossip", "policy_proposed", "policy_vote", "election_declared", "speech", "vote", "election_result", "world_event",
  "newspaper", "confessional", "reflection", "sick", "recovered", "festival", "crime", "windfall", "storyline",
]);
export type EventType = z.infer<typeof EventType>;

export const WorldEvent = z.object({
  id: z.string(),
  seq: z.number().int(), // monotonically increasing; clients page with ?since=seq
  day: z.number(),
  hour: z.number(),
  minute: z.number(),
  type: EventType,
  actors: z.array(z.string()),
  locationId: z.string().nullable(),
  text: z.string(), // one line, viewer-ready
  importance: z.number().min(0).max(10), // for memory
  drama: z.number().min(0).max(10), // for the director
  data: z.record(z.any()).optional(),
});
export type WorldEvent = z.infer<typeof WorldEvent>;

export const NewspaperStory = z.object({ headline: z.string(), body: z.string(), sourceEventIds: z.array(z.string()).optional() });
export const Newspaper = z.object({
  day: z.number(),
  masthead: z.string(),
  headline: z.string(),
  stories: z.array(NewspaperStory).min(1).max(4),
  pricesColumn: z.string(),
  gossipCorner: z.string(),
  editorial: z.string().optional(),
});
export type Newspaper = z.infer<typeof Newspaper>;

export const Confessional = z.object({ day: z.number(), npcId: z.string(), text: z.string(), mood: Mood });
export type Confessional = z.infer<typeof Confessional>;

export const Storyline = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  actors: z.array(z.string()),
  eventIds: z.array(z.string()),
  status: z.enum(["brewing", "active", "climax", "resolved"]),
  startedDay: z.number(),
  updatedDay: z.number(),
  heat: z.number().min(0).max(10),
});
export type Storyline = z.infer<typeof Storyline>;

export const Memory = z.object({
  id: z.string(),
  npcId: z.string(),
  day: z.number(),
  hour: z.number(),
  kind: z.enum(["observation", "conversation", "reflection", "plan", "event", "gossip"]),
  text: z.string(),
  importance: z.number().min(0).max(10),
  about: z.array(z.string()), // npc ids referenced
  embedding: z.array(z.number()).optional(),
});
export type Memory = z.infer<typeof Memory>;

/** The full snapshot the viewer loads on connect. */
export const WorldSnapshot = z.object({
  town: z.string(),
  time: SimTime,
  npcs: z.record(NpcState),
  businesses: z.record(BusinessState),
  relationships: z.array(RelationshipState),
  conversations: z.array(Conversation), // active only
  election: ElectionState,
  policies: z.array(Policy),
  loans: z.array(Loan),
  metrics: Metrics,
  metricsHistory: z.array(Metrics),
  storylines: z.array(Storyline),
  latestPaper: Newspaper.nullable(),
  activeWorldEvents: z.array(z.object({ cardId: z.string(), title: z.string(), endsDay: z.number() })),
  lastEventSeq: z.number(),
  llm: z.object({ callsToday: z.number(), costTodayUsd: z.number(), costTotalUsd: z.number(), failRate: z.number(), bulkModel: z.string(), midModel: z.string() }),
});
export type WorldSnapshot = z.infer<typeof WorldSnapshot>;

/** SSE frames from GET /api/stream */
export const StreamFrame = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snapshot"), snapshot: WorldSnapshot }),
  z.object({ kind: z.literal("tick"), time: SimTime, npcs: z.array(NpcState.pick({ id: true, pos: true, locationId: true, targetLocationId: true, action: true, activity: true, mood: true, thought: true, conversationId: true })) }),
  /**
   * High-rate position-only frame. Sent several times a second so the viewer has
   * enough samples to interpolate smoothly; the heavy `tick` frame (thoughts,
   * activities, moods) stays at 1 Hz. `p` is a flat array of [x, z] pairs in the
   * same order as `ids`, rounded to 2 dp — about 25x smaller than a full tick.
   * `t` is the sender's wall clock, used by the client's interpolation buffer.
   */
  z.object({ kind: z.literal("pos"), t: z.number(), ids: z.array(z.string()), p: z.array(z.number()) }),
  z.object({ kind: z.literal("events"), events: z.array(WorldEvent) }),
  z.object({ kind: z.literal("conversation"), conversation: Conversation }),
  z.object({ kind: z.literal("metrics"), metrics: Metrics }),
  z.object({ kind: z.literal("election"), election: ElectionState }),
  z.object({ kind: z.literal("paper"), paper: Newspaper }),
  z.object({ kind: z.literal("confessional"), confessional: Confessional }),
  z.object({ kind: z.literal("storylines"), storylines: z.array(Storyline) }),
  z.object({ kind: z.literal("npc"), npc: NpcState }),
  z.object({ kind: z.literal("business"), business: BusinessState }),
]);
export type StreamFrame = z.infer<typeof StreamFrame>;

/* ------------------------------------------------------------------ */
/* Brain (LLM) contract                                                */
/* ------------------------------------------------------------------ */

/** Everything the brain is allowed to see about "me" right now. Built by the engine core. */
export const BrainContext = z.object({
  self: NpcContent,
  state: NpcState,
  time: SimTime,
  /** compact lines: "Devendra Rao (fish trader) — rival, -55: has a year of price logs" */
  relationships: z.array(z.string()),
  /** retrieved memories, most relevant first, already rendered as text */
  memories: z.array(z.string()),
  /** what is happening around me right now */
  here: z.object({ locationId: z.string(), locationName: z.string(), present: z.array(z.string()), openNow: z.boolean() }),
  /** town-level facts the NPC would know */
  world: z.object({ mayor: z.string(), daysToElection: z.number(), headlines: z.array(z.string()), prices: z.record(z.number()), activeEvents: z.array(z.string()) }),
  /** last reflection text, if any */
  lastReflection: z.string().nullable(),
  /** the thing that triggered this call, for react() */
  trigger: z.string().nullable(),
  /** location ids + names the NPC can go to */
  places: z.array(z.object({ id: z.string(), name: z.string(), type: LocationType })),
  /** today's direction from the story director: a story beat for drivers, an ordinary-day hook for everyone else */
  story: z.string().nullable().optional(),
});
export type BrainContext = z.infer<typeof BrainContext>;

export const DayPlan = z.object({
  steps: z.array(PlanStep).min(3).max(12),
  /** one line the viewer shows at wake-up */
  morningThought: z.string(),
  mood: Mood,
});
export type DayPlan = z.infer<typeof DayPlan>;

export const Reaction = z.object({
  /** "continue" keeps the current plan; otherwise the plan is replaced from the current hour */
  decision: z.enum(["continue", "replan", "interrupt"]),
  thought: z.string(),
  mood: Mood,
  newSteps: z.array(PlanStep).optional(),
  /** immediate one-off action, e.g. { action: "talk", target: "chen_wei" } */
  immediate: z.object({ action: ActionKind, location: z.string().optional(), target: z.string().optional() }).optional(),
});
export type Reaction = z.infer<typeof Reaction>;

export const ConverseInput = z.object({
  participants: z.array(BrainContext).min(2).max(3),
  locationName: z.string(),
  /** why they're talking: "ran into each other", "Chen wanted to talk about prices" */
  pretext: z.string(),
  /** what these people already said to each other recently (oldest first) */
  history: z.array(z.string()).optional(),
  /** topics the whole town has already talked to death today */
  avoidTopics: z.array(z.string()).optional(),
});
export const ConverseOutput = z.object({
  lines: z.array(ConversationLine).min(2).max(10),
  summary: z.string(),
  /** per participant */
  outcomes: z.array(z.object({
    npcId: z.string(),
    memory: z.string(),
    importance: z.number().min(0).max(10),
    mood: Mood,
    /** affinity deltas toward the other participants */
    affinityDelta: z.record(z.number().min(-30).max(30)),
    /** something they learned about a third party, if any */
    gossipLearned: z.string().optional(),
  })),
  drama: z.number().min(0).max(10),
  /** e.g. "argument", "romance", "friendship", "feud", "gossip" or null */
  eventType: EventType.nullable(),
});
export type ConverseInput = z.infer<typeof ConverseInput>;
export type ConverseOutput = z.infer<typeof ConverseOutput>;

export const Reflection = z.object({
  summary: z.string(), // long-term memory entry, importance 8
  insights: z.array(z.string()).max(3),
  mayorOpinionDelta: z.number().min(-30).max(30),
  happiness: z.number().min(0).max(100),
  goalsUpdate: z.string(),
  mood: Mood,
  /** storyline tags in the NPC's own words: "the bakery loan" */
  storylineTags: z.array(z.string()).max(3),
});
export type Reflection = z.infer<typeof Reflection>;

export const BusinessDecision = z.object({
  prices: z.record(z.number()),
  hire: z.string().nullable(), // npc id
  fire: z.string().nullable(),
  takeLoan: z.number().nullable(),
  reasoning: z.string(),
  publicStatement: z.string().nullable(), // becomes an event if present
});
export type BusinessDecision = z.infer<typeof BusinessDecision>;

export const PoliticsDecision = z.object({
  /** for mayor/council: propose a policy id from content, or null */
  propose: z.string().nullable(),
  /** vote on the open policy, if any */
  vote: z.boolean().nullable(),
  /** declare candidacy in the election window */
  declareCandidacy: z.boolean(),
  platform: z.string().nullable(),
  reasoning: z.string(),
});
export type PoliticsDecision = z.infer<typeof PoliticsDecision>;

export const VoteDecision = z.object({ candidate: z.string(), reasoning: z.string() });
export type VoteDecision = z.infer<typeof VoteDecision>;

export const StorylineUpdate = z.object({ storylines: z.array(Storyline) });

export const ArcChoice = z.object({
  optionId: z.string(),
  /** one first-person line: why they chose it */
  reason: z.string(),
});
export type ArcChoice = z.infer<typeof ArcChoice>;

export interface Brain {
  plan(ctx: BrainContext): Promise<DayPlan>;
  react(ctx: BrainContext): Promise<Reaction>;
  converse(input: ConverseInput): Promise<ConverseOutput>;
  reflect(ctx: BrainContext): Promise<Reflection>;
  confessional(ctx: BrainContext, reflection: Reflection): Promise<Confessional>;
  businessDecision(ctx: BrainContext, business: BusinessState, competitors: Record<string, number>): Promise<BusinessDecision>;
  politics(ctx: BrainContext, election: ElectionState, openPolicy: Policy | null, proposals: Record<string, string>): Promise<PoliticsDecision>;
  speech(ctx: BrainContext, platform: string): Promise<string>;
  vote(ctx: BrainContext, candidates: Array<{ npcId: string; name: string; platform: string; speech: string }>): Promise<VoteDecision>;
  writePaper(day: number, events: WorldEvent[], prices: Record<string, number>, journalist: BrainContext): Promise<Newspaper>;
  updateStorylines(existing: Storyline[], recentEvents: WorldEvent[], day: number): Promise<Storyline[]>;
  /** the decider in a story arc makes their choice (optional; the engine falls back to a weighted pick) */
  resolveArc?(ctx: BrainContext, question: string, options: Array<{ id: string; fact: string }>): Promise<ArcChoice>;
  embed(texts: string[]): Promise<number[][]>;
  /** cumulative telemetry */
  stats(): { calls: number; costUsd: number; failures: number; bulkModel: string; midModel: string };
}

/* ------------------------------------------------------------------ */
/* Engine HTTP API contract (apps/engine serves; apps/web consumes)    */
/* ------------------------------------------------------------------ */

export const EngineApi = {
  snapshot: "GET /api/state -> WorldSnapshot",
  stream: "GET /api/stream (SSE) -> StreamFrame per message; first frame is a snapshot",
  events: "GET /api/events?since=<seq>&limit=200 -> WorldEvent[]",
  npc: "GET /api/npcs/:id -> { state: NpcState, content: NpcContent, memories: Memory[] (last 30), relationships: RelationshipState[], confessionals: Confessional[] }",
  paper: "GET /api/paper/:day -> Newspaper | 404 ; GET /api/paper/latest",
  confessionals: "GET /api/confessionals/:day -> Confessional[]",
  conversations: "GET /api/conversations?day=<n> -> Conversation[]",
  metrics: "GET /api/metrics -> Metrics[] (history)",
  election: "GET /api/election -> ElectionState",
  storylines: "GET /api/storylines -> Storyline[]",
  llm: "GET /api/llm -> { calls, costUsd, failures, byKind: Record<string,{calls,costUsd}> , last50: {...}[] }",
  adminPause: "POST /api/admin/pause | /resume",
  adminSpeed: "POST /api/admin/speed { simMinutesPerRealSecond }",
  adminInject: "POST /api/admin/inject { cardId } | { text, targets?: string[], drama? }",
  adminSave: "POST /api/admin/save -> writes a snapshot to disk",
  health: "GET /healthz -> { ok, day, uptimeSec, llmOk }",
} as const;

export const ADMIN_HEADER = "x-admin-token";
