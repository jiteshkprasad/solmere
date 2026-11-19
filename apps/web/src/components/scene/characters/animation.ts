/**
 * Procedural pose system. No keyframes: every state is a function of time
 * (and the rig's gait personality) writing joint eulers into a flat pose
 * buffer; state changes cross-fade over 0.3 s. Allocation-free per frame.
 *
 * Sign conventions (bone local, child hanging along -y for limbs):
 *   arms / thighs forward  = -rx      knee bend (shin back) = +rx
 *   spine / head forward   = +rx      elbow bend (forearm forward) = -rx
 *   arm out to the side    = -rz (left) / +rz (right)
 */
import type { ActionKind } from "@npcworld/schema";
import { J } from "./rig";
import type { CharacterRig, Gait, WorkKind } from "./builder";

export type AnimState =
  | "walk" | "idle" | "talk" | "work" | "eat" | "drink" | "shop" | "sleep" | "worship" | "create" | "speech" | "sick" | "leisure";

export interface AnimCtx {
  t: number;            // global seconds
  moving: boolean;
  phase: number;        // walk phase (advances only while moving)
  speed: number;        // m/s, world units (already NPC_SCALE'd)
  action: ActionKind;
  talking: boolean;     // in a conversation
  speaking: boolean;    // is the current line's speaker
  seed: number;         // per-character 0..1
}

const N = J.COUNT * 3;
const HIP = N; // hips translation offset (x, y, z) at the end of the buffer
export const POSE_SIZE = N + 3;
const BLEND_S = 0.3;

export interface AnimInstance {
  rig: CharacterRig;
  state: AnimState;
  stateT: number;
  blend: number;               // 0..1 cross-fade progress
  prev: Float32Array;          // frozen pose we're blending from
  live: Float32Array;          // pose of the current state this frame
  out: Float32Array;           // blended result applied to bones
}

export function createAnim(rig: CharacterRig): AnimInstance {
  return { rig, state: "idle", stateT: 0, blend: 1, prev: new Float32Array(POSE_SIZE), live: new Float32Array(POSE_SIZE), out: new Float32Array(POSE_SIZE) };
}

function stateFor(c: AnimCtx): AnimState {
  if (c.action === "sleep") return "sleep";
  if (c.moving) return "walk";
  if (c.action === "sick") return "sick";
  if (c.talking || c.action === "talk") return "talk";
  switch (c.action) {
    case "work": return "work";
    case "eat": return "eat";
    case "drink": return "drink";
    case "shop": return "shop";
    case "worship": return "worship";
    case "create": return "create";
    case "speech": return "speech";
    case "leisure": return "leisure";
    default: return "idle";
  }
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** slow wandering noise in -1..1 (long holds, occasional moves) */
const wander = (t: number, s: number) => Math.sin(t * 0.37 + s * 9) * Math.sin(t * 0.11 + s * 3) * Math.sin(t * 0.23 + s * 5) * 2.2;
/** 0..1 pulse that stays ~0 most of the time */
const pulse = (t: number, period: number, s: number) => { const k = Math.sin(t / period * Math.PI * 2 + s * 7); return k > 0.85 ? (k - 0.85) / 0.15 : 0; };

/* ------------------------------------------------------------ pose writers */

function set(p: Float32Array, j: number, rx: number, ry = 0, rz = 0) { p[j * 3] = rx; p[j * 3 + 1] = ry; p[j * 3 + 2] = rz; }
function addr(p: Float32Array, j: number, rx: number, ry = 0, rz = 0) { p[j * 3] += rx; p[j * 3 + 1] += ry; p[j * 3 + 2] += rz; }

/** neutral standing pose with the rig's personality baked in */
function rest(p: Float32Array, g: Gait, c: AnimCtx) {
  p.fill(0);
  const proud = g.proud, tired = g.tired;
  set(p, J.hips, 0, 0, 0);
  set(p, J.spine, g.stoop * 0.6 + tired * 0.06 - proud * 0.03);
  set(p, J.chest, g.stoop * 0.4 + tired * 0.05 - proud * 0.05);
  set(p, J.neck, -g.stoop * 0.6 + tired * 0.05 - proud * 0.02);
  set(p, J.head, -g.stoop * 0.3 + tired * 0.08 - proud * 0.05);
  // arms: slightly out, elbows a touch bent; held items raise the forearm
  set(p, J.uArmL, -0.05 * (1 - g.holdL) - 0.25 * g.holdL + tired * 0.05, 0, -0.1 - g.holdL * 0.05);
  set(p, J.fArmL, -0.15 - g.holdL * 1.25, 0, g.holdL * 0.35);
  set(p, J.uArmR, -0.05 * (1 - g.holdR) - 0.25 * g.holdR + tired * 0.05, 0, 0.1 + g.holdR * 0.05);
  set(p, J.fArmR, -0.15 - g.holdR * 1.25, 0, -g.holdR * 0.35);
  if (g.cane) { set(p, J.uArmR, -0.3, 0, 0.12); set(p, J.fArmR, -0.1, 0, 0); }
  if (g.shoulderCarry) { set(p, J.uArmL, -2.2, 0, -0.45); set(p, J.fArmL, -0.9, 0, 0.3); }
  set(p, J.thighL, 0, 0, -0.03); set(p, J.thighR, 0, 0, 0.03);
  set(p, J.shinL, 0.03); set(p, J.shinR, 0.03);
  p[HIP] = 0; p[HIP + 1] = -g.stoop * 0.04; p[HIP + 2] = 0;
  void c;
}

function breathe(p: Float32Array, t: number, s: number, k = 1) {
  const b = Math.sin(t * 1.4 + s * 10) * 0.012 * k;
  addr(p, J.chest, b); addr(p, J.neck, -b * 0.5);
  p[HIP + 1] += Math.sin(t * 1.4 + s * 10) * 0.003 * k;
}

function idle(p: Float32Array, g: Gait, c: AnimCtx, st: number) {
  const t = c.t * g.slow, s = c.seed;
  rest(p, g, c);
  breathe(p, t, s);
  // weight shift + fidget
  const w = Math.sin(t * (0.35 + g.restless * 0.4) + s * 6);
  p[HIP] += w * 0.012; addr(p, J.hips, 0, 0, -w * 0.035); addr(p, J.chest, 0, 0, w * 0.03);
  addr(p, J.thighL, 0, 0, w * 0.03); addr(p, J.thighR, 0, 0, w * 0.03);
  // look around
  const look = wander(t, s);
  addr(p, J.head, Math.max(-0.1, -look * 0.08), clamp(look * 0.45, -0.7, 0.7), 0);
  addr(p, J.neck, 0, clamp(look * 0.2, -0.3, 0.3), 0);
  // restless types scratch / shift arms now and then
  if (g.restless > 0.3) { const k = pulse(t, 6 + s * 3, s) * g.restless; addr(p, J.uArmR, -k * 0.7, 0, k * 0.2); addr(p, J.fArmR, -k * 1.4); }
  // cane tap
  if (g.cane) { const k = pulse(t, 5, s + 1); addr(p, J.uArmR, -k * 0.15); }
  void st;
}

function walk(p: Float32Array, g: Gait, c: AnimCtx) {
  const ph = c.phase, s = c.seed;
  rest(p, g, c);
  const stride = clamp(c.speed / 1.4, 0.55, 1.3) * (c.action === "sick" ? 0.7 : 1);
  const sw = Math.sin(ph), cs = Math.cos(ph);
  const leg = 0.55 * stride;
  // legs
  addr(p, J.thighL, -sw * leg); addr(p, J.thighR, sw * leg);
  const kneeL = Math.max(0, cs) * 0.9 * stride + 0.05, kneeR = Math.max(0, -cs) * 0.9 * stride + 0.05;
  addr(p, J.shinL, kneeL); addr(p, J.shinR, kneeR);
  addr(p, J.footL, -(kneeL * 0.45 - sw * leg * 0.3)); addr(p, J.footR, -(kneeR * 0.45 + sw * leg * 0.3));
  // arms (opposite to legs); held / cane / carrying arms don't swing
  const arm = 0.45 * stride * g.swing;
  const swL = g.shoulderCarry ? 0 : (1 - g.holdL * 0.85), swR = g.cane ? 0.25 : (1 - g.holdR * 0.85);
  addr(p, J.uArmL, sw * arm * swL); addr(p, J.uArmR, -sw * arm * swR);
  addr(p, J.fArmL, -Math.max(0, sw) * 0.35 * swL); addr(p, J.fArmR, -Math.max(0, -sw) * 0.35 * swR);
  // body: bob, lean, sway, counter-rotation of the shoulders
  const bob = Math.abs(Math.sin(ph)) * 0.022 * g.bounce * stride;
  p[HIP + 1] += bob - 0.01 * stride;
  addr(p, J.spine, 0.04 + stride * 0.04 * (c.action === "sick" ? 3 : 1));
  addr(p, J.hips, 0, sw * 0.06, sw * 0.045 * (0.5 + g.sway));
  addr(p, J.chest, 0, -sw * 0.1, -sw * 0.035 * (0.5 + g.sway));
  addr(p, J.head, Math.abs(sw) * 0.02, 0, -sw * 0.015);
  breathe(p, c.t, s, 0.5);
}

function talk(p: Float32Array, g: Gait, c: AnimCtx, st: number) {
  const t = c.t, s = c.seed;
  idle(p, g, c, st);
  // face the partner squarely (heading is handled by the runtime); undo most of the look-around
  p[J.head * 3 + 1] *= 0.25; p[J.neck * 3 + 1] *= 0.25;
  if (c.speaking) {
    // nods + a gesturing hand (alternates which hand by seed)
    addr(p, J.head, 0.04 + Math.sin(t * 5.5 + s) * 0.05, Math.sin(t * 2.1) * 0.06, Math.sin(t * 1.3) * 0.03);
    const right = !g.cane && (g.holdR < 0.5 || g.holdL > 0.5);
    const u = right ? J.uArmR : J.uArmL, f = right ? J.fArmR : J.fArmL, sg = right ? 1 : -1;
    const k = 0.7 + 0.3 * Math.sin(t * 0.9 + s * 4);
    set(p, u, -0.55 * k, 0, sg * 0.35); set(p, f, -1.25 - Math.sin(t * 3.7 + s) * 0.35 * k, 0, -sg * 0.25 * k);
    addr(p, J.chest, 0.03, Math.sin(t * 1.7) * 0.04, 0);
  } else {
    // listening: slight head tilt, occasional nod
    const nod = pulse(t, 3.5, s) * 0.12;
    addr(p, J.head, nod + 0.02, 0, 0.06 * Math.sin(s * 10));
    if (g.holdR < 0.5 && !g.cane && Math.sin(s * 20) > 0) { set(p, J.uArmL, 0.1, 0, -0.35); set(p, J.fArmL, -1.65, 0, 0.9); set(p, J.uArmR, 0.1, 0, 0.35); set(p, J.fArmR, -1.65, 0, -0.9); } // arms crossed
  }
}

/** a fast strike with a slower wind-up, 0..1 */
const strike = (x: number) => { const k = (x % 1); return k < 0.7 ? k / 0.7 : 1 - (k - 0.7) / 0.3; };

function work(p: Float32Array, rig: CharacterRig, c: AnimCtx, st: number) {
  const g = rig.gait, t = c.t, s = c.seed;
  const kind: WorkKind = c.action === "create" ? (rig.work === "strum" || rig.work === "paint" ? rig.work : rig.job === "musician" ? "strum" : "paint") : rig.work;
  idle(p, g, c, st);
  p[J.head * 3 + 1] *= 0.3;
  switch (kind) {
    case "knead": { const k = Math.sin(t * 5 + s); set(p, J.spine, 0.28); set(p, J.neck, -0.1); set(p, J.head, 0.25); set(p, J.uArmL, -1.05 + k * 0.12, 0, -0.2); set(p, J.fArmL, -0.55 - Math.max(0, k) * 0.3); set(p, J.uArmR, -1.05 - k * 0.12, 0, 0.2); set(p, J.fArmR, -0.55 - Math.max(0, -k) * 0.3); p[HIP + 1] += Math.abs(k) * 0.006; break; }
    case "hammer": { const k = strike(t * 1.4 + s); set(p, J.spine, 0.2); set(p, J.head, 0.3); set(p, J.uArmR, -0.6 - k * 1.1, 0, 0.25); set(p, J.fArmR, -0.7 - k * 0.6); set(p, J.uArmL, -0.7, 0, -0.15); set(p, J.fArmL, -0.9); break; }
    case "saw": { const k = Math.sin(t * 6 + s); set(p, J.spine, 0.38); set(p, J.head, 0.2); set(p, J.uArmR, -0.85 + k * 0.4, 0, 0.3); set(p, J.fArmR, -0.4 - Math.max(0, k) * 0.2); if (!g.shoulderCarry) { set(p, J.uArmL, -0.6, 0, -0.25); set(p, J.fArmL, -0.7); } break; }
    case "fish": { const k = Math.sin(t * 2.6 + s); set(p, J.spine, 0.12 + Math.max(0, k) * 0.12); set(p, J.uArmL, -0.95 + k * 0.25, 0, -0.2); set(p, J.fArmL, -0.75 - Math.max(0, k) * 0.35); set(p, J.uArmR, -0.85 - k * 0.25, 0, 0.2); set(p, J.fArmR, -0.75 - Math.max(0, -k) * 0.35); addr(p, J.chest, 0, k * 0.1, 0); break; }
    case "haul": { const k = Math.sin(t * 3 + s); set(p, J.spine, 0.35 - Math.max(0, k) * 0.15); set(p, J.head, 0.1); set(p, J.uArmL, -0.7 - k * 0.3, 0, -0.25); set(p, J.fArmL, -0.9); set(p, J.uArmR, -0.7 - k * 0.3, 0, 0.25); set(p, J.fArmR, -0.9); addr(p, J.shinL, 0.15); addr(p, J.shinR, 0.15); p[HIP + 1] -= 0.02; break; }
    case "sweep": { const k = Math.sin(t * 2.4 * g.slow + s); set(p, J.spine, 0.18, k * 0.22, 0); set(p, J.head, 0.3); set(p, J.uArmR, -0.55 + k * 0.3, 0, 0.35); set(p, J.fArmR, -0.35); set(p, J.uArmL, -0.35 + k * 0.25, 0, -0.3); set(p, J.fArmL, -0.9); break; }
    case "write": case "type": { const k = Math.sin(t * (kind === "type" ? 14 : 9) + s); set(p, J.spine, 0.12); set(p, J.neck, 0.1); set(p, J.head, 0.3); set(p, J.uArmL, -0.45, 0, -0.15); set(p, J.fArmL, -1.35, 0, 0.35); set(p, J.uArmR, -0.45, 0.1 * Math.sin(t * 1.3), 0.2); set(p, J.fArmR, -1.3 + k * 0.05, 0, -0.35); set(p, J.handR, k * 0.18, 0, 0); break; }
    case "pour": { const k = 0.5 + 0.5 * Math.sin(t * 1.6 + s); set(p, J.uArmR, -0.85, 0, 0.3); set(p, J.fArmR, -0.55 + k * 0.15); set(p, J.handR, 0, 0, -k * 0.7); set(p, J.uArmL, -0.5, 0, -0.2); set(p, J.fArmL, -1.1); set(p, J.head, 0.22, -0.15, 0); break; }
    case "carry": { const k = Math.sin(t * 1.2 + s); set(p, J.spine, 0.06, k * 0.05, 0); set(p, J.uArmL, -2.25, 0, -0.45); set(p, J.fArmL, -0.9, 0, 0.3); set(p, J.uArmR, -0.2, 0, 0.2); set(p, J.fArmR, -0.3); addr(p, J.hips, 0, 0, -0.04); break; }
    case "dig": { const k = Math.sin(t * 2.2 * g.slow + s); set(p, J.spine, 0.28 + Math.max(0, k) * 0.15); set(p, J.head, 0.25); set(p, J.uArmR, -0.9 + k * 0.45, 0, 0.25); set(p, J.fArmR, -0.35 - Math.max(0, -k) * 0.3); set(p, J.uArmL, -0.7 + k * 0.4, 0, -0.35); set(p, J.fArmL, -0.8); addr(p, J.thighL, -0.15); addr(p, J.shinL, 0.25); addr(p, J.thighR, 0.1); p[HIP + 1] -= 0.015; break; }
    case "paint": { const k = Math.sin(t * 3.4 + s); set(p, J.uArmR, -1.15 + Math.sin(t * 0.8) * 0.15, 0, 0.25 + k * 0.12); set(p, J.fArmR, -0.5 + k * 0.1); set(p, J.handR, 0, 0, k * 0.35); set(p, J.uArmL, -0.5, 0, -0.35); set(p, J.fArmL, -1.35, 0, 0.5); set(p, J.head, 0.05, -0.1 + Math.sin(t * 0.5) * 0.15, 0.05); break; }
    case "strum": { const k = Math.sin(t * 6 + s); set(p, J.uArmL, -0.9, 0.3, -0.7); set(p, J.fArmL, -1.35, 0, 0.9); set(p, J.uArmR, -0.55, 0, 0.55); set(p, J.fArmR, -1.15 + k * 0.18, 0, -0.5); set(p, J.head, 0.2 + Math.sin(t * 2) * 0.04, -0.2, 0.08); addr(p, J.hips, 0, 0, Math.sin(t * 1.5) * 0.03); p[HIP + 1] += Math.abs(Math.sin(t * 3)) * 0.004; break; }
    case "examine": { const k = Math.sin(t * 1.4 + s); set(p, J.spine, 0.3); set(p, J.neck, 0.05); set(p, J.head, 0.15, k * 0.1, 0); set(p, J.uArmR, -1.05 + k * 0.08, 0, 0.2); set(p, J.fArmR, -0.35); set(p, J.uArmL, -0.7, 0, -0.2); set(p, J.fArmL, -0.8); break; }
    case "cut": { const k = Math.sin(t * 9 + s); set(p, J.uArmR, -1.45 + Math.sin(t * 0.9) * 0.1, 0, 0.35); set(p, J.fArmR, -0.7); set(p, J.handR, 0, 0, k * 0.22); set(p, J.uArmL, -1.35, 0, -0.35); set(p, J.fArmL, -0.75); set(p, J.head, 0.12, 0.15, 0.06); break; }
    case "weigh": { const k = Math.sin(t * 1.1 + s); set(p, J.uArmR, -1.3, 0, 0.25); set(p, J.fArmR, -0.05 + k * 0.05); set(p, J.head, 0.15, -0.35, 0); set(p, J.uArmL, -0.7 - Math.max(0, k) * 0.4, 0, -0.5 - k * 0.2); set(p, J.fArmL, -1.1); addr(p, J.chest, 0, -0.15, 0); break; }
    case "sew": { const k = Math.sin(t * 7 + s); set(p, J.spine, 0.12); set(p, J.head, 0.32); set(p, J.uArmL, -0.65, 0, -0.1); set(p, J.fArmL, -1.65, 0, 0.55); set(p, J.uArmR, -0.65 + k * 0.05, 0, 0.1); set(p, J.fArmR, -1.55, 0, -0.45); set(p, J.handR, k * 0.3, 0, 0); break; }
    case "stir": { const k = t * 3.2; set(p, J.spine, 0.16); set(p, J.head, 0.25); set(p, J.uArmR, -0.85 + Math.sin(k) * 0.15, 0, 0.3 + Math.cos(k) * 0.2); set(p, J.fArmR, -0.7); set(p, J.uArmL, -0.5, 0, -0.35); set(p, J.fArmL, -0.9); break; }
    case "wrench": { const k = Math.sin(t * 3.6 + s); set(p, J.spine, 0.42); set(p, J.head, 0.15); set(p, J.uArmR, -1.05, 0, 0.25); set(p, J.fArmR, -0.35 + k * 0.25, 0, k * 0.35); set(p, J.uArmL, -0.75, 0, -0.35); set(p, J.fArmL, -0.7); addr(p, J.thighL, -0.9); addr(p, J.shinL, 1.35); addr(p, J.thighR, -0.9); addr(p, J.shinR, 1.35); p[HIP + 1] -= rig.dims.H * 0.16; break; }
    case "telescope": { set(p, J.uArmR, -1.25, 0, 0.25); set(p, J.fArmR, -1.95, 0, -0.55); set(p, J.head, -0.08, 0.12 + wander(t, s) * 0.1, 0); set(p, J.uArmL, 0.35, 0, -0.15); set(p, J.fArmL, 0.6); break; }
    case "patrol": { set(p, J.uArmL, 0.4, 0, -0.15); set(p, J.fArmL, 0.95, 0, 0.5); set(p, J.uArmR, 0.4, 0, 0.15); set(p, J.fArmR, 0.95, 0, -0.5); addr(p, J.chest, -0.06); addr(p, J.head, -0.03, wander(t, s) * 0.4, 0); break; }
    case "lantern": { set(p, J.uArmR, -0.55, 0, 0.2); set(p, J.fArmR, -0.35); addr(p, J.head, 0, wander(t, s) * 0.5, 0); break; }
    case "sort": { const k = Math.sin(t * 2.4 + s); set(p, J.spine, 0.12); set(p, J.head, 0.28, k * 0.15, 0); set(p, J.uArmL, -0.5, 0, -0.2); set(p, J.fArmL, -1.3, 0, 0.4); set(p, J.uArmR, -0.6, 0, 0.15 + k * 0.45); set(p, J.fArmR, -1.1 - Math.abs(k) * 0.2); break; }
    case "gesture": { const k = pulse(t, 4, s); set(p, J.uArmR, -0.4 - k * 0.5, 0, 0.3 + k * 0.4); set(p, J.fArmR, -1.1 - k * 0.3, 0, -0.3); addr(p, J.chest, -0.04); break; }
    case "teach": { const k = 0.5 + 0.5 * Math.sin(t * 0.7 + s); set(p, J.uArmR, -1.2 - k * 0.7, 0, 0.35); set(p, J.fArmR, -0.35 - k * 0.2); set(p, J.uArmL, 0.05, 0, -0.55); set(p, J.fArmL, -1.55, 0, 0.7); addr(p, J.head, -0.05, Math.sin(t * 0.9) * 0.3, 0); break; }
    case "stand": default: break;
  }
}

function sit(p: Float32Array, rig: CharacterRig, c: AnimCtx, st: number, drink: boolean) {
  const g = rig.gait, t = c.t, s = c.seed;
  idle(p, g, c, st);
  // sitting on an implied bench: thighs forward, shins down, torso upright
  addr(p, J.thighL, -1.35, 0, -0.08); addr(p, J.thighR, -1.35, 0, 0.08);
  addr(p, J.shinL, 1.25); addr(p, J.shinR, 1.25);
  set(p, J.footL, -0.1); set(p, J.footR, -0.1);
  p[HIP + 1] -= rig.dims.H * 0.19;
  addr(p, J.spine, 0.06);
  // hand to mouth
  const k = 0.5 + 0.5 * Math.sin(t * 1.8 * g.slow + s);
  const u = drink ? J.uArmL : J.uArmR, f = drink ? J.fArmL : J.fArmR, sg = drink ? -1 : 1;
  set(p, u, -0.35 - k * 0.5, 0, sg * 0.35); set(p, f, -1.5 - k * 0.7, 0, -sg * 0.55 * k);
  const o = drink ? J.uArmR : J.uArmL, of = drink ? J.fArmR : J.fArmL;
  set(p, o, -0.45, 0, -sg * 0.15); set(p, of, -1.35, 0, sg * 0.35);
  addr(p, J.head, 0.12 + k * 0.05);
}

function sleep(p: Float32Array, rig: CharacterRig, c: AnimCtx) {
  const t = c.t, s = c.seed;
  rest(p, rig.gait, c);
  set(p, J.spine, 0); set(p, J.chest, 0); set(p, J.neck, 0); set(p, J.head, 0.1, 0.35 * Math.sin(s * 10), 0);
  set(p, J.hips, -Math.PI / 2, 0, 0);
  set(p, J.uArmL, 0, 0, -0.2); set(p, J.fArmL, -1.2, 0, 0.4); set(p, J.uArmR, 0, 0, 0.2); set(p, J.fArmR, -0.4);
  set(p, J.thighL, 0.05, 0, -0.06); set(p, J.thighR, -0.05, 0, 0.06); set(p, J.shinL, 0.15); set(p, J.shinR, 0.05);
  p[HIP + 1] = -rig.dims.hipsY + rig.dims.torsoD * 0.62;
  p[HIP + 2] = 0;
  const b = Math.sin(t * 0.9 + s * 10) * 0.01;
  addr(p, J.chest, b);
}

function worship(p: Float32Array, g: Gait, c: AnimCtx, st: number) {
  idle(p, g, c, st);
  set(p, J.spine, g.stoop * 0.5 + 0.12); set(p, J.neck, 0.15); set(p, J.head, 0.45, 0, 0);
  set(p, J.uArmL, -0.5, 0, -0.05); set(p, J.fArmL, -1.75, 0, 0.75); set(p, J.uArmR, -0.5, 0, 0.05); set(p, J.fArmR, -1.75, 0, -0.75);
}

function speech(p: Float32Array, g: Gait, c: AnimCtx, st: number) {
  const t = c.t, s = c.seed;
  idle(p, g, c, st);
  const k = 0.5 + 0.5 * Math.sin(t * 1.1 + s);
  set(p, J.uArmL, -0.9 - k * 0.3, 0, -0.9 + k * 0.3); set(p, J.fArmL, -0.5 - k * 0.3, 0, 0.3);
  set(p, J.uArmR, -0.9 - (1 - k) * 0.3, 0, 0.9 - (1 - k) * 0.3); set(p, J.fArmR, -0.5 - (1 - k) * 0.3, 0, -0.3);
  set(p, J.chest, -0.08 + Math.sin(t * 2.2) * 0.03, Math.sin(t * 0.8) * 0.12, 0);
  set(p, J.head, -0.12 + Math.sin(t * 4) * 0.04, Math.sin(t * 0.8) * 0.25, 0);
}

function sick(p: Float32Array, g: Gait, c: AnimCtx, st: number) {
  const t = c.t * 0.6, s = c.seed;
  idle(p, g, c, st);
  set(p, J.spine, 0.32); set(p, J.chest, 0.1); set(p, J.head, 0.22 + Math.sin(t * 1.3) * 0.03, 0, 0.08);
  set(p, J.uArmL, -0.45, 0, -0.1); set(p, J.fArmL, -1.55, 0, 0.9); set(p, J.uArmR, -0.45, 0, 0.1); set(p, J.fArmR, -1.55, 0, -0.9);
  addr(p, J.hips, 0, 0, Math.sin(t * 0.8 + s) * 0.03);
}

function leisure(p: Float32Array, g: Gait, c: AnimCtx, st: number) {
  idle(p, g, c, st);
  const variant = Math.floor(c.seed * 3);
  // weight on one leg
  p[HIP] += 0.02; addr(p, J.hips, 0, 0, -0.05); addr(p, J.chest, 0, 0, 0.04);
  if (g.holdL > 0.5 || g.holdR > 0.5 || g.cane || g.shoulderCarry) return;
  if (variant === 0) { set(p, J.uArmL, 0.1, 0, -0.35); set(p, J.fArmL, -1.65, 0, 0.9); set(p, J.uArmR, 0.1, 0, 0.35); set(p, J.fArmR, -1.65, 0, -0.9); } // arms crossed
  else if (variant === 1) { set(p, J.uArmL, 0.2, 0, -0.12); set(p, J.fArmL, -0.45, 0, 0.1); set(p, J.uArmR, 0.2, 0, 0.12); set(p, J.fArmR, -0.45, 0, -0.1); } // hands in pockets
  else { set(p, J.uArmL, 0.05, 0, -0.5); set(p, J.fArmL, -1.5, 0, 0.55); } // hand on hip
}

function shop(p: Float32Array, g: Gait, c: AnimCtx, st: number) {
  const t = c.t, s = c.seed;
  idle(p, g, c, st);
  addr(p, J.head, 0.2, 0, 0);
  const k = pulse(t, 5, s);
  if (g.holdR < 0.5 && !g.cane) { set(p, J.uArmR, -0.35 - k * 0.7, 0, 0.2); set(p, J.fArmR, -0.7 - k * 0.2); }
}

/* ------------------------------------------------------------ driver */

/** Evaluate + blend + apply to bones. Call once per frame per visible character. */
export function animate(inst: AnimInstance, c: AnimCtx, dt: number) {
  const rig = inst.rig, g = rig.gait;
  const next = stateFor(c);
  if (next !== inst.state) {
    inst.prev.set(inst.out);
    inst.state = next; inst.stateT = 0; inst.blend = 0;
  }
  inst.stateT += dt;
  const p = inst.live;
  switch (inst.state) {
    case "walk": walk(p, g, c); break;
    case "talk": talk(p, g, c, inst.stateT); break;
    case "work": case "create": work(p, rig, c, inst.stateT); break;
    case "eat": sit(p, rig, c, inst.stateT, false); break;
    case "drink": sit(p, rig, c, inst.stateT, true); break;
    case "sleep": sleep(p, rig, c); break;
    case "worship": worship(p, g, c, inst.stateT); break;
    case "speech": speech(p, g, c, inst.stateT); break;
    case "sick": sick(p, g, c, inst.stateT); break;
    case "leisure": leisure(p, g, c, inst.stateT); break;
    case "shop": shop(p, g, c, inst.stateT); break;
    default: idle(p, g, c, inst.stateT);
  }
  const out = inst.out;
  if (inst.blend < 1) {
    inst.blend = Math.min(1, inst.blend + dt / BLEND_S);
    const w = smooth(inst.blend), prev = inst.prev;
    for (let i = 0; i < POSE_SIZE; i++) out[i] = prev[i] + (p[i] - prev[i]) * w;
  } else out.set(p);
  applyPose(rig, out);
}

const _restHips = { y: 0 };
export function applyPose(rig: CharacterRig, p: Float32Array) {
  const B = rig.bones;
  for (let j = 0; j < J.COUNT; j++) B[j].rotation.set(p[j * 3], p[j * 3 + 1], p[j * 3 + 2]);
  _restHips.y = rig.dims.hipsY;
  B[J.hips].position.set(p[HIP], _restHips.y + p[HIP + 1], p[HIP + 2]);
}

/** A still, camera-friendly pose for portraits / line-ups. */
export function posePortrait(inst: AnimInstance, t = 0) {
  const c: AnimCtx = { t, moving: false, phase: 0, speed: 0, action: "idle", talking: false, speaking: false, seed: 0.3 };
  idle(inst.live, inst.rig.gait, c, 0);
  inst.live[J.head * 3 + 1] = 0; inst.live[J.neck * 3 + 1] = 0; // look straight
  inst.out.set(inst.live); inst.prev.set(inst.live); inst.blend = 1;
  applyPose(inst.rig, inst.out);
}
