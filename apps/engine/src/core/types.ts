import type {
  Brain, BusinessState, Confessional, Conversation, ElectionState, Loan, Memory, Metrics, Newspaper,
  NpcState, Policy, RelationshipState, SimTime, Storyline, StreamFrame, WorldEvent, PlanStep,
} from "@npcworld/schema";
import type { Content } from "./content.js";
import type { ArcState, StoryDay } from "./story.js";
import type { Rng } from "./rng.js";

/** Per-NPC engine-only bookkeeping (never leaves the process except via snapshot.json). */
export interface NpcRuntime {
  wakeHour: number; // float hours
  bedHour: number; // float hours, may be < wakeHour (night people)
  plannedDay: number; // last day a plan() ran
  reflectedDay: number;
  /** absolute sim-minute the NPC arrived at locationId (Infinity while walking) */
  hereSinceMin: number;
  lastConvAbsHour: number; // absolute sim-hour of the last conversation start
  convCheckedAbsHour: number; // absolute sim-hour of the last random-chat roll
  lastReactAbsMin: number;
  reactsToday: number;
  /** notable things since the last react(); consumed by the next react trigger */
  notable: string[];
  /** pending react triggers, processed one at a time */
  triggers: string[];
  criticalNeedDay: Partial<Record<string, number>>;
  wagePaidDay: number;
  workedToday: boolean;
  /** personal goods stock (a fisher's crates before the market buys them) */
  stock: Record<string, number>;
  tenancy: { missedRent: number; arrears: number };
  /** a plan()/react() call is in flight */
  busy: boolean;
  lastReflection: string | null;
  /** key of the plan step currently being executed ("startHour:action:location") */
  stepKey: string | null;
  /** action started at the current location for the current step */
  acted: boolean;
  /** absolute sim-minute the current action began (for "ate already" etc.) */
  actionStartMin: number;
  sleeping: boolean;
  fired: boolean;
  evicted: boolean;
  /** extra steps injected by gatherings/festivals for the current day */
  injected: PlanStep[];
}

export interface ActiveEffect {
  cardId: string;
  title: string;
  endsDay: number; // inclusive
  produceMultiplier?: Record<string, number>;
  demandMultiplier?: Record<string, number>;
  closeLocations?: string[];
  outsideMarketPriceMultiplier?: Record<string, number>;
  outsideMarketCapMultiplier?: number;
  importBlocked?: string[];
}

export interface Gathering {
  day: number;
  hour: number;
  location: string;
  npcs: string[] | "any";
  reason: string;
  done: boolean;
}

export interface ClockState {
  day: number;
  /** minutes since 00:00, fractional */
  dayMinutes: number;
  /** sim minutes per real second in real-time mode */
  speed: number;
  paused: boolean;
  headless: boolean;
  /** sim minutes advanced per headless tick */
  headlessStep: number;
  wallMs: number;
  totalTicks: number;
}

export interface LlmCallRecord {
  kind: string;
  npc: string | null;
  day: number;
  hour: number;
  ms: number;
  ok: boolean;
  costUsd: number;
  error?: string;
}

export interface LlmTelemetry {
  calls: number;
  failures: number;
  costUsd: number;
  byKind: Record<string, { calls: number; costUsd: number; failures: number }>;
  last50: LlmCallRecord[];
  callsToday: number;
  costTodayUsd: number;
  /** brain.stats().costUsd at the start of the sim-day */
  dayCostBase: number;
  dayCallsBase: number;
}

/** `json` is the frame already serialised once for all listeners; use it when present. */
export type FrameListener = (frame: StreamFrame, json?: string) => void;

export interface World {
  content: Content;
  rng: Rng;
  seed: string;
  brain: Brain;
  clock: ClockState;
  time: SimTime;

  npcs: Record<string, NpcState>;
  rt: Record<string, NpcRuntime>;
  businesses: Record<string, BusinessState>;
  /** key "a|b" -> directed edge */
  rel: Map<string, RelationshipState>;
  conversations: Conversation[]; // active
  conversationLog: Conversation[]; // finished (capped)
  election: ElectionState;
  policies: Policy[];
  loans: Loan[];
  metrics: Metrics;
  metricsHistory: Metrics[];
  storylines: Storyline[];
  papers: Newspaper[];
  confessionals: Confessional[];
  memories: Record<string, Memory[]>;
  /** memories not yet flushed to memories.jsonl */
  unsavedMemories: Memory[];
  events: WorldEvent[]; // recent (capped)
  unsavedEvents: WorldEvent[];
  todayEvents: WorldEvent[];
  yesterdayEvents: WorldEvent[];
  eventsTotal: number;
  lastEventSeq: number;

  treasury: number;
  taxRate: number;
  rentMultiplier: number;
  funds: Record<string, number>;
  flags: Set<string>;
  firedOnce: Set<string>;
  effects: ActiveEffect[];
  gatherings: Gathering[];
  festivalDay: number | null;
  /** story director state (core/story.ts) */
  arcs: ArcState[];
  story: StoryDay | null;
  outside: { importedToday: number; exportedToday: number; marketCratesToday: number };
  gdpToday: number;
  missedRentToday: number;
  missedWagesToday: number;
  degraded: boolean;
  llm: LlmTelemetry;

  listeners: Set<FrameListener>;
  /** called at 23:59 every sim-day (persistence hooks in) */
  nightlyHooks: Array<(w: World) => void | Promise<void>>;
  /** in-flight brain tasks; headless mode awaits them every tick */
  pending: Set<Promise<unknown>>;
  /** human-readable log lines (headless mode prints them) */
  log: (line: string) => void;
  startedAt: number;
}
