/**
 * Quality tiers + frame-time statistics.
 *
 * Three named tiers, auto-detected from a GPU probe and then corrected by
 * measured CPU frame time:
 *
 * | tier | post                    | dpr  | shadows | notes            |
 * |------|-------------------------|------|---------|------------------|
 * | high | AO + bloom + DoF + grade| ≤1.75| 4096    | discrete / fast  |
 * | med  | bloom + grade           | ≤1.4 | 2048    | integrated GPUs  |
 * | low  | grade + tone map only   | 1    | 1024    | phones, software |
 *
 * `?q=low|med|high` (or the legacy `?q=0|1|2`) forces one and disables the
 * auto-downgrade. The numeric `tier` field is kept so existing callers
 * (`Effects.tsx`, `Town.tsx`'s dev hook) keep working unchanged.
 */
"use client";
import { useSyncExternalStore } from "react";
import * as THREE from "three";

export type TierName = "low" | "med" | "high";
export const TIER_NAME: TierName[] = ["low", "med", "high"];

export interface Quality {
  tier: 0 | 1 | 2;
  name: TierName;
  dpr: number;
  shadowSize: number;
  /** render the shadow map every Nth frame (1 = every frame) */
  shadowEvery: number;
  webgl2: boolean;
  floatTex: boolean;
  forced: boolean;
  reason: string;
  gpu: string;
}

const BASE: Record<TierName, Omit<Quality, "webgl2" | "floatTex" | "forced" | "reason" | "gpu">> = {
  low: { tier: 0, name: "low", dpr: 1, shadowSize: 1024, shadowEvery: 3 },
  med: { tier: 1, name: "med", dpr: 1.4, shadowSize: 2048, shadowEvery: 2 },
  high: { tier: 2, name: "high", dpr: 1.75, shadowSize: 4096, shadowEvery: 1 },
};

/**
 * One store on `globalThis`: Next can hand this "use client" module to more than
 * one chunk (the page's HUD and the lazily imported scene), and a second copy
 * would leave the loading screen's picker talking to a different renderer.
 */
interface Store { quality: Quality; listeners: Set<() => void>; userTier: TierName | null; cap: TierName; probed: boolean }
const KEY = "__npcworldQuality";
const g = globalThis as unknown as Record<string, Store | undefined>;
const S: Store = (g[KEY] ??= {
  // med until the probe runs — the common case, and the honest thing to show in
  // the loading screen's picker before there is a renderer to ask
  quality: { ...BASE.med, webgl2: true, floatTex: true, forced: false, reason: "not probed yet", gpu: "" },
  listeners: new Set<() => void>(), userTier: null, cap: "high", probed: false,
});
const listeners = S.listeners;
function set(q: Quality) { S.quality = q; listeners.forEach((l) => l()); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getQuality = () => S.quality;
export function useQuality(): Quality { return useSyncExternalStore(subscribe, getQuality, getQuality); }

function parseForced(): TierName | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("q");
  if (!v) return null;
  if (v === "low" || v === "med" || v === "high") return v;
  if (/^[012]$/.test(v)) return TIER_NAME[Number(v)];
  return null;
}

/** user override from the loading screen / corner toggle; sticky for the session */
export function setTier(name: TierName, reason = "you picked it") {
  S.userTier = name;
  apply(name, reason, true);
  try { sessionStorage.setItem("npcworld.q", name); } catch { /* private mode */ }
}
function storedTier(): TierName | null {
  try { const v = sessionStorage.getItem("npcworld.q"); return v === "low" || v === "med" || v === "high" ? v : null; } catch { return null; }
}

function apply(name: TierName, reason: string, forced: boolean) {
  set({ ...BASE[name], dpr: Math.min(BASE[name].dpr, dprCap()), webgl2: S.quality.webgl2, floatTex: S.quality.floatTex, forced, reason, gpu: S.quality.gpu });
}
const dprCap = () => (typeof window === "undefined" ? 1 : Math.max(1, Math.min(window.devicePixelRatio || 1, 2)));


/**
 * Probe once: WebGL2 + float targets, the unmasked GPU string, the viewport and
 * the core count. Phones, software renderers and small viewports start at low.
 */
export function probeRenderer(gl: THREE.WebGLRenderer) {
  if (S.probed) return;
  S.probed = true;
  const webgl2 = gl.capabilities.isWebGL2;
  const ctx = gl.getContext();
  const floatTex = webgl2
    ? !!ctx.getExtension("EXT_color_buffer_float") || !!ctx.getExtension("EXT_color_buffer_half_float")
    : !!ctx.getExtension("OES_texture_half_float");
  let gpu = "";
  try {
    const dbg = ctx.getExtension("WEBGL_debug_renderer_info");
    if (dbg) gpu = String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "");
  } catch { /* blocked by privacy settings */ }
  S.quality = { ...S.quality, webgl2, floatTex, gpu };

  const w = typeof window !== "undefined" ? window.innerWidth : 1280;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  const phone = Math.min(w, h) < 600 || w < 820;
  const software = /swiftshader|llvmpipe|software|basic render|angle \(google/i.test(gpu);
  const integrated = /apple m\d|apple gpu|intel|iris|uhd|hd graphics|mali|adreno|powervr/i.test(gpu);
  const discrete = /nvidia|geforce|rtx|quadro|radeon (rx|pro)|arc a/i.test(gpu);

  let name: TierName;
  let reason: string;
  if (!webgl2) { name = "low"; reason = "no WebGL2"; }
  else if (software) { name = "low"; reason = "software renderer"; }
  else if (phone) { name = "low"; reason = "small viewport"; }
  else if (cores <= 4) { name = "med"; reason = `${cores} cores`; }
  else if (!floatTex) { name = "med"; reason = "no float render targets"; }
  else if (discrete) { name = "high"; reason = "discrete GPU"; }
  else if (integrated) { name = "med"; reason = "integrated GPU"; }
  else { name = "med"; reason = "unknown GPU"; }
  S.cap = name;

  const url = parseForced();
  const pick = url ?? S.userTier ?? storedTier();
  if (pick) { S.userTier = pick; apply(pick, url ? `?q=${url}` : "your choice", true); }
  else apply(name, reason, false);
}

/* --------------------------- frame-time statistics -------------------------- */

const N = 180;
const dts = new Float32Array(N);
let head = 0, filled = 0;
let lastT = 0, settleFrames = 0;
let lowFor = 0, goodFor = 0, upgraded = false;
const FKEY = "__npcworldFrameStats";
const gf = globalThis as unknown as Record<string, typeof EMPTY_STATS | undefined>;
const EMPTY_STATS = { fps: 0, p50: 0, p95: 0, worst: 0, calls: 0, triangles: 0, programs: 0, frames: 0 };
export const frameStats = (gf[FKEY] ??= { ...EMPTY_STATS });

const sorted = new Float32Array(N);
function percentile(p: number): number {
  const n = filled;
  if (!n) return 0;
  sorted.set(dts.subarray(0, n));
  const a = sorted.subarray(0, n);
  a.sort();
  return a[Math.min(n - 1, Math.floor(p * n))];
}

/**
 * Call once per frame. Measures CPU frame time (the only meaningful number on a
 * software renderer) and steps the tier down when the machine can't keep up.
 */
export function tickFps(now: number) {
  if (!lastT) { lastT = now; return; }
  const dt = now - lastT; lastT = now;
  if (dt <= 0 || dt > 2000) return; // tab was hidden / a long stall we don't want in the histogram
  dts[head] = dt; head = (head + 1) % N; if (filled < N) filled++;
  frameStats.frames++;
  if (frameStats.frames % 15 !== 0) return;
  frameStats.p50 = percentile(0.5);
  frameStats.p95 = percentile(0.95);
  frameStats.fps = frameStats.p50 > 0 ? 1000 / frameStats.p50 : 0;
  let worst = 0;
  for (let i = 0; i < filled; i++) if (dts[i] > worst) worst = dts[i];
  frameStats.worst = worst;
  lastFps = frameStats.fps;
  // first ~90 frames are shader compiles and rig building — never judge the machine on those
  if (settleFrames < 90) { settleFrames += 15; return; }
  if (S.quality.forced) return;
  const slow = frameStats.p50 > 26; // < ~38 fps sustained
  if (slow) { lowFor += 15; goodFor = 0; } else { goodFor += 15; lowFor = 0; }
  if (lowFor >= 120 && S.quality.tier > 0) {
    lowFor = 0;
    apply(TIER_NAME[S.quality.tier - 1], `${frameStats.p50.toFixed(0)} ms/frame`, false);
    settleFrames = 0;
  } else if (!upgraded && goodFor >= 300 && frameStats.p50 < 11 && S.quality.tier < BASE[S.cap].tier) {
    upgraded = true; goodFor = 0;
    apply(TIER_NAME[S.quality.tier + 1], "headroom", false);
    settleFrames = 0;
  }
}

/** renderer counters for the stats overlay (previous frame) */
export function setRenderStats(calls: number, triangles: number, programs: number) {
  frameStats.calls = calls; frameStats.triangles = triangles; frameStats.programs = programs;
}

/** kept for callers that only wanted the number (live binding) */
export let lastFps = 0;

// reflect ?q= / a remembered choice immediately, before the canvas exists
if (typeof window !== "undefined" && !S.probed) {
  const pick = parseForced() ?? storedTier();
  if (pick) { S.userTier = pick; apply(pick, "your choice", true); }
}
