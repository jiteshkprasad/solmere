/**
 * Animals: a cat on Main Street (naps on the bakery step after lunch), a dog
 * that tags along with Tunde or Per, chickens by the Lindqvist coop, cows and
 * sheep grazing on the hill, a horse and cart at the orchard on glut days,
 * ducks on the park pond, crabs on the beach at low tide, butterflies by day,
 * fireflies and lamp moths by night.
 *
 * Every species is one instanced, vertex-coloured mesh; four-legged ones walk
 * with the gait vertex shader (util.windMaterial mode 3).
 */
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TownLayout } from "../buildings/layout";
import { terrainHeight, POND, POND_Y } from "../terrain";
import { buildGeo, box, cyl, cone, sphere, tetra, windMaterial, tickWind, dummy, tmpC, srand, lerp, lerpAngle, useCull, vcMat } from "./util";
import { lifeState, hourIn, nearestNpc, ramp } from "./state";
import { TAVERN_LANTERN } from "./weather";

/* --------------------------------- geometries --------------------------------- */
// all creatures: forward = +z, feet at y = 0

const catGeo = () => buildGeo([
  { geo: box(0.22, 0.2, 0.52), color: "#d9853b", p: [0, 0.3, 0] },
  { geo: box(0.2, 0.12, 0.2), color: "#f4efe4", p: [0, 0.22, 0.2] },
  { geo: sphere(0.13), color: "#d9853b", p: [0, 0.42, 0.32] },
  { geo: tetra(0.06), color: "#d9853b", p: [-0.07, 0.53, 0.3], r: [0, 0.8, 0] },
  { geo: tetra(0.06), color: "#d9853b", p: [0.07, 0.53, 0.3], r: [0, 0.8, 0] },
  { geo: box(0.05, 0.05, 0.42), color: "#c0702c", p: [0, 0.42, -0.42], r: [-0.5, 0, 0] },
  { geo: box(0.07, 0.22, 0.07), color: "#d9853b", p: [-0.08, 0.11, 0.18] },
  { geo: box(0.07, 0.22, 0.07), color: "#d9853b", p: [0.08, 0.11, 0.18] },
  { geo: box(0.07, 0.22, 0.07), color: "#d9853b", p: [-0.08, 0.11, -0.18] },
  { geo: box(0.07, 0.22, 0.07), color: "#d9853b", p: [0.08, 0.11, -0.18] },
]);
const dogGeo = () => buildGeo([
  { geo: box(0.34, 0.32, 0.8), color: "#6b4a30", p: [0, 0.5, 0] },
  { geo: box(0.28, 0.14, 0.5), color: "#e8d9b8", p: [0, 0.37, 0.05] },
  { geo: box(0.28, 0.26, 0.3), color: "#6b4a30", p: [0, 0.72, 0.5] },
  { geo: box(0.16, 0.14, 0.22), color: "#5a3a22", p: [0, 0.66, 0.72] },
  { geo: sphere(0.05), color: "#1c1c1c", p: [0, 0.68, 0.84] },
  { geo: box(0.08, 0.16, 0.05), color: "#4a2e1c", p: [-0.13, 0.86, 0.45], r: [0.3, 0, 0.3] },
  { geo: box(0.08, 0.16, 0.05), color: "#4a2e1c", p: [0.13, 0.86, 0.45], r: [0.3, 0, -0.3] },
  { geo: box(0.06, 0.06, 0.36), color: "#6b4a30", p: [0, 0.68, -0.5], r: [-0.7, 0, 0] },
  { geo: box(0.1, 0.36, 0.1), color: "#6b4a30", p: [-0.12, 0.18, 0.28] },
  { geo: box(0.1, 0.36, 0.1), color: "#6b4a30", p: [0.12, 0.18, 0.28] },
  { geo: box(0.1, 0.36, 0.1), color: "#6b4a30", p: [-0.12, 0.18, -0.28] },
  { geo: box(0.1, 0.36, 0.1), color: "#6b4a30", p: [0.12, 0.18, -0.28] },
]);
const chickenGeo = () => buildGeo([
  { geo: sphere(0.2), color: "#f4efe4", p: [0, 0.32, 0], s: [0.85, 0.8, 1.1] },
  { geo: sphere(0.1), color: "#f4efe4", p: [0, 0.56, 0.2] },
  { geo: box(0.04, 0.1, 0.12), color: "#d8262c", p: [0, 0.66, 0.18] },
  { geo: cone(0.04, 0.12, 4), color: "#f2b632", r: [Math.PI / 2, 0, 0], p: [0, 0.54, 0.34] },
  { geo: box(0.06, 0.12, 0.06), color: "#d8262c", p: [0, 0.44, 0.26] },
  { geo: cone(0.12, 0.2, 4), color: "#d8cfbb", r: [-Math.PI / 2 - 0.6, 0, 0], p: [0, 0.42, -0.24] },
  { geo: box(0.04, 0.2, 0.04), color: "#f2b632", p: [-0.06, 0.1, 0] },
  { geo: box(0.04, 0.2, 0.04), color: "#f2b632", p: [0.06, 0.1, 0] },
]);
const cowGeo = () => buildGeo([
  { geo: box(0.95, 0.9, 1.8), color: "#f4efe4", p: [0, 1.05, 0] },
  { geo: box(0.97, 0.5, 0.6), color: "#2b2b2b", p: [0, 1.2, -0.4] },
  { geo: box(0.4, 0.5, 0.97), color: "#2b2b2b", p: [-0.3, 0.9, 0.35] },
  { geo: box(0.55, 0.5, 0.65), color: "#f4efe4", p: [0, 1.2, 1.1] },
  { geo: box(0.4, 0.25, 0.3), color: "#f2c2b0", p: [0, 1.02, 1.42] },
  { geo: box(0.7, 0.08, 0.08), color: "#e0d0b0", p: [0, 1.5, 1.05] },
  { geo: box(0.3, 0.06, 0.06), color: "#2b2b2b", p: [-0.4, 1.35, 0.9], r: [0, 0, 0.4] },
  { geo: box(0.3, 0.06, 0.06), color: "#2b2b2b", p: [0.4, 1.35, 0.9], r: [0, 0, -0.4] },
  { geo: box(0.35, 0.22, 0.4), color: "#f2c2b0", p: [0, 0.55, -0.35] },
  { geo: box(0.06, 0.06, 0.6), color: "#e8e0d0", p: [0, 1.3, -1.1], r: [-1.2, 0, 0] },
  { geo: box(0.22, 0.6, 0.22), color: "#f4efe4", p: [-0.32, 0.3, 0.6] },
  { geo: box(0.22, 0.6, 0.22), color: "#2b2b2b", p: [0.32, 0.3, 0.6] },
  { geo: box(0.22, 0.6, 0.22), color: "#f4efe4", p: [-0.32, 0.3, -0.6] },
  { geo: box(0.22, 0.6, 0.22), color: "#f4efe4", p: [0.32, 0.3, -0.6] },
]);
const sheepGeo = () => buildGeo([
  { geo: sphere(0.5), color: "#f2eee4", p: [0, 0.82, 0], s: [0.9, 0.8, 1.15] },
  { geo: box(0.3, 0.32, 0.4), color: "#2b2b2b", p: [0, 0.9, 0.62] },
  { geo: box(0.1, 0.16, 0.04), color: "#2b2b2b", p: [-0.18, 1.0, 0.55] },
  { geo: box(0.1, 0.16, 0.04), color: "#2b2b2b", p: [0.18, 1.0, 0.55] },
  { geo: box(0.14, 0.5, 0.14), color: "#2b2b2b", p: [-0.22, 0.25, 0.3] },
  { geo: box(0.14, 0.5, 0.14), color: "#2b2b2b", p: [0.22, 0.25, 0.3] },
  { geo: box(0.14, 0.5, 0.14), color: "#2b2b2b", p: [-0.22, 0.25, -0.3] },
  { geo: box(0.14, 0.5, 0.14), color: "#2b2b2b", p: [0.22, 0.25, -0.3] },
]);
const horseCartGeo = () => buildGeo([
  // horse
  { geo: box(0.7, 0.75, 1.7), color: "#8b5a3c", p: [0, 1.25, 1.9] },
  { geo: box(0.4, 0.9, 0.5), color: "#8b5a3c", p: [0, 1.85, 2.75], r: [0.5, 0, 0] },
  { geo: box(0.36, 0.4, 0.75), color: "#8b5a3c", p: [0, 2.15, 3.25] },
  { geo: box(0.1, 0.5, 0.9), color: "#3f2a1c", p: [0, 2.35, 2.7], r: [0.5, 0, 0] },
  { geo: box(0.08, 0.08, 0.9), color: "#3f2a1c", p: [0, 1.4, 0.85], r: [-0.9, 0, 0] },
  { geo: box(0.2, 0.9, 0.2), color: "#6b4a30", p: [-0.24, 0.45, 2.5] },
  { geo: box(0.2, 0.9, 0.2), color: "#6b4a30", p: [0.24, 0.45, 2.5] },
  { geo: box(0.2, 0.9, 0.2), color: "#6b4a30", p: [-0.24, 0.45, 1.3] },
  { geo: box(0.2, 0.9, 0.2), color: "#6b4a30", p: [0.24, 0.45, 1.3] },
  // cart
  { geo: box(1.5, 0.5, 2.2), color: "#a8763e", p: [0, 1.15, -1.1] },
  { geo: box(1.5, 0.1, 2.2), color: "#8b5a3c", p: [0, 0.85, -1.1] },
  { geo: cyl(0.55, 0.55, 0.15, 8), color: "#5b3a29", p: [-0.85, 0.55, -1.1], r: [0, 0, Math.PI / 2] },
  { geo: cyl(0.55, 0.55, 0.15, 8), color: "#5b3a29", p: [0.85, 0.55, -1.1], r: [0, 0, Math.PI / 2] },
  { geo: box(0.08, 0.08, 2.6), color: "#6b4a30", p: [-0.45, 1.0, 0.9] },
  { geo: box(0.08, 0.08, 2.6), color: "#6b4a30", p: [0.45, 1.0, 0.9] },
  // apples
  { geo: sphere(0.5), color: "#c8323c", p: [0, 1.5, -1.1], s: [1.2, 0.5, 1.8] },
  { geo: sphere(0.5), color: "#7fbf4a", p: [0.3, 1.6, -0.7], s: [0.7, 0.4, 0.9] },
]);
const duckGeo = () => buildGeo([
  { geo: sphere(0.2), color: "#8a6a48", p: [0, 0.14, 0], s: [0.9, 0.7, 1.2] },
  { geo: sphere(0.09), color: "#2f6b3a", p: [0, 0.36, 0.2] },
  { geo: box(0.08, 0.04, 0.12), color: "#f2b632", p: [0, 0.34, 0.32] },
  { geo: cone(0.08, 0.16, 4), color: "#5a4230", r: [-Math.PI / 2 - 0.5, 0, 0], p: [0, 0.24, -0.24] },
]);
const crabGeo = () => buildGeo([
  { geo: box(0.5, 0.16, 0.34), color: "#e0642c", p: [0, 0.14, 0] },
  { geo: box(0.14, 0.1, 0.16), color: "#e0642c", p: [-0.32, 0.16, 0.14], r: [0, 0.4, 0] },
  { geo: box(0.14, 0.1, 0.16), color: "#e0642c", p: [0.32, 0.16, 0.14], r: [0, -0.4, 0] },
  { geo: sphere(0.03), color: "#1c1c1c", p: [-0.08, 0.26, 0.16] },
  { geo: sphere(0.03), color: "#1c1c1c", p: [0.08, 0.26, 0.16] },
  { geo: box(0.7, 0.04, 0.04), color: "#c25322", p: [0, 0.08, -0.1] },
  { geo: box(0.7, 0.04, 0.04), color: "#c25322", p: [0, 0.08, 0.06], r: [0, 0, 0] },
  { geo: box(0.64, 0.04, 0.04), color: "#c25322", p: [0, 0.06, -0.02], r: [0, 0.3, 0] },
]);
const butterflyGeo = () => buildGeo([
  { geo: box(0.03, 0.03, 0.14), color: "#2b2b2b" },
  { geo: box(0.16, 0.005, 0.14), color: "#ffffff", p: [0.09, 0.005, 0.02] },
  { geo: box(0.16, 0.005, 0.14), color: "#ffffff", p: [-0.09, 0.005, 0.02] },
  { geo: box(0.12, 0.005, 0.08), color: "#ffffff", p: [0.07, 0.003, -0.07] },
  { geo: box(0.12, 0.005, 0.08), color: "#ffffff", p: [-0.07, 0.003, -0.07] },
]);
const mothGeo = () => buildGeo([
  { geo: box(0.02, 0.02, 0.07), color: "#c9c0a8" },
  { geo: box(0.09, 0.004, 0.07), color: "#d8d0bb", p: [0.055, 0, 0] },
  { geo: box(0.09, 0.004, 0.07), color: "#d8d0bb", p: [-0.055, 0, 0] },
]);
const coopGeo = () => buildGeo([
  { geo: box(1.6, 1.1, 1.3), color: "#8b5a3c", p: [0, 0.55, 0] },
  { geo: box(1.9, 0.12, 1.6), color: "#3f3a37", p: [0, 1.18, 0], r: [0.18, 0, 0] },
  { geo: box(0.5, 0.6, 0.05), color: "#2a1a10", p: [0, 0.32, 0.66] },
  { geo: box(1.0, 0.05, 0.4), color: "#a08a6a", p: [0, 0.03, 0.9], r: [0.3, 0, 0] },
]);

/* --------------------------------- walkers ---------------------------------- */

interface Walker { x: number; z: number; yaw: number; tx: number; tz: number; state: number; timer: number; phase: number; amp: number; speed: number }
const mkWalker = (x: number, z: number, phase: number): Walker => ({ x, z, yaw: 0, tx: x, tz: z, state: 0, timer: 0, phase, amp: 0, speed: 1 });

/** move a walker toward (tx,tz) at v m/s; returns true when arrived */
function walk(w: Walker, v: number, dt: number, turn = 3): boolean {
  const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz);
  if (d < 0.15) { w.amp = lerp(w.amp, 0, Math.min(1, dt * 6)); return true; }
  w.yaw = lerpAngle(w.yaw, Math.atan2(dx, dz), Math.min(1, dt * turn));
  const mv = Math.min(d, v * dt);
  w.x += Math.sin(w.yaw) * mv; w.z += Math.cos(w.yaw) * mv;
  w.amp = lerp(w.amp, 1, Math.min(1, dt * 6));
  return false;
}

/** shared per-instance write: transform + gait phase/amp */
function put(m: THREE.InstancedMesh, attr: THREE.InstancedBufferAttribute, i: number, w: Walker, y: number, s: number, pitch = 0, roll = 0, hidden = false) {
  if (hidden) { dummy.position.set(0, -100, 0); dummy.scale.setScalar(0.0001); dummy.rotation.set(0, 0, 0); }
  else { dummy.position.set(w.x, y, w.z); dummy.rotation.set(pitch, w.yaw, roll); dummy.scale.setScalar(s); }
  dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
  attr.setXY(i, w.phase, w.amp);
}

function useGait(count: number, legY: number, mode: 2 | 3 = 3) {
  const mat = useMemo(() => windMaterial({ mode, legY }), [legY, mode]);
  const attr = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2), [count]);
  return { mat, attr };
}
function attach(geo: THREE.BufferGeometry, attr: THREE.InstancedBufferAttribute) { geo.setAttribute("aPhase", attr); attr.setUsage(THREE.DynamicDrawUsage); }

/* ------------------------------------ cat ------------------------------------ */

/** the bakery sits at (120,−190) yaw 0, 11 × 9 — its door is on the +z face, so the step is at z ≈ −185 */
const CAT_STEP = { x: 121.4, z: -184.9 };
function Cat() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(catGeo, []);
  const { mat, attr } = useGait(1, 0.22);
  const w = useMemo(() => mkWalker(150, -185.5, 1), []);
  const near = useCull(ref, 160, -186, 170);
  useEffect(() => attach(geo, attr), [geo, attr]);
  useFrame((_, dt) => {
    const m = ref.current; if (!m || !near.current) return;
    tickWind(mat, 9);
    const h = lifeState.hour;
    const nap = hourIn(h, 13, 16.5) || lifeState.storm;
    let y = terrainHeight(w.x, -w.z), s = 1.5, pitch = 0, roll = 0;
    if (nap) {
      // curl up on the bakery step
      w.tx = CAT_STEP.x; w.tz = CAT_STEP.z;
      const arrived = walk(w, 1.4, dt);
      if (arrived) { w.yaw = lerpAngle(w.yaw, -1.2, Math.min(1, dt * 2)); roll = Math.PI / 2 * 0.85; s = 1.5; y = terrainHeight(w.x, -w.z) + 0.16; }
    } else {
      w.timer -= dt;
      if (w.state === 0) { // patrolling
        if (walk(w, 1.25, dt)) { w.state = 1; w.timer = 4 + Math.random() * 12; }
      } else { // sitting, looking about
        pitch = -0.25;
        if (w.timer <= 0) { w.state = 0; w.tx = 112 + Math.random() * 96; w.tz = -184.2 - Math.random() * 2.6; }
      }
    }
    put(m, attr, 0, w, y, s, pitch, roll);
    attr.needsUpdate = true; m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, 1]} castShadow frustumCulled={false} />;
}

/* ------------------------------------ dog ------------------------------------ */

const OWNERS = [["tunde_okafor"], ["per_lindqvist"]] as const;
const DOG_HOME = { x: 33, z: -272 };
function Dog() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(dogGeo, []);
  const { mat, attr } = useGait(1, 0.36);
  const w = useMemo(() => mkWalker(DOG_HOME.x, DOG_HOME.z, 2), []);
  const owner = useRef(0);
  useEffect(() => attach(geo, attr), [geo, attr]);
  useFrame((_, dt) => {
    const m = ref.current; if (!m) return;
    tickWind(mat, 10);
    w.timer -= dt;
    // re-pick the nearer owner every 2 s
    if (w.timer <= 0) { w.timer = 2; const a = nearestNpc(OWNERS[0], w.x, w.z), b = nearestNpc(OWNERS[1], w.x, w.z); owner.current = !a ? 1 : !b ? 0 : Math.hypot(a.x - w.x, a.z - w.z) <= Math.hypot(b.x - w.x, b.z - w.z) ? 0 : 1; }
    const o = nearestNpc(OWNERS[owner.current], w.x, w.z);
    let pitch = 0;
    if (o) {
      // heel: a spot behind and beside the owner
      const side = Math.sin(w.phase) > 0 ? 1 : -1;
      w.tx = o.x - Math.sin(o.heading) * 2.2 + Math.cos(o.heading) * 1.4 * side;
      w.tz = o.z - Math.cos(o.heading) * 2.2 - Math.sin(o.heading) * 1.4 * side;
      const far = Math.hypot(w.tx - w.x, w.tz - w.z);
      if (far > 60) { w.x = w.tx; w.z = w.tz; } // owner teleported (first sight) — catch up
      const arrived = walk(w, o.moving ? 3.2 : 2.2, dt, 4);
      if (arrived && !o.moving) { w.yaw = lerpAngle(w.yaw, Math.atan2(o.x - w.x, o.z - w.z), Math.min(1, dt * 3)); pitch = -0.2; }
    } else {
      w.tx = DOG_HOME.x; w.tz = DOG_HOME.z;
      if (walk(w, 2.2, dt)) pitch = -0.2;
    }
    const y = terrainHeight(w.x, -w.z);
    put(m, attr, 0, w, y, 1.35, pitch);
    attr.needsUpdate = true; m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, 1]} castShadow frustumCulled={false} />;
}

/* ----------------------------- herds (generic) ----------------------------- */

interface HerdProps { geo: () => THREE.BufferGeometry; count: number; legY: number; rect: [number, number, number, number]; speed: number; scale: number; freq: number; grazePitch: number; seed: number; radius: number; }
function Herd({ geo: mk, count, legY, rect, speed, scale, freq, grazePitch, seed, radius }: HerdProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(mk, [mk]);
  const { mat, attr } = useGait(count, legY);
  const ws = useMemo(() => { const r = srand(seed); return Array.from({ length: count }, (_, i) => { const w = mkWalker(lerp(rect[0], rect[1], r()), -lerp(rect[2], rect[3], r()), i * 1.3); w.timer = r() * 8; w.yaw = r() * 6.28; return w; }); }, [count, rect, seed]);
  const near = useCull(ref, (rect[0] + rect[1]) / 2, -(rect[2] + rect[3]) / 2, radius);
  useEffect(() => attach(geo, attr), [geo, attr]);
  useFrame((_, dt) => {
    const m = ref.current; if (!m || !near.current) return;
    tickWind(mat, freq);
    for (let i = 0; i < count; i++) {
      const w = ws[i];
      w.timer -= dt;
      let pitch = 0;
      if (w.state === 0) { // grazing / standing
        pitch = grazePitch * (0.6 + 0.4 * Math.sin(lifeState.t * 0.8 + w.phase));
        w.amp = lerp(w.amp, 0, Math.min(1, dt * 5));
        if (w.timer <= 0) { w.state = 1; w.tx = lerp(rect[0], rect[1], Math.random()); w.tz = -lerp(rect[2], rect[3], Math.random()); }
      } else if (walk(w, speed * (lifeState.storm ? 1.6 : 1), dt, 1.5)) { w.state = 0; w.timer = 6 + Math.random() * 16; }
      put(m, attr, i, w, terrainHeight(w.x, -w.z), scale, pitch);
    }
    attr.needsUpdate = true; m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, count]} castShadow frustumCulled={false} />;
}

/* --------------------------------- chickens ---------------------------------- */

const COOP = { x: 197, z: -44 };
function Chickens() {
  const coop = useMemo(coopGeo, []);
  return (
    <group>
      <mesh geometry={coop} material={vcMat()} position={[COOP.x, terrainHeight(COOP.x, -COOP.z), COOP.z]} rotation={[0, 0.6, 0]} castShadow />
      <Herd geo={chickenGeo} count={6} legY={0.2} rect={[COOP.x - 5, COOP.x + 5, -COOP.z - 5, -COOP.z + 5]} speed={0.7} scale={0.9} freq={14} grazePitch={0.45} seed={31} radius={140} />
    </group>
  );
}

/* --------------------------------- horse & cart -------------------------------- */

function HorseCart() {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(horseCartGeo, []);
  const near = useCull(ref, 231, -48, 160);
  useFrame(() => {
    const g = ref.current; if (!g || !near.current) return;
    g.visible = lifeState.bumperOrchard;
    if (!g.visible) return;
    // the horse shifts its weight and nods
    g.rotation.z = Math.sin(lifeState.t * 0.9) * 0.01;
    g.position.y = terrainHeight(231, 48) + Math.abs(Math.sin(lifeState.t * 1.7)) * 0.015;
  });
  return <group ref={ref} position={[231, terrainHeight(231, 48), -48]} rotation={[0, 1.4, 0]} visible={false}><mesh geometry={geo} material={vcMat()} castShadow /></group>;
}

/* ----------------------------------- ducks ----------------------------------- */

/** the env layer carves the pond at POND (mx,my) with its water at POND_Y — float the ducks on that */
const DUCK_POND = { x: POND.mx, z: -POND.my, r: POND.r - 1.6 };
function Ducks() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(duckGeo, []);
  const ws = useMemo(() => [mkWalker(DUCK_POND.x + 1.6, DUCK_POND.z, 0), mkWalker(DUCK_POND.x - 1.2, DUCK_POND.z + 1.1, 2), mkWalker(DUCK_POND.x, DUCK_POND.z - 1.7, 4)], []);
  const near = useCull(ref, DUCK_POND.x, DUCK_POND.z, 140);
  const y = POND_Y + 0.12;
  useFrame((_, dt) => {
    const m = ref.current; if (!m || !near.current) return;
    const t = lifeState.t;
    for (let i = 0; i < 3; i++) {
      const w = ws[i];
      w.timer -= dt;
      if (w.timer <= 0) { w.timer = 3 + Math.random() * 6; const a = Math.random() * 6.28, r = Math.random() * DUCK_POND.r; w.tx = DUCK_POND.x + Math.cos(a) * r; w.tz = DUCK_POND.z + Math.sin(a) * r; }
      walk(w, 0.25, dt, 1.2);
      dummy.position.set(w.x, y + Math.sin(t * 1.4 + w.phase) * 0.02, w.z);
      dummy.rotation.set(Math.sin(t * 1.1 + w.phase) * 0.05, w.yaw, Math.sin(t * 0.9 + w.phase) * 0.06);
      dummy.scale.setScalar(0.9); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, vcMat(), 3]} frustumCulled={false} />;
}

/* ----------------------------------- crabs ----------------------------------- */

function Crabs() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(crabGeo, []);
  const N = 6;
  const ws = useMemo(() => { const r = srand(9); return Array.from({ length: N }, (_, i) => { const w = mkWalker(34 + r() * 32, -300 - r() * 3, i); w.timer = r() * 3; return w; }); }, []);
  const near = useCull(ref, 50, -301, 120);
  useFrame((_, dt) => {
    const m = ref.current; if (!m || !near.current) return;
    const out = lifeState.tide < 0.45 && !lifeState.storm;
    m.visible = out;
    if (!out) return;
    for (let i = 0; i < N; i++) {
      const w = ws[i];
      w.timer -= dt;
      if (w.state === 0 && w.timer <= 0) { w.state = 1; w.timer = 0.4 + Math.random() * 0.5; w.speed = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random()); }
      if (w.state === 1) { w.x += w.speed * dt; if (w.x < 32 || w.x > 68) w.speed = -w.speed; if (w.timer <= 0) { w.state = 0; w.timer = 1 + Math.random() * 3; } }
      const skitter = w.state === 1 ? Math.sin(lifeState.t * 30) * 0.02 : 0;
      dummy.position.set(w.x, terrainHeight(w.x, -w.z) + 0.02 + skitter, w.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.7); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, vcMat(), N]} frustumCulled={false} />;
}

/* --------------------------------- butterflies -------------------------------- */

const MEADOWS = [{ x: 104, z: -70, r: 14 }, { x: 240, z: -32, r: 12 }, { x: 150, z: -120, r: 8 }];
const BUTTERFLY_COLORS = ["#f2c318", "#ff8a3c", "#e86aa8", "#8fd0ff", "#ffffff", "#c8e05a"];
function Butterflies() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(butterflyGeo, []);
  const N = 16;
  const { mat, attr } = useGait(N, 0, 2);
  const bs = useMemo(() => { const r = srand(61); return Array.from({ length: N }, (_, i) => { const m = MEADOWS[i % MEADOWS.length]; return { m, ph: r() * 6.28, x: m.x, z: m.z, y: 1.5 }; }); }, []);
  useEffect(() => { attach(geo, attr); const m = ref.current; if (m) { bs.forEach((_, i) => m.setColorAt(i, tmpC.set(BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length]))); if (m.instanceColor) m.instanceColor.needsUpdate = true; } }, [geo, attr, bs]);
  useFrame(() => {
    const m = ref.current; if (!m) return;
    tickWind(mat, 22);
    const S = lifeState, t = S.t;
    const day = ramp(S.hour, 7.5, 9) * (1 - ramp(S.hour, 17, 18.8));
    const active = S.storm ? 0 : Math.round(N * day * (S.heatwave ? 1 : 0.55));
    for (let i = 0; i < N; i++) {
      const b = bs[i];
      const show = i < active && Math.hypot(S.cam.x - b.m.x, S.cam.z - b.m.z) < 150;
      if (!show) { dummy.position.set(0, -100, 0); dummy.scale.setScalar(0.0001); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); continue; }
      const tt = t * 0.35 + b.ph;
      const nx = b.m.x + Math.sin(tt * 1.3) * b.m.r * 0.7 + Math.sin(tt * 3.1 + 1) * 2, nz = b.m.z + Math.cos(tt * 0.9 + 2) * b.m.r * 0.7 + Math.cos(tt * 2.7) * 2;
      const ny = terrainHeight(nx, -nz) + 1.2 + Math.sin(t * 2.3 + b.ph) * 0.5 + Math.sin(t * 0.7 + b.ph) * 0.4;
      const yaw = Math.atan2(nx - b.x, nz - b.z);
      b.x = nx; b.z = nz; b.y = ny;
      dummy.position.set(nx, ny, nz); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(1.3); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      attr.setXY(i, b.ph, 1.4);
    }
    attr.needsUpdate = true; m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, N]} frustumCulled={false} />;
}

/* ---------------------------------- fireflies --------------------------------- */

const FF_VERT = `attribute float aSeed; uniform float uTime; uniform float uOn; varying float vA;
void main(){
  float s1 = fract(sin(aSeed * 91.7) * 4375.5), s2 = fract(sin(aSeed * 47.3) * 2371.1);
  vec3 p = position;
  p.x += sin(uTime * (0.3 + s1 * 0.4) + aSeed * 6.28) * 2.5;
  p.z += cos(uTime * (0.25 + s2 * 0.4) + aSeed * 9.1) * 2.5;
  p.y += sin(uTime * 0.8 + aSeed * 12.0) * 0.5;
  float blink = smoothstep(0.55, 0.95, sin(uTime * (1.2 + s1 * 1.5) + aSeed * 40.0));
  vA = blink * uOn;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (1.5 + blink * 1.7) * (110.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const FF_FRAG = `varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = (1.0 - smoothstep(0.2, 1.0, r)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(0.85, 1.0, 0.45, a); }`;
function Fireflies() {
  const ref = useRef<THREE.Points>(null);
  const { geo, mat } = useMemo(() => {
    const r = srand(404);
    const N = 90;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const m = i < 50 ? MEADOWS[0] : MEADOWS[1];
      const a = r() * 6.28, rr = r() * m.r;
      const x = m.x + Math.cos(a) * rr, z = m.z + Math.sin(a) * rr;
      pos[i * 3] = x; pos[i * 3 + 1] = terrainHeight(x, -z) + 0.6 + r() * 1.8; pos[i * 3 + 2] = z; seed[i] = r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uOn: { value: 0 } }, vertexShader: FF_VERT, fragmentShader: FF_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    return { geo, mat };
  }, []);
  useFrame(() => {
    const p = ref.current; if (!p) return;
    const S = lifeState;
    const on = Math.max(0, S.night - 0.55) / 0.45 * (S.storm ? 0 : 1) * (hourIn(S.hour, 20, 4.5) ? 1 : 0);
    mat.uniforms.uOn.value = on; mat.uniforms.uTime.value = S.t;
    p.visible = on > 0.01;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

/* ------------------------------------ moths ----------------------------------- */

function Moths({ L }: { L: TownLayout }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(mothGeo, []);
  // pick lamps around the square and Main Street (nearest six to the square centre) + the tavern lantern
  const lamps = useMemo(() => {
    const globes = (L as { lampGlobes?: { x: number; y: number; z: number }[] }).lampGlobes;
    const src = globes ?? (L as { lampPosts?: { x: number; y: number; z: number }[] }).lampPosts ?? [];
    const g = src.map((l) => ({ x: l.x, y: l.y + (globes ? 0 : 1.85), z: l.z, d: Math.hypot(l.x - 150, l.z + 150) })).sort((a, b) => a.d - b.d).slice(0, 6);
    g.push({ x: TAVERN_LANTERN.x, y: TAVERN_LANTERN.y, z: TAVERN_LANTERN.z, d: 0 }); // tavern lantern (open_mic)
    return g;
  }, [L]);
  const N = lamps.length * 3;
  const { mat, attr } = useGait(N, 0, 2);
  useEffect(() => attach(geo, attr), [geo, attr]);
  useFrame(() => {
    const m = ref.current; if (!m) return;
    tickWind(mat, 30);
    const S = lifeState, t = S.t;
    const on = S.night > 0.6 && !S.storm;
    m.visible = on;
    if (!on) return;
    for (let i = 0; i < N; i++) {
      const l = lamps[Math.floor(i / 3)];
      const isTavern = Math.floor(i / 3) === lamps.length - 1;
      const show = (!isTavern || S.openMic) && Math.hypot(S.cam.x - l.x, S.cam.z - l.z) < 90;
      if (!show) { dummy.position.set(0, -100, 0); dummy.scale.setScalar(0.0001); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); continue; }
      const ph = i * 2.1, tt = t * 2.2 + ph;
      const r = 0.45 + Math.sin(tt * 0.7) * 0.25;
      const x = l.x + Math.cos(tt * 1.9) * r, z = l.z + Math.sin(tt * 1.4 + 1) * r, y = l.y + 0.15 + Math.sin(tt * 2.6) * 0.3;
      dummy.position.set(x, y, z); dummy.rotation.set(0.6, tt * 1.9 + Math.PI / 2, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      attr.setXY(i, ph, 1.5);
    }
    attr.needsUpdate = true; m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, N]} frustumCulled={false} />;
}

/* ------------------------------------ root ------------------------------------ */

export default function Animals({ L }: { L: TownLayout }) {
  return (
    <group>
      <Cat />
      <Dog />
      <Chickens />
      <Herd geo={cowGeo} count={3} legY={0.6} rect={[170, 190, 30, 46]} speed={0.45} scale={1.15} freq={5} grazePitch={0.14} seed={71} radius={200} />
      <Herd geo={sheepGeo} count={4} legY={0.5} rect={[279, 296, 40, 58]} speed={0.5} scale={0.95} freq={7} grazePitch={0.18} seed={72} radius={200} />
      <HorseCart />
      <Ducks />
      <Crabs />
      <Butterflies />
      <Fireflies />
      <Moths L={L} />
    </group>
  );
}
