/**
 * Low-poly geometry toolkit for the character builder.
 *
 * Everything returns NON-indexed BufferGeometry (one colour per facet) with a
 * `position` attribute only; the Assembler paints facets, tags them with a
 * bone (skinIndex/skinWeight) and merges everything into one skinned mesh.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type V3 = [number, number, number];
export interface Xf { p?: V3; r?: V3; s?: number | V3 }
export type ColorFn = (cx: number, cy: number, cz: number, face: number, n: THREE.Vector3) => string | THREE.Color;
export type Paint = string | THREE.Color | ColorFn;

const _c = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

/* ------------------------------------------------------------------ transforms */

export function xf(g: THREE.BufferGeometry, t?: Xf): THREE.BufferGeometry {
  if (!t) return g;
  _p.set(...(t.p ?? [0, 0, 0]));
  _e.set(...(t.r ?? [0, 0, 0]));
  _q.setFromEuler(_e);
  if (typeof t.s === "number") _s.setScalar(t.s); else _s.set(...(t.s ?? [1, 1, 1]));
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return g;
}

function raw(positions: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return g;
}
function ni(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== "position") out.deleteAttribute(k);
  if (out !== g) g.dispose();
  return out;
}

/* ------------------------------------------------------------------ primitives */

export interface Ring { y: number; w: number; d: number; cut?: number; x?: number; z?: number }

/** octagonal ring polygon (8 points, CCW seen from above) */
function ringPts(r: Ring): number[][] {
  const hw = r.w / 2, hd = r.d / 2, c = Math.max(0.02, Math.min(0.49, r.cut ?? 0.3));
  const cw = r.w * c, cd = r.d * c, ox = r.x ?? 0, oz = r.z ?? 0;
  return [
    [-hw + cw, hd], [hw - cw, hd], [hw, hd - cd], [hw, -hd + cd], [hw - cw, -hd], [-hw + cw, -hd], [-hw, -hd + cd], [-hw, hd - cd],
  ].map(([x, z]) => [x + ox, r.y, z + oz]);
}

/**
 * Lofted octagonal tube through rings (ascending y). The workhorse: torsos, limbs,
 * heads, hats, skirts. Caps are fans from the ring centre.
 */
export function loft(rings: Ring[], opts: { top?: boolean; bottom?: boolean } = {}): THREE.BufferGeometry {
  const P: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  const R = rings.map(ringPts);
  for (let i = 0; i < R.length - 1; i++) {
    const A = R[i], B = R[i + 1];
    for (let k = 0; k < 8; k++) {
      const k1 = (k + 1) % 8;
      tri(A[k], A[k1], B[k1]); tri(A[k], B[k1], B[k]);
    }
  }
  if (opts.bottom !== false) { const A = R[0], c = [rings[0].x ?? 0, rings[0].y, rings[0].z ?? 0]; for (let k = 0; k < 8; k++) tri(c, A[(k + 1) % 8], A[k]); }
  if (opts.top !== false) { const A = R[R.length - 1], r = rings[rings.length - 1], c = [r.x ?? 0, r.y, r.z ?? 0]; for (let k = 0; k < 8; k++) tri(c, A[k], A[(k + 1) % 8]); }
  return raw(P);
}

/** bevelled box centred at origin (chunky slab with chamfered edges) */
export function bbox(w: number, h: number, d: number, bevel = Math.min(w, h, d) * 0.18): THREE.BufferGeometry {
  const b = Math.min(bevel, Math.min(w, h, d) * 0.45);
  return loft([
    { y: -h / 2, w: w - 2 * b, d: d - 2 * b, cut: 0.02 },
    { y: -h / 2 + b, w, d, cut: b / Math.min(w, d) },
    { y: h / 2 - b, w, d, cut: b / Math.min(w, d) },
    { y: h / 2, w: w - 2 * b, d: d - 2 * b, cut: 0.02 },
  ]);
}
/** plain box centred at origin */
export function box(w: number, h: number, d: number): THREE.BufferGeometry { return ni(new THREE.BoxGeometry(w, h, d)); }
export function sphere(r: number, ws = 8, hs = 6): THREE.BufferGeometry { return ni(new THREE.SphereGeometry(r, ws, hs)); }
export function ico(r: number, detail = 0): THREE.BufferGeometry { return ni(new THREE.IcosahedronGeometry(r, detail)); }
/** cylinder from y=0 to y=h */
export function cyl(rTop: number, rBot: number, h: number, seg = 8): THREE.BufferGeometry { const g = new THREE.CylinderGeometry(rTop, rBot, h, seg); g.translate(0, h / 2, 0); return ni(g); }
export function cone(r: number, h: number, seg = 8): THREE.BufferGeometry { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); return ni(g); }
export function torus(r: number, tube: number, seg = 8, tseg = 5): THREE.BufferGeometry { return ni(new THREE.TorusGeometry(r, tube, tseg, seg)); }
/** lathe around y from a [radius, y] profile */
export function lathe(profile: [number, number][], seg = 10): THREE.BufferGeometry {
  return ni(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg));
}
/** extruded 2-D outline in the xy plane, depth along z (centred), optional bevel */
export function extrude(points: [number, number][], depth: number, bevel = 0): THREE.BufferGeometry {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -depth / 2);
  return ni(g);
}
/** polyline tube: a cylinder per segment (sharp joints, cheap) */
export function tube(points: V3[], r: number, seg = 5): THREE.BufferGeometry {
  const gs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    _a.set(...points[i]); _b.set(...points[i + 1]);
    const len = _a.distanceTo(_b); if (len < 1e-5) continue;
    const g = new THREE.CylinderGeometry(r, r, len, seg); g.translate(0, len / 2, 0);
    _n.subVectors(_b, _a).normalize();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _n);
    g.applyQuaternion(_q); g.translate(_a.x, _a.y, _a.z);
    gs.push(ni(g));
  }
  return gs.length ? (mergeGeometries(gs) as THREE.BufferGeometry) : raw([]);
}
/** flat wedge (nose, peaks): base w×d at y=0, apex at (0,h,apexZ) */
export function wedge(w: number, h: number, d: number, apexZ = 0): THREE.BufferGeometry {
  const A = [-w / 2, 0, d / 2], B = [w / 2, 0, d / 2], C = [w / 2, 0, -d / 2], D = [-w / 2, 0, -d / 2], T = [0, h, apexZ];
  const P: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => P.push(...a, ...b, ...c);
  tri(A, B, T); tri(B, C, T); tri(C, D, T); tri(D, A, T); tri(A, D, C); tri(A, C, B);
  return raw(P);
}

/* ------------------------------------------------------------------ assembler */

/** A pending facet-coloured, bone-tagged geometry. */
export class Assembler {
  private parts: THREE.BufferGeometry[] = [];

  /** add a geometry: bone index, paint (flat colour or per-facet fn), optional transform applied first */
  add(g: THREE.BufferGeometry, bone: number, paint: Paint, t?: Xf): this {
    const geo = ni(g);
    xf(geo, t);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    if (!n) return this;
    const col = new Float32Array(n * 3);
    const idx = new Uint16Array(n * 4);
    const wgt = new Float32Array(n * 4);
    const fn = typeof paint === "function" ? paint : null;
    if (!fn) _c.set(paint as THREE.ColorRepresentation);
    for (let i = 0; i < n; i += 3) {
      if (fn) {
        const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
        const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
        const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        _a.set(pos.getX(i), pos.getY(i), pos.getZ(i)); _b.set(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)); _n.set(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
        _n.sub(_a); _b.sub(_a); _n.crossVectors(_b, _n).normalize();
        const c = fn(cx, cy, cz, i / 3, _n);
        if (typeof c === "string") _c.set(c); else _c.copy(c);
      }
      for (let k = 0; k < 3; k++) {
        const v = i + k;
        col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
        idx[v * 4] = bone; wgt[v * 4] = 1;
      }
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(idx, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(wgt, 4));
    this.parts.push(geo);
    return this;
  }

  /** merge everything into one geometry (flat normals) */
  build(): THREE.BufferGeometry {
    const g = this.parts.length ? (mergeGeometries(this.parts, false) as THREE.BufferGeometry) : raw([]);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeVertexNormals();
    return g;
  }
}

/* ------------------------------------------------------------------ colour helpers */

export function shade(hex: string, k: number): string { return "#" + _c.set(hex).multiplyScalar(k).getHexString(); }
export function mix(a: string, b: string, t: number): string { const ca = new THREE.Color(a), cb = new THREE.Color(b); return "#" + ca.lerp(cb, t).getHexString(); }
/** deterministic 0..1 noise from a facet index + salt */
export function fnoise(i: number, salt = 0): number { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); }
