/**
 * The sea: one faceted plane with a custom shader — low-poly waves displaced
 * in the vertex stage, flat normals from screen-space derivatives, two-tone
 * colour by depth (sampled from the terrain into a vertex attribute), moving
 * procedural foam along the shore, sun/moon glints and a fresnel sky reflection.
 */
"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { terrainHeight, WATER_Y } from "../terrain";
import { sky } from "../palette";

const VERT = /* glsl */ `
uniform float uTime; uniform float uStorm;
attribute float aDepth;
varying vec3 vWorld; varying float vDepth; varying float vWave;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float t = uTime;
  float dpr = clamp(aDepth, 0.0, 6.0);
  float amp = (0.3 + 0.7 * smoothstep(0.0, 3.5, dpr)) * (1.0 + 1.8 * uStorm);
  float w = 0.0;
  w += sin(dot(p.xz, vec2(0.11, 0.07)) + t * 0.9) * 0.16;
  w += sin(dot(p.xz, vec2(-0.05, 0.14)) + t * 1.25) * 0.11;
  w += sin(dot(p.xz, vec2(0.23, 0.19)) + t * 2.1) * 0.05;
  w += sin(dot(p.xz, vec2(0.031, -0.024)) + t * 0.45) * 0.22;
  w *= amp;
  p.y += w;
  vWave = w;
  vDepth = aDepth;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime; uniform float uStorm; uniform float uNight;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunI;
uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uHorizon; uniform vec3 uTop; uniform vec3 uFoam;
varying vec3 vWorld; varying float vDepth; varying float vWave;
#include <common>
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  // flat facet normal
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  // small procedural ripple on top of the facet for glints
  float rip = vnoise(vWorld.xz * 0.8 + uTime * 0.35) - vnoise(vWorld.xz * 0.8 - uTime * 0.3 + 7.3);
  n = normalize(n + vec3(rip * 0.12, 0.0, rip * 0.1));

  vec3 V = normalize(cameraPosition - vWorld);
  float depth = max(vDepth, 0.0);
  float dT = smoothstep(0.0, 6.5, depth);
  vec3 base = mix(uShallow, uDeep, dT);
  // storm: greyer, darker sea
  base = mix(base, base * vec3(0.55, 0.6, 0.62) + vec3(0.08), uStorm * 0.8);

  // lighting: hemisphere + sun diffuse
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 skyCol = mix(uHorizon, uTop, 0.5);
  vec3 col = base * (0.55 + 0.45 * skyCol) + base * uSunColor * uSunI * ndl * 0.22;
  // fresnel reflection of the sky
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 refl = mix(uHorizon, uTop, 0.4 + 0.45 * clamp(n.y, 0.0, 1.0));
  // the sky reflected towards the sun carries the sun's colour (sunset glow path)
  float towardSun = pow(max(dot(reflect(-V, n), uSunDir), 0.0), 3.0);
  refl = mix(refl, uSunColor * 0.55 + uHorizon * 0.45, towardSun * 0.6 * (1.0 - uNight));
  col = mix(col, refl, 0.06 + 0.36 * fres);
  // glints
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(n, H), 0.0), mix(90.0, 260.0, uNight));
  col += uSunColor * spec * uSunI * mix(0.9, 2.2, uNight) * (1.0 - uStorm * 0.5);
  // sun / moon path glitter: broad low-power lobe
  col += uSunColor * pow(max(dot(n, H), 0.0), 8.0) * uSunI * 0.06;

  // foam: shoreline band + travelling lines
  float nz = vnoise(vWorld.xz * 0.35 + vec2(uTime * 0.12, -uTime * 0.09));
  float shore = 1.0 - smoothstep(0.02, 0.55 + 0.35 * nz, depth + vWave * 0.6);
  float lines = smoothstep(0.62, 0.9, sin(depth * 2.6 - uTime * 1.5 + nz * 3.0)) * smoothstep(0.1, 0.5, depth) * (1.0 - smoothstep(1.6, 4.5, depth));
  float crest = smoothstep(0.25, 0.42, vWave) * (0.25 + uStorm) * (1.0 - dT * 0.6);
  float foam = clamp(shore * 0.9 + lines * 0.55 + crest * 0.5, 0.0, 1.0);
  foam *= 0.6 + 0.4 * vnoise(vWorld.xz * 2.2 + uTime * 0.2);
  vec3 foamCol = uFoam * (0.7 + 0.3 * skyCol) * (1.0 - uNight * 0.78);
  col = mix(col, foamCol, foam);

  float alpha = mix(0.6, 0.96, smoothstep(0.0, 2.5, depth));
  alpha = max(alpha, fres * 0.9);
  alpha = mix(alpha, 1.0, foam);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const SHALLOW_DAY = new THREE.Color("#3fb4bf"), DEEP_DAY = new THREE.Color("#1a5f92");
const SHALLOW_NIGHT = new THREE.Color("#183a44"), DEEP_NIGHT = new THREE.Color("#0a1c33");
const FOAM = new THREE.Color("#f4f8f5");

function axis(lo: number, a: number, b: number, hi: number, fine: number, coarse: number): number[] {
  const xs: number[] = [];
  for (let v = lo; v < a; v += coarse) xs.push(v);
  for (let v = a; v <= b + 1e-6; v += fine) xs.push(v);
  for (let v = b + coarse; v <= hi + 1e-6; v += coarse) xs.push(v);
  return xs;
}

export function buildWaterGeometry(): THREE.BufferGeometry {
  const xs = axis(-1050, -150, 450, 1350, 4, 40);
  const ys = axis(-1050, -150, 450, 1350, 4, 40);
  const nx = xs.length, ny = ys.length;
  const pos = new Float32Array(nx * ny * 3), dep = new Float32Array(nx * ny);
  let k = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const mx = xs[i], my = ys[j];
    pos[k * 3] = mx; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = -my;
    dep[k] = WATER_Y - terrainHeight(mx, my);
    k++;
  }
  const idx: number[] = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    // skip cells fully buried under land (saves fill + sorting)
    if (dep[a] < -1.5 && dep[b] < -1.5 && dep[c] < -1.5 && dep[d] < -1.5) continue;
    if ((i + j) % 2 === 0) idx.push(a, b, c, b, d, c); else idx.push(a, d, c, a, b, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aDepth", new THREE.BufferAttribute(dep, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export default function Water() {
  const geo = useMemo(() => buildWaterGeometry(), []);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uStorm: { value: 0 }, uNight: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uSunI: { value: 1 },
      uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uFoam: { value: FOAM.clone() },
    }]),
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, fog: true, depthWrite: true,
  }), []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const u = mat.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uStorm.value = sky.storm;
    u.uNight.value = sky.night;
    (u.uSunDir.value as THREE.Vector3).copy(sky.sunDir);
    (u.uSunColor.value as THREE.Color).copy(sky.sun);
    u.uSunI.value = sky.moon ? 0.5 : Math.min(2.2, sky.sunI);
    (u.uShallow.value as THREE.Color).copy(SHALLOW_DAY).lerp(SHALLOW_NIGHT, sky.night).lerp(sky.horizon, 0.12 * (1 - sky.night));
    (u.uDeep.value as THREE.Color).copy(DEEP_DAY).lerp(DEEP_NIGHT, sky.night).lerp(sky.mid, 0.08);
    (u.uHorizon.value as THREE.Color).copy(sky.horizon);
    (u.uTop.value as THREE.Color).copy(sky.top);
  });
  return <mesh ref={ref} geometry={geo} material={mat} position={[0, WATER_Y, 0]} frustumCulled={false} renderOrder={2} />;
}
