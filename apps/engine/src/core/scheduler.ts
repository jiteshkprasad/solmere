import type { StreamFrame, WorldSnapshot } from "@npcworld/schema";
import type { World } from "./types.js";
import { advanceClock, currentSpeed, toSimTime } from "./clock.js";
import { stepMovement } from "./movement.js";
import { stepNeeds } from "./needs.js";
import { beginAction, currentStep, driveNpc, stepKey } from "./agent.js";
import { matchConversations, stepConversations } from "./conversations.js";
import { economyHour } from "./economy.js";
import { politicsHour } from "./politics.js";
import { businessDecisions, morning, newDay, nightly, runGatherings, updateStorylines, weeklyFinance } from "./daily.js";
import { drain } from "./brainRunner.js";
import { relationshipsArray } from "./relationships.js";
import { activeWorldEvents } from "./events.js";
import { broadcast } from "./eventlog.js";

export const MAX_SUBSTEP_MINUTES = 2;

/**
 * One simulation tick. Real-time mode calls this once per real second with dt = currentSpeed;
 * headless mode calls it in a tight loop with dt = clock.headlessStep and awaits every brain task.
 */
export async function tick(w: World, dtMinutes?: number): Promise<void> {
  if (w.clock.paused) return;
  const dt = dtMinutes ?? currentSpeed(w);
  // fast speeds are sub-stepped so movement/needs/conversations never skip more than 2 sim-minutes
  if (dt > MAX_SUBSTEP_MINUTES) {
    let left = dt;
    while (left > 0) {
      const step = Math.min(MAX_SUBSTEP_MINUTES, left);
      await substep(w, step);
      left -= step;
    }
    return;
  }
  await substep(w, dt);
}

async function substep(w: World, dt: number): Promise<void> {
  const adv = advanceClock(w.clock, dt);
  w.time = toSimTime(w);
  for (const c of adv.crossed) await onMinute(w, c.day, c.minute);
  const arrived = stepMovement(w, dt);
  for (const id of arrived) onArrival(w, id);
  for (const npc of Object.values(w.npcs)) {
    stepNeeds(w, npc, dt);
    driveNpc(w, npc);
  }
  stepConversations(w, dt);
  if (w.clock.headless) await drain(w);
}

function onArrival(w: World, id: string): void {
  const npc = w.npcs[id];
  const rt = w.rt[id];
  if (rt.sleeping || npc.sickDays > 0) return;
  const cur = currentStep(w, npc, w.clock.dayMinutes / 60);
  if (cur && stepKey(cur.step) === rt.stepKey && cur.step.location === npc.locationId) beginAction(w, npc, cur.step);
  else if (!cur) {
    npc.action = "idle";
    npc.activity = "";
  }
}

async function onMinute(w: World, day: number, minute: number): Promise<void> {
  if (minute === 0) newDay(w);
  if (minute % 60 === 0) onHour(w, minute / 60);
  if (minute === 6 * 60) morning(w);
  if (minute === 23 * 60 + 30) updateStorylines(w);
  if (minute === 23 * 60 + 59) await nightly(w);
  matchConversations(w);
  void day;
}

function onHour(w: World, hour: number): void {
  economyHour(w);
  runGatherings(w, hour);
  politicsHour(w, hour);
  const rentEvery = w.content.town.clock.rentEveryDays;
  const bizEvery = w.content.town.clock.businessDecisionEveryDays;
  if (hour === 8 && w.clock.day % rentEvery === 0) weeklyFinance(w);
  if (hour === 7 && w.clock.day % bizEvery === 0 && w.clock.day > 1) businessDecisions(w);
}

/** The full snapshot the viewer loads on connect. */
export function snapshot(w: World): WorldSnapshot {
  const stats = w.brain.stats();
  return {
    town: w.content.town.name,
    time: toSimTime(w),
    npcs: w.npcs,
    businesses: w.businesses,
    relationships: relationshipsArray(w),
    conversations: w.conversations,
    election: w.election,
    policies: w.policies,
    loans: w.loans,
    metrics: w.metrics,
    metricsHistory: w.metricsHistory,
    storylines: w.storylines,
    latestPaper: w.papers[w.papers.length - 1] ?? null,
    activeWorldEvents: activeWorldEvents(w),
    lastEventSeq: w.lastEventSeq,
    llm: {
      callsToday: w.llm.callsToday,
      costTodayUsd: round4(w.llm.costTodayUsd),
      costTotalUsd: round4(stats.costUsd),
      failRate: w.llm.calls ? round4(w.llm.failures / w.llm.calls) : 0,
      bulkModel: stats.bulkModel,
      midModel: stats.midModel,
    },
  };
}

const round4 = (n: number) => (Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0);

/**
 * Compact position-only frame, sent at the full tick rate (several Hz). Carries
 * just ids and rounded [x, z] pairs plus the sender's wall clock, which the
 * viewer uses to drive an interpolation buffer. Roughly 25x smaller than a full
 * tick frame, because it omits the per-NPC thought/activity strings that make up
 * most of a tick's bytes and that only change a couple of times a sim-hour.
 */
export function posFrame(w: World): StreamFrame {
  const ids: string[] = [];
  const p: number[] = [];
  for (const n of Object.values(w.npcs)) {
    ids.push(n.id);
    p.push(Math.round(n.pos[0] * 100) / 100, Math.round(n.pos[1] * 100) / 100);
  }
  return { kind: "pos", t: Date.now(), ids, p };
}

export function tickFrame(w: World): StreamFrame {
  return {
    kind: "tick",
    time: toSimTime(w),
    npcs: Object.values(w.npcs).map((n) => ({
      id: n.id, pos: n.pos, locationId: n.locationId, targetLocationId: n.targetLocationId, action: n.action, activity: n.activity, mood: n.mood, thought: n.thought, conversationId: n.conversationId,
    })),
  };
}

/** Run N sim-days as fast as possible (no wall-clock waiting). */
export async function runHeadless(w: World, days: number, stepMinutes = 1, afterTick?: () => void): Promise<void> {
  w.clock.headless = true;
  w.clock.headlessStep = stepMinutes;
  const endDay = w.clock.day + days;
  while (w.clock.day < endDay) {
    await tick(w, stepMinutes);
    afterTick?.();
  }
  await drain(w);
  broadcast(w, { kind: "metrics", metrics: w.metrics });
}
