/**
 * Ref-driven NPC runtime: the store is the source of truth, but positions are
 * tweened here (outside React) so 50 NPCs never re-render the tree per tick.
 *
 * MOTION MODEL — an interpolation buffer, the same trick multiplayer games use.
 *
 * The old code chased the newest sample: every arriving frame became a new tween
 * target starting from wherever the NPC had got to. That is only smooth if frames
 * arrive perfectly evenly, and they never do — a late frame left an NPC parked at
 * the end of its tween, an early one yanked it mid-stride.
 *
 * Instead we keep the last few position samples with their local arrival times and
 * render the world as it was RENDER_DELAY_MS ago, interpolating between the two
 * samples that bracket that moment. Playing slightly in the past means there is
 * almost always a sample on both sides, so network jitter, a slow frame or a
 * garbage-collection pause change *when* a sample arrives without changing what is
 * drawn. The delay is small enough (under a quarter second) to be imperceptible.
 */
import type { NpcState, ActionKind, Mood } from "@npcworld/schema";
import { terrainHeight } from "./terrain";
import { outsideWalls } from "./buildings/layout";
import { hash01, NPC_SCALE } from "./palette";

export interface NpcRender {
  id: string;
  /** current rendered world position */
  x: number; y: number; z: number;
  /** tween endpoints (world x/z) */
  fx: number; fz: number; tx: number; tz: number;
  t0: number; dur: number;
  heading: number;         // radians, rotation.y
  targetHeading: number;
  action: ActionKind;
  mood: Mood;
  locationId: string;
  home: string;
  conversationId: string | null;
  /** id of the NPC they are talking to (if known) */
  partnerId: string | null;
  visible: boolean;
  moving: boolean;
  /** walk-cycle phase, advanced only while moving so feet don't slide when idle */
  phase: number;
  lastPosChangeMs: number;
  /** current ground speed in world m/s (0 when standing) */
  speed: number;
  /** world-space height of the top of the head/hat above `y` (filled by the character layer once the rig exists) */
  headTop: number;
  /** distance-based size boost the character layer applies on top of NPC_SCALE (1 up close, up to ~1.6 from the overview) */
  boost: number;
}

export const npcRender = new Map<string, NpcRender>();

/**
 * How far behind live we draw. Must exceed the expected gap between position
 * frames (the engine sends 4/s = 250 ms) or the buffer runs dry and we have to
 * extrapolate; much larger and the world feels laggy to click on.
 */
const RENDER_DELAY_MS = 180;
const MAX_SAMPLES = 12;

interface Sample { at: number; xz: Map<string, [number, number]> }
const buffer: Sample[] = [];
/** last known raw engine position per id, so the door-offset can be recomputed when `action` changes */
const rawPos = new Map<string, [number, number]>();
const walking = new Set<string>();

/** Feed a high-rate `pos` frame into the buffer. `ids`/`p` are parallel arrays. */
export function pushPositions(ids: string[], p: number[]): void {
  const at = performance.now();
  const xz = new Map<string, [number, number]>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const mx = p[i * 2], my = p[i * 2 + 1];
    rawPos.set(id, [mx, my]);
    xz.set(id, toDisplay(id, mx, my));
  }
  // out-of-order or duplicate frame: ignore rather than corrupt the timeline
  if (buffer.length && at <= buffer[buffer.length - 1].at) return;
  buffer.push({ at, xz });
  while (buffer.length > MAX_SAMPLES) buffer.shift();
}

/** engine metres → display world position, applying the stand-outside-the-door offset */
function toDisplay(id: string, mx: number, my: number): [number, number] {
  if (walking.has(id)) return [mx, -my];
  const [ox, oy] = outsideWalls(mx, my, hash01(id, 21));
  return [ox, -oy];
}

/** engine position → display position: anyone *staying* at a place stands outside its walls (walkers pass through — no navmesh yet) */
function display(n: NpcState): [number, number] {
  if (n.action === "walk") return [n.pos[0], -n.pos[1]];
  const [mx, my] = outsideWalls(n.pos[0], n.pos[1], hash01(n.id, 21));
  return [mx, -my];
}

function makeRender(n: NpcState, now: number): NpcRender {
  const [x, z] = display(n);
  return {
    id: n.id, x, y: terrainHeight(x, -z), z, fx: x, fz: z, tx: x, tz: z, t0: now, dur: 1000,
    heading: Math.random() * Math.PI * 2, targetHeading: 0, action: n.action, mood: n.mood, locationId: n.locationId,
    home: n.home, conversationId: n.conversationId, partnerId: null, visible: true, moving: false, phase: Math.random() * 10, lastPosChangeMs: now,
    speed: 0, headTop: 2.1 * NPC_SCALE, boost: 1,
  };
}

/**
 * Called whenever `store.npcs` changes (the ~1 Hz `tick` frame). Carries the slow
 * state — action, mood, where they are, who they are talking to. Positions come
 * from the high-rate `pos` frames via pushPositions(); this only seeds a position
 * for an NPC we have never seen, and keeps the walking set up to date so the
 * stand-outside-the-door offset is applied to the right people.
 */
export function syncRuntime(npcs: Record<string, NpcState>, conversations: Record<string, { participants: string[] }>) {
  const now = performance.now();
  for (const id in npcs) {
    const n = npcs[id];
    if (n.action === "walk") walking.add(id); else walking.delete(id);
    rawPos.set(id, [n.pos[0], n.pos[1]]);
    let r = npcRender.get(id);
    if (!r) { r = makeRender(n, now); npcRender.set(id, r); }
    r.action = n.action; r.mood = n.mood; r.locationId = n.locationId; r.home = n.home; r.conversationId = n.conversationId;
    r.partnerId = null;
    if (n.conversationId) {
      const c = conversations[n.conversationId];
      if (c) r.partnerId = c.participants.find((p) => p !== id) ?? null;
    }
  }
  for (const id of npcRender.keys()) if (!npcs[id]) { npcRender.delete(id); rawPos.delete(id); walking.delete(id); }
}

/**
 * Fallback for engines that only send the 1 Hz `tick` frame (older builds, or a
 * replay): synthesise a position sample from the tick so motion still works,
 * just with fewer samples to interpolate between.
 */
export function pushPositionsFromStates(npcs: Record<string, NpcState>): void {
  const ids: string[] = [];
  const p: number[] = [];
  for (const id in npcs) { ids.push(id); p.push(npcs[id].pos[0], npcs[id].pos[1]); }
  pushPositions(ids, p);
}

const TWO_PI = Math.PI * 2;
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI;
  return a + d * t;
}

/** Advance all rendered positions. Call once per frame. */
export function stepRuntime(dt: number) {
  const now = performance.now();
  const turn = 1 - Math.exp(-dt * 8);
  const renderAt = now - RENDER_DELAY_MS;

  // find the pair of samples bracketing `renderAt`
  let a: Sample | null = null, b: Sample | null = null;
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i].at <= renderAt) { a = buffer[i]; b = buffer[i + 1] ?? null; break; }
  }
  if (!a && buffer.length) { a = buffer[0]; b = buffer[1] ?? null; }
  const span = a && b ? b.at - a.at : 0;
  const f = span > 0 ? Math.min(1, Math.max(0, (renderAt - a!.at) / span)) : 1;

  for (const r of npcRender.values()) {
    const pa = a?.xz.get(r.id);
    const pb = b?.xz.get(r.id);
    let nx = r.x, nz = r.z;
    if (pa && pb) { nx = pa[0] + (pb[0] - pa[0]) * f; nz = pa[1] + (pb[1] - pa[1]) * f; }
    else if (pa) { nx = pa[0]; nz = pa[1]; }

    const dx = nx - r.x, dz = nz - r.z;
    const moved2 = dx * dx + dz * dz;
    // instantaneous speed from the interpolated motion, smoothed so the walk cycle
    // doesn't flicker between frames
    const v = dt > 0 ? Math.sqrt(moved2) / dt : 0;
    r.speed += (Math.min(v, 6) - r.speed) * Math.min(1, dt * 6);
    r.x = nx; r.z = nz;
    r.y = terrainHeight(r.x, -r.z);
    r.moving = r.speed > 0.12;
    if (r.moving) {
      r.lastPosChangeMs = now;
      if (moved2 > 1e-6) r.targetHeading = Math.atan2(dx, dz);
      r.phase += dt * Math.min(12, 3 + r.speed * 3.2);
    }
    // face the partner when talking or standing still
    if (r.partnerId && (r.action === "talk" || !r.moving)) {
      const p = npcRender.get(r.partnerId);
      if (p) { const px = p.x - r.x, pz = p.z - r.z; if (px * px + pz * pz > 0.01) r.targetHeading = Math.atan2(px, pz); }
    }
    r.heading = lerpAngle(r.heading, r.targetHeading, turn);
    // sleeping at home → hidden (they're indoors)
    r.visible = !(r.action === "sleep" && r.locationId === r.home);
  }
}

/**
 * Focus point for a group: centroid of the *visible* members — unless they have
 * drifted apart (> maxSpread m from the centroid), in which case the first
 * visible member (the director's primary) is used so the camera never frames an
 * empty patch of grass between two people who walked off. Returns false if none
 * of them are known/visible.
 */
export function centroid(ids: string[], out: { x: number; y: number; z: number }, maxSpread = 18): boolean {
  let n = 0; out.x = out.y = out.z = 0;
  let first: NpcRender | null = null;
  for (const id of ids) {
    const r = npcRender.get(id);
    if (!r || !r.visible) continue;
    if (!first) first = r;
    out.x += r.x; out.y += r.y; out.z += r.z; n++;
  }
  if (!n || !first) return false;
  out.x /= n; out.y /= n; out.z /= n;
  for (const id of ids) {
    const r = npcRender.get(id);
    if (!r || !r.visible) continue;
    if (Math.hypot(r.x - out.x, r.z - out.z) > maxSpread) { out.x = first.x; out.y = first.y; out.z = first.z; break; }
  }
  return true;
}
