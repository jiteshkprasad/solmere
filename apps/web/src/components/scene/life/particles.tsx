/**
 * Soft billboard particles (chimney smoke, kettle/café steam, fountain mist,
 * heat-haze dust). ONE instanced quad mesh, ≤ 300 quads, fully GPU-driven:
 * each quad's position/size/alpha is a function of time, its emitter and a
 * seed, so the CPU only touches the buffers when an emitter turns on/off
 * (every 0.5 s) or moves (the ship's funnel). One draw call whatever the count.
 */
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { lifeState } from "./state";
import { sky } from "../palette";

export const MAX_PARTICLES = 560;
export type ParticleKind = 0 | 1 | 2 | 3 | 4; // smoke, steam, mist, dust, fire

export interface Emitter {
  id: string; x: number; y: number; z: number; kind: ParticleKind;
  count: number; size: number; life: number; rise: number; spread: number;
  /** desired activity 0..1 (set by the owner) */
  target: number;
  /** current faded activity */
  cur: number;
  /** slice start in the particle buffer; -1 until allocated */
  first: number;
  moved: boolean;
}

const emitters: Emitter[] = [];
let used = 0;
let dirty = true;

const KIND_DEFAULTS: Record<ParticleKind, { size: number; life: number; rise: number; spread: number }> = {
  0: { size: 1.1, life: 7, rise: 1.15, spread: 0.35 },
  1: { size: 0.45, life: 2.4, rise: 0.9, spread: 0.2 },
  2: { size: 0.7, life: 2.2, rise: 0.35, spread: 1.6 },
  3: { size: 0.12, life: 7, rise: 0.05, spread: 7 },
  4: { size: 0.9, life: 1.1, rise: 2.4, spread: 0.55 },
};

/** Register (or fetch) an emitter. Safe to call from any life component's mount. */
export function emitter(id: string, x: number, y: number, z: number, kind: ParticleKind, count: number, o: Partial<Pick<Emitter, "size" | "life" | "rise" | "spread">> = {}): Emitter {
  let e = emitters.find((q) => q.id === id);
  if (e) return e;
  const d = KIND_DEFAULTS[kind];
  const c = Math.max(0, Math.min(count, MAX_PARTICLES - used));
  e = { id, x, y, z, kind, count: c, size: o.size ?? d.size, life: o.life ?? d.life, rise: o.rise ?? d.rise, spread: o.spread ?? d.spread, target: 0, cur: 0, first: used, moved: true };
  used += c;
  emitters.push(e);
  dirty = true;
  return e;
}
export function moveEmitter(e: Emitter, x: number, y: number, z: number) { e.x = x; e.y = y; e.z = z; e.moved = true; }
/** dev/report helper: how much of the quad pool the registered emitters take */
export function particleUsage() { return { used, max: MAX_PARTICLES, emitters: emitters.map((e) => ({ id: e.id, count: e.count, cur: e.cur })) }; }

const VERT = `
uniform float uTime; uniform vec2 uWindDir; uniform float uWind; uniform float uGust;
attribute vec3 aEmit; attribute float aSeed; attribute vec4 aParams; /* kind, life, size, rise */ attribute float aActive; attribute float aSpread;
varying float vAlpha; varying vec2 vUv; varying float vKind; varying float vAge;
#include <fog_pars_vertex>
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  vUv = uv; vKind = aParams.x;
  float life = aParams.y;
  float age = fract(uTime / life + aSeed);           // 0..1 along this quad's life
  float t = age * life;
  float s1 = hash(aSeed * 17.0), s2 = hash(aSeed * 31.0 + 1.0), s3 = hash(aSeed * 53.0 + 2.0);
  vec3 p = aEmit;
  // birth jitter (spread) — dust/mist spread wide, chimneys tight
  p.xz += (vec2(s1, s2) - 0.5) * 2.0 * aSpread;
  // rise + wind drift (smoke bends over with the wind; dust barely rises)
  float windK = aParams.x == 3.0 ? 0.6 : aParams.x == 2.0 ? 0.3 : aParams.x == 4.0 ? 0.15 : 0.9;
  p.y += aParams.w * t * (aParams.x == 0.0 ? (1.0 - t * 0.04) : 1.0);
  p.xz += uWindDir * (uWind * windK) * t * (0.6 + 0.4 * age);
  // lazy wobble
  p.x += sin(t * 1.3 + s3 * 6.28) * 0.25 * age;
  p.z += cos(t * 1.1 + s1 * 6.28) * 0.25 * age;
  if (aParams.x == 3.0) { p.y += sin(t * 0.7 + s2 * 6.28) * 0.6; }
  float grow = aParams.x == 0.0 ? (0.35 + age * 1.9) : aParams.x == 1.0 ? (0.5 + age * 1.2) : aParams.x == 2.0 ? (0.6 + age * 0.8) : aParams.x == 4.0 ? (1.1 - age * 0.9) : 1.0;
  float size = aParams.z * grow;
  // fade in fast, out slow; steam and mist are short and bright
  float fade = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age));
  if (aParams.x == 4.0) fade = 1.0 - smoothstep(0.3, 1.0, age);
  vAlpha = fade * aActive; vAge = age;
  // camera-facing quad
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float rot = s3 * 6.28 + t * (0.3 + s1 * 0.4) * (aParams.x == 0.0 ? 1.0 : 0.0);
  vec2 q = vec2(position.x * cos(rot) - position.y * sin(rot), position.x * sin(rot) + position.y * cos(rot));
  vec3 world = p + (right * q.x + up * q.y) * size;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = `
uniform vec3 uSmoke; uniform vec3 uSteam; uniform vec3 uMist; uniform vec3 uDust; uniform float uNight;
varying float vAlpha; varying vec2 vUv; varying float vKind; varying float vAge;
#include <fog_pars_fragment>
void main(){
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float a = (1.0 - smoothstep(0.35, 1.0, r));
  a *= a;
  vec3 c = vKind == 0.0 ? uSmoke : vKind == 1.0 ? uSteam : vKind == 2.0 ? uMist : vKind == 4.0 ? mix(vec3(1.0, 0.85, 0.35), vec3(0.9, 0.2, 0.05), vAge) : uDust;
  float k = vKind == 0.0 ? 0.7 : vKind == 1.0 ? 0.6 : vKind == 2.0 ? 0.35 : vKind == 4.0 ? 0.95 : 0.5;
  if (vKind == 4.0) a = 1.0 - smoothstep(0.15, 0.9, r);
  gl_FragColor = vec4(c, a * vAlpha * k);
  #include <fog_fragment>
}`;

const _smoke = new THREE.Color(), _steam = new THREE.Color();
const SMOKE_DAY = new THREE.Color("#a3a9b2"), SMOKE_NIGHT = new THREE.Color("#3c4252"), WHITE = new THREE.Color("#ffffff"), NIGHT_WHITE = new THREE.Color("#7c8296");

export default function Particles() {
  const mesh = useRef<THREE.Mesh>(null);
  const { geo, mat, attrs } = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
    const N = MAX_PARTICLES;
    const attrs = {
      emit: new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3),
      seed: new THREE.InstancedBufferAttribute(new Float32Array(N), 1),
      params: new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4),
      active: new THREE.InstancedBufferAttribute(new Float32Array(N), 1),
      spread: new THREE.InstancedBufferAttribute(new Float32Array(N), 1),
    };
    // unallocated slots must still have a non-zero life (life 0 → NaN in the shader) and zero size
    for (let i = 0; i < N; i++) { attrs.seed.setX(i, Math.random()); attrs.emit.setXYZ(i, 0, -50, 0); attrs.params.setXYZW(i, 0, 1, 0, 0); }
    attrs.active.setUsage(THREE.DynamicDrawUsage); attrs.emit.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aEmit", attrs.emit); geo.setAttribute("aSeed", attrs.seed); geo.setAttribute("aParams", attrs.params);
    geo.setAttribute("aActive", attrs.active); geo.setAttribute("aSpread", attrs.spread);
    geo.instanceCount = N;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(150, 10, -150), 600);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uWindDir: { value: new THREE.Vector2(1, 0) }, uWind: { value: 1 }, uGust: { value: 0 },
        uSmoke: { value: new THREE.Color("#b9c0c8") }, uSteam: { value: new THREE.Color("#ffffff") }, uMist: { value: new THREE.Color("#dff3ff") }, uDust: { value: new THREE.Color("#fff1c8") }, uNight: { value: 0 },
      }]),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    return { geo, mat, attrs };
  }, []);

  // sync emitter slices → attributes (allocation + activity fade) every 0.5 s
  const sync = useRef(0);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame((_, dt) => {
    const u = mat.uniforms;
    u.uTime.value = lifeState.t;
    u.uWindDir.value.copy(lifeState.windDir);
    u.uWind.value = lifeState.wind;
    u.uGust.value = lifeState.gust;
    _smoke.copy(SMOKE_DAY).lerp(SMOKE_NIGHT, sky.night).lerp(sky.horizon, 0.15);
    (u.uSmoke.value as THREE.Color).copy(_smoke);
    _steam.copy(WHITE).lerp(NIGHT_WHITE, sky.night);
    (u.uSteam.value as THREE.Color).copy(_steam);
    (u.uMist.value as THREE.Color).copy(_steam);
    u.uNight.value = sky.night;

    sync.current += dt;
    const paramsDirty = dirty;
    let emitDirty = false, activeDirty = false;
    if (sync.current >= 0.5 || dirty) {
      sync.current = 0;
      dirty = false;
      for (const e of emitters) {
        if (e.first < 0) continue;
        if (paramsDirty) {
          for (let i = 0; i < e.count; i++) {
            const k = e.first + i;
            attrs.params.setXYZW(k, e.kind, e.life * (0.8 + attrs.seed.getX(k) * 0.4), e.size, e.rise);
            attrs.spread.setX(k, e.spread);
          }
        }
        if (e.moved || paramsDirty) {
          e.moved = false; emitDirty = true;
          for (let i = 0; i < e.count; i++) attrs.emit.setXYZ(e.first + i, e.x, e.y, e.z);
        }
        // fade activity toward target: on in ~1 s, off over ~3 s
        const next = e.target > e.cur ? Math.min(e.target, e.cur + 0.5) : Math.max(e.target, e.cur - 0.17);
        if (next !== e.cur) {
          e.cur = next; activeDirty = true;
          for (let i = 0; i < e.count; i++) attrs.active.setX(e.first + i, next);
        }
      }
    } else {
      // moving emitters (the ship funnel) update every frame
      for (const e of emitters) if (e.moved && e.first >= 0) {
        e.moved = false; emitDirty = true;
        for (let i = 0; i < e.count; i++) attrs.emit.setXYZ(e.first + i, e.x, e.y, e.z);
      }
    }
    if (paramsDirty) { attrs.params.needsUpdate = true; attrs.spread.needsUpdate = true; }
    if (emitDirty) attrs.emit.needsUpdate = true;
    if (activeDirty) attrs.active.needsUpdate = true;
  });

  return <mesh ref={mesh} geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}
