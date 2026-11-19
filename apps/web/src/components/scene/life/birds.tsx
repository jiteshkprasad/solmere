/**
 * Birds — ONE instanced low-poly bird mesh (wing flap in the vertex shader,
 * per-instance tint/scale/flap amplitude) shared by:
 *   gulls    circling the harbour, escorting boats at sea, perching on pier posts
 *   sparrows hopping about the square, scattering when an NPC comes within 3 m
 *   the V    a skein crossing the sky at dusk
 *   bats     jinking around the lighthouse at night
 *   crows    on the lower field while poor_harvest is active
 * plus a separate owl silhouette on the chapel tower at night.
 */
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { terrainHeight } from "../terrain";
import { buildGeo, box, cone, sphere, windMaterial, tickWind, dummy, tmpC, srand, lerpAngle, useCull, lerp, vcMat } from "./util";
import { lifeState, hourIn, npcWithin } from "./state";
import { boatPositions } from "./sea";

/* --------------------------------- bird geometry -------------------------------- */

function birdGeo() {
  // body along +z, wings span x; wing vertices (|x| > 0.08) flap in the shader
  return buildGeo([
    { geo: sphere(0.2), color: "#ffffff", s: [0.55, 0.5, 1.25] },
    { geo: cone(0.09, 0.28, 4), color: "#f2b632", r: [Math.PI / 2, 0, 0], p: [0, 0.02, 0.36] },
    { geo: box(0.86, 0.02, 0.26), color: "#f4f4f4", p: [0.51, 0.04, -0.02] },
    { geo: box(0.86, 0.02, 0.26), color: "#f4f4f4", p: [-0.51, 0.04, -0.02] },
    { geo: box(0.22, 0.025, 0.28), color: "#5a5a5a", p: [0.85, 0.04, -0.02] },
    { geo: box(0.22, 0.025, 0.28), color: "#5a5a5a", p: [-0.85, 0.04, -0.02] },
    { geo: box(0.16, 0.02, 0.3), color: "#e8e8e8", p: [0, 0.02, -0.34] },
  ]);
}

/* ----------------------------------- slots ----------------------------------- */

const N_GULL = 24, N_SPAR = 8, N_V = 11, N_BAT = 8, N_CROW = 12;
const GULL0 = 0, SPAR0 = N_GULL, V0 = SPAR0 + N_SPAR, BAT0 = V0 + N_V, CROW0 = BAT0 + N_BAT, TOTAL = CROW0 + N_CROW;

interface Flyer { x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number; amp: number; phase: number; state: number; timer: number; a: number; b: number; c: number; perch: number; }
const mk = (x: number, y: number, z: number, phase: number): Flyer => ({ x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, amp: 1, phase, state: 0, timer: 0, a: 0, b: 0, c: 0, perch: -1 });

/** centre of the gulls' circuit: the harbour mouth, just off the pier head */
const HARBOUR = { x: -6, z: -288 };
/** pier piling tops: the deck runs along z = −277 from x = +10 out to x = −35, pilings at z = −277 ± 2.3
 *  with their tops just proud of the deck (y ≈ 0.95). Plus two on the lighthouse gallery rail. */
const PERCHES: [number, number, number][] = [];
for (let i = 0; i < 10; i++) { const x = 10 - i * 5; PERCHES.push([x, 0.95, -274.5], [x, 0.95, -279.5]); }
PERCHES.push([10, terrainHeight(10, 295) + 13.3, -295], [12.6, terrainHeight(10, 295) + 13.3, -297.5]);

const SQUARE = { x: 150, z: -120 };
const SPAR_PERCH: [number, number, number][] = [[131, terrainHeight(131, 143) + 3.9, -143], [169, terrainHeight(169, 143) + 3.9, -143], [134, terrainHeight(134, 138) + 5.2, -138], [166, terrainHeight(166, 102) + 5.2, -102]];
const FIELD = { x: 206, z: -20, w: 30, d: 16 };
const _n = new THREE.Vector2();

/** steer a flyer toward a goal with capped speed; returns squared distance to goal */
function steer(f: Flyer, gx: number, gy: number, gz: number, vmax: number, acc: number, dt: number): number {
  const dx = gx - f.x, dy = gy - f.y, dz = gz - f.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  f.vx += (dx / d) * acc * dt; f.vy += (dy / d) * acc * dt; f.vz += (dz / d) * acc * dt;
  const v = Math.hypot(f.vx, f.vy, f.vz);
  if (v > vmax) { f.vx *= vmax / v; f.vy *= vmax / v; f.vz *= vmax / v; }
  f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
  if (f.vx * f.vx + f.vz * f.vz > 0.05) f.yaw = lerpAngle(f.yaw, Math.atan2(f.vx, f.vz), Math.min(1, dt * 4));
  return d * d;
}

export default function Birds() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(birdGeo, []);
  const mat = useMemo(() => windMaterial({ mode: 2 }), []);
  const phaseAttr = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(TOTAL * 2), 2), []);
  const flyers = useMemo(() => {
    const r = srand(2024);
    const out: Flyer[] = [];
    for (let i = 0; i < TOTAL; i++) {
      const f = mk(HARBOUR.x + (r() - 0.5) * 40, 12 + r() * 10, HARBOUR.z + (r() - 0.5) * 40, r() * 6.28);
      f.a = 14 + r() * 26; f.b = 8 + r() * 14; f.c = (r() > 0.5 ? 1 : -1) * (0.25 + r() * 0.25); f.timer = r() * 12;
      if (i >= SPAR0 && i < V0) { f.x = SQUARE.x + (r() - 0.5) * 14; f.z = SQUARE.z + (r() - 0.5) * 14; f.y = terrainHeight(f.x, -f.z) + 0.15; f.state = 0; f.timer = r() * 2; }
      if (i >= CROW0) { f.x = FIELD.x + (r() - 0.5) * FIELD.w; f.z = FIELD.z + (r() - 0.5) * FIELD.d; f.y = terrainHeight(f.x, -f.z) + 0.6; f.timer = r() * 6; }
      out.push(f);
    }
    return out;
  }, []);
  useEffect(() => {
    geo.setAttribute("aPhase", phaseAttr);
    phaseAttr.setUsage(THREE.DynamicDrawUsage);
    const m = ref.current; if (!m) return;
    for (let i = 0; i < TOTAL; i++) {
      const c = i < SPAR0 ? tmpC.set("#ffffff") : i < V0 ? tmpC.set("#8a6a48") : i < BAT0 ? tmpC.set("#3a3540") : i < CROW0 ? tmpC.set("#17151c") : tmpC.set("#1c1c22");
      m.setColorAt(i, c);
      phaseAttr.setXY(i, flyers[i].phase, 1);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    phaseAttr.needsUpdate = true;
  }, [geo, phaseAttr, flyers]);

  useFrame((_, dt) => {
    const m = ref.current; if (!m) return;
    dt = Math.min(dt, 0.05);
    tickWind(mat, 11);
    const S = lifeState, t = S.t, h = S.hour;
    const nightBirds = S.night > 0.6;
    const gullsActive = nightBirds ? 0 : S.bigCatch ? N_GULL : S.heatwave ? 7 : S.storm ? 10 : 14;
    const camNearHarbour = Math.hypot(S.cam.x - HARBOUR.x, S.cam.z - HARBOUR.z) < 420;

    /* ------------------------------ gulls ------------------------------ */
    for (let i = 0; i < N_GULL; i++) {
      const f = flyers[GULL0 + i];
      if (i >= gullsActive || !camNearHarbour) { place(m, GULL0 + i, f, 0); continue; }
      f.timer -= dt;
      if (f.timer <= 0) {
        // pick a new behaviour: 0 circle, 1 follow a boat at sea, 2 perch
        const atSea = boatPositions.filter((b) => b.atSea);
        const r = Math.random();
        if (atSea.length && r < 0.45) { f.state = 1; f.perch = Math.floor(Math.random() * boatPositions.length); if (!boatPositions[f.perch].atSea) f.perch = boatPositions.indexOf(atSea[0]); f.timer = 15 + Math.random() * 20; }
        else if (r < 0.7 && !S.storm) { f.state = 2; f.perch = Math.floor(Math.random() * PERCHES.length); f.timer = 10 + Math.random() * 16; f.c = 0; }
        else { f.state = 0; f.a = 14 + Math.random() * 30; f.b = (S.storm ? 14 : 7) + Math.random() * 14; f.c = (Math.random() > 0.5 ? 1 : -1) * (0.22 + Math.random() * 0.25); f.timer = 12 + Math.random() * 18; }
      }
      let flap = 1;
      if (f.state === 0) {
        const a = t * f.c + f.phase;
        const gx = HARBOUR.x + Math.cos(a) * f.a, gz = HARBOUR.z + Math.sin(a) * f.a, gy = WATERLINE + f.b + Math.sin(t * 0.7 + f.phase) * 2.5;
        steer(f, gx, gy, gz, S.storm ? 13 : 9, S.storm ? 14 : 7, dt);
        flap = Math.sin(t * 0.35 + f.phase * 3) > 0.3 ? 0.08 : 1;          // glide phases
      } else if (f.state === 1) {
        const b = boatPositions[f.perch];
        const a = t * 1.1 + f.phase;
        steer(f, b.x + Math.cos(a) * 7, WATERLINE + 5.5 + Math.sin(a * 1.3) * 1.6, b.z + Math.sin(a) * 7, 10, 9, dt);
        flap = Math.sin(t * 0.5 + f.phase) > 0.4 ? 0.1 : 1;
      } else {
        const p = PERCHES[f.perch];
        if (f.c === 0) {
          const d2 = steer(f, p[0], p[1] + 0.6, p[2], 7, 8, dt);
          if (d2 < 0.5) { f.c = 1; f.vx = f.vy = f.vz = 0; f.x = p[0]; f.y = p[1]; f.z = p[2]; f.yaw = Math.atan2(-S.windDir.x, -S.windDir.y); }
        } else { flap = 0; f.y = p[1] + Math.sin(t * 2 + f.phase) * 0.01; }
      }
      f.amp = lerp(f.amp, flap, Math.min(1, dt * 6));
      place(m, GULL0 + i, f, 1, f.state === 2 && f.c === 1 ? -0.1 : 0);
    }

    /* ----------------------------- sparrows ----------------------------- */
    const sparrowsOut = !nightBirds && !S.storm && Math.hypot(S.cam.x - SQUARE.x, S.cam.z - SQUARE.z) < 220;
    for (let i = 0; i < N_SPAR; i++) {
      const f = flyers[SPAR0 + i];
      if (!sparrowsOut) { place(m, SPAR0 + i, f, 0); continue; }
      f.timer -= dt;
      if (f.state === 0) {
        // ground: hop about; scatter if a person comes near
        if (npcWithin(f.x, f.z, 3.2, _n)) {
          f.state = 1; f.perch = Math.floor(Math.random() * SPAR_PERCH.length); f.timer = 6 + Math.random() * 8;
          f.vx = (f.x - _n.x) * 2; f.vz = (f.z - _n.y) * 2; f.vy = 4;
        } else {
          if (f.timer <= 0) { f.timer = 0.6 + Math.random() * 2.2; f.a = f.x + (Math.random() - 0.5) * 1.6; f.b = f.z + (Math.random() - 0.5) * 1.6; f.c = 0.28; }
          if (f.c > 0) { // short hop
            f.c -= dt; const k = 1 - f.c / 0.28;
            f.x = lerp(f.x, f.a, Math.min(1, dt * 8)); f.z = lerp(f.z, f.b, Math.min(1, dt * 8));
            f.y = terrainHeight(f.x, -f.z) + 0.12 + Math.sin(k * Math.PI) * 0.18;
            const dx = f.a - f.x, dz = f.b - f.z; if (dx * dx + dz * dz > 0.01) f.yaw = Math.atan2(dx, dz);
          } else f.y = terrainHeight(f.x, -f.z) + 0.12;
          f.amp = f.c > 0 ? 1 : 0;
        }
      } else if (f.state === 1) {
        const p = SPAR_PERCH[f.perch];
        const d2 = steer(f, p[0], p[1], p[2], 8, 16, dt);
        f.amp = 1;
        if (d2 < 0.3) { f.state = 2; f.vx = f.vy = f.vz = 0; f.x = p[0]; f.y = p[1]; f.z = p[2]; }
      } else {
        f.amp = 0;
        if (f.timer <= 0) { f.state = 3; f.a = SQUARE.x + (Math.random() - 0.5) * 16; f.b = SQUARE.z + (Math.random() - 0.5) * 16; }
      }
      if (f.state === 3) {
        const gy = terrainHeight(f.a, -f.b) + 0.12;
        const d2 = steer(f, f.a, gy, f.b, 7, 12, dt);
        f.amp = 1;
        if (d2 < 0.2) { f.state = 0; f.vx = f.vy = f.vz = 0; f.y = gy; f.c = 0; f.timer = 1; }
      }
      place(m, SPAR0 + i, f, 0.34);
    }

    /* ---------------------------- the dusk skein ---------------------------- */
    const vWindow = hourIn(h, 17.9, 19.6) && !S.storm;
    const vk = (t % 110) / 70; // 70 s crossing, 40 s gap
    for (let i = 0; i < N_V; i++) {
      const f = flyers[V0 + i];
      if (!vWindow || vk > 1) { place(m, V0 + i, f, 0); continue; }
      const side = i % 2 === 0 ? 1 : -1, rank = Math.ceil(i / 2);
      const lx = 360 - vk * 520, lz = -260 + vk * 40;
      f.x = lx + rank * 3.4 - side * 0; f.z = lz + side * rank * 3.2; f.y = 58 + rank * 0.6 + Math.sin(t * 0.8 + i) * 0.8;
      f.yaw = Math.atan2(-520, 40); f.amp = 1; f.phase = i * 0.9;
      place(m, V0 + i, f, 0.62);
    }

    /* -------------------------------- bats -------------------------------- */
    const batsOut = (h >= 20.3 || h < 5) && S.night > 0.5 && !S.storm && Math.hypot(S.cam.x - 10, S.cam.z + 295) < 200;
    for (let i = 0; i < N_BAT; i++) {
      const f = flyers[BAT0 + i];
      if (!batsOut) { place(m, BAT0 + i, f, 0); continue; }
      const ph = f.phase, tt = t * 1.7 + ph * 5;
      const gx = 10 + Math.sin(tt * 0.9 + ph) * 9 + Math.sin(tt * 2.3) * 2.5, gz = -295 + Math.cos(tt * 0.7 + ph * 2) * 9 + Math.cos(tt * 1.9) * 2, gy = LIGHT_Y + 10 + Math.sin(tt * 1.3 + ph) * 3.5;
      steer(f, gx, gy, gz, 12, 40, dt);
      f.amp = 1.3;
      place(m, BAT0 + i, f, 0.42);
    }

    /* ------------------------------- crows ------------------------------- */
    const crowsOut = S.poorHarvest && !nightBirds && Math.hypot(S.cam.x - FIELD.x, S.cam.z - FIELD.z) < 240;
    for (let i = 0; i < N_CROW; i++) {
      const f = flyers[CROW0 + i];
      if (!crowsOut) { place(m, CROW0 + i, f, 0); continue; }
      f.timer -= dt;
      if (f.state === 0) {
        // on the ground, pecking; now and then a short flap to a new spot
        f.amp = 0; f.y = terrainHeight(f.x, -f.z) + 0.55;
        if (f.timer <= 0) { f.state = 1; f.a = FIELD.x + (Math.random() - 0.5) * FIELD.w; f.b = FIELD.z + (Math.random() - 0.5) * FIELD.d; f.timer = 4 + Math.random() * 9; f.vy = 3; }
      } else {
        const gy = terrainHeight(f.a, -f.b) + 0.55;
        const d2 = steer(f, f.a, gy + Math.max(0, 2.5 - Math.sqrt(Math.max(0, (f.a - f.x) ** 2 + (f.b - f.z) ** 2)) * 0.2), f.b, 6, 10, dt);
        f.amp = 1;
        if (d2 < 0.3) { f.state = 0; f.vx = f.vy = f.vz = 0; f.y = gy; }
      }
      place(m, CROW0 + i, f, 0.75, f.state === 0 ? -0.35 + Math.sin(t * 3 + f.phase) * 0.15 : 0);
    }

    // flap amplitudes → shader
    for (let i = 0; i < TOTAL; i++) phaseAttr.setXY(i, flyers[i].phase, flyers[i].amp);
    phaseAttr.needsUpdate = true;
    m.instanceMatrix.needsUpdate = true;
  });

  function place(m: THREE.InstancedMesh, i: number, f: Flyer, s: number, pitch = 0) {
    if (s === 0) { dummy.position.set(0, -50, 0); dummy.scale.setScalar(0.0001); dummy.rotation.set(0, 0, 0); }
    else {
      dummy.position.set(f.x, f.y, f.z);
      const bank = -THREE.MathUtils.clamp(f.vx * Math.cos(f.yaw) - f.vz * Math.sin(f.yaw), -6, 6) * 0.06;
      dummy.rotation.set(pitch, f.yaw, bank); dummy.scale.setScalar(s);
    }
    dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
  }

  return <instancedMesh ref={ref} args={[geo, mat, TOTAL]} frustumCulled={false} castShadow={false} />;
}

const WATERLINE = -0.45;
const LIGHT_Y = terrainHeight(10, 295);

/* ----------------------------------- the owl ----------------------------------- */

export function Owl() {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(() => buildGeo([
    { geo: sphere(0.26), color: "#2a2430", s: [0.8, 1.15, 0.8], p: [0, 0.3, 0] },
    { geo: sphere(0.18), color: "#2a2430", p: [0, 0.68, 0.02] },
    { geo: cone(0.06, 0.16, 3), color: "#2a2430", p: [-0.1, 0.84, 0] },
    { geo: cone(0.06, 0.16, 3), color: "#2a2430", p: [0.1, 0.84, 0] },
  ]), []);
  const eyeGeo = useMemo(() => buildGeo([
    { geo: sphere(0.035), color: "#ffe28a", p: [-0.07, 0.7, 0.16] },
    { geo: sphere(0.035), color: "#ffe28a", p: [0.07, 0.7, 0.16] },
  ]), []);
  const eyes = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: "#ffd766", emissiveIntensity: 0 }), []);
  // chapel tower: temple at (60,120) yaw π/2, spire group at local z −4.7 → world (55.3, ·, −120); tower top y = h+4
  const towerTop = terrainHeight(60, 120) + 5.2 + 4;
  const near = useCull(ref, 55, -120, 160);
  useFrame(() => {
    const g = ref.current; if (!g || !near.current) return;
    const out = lifeState.night > 0.7 && !lifeState.storm;
    g.visible = out;
    if (!out) return;
    const t = lifeState.t;
    // every ~20 s the owl turns its head and "calls" (a bob)
    const beat = t % 21;
    const call = beat < 1.2 ? Math.sin((beat / 1.2) * Math.PI) : 0;
    g.rotation.y = Math.PI * 0.9 + Math.sin(Math.floor(t / 7) * 1.7) * 0.6;
    g.scale.set(1, 1 - call * 0.12, 1);
    eyes.emissiveIntensity = 0.6 + call * 1.2;
  });
  return (
    <group ref={ref} position={[55.3 + 1.2, towerTop + 0.02, -120 - 1.3]}>
      <mesh geometry={geo} material={vcMat()} />
      <mesh geometry={eyeGeo} material={eyes} />
    </group>
  );
}
