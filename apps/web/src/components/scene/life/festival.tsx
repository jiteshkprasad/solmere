/**
 * Tide Festival dressing, shown only while the `festival` card is active:
 * bunting strung across the square, paper lanterns along Main Street (lit at
 * night), a small stage in front of the town hall, confetti at 20:00, fireworks
 * over the harbour 21:00–22:00 and a bonfire on the beach after dark.
 */
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { terrainHeight } from "../terrain";
import { buildGeo, box, cyl, vcMat, windMaterial, whiteColors, tickWind, dummy, tmpC, srand, useCull } from "./util";
import type { TownLayout } from "../buildings/layout";
import { lifeState, hourIn } from "./state";
import { emitter } from "./particles";

const SQ = { x: 150, z: -120 };
/** the stage stands on the paving west of the fountain — the town hall's front wall is at z ≈ −111,
 *  and the fountain fills z −115…−125, so anything on the centre line is buried in one or the other. */
const STAGE = { x: 131, z: -114.5, yaw: 0.35 };
/** the square is a paved deck a little above the raw terrain — dress it at that height */
let squareY = terrainHeight(SQ.x, -SQ.z);
const FLAG_COLORS = ["#c8323c", "#f2c318", "#3c8ed6", "#f4efe4", "#7fbf4a", "#ff8a3c", "#e86aa8"];

interface Pt { x: number; y: number; z: number }
function catenary(a: Pt, b: Pt, sag: number, n: number, out: Pt[]) {
  for (let i = 0; i <= n; i++) { const k = i / n; out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * sag, z: a.z + (b.z - a.z) * k }); }
}

/* ------------------------------ bunting + lanterns ------------------------------ */

function Strings() {
  const pennants = useRef<THREE.InstancedMesh>(null);
  const lanterns = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const { lineGeo, pen, lan } = useMemo(() => {
    const r = srand(7);
    const H = (x: number, my: number, h: number): Pt => ({ x, y: Math.max(terrainHeight(x, my), squareY) + h, z: -my });
    const corners = [H(131, 143, 3.45), H(169, 143, 3.45), H(169, 97, 3.45), H(131, 97, 3.45)];
    const mast = H(150, 120, 3.4);
    const strings: [Pt, Pt, number][] = [];
    for (let i = 0; i < 4; i++) strings.push([corners[i], corners[(i + 1) % 4], 1.6]);
    for (let i = 0; i < 4; i++) strings.push([corners[i], mast, 1.2]);
    // Main Street lantern strings: between neighbouring lamp posts on each side
    const xs = [112, 137, 162, 187, 212];
    const lanStrings: [Pt, Pt][] = [];
    for (let i = 0; i < xs.length - 1; i++) { lanStrings.push([H(xs[i], 176.2, 3.5), H(xs[i + 1], 176.2, 3.5)]); lanStrings.push([H(xs[i] + 12, 183.8, 3.5), H(xs[i + 1] + 12, 183.8, 3.5)]); }
    const pos: number[] = [];
    const pen: { x: number; y: number; z: number; yaw: number; color: string; phase: number }[] = [];
    const lan: { x: number; y: number; z: number; color: string; phase: number }[] = [];
    const pts: Pt[] = [];
    for (const [a, b, sag] of strings) {
      pts.length = 0; catenary(a, b, sag, 16, pts);
      for (let i = 0; i < pts.length - 1; i++) pos.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
      const n = Math.floor(len / 1.25);
      for (let i = 1; i < n; i++) {
        const k = i / n;
        pen.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * sag, z: a.z + (b.z - a.z) * k, yaw, color: FLAG_COLORS[Math.floor(r() * FLAG_COLORS.length)], phase: r() * 6.28 });
      }
    }
    for (const [a, b] of lanStrings) {
      pts.length = 0; catenary(a, b, 0.9, 10, pts);
      for (let i = 0; i < pts.length - 1; i++) pos.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      const n = 8;
      for (let i = 1; i < n; i++) {
        const k = i / n;
        lan.push({ x: a.x + (b.x - a.x) * k, y: a.y - Math.sin(k * Math.PI) * 0.9 - 0.35, z: a.z + (b.z - a.z) * k, color: ["#ffb347", "#ff6b4a", "#ffd766", "#ff8fb1"][i % 4], phase: r() * 6.28 });
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return { lineGeo, pen, lan };
  }, []);
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: "#3a3330" }), []);
  const penGeo = useMemo(() => whiteColors(new THREE.PlaneGeometry(1, 1, 1, 3)), []);
  const penMat = useMemo(() => windMaterial({ mode: 1 }), []);
  const penPhase = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, pen.length) * 2), 2), [pen.length]);
  const lanGeo = useMemo(() => buildGeo([{ geo: box(0.34, 0.42, 0.34), color: "#ffffff" }, { geo: box(0.1, 0.12, 0.1), color: "#3a3330", p: [0, 0.27, 0] }, { geo: box(0.1, 0.12, 0.1), color: "#3a3330", p: [0, -0.27, 0] }]), []);
  const lanMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: "#ffb347", emissiveIntensity: 0, roughness: 0.8 }), []);

  useEffect(() => {
    penGeo.setAttribute("aPhase", penPhase);
    const pm = pennants.current, lm = lanterns.current;
    if (pm) {
      pen.forEach((p, i) => { penPhase.setXY(i, p.phase, 1); pm.setColorAt(i, tmpC.set(p.color)); dummy.position.set(p.x, p.y - 0.35, p.z); dummy.rotation.set(0, p.yaw, 0); dummy.scale.set(0.5, 0.7, 1); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); });
      pm.instanceMatrix.needsUpdate = true; if (pm.instanceColor) pm.instanceColor.needsUpdate = true; penPhase.needsUpdate = true;
    }
    if (lm) {
      lan.forEach((l, i) => { lm.setColorAt(i, tmpC.set(l.color)); dummy.position.set(l.x, l.y, l.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); lm.setMatrixAt(i, dummy.matrix); });
      lm.instanceMatrix.needsUpdate = true; if (lm.instanceColor) lm.instanceColor.needsUpdate = true;
    }
  }, [pen, lan, penGeo, penPhase]);

  useFrame(() => {
    const g = group.current; if (!g) return;
    g.visible = lifeState.festival;
    if (!g.visible) return;
    tickWind(penMat);
    lanMat.emissiveIntensity = lifeState.night * 2.2;
    // lanterns swing gently
    const lm = lanterns.current;
    if (lm) {
      const t = lifeState.t, w = lifeState.wind;
      for (let i = 0; i < lan.length; i++) { const l = lan[i]; dummy.position.set(l.x, l.y, l.z); dummy.rotation.set(Math.sin(t * 1.3 + l.phase) * 0.12 * w, 0, Math.sin(t * 1.7 + l.phase) * 0.1 * w); dummy.scale.setScalar(1); dummy.updateMatrix(); lm.setMatrixAt(i, dummy.matrix); }
      lm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={group} visible={false}>
      <lineSegments geometry={lineGeo} material={lineMat} frustumCulled={false} />
      <instancedMesh ref={pennants} args={[penGeo, penMat, Math.max(1, pen.length)]} frustumCulled={false} castShadow={false} />
      <instancedMesh ref={lanterns} args={[lanGeo, lanMat, Math.max(1, lan.length)]} frustumCulled={false} castShadow={false} />
    </group>
  );
}

/* ----------------------------------- stage ----------------------------------- */

function Stage() {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(() => buildGeo([
    { geo: box(9, 0.7, 4.5), color: "#8b5a3c", p: [0, 0.35, 0] },
    { geo: box(9.2, 0.12, 4.7), color: "#a8763e", p: [0, 0.76, 0] },
    { geo: cyl(0.1, 0.12, 4, 6), color: "#3a3330", p: [-4.3, 2.7, -2.0] },
    { geo: cyl(0.1, 0.12, 4, 6), color: "#3a3330", p: [4.3, 2.7, -2.0] },
    { geo: box(8.8, 0.1, 0.1), color: "#3a3330", p: [0, 4.6, -2.0] },
    { geo: box(0.9, 0.6, 0.6), color: "#2e2e33", p: [-3.6, 1.1, 1.4] },   // speaker
    { geo: box(0.9, 0.6, 0.6), color: "#2e2e33", p: [3.6, 1.1, 1.4] },
    { geo: cyl(0.03, 0.03, 1.5, 5), color: "#c9c3b5", p: [0, 1.55, 0.8] },  // mic stand
    { geo: box(0.4, 0.35, 0.3), color: "#2e2e33", p: [0, 0.98, -1.2] },   // stool
  ]), []);
  const banner = useMemo(() => whiteColors(new THREE.PlaneGeometry(1, 1, 8, 3)), []);
  const bannerMat = useMemo(() => windMaterial({ mode: 1, color: "#3c8ed6" }), []);
  const phase = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(2), 2), []);
  const bref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => { banner.setAttribute("aPhase", phase); phase.setXY(0, 0.3, 1); phase.needsUpdate = true; const m = bref.current; if (m) { dummy.position.set(0, 3.7, -2.0); dummy.rotation.set(0, 0, 0); dummy.scale.set(8.4, 1.6, 1); dummy.updateMatrix(); m.setMatrixAt(0, dummy.matrix); m.instanceMatrix.needsUpdate = true; } }, [banner, phase]);
  const lampMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#fff1c8", emissive: "#ffb347", emissiveIntensity: 0, roughness: 0.5 }), []);
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const g = ref.current; if (!g) return;
    g.visible = lifeState.festival;
    if (!g.visible) return;
    tickWind(bannerMat);
    // stage lamps come on after dark
    const n = lifeState.night;
    lampMat.emissiveIntensity = n * 2.5;
    if (light.current) light.current.intensity = n * 55;
  });
  return (
    <group ref={ref} position={[STAGE.x, squareY + 0.06, STAGE.z]} rotation={[0, STAGE.yaw, 0]} visible={false}>
      <mesh geometry={geo} material={vcMat()} castShadow receiveShadow />
      <instancedMesh ref={bref} args={[banner, bannerMat, 1]} frustumCulled={false} />
      <mesh position={[-4.3, 4.35, -2.0]} material={lampMat}><boxGeometry args={[0.35, 0.35, 0.35]} /></mesh>
      <mesh position={[4.3, 4.35, -2.0]} material={lampMat}><boxGeometry args={[0.35, 0.35, 0.35]} /></mesh>
      <pointLight ref={light} position={[0, 4.2, -1]} color="#ffb347" intensity={0} distance={26} decay={2} />
    </group>
  );
}

/* ---------------------------------- confetti ---------------------------------- */

const CONF_N = 220;
function Confetti() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.PlaneGeometry(0.16, 0.1), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: false, side: THREE.DoubleSide }), []);
  const ps = useMemo(() => { const r = srand(3); return Array.from({ length: CONF_N }, () => ({ x: SQ.x + (r() - 0.5) * 30, y: 4 + r() * 10, z: SQ.z + (r() - 0.5) * 30, vx: 0, vz: 0, ph: r() * 6.28, spin: 2 + r() * 4, alive: false })); }, []);
  useEffect(() => { const m = ref.current; if (!m) return; ps.forEach((_, i) => m.setColorAt(i, tmpC.set(FLAG_COLORS[i % FLAG_COLORS.length]))); if (m.instanceColor) m.instanceColor.needsUpdate = true; }, [ps]);
  useFrame((_, dt) => {
    const m = ref.current; if (!m) return;
    const S = lifeState;
    const on = S.festival && hourIn(S.hour, 20, 21.2) && !S.storm;
    m.visible = on;
    if (!on) { ps.forEach((p) => (p.alive = false)); return; }
    const t = S.t;
    for (let i = 0; i < CONF_N; i++) {
      const p = ps[i];
      if (!p.alive || p.y < terrainHeight(p.x, -p.z) + 0.05) {
        // relaunch from the stage / fountain area
        p.alive = true; p.x = SQ.x + (Math.random() - 0.5) * 12; p.z = SQ.z + (Math.random() - 0.5) * 14 + 3; p.y = 5 + Math.random() * 7;
        p.vx = (Math.random() - 0.5) * 2; p.vz = (Math.random() - 0.5) * 2;
      }
      p.y -= dt * (0.8 + Math.sin(t * 3 + p.ph) * 0.3);
      p.x += (p.vx + S.windDir.x * S.wind * 0.5 + Math.sin(t * 2.1 + p.ph) * 0.6) * dt;
      p.z += (p.vz + S.windDir.y * S.wind * 0.5 + Math.cos(t * 1.7 + p.ph) * 0.6) * dt;
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(t * p.spin + p.ph, t * p.spin * 0.7, p.ph); dummy.scale.setScalar(1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, CONF_N]} frustumCulled={false} />;
}

/* ---------------------------------- fireworks ---------------------------------- */

const BURSTS = 5, PER = 110;
const FW_VERT = `
attribute float aBurst; attribute vec3 aDir; attribute float aSeed;
uniform float uTime; uniform vec3 uOrigin[${BURSTS}]; uniform float uT0[${BURSTS}]; uniform vec3 uColor[${BURSTS}];
varying vec3 vC; varying float vA;
void main(){
  int b = int(aBurst + 0.5);
  vec3 o = uOrigin[b]; float t0 = uT0[b]; vec3 c = uColor[b];
  float age = uTime - t0;
  float life = 2.2;
  float k = clamp(age / life, 0.0, 1.0);
  float speed = 19.0 + aSeed * 12.0;
  vec3 p = o + aDir * speed * (1.0 - exp(-age * 1.6)) / 1.6 + vec3(0.0, -4.5 * age * age * 0.5, 0.0);
  vA = (age < 0.0 || age > life) ? 0.0 : (1.0 - k) * (0.6 + 0.4 * sin(age * 30.0 + aSeed * 50.0));
  vC = mix(c, vec3(1.0), 0.45 * exp(-age * 4.0)) * 1.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (5.0 + (1.0 - k) * 7.0) * (320.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const FW_FRAG = `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = (1.0 - smoothstep(0.3, 1.0, r)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }`;
const FW_COLORS = ["#ff6b4a", "#ffd766", "#7fd0ff", "#ff8fd1", "#b0ff7a", "#ffffff"];

function Fireworks() {
  const ref = useRef<THREE.Points>(null);
  const { geo, mat } = useMemo(() => {
    const r = srand(77);
    const N = BURSTS * PER;
    const burst = new Float32Array(N), dir = new Float32Array(N * 3), seed = new Float32Array(N), pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      burst[i] = Math.floor(i / PER); seed[i] = r();
      // even-ish sphere
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      dir[i * 3] = s * Math.cos(a); dir[i * 3 + 1] = u; dir[i * 3 + 2] = s * Math.sin(a);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aBurst", new THREE.BufferAttribute(burst, 1)); geo.setAttribute("aDir", new THREE.BufferAttribute(dir, 3)); geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(-15, 55, -320), 220);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOrigin: { value: Array.from({ length: BURSTS }, () => new THREE.Vector3(0, -100, 0)) }, uT0: { value: new Float32Array(BURSTS).fill(-100) }, uColor: { value: Array.from({ length: BURSTS }, () => new THREE.Color("#ffffff")) } },
      vertexShader: FW_VERT, fragmentShader: FW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    return { geo, mat };
  }, []);
  const next = useRef(0), slot = useRef(0);
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const p = ref.current; if (!p) return;
    const S = lifeState;
    const on = S.festival && hourIn(S.hour, 21, 22) && !S.storm;
    p.visible = on;
    if (!on) { if (light.current) light.current.intensity = 0; return; }
    mat.uniforms.uTime.value = S.t;
    if (S.t >= next.current) {
      next.current = S.t + 0.9 + Math.random() * 1.4;
      const i = slot.current; slot.current = (slot.current + 1) % BURSTS;
      (mat.uniforms.uOrigin.value as THREE.Vector3[])[i].set(-50 + Math.random() * 70, 46 + Math.random() * 26, -300 - Math.random() * 45);
      (mat.uniforms.uT0.value as Float32Array)[i] = S.t;
      (mat.uniforms.uColor.value as THREE.Color[])[i].set(FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)]);
    }
    // the freshest burst lights the harbour for a moment
    const i = (slot.current + BURSTS - 1) % BURSTS;
    const age = S.t - (mat.uniforms.uT0.value as Float32Array)[i];
    if (light.current) { light.current.position.copy((mat.uniforms.uOrigin.value as THREE.Vector3[])[i]); light.current.color.copy((mat.uniforms.uColor.value as THREE.Color[])[i]); light.current.intensity = Math.max(0, 1 - age / 0.8) * 16000; }
  });
  return (
    <>
      <points ref={ref} geometry={geo} material={mat} visible={false} />
      <pointLight ref={light} intensity={0} distance={160} decay={2} />
    </>
  );
}

/* ----------------------------------- bonfire ----------------------------------- */

const FIRE = { x: 48, z: -288 };
function Bonfire() {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(() => buildGeo([
    { geo: cyl(0.16, 0.18, 2.2, 5), color: "#5b3a29", p: [0, 0.5, 0], r: [0, 0, 1.1] },
    { geo: cyl(0.16, 0.18, 2.2, 5), color: "#6b4a30", p: [0, 0.5, 0], r: [0, 1.2, 1.1] },
    { geo: cyl(0.16, 0.18, 2.2, 5), color: "#4a2e1c", p: [0, 0.5, 0], r: [0, 2.3, 1.1] },
    { geo: cyl(0.14, 0.16, 1.8, 5), color: "#5b3a29", p: [0, 0.4, 0], r: [0, 3.5, 1.2] },
    { geo: cyl(1.6, 1.8, 0.2, 8), color: "#8f8a80", p: [0, 0.08, 0] },
  ]), []);
  const flame = useMemo(() => emitter("fire:bonfire", FIRE.x, terrainHeight(FIRE.x, -FIRE.z) + 0.6, FIRE.z, 4, 22, { size: 1.25, life: 1.2, rise: 2.6, spread: 0.55 }), []);
  const smoke = useMemo(() => emitter("smoke:bonfire", FIRE.x, terrainHeight(FIRE.x, -FIRE.z) + 2.4, FIRE.z, 0, 8, { size: 1.4, life: 6, rise: 1.3 }), []);
  const light = useRef<THREE.PointLight>(null);
  const near = useCull(ref, FIRE.x, FIRE.z, 220);
  useFrame(() => {
    const g = ref.current; if (!g) return;
    const S = lifeState;
    const on = S.festival && (S.hour >= 18.5 || S.hour < 2) && !S.storm;
    g.visible = on;
    flame.target = on && near.current ? 1 : 0; smoke.target = on && near.current ? 0.8 : 0;
    if (light.current) light.current.intensity = on ? (60 + Math.sin(S.t * 11) * 10 + Math.sin(S.t * 27) * 6) * Math.max(0.3, S.night) : 0;
  });
  return (
    <group ref={ref} position={[FIRE.x, terrainHeight(FIRE.x, -FIRE.z), FIRE.z]} visible={false}>
      <mesh geometry={geo} material={vcMat()} castShadow />
      <pointLight ref={light} position={[0, 1.6, 0]} color="#ff9a3c" intensity={0} distance={30} decay={2} />
    </group>
  );
}

export default function Festival({ L }: { L: TownLayout }) {
  // the square's paved deck sits at the placed y of the town_square "building"
  squareY = L.buildings.find((b) => b.loc.id === "town_square")?.y ?? squareY;
  return (
    <group>
      <Strings />
      <Stage />
      <Confetti />
      <Fireworks />
      <Bonfire />
    </group>
  );
}
