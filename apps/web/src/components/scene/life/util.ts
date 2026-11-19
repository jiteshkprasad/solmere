/**
 * Small toolkit shared by the life systems: merged vertex-coloured low-poly
 * geometry builders (one draw call per creature/boat), a wind-wave vertex
 * injector for MeshStandardMaterial (flags, laundry, wings) and a culling hook.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { lifeState, nearCamera } from "./state";

/* ------------------------------ geometry building ------------------------------ */

export interface Part {
  geo: THREE.BufferGeometry;
  color: string;
  p?: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number] | number;
}

const _c = new THREE.Color();
/** Merge parts into a single flat-shaded, vertex-coloured geometry. */
export function buildGeo(parts: Part[]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  for (const pt of parts) {
    // non-indexed so flat shading gets its own normals per face; strip attributes that would break the merge
    const g = pt.geo.index ? pt.geo.toNonIndexed() : pt.geo.clone();
    if (g.attributes.uv) g.deleteAttribute("uv");
    const s = pt.s ?? 1;
    const sx = typeof s === "number" ? s : s[0], sy = typeof s === "number" ? s : s[1], sz = typeof s === "number" ? s : s[2];
    g.scale(sx, sy, sz);
    if (pt.r) { g.rotateX(pt.r[0]); g.rotateY(pt.r[1]); g.rotateZ(pt.r[2]); }
    if (pt.p) g.translate(pt.p[0], pt.p[1], pt.p[2]);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.set(pt.color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.deleteAttribute("normal");
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  merged.computeVertexNormals();
  for (const g of geos) g.dispose();
  return merged;
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);
export const sphere = (r: number) => new THREE.IcosahedronGeometry(r, 0);
export const tetra = (r: number) => new THREE.TetrahedronGeometry(r);

let _vcMat: THREE.MeshStandardMaterial | null = null;
/** the one material every merged vertex-coloured creature/boat shares */
export function vcMat(): THREE.MeshStandardMaterial {
  return (_vcMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 }));
}

/* ------------------------------- wind-wave material ------------------------------ */

/**
 * MeshStandardMaterial whose vertices ripple with the wind. Per-instance phase
 * and amplitude come from the `aPhase` instanced attribute (vec2). `mode`
 * 0 = cloth pinned on its -x edge (flags), 1 = cloth pinned along its top edge
 * (laundry, bunting), 2 = bird wings (vertices with |x| > 0.08 flap about the
 * body), 3 = walking gait for four-legged creatures (vertices below `legY`
 * swing fore/aft; the body bobs; aPhase.y = 0 when standing).
 *
 * Every wind material compiles to ONE shared program (mode/legY are uniforms,
 * vertex colours always on, double-sided) — shader compiles are the most
 * expensive thing a low-end GPU does at start-up. Geometries without a
 * `color` attribute must get one via `whiteColors()`.
 */
export function windMaterial(opts: { mode: 0 | 1 | 2 | 3; color?: string; emissive?: string; legY?: number }) {
  const m = new THREE.MeshStandardMaterial({
    color: opts.color ?? "#ffffff", side: THREE.DoubleSide, roughness: 0.9, flatShading: true,
    vertexColors: true, emissive: opts.emissive ?? "#000000", emissiveIntensity: 0,
  });
  const u = { uTime: { value: 0 }, uWind: { value: 1 }, uWindDir: { value: new THREE.Vector2(1, 0) }, uLegY: { value: opts.legY ?? 0.3 }, uMode: { value: opts.mode } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
        uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform float uLegY; uniform float uMode; attribute vec2 aPhase;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          float ph = aPhase.x; float amp = aPhase.y;
          if (uMode < 0.5) {
            // flag: pinned at x = -0.5 (pole), waves grow toward the fly end
            float k = clamp(position.x + 0.5, 0.0, 1.0);
            float w = sin(position.x * 6.0 - uTime * (4.0 + uWind * 3.0) + ph) * 0.12 * k * (0.5 + uWind * 0.5)
                    + sin(position.x * 11.0 - uTime * 7.0 + ph * 1.7) * 0.04 * k;
            transformed.z += w * amp;
            transformed.y += sin(position.x * 4.0 - uTime * 3.0 + ph) * 0.03 * k * amp;
          } else if (uMode < 1.5) {
            // hanging cloth: pinned at the top edge (y = +0.5), swings in the wind lower down
            float k = clamp(0.5 - position.y, 0.0, 1.0);
            float sway = sin(uTime * (1.6 + uWind * 0.8) + ph) * (0.18 + uWind * 0.12) * k;
            transformed.z += (sway + sin(position.x * 8.0 + uTime * 5.0 + ph) * 0.03 * k) * amp;
            transformed.x += sin(uTime * 1.1 + ph * 0.7) * 0.05 * k * amp;
          } else if (uMode < 2.5) {
            // wings: flap about the body line; amp = per-bird flap amplitude (0 when perched/gliding)
            float wing = step(0.08, abs(position.x));
            float flap = sin(uTime * uWind + ph) * 0.6 * amp;
            transformed.y += wing * abs(position.x) * flap;
          } else {
            // gait: legs (below legY) swing in diagonal pairs, body bobs; uWind = stride frequency
            float legY = uLegY;
            float leg = step(position.y, legY) * clamp((legY - position.y) / legY, 0.0, 1.0);
            float pair = (step(0.0, position.x) * 2.0 - 1.0) * (step(0.0, position.z) * 2.0 - 1.0);
            float sw = sin(uTime * uWind + ph) * pair * amp;
            transformed.z += leg * sw * legY * 0.9;
            transformed.y += leg * max(0.0, sw) * legY * 0.25 + (1.0 - leg) * abs(sin(uTime * uWind + ph)) * 0.03 * amp;
          }
        }`);
  };
  // one stable key → one program for every wind material
  m.customProgramCacheKey = () => "life-wind";
  return Object.assign(m, { uniforms: u });
}
export type WindMaterial = ReturnType<typeof windMaterial>;

export function tickWind(m: WindMaterial, flapAmp?: number) {
  m.uniforms.uTime.value = lifeState.t;
  m.uniforms.uWind.value = flapAmp ?? Math.min(2.5, lifeState.wind);
  m.uniforms.uWindDir.value.copy(lifeState.windDir);
}

/** give a plain geometry a white `color` attribute so it can share the vertex-coloured wind program */
export function whiteColors<T extends THREE.BufferGeometry>(g: T): T {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3).fill(1);
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}
/* ------------------------------- instancing helpers ------------------------------ */

export const dummy = new THREE.Object3D();
export const tmpV = new THREE.Vector3();
export const tmpV2 = new THREE.Vector3();
export const tmpQ = new THREE.Quaternion();
export const tmpC = new THREE.Color();

/** write a y-up transform at (x,y,z) with yaw, uniform scale s into instance i */
export function setInstance(m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw = 0, s = 1, pitch = 0, roll = 0) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(pitch, yaw, roll);
  dummy.scale.set(s, s, s);
  dummy.updateMatrix();
  m.setMatrixAt(i, dummy.matrix);
}

/** hide instance i by collapsing it */
export function hideInstance(m: THREE.InstancedMesh, i: number) {
  dummy.position.set(0, -100, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.0001, 0.0001, 0.0001); dummy.updateMatrix();
  m.setMatrixAt(i, dummy.matrix);
}

/* --------------------------------- culling hook --------------------------------- */

/**
 * Cheap distance culling: every 0.5 s compare the camera to (x,z) and toggle
 * `group.visible`. Returns a ref holding the latest "near" flag so useFrame
 * bodies can early-out.
 */
export function useCull(group: React.RefObject<THREE.Object3D | null>, x: number, z: number, radius: number) {
  const near = useRef(true);
  useEffect(() => {
    const check = () => {
      const n = nearCamera(x, z, radius);
      near.current = n;
      if (group.current) group.current.visible = n;
    };
    check();
    const h = window.setInterval(check, 500);
    return () => window.clearInterval(h);
  }, [group, x, z, radius]);
  return near;
}

/** deterministic tiny RNG */
export function srand(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
