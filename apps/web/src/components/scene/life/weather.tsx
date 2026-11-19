/**
 * Weather + event props driven by snapshot.activeWorldEvents:
 *   storm      rain streaks (GPU, ≤ 4000 instances in a box that follows the camera),
 *              ground splashes, lightning (point light + lifeState.lightning), the
 *              lighthouse "foghorn" pulse; lifeState.wetness ramps for the env agent
 *   heatwave   a shimmering haze band over the hill fields (dust motes live in Particles)
 *   illness    the clinic lamp blinks
 *   big_catch  full fish crates stacked on the pier;   ship_visit  cargo crates by the berth
 *   open_mic   a warm lantern outside the Drowned Anchor
 */
"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { terrainHeight } from "../terrain";
import { sky } from "../palette";
import { buildGeo, box, vcMat, dummy, tmpC, hideInstance, srand } from "./util";
import { lifeState, hourIn } from "./state";

export const TAVERN_LANTERN = { x: 174.6, y: terrainHeight(180, 190) + 2.9, z: -191.8 };
const CLINIC_LAMP = { x: 114.4, y: terrainHeight(110, 130) + 3.5, z: -130 };
const LIGHTHOUSE_LAMP = { x: 10, y: terrainHeight(10, 295) + 13.5, z: -295 };

/* ------------------------------------ rain ------------------------------------ */

const RAIN_N = 3600, RAIN_BOX = 90, RAIN_H = 55;
const RAIN_VERT = `
uniform vec3 uCenter; uniform float uTime; uniform vec2 uWind; uniform float uOn;
attribute vec3 aOff; varying float vA;
void main(){
  float fall = 24.0;
  float y = mod(aOff.y * ${RAIN_H}.0 - uTime * fall, ${RAIN_H}.0) - ${RAIN_H}.0 * 0.7;
  vec3 p = uCenter + vec3((aOff.x - 0.5) * ${RAIN_BOX}.0, y, (aOff.z - 0.5) * ${RAIN_BOX}.0);
  // streaks lean with the wind and drift along it
  vec3 lean = normalize(vec3(uWind.x * 0.35, -1.0, uWind.y * 0.35));
  p += vec3(uWind.x, 0.0, uWind.y) * (-y) * 0.35;
  // camera-facing thin quad along the streak direction
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 side = normalize(cross(lean, camRight)); side = normalize(cross(side, lean));
  float len = 0.7 + fract(aOff.x * 7.31) * 0.6;
  vec3 world = p + lean * (-position.y) * len + side * position.x * 0.035;
  float r = length(p.xz - uCenter.xz) / (${RAIN_BOX}.0 * 0.5);
  vA = uOn * (1.0 - smoothstep(0.7, 1.0, r));
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const RAIN_FRAG = `uniform vec3 uColor; varying float vA; void main(){ if (vA < 0.02) discard; gl_FragColor = vec4(uColor, vA * 0.42); }`;

function Rain() {
  const { geo, mat } = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.attributes.position = base.attributes.position;
    const off = new Float32Array(RAIN_N * 3);
    const r = srand(1234);
    for (let i = 0; i < RAIN_N * 3; i++) off[i] = r();
    geo.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 3));
    geo.instanceCount = RAIN_N;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({ uniforms: { uCenter: { value: new THREE.Vector3() }, uTime: { value: 0 }, uWind: { value: new THREE.Vector2() }, uOn: { value: 0 }, uColor: { value: new THREE.Color("#dbe6f2") } }, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    return { geo, mat };
  }, []);
  const ref = useRef<THREE.Mesh>(null);
  const on = useRef(0);
  useFrame((_, dt) => {
    const S = lifeState;
    on.current += ((S.storm ? 1 : 0) - on.current) * Math.min(1, dt * 0.4);
    const m = ref.current; if (!m) return;
    m.visible = on.current > 0.02;
    if (!m.visible) return;
    const u = mat.uniforms;
    // the rain box sits between the camera and what it looks at, so streaks fill the view
    const k = Math.min(1, 40 / Math.max(1, S.cam.distanceTo(S.focus)));
    (u.uCenter.value as THREE.Vector3).set(S.cam.x + (S.focus.x - S.cam.x) * k, S.cam.y + (S.focus.y - S.cam.y) * k * 0.6, S.cam.z + (S.focus.z - S.cam.z) * k);
    u.uTime.value = S.t;
    (u.uWind.value as THREE.Vector2).copy(S.windDir).multiplyScalar(S.wind);
    u.uOn.value = on.current;
    (u.uColor.value as THREE.Color).copy(sky.horizon).lerp(WHITE, 0.6).multiplyScalar(1 - sky.night * 0.5);
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />;
}
const WHITE = new THREE.Color("#ffffff");

/* ---------------------------------- splashes ---------------------------------- */

const SPLASH_N = 160;
function Splashes() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => { const g = new THREE.RingGeometry(0.12, 0.2, 6); g.rotateX(-Math.PI / 2); return g; }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const st = useMemo(() => Array.from({ length: SPLASH_N }, () => ({ x: 0, y: 0, z: 0, t: Math.random() * 0.4 })), []);
  useFrame((_, dt) => {
    const m = ref.current; if (!m) return;
    const S = lifeState;
    m.visible = S.storm && S.wetness > 0.05;
    if (!m.visible) return;
    const fx = S.focus.x, fz = S.focus.z;
    for (let i = 0; i < SPLASH_N; i++) {
      const s = st[i];
      s.t += dt;
      if (s.t > 0.32) { s.t = 0; s.x = fx + (Math.random() - 0.5) * 44; s.z = fz + (Math.random() - 0.5) * 44; s.y = terrainHeight(s.x, -s.z) + 0.04; }
      const k = s.t / 0.32;
      dummy.position.set(s.x, s.y + k * 0.15, s.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.5 + k * 1.6); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      const a = (1 - k) * 0.8;
      m.setColorAt(i, tmpC.set(a, a, a));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, SPLASH_N]} frustumCulled={false} />;
}

/* ---------------------------------- lightning --------------------------------- */

/**
 * A strike is three things at once: a point light out over the sea (the bright
 * source), a hemisphere-light spike (everything in town catches the flash for a
 * frame or two) and an additive dome over the sky so the sky itself goes white.
 * The dome is the upper hemisphere only, so the ground keeps its own shading.
 */
function Lightning() {
  const light = useRef<THREE.PointLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const dome = useRef<THREE.Mesh>(null);
  const domeGeo = useMemo(() => new THREE.SphereGeometry(900, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.52), []);
  const domeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e8f0ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false }), []);
  const seat = useRef({ x: 0, z: -420, was: 0 });
  useFrame(() => {
    const l = light.current; if (!l) return;
    const S = lifeState;
    if (S.lightning > 0 && seat.current.was === 0) { seat.current.x = -80 + Math.random() * 260; seat.current.z = -520 + Math.random() * 200; }
    seat.current.was = S.lightning;
    l.position.set(seat.current.x, 140, seat.current.z);
    l.intensity = S.lightning * 320000;
    if (hemi.current) hemi.current.intensity = S.lightning * 2.6;
    const d = dome.current;
    if (d) {
      d.visible = S.lightning > 0.01;
      d.position.copy(S.cam);
      domeMat.opacity = S.lightning * 0.5;
    }
  });
  return (
    <>
      <pointLight ref={light} color="#dfe8ff" intensity={0} distance={900} decay={2} />
      <hemisphereLight ref={hemi} color="#e6efff" groundColor="#9fb0c8" intensity={0} />
      <mesh ref={dome} geometry={domeGeo} material={domeMat} visible={false} frustumCulled={false} renderOrder={20} />
    </>
  );
}

/* --------------------------- lamps: clinic, tavern, foghorn --------------------------- */

function Lamps() {
  const clinic = useRef<THREE.Mesh>(null);
  const clinicL = useRef<THREE.PointLight>(null);
  const tavern = useRef<THREE.Group>(null);
  const tavernL = useRef<THREE.PointLight>(null);
  const horn = useRef<THREE.Mesh>(null);
  const clinicMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f4f4f4", emissive: "#ff3b3b", emissiveIntensity: 0, roughness: 0.4 }), []);
  const lanternMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f2c318", emissive: "#ffb347", emissiveIntensity: 0, roughness: 0.5 }), []);
  const hornMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff2b0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  const lanternGeo = useMemo(() => buildGeo([
    { geo: box(0.06, 0.06, 0.9), color: "#2e2e33", p: [0, 0, 0.45] },
    { geo: box(0.36, 0.5, 0.36), color: "#2e2e33", p: [0, -0.35, 0.9] },
  ]), []);
  useFrame(() => {
    const S = lifeState, t = S.t;
    // clinic: slow red blink while the fever is on
    const ill = S.illness ? (Math.sin(t * 3.5) > 0.2 ? 1 : 0.1) : 0;
    clinicMat.emissiveIntensity = ill * 2.2;
    if (clinicL.current) clinicL.current.intensity = ill * 30;
    if (clinic.current) clinic.current.visible = S.illness;
    // tavern lantern: open-mic evenings
    const mic = S.openMic && hourIn(S.hour, 18.5, 1.5) ? 1 : 0;
    const flick = mic * (0.85 + Math.sin(t * 9.1) * 0.08 + Math.sin(t * 23.7) * 0.05);
    lanternMat.emissiveIntensity = flick * (0.4 + S.night * 2.4);
    if (tavernL.current) tavernL.current.intensity = flick * S.night * 70;
    if (tavern.current) tavern.current.visible = S.openMic;
    // foghorn: the lighthouse lamp pulses every 8 s during a storm
    const ph = t % 8;
    const pulse = S.storm && ph < 1.6 ? Math.sin((ph / 1.6) * Math.PI) : 0;
    hornMat.opacity = pulse * 0.55;
    if (horn.current) { horn.current.visible = pulse > 0.01; horn.current.scale.setScalar(3 + pulse * 3); }
  });
  return (
    <group>
      <mesh ref={clinic} position={[CLINIC_LAMP.x, CLINIC_LAMP.y, CLINIC_LAMP.z]} material={clinicMat} visible={false}>
        <sphereGeometry args={[0.22, 8, 6]} />
      </mesh>
      <pointLight ref={clinicL} position={[CLINIC_LAMP.x + 1, CLINIC_LAMP.y, CLINIC_LAMP.z]} color="#ff5a5a" intensity={0} distance={14} decay={2} />
      <group ref={tavern} position={[TAVERN_LANTERN.x + 0.9, TAVERN_LANTERN.y + 0.5, TAVERN_LANTERN.z]} rotation={[0, -Math.PI / 2, 0]} visible={false}>
        <mesh geometry={lanternGeo} material={vcMat()} />
        <mesh position={[0, -0.35, 0.9]} material={lanternMat}><boxGeometry args={[0.28, 0.36, 0.28]} /></mesh>
      </group>
      <pointLight ref={tavernL} position={[TAVERN_LANTERN.x - 0.6, TAVERN_LANTERN.y, TAVERN_LANTERN.z]} color="#ffb347" intensity={0} distance={22} decay={2} />
      <mesh ref={horn} position={[LIGHTHOUSE_LAMP.x, LIGHTHOUSE_LAMP.y, LIGHTHOUSE_LAMP.z]} material={hornMat} visible={false}>
        <sphereGeometry args={[1, 10, 8]} />
      </mesh>
    </group>
  );
}

/* --------------------------------- pier crates --------------------------------- */

const CRATE_N = 24;
function Crates() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => buildGeo([
    { geo: box(1, 0.8, 1), color: "#a8763e" },
    { geo: box(1.04, 0.1, 1.04), color: "#8b5a3c", p: [0, 0.3, 0] },
    { geo: box(0.86, 0.16, 0.86), color: "#9fc4d8", p: [0, 0.44, 0] },
  ]), []);
  const spots = useMemo(() => {
    const r = srand(88);
    const out: { x: number; y: number; z: number; ry: number; kind: 0 | 1 }[] = [];
    // big_catch: landed fish, stacked two high on the inshore half of the pier deck (y 0.75)
    for (let i = 0; i < 12; i++) out.push({ x: 8.5 - Math.floor(i / 2) * 1.35, y: 0.75 + 0.4 + (i >= 8 ? 0.8 : 0), z: -277 + (i % 2 ? 1.15 : -1.15) + (r() - 0.5) * 0.2, ry: (r() - 0.5) * 0.4, kind: 0 });
    // ship_visit: cargo landed by the berth at the pier head (x = −34)
    for (let i = 0; i < 12; i++) out.push({ x: -21 - Math.floor(i / 3) * 1.35, y: 0.75 + 0.4 + (i >= 9 ? 0.8 : 0), z: -277 + ((i % 3) - 1) * 1.2, ry: (r() - 0.5) * 0.3, kind: 1 });
    return out;
  }, []);
  const shown = useRef(-1);
  useFrame(() => {
    const m = ref.current; if (!m) return;
    const S = lifeState;
    const key = (S.bigCatch ? 1 : 0) | (S.shipVisit ? 2 : 0);
    if (key === shown.current) return;
    shown.current = key;
    spots.forEach((s, i) => {
      const on = s.kind === 0 ? S.bigCatch : S.shipVisit;
      if (!on) { hideInstance(m, i); return; }
      dummy.position.set(s.x, s.y, s.z); dummy.rotation.set(0, s.ry, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.visible = key !== 0;
  });
  return <instancedMesh ref={ref} args={[geo, vcMat(), CRATE_N]} castShadow frustumCulled={false} />;
}

/* ---------------------------------- heat haze ---------------------------------- */

const HAZE_VERT = `varying vec2 vUv; uniform float uTime; void main(){ vUv = uv; vec3 p = position; p.y += sin(uv.x * 40.0 + uTime * 3.0) * 0.15 + sin(uv.x * 17.0 - uTime * 2.1) * 0.2; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const HAZE_FRAG = `varying vec2 vUv; uniform float uOn; uniform float uTime; void main(){ float band = smoothstep(0.0, 0.5, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y)); float n = 0.6 + 0.4 * sin(vUv.x * 60.0 + uTime * 2.0) * sin(vUv.x * 23.0 - uTime * 1.3); float edge = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x)); gl_FragColor = vec4(1.0, 0.95, 0.8, band * n * edge * uOn * 0.16); }`;
function Haze() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({ uniforms: { uOn: { value: 0 }, uTime: { value: 0 } }, vertexShader: HAZE_VERT, fragmentShader: HAZE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
  const on = useRef(0);
  useFrame((_, dt) => {
    const S = lifeState;
    const want = S.heatwave && hourIn(S.hour, 10, 18) ? 1 : 0;
    on.current += (want - on.current) * Math.min(1, dt * 0.5);
    mat.uniforms.uOn.value = on.current; mat.uniforms.uTime.value = S.t;
    const m = ref.current; if (!m) return;
    m.visible = on.current > 0.02;
    // a horizontal shimmer sheet over the hill fields that always faces the camera's yaw
    m.rotation.y = Math.atan2(S.cam.x - 235, S.cam.z + 40);
  });
  return (
    <mesh ref={ref} position={[235, terrainHeight(235, 40) + 1.4, -40]} material={mat} visible={false} frustumCulled={false}>
      <planeGeometry args={[120, 2.2, 60, 1]} />
    </mesh>
  );
}

/* ------------------------------------ root ------------------------------------ */

export default function Weather() {
  return (
    <group>
      <Rain />
      <Splashes />
      <Lightning />
      <Lamps />
      <Crates />
      <Haze />
    </group>
  );
}
