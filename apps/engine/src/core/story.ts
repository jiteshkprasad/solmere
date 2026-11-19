/**
 * Story director. Seeded conflicts become arcs that move simmer -> incident -> confront -> decision -> aftermath,
 * a stage every day or two, with at most MAX_LIVE arcs live at once. Each day a handful of "drivers" get the
 * current beat as their direction; everyone else gets an ordinary-day hook. The decider's choice at the decision
 * stage is made by the brain (resolveArc) and becomes a fact: memories, gossip, money, affinity, a policy.
 */
import type { ArcChoice } from "@npcworld/schema";
import type { World } from "./types.js";
import { emit } from "./eventlog.js";
import { addMemory } from "./memory.js";
import { addGossip, applyAffinity } from "./relationships.js";
import { proposePolicy } from "./events.js";
import { npcAcct, transfer } from "./ledger.js";
import { brainCall, track } from "./brainRunner.js";
import { buildContext } from "./context.js";

export const STAGES = ["simmer", "incident", "confront", "decision", "aftermath", "done"] as const;
export type Stage = (typeof STAGES)[number];

const MAX_LIVE = 3;
/** days a stage lasts: [min, max] */
const STAGE_DAYS: Record<Stage, [number, number]> = {
  simmer: [1, 1], incident: [1, 1], confront: [1, 2], decision: [1, 1], aftermath: [2, 2], done: [0, 0],
};

export interface ArcEffects {
  affinity?: Array<[string, string, number]>;
  money?: [string, string, number];
  mood?: Record<string, number>;
  policy?: string;
  gossip?: string;
  approval?: number;
}
export interface ArcOption { id: string; fact: string; effects: ArcEffects }
export interface ArcContent {
  id: string;
  title: string;
  incident: { text: string; drivers: string[] };
  confront: { note: string; drivers: string[] };
  decision: { decider: string; question: string; options: ArcOption[] };
  aftermath: string;
}
export interface ArcsContent { version: number; arcs: ArcContent[]; ordinaryDay: string[] }

export interface ArcState {
  id: string;
  stage: Stage;
  /** day the current stage started */
  since: number;
  /** day the next stage starts */
  nextDay: number;
  choice: string | null;
  fact: string | null;
}

export interface StoryDay {
  day: number;
  /** npcId -> direction for today */
  notes: Record<string, string>;
  /** npcId -> arc id they drive today */
  arcOf: Record<string, string>;
}

function arcContent(w: World, id: string): ArcContent | undefined {
  return w.content.arcs?.arcs.find((a) => a.id === id);
}

function actorsOf(w: World, id: string): string[] {
  const seeded = w.content.relationships.seededConflicts.find((c) => c.id === id);
  const a = arcContent(w, id);
  const set = new Set<string>([...(seeded?.actors ?? []), ...(a?.incident.drivers ?? []), ...(a?.confront.drivers ?? []), ...(a ? [a.decision.decider] : [])]);
  return [...set].filter((x) => w.npcs[x]);
}

function stageLength(w: World, stage: Stage): number {
  const [lo, hi] = STAGE_DAYS[stage];
  return lo + w.rng.int(hi - lo + 1);
}

function live(w: World): ArcState[] {
  return w.arcs.filter((a) => a.stage !== "done");
}

/** 00:00 every day: advance arcs, start new ones, work out who drives what today. */
export function storyNewDay(w: World): void {
  if (!w.content.arcs) return;
  const day = w.clock.day;
  for (const arc of live(w)) {
    if (arc.nextDay > day) continue;
    const next = STAGES[STAGES.indexOf(arc.stage) + 1];
    enterStage(w, arc, next);
  }
  startArcs(w);
  planDay(w);
}

function startArcs(w: World): void {
  const day = w.clock.day;
  const arcs = w.content.arcs!.arcs;
  const started = new Set(w.arcs.map((a) => a.id));
  // one new arc a day at most after day 1, so stories overlap instead of firing together
  let budget = day === 1 ? MAX_LIVE : 1;
  while (live(w).length < MAX_LIVE && budget > 0) {
    const busy = new Set(live(w).flatMap((a) => actorsOf(w, a.id)));
    const fresh = arcs.filter((a) => !started.has(a.id));
    if (!fresh.length) break;
    // prefer arcs whose people are not already in a live story
    const scored = w.rng.shuffle(fresh).map((a) => ({ a, overlap: actorsOf(w, a.id).filter((x) => busy.has(x)).length }));
    scored.sort((x, y) => x.overlap - y.overlap);
    const pick = scored[0].a;
    // on day 1 the three opening arcs come to a head on days 2, 3 and 4, so a new visitor never waits long for drama
    const state: ArcState = { id: pick.id, stage: "simmer", since: day, nextDay: day + stageLength(w, "simmer") + (day === 1 ? live(w).length : 0), choice: null, fact: null };
    w.arcs.push(state);
    started.add(pick.id);
    w.log(`D${day} 00:00  [story] arc starts: ${pick.title} (next stage day ${state.nextDay})`);
    budget--;
  }
}

function enterStage(w: World, arc: ArcState, stage: Stage): void {
  const day = w.clock.day;
  const a = arcContent(w, arc.id);
  arc.stage = stage;
  arc.since = day;
  arc.nextDay = day + Math.max(1, stageLength(w, stage));
  w.log(`D${day} 00:00  [story] ${a?.title ?? arc.id}: ${stage}`);
  if (!a) return;
  const actors = actorsOf(w, arc.id);
  if (stage === "incident") {
    emit(w, "world_event", a.incident.text, { actors: a.incident.drivers, locationId: null, drama: 6, importance: 6, witnesses: actors, data: { arcId: arc.id, stage, title: a.title } });
    for (const id of actors) addMemory(w, id, "event", a.incident.text, a.incident.drivers.includes(id) ? 8 : 6, a.incident.drivers);
    for (const id of w.rng.shuffle(Object.keys(w.npcs).filter((x) => !actors.includes(x))).slice(0, 3)) addGossip(w, id, `Heard: ${a.incident.text}`, a.incident.drivers);
  }
  if (stage === "confront") {
    const [first, ...rest] = a.confront.drivers.filter((x) => w.npcs[x]);
    const where = first && w.content.locations[w.npcs[first].workplace] ? w.npcs[first].workplace : "tavern";
    if (first) w.gatherings.push({ day, hour: 16, location: where, npcs: [first, ...rest], reason: a.title.toLowerCase(), done: false });
  }
  if (stage === "decision") track(w, decide(w, arc, a));
}

async function decide(w: World, arc: ArcState, a: ArcContent): Promise<void> {
  const decider = a.decision.decider;
  const options = a.decision.options;
  const fallback = (): ArcChoice => ({ optionId: w.rng.pick(options).id, reason: "" });
  let choice: ArcChoice = fallback();
  if (w.brain.resolveArc && w.npcs[decider]) {
    const ctx = buildContext(w, decider, `DECISION: ${a.decision.question}`, `${a.title} ${a.decision.question}`);
    choice = await brainCall(w, "arc", decider, () => w.brain.resolveArc!(ctx, a.decision.question, options.map((o) => ({ id: o.id, fact: o.fact }))), fallback);
  }
  const opt = options.find((o) => o.id === choice.optionId) ?? w.rng.pick(options);
  arc.choice = opt.id;
  arc.fact = opt.fact;
  applyArcEffects(w, opt.effects, a.title);
  const actors = actorsOf(w, arc.id);
  emit(w, "world_event", opt.fact, { actors: [decider, ...a.confront.drivers.filter((x) => x !== decider)].filter((x) => w.npcs[x]), locationId: w.npcs[decider]?.locationId ?? null, drama: 8, importance: 8, witnesses: actors, data: { arcId: arc.id, stage: "decision", choice: opt.id, title: a.title } });
  for (const id of actors) addMemory(w, id, "event", id === decider && choice.reason ? `I decided: ${opt.fact} ${choice.reason}` : opt.fact, 9, [decider]);
  for (const id of w.rng.shuffle(Object.keys(w.npcs).filter((x) => !actors.includes(x))).slice(0, 6)) addGossip(w, id, `Heard: ${opt.fact}`, [decider]);
  for (const id of actors) w.rt[id]?.triggers.push(`NEWS: ${opt.fact}`);
  w.log(`D${w.clock.day}        [story] ${a.title}: ${w.npcs[decider]?.name ?? decider} chose "${opt.id}"${choice.reason ? ` (${choice.reason})` : ""}`);
}

function applyArcEffects(w: World, e: ArcEffects, title: string): void {
  for (const [a, b, d] of e.affinity ?? []) if (w.npcs[a] && w.npcs[b]) applyAffinity(w, a, b, d, null);
  if (e.money) {
    const [from, to, amount] = e.money;
    if (w.npcs[from] && w.npcs[to]) transfer(w, npcAcct(from), npcAcct(to), Math.min(amount, Math.max(0, w.npcs[from].wallet)), { trade: false });
  }
  for (const [id, d] of Object.entries(e.mood ?? {})) if (w.npcs[id]) w.npcs[id].happiness = Math.max(0, Math.min(100, w.npcs[id].happiness + d));
  if (e.policy) proposePolicy(w, e.policy, "petition");
  if (e.gossip) for (const id of w.rng.shuffle(Object.keys(w.npcs)).slice(0, 5)) addGossip(w, id, `Heard: ${e.gossip}.`);
  if (e.approval) for (const n of Object.values(w.npcs)) n.mayorOpinion = Math.max(-100, Math.min(100, n.mayorOpinion + e.approval * 2));
  void title;
}

const ORDINARY =
  "An ordinary day for you. Most of it is your work, your meals and the people you are fond of. Something small is on your mind: %HOOK%. Do not reopen old quarrels unless someone brings them to you. A real village is mostly small talk, favours and routine, with the odd sharp word over small things.";

/** Notes for today: drivers get their arc's beat, everyone else an ordinary-day hook. */
function planDay(w: World): void {
  const day = w.clock.day;
  const notes: Record<string, string> = {};
  const arcOf: Record<string, string> = {};
  for (const arc of live(w)) {
    const a = arcContent(w, arc.id);
    if (!a) continue;
    const seeded = w.content.relationships.seededConflicts.find((c) => c.id === arc.id);
    let drivers: string[] = [];
    let note = "";
    switch (arc.stage) {
      case "simmer":
        drivers = (seeded?.actors ?? []).slice(0, 2);
        note = `Something is brewing (${a.title}): ${seeded?.fuse ?? ""} You are not ready to have it out yet, but it leaks into your day: a sharp word, a pointed question, a door closed a little hard.`;
        break;
      case "incident":
        drivers = a.incident.drivers;
        note = `This just happened (${a.title}): ${a.incident.text} Deal with it today in your own way.`;
        break;
      case "confront":
        drivers = a.confront.drivers;
        note = `Today it comes up face to face (${a.title}): ${a.confront.note} The others involved: ${a.confront.drivers.map((d) => w.npcs[d]?.name).filter(Boolean).join(", ")}. Say what you actually think; it does not have to be resolved today.`;
        break;
      case "decision":
        drivers = [a.decision.decider, ...a.confront.drivers.filter((x) => x !== a.decision.decider).slice(0, 2)];
        note = `The question of the day (${a.title}): ${a.decision.question}${arc.fact ? ` It is decided: ${arc.fact}` : ""} Live the consequences.`;
        break;
      case "aftermath":
        drivers = [a.decision.decider, ...a.confront.drivers.filter((x) => x !== a.decision.decider)].slice(0, 3);
        note = `After it (${a.title}): ${arc.fact ?? ""} ${a.aftermath} Move on with your life; do not re-argue it unless something new happens.`;
        break;
      default:
        break;
    }
    for (const id of drivers) {
      if (!w.npcs[id] || notes[id]) continue;
      notes[id] = `TODAY'S STORY. ${note} Outside this, keep the rest of your day ordinary.`;
      arcOf[id] = arc.id;
    }
  }
  const hooks = w.content.arcs!.ordinaryDay;
  for (const id of Object.keys(w.npcs)) {
    if (notes[id]) continue;
    notes[id] = ORDINARY.replace("%HOOK%", hooks[w.rng.int(hooks.length)]);
  }
  w.story = { day, notes, arcOf };
}

/** The direction for one NPC today (recomputed if the world was resumed mid-day). */
export function storyFor(w: World, npcId: string): string | null {
  if (!w.content.arcs) return null;
  if (!w.story || w.story.day !== w.clock.day) {
    // a fresh town starts mid-day 1 without a 00:00 tick
    if (!w.arcs.length) startArcs(w);
    planDay(w);
  }
  return w.story?.notes[npcId] ?? null;
}

/** The arc a pair is both driving today, if any. */
export function sharedArc(w: World, a: string, b: string): { title: string; note: string } | null {
  if (!w.story || w.story.day !== w.clock.day) return null;
  const x = w.story.arcOf[a];
  if (!x || x !== w.story.arcOf[b]) return null;
  const content = arcContent(w, x);
  const state = w.arcs.find((s) => s.id === x);
  if (!content || !state || state.stage === "simmer") return null;
  return { title: content.title, note: w.story.notes[a] };
}

/** Compact view for the API / viewer. */
export function arcsSummary(w: World) {
  return w.arcs.map((s) => ({ id: s.id, title: arcContent(w, s.id)?.title ?? s.id, stage: s.stage, since: s.since, choice: s.choice, fact: s.fact }));
}
