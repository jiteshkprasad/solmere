/**
 * Shared, allocation-free state for the ambient-life systems. Updated once per
 * frame by <LifeClock/> (mounted first in life/index.tsx) and read by every
 * other life component inside its own useFrame — never through React props.
 *
 * Other agents may read `lifeState` (e.g. `wetness` for a wet-ground sheen,
 * `lightning` for a sky flash). Nothing here is written from outside life/**.
 */
import * as THREE from "three";
import { useWorld } from "@/lib/store";
import { simHour } from "../content";
import { sky } from "../palette";
import { npcRender } from "../npcRuntime";
import { terrainHeight } from "../terrain";

export interface LifeState {
  /** fractional sim hour 0..24 and sim day */
  hour: number; day: number;
  /** 0 day … 1 night (mirrors palette.sky.night) */
  night: number;
  /** wall-clock seconds since the scene mounted */
  t: number;
  /** unit wind direction in world xz (blows FROM the sea, towards +x/+z) */
  windDir: THREE.Vector2;
  /** metres/second-ish; 0.6 calm … 2.6 storm; gusts add on top */
  wind: number;
  /** 0..1 momentary gust envelope */
  gust: number;
  /** 0..1 ground wetness — ramps in during a storm, dries out after */
  wetness: number;
  /** 0..1 lightning flash brightness (short spikes during storm) */
  lightning: number;
  /** cardIds of snapshot.activeWorldEvents */
  events: Set<string>;
  storm: boolean; festival: boolean; heatwave: boolean; illness: boolean; bigCatch: boolean;
  poorHarvest: boolean; shipVisit: boolean; openMic: boolean; boatLaunch: boolean; bumperOrchard: boolean;
  /** camera world position (copied every frame) */
  cam: THREE.Vector3;
  /** camera forward direction and the ground point it looks at (for weather particles) */
  look: THREE.Vector3; focus: THREE.Vector3;
  /** 0..1 tide height; low around 13:00, high around 01:00 */
  tide: number;
}

export const lifeState: LifeState = {
  hour: 12, day: 1, night: 0, t: 0,
  windDir: new THREE.Vector2(0.62, 0.78), wind: 0.8, gust: 0,
  wetness: 0, lightning: 0,
  events: new Set<string>(),
  storm: false, festival: false, heatwave: false, illness: false, bigCatch: false,
  poorHarvest: false, shipVisit: false, openMic: false, boatLaunch: false, bumperOrchard: false,
  cam: new THREE.Vector3(150, 120, 60),
  look: new THREE.Vector3(0, -1, 0), focus: new THREE.Vector3(150, 0, -150),
  tide: 0.5,
};

let lastEventsRef: unknown = null;
let lightningTimer = 0, nextLightning = 6;
let lightningPhase = 0;
/** dev only: hold the flash at full brightness for this many seconds so it can be screenshotted */
let lightningHold = 0;

/** Advance lifeState. Called once per frame by <LifeClock/>. */
export function stepLifeState(dt: number, camera: THREE.Camera) {
  const S = lifeState;
  S.t += dt;
  S.hour = simHour();
  S.night = sky.night;
  S.cam.copy(camera.position);
  camera.getWorldDirection(S.look);
  {
    const d = Math.max(0.12, -S.look.y);
    const k = Math.min(140, S.cam.y / d);
    S.focus.set(S.cam.x + S.look.x * k, 0, S.cam.z + S.look.z * k);
    S.focus.y = terrainHeight(S.focus.x, -S.focus.z);
  }
  const st = useWorld.getState();
  S.day = st.time?.day ?? S.day;

  // events (only rebuild the set when the array identity changes)
  const ev = st.snapshot?.activeWorldEvents;
  if (ev !== lastEventsRef) {
    lastEventsRef = ev;
    S.events.clear();
    if (ev) for (const e of ev) S.events.add(e.cardId);
    S.storm = S.events.has("storm"); S.festival = S.events.has("festival"); S.heatwave = S.events.has("heatwave");
    S.illness = S.events.has("illness"); S.bigCatch = S.events.has("big_catch"); S.poorHarvest = S.events.has("poor_harvest");
    S.shipVisit = S.events.has("ship_visit"); S.openMic = S.events.has("open_mic"); S.boatLaunch = S.events.has("boat_launch");
    S.bumperOrchard = S.events.has("bumper_orchard");
  }

  // wind: slow direction wander + gusts, much stronger in a storm
  const t = S.t;
  const a = 0.9 + Math.sin(t * 0.05) * 0.35 + Math.sin(t * 0.013 + 1) * 0.25 + (S.storm ? Math.sin(t * 0.3) * 0.3 : 0);
  S.windDir.set(Math.cos(a), Math.sin(a));
  const g = Math.max(0, Math.sin(t * 0.37) * 0.6 + Math.sin(t * 1.31 + 2) * 0.4 + Math.sin(t * 0.09) * 0.3 - 0.35);
  S.gust = Math.min(1, g * (S.storm ? 1.6 : 1));
  const base = S.storm ? 2.6 : S.heatwave ? 0.35 : 0.8;
  S.wind = base + S.gust * (S.storm ? 1.4 : 0.8);

  // wetness ramps in over ~20 s of storm and dries over ~3 min
  if (S.storm) S.wetness = Math.min(1, S.wetness + dt / 20);
  else S.wetness = Math.max(0, S.wetness - dt / 180);

  // lightning: every 10–20 s during a storm, a 2-strike flicker ~0.35 s long
  if (S.storm) {
    lightningTimer += dt;
    if (lightningTimer >= nextLightning) { lightningTimer = 0; nextLightning = 10 + Math.random() * 10; lightningPhase = 0.36; }
  }
  if (lightningHold > 0) { lightningHold -= dt; lightningPhase = 0.36; }
  if (lightningPhase > 0) {
    lightningPhase -= dt;
    const p = 0.36 - lightningPhase; // 0 → 0.36
    S.lightning = p < 0.08 ? 1 : p < 0.14 ? 0.15 : p < 0.22 ? 0.8 : Math.max(0, 1 - (p - 0.22) / 0.14) * 0.5;
  } else S.lightning = 0;

  // tide: one cycle per day, low in the early afternoon
  S.tide = 0.5 + 0.5 * Math.cos(((S.hour - 1) / 24) * Math.PI * 2);
}

/** start a lightning strike immediately (used by the dev hook to screenshot the flash) */
export function triggerLightning(holdSeconds = 0) { lightningTimer = 0; nextLightning = 10 + Math.random() * 10; lightningPhase = 0.36; lightningHold = holdSeconds; }

/** true when (x,z) is within `r` metres of the camera (horizontal) — for cheap culling every 0.5 s */
export function nearCamera(x: number, z: number, r: number): boolean {
  const dx = lifeState.cam.x - x, dz = lifeState.cam.z - z;
  return dx * dx + dz * dz < r * r;
}

/** nearest rendered NPC to (x,z) among the given ids; returns null when none are on screen */
export function nearestNpc(ids: readonly string[], x: number, z: number): { x: number; y: number; z: number; moving: boolean; heading: number } | null {
  let best: { x: number; y: number; z: number; moving: boolean; heading: number } | null = null, bd = Infinity;
  for (const id of ids) {
    const r = npcRender.get(id);
    if (!r || !r.visible) continue;
    const dx = r.x - x, dz = r.z - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

/** any visible NPC within r metres of (x,z)? Writes the closest one's position into `out`. */
export function npcWithin(x: number, z: number, r: number, out: THREE.Vector2): boolean {
  let found = false, bd = r * r;
  for (const n of npcRender.values()) {
    if (!n.visible) continue;
    const dx = n.x - x, dz = n.z - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; out.set(n.x, n.z); found = true; }
  }
  return found;
}

/** hours-in-range helper that copes with wrap-around (e.g. 22 → 2) */
export function hourIn(h: number, from: number, to: number): boolean {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

/** smooth 0..1 ramp: 0 before a, 1 after b */
export const ramp = (v: number, a: number, b: number) => { const t = (v - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };
