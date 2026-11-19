import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Memory, RelationshipState } from "@npcworld/schema";
import type { ActiveEffect, Gathering, NpcRuntime, World } from "./types.js";
import { ENGINE_ROOT } from "./content.js";
import { snapshot } from "./scheduler.js";
import { toSimTime } from "./clock.js";
import { relKey } from "./relationships.js";
import { syncMayorJob } from "./politics.js";
import { computeMetrics } from "./metrics.js";
import { startWalk } from "./movement.js";

export function dataDir(): string {
  return process.env.DATA_DIR ?? resolve(ENGINE_ROOT, "data");
}

interface SavedState {
  version: 1;
  savedAt: string;
  seed: string;
  clock: { day: number; dayMinutes: number; speed: number };
  snapshot: ReturnType<typeof snapshot>;
  rt: Record<string, NpcRuntime>;
  memories: Record<string, Memory[]>;
  papers: World["papers"];
  confessionals: World["confessionals"];
  conversationLog: World["conversationLog"];
  events: World["events"];
  eventsTotal: number;
  todayEvents: World["todayEvents"];
  yesterdayEvents: World["yesterdayEvents"];
  treasury: number;
  taxRate: number;
  rentMultiplier: number;
  funds: Record<string, number>;
  flags: string[];
  firedOnce: string[];
  effects: ActiveEffect[];
  gatherings: Gathering[];
  festivalDay: number | null;
  arcs?: World["arcs"];
  locationOverrides: Record<string, { sells?: string[]; buys?: string[] }>;
  employers: Record<string, string | null>;
  llm: World["llm"];
}

function ensureDir(): string {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function appendJsonl(path: string, rows: unknown[]): void {
  if (!rows.length) return;
  appendFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

/** Write data/snapshot.json (atomically) and append the day's events/papers/confessionals/memories. */
export function saveAll(w: World): string {
  const dir = ensureDir();
  const state: SavedState = {
    version: 1,
    savedAt: new Date().toISOString(),
    seed: w.seed,
    clock: { day: w.clock.day, dayMinutes: w.clock.dayMinutes, speed: w.clock.speed },
    snapshot: snapshot(w),
    rt: w.rt,
    memories: w.memories,
    papers: w.papers,
    confessionals: w.confessionals.slice(-2000),
    conversationLog: w.conversationLog.slice(-300),
    events: w.events.slice(-3000),
    eventsTotal: w.eventsTotal,
    todayEvents: w.todayEvents,
    yesterdayEvents: w.yesterdayEvents,
    treasury: w.treasury,
    taxRate: w.taxRate,
    rentMultiplier: w.rentMultiplier,
    funds: w.funds,
    flags: [...w.flags],
    firedOnce: [...w.firedOnce],
    effects: w.effects,
    gatherings: w.gatherings,
    festivalDay: w.festivalDay,
    arcs: w.arcs,
    locationOverrides: Object.fromEntries(w.content.town.locations.filter((l) => l.type === "business").map((l) => [l.id, { sells: l.sells, buys: l.buys }])),
    employers: Object.fromEntries(w.content.cast.npcs.map((n) => [n.id, n.employer])),
    llm: w.llm,
  };
  const path = resolve(dir, "snapshot.json");
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, path);
  appendJsonl(resolve(dir, "events.jsonl"), w.unsavedEvents.splice(0));
  appendJsonl(resolve(dir, "memories.jsonl"), w.unsavedMemories.splice(0));
  appendJsonl(resolve(dir, "papers.jsonl"), w.papers.filter((p) => !savedPaperDays.has(p.day)).map((p) => (savedPaperDays.add(p.day), p)));
  appendJsonl(resolve(dir, "confessionals.jsonl"), w.confessionals.slice(savedConfessionals));
  savedConfessionals = w.confessionals.length;
  return path;
}

const savedPaperDays = new Set<number>();
let savedConfessionals = 0;

export function snapshotExists(): boolean {
  return existsSync(resolve(dataDir(), "snapshot.json"));
}

/** Restore a world created from the same content. Returns false when there is nothing to resume. */
export function restore(w: World): boolean {
  const path = resolve(dataDir(), "snapshot.json");
  if (!existsSync(path)) return false;
  const s = JSON.parse(readFileSync(path, "utf8")) as SavedState;
  if (s.version !== 1) return false;
  const snap = s.snapshot;
  w.clock.day = s.clock.day;
  w.clock.dayMinutes = s.clock.dayMinutes;
  w.clock.speed = s.clock.speed;
  for (const [id, n] of Object.entries(snap.npcs)) if (w.npcs[id]) w.npcs[id] = { ...w.npcs[id], ...n, conversationId: null };
  for (const [id, b] of Object.entries(snap.businesses)) if (w.businesses[id]) w.businesses[id] = { ...w.businesses[id], ...b };
  w.rel = new Map<string, RelationshipState>(snap.relationships.map((r) => [relKey(r.a, r.b), r]));
  w.election = snap.election;
  w.policies = snap.policies;
  w.loans = snap.loans;
  w.metricsHistory = snap.metricsHistory;
  w.storylines = snap.storylines;
  w.lastEventSeq = snap.lastEventSeq;
  for (const [id, r] of Object.entries(s.rt)) if (w.rt[id]) w.rt[id] = { ...w.rt[id], ...r, busy: false, triggers: r.triggers ?? [], hereSinceMin: typeof r.hereSinceMin === "number" ? r.hereSinceMin : 0 };
  w.memories = s.memories ?? {};
  w.papers = s.papers ?? [];
  w.confessionals = s.confessionals ?? [];
  w.conversationLog = s.conversationLog ?? [];
  w.events = s.events ?? [];
  w.eventsTotal = s.eventsTotal ?? w.events.length;
  w.todayEvents = s.todayEvents ?? [];
  w.yesterdayEvents = s.yesterdayEvents ?? [];
  w.treasury = s.treasury;
  w.taxRate = s.taxRate;
  w.rentMultiplier = s.rentMultiplier;
  w.funds = s.funds ?? {};
  w.flags = new Set(s.flags);
  w.firedOnce = new Set(s.firedOnce);
  w.effects = s.effects ?? [];
  w.gatherings = s.gatherings ?? [];
  w.festivalDay = s.festivalDay;
  w.arcs = s.arcs ?? [];
  for (const [locId, o] of Object.entries(s.locationOverrides ?? {})) {
    const loc = w.content.locations[locId];
    if (!loc) continue;
    if (o.sells) loc.sells = o.sells;
    if (o.buys) loc.buys = o.buys;
  }
  for (const [id, employer] of Object.entries(s.employers ?? {})) if (w.content.npcs[id]) w.content.npcs[id].employer = employer;
  for (const n of w.content.cast.npcs) n.workplace = w.npcs[n.id]?.workplace ?? n.workplace;
  w.llm = { ...w.llm, ...s.llm, dayCostBase: w.brain.stats().costUsd - (s.llm?.costTodayUsd ?? 0), dayCallsBase: w.brain.stats().calls - (s.llm?.callsToday ?? 0) };
  syncMayorJob(w);
  // NPCs that were mid-walk get their route recomputed from where they stood
  for (const n of Object.values(w.npcs)) {
    const target = n.targetLocationId;
    if (!target) continue;
    n.targetLocationId = null;
    startWalk(w, n, target);
  }
  for (const p of w.papers) savedPaperDays.add(p.day);
  savedConfessionals = w.confessionals.length;
  w.time = toSimTime(w);
  w.metrics = snap.metrics ?? computeMetrics(w);
  return true;
}
