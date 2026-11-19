import type { ActionKind, Conversation, ConverseOutput, EventType, NpcState } from "@npcworld/schema";
import type { World } from "./types.js";
import { absHours } from "./clock.js";
import { brainCall } from "./brainRunner.js";
import { buildContext } from "./context.js";
import { broadcast, emit } from "./eventlog.js";
import { addMemory } from "./memory.js";
import { addGossip, affinity, applyAffinity } from "./relationships.js";
import { satisfy } from "./needs.js";
import { clamp10 } from "./director.js";
import { firstName } from "./names.js";
import { sharedArc } from "./story.js";
import { tokens } from "./memory.js";

const SECONDS_PER_LINE = 6;
const CONV_LOG_CAP = 600;
const NO_TALK: Set<ActionKind> = new Set(["sleep", "walk", "sick", "speech", "vote", "confess"]);

interface ConvRuntime {
  cursorF: number;
  prevAction: Record<string, ActionKind>;
  prevActivity: Record<string, string>;
  ready: boolean;
}
const runtime = new Map<string, ConvRuntime>();
/** per world: "a|b" (sorted) -> absolute sim-hour of their last chat; the same pair waits PAIR_COOLDOWN_HOURS */
const pairLastByWorld = new WeakMap<World, Map<string, number>>();
const PAIR_COOLDOWN_HOURS = 4;
function pairLastOf(w: World): Map<string, number> {
  let m = pairLastByWorld.get(w);
  if (!m) pairLastByWorld.set(w, (m = new Map()));
  return m;
}
let convSeq = 0;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function eligible(w: World, n: NpcState): boolean {
  const rt = w.rt[n.id];
  if (n.conversationId || n.targetLocationId || NO_TALK.has(n.action) || rt.sleeping) return false;
  const nowMin = w.clock.dayMinutes + (w.clock.day - 1) * 1440;
  if (nowMin - rt.hereSinceMin < 1) return false;
  return absHours(w.clock) - rt.lastConvAbsHour >= 1;
}

function wantsToTalkTo(n: NpcState, other: string): boolean {
  const step = n.plan[n.planStepIndex];
  return !!step?.with?.includes(other);
}

/**
 * Once per sim-minute: find co-located NPCs who should talk. Each NPC gets one roll per
 * sim-hour: named-in-plan 90%, |affinity| >= 20 25%, otherwise a 5% "ran into each other".
 */
export function matchConversations(w: World): void {
  const hourIdx = Math.floor(absHours(w.clock));
  const byLoc = new Map<string, NpcState[]>();
  for (const n of Object.values(w.npcs)) {
    if (!eligible(w, n)) continue;
    const list = byLoc.get(n.locationId) ?? [];
    list.push(n);
    byLoc.set(n.locationId, list);
  }
  for (const [locId, list] of byLoc) {
    if (list.length < 2) continue;
    const order = w.rng.shuffle(list);
    const taken = new Set<string>();
    for (const a of order) {
      if (taken.has(a.id) || w.rt[a.id].convCheckedAbsHour === hourIdx) continue;
      w.rt[a.id].convCheckedAbsHour = hourIdx;
      for (const b of order) {
        if (a.id === b.id || taken.has(b.id)) continue;
        const reason = pairReason(w, a, b);
        if (!reason) continue;
        taken.add(a.id);
        taken.add(b.id);
        const ids = [a.id, b.id];
        const third = order.find((c) => !taken.has(c.id) && c.id !== a.id && c.id !== b.id && Math.abs(affinity(w, a.id, c.id)) >= 40);
        if (third && w.rng.chance(0.5)) {
          taken.add(third.id);
          ids.push(third.id);
        }
        startConversation(w, ids, locId, reason);
        break;
      }
    }
  }
}

function pairReason(w: World, a: NpcState, b: NpcState): string | null {
  const loc = w.content.locations[a.locationId]?.name ?? a.locationId;
  if (absHours(w.clock) - (pairLastOf(w).get(pairKey(a.id, b.id)) ?? -100) < PAIR_COOLDOWN_HOURS) return null;
  const arc = sharedArc(w, a.id, b.id);
  if (arc) return w.rng.chance(0.85) ? `${a.name} and ${b.name} are both caught up in ${arc.title.toLowerCase()} today, and here they are at ${loc}` : null;
  if (wantsToTalkTo(a, b.id)) return w.rng.chance(0.9) ? `${a.name} wanted to talk to ${b.name}: "${a.plan[a.planStepIndex]?.intent ?? ""}"` : null;
  if (wantsToTalkTo(b, a.id)) return w.rng.chance(0.9) ? `${b.name} wanted to talk to ${a.name}: "${b.plan[b.planStepIndex]?.intent ?? ""}"` : null;
  const ab = affinity(w, a.id, b.id);
  const ba = affinity(w, b.id, a.id);
  if (Math.abs(ab) >= 20 || Math.abs(ba) >= 20) {
    if (!w.rng.chance(0.25)) return null;
    // old grudges colour the meeting but don't script it: most run-ins between people with history are civil
    const tone = ab + ba < 0 ? (w.rng.chance(0.5) ? "and there is bad blood between them" : "and they are civil, for now") : "and they are glad to see each other";
    return `${a.name} and ${b.name} run into each other at ${loc} ${tone}`;
  }
  if (w.degraded) return null;
  return w.rng.chance(0.05) ? `${a.name} and ${b.name} happen to be at ${loc} at the same time` : null;
}

export function startConversation(w: World, ids: string[], locationId: string, pretext: string): Conversation {
  const conv: Conversation = {
    id: `c${w.clock.day}_${(convSeq++).toString(36)}`,
    day: w.clock.day,
    hour: Math.floor(w.clock.dayMinutes / 60),
    locationId,
    participants: ids,
    lines: [],
    cursor: 0,
    done: false,
    summary: "",
    drama: 0,
  };
  const rt: ConvRuntime = { cursorF: 0, prevAction: {}, prevActivity: {}, ready: false };
  for (const id of ids) {
    const n = w.npcs[id];
    rt.prevAction[id] = n.action;
    rt.prevActivity[id] = n.activity;
    n.conversationId = conv.id;
    n.action = "talk";
    n.activity = `talking with ${ids.filter((o) => o !== id).map((o) => firstName(w.npcs[o].name)).join(" and ")}`;
    w.rt[id].lastConvAbsHour = absHours(w.clock);
  }
  runtime.set(conv.id, rt);
  for (const a of ids) for (const b of ids) if (a < b) pairLastOf(w).set(pairKey(a, b), absHours(w.clock));
  w.conversations.push(conv);
  broadcast(w, { kind: "conversation", conversation: conv });
  const input = {
    participants: ids.map((id) => buildContext(w, id, null, pretext + " " + ids.map((o) => w.npcs[o].name).join(" "))),
    locationName: w.content.locations[locationId]?.name ?? locationId,
    pretext,
    history: pairHistory(w, ids),
    avoidTopics: tiredTopics(w),
  };
  brainCall(w, "converse", ids[0], () => w.brain.converse(input), () => fallbackConverse(w, ids)).then((out) => {
    conv.lines = out.lines.slice(0, 10);
    conv.summary = out.summary;
    conv.drama = clamp10(out.drama);
    rt.ready = true;
    (conv as Conversation & { _out?: ConverseOutput })._out = out;
    broadcast(w, { kind: "conversation", conversation: conv });
  });
  return conv;
}

function fallbackConverse(w: World, ids: string[]): ConverseOutput {
  const [a, b] = ids;
  return {
    lines: [
      { speaker: a, text: "Busy day?" },
      { speaker: b, text: "Same as ever. You?" },
    ],
    summary: `${w.npcs[a].name} and ${w.npcs[b].name} exchanged a few words.`,
    outcomes: ids.map((id) => ({ npcId: id, memory: `Exchanged a few words with ${ids.filter((o) => o !== id).map((o) => w.npcs[o].name).join(", ")}.`, importance: 1, mood: w.npcs[id].mood, affinityDelta: {} })),
    drama: 1,
    eventType: null,
  };
}

/** Reveal lines one per ~6 sim-seconds; finish when the last line has been "spoken". */
export function stepConversations(w: World, dtMinutes: number): void {
  for (const conv of [...w.conversations]) {
    const rt = runtime.get(conv.id);
    if (!rt || !rt.ready) continue;
    rt.cursorF += (dtMinutes * 60) / SECONDS_PER_LINE;
    const cursor = Math.min(conv.lines.length, Math.floor(rt.cursorF));
    if (cursor !== conv.cursor) {
      conv.cursor = cursor;
      if (cursor < conv.lines.length) broadcast(w, { kind: "conversation", conversation: conv });
    }
    if (conv.cursor >= conv.lines.length) finishConversation(w, conv);
  }
}

function finishConversation(w: World, conv: Conversation): void {
  const rt = runtime.get(conv.id);
  const out = (conv as Conversation & { _out?: ConverseOutput })._out;
  conv.done = true;
  conv.cursor = conv.lines.length;
  runtime.delete(conv.id);
  delete (conv as Conversation & { _out?: ConverseOutput })._out;
  w.conversations = w.conversations.filter((c) => c.id !== conv.id);
  w.conversationLog.push(conv);
  if (w.conversationLog.length > CONV_LOG_CAP) w.conversationLog.splice(0, w.conversationLog.length - CONV_LOG_CAP);
  for (const id of conv.participants) {
    const n = w.npcs[id];
    n.conversationId = null;
    const prev = rt?.prevAction[id];
    n.action = prev && prev !== "talk" ? prev : "idle";
    n.activity = rt?.prevActivity[id] ?? "";
    satisfy(n, "social", 25);
  }
  if (out) applyOutcomes(w, conv, out);
  const type: EventType = out?.eventType && ["argument", "gossip", "romance", "breakup", "friendship", "feud"].includes(out.eventType) ? out.eventType : "conversation";
  const names = conv.participants.map((id) => firstName(w.npcs[id].name)).join(" & ");
  emit(w, type, `${names}: ${conv.summary || "talked"}`, {
    actors: conv.participants, locationId: conv.locationId, drama: conv.drama, importance: type === "conversation" ? 1 : Math.max(5, conv.drama), witnesses: [],
    data: { conversationId: conv.id },
  });
  for (const line of conv.lines) w.log(`      ${w.npcs[line.speaker] ? firstName(w.npcs[line.speaker].name) : line.speaker}: ${line.text}`);
  broadcast(w, { kind: "conversation", conversation: conv });
}

function applyOutcomes(w: World, conv: Conversation, out: ConverseOutput): void {
  for (const o of out.outcomes) {
    const n = w.npcs[o.npcId];
    if (!n || !conv.participants.includes(o.npcId)) continue;
    const others = conv.participants.filter((p) => p !== o.npcId);
    addMemory(w, o.npcId, "conversation", o.memory, o.importance, others);
    n.mood = o.mood;
    for (const [other, delta] of Object.entries(o.affinityDelta ?? {})) if (w.npcs[other] && other !== o.npcId) applyAffinity(w, o.npcId, other, delta, conv.locationId);
    if (o.gossipLearned) addGossip(w, o.npcId, o.gossipLearned, others);
  }
}

/** Force-end every conversation an NPC is in (eviction, sickness, day end). */
export function endConversationsOf(w: World, npcId: string): void {
  for (const conv of [...w.conversations]) if (conv.participants.includes(npcId)) finishConversation(w, conv);
}

/** What these people said to each other in their last few talks (oldest first). */
function pairHistory(w: World, ids: string[], limit = 3): string[] {
  const set = new Set(ids);
  const out: string[] = [];
  for (let i = w.conversationLog.length - 1; i >= 0 && out.length < limit; i--) {
    const c = w.conversationLog[i];
    if (!c.summary) continue;
    if (c.participants.filter((p) => set.has(p)).length >= 2) out.push(`Day ${c.day} ${String(c.hour).padStart(2, "0")}:00 — ${c.summary}`);
  }
  return out.reverse();
}

const TOPIC_STOP = new Set(["talked", "talk", "about", "their", "there", "while", "after", "again", "other", "between", "traded", "small", "caught", "warmly", "morning", "evening", "today", "town", "solmere", "said", "asked", "told", "over", "with", "into", "each", "both", "leaving", "conversation", "argued", "quietly", "tense", "words", "brief", "exchanged", "shared", "would", "could", "should", "being", "still", "first", "something", "nothing", "everyone", "anyone", "pressed", "offered", "agreed", "promised", "wanted", "trying", "worried", "worry", "news", "plans", "plan", "help", "work", "time", "week", "money"]);
let tiredCache: { day: number; count: number; topics: string[] } | null = null;

/** Words that dominate today's conversations: the town has talked them to death. */
function tiredTopics(w: World): string[] {
  const talks = w.todayEvents.filter((e) => ["conversation", "argument", "gossip", "feud", "friendship", "romance", "breakup"].includes(e.type));
  if (tiredCache && tiredCache.day === w.clock.day && tiredCache.count === talks.length) return tiredCache.topics;
  const names = new Set(Object.values(w.npcs).flatMap((n) => n.name.toLowerCase().split(/[^a-z']+/)));
  const counts = new Map<string, number>();
  for (const e of talks) for (const t of tokens(e.text)) if (t.length > 4 && !TOPIC_STOP.has(t) && !names.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const threshold = Math.max(5, Math.round(talks.length * 0.12));
  const topics = [...counts.entries()].filter(([, n]) => n >= threshold).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
  tiredCache = { day: w.clock.day, count: talks.length, topics };
  return topics;
}
