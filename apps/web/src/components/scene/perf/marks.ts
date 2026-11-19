/**
 * Boot milestones + a progress model for the loading screen.
 *
 * Everything that matters during the first seconds records a mark here
 * (ms since `performance.timeOrigin`, first write wins). `<LoadingScreen/>`
 * subscribes for a determinate progress bar and a status line that reflects
 * what is actually happening; the `?stats=1` overlay prints the raw numbers.
 *
 * OWNED BY THE PERFORMANCE AGENT.
 */
"use client";
import { useSyncExternalStore } from "react";

/** ordered phases of the first load */
export const PHASES = ["boot", "content", "canvas", "town", "people", "polish", "ready"] as const;
export type Phase = (typeof PHASES)[number];

/** what each phase says while it is the current one */
const STATUS: Record<Phase, string> = {
  boot: "opening the harbour gate",
  content: "reading the town register",
  canvas: "raising the sky",
  town: "building Solmere",
  people: "waking the townsfolk",
  polish: "lighting the lamps",
  ready: "welcome to Solmere",
};

/** progress each phase has reached when it *completes* */
const WEIGHT: Record<Phase, number> = { boot: 0.04, content: 0.12, canvas: 0.2, town: 0.62, people: 0.9, polish: 0.98, ready: 1 };

export interface BootState {
  phase: Phase;
  progress: number; // 0..1
  status: string;
  ready: boolean;
  people: { built: number; total: number };
  marks: Record<string, number>;
}

/**
 * The whole store lives on `globalThis` under one key. Next's client graph can
 * hand the same "use client" module to two chunks (the page and the lazily
 * imported scene), and two copies of this state would leave the loading screen
 * watching a boot that is happening in the other copy.
 */
interface Store {
  marks: Record<string, number>;
  listeners: Set<() => void>;
  state: BootState;
  peopleBuilt: number; peopleTotal: number;
  phase: Phase; extra: number;
}
const KEY = "__npcworldBoot";
const g = globalThis as unknown as Record<string, Store | undefined>;
const S: Store = (g[KEY] ??= (() => {
  const marks: Record<string, number> = {};
  return {
    marks,
    listeners: new Set<() => void>(),
    state: { phase: "boot", progress: 0, status: STATUS.boot, ready: false, people: { built: 0, total: 0 }, marks },
    peopleBuilt: 0, peopleTotal: 0, phase: "boot", extra: 0,
  };
})());
const marks = S.marks;
const listeners = S.listeners;

const now = () => (typeof performance !== "undefined" ? performance.now() : 0);
function emit() {
  const done = WEIGHT[S.phase];
  const prevIdx = PHASES.indexOf(S.phase) - 1;
  const base = prevIdx >= 0 ? WEIGHT[PHASES[prevIdx]] : 0;
  const progress = Math.min(1, base + (done - base) * Math.max(0, Math.min(1, S.extra)));
  S.state = {
    phase: S.phase,
    progress,
    status: S.phase === "people" && S.peopleTotal ? `waking ${S.peopleTotal} people · ${S.peopleBuilt} up` : STATUS[S.phase],
    ready: S.phase === "ready",
    people: { built: S.peopleBuilt, total: S.peopleTotal },
    marks,
  };
  listeners.forEach((l) => l());
}

/** record a milestone once (ms since page start). Safe to call from anywhere. */
export function mark(name: string): number {
  if (marks[name] === undefined) marks[name] = Math.round(now());
  return marks[name];
}

/** move the loading story forward; never goes backwards */
export function setPhase(p: Phase, fraction = 0) {
  const i = PHASES.indexOf(p), cur = PHASES.indexOf(S.phase);
  if (i < cur) return;
  if (i > cur) { S.phase = p; S.extra = fraction; mark(`phase:${p}`); }
  else S.extra = Math.max(S.extra, fraction);
  emit();
}

/** rig-building progress (drives both the bar and the status line) */
export function setPeople(built: number, total: number) {
  if (built === S.peopleBuilt && total === S.peopleTotal) return;
  S.peopleBuilt = built; S.peopleTotal = total;
  if (total && S.phase === "town") { S.phase = "people"; mark("phase:people"); }
  if (S.phase === "people") S.extra = total ? built / total : 0;
  emit();
}

export const getBoot = () => S.state;
export const getMarks = () => ({ ...marks });
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const server = (): BootState => S.state;
export function useBoot(): BootState { return useSyncExternalStore(subscribe, getBoot, server); }

/** the loading screen's hard timeout pulls the ripcord through this */
export function forceReady(reason: string) { mark(`forced:${reason}`); setPhase("ready", 1); }

if (typeof window !== "undefined") {
  mark("script");
  (window as unknown as { __perfMarks?: () => unknown }).__perfMarks = () => ({ ...marks, phase: S.phase, progress: S.state.progress, people: `${S.peopleBuilt}/${S.peopleTotal}` });
}
