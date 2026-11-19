/**
 * Ambient beats: the chapel bell swings (with a visible ring wave) at 06:00,
 * 12:00 and 18:00; leaves tumble across the square on the wind; a stray sheet
 * of paper takes off during gusts. (Fish jumps live in sea.tsx, the foghorn
 * pulse in weather.tsx, the ship's funnel puff in the particle system.)
 */
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { terrainHeight } from "../terrain";
import { buildGeo, box, cyl, sphere, vcMat, dummy, tmpC, srand, useCull } from "./util";
import { lifeState } from "./state";

/* ------------------------------------ bell ------------------------------------ */

// chapel tower: temple at (60,120), yaw π/2, spire group at local z −4.7 → world (55.3, ·, −120); tower top = h(5.2) + 4
const TOWER = { x: 55.3, z: -120, top: terrainHeight(60, 120) + 9.2 };
export const bellState = { ringing: false };

function Bell() {
  const group = useRef<THREE.Group>(null);
  const bell = useRef<THREE.Group>(null);
  const wave = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => buildGeo([
    { geo: box(0.1, 0.1, 1.2), color: "#3a3330", p: [0, 0.55, 0] },                 // bracket bar
    { geo: box(0.08, 0.6, 0.08), color: "#3a3330", p: [0, 0.25, -0.55] },
    { geo: box(0.08, 0.6, 0.08), color: "#3a3330", p: [0, 0.25, 0.55] },
  ]), []);
  const bellGeo = useMemo(() => buildGeo([
    { geo: cyl(0.16, 0.34, 0.5, 8), color: "#c9a227", p: [0, -0.3, 0] },
    { geo: cyl(0.36, 0.36, 0.08, 8), color: "#b08a1e", p: [0, -0.58, 0] },
    { geo: sphere(0.07), color: "#3a3330", p: [0, -0.66, 0] },
    { geo: box(0.08, 0.12, 0.08), color: "#3a3330", p: [0, 0, 0] },
  ]), []);
  const waveMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff2b0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), []);
  const bellMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0.45, roughness: 0.45 }), []);
  const st = useRef({ ringT: -1, lastHour: -1 });
  const near = useCull(group, TOWER.x, TOWER.z, 220);
  useFrame((_, dt) => {
    const S = lifeState, s = st.current;
    const hh = Math.floor(S.hour);
    if (hh !== s.lastHour) { s.lastHour = hh; if (hh === 6 || hh === 12 || hh === 18) s.ringT = 0; }
    if (s.ringT >= 0) { s.ringT += dt; if (s.ringT > 13) s.ringT = -1; }
    const ringing = s.ringT >= 0;
    bellState.ringing = ringing;
    if (!near.current) return;
    const env = ringing ? Math.min(1, s.ringT / 1.5) * Math.min(1, (13 - s.ringT) / 3) : 0;
    if (bell.current) bell.current.rotation.x = Math.sin(S.t * 6.2) * 0.75 * env;
    const w = wave.current;
    if (w) {
      w.visible = ringing;
      if (ringing) {
        const k = (s.ringT % 1.05) / 1.05;
        w.scale.setScalar(0.5 + k * 16);
        waveMat.opacity = (1 - k) * 0.25 * env;
      }
    }
  });
  return (
    <group ref={group} position={[TOWER.x, TOWER.top + 0.2, TOWER.z + 1.55]}>
      <mesh geometry={geo} material={vcMat()} />
      <group ref={bell} position={[0, 0.52, 0]}>
        <mesh geometry={bellGeo} material={bellMat} castShadow />
      </group>
      <mesh ref={wave} material={waveMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} visible={false}>
        <ringGeometry args={[0.9, 1, 32]} />
      </mesh>
    </group>
  );
}

/* ------------------------------------ leaves ----------------------------------- */

const LEAF_N = 44;
const SQ = { x: 150, z: -120 };
const LEAF_COLORS = ["#d9853b", "#c0702c", "#e8b83c", "#a8552a", "#b8963c"];
function Leaves() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => { const g = new THREE.CircleGeometry(0.16, 5); g.scale(1, 0.6, 1); return g; }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: 1, flatShading: true }), []);
  const ls = useMemo(() => { const r = srand(19); return Array.from({ length: LEAF_N }, () => ({ x: SQ.x + (r() - 0.5) * 50, z: SQ.z + (r() - 0.5) * 60, ph: r() * 6.28, spin: 3 + r() * 5, rest: r() * 4 })); }, []);
  const near = useCull(ref, SQ.x, SQ.z, 200);
  useEffect(() => { const m = ref.current; if (!m) return; ls.forEach((_, i) => m.setColorAt(i, tmpC.set(LEAF_COLORS[i % LEAF_COLORS.length]))); if (m.instanceColor) m.instanceColor.needsUpdate = true; }, [ls]);
  useFrame((_, dt) => {
    const m = ref.current; if (!m || !near.current) return;
    const S = lifeState, t = S.t;
    const push = S.wind * 0.9 + S.gust * 4.5;
    for (let i = 0; i < LEAF_N; i++) {
      const l = ls[i];
      // a leaf only moves when the wind exceeds its own inertia; then it skips along the ground
      const moving = push > 1.1 + l.rest * 0.35;
      if (moving) {
        const sp = (push - 1) * (0.8 + Math.sin(t * 2 + l.ph) * 0.3);
        l.x += S.windDir.x * sp * dt + Math.sin(t * 3.1 + l.ph) * 0.4 * dt;
        l.z += S.windDir.y * sp * dt + Math.cos(t * 2.7 + l.ph) * 0.4 * dt;
        // recycle when it blows out of the square: re-enter upwind
        if (Math.abs(l.x - SQ.x) > 34 || Math.abs(l.z - SQ.z) > 40) { l.x = SQ.x - S.windDir.x * 30 + (Math.random() - 0.5) * 40; l.z = SQ.z - S.windDir.y * 34 + (Math.random() - 0.5) * 40; }
      }
      const hop = moving ? Math.abs(Math.sin(t * (2.5 + l.rest) + l.ph)) * 0.35 * Math.min(1, push - 1) : 0;
      const y = terrainHeight(l.x, -l.z) + 0.09 + hop;
      dummy.position.set(l.x, y, l.z);
      dummy.rotation.set(-Math.PI / 2 + (moving ? Math.sin(t * l.spin + l.ph) * 0.9 : 0.15), l.ph + (moving ? t * l.spin * 0.5 : 0), 0);
      dummy.scale.setScalar(1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, LEAF_N]} frustumCulled={false} castShadow={false} />;
}

/* ------------------------------------ paper ------------------------------------ */

function Paper() {
  const ref = useRef<THREE.Mesh>(null);
  const st = useRef({ t: -1, x: 0, z: 0, y: 0, ph: 0 });
  useFrame((_, dt) => {
    const m = ref.current; if (!m) return;
    const S = lifeState, s = st.current;
    if (s.t < 0) {
      m.visible = false;
      if (S.gust > 0.75 && Math.random() < dt * 0.6) {
        // take off from wherever the camera is looking, roughly
        s.t = 0; s.x = S.focus.x + (Math.random() - 0.5) * 30; s.z = S.focus.z + (Math.random() - 0.5) * 30; s.y = terrainHeight(s.x, -s.z) + 0.1; s.ph = Math.random() * 6.28;
      }
      return;
    }
    s.t += dt;
    if (s.t > 7) { s.t = -1; return; }
    const k = s.t / 7;
    const lift = Math.sin(k * Math.PI) * (1.5 + S.gust * 2.5);
    const sp = 2.5 + S.wind * 1.5 + S.gust * 4;
    s.x += (S.windDir.x * sp + Math.sin(S.t * 2.3 + s.ph) * 1.2) * dt;
    s.z += (S.windDir.y * sp + Math.cos(S.t * 1.9 + s.ph) * 1.2) * dt;
    const y = Math.max(terrainHeight(s.x, -s.z) + 0.1, s.y + lift);
    m.visible = true;
    m.position.set(s.x, y, s.z);
    m.rotation.set(Math.sin(S.t * 5 + s.ph) * 1.2, S.t * 2.5, Math.cos(S.t * 4.1) * 0.8);
  });
  return (
    <mesh ref={ref} visible={false}>
      <planeGeometry args={[0.42, 0.6]} />
      <meshStandardMaterial color="#f7f4ec" side={THREE.DoubleSide} roughness={1} />
    </mesh>
  );
}

export default function Beats() {
  return (
    <group>
      <Bell />
      <Leaves />
      <Paper />
    </group>
  );
}
