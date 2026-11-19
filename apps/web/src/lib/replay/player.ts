/**
 * The replay player: plays a recorded season into the same store the live stream
 * feeds (useWorld.applyFrame), so every HUD panel and the 3D scene work unchanged.
 *
 *  manifest.json ─┐
 *  days/NN.json ──┼─► player clock (sim-minutes, rAF) ─► applyFrame(...) ─► store / posBus
 *  papers.json ───┘
 *
 * - Day files load on demand; the next day is prefetched.
 * - Ticks in the files carry only changed fields (the store merges partials), pos
 *   frames omit `ids` when unchanged (restored here), and pos `t` is rewritten to
 *   this page's clock. No Zod parsing on the hot path.
 * - Positions are sampled once per sim-minute; between samples the player
 *   publishes interpolated positions (~12 Hz) so walkers glide at 1×.
 * - Nights are fast-forwarded (everyone asleep → at least NIGHT_SPEED).
 * - seek(s): load that day, apply its snapshot, fast-apply frames up to s
 *   (skipping every pos frame but the last).
 */
"use client";
import { track } from "@/lib/analytics";
import { create } from "zustand";
import type { Confessional, Memory, Newspaper, NpcContent, StreamFrame, TownContent, WorldEvent } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { SEASON_BASE, pad2 } from "./mode";
import { bestOrder, jumpTarget, openingMoment, playableEnd, playableStart } from "./moments";
import type { DayFile, Manifest, Moment, RawFrame } from "./types";

export const SPEEDS = [1, 4, 16] as const;
const NIGHT_SPEED = 60;
const LERP_MS = 80;
const UI_MS = 200;

export interface Active { title: string; text: string; kind: string; actors: string[]; when: string; momentIdx: number | null; untilWall: number }

export interface ReplayState {
  manifest: Manifest | null;
  papers: Newspaper[];
  error: string | null;
  /** current sim-minute (updated ~5×/s for the UI) */
  s: number;
  playing: boolean;
  speed: number;
  loading: boolean;
  night: boolean;
  ended: boolean;
  /** the moment the viewer jumped to (banner) */
  active: Active | null;
  /** position in the best-bit cycle */
  bestCursor: number;
  /** the scene has been started (arrival card closed / boot finished) */
  started: boolean;
}

export const useReplay = create<ReplayState>(() => ({
  manifest: null, papers: [], error: null, s: 0, playing: false, speed: 1, loading: true, night: false, ended: false,
  active: null, bestCursor: -1, started: false,
}));

/* ------------------------------------------------------------------ */
/* files                                                               */

const days = new Map<number, DayFile>();
const pending = new Map<number, Promise<DayFile>>();
const posIdx = new Map<number, Int32Array>(); // per day: index of the next pos frame at or after i

async function json<T>(path: string): Promise<T> {
  const r = await fetch(`${SEASON_BASE}/${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

function dayOf(s: number): number {
  const man = useReplay.getState().manifest!;
  let best = 1;
  for (const [d, start] of Object.entries(man.dayStarts)) if (start <= s && Number(d) > best) best = Number(d);
  return best;
}

function getDay(d: number): Promise<DayFile> {
  const have = days.get(d);
  if (have) return Promise.resolve(have);
  let p = pending.get(d);
  if (!p) {
    p = json<DayFile>(`days/${pad2(d)}.json`).then((f) => {
      days.set(d, f);
      const n = f.frames.length, next = new Int32Array(n + 1);
      next[n] = -1;
      for (let i = n - 1; i >= 0; i--) next[i] = f.frames[i][1].kind === "pos" ? i : next[i + 1];
      posIdx.set(d, next);
      // keep memory bounded: hold at most 3 days
      for (const k of [...days.keys()]) if (days.size > 3 && Math.abs(k - d) > 1 && k !== cur?.day && k !== (cur?.day ?? 0) + 1) { days.delete(k); posIdx.delete(k); }
      return f;
    }).finally(() => pending.delete(d));
    pending.set(d, p);
  }
  return p;
}
const hasDay = (d: number) => !!useReplay.getState().manifest?.dayStarts[String(d)];

/* ------------------------------------------------------------------ */
/* playback                                                            */

let cur: DayFile | null = null;
let idx = 0;
let simS = 0;
let lastIds: string[] = [];
let lastPos: { s: number; ids: string[]; p: number[] } | null = null;
let lastPublish = 0;
let lastUi = 0;
let raf = 0;
let lastNow = 0;
let gen = 0;
let busy = false;

const world = () => useWorld.getState();

function applyRaw(f: RawFrame[1], fast = false) {
  if (f.kind === "pos") {
    const ids = (f.ids as string[] | undefined) ?? lastIds;
    lastIds = ids;
    if (fast) return;
    world().applyFrame({ kind: "pos", t: performance.now(), ids, p: f.p as number[] });
    lastPublish = performance.now();
    return;
  }
  // trusted, already-validated recording: skip Zod (ticks are partial on purpose)
  world().applyFrame(f as unknown as StreamFrame);
}

function papersBefore(day: number): Record<number, Newspaper> {
  const out: Record<number, Newspaper> = {};
  for (const p of useReplay.getState().papers) if (p.day < day) out[p.day] = p;
  return out;
}

/** Make `d` the current day and apply its opening snapshot. */
function enterDay(f: DayFile, resetHistory: boolean) {
  cur = f; idx = 0; lastIds = []; lastPos = null;
  if (resetHistory) useWorld.setState({ events: [], confessionals: [], conversations: {}, papers: papersBefore(f.day) });
  world().applyFrame({ kind: "snapshot", snapshot: f.snapshot });
  if (hasDay(f.day + 1)) void getDay(f.day + 1).catch(() => {});
}

/** Publish positions between the last applied pos frame and the next one. */
function interpolate(now: number) {
  if (!cur || !lastPos || now - lastPublish < LERP_MS) return;
  const next = posIdx.get(cur.day)?.[idx] ?? -1;
  if (next < 0) return;
  const [ns, nf] = cur.frames[next];
  const nIds = (nf.ids as string[] | undefined) ?? lastIds;
  if (nIds !== lastPos.ids && (nIds.length !== lastPos.ids.length || nIds.some((id, i) => id !== lastPos!.ids[i]))) return;
  const span = ns - lastPos.s;
  if (span <= 0) return;
  const k = Math.min(1, Math.max(0, (simS - lastPos.s) / span));
  const a = lastPos.p, b = nf.p as number[];
  const p = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) p[i] = a[i] + (b[i] - a[i]) * k;
  world().applyFrame({ kind: "pos", t: now, ids: lastPos.ids, p });
  lastPublish = now;
}

function advance(target: number, now: number) {
  while (cur) {
    const fr = cur.frames;
    while (idx < fr.length && fr[idx][0] <= target) {
      const [s, f] = fr[idx++];
      applyRaw(f);
      if (f.kind === "pos") lastPos = { s, ids: lastIds, p: f.p as number[] };
    }
    if (idx < fr.length || target < cur.end) break;
    // day finished: roll into the next one
    const nd = cur.day + 1;
    const man = useReplay.getState().manifest!;
    if (!hasDay(nd) || target >= playableEnd(man)) {
      simS = Math.min(target, playableEnd(man));
      useReplay.setState({ playing: false, ended: true, s: simS });
      return;
    }
    const ready = days.get(nd);
    if (!ready) {
      simS = cur.end;
      busy = true;
      useReplay.setState({ loading: true });
      const g = gen;
      getDay(nd).then((f) => { if (g === gen) { enterDay(f, false); busy = false; useReplay.setState({ loading: false }); } })
        .catch((e) => { busy = false; useReplay.setState({ loading: false, playing: false, error: String(e) }); });
      return;
    }
    enterDay(ready, false);
  }
  simS = target;
  interpolate(now);
}

function loop(now: number) {
  raf = requestAnimationFrame(loop);
  // generous cap: a slow or throttled frame rate must not slow the story clock (only a long tab sleep is dropped)
  const dt = lastNow ? Math.min(2, (now - lastNow) / 1000) : 0;
  lastNow = now;
  const st = useReplay.getState();
  if (!st.playing || busy || !cur) return;
  const night = !!world().time?.sleeping;
  const rate = night ? Math.max(st.speed, NIGHT_SPEED) : st.speed;
  advance(simS + dt * rate, now);
  if (now - lastUi > UI_MS || night !== st.night) {
    lastUi = now;
    useReplay.setState({ s: simS, night });
  }
}

/* ------------------------------------------------------------------ */
/* public controls                                                     */

export function play() { useReplay.setState({ playing: true, ended: false, started: true }); }
export function pause() { useReplay.setState({ playing: false }); }
export function togglePlay() { if (useReplay.getState().playing) pause(); else play(); }
export function setSpeed(v: number) { useReplay.setState({ speed: v }); }
export function cycleSpeed() {
  const v = useReplay.getState().speed;
  const i = SPEEDS.indexOf(v as (typeof SPEEDS)[number]);
  setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
}

/** Jump to sim-minute `target`. Resolves once the world reflects that minute. */
export async function seek(target: number): Promise<void> {
  const man = useReplay.getState().manifest;
  if (!man) return;
  target = Math.max(playableStart(man), Math.min(playableEnd(man), target));
  const my = ++gen;
  busy = true;
  useReplay.setState({ loading: true, s: target, ended: false });
  try {
    const d = dayOf(target);
    const f = await getDay(d);
    if (my !== gen) return;
    enterDay(f, true);
    // fast-apply up to the target; of the pos frames only the last one matters
    let lastP: { s: number; p: number[] } | null = null;
    const fr = f.frames;
    while (idx < fr.length && fr[idx][0] <= target) {
      const [s, fx] = fr[idx++];
      if (fx.kind === "pos") { applyRaw(fx, true); lastP = { s, p: fx.p as number[] }; }
      else applyRaw(fx);
    }
    if (lastP) {
      world().applyFrame({ kind: "pos", t: performance.now(), ids: lastIds, p: lastP.p });
      lastPos = { s: lastP.s, ids: lastIds, p: lastP.p };
      lastPublish = performance.now();
    }
    simS = target;
    useReplay.setState({ s: target, night: !!world().time?.sleeping });
  } catch (e) {
    useReplay.setState({ error: String((e as Error).message ?? e) });
  } finally {
    if (my === gen) { busy = false; useReplay.setState({ loading: false }); }
  }
}

/** Jump to a manifest moment: seek before it, point the Director at it, show its banner. */
export async function jumpToMoment(i: number, opts: { play?: boolean } = {}): Promise<void> {
  track("moment_jump", { moment: i });
  const man = useReplay.getState().manifest;
  const m = man?.moments[i];
  if (!man || !m) return;
  await seek(jumpTarget(man, m));
  focusMoment(m, i);
  if (opts.play !== false) play();
}

export function focusMoment(m: Moment, i: number | null) {
  const when = momentWhenLabel(m);
  useReplay.setState({ active: { title: m.title, text: m.text, kind: m.kind, actors: m.actors, when, momentIdx: i, untilWall: Date.now() + 30_000 } });
  // the Director lives with the scene chunk; import lazily so this file stays scene-free
  void import("@/lib/director").then((d) => d.pinDirector({ npcIds: m.actors, locationId: m.locationId, reason: `${m.title}: ${m.text}` }, 25_000));
}

function momentWhenLabel(m: Moment) {
  return m.hour === 0 && m.minute === 0 ? `Day ${m.day} · overnight` : `Day ${m.day} · ${pad2(m.hour)}:${pad2(m.minute)}`;
}

/** Cycle "Jump to the best bit". */
export function nextBestBit(): void {
  track("best_bit");
  const st = useReplay.getState();
  if (!st.manifest) return;
  const order = bestOrder(st.manifest);
  if (!order.length) return;
  const c = (st.bestCursor + 1) % order.length;
  useReplay.setState({ bestCursor: c });
  void jumpToMoment(order[c]);
}

export function dismissActive() { useReplay.setState({ active: null }); }

/* ------------------------------------------------------------------ */
/* boot                                                                */

let started = false;

/** Start replay mode (idempotent): load the manifest and papers, seek to the deep-linked or opening moment. */
export function startReplay(): void {
  if (started) return;
  started = true;
  world().setUi({ connected: true });
  raf = requestAnimationFrame(loop);
  void (async () => {
    try {
      const [manifest, papers] = await Promise.all([json<Manifest>("manifest.json"), json<Newspaper[]>("papers.json").catch(() => [] as Newspaper[])]);
      useReplay.setState({ manifest, papers });
      const q = new URLSearchParams(window.location.search);
      const m = q.get("m"), t = q.get("t");
      if (m !== null && manifest.moments[Number(m)]) {
        const i = Number(m);
        await seek(jumpTarget(manifest, manifest.moments[i]));
        pendingFocus = i;
      } else if (t !== null && Number.isFinite(Number(t))) {
        await seek(Number(t));
        pendingFocus = null;
      } else {
        const i = openingMoment(manifest);
        await seek(jumpTarget(manifest, manifest.moments[i]));
        pendingFocus = i;
      }
    } catch (e) {
      useReplay.setState({ error: String((e as Error).message ?? e), loading: false });
    }
  })();
}

let pendingFocus: number | null = null;

/** Called once the scene is up and the arrival card is gone: start the clock on the opening scene. */
export function beginScene(): void {
  const st = useReplay.getState();
  if (st.started || !st.manifest) return;
  track("watch_start", { moment: pendingFocus ?? -1 });
  if (pendingFocus !== null) {
    // the best-bit cycle still starts at the top (the election, then the decisions)
    focusMoment(st.manifest.moments[pendingFocus], pendingFocus);
  }
  play();
}

export function stopReplay() { cancelAnimationFrame(raf); }

/* ------------------------------------------------------------------ */
/* api.* in replay mode: static files instead of the engine            */

const npcCache = new Map<string, Promise<{ content: unknown; memories: Memory[] }>>();
const watchingDay = () => world().time?.day ?? 1;

export const replayApi = {
  content: () => json<{ town: TownContent; cast: NpcContent[] }>("content.json"),
  npc: async (id: string) => {
    let p = npcCache.get(id);
    if (!p) { p = json<{ content: unknown; memories: Memory[] }>(`npcs/${id}.json`); npcCache.set(id, p); p.catch(() => npcCache.delete(id)); }
    const r = await p;
    const day = watchingDay();
    const s = world();
    return {
      state: s.npcs[id],
      content: r.content,
      memories: r.memories.filter((m) => m.day <= day),
      relationships: (s.snapshot?.relationships ?? []).filter((x) => x.a === id || x.b === id),
      confessionals: s.confessionals.filter((c) => c.npcId === id),
    };
  },
  paper: async (day: number | "latest"): Promise<Newspaper> => {
    const papers = useReplay.getState().papers.length ? useReplay.getState().papers : await json<Newspaper[]>("papers.json");
    const want = day === "latest" ? Math.max(...papers.filter((p) => p.day < watchingDay()).map((p) => p.day), -1) : day;
    const p = papers.find((x) => x.day === want);
    if (!p) throw new Error(`paper ${day}: 404`);
    return p;
  },
  confessionals: async (day: number): Promise<Confessional[]> => {
    if (!useReplay.getState().manifest?.dayStarts[String(day)] || day > watchingDay()) return [];
    const f = await getDay(day);
    const out: Confessional[] = [];
    for (const [, fr] of f.frames) if (fr.kind === "confessional") out.push(fr.confessional as Confessional);
    return out;
  },
  events: async (since: number, limit = 200): Promise<WorldEvent[]> => world().events.filter((e) => e.seq > since).slice(0, limit),
  llm: async () => ({ calls: 0, costUsd: 0, failures: 0, byKind: {} as Record<string, { calls: number; costUsd: number }> }),
  admin: async (): Promise<unknown> => { throw new Error("replay: no admin"); },
};
