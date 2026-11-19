/**
 * DOM overlay for labels and speech bubbles.
 *
 * Instead of one drei <Html> per label (each of which projects + writes the DOM
 * on its own), every label registers a DOM element here and a single
 * <OverlayProjector/> inside the Canvas projects them all in one useFrame pass.
 * Labels are pointer-events:none so the canvas keeps receiving clicks.
 */
"use client";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useWorld } from "@/lib/store";
import { npcRender } from "./npcRuntime";
import { clamp, NPC_SCALE } from "./palette";

export type OverlayKind = "district" | "location" | "npc" | "bubble" | "thought";
export interface OverlayItem {
  el: HTMLElement;
  kind: OverlayKind;
  id: string;
  pos?: [number, number, number];
  npcId?: string;
  yOff: number;
  /** last written style values — the projector skips DOM writes that change nothing */
  _o?: string;
  _z?: string;
  /** eased opacity, cached size (px) and the text length it was measured at */
  _a?: number;
  _w?: number;
  _h?: number;
  _len?: number;
}

const items = new Map<string, OverlayItem>();
export function registerOverlay(key: string, item: OverlayItem) { items.set(key, item); }
export function unregisterOverlay(key: string) { items.delete(key); }

/** hovered location id (set by Town's pointer handlers, read by the projector) */
export const hoverState = { locationId: null as string | null, npcId: null as string | null };

/**
 * Screen fade used for director cuts. Purely time-based: every frame the
 * projector writes opacity = f(now - fadeStart), so it can never get stuck
 * opaque — a new cut just restarts the clock, and once the curve ends it's 0.
 */
let fadeEl: HTMLElement | null = null;
let fadeStart = 0;
const FADE_IN = 110, FADE_HOLD = 60, FADE_OUT = 220;
export function setFadeElement(el: HTMLElement | null) { fadeEl = el; if (el) el.style.opacity = "0"; }
export function fadeCut() { fadeStart = performance.now(); }
/** ms until the screen is fully covered after fadeCut() — the rig snaps the camera then */
export const FADE_CUT_MS = FADE_IN;
function updateFade(now: number) {
  if (!fadeEl) return;
  const t = now - fadeStart;
  let o = 0;
  if (t < FADE_IN) o = t / FADE_IN;
  else if (t < FADE_IN + FADE_HOLD) o = 1;
  else if (t < FADE_IN + FADE_HOLD + FADE_OUT) o = 1 - (t - FADE_IN - FADE_HOLD) / FADE_OUT;
  const v = o <= 0 ? "0" : o.toFixed(3);
  if (fadeEl.style.opacity !== v) fadeEl.style.opacity = v;
}

const v = new THREE.Vector3();
const camPos = new THREE.Vector3();
/** pre-made z-index strings, so the hot loop never builds one */
const Z = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const TOWN_CENTRE = new THREE.Vector3(150, 0, -150);

/** one label that wants to be on screen this frame (pooled, reused every frame) */
interface Cand { it: OverlayItem; sx: number; sy: number; scale: number; dist: number; base: number; prio: number; x0: number; y0: number; x1: number; y1: number; ok: boolean }
const pool: Cand[] = [];
const cands: Cand[] = [];
const accepted: Cand[] = [];
const talking = new Set<string>();
/** how many of the director's group get a name tag (a crowd of 15 named people is a wall of text) */
const GROUP_NAMES = 4;
const byPrio =(a: Cand, b: Cand) => b.prio - a.prio || a.dist - b.dist;

/**
 * Label rules (visual pass, Nov 2026 — the old layer showed every name within
 * ~75 m and they piled into an unreadable jumble):
 *  - names show for the selected / followed person, the hovered person, the
 *    director's current group (fading out by ~100 m), and anyone very close;
 *    someone who is speaking shows their bubble (which carries their name) instead;
 *  - every frame the candidates are placed greedily by priority (focus > bubbles >
 *    group names > places > other names) and anything that would overlap an
 *    already placed label is faded out rather than drawn on top of it;
 *  - opacity eases toward its target, so labels don't flicker as people walk past each other.
 */
export function OverlayProjector() {
  const { camera, size } = useThree();
  useFrame((_, dt) => {
    updateFade(performance.now());
    if (!items.size) return;
    camera.getWorldPosition(camPos);
    const ui = useWorld.getState().ui;
    const group = ui.directorFocus?.npcIds;
    // "zoomed out" = high above the town (was: far from the centre, which also fired at street level in the outer districts)
    const zoomedOut = camPos.y > 70 && camPos.distanceTo(TOWN_CENTRE) > 120;
    const w = size.width, h = size.height;
    const narrow = w < 768;
    const ease = 1 - Math.exp(-Math.min(dt, 0.1) * 10);

    talking.clear();
    for (const it of items.values()) if (it.kind === "bubble" && it.npcId && !it.el.classList.contains("out")) talking.add(it.npcId);

    // ---- pass 1: read only (positions, opacity targets, cached sizes)
    cands.length = 0;
    let n = 0;
    for (const it of items.values()) {
      let x: number, y: number, z: number;
      if (it.npcId) {
        const r = npcRender.get(it.npcId);
        if (!r || !r.visible) { fadeOut(it, ease); continue; }
        // sit just above each person's own head/hat (headTop already includes the distance boost)
        const lift = it.kind === "npc" ? 0.45 : 0.8;
        x = r.x; y = r.y + (r.headTop > 0 ? r.headTop + lift * r.boost : it.yOff * NPC_SCALE); z = r.z;
      } else if (it.pos) { x = it.pos[0]; y = it.pos[1] + it.yOff; z = it.pos[2]; }
      else { fadeOut(it, ease); continue; }
      v.set(x, y, z);
      const dist = v.distanceTo(camPos);
      let base = 0, prio = 0;
      const focus = it.npcId != null && (it.npcId === ui.selectedNpcId || it.npcId === ui.followNpcId);
      const hovered = it.npcId != null && it.npcId === hoverState.npcId;
      switch (it.kind) {
        case "district": base = zoomedOut ? 1 : 0; prio = 10; break;
        case "location":
          if (hoverState.locationId === it.id) { base = 1; prio = 80; }
          else if (ui.showLabels && !zoomedOut) { base = 1 - clamp((dist - 45) / 40, 0, 1); prio = 40; }
          break;
        case "npc":
          if (focus) { base = 1; prio = 90; }
          else if (hovered) { base = 1; prio = 85; }
          else if (talking.has(it.npcId!)) base = 0;
          else if (group && group.indexOf(it.npcId!) >= 0 && group.indexOf(it.npcId!) < GROUP_NAMES) { base = 1 - clamp((dist - 70) / 40, 0, 1); prio = 60; }
          else if (ui.showLabels) { base = 1 - clamp((dist - 20) / 14, 0, 1); prio = 30; }
          break;
        case "bubble":
          base = focus ? 1 : 1 - clamp((dist - 75) / 50, 0, 1);
          prio = focus ? 95 : group && group.includes(it.npcId!) ? 75 : 65;
          break;
        case "thought": base = focus ? 1 : 0; prio = 100; break;
      }
      if (base <= 0.02) { fadeOut(it, ease); continue; }
      v.project(camera);
      if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) { fadeOut(it, ease); continue; }
      const sx = ((v.x + 1) / 2) * w, sy = ((1 - v.y) / 2) * h;
      const minScale = it.kind === "bubble" || it.kind === "thought" ? (narrow ? 0.92 : 0.8) : 0.72;
      const scale = it.kind === "district" ? 1 : clamp(1.15 - dist / 260, minScale, 1);
      // size: measured once, again only when the text length changes (offsetWidth is a layout read,
      // and every read in this pass happens before any write below, so it costs at most one layout)
      const len = it.el.textContent?.length ?? 0;
      if (it._w === undefined || it._len !== len) { it._w = it.el.offsetWidth; it._h = it.el.offsetHeight; it._len = len; }
      const c = pool[n] ?? (pool[n] = { it, sx: 0, sy: 0, scale: 1, dist: 0, base: 0, prio: 0, x0: 0, y0: 0, x1: 0, y1: 0, ok: false });
      n++;
      const hw = (it._w! * scale) / 2 + 2, hh = it._h! * scale + 2;
      c.it = it; c.sx = sx; c.sy = sy; c.scale = scale; c.dist = dist; c.base = base; c.prio = prio;
      c.x0 = sx - hw; c.x1 = sx + hw; c.y0 = sy - hh; c.y1 = sy; c.ok = false;
      cands.push(c);
    }

    // ---- greedy placement: higher priority first, nearer first; overlapping losers fade out
    cands.sort(byPrio);
    accepted.length = 0;
    for (const c of cands) {
      let free = true;
      if (c.it.kind !== "district") {
        for (const a of accepted) if (c.x0 < a.x1 && c.x1 > a.x0 && c.y0 < a.y1 && c.y1 > a.y0) { free = false; break; }
      }
      c.ok = free;
      if (free) accepted.push(c);
    }

    // ---- pass 2: writes
    for (const c of cands) {
      const it = c.it, el = it.el;
      const target = c.ok ? c.base : 0;
      const a = (it._a ?? 0) + (target - (it._a ?? 0)) * ease;
      it._a = a;
      if (a <= 0.02) { hide(el); continue; }
      el.style.transform = `translate(-50%, -100%) translate(${c.sx.toFixed(1)}px, ${c.sy.toFixed(1)}px) scale(${c.scale.toFixed(3)})`;
      // opacity and z-index barely change between frames — writing them anyway
      // costs a string allocation and a style invalidation per label per frame
      const o = a.toFixed(2);
      if (o !== it._o) { it._o = o; el.style.opacity = o; }
      // the overlay lives inside the scene's own stacking context; keep values small (≤ 9) so nothing can outrank the HUD (z-10)
      const zi = c.prio >= 85 ? Z[9] : Z[8 - Math.min(7, Math.floor(c.dist / 30))];
      if (zi !== it._z) { it._z = zi; el.style.zIndex = zi; }
      if (el.dataset.v !== "1") { el.dataset.v = "1"; el.style.visibility = "visible"; }
    }
  });
  return null;
}

/** a label with nowhere to be this frame: ease its opacity down in place, then hide it */
function fadeOut(it: OverlayItem, ease: number) {
  const a = (it._a ?? 0) * (1 - ease);
  it._a = a;
  if (a <= 0.02 || it.el.dataset.v !== "1") { it._a = 0; hide(it.el); return; }
  const o = a.toFixed(2);
  if (o !== it._o) { it._o = o; it.el.style.opacity = o; }
}

function hide(el: HTMLElement) {
  if (el.dataset.v !== "0") { el.dataset.v = "0"; el.style.visibility = "hidden"; }
}

/** static CSS for overlay elements (injected once by <Scene/>) */
export const OVERLAY_CSS = `
.sc-overlay{position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.sc-lbl{position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;transform-origin:50% 100%;will-change:transform,opacity}
.sc-district{color:rgba(255,255,255,.92);font-size:15px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-shadow:0 1px 3px rgba(0,0,0,.8),0 0 12px rgba(0,0,0,.5)}
.sc-loc{color:#fff;font-size:12px;font-weight:600;padding:2px 7px;border-radius:6px;background:rgba(10,14,28,.62);backdrop-filter:blur(3px);border:1px solid rgba(255,255,255,.12)}
.sc-loc::after{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-4px;border:4px solid transparent;border-top-color:rgba(10,14,28,.62);border-bottom:0}
.sc-npc{color:#fff;font-size:11px;font-weight:600;padding:1px 6px;border-radius:5px;background:rgba(0,0,0,.45);text-shadow:0 1px 2px rgba(0,0,0,.8)}
.sc-npc.sel{background:rgba(255,196,64,.92);color:#1a1200;box-shadow:0 0 0 2px rgba(255,255,255,.35)}
.sc-bubble{max-width:240px;white-space:normal;background:#fffdf6;color:#1b1b1b;font-size:12px;line-height:1.3;padding:6px 9px 7px;border-radius:12px;border-bottom-left-radius:3px;box-shadow:0 3px 12px rgba(0,0,0,.35);animation:sc-pop .28s ease-out}
.sc-bubble.out{animation:sc-fade .3s ease-in forwards}
.sc-bubble .who{display:block;font-size:10px;font-weight:700;color:#8a5a20;letter-spacing:.04em;text-transform:uppercase;margin-bottom:2px}
.sc-bubble::after{content:"";position:absolute;left:12px;bottom:-7px;border:7px solid transparent;border-top-color:#fffdf6;border-bottom:0;border-right:0}
.sc-thought{max-width:220px;white-space:normal;background:rgba(240,244,255,.85);color:#2d3450;font-size:11px;font-style:italic;line-height:1.3;padding:5px 9px;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.25);animation:sc-pop .3s ease-out}
.sc-thought::after{content:"";position:absolute;left:14px;bottom:-9px;width:7px;height:7px;border-radius:50%;background:rgba(240,244,255,.85)}
.sc-fade{position:absolute;inset:0;z-index:9;background:#000;opacity:0;pointer-events:none}
@media (max-width:767px){
.sc-bubble{max-width:210px;font-size:13.5px;line-height:1.32;padding:7px 10px 8px}
.sc-bubble .who{font-size:10.5px}
.sc-thought{max-width:200px;font-size:12.5px}
.sc-npc{font-size:12px;padding:2px 7px}
.sc-loc{font-size:11.5px}
}
@keyframes sc-pop{from{opacity:0}to{opacity:1}}
@keyframes sc-fade{to{opacity:0}}
`;
