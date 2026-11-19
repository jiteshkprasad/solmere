import type { DayPlan, NpcState, PlanStep, Reaction } from "@npcworld/schema";
import type { World } from "./types.js";
import { absMinutes, fmtClock, hourFloat } from "./clock.js";
import { brainCall } from "./brainRunner.js";
import { buildContext } from "./context.js";
import { broadcast } from "./eventlog.js";
import { addMemory } from "./memory.js";
import { startWalk } from "./movement.js";
import { isSleepHour } from "./rhythm.js";
import { npcDrink, npcEat, npcShop, payWage } from "./economy.js";
import { newlyCritical } from "./needs.js";
import { startConversation } from "./conversations.js";
import { MockBrain } from "../brain/mock.js";
import { reflectAtBedtime } from "./daily.js";

const fallbackBrain = new MockBrain();
const MAX_REACTS_PER_DAY = 6;
const REACT_GAP_MIN = 20;

/* ------------------------------------------------------------------ */
/* plan step selection                                                 */
/* ------------------------------------------------------------------ */

export function stepKey(s: PlanStep): string {
  return `${s.startHour}:${s.endHour}:${s.action}:${s.location}`;
}

/** The plan step (injected gatherings first) that covers hour `h`. */
export function currentStep(w: World, npc: NpcState, h: number): { step: PlanStep; index: number } | null {
  const rt = w.rt[npc.id];
  for (const s of rt.injected) if (s.startHour <= h && h < s.endHour) return { step: s, index: -1 };
  for (let i = 0; i < npc.plan.length; i++) {
    const s = npc.plan[i];
    if (s.startHour <= h && h < s.endHour) return { step: s, index: i };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* per-tick drive                                                      */
/* ------------------------------------------------------------------ */

/** Advance one NPC's agent loop by one tick. Movement itself happens in movement.ts. */
export function driveNpc(w: World, npc: NpcState): void {
  const rt = w.rt[npc.id];
  const h = hourFloat(w.clock);
  if (npc.sickDays > 0) return stayHomeSick(w, npc);
  if (rt.sleeping) {
    if (!isSleepHour(h, { wake: rt.wakeHour, bed: rt.bedHour, work: null }) && rt.plannedDay < w.clock.day) wakeUp(w, npc);
    return;
  }
  if (npc.conversationId || rt.busy) return;
  for (const need of newlyCritical(w, npc)) rt.triggers.push(`Your ${need} need is critical (${Math.round(npc.needs[need])}/100).`);
  const cur = currentStep(w, npc, h);
  if (!cur) return noStep(w, npc, h);
  const key = stepKey(cur.step);
  if (rt.stepKey !== key) beginStep(w, npc, cur.step, cur.index, key);
  else if (!rt.acted && npc.locationId === cur.step.location && !npc.targetLocationId) beginAction(w, npc, cur.step);
  maybeReact(w, npc);
}

function stayHomeSick(w: World, npc: NpcState): void {
  const rt = w.rt[npc.id];
  if (npc.locationId !== npc.home) {
    startWalk(w, npc, npc.home);
    return;
  }
  if (npc.action !== "sick") {
    npc.action = "sick";
    npc.activity = "in bed with a fever";
    rt.stepKey = null;
  }
}

function noStep(w: World, npc: NpcState, h: number): void {
  const rt = w.rt[npc.id];
  const bedtime = isSleepHour(h, { wake: rt.wakeHour, bed: rt.bedHour, work: null }) || (rt.bedHour > rt.wakeHour && h >= rt.bedHour);
  if (bedtime) return goToBed(w, npc);
  if (rt.stepKey !== null) {
    finishStep(w, npc);
    rt.stepKey = null;
  }
  if (npc.action !== "idle" && npc.action !== "walk") {
    npc.action = "idle";
    npc.activity = "passing the time";
  }
  maybeReact(w, npc);
}

function beginStep(w: World, npc: NpcState, step: PlanStep, index: number, key: string): void {
  const rt = w.rt[npc.id];
  if (rt.stepKey !== null) finishStep(w, npc);
  rt.stepKey = key;
  rt.acted = false;
  npc.planStepIndex = Math.max(0, index);
  if (step.action === "sleep") return goToBed(w, npc);
  if (!w.content.locations[step.location]) return;
  if (npc.locationId !== step.location || npc.targetLocationId) startWalk(w, npc, step.location);
  else beginAction(w, npc, step);
}

/** A step ended: pay wages for work, and queue a react if something notable happened meanwhile. */
function finishStep(w: World, npc: NpcState): void {
  const rt = w.rt[npc.id];
  if (npc.action === "work" || rt.workedToday) payWage(w, npc);
  if (rt.notable.length && rt.stepKey) {
    const intent = npc.plan[npc.planStepIndex]?.intent ?? "what I was doing";
    rt.triggers.push(`You finished "${intent}". Meanwhile: ${rt.notable.slice(-3).join(" | ")}`);
    rt.notable = [];
  }
}

/** Arrived where the step wants us: perform the action (and any purchase it implies). */
export function beginAction(w: World, npc: NpcState, step: PlanStep): void {
  const rt = w.rt[npc.id];
  rt.acted = true;
  rt.actionStartMin = absMinutes(w.clock);
  npc.action = step.action === "sleep" ? "idle" : step.action;
  npc.activity = step.intent;
  switch (step.action) {
    case "work":
      rt.workedToday = true;
      break;
    case "eat":
      npcEat(w, npc);
      break;
    case "drink":
      npcDrink(w, npc);
      break;
    case "shop":
      npcShop(w, npc);
      break;
    case "leisure":
      if (w.businesses[npc.locationId]) npcDrink(w, npc);
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* wake / plan                                                         */
/* ------------------------------------------------------------------ */

function wakeUp(w: World, npc: NpcState): void {
  const rt = w.rt[npc.id];
  rt.sleeping = false;
  rt.plannedDay = w.clock.day;
  rt.stepKey = null;
  rt.injected = rt.injected.filter((s) => s.endHour > hourFloat(w.clock));
  npc.action = "idle";
  npc.activity = "waking up";
  requestPlan(w, npc, "Morning. Plan your day.");
}

export function requestPlan(w: World, npc: NpcState, trigger: string): void {
  const rt = w.rt[npc.id];
  rt.busy = true;
  const ctx = buildContext(w, npc.id, trigger, `${w.content.npcs[npc.id].want} ${trigger}`);
  brainCall(w, "plan", npc.id, () => w.brain.plan(ctx), () => fallbackBrain.planSync(ctx)).then((plan) => applyPlan(w, npc, plan)).finally(() => {
    rt.busy = false;
  });
}

function applyPlan(w: World, npc: NpcState, plan: DayPlan): void {
  npc.plan = sanitizeSteps(w, plan.steps);
  npc.planStepIndex = 0;
  npc.thought = plan.morningThought;
  npc.mood = plan.mood;
  w.rt[npc.id].stepKey = null;
  addMemory(w, npc.id, "plan", `Woke up thinking: ${plan.morningThought}`, 2);
  w.log(`${fmtClock(w.clock)}  [plan] ${npc.name}: "${plan.morningThought}" — ${npc.plan.map((s) => `${s.action}@${s.location} ${s.startHour}-${s.endHour}`).join(", ")}`);
  broadcast(w, { kind: "npc", npc });
}

function sanitizeSteps(w: World, steps: PlanStep[]): PlanStep[] {
  return steps
    .filter((s) => w.content.locations[s.location] && s.endHour > s.startHour)
    .map((s) => ({ ...s, with: s.with?.filter((id) => !!w.npcs[id]) }))
    .sort((a, b) => a.startHour - b.startHour);
}

/* ------------------------------------------------------------------ */
/* react                                                               */
/* ------------------------------------------------------------------ */

function maybeReact(w: World, npc: NpcState): void {
  const rt = w.rt[npc.id];
  if (!rt.triggers.length || rt.busy || npc.conversationId) return;
  const now = absMinutes(w.clock);
  if (rt.reactsToday >= MAX_REACTS_PER_DAY || now - rt.lastReactAbsMin < REACT_GAP_MIN) {
    if (rt.triggers.length > 4) rt.triggers.splice(0, rt.triggers.length - 4);
    return;
  }
  const trigger = rt.triggers.splice(0, rt.triggers.length).join(" || ");
  rt.reactsToday += 1;
  rt.lastReactAbsMin = now;
  rt.busy = true;
  const ctx = buildContext(w, npc.id, trigger);
  const fallback = (): Reaction => ({ decision: "continue", thought: npc.thought, mood: npc.mood });
  brainCall(w, "react", npc.id, () => w.brain.react(ctx), fallback).then((r) => applyReaction(w, npc, r, trigger)).finally(() => {
    rt.busy = false;
  });
}

function applyReaction(w: World, npc: NpcState, r: Reaction, trigger: string): void {
  const rt = w.rt[npc.id];
  npc.thought = r.thought;
  npc.mood = r.mood;
  w.log(`${fmtClock(w.clock)}  [react] ${npc.name} (${r.decision}) ← ${trigger.slice(0, 90)} → "${r.thought}"`);
  if (r.decision === "replan" && r.newSteps?.length) {
    const h = hourFloat(w.clock);
    const kept = npc.plan.filter((s) => s.endHour <= h);
    npc.plan = sanitizeSteps(w, [...kept, ...r.newSteps.filter((s) => s.endHour > h)]);
    rt.stepKey = null;
    addMemory(w, npc.id, "plan", `Changed my plans: ${r.newSteps.map((s) => s.intent).join("; ")}`, 3);
  }
  if (r.decision === "interrupt" && r.immediate) {
    const im = r.immediate;
    if (im.action === "talk" && im.target && w.npcs[im.target]) {
      const other = w.npcs[im.target];
      if (other.locationId === npc.locationId && !other.conversationId && !npc.conversationId) startConversation(w, [npc.id, other.id], npc.locationId, `${npc.name} went straight to ${other.name}: ${r.thought}`);
      else if (!other.targetLocationId) {
        rt.injected.push({ startHour: hourFloat(w.clock), endHour: Math.min(24, hourFloat(w.clock) + 1), action: "talk", location: other.locationId, intent: `find ${other.name.split(" ")[0]}: ${r.thought.slice(0, 60)}`, with: [other.id] });
        rt.stepKey = null;
      }
    } else if (im.location && w.content.locations[im.location]) {
      rt.injected.push({ startHour: hourFloat(w.clock), endHour: Math.min(24, hourFloat(w.clock) + 1), action: im.action, location: im.location, intent: r.thought.slice(0, 80) });
      rt.stepKey = null;
    }
  }
  broadcast(w, { kind: "npc", npc });
}

/* ------------------------------------------------------------------ */
/* bedtime                                                             */
/* ------------------------------------------------------------------ */

function goToBed(w: World, npc: NpcState): void {
  const rt = w.rt[npc.id];
  if (npc.locationId !== npc.home || npc.targetLocationId) {
    startWalk(w, npc, npc.home);
    return;
  }
  if (rt.stepKey !== null && npc.action !== "sleep") {
    finishStep(w, npc);
    rt.stepKey = null;
  }
  if (rt.reflectedDay < rt.plannedDay && !rt.busy) {
    rt.reflectedDay = rt.plannedDay;
    reflectAtBedtime(w, npc);
    return;
  }
  if (!rt.busy) fallAsleep(w, npc);
}

export function fallAsleep(w: World, npc: NpcState): void {
  const rt = w.rt[npc.id];
  rt.sleeping = true;
  rt.stepKey = null;
  rt.triggers = [];
  npc.action = "sleep";
  npc.activity = "asleep";
  npc.targetLocationId = null;
}
