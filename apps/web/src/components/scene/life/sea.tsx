/**
 * Sea life: three fishing boats that leave the docks in the early morning, fish
 * beyond the lighthouse and come back after lunch (all keyed to sim time; they
 * stay moored in a storm), the merchant ship "Cormorant" (ship_visit), wake
 * foam, fish jumping at dawn and the boat_launch boat by the studio.
 *
 * Boats are one instanced hull mesh (tinted per instance) + one instanced
 * fittings mesh, so every small boat in the harbour costs two draw calls total.
 */
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TownLayout } from "../buildings/layout";
import { WATER_Y } from "../terrain";
import { sky } from "../palette";
import { buildGeo, box, cyl, cone, sphere, vcMat, setInstance, hideInstance, dummy, lerp, lerpAngle, srand, tmpC } from "./util";
import { lifeState, hourIn } from "./state";
import { emitter, moveEmitter } from "./particles";

/* ------------------------------- shared boat state ------------------------------ */

export interface BoatPos { x: number; z: number; yaw: number; speed: number; atSea: boolean }
/** read by the gulls: where the working boats are right now */
export const boatPositions: BoatPos[] = [
  { x: 27, z: -307, yaw: Math.PI, speed: 0, atSea: false },
  { x: 17, z: -319, yaw: Math.PI, speed: 0, atSea: false },
  { x: 27, z: -327, yaw: Math.PI, speed: 0, atSea: false },
];
export const shipState = { x: -200, z: -520, yaw: 0, present: false, moored: false, speed: 0 };

/* ----------------------------------- geometry ---------------------------------- */

/** small fishing boat, forward = +z. Hull is separate so it can be tinted per instance. */
function fishingHull() {
  return buildGeo([
    { geo: box(2.4, 1.0, 5.6), color: "#ffffff", p: [0, 0, -0.4] },
    { geo: cone(1.2, 2.0, 4), color: "#ffffff", r: [Math.PI / 2, Math.PI / 4, 0], s: [1, 0.42, 1], p: [0, 0, 3.4] },
  ]);
}
function fishingFittings() {
  return buildGeo([
    { geo: box(2.5, 0.16, 5.7), color: "#f4efe4", p: [0, 0.55, -0.4] },        // gunwale
    { geo: box(2.0, 0.1, 5.2), color: "#c9a97a", p: [0, 0.5, -0.4] },          // deck
    { geo: box(1.5, 1.05, 1.5), color: "#f4efe4", p: [0, 1.05, -1.5] },        // wheelhouse
    { geo: box(1.2, 0.5, 0.06), color: "#233447", p: [0, 1.2, -0.72] },        // wheelhouse window
    { geo: box(1.7, 0.12, 1.7), color: "#3f3a37", p: [0, 1.62, -1.5] },        // roof
    { geo: cyl(0.06, 0.08, 3.4), color: "#e8e2d4", p: [0, 2.2, 0.6] },         // mast
    { geo: box(0.07, 0.07, 1.6), color: "#e8e2d4", p: [0, 3.2, 1.2], r: [0.5, 0, 0] }, // derrick
    { geo: box(0.55, 0.5, 0.55), color: "#a8763e", p: [-0.55, 0.8, 1.3] },     // crate
    { geo: box(0.5, 0.45, 0.5), color: "#8b5a3c", p: [0.5, 0.75, 1.9] },
    { geo: sphere(0.22), color: "#f29a2e", p: [1.3, 0.5, -0.5] },              // fender buoys
    { geo: sphere(0.22), color: "#f29a2e", p: [-1.3, 0.5, 0.8] },
  ]);
}

function cormorantGeo() {
  const hull = "#2b3340", red = "#a8352d", white = "#e8e2d4", dark = "#2e2e33";
  return buildGeo([
    { geo: box(6, 2.4, 24), color: hull, p: [0, 0.4, 0] },
    { geo: cone(3, 6, 4), color: hull, r: [Math.PI / 2, Math.PI / 4, 0], s: [1, 0.4, 1], p: [0, 0.4, 15] },
    { geo: box(6.1, 0.35, 24.1), color: red, p: [0, -0.55, 0] },                // waterline stripe
    { geo: cone(3.05, 6.05, 4), color: red, r: [Math.PI / 2, Math.PI / 4, 0], s: [1, 0.06, 1], p: [0, -0.55, 15] },
    { geo: box(5.6, 0.2, 23.6), color: "#b89a6a", p: [0, 1.7, 0] },              // deck
    { geo: box(6.1, 0.5, 24), color: white, p: [0, 1.45, 0] },                   // bulwark band
    { geo: box(4.2, 2.4, 8), color: white, p: [0, 2.9, -4] },                    // superstructure
    { geo: box(3.2, 1.7, 3.4), color: white, p: [0, 4.9, -2.6] },                // wheelhouse
    { geo: box(2.8, 0.7, 0.08), color: "#233447", p: [0, 5.1, -0.85] },          // bridge windows
    { geo: box(3.4, 0.15, 3.6), color: dark, p: [0, 5.8, -2.6] },
    { geo: cyl(0.75, 0.85, 3.2, 8), color: dark, p: [0, 5.6, -6.5] },            // funnel
    { geo: cyl(0.8, 0.8, 0.7, 8), color: red, p: [0, 6.0, -6.5] },
    { geo: cyl(0.1, 0.14, 11, 6), color: "#d8cfbb", p: [0, 7, 6] },             // fore mast
    { geo: box(0.1, 0.1, 5), color: "#d8cfbb", p: [0, 10.5, 6], r: [0, Math.PI / 2, 0] },
    { geo: cyl(0.1, 0.14, 9.5, 6), color: "#d8cfbb", p: [0, 6.2, -9] },         // main mast
    { geo: box(0.1, 0.1, 4), color: "#d8cfbb", p: [0, 9.2, -9], r: [0, Math.PI / 2, 0] },
    { geo: box(2.4, 0.5, 3.2), color: "#8b5a3c", p: [0, 2.05, 6] },              // fore hatch
    { geo: box(2.2, 0.5, 2.6), color: "#8b5a3c", p: [0, 2.05, -10] },
    { geo: box(1.1, 0.9, 1.1), color: "#a8763e", p: [-1.8, 2.25, 9] },           // deck cargo
    { geo: box(0.9, 0.8, 0.9), color: "#c9c3b5", p: [1.9, 2.2, 3] },
    { geo: box(0.7, 0.7, 0.7), color: "#a8763e", p: [1.6, 2.15, -12] },
    { geo: box(3.4, 0.9, 1.4), color: "#f7f4ec", p: [0, 2.3, -14], r: [0, 0, 0] }, // lifeboat
    { geo: cyl(0.25, 0.25, 0.9, 6), color: dark, p: [-2.4, 2.4, 11.5] },         // bollards
    { geo: cyl(0.25, 0.25, 0.9, 6), color: dark, p: [2.4, 2.4, 11.5] },
  ]);
}

function rowboatGeo() {
  return buildGeo([
    { geo: box(1.5, 0.6, 3.6), color: "#f7f4ec", p: [0, 0, -0.2] },
    { geo: cone(0.75, 1.2, 4), color: "#f7f4ec", r: [Math.PI / 2, Math.PI / 4, 0], s: [1, 0.45, 1], p: [0, 0, 2.2] },
    { geo: box(1.55, 0.14, 3.6), color: "#c8323c", p: [0, 0.12, -0.2] },
    { geo: box(1.3, 0.08, 0.3), color: "#8b5a3c", p: [0, 0.2, 0.4] },
    { geo: box(1.3, 0.08, 0.3), color: "#8b5a3c", p: [0, 0.2, -1.2] },
    { geo: box(0.06, 0.06, 2.2), color: "#a08a6a", p: [0.85, 0.32, 0.2], r: [0, 0.35, 0] },
  ]);
}

function fishGeo() {
  return buildGeo([
    { geo: sphere(0.22), color: "#8fb7c9", s: [0.6, 0.8, 1.6] },
    { geo: cone(0.18, 0.35, 3), color: "#6f96a8", r: [-Math.PI / 2, 0, 0], p: [0, 0, -0.45] },
  ]);
}

/* --------------------------------- wake foam ---------------------------------- */

const FOAM_MAX = 96;
interface Foam { x: number; z: number; age: number; life: number; size: number; alive: boolean }
const foam: Foam[] = Array.from({ length: FOAM_MAX }, () => ({ x: 0, z: 0, age: 0, life: 1, size: 1, alive: false }));
let foamHead = 0;
/** drop a foam patch on the water (used for wakes, fish splashes, the shore) */
export function spawnFoam(x: number, z: number, size = 1, life = 3) {
  const f = foam[foamHead]; foamHead = (foamHead + 1) % FOAM_MAX;
  f.x = x; f.z = z; f.age = 0; f.life = life; f.size = size; f.alive = true;
}

function Foam() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => { const g = new THREE.CircleGeometry(0.5, 7); g.rotateX(-Math.PI / 2); return g; }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }), []);
  useEffect(() => { const m = ref.current; if (m) { for (let i = 0; i < FOAM_MAX; i++) { hideInstance(m, i); m.setColorAt(i, tmpC.set(0, 0, 0)); } m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }, []);
  useFrame((_, dt) => {
    const m = ref.current; if (!m) return;
    for (let i = 0; i < FOAM_MAX; i++) {
      const f = foam[i];
      if (!f.alive) continue;
      f.age += dt;
      if (f.age >= f.life) { f.alive = false; hideInstance(m, i); m.setColorAt(i, tmpC.set(0, 0, 0)); continue; }
      const k = f.age / f.life;
      const s = f.size * (0.6 + k * 1.6);
      setInstance(m, i, f.x, WATER_Y + 0.22 + Math.sin(lifeState.t * 1.2 + f.x * 0.12) * 0.05, f.z, 0, s);
      const a = (1 - k) * (1 - k) * (0.9 - sky.night * 0.6);
      m.setColorAt(i, tmpC.set(a, a, a));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, FOAM_MAX]} frustumCulled={false} renderOrder={3} />;
}

/* -------------------------------- fishing boats -------------------------------- */

interface Boat extends BoatSpec {
  mx: number; mz: number; myaw: number;          // mooring (taken from the layout's pier slots)
  out: [number, number][];                        // waypoints mooring → fishing ground
  x: number; z: number; yaw: number; speed: number;
  foamT: number;
}
/** Pier head, in world xz. The docks location sits at (20,−275) yawed π/2, so the pier deck
 *  runs along z = −277 from x = +12 (quay) out to x = −34 (pier end). See buildings/kinds/harbour.ts. */
const PIER_END: [number, number] = [-34, -277];
/** first waypoint clear of the pier head, then out past the point */
const SEA_GATE: [number, number] = [-46, -284];
const OPEN_SEA: [number, number] = [-62, -318];
/** fallback moorings alongside the pier, used only when the layout gives us no mooredBoats */
const FALLBACK_MOORINGS: Array<[number, number, number]> = [[-10, -270.2, 1.82], [-18, -283.6, 1.27], [-24, -269.5, 1.72]];

interface BoatSpec { depart: number; ret: number; ground: [number, number]; hull: string; phase: number }
const BOAT_SPECS: BoatSpec[] = [
  { depart: 5.0, ret: 13.2, ground: [-92, -352], hull: "#2b5f9e", phase: 0 },
  { depart: 5.7, ret: 14.0, ground: [-124, -324], hull: "#4d7a4a", phase: 2 },
  { depart: 6.4, ret: 14.7, ground: [-76, -392], hull: "#e9cf7a", phase: 4 },
];

const TRANSIT_H = 1.1; // sim hours each way

function pathPoint(pts: [number, number][], t: number, out: THREE.Vector2) {
  // piecewise-linear by arc length
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  let d = t * total;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (d <= l || i === pts.length - 2) { const k = Math.min(1, d / l); out.set(lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)); return; }
    d -= l;
  }
}
const _p = new THREE.Vector2();

/** where boat b should ideally be at sim hour h */
function idealPos(b: Boat, h: number, out: THREE.Vector2): "moored" | "out" | "fishing" | "back" {
  if (lifeState.storm) { out.set(b.mx, b.mz); return "moored"; }
  if (h < b.depart || h >= b.ret + TRANSIT_H) { out.set(b.mx, b.mz); return "moored"; }
  if (h < b.depart + TRANSIT_H) { pathPoint(b.out, (h - b.depart) / TRANSIT_H, out); return "out"; }
  if (h < b.ret) {
    const a = lifeState.t * 0.05 + b.phase;
    out.set(b.ground[0] + Math.cos(a) * 6, b.ground[1] + Math.sin(a * 0.7) * 5);
    return "fishing";
  }
  pathPoint(b.out, 1 - (h - b.ret) / TRANSIT_H, out); return "back";
}

function FishingBoats({ L }: { L: TownLayout }) {
  const hullRef = useRef<THREE.InstancedMesh>(null);
  const fitRef = useRef<THREE.InstancedMesh>(null);
  const hullGeo = useMemo(fishingHull, []);
  const fitGeo = useMemo(fishingFittings, []);
  const slots = useMemo(() => {
    const given = (L as unknown as { mooredBoats?: Array<{ x: number; z: number; ry?: number; yaw?: number }> }).mooredBoats ?? [];
    return given.map((m) => [m.x, m.z, m.yaw ?? m.ry ?? 0] as [number, number, number]);
  }, [L]);
  /** the three working boats take the first three pier slots; the rest stay moored as scenery */
  const BOATS = useMemo<Boat[]>(() => BOAT_SPECS.map((spec, i) => {
    const [mx, mz, myaw] = slots[i] ?? FALLBACK_MOORINGS[i];
    return { ...spec, mx, mz, myaw, out: [[mx, mz], PIER_END, SEA_GATE, OPEN_SEA, spec.ground], x: mx, z: mz, yaw: myaw, speed: 0, foamT: 0 };
  }), [slots]);
  const moored = useMemo(() => {
    // MooredBoat from the buildings agent: { x, y, z, ry, kind: trawler | skiff | sloop } — y is ignored (boats float at WATER_Y)
    const given = ((L as unknown as { mooredBoats?: Array<{ x: number; z: number; yaw?: number; ry?: number; color?: string; hull?: string; kind?: string }> }).mooredBoats ?? []).slice(BOAT_SPECS.length);
    const KIND_COLOR: Record<string, string> = { trawler: "#b3412f", skiff: "#f4efe4", sloop: "#2b5f9e" };
    return given.map((m, i) => ({ x: m.x, z: m.z, yaw: m.yaw ?? m.ry ?? 0, color: m.color ?? m.hull ?? KIND_COLOR[m.kind ?? ""] ?? ["#b3412f", "#2b5f9e", "#e9cf7a", "#4d7a4a"][i % 4], scale: m.kind === "skiff" ? 0.6 : m.kind === "sloop" ? 0.85 : 1, phase: i * 1.7 }));
  }, [L]);
  const count = BOATS.length + moored.length;
  useEffect(() => {
    const hm = hullRef.current; if (!hm) return;
    BOATS.forEach((b, i) => hm.setColorAt(i, tmpC.set(b.hull)));
    moored.forEach((m, i) => hm.setColorAt(BOATS.length + i, tmpC.set(m.color)));
    if (hm.instanceColor) hm.instanceColor.needsUpdate = true;
  }, [moored, BOATS]);

  useFrame((_, dt) => {
    const hm = hullRef.current, fm = fitRef.current; if (!hm || !fm) return;
    const h = lifeState.hour, t = lifeState.t;
    const rock = lifeState.storm ? 2.2 : 1;
    for (let i = 0; i < BOATS.length; i++) {
      const b = BOATS[i];
      const phase = idealPos(b, h, _p);
      // chase the ideal position: never teleport, cap the speed
      const dx = _p.x - b.x, dz = _p.y - b.z, dist = Math.hypot(dx, dz);
      const maxV = 7;
      let mv = Math.min(dist, maxV * dt);
      if (dist > 0.02) { b.x += (dx / dist) * mv; b.z += (dz / dist) * mv; } else mv = 0;
      const v = dt > 0 ? mv / dt : 0;
      b.speed = lerp(b.speed, v, Math.min(1, dt * 3));
      const targetYaw = phase === "moored" && dist < 0.5 ? b.myaw : dist > 0.3 ? Math.atan2(dx, dz) : b.yaw;
      b.yaw = lerpAngle(b.yaw, targetYaw, Math.min(1, dt * (phase === "moored" ? 0.6 : 1.4)));
      const bob = Math.sin(t * 1.1 + b.phase) * 0.09 * rock, pitch = Math.sin(t * 0.9 + b.phase) * 0.03 * rock + (b.speed > 0.5 ? -0.03 : 0), roll = Math.sin(t * 0.75 + b.phase * 1.3) * 0.04 * rock;
      dummy.position.set(b.x, WATER_Y + 0.5 + bob, b.z); dummy.rotation.set(pitch, b.yaw, roll); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      hm.setMatrixAt(i, dummy.matrix); fm.setMatrixAt(i, dummy.matrix);
      const bp = boatPositions[i];
      bp.x = b.x; bp.z = b.z; bp.yaw = b.yaw; bp.speed = b.speed; bp.atSea = phase !== "moored";
      // wake: foam patches dropped astern while under way
      if (b.speed > 0.25) {
        b.foamT += dt * (0.8 + b.speed * 0.5);
        if (b.foamT > 1) { b.foamT = 0; spawnFoam(b.x - Math.sin(b.yaw) * 3.2, b.z - Math.cos(b.yaw) * 3.2, 1.3, 2.6); }
      }
    }
    moored.forEach((m, k) => {
      const i = BOATS.length + k;
      const bob = Math.sin(t * 1.2 + m.phase) * 0.1 * rock, pitch = Math.sin(t * 0.8 + m.phase) * 0.03 * rock, roll = Math.sin(t * 0.7 + m.phase) * 0.045 * rock;
      dummy.position.set(m.x, WATER_Y + 0.5 * m.scale + bob, m.z); dummy.rotation.set(pitch, m.yaw, roll); dummy.scale.setScalar(m.scale); dummy.updateMatrix();
      hm.setMatrixAt(i, dummy.matrix); fm.setMatrixAt(i, dummy.matrix);
    });
    hm.instanceMatrix.needsUpdate = true; fm.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={hullRef} args={[hullGeo, vcMat(), count]} castShadow frustumCulled={false} />
      <instancedMesh ref={fitRef} args={[fitGeo, vcMat(), count]} castShadow frustumCulled={false} />
    </>
  );
}

/* --------------------------------- the Cormorant -------------------------------- */

/** berth: lying across the head of the pier (which ends at x = −34, z = −277), bow to +z */
const SHIP_MOOR = { x: -46, z: -277, yaw: 0 };
const SHIP_IN: [number, number][] = [[-230, -470], [-150, -400], [-92, -322], [SHIP_MOOR.x, SHIP_MOOR.z]];
const SHIP_OUT: [number, number][] = [[SHIP_MOOR.x, SHIP_MOOR.z], [-80, -310], [-150, -390], [-240, -480]];

function Cormorant() {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(cormorantGeo, []);
  const funnel = useMemo(() => emitter("smoke:cormorant", 0, -50, 0, 0, 16, { size: 1.6, life: 8, rise: 1.4 }), []);
  const horn = useMemo(() => emitter("steam:horn", 0, -50, 0, 1, 8, { size: 1.3, life: 2.2, rise: 2.2, spread: 0.3 }), []);
  const s = useRef({ mode: "away" as "away" | "in" | "moored" | "out", prog: 0, x: -200, z: -520, yaw: 0, foamT: 0, hornT: 0 });
  useFrame((_, dt) => {
    const g = ref.current; if (!g) return;
    const S = s.current, t = lifeState.t;
    const want = lifeState.shipVisit;
    if (S.mode === "away" && want) { S.mode = "in"; S.prog = 0; }
    if (S.mode === "moored" && !want) { S.mode = "out"; S.prog = 0; S.hornT = 3; }
    let moving = false;
    if (S.mode === "in" || S.mode === "out") {
      const path = S.mode === "in" ? SHIP_IN : SHIP_OUT;
      // ease so it slows into the berth / pulls away gently
      S.prog = Math.min(1, S.prog + dt / 75);
      const e = S.mode === "in" ? 1 - (1 - S.prog) * (1 - S.prog) : S.prog * S.prog;
      pathPoint(path, e, _p);
      const dx = _p.x - S.x, dz = _p.y - S.z;
      if (dx * dx + dz * dz > 0.0004) S.yaw = lerpAngle(S.yaw, Math.atan2(dx, dz), Math.min(1, dt * 0.8));
      S.x = _p.x; S.z = _p.y;
      moving = true;
      if (S.prog >= 1) { if (S.mode === "in") { S.mode = "moored"; S.yaw = SHIP_MOOR.yaw; S.hornT = 3; } else S.mode = "away"; }
      // one long blast on the horn as she enters the harbour
      if (S.mode === "in" && S.prog > 0.72 && S.prog - dt / 75 <= 0.72) S.hornT = 3;
    }
    if (S.mode === "moored") { S.yaw = lerpAngle(S.yaw, SHIP_MOOR.yaw, Math.min(1, dt * 0.5)); S.x = SHIP_MOOR.x; S.z = SHIP_MOOR.z; }
    const present = S.mode !== "away";
    g.visible = present;
    shipState.present = present; shipState.moored = S.mode === "moored"; shipState.x = S.x; shipState.z = S.z; shipState.yaw = S.yaw; shipState.speed = moving ? 1 : 0;
    if (!present) { funnel.target = 0; horn.target = 0; return; }
    const rock = lifeState.storm ? 1.8 : 1;
    g.position.set(S.x, WATER_Y + 1.35 + Math.sin(t * 0.6) * 0.06 * rock, S.z);
    g.rotation.set(Math.sin(t * 0.5) * 0.012 * rock, S.yaw, Math.sin(t * 0.4) * 0.02 * rock);
    // funnel smoke follows the ship; heavy when under way, a lazy wisp when berthed
    funnel.target = moving ? 1 : 0.35;
    const fx = S.x + Math.sin(S.yaw) * -6.5, fz = S.z + Math.cos(S.yaw) * -6.5;
    moveEmitter(funnel, fx, WATER_Y + 1.35 + 7.4, fz);
    // horn: a white steam puff beside the funnel for a few seconds
    S.hornT = Math.max(0, S.hornT - dt);
    horn.target = S.hornT > 0 ? 1 : 0;
    moveEmitter(horn, fx + Math.cos(S.yaw) * 0.9, WATER_Y + 1.35 + 7.0, fz - Math.sin(S.yaw) * 0.9);
    if (moving) {
      S.foamT += dt * 1.6;
      if (S.foamT > 1) { S.foamT = 0; spawnFoam(S.x - Math.sin(S.yaw) * 13, S.z - Math.cos(S.yaw) * 13, 3.2, 4); }
    }
  });
  const gangwayGeo = useMemo(() => buildGeo([
    { geo: box(9.4, 0.14, 1.4), color: "#8b5a3c" },
    { geo: box(9.4, 0.5, 0.08), color: "#c9c3b5", p: [0, 0.3, 0.66] },
    { geo: box(9.4, 0.5, 0.08), color: "#c9c3b5", p: [0, 0.3, -0.66] },
  ]), []);
  const gangway = useRef<THREE.Group>(null);
  useFrame(() => { if (gangway.current) gangway.current.visible = shipState.moored; });
  return (
    <>
      <group ref={ref} visible={false}>
        <mesh geometry={geo} material={vcMat()} castShadow receiveShadow />
      </group>
      {/* gangway: pier head (deck y ≈ 0.71) up to the ship's deck (y ≈ 2.7) */}
      <group ref={gangway} visible={false} position={[-38.6, 1.72, -277]} rotation={[0, 0, -0.21]}>
        <mesh geometry={gangwayGeo} material={vcMat()} castShadow />
      </group>
    </>
  );
}

/* --------------------------------- fish at dawn --------------------------------- */

const FISH_N = 6;
function Fish() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(fishGeo, []);
  const st = useMemo(() => {
    const r = srand(77);
    return Array.from({ length: FISH_N }, () => ({ x: 8 + r() * 30, z: -318 - r() * 22, wait: r() * 5, t: -1, dir: r() * 6.28 }));
  }, []);
  useFrame((_, dt) => {
    const m = ref.current; if (!m) return;
    const active = hourIn(lifeState.hour, 5.2, 7.6) && !lifeState.storm;
    m.visible = active;
    if (!active) return;
    for (let i = 0; i < FISH_N; i++) {
      const f = st[i];
      if (f.t < 0) {
        f.wait -= dt;
        hideInstance(m, i);
        if (f.wait <= 0) { f.t = 0; f.x = 8 + Math.random() * 30; f.z = -316 - Math.random() * 24; f.dir = Math.random() * 6.28; spawnFoam(f.x, f.z, 0.6, 1.2); }
        continue;
      }
      f.t += dt;
      const T = 0.9, k = f.t / T;
      if (k >= 1) { f.t = -1; f.wait = 2 + Math.random() * 6; spawnFoam(f.x + Math.sin(f.dir) * 1.6, f.z + Math.cos(f.dir) * 1.6, 0.8, 1.4); hideInstance(m, i); continue; }
      const y = WATER_Y + Math.sin(k * Math.PI) * 1.4;
      const pitch = (0.5 - k) * 1.6;
      setInstance(m, i, f.x + Math.sin(f.dir) * k * 1.6, y, f.z + Math.cos(f.dir) * k * 1.6, f.dir, 0.8, pitch);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, vcMat(), FISH_N]} frustumCulled={false} />;
}

/* ------------------------------ the launched boat ------------------------------ */

function LaunchedBoat() {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(rowboatGeo, []);
  useFrame(() => {
    const g = ref.current; if (!g) return;
    // the card is `once` with no duration, so it may never show as active: from day 12 the boat is simply there
    g.visible = lifeState.boatLaunch || lifeState.day >= 12;
    const t = lifeState.t;
    g.position.set(74, WATER_Y + 0.3 + Math.sin(t * 1.3) * 0.08, -305);
    g.rotation.set(Math.sin(t * 0.9) * 0.04, 0.9, Math.sin(t * 0.7) * 0.05);
  });
  return <group ref={ref} visible={false}><mesh geometry={geo} material={vcMat()} castShadow /></group>;
}

export default function Sea({ L }: { L: TownLayout }) {
  return (
    <group>
      <Foam />
      <FishingBoats L={L} />
      <Cormorant />
      <Fish />
      <LaunchedBoat />
    </group>
  );
}
