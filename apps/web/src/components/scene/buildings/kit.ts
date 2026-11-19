/**
 * Building kit — a vertex-coloured, flat-shaded geometry builder plus architectural
 * elements (bevelled walls, roofs, dormers, chimneys, windows, doors, porches, balconies,
 * awnings, lanterns, columns, fences…). Everything a location is made of is appended to one
 * `GB` and merged into a single BufferGeometry with `position / normal / color / glow`
 * attributes, so the whole town draws with one material (see materials.ts).
 *
 * Conventions: a building is built in its own local frame — origin at the centre of the
 * footprint on the ground (y = 0), +z is the front (the side with the door), +y up.
 * Colours are hex strings; `glow` is an optional emissive colour (only lit at night).
 */
import * as THREE from "three";
import { hash01 } from "../palette";

export type V3 = [number, number, number];
export type RGB = [number, number, number];

/* ----------------------------------- colours ---------------------------------- */

const colCache = new Map<string, RGB>();
export function rgb(hex: string): RGB {
  let c = colCache.get(hex);
  if (!c) { const t = new THREE.Color(hex); c = [t.r, t.g, t.b]; colCache.set(hex, c); }
  return c;
}
/** multiply a hex colour's brightness by k (returns hex) */
export function shade(hex: string, k: number): string {
  const [r, g, b] = rgb(hex);
  const c = new THREE.Color(Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k));
  return "#" + c.getHexString();
}
export function mix(a: string, b: string, t: number): string {
  const c = new THREE.Color(a).lerp(new THREE.Color(b), t);
  return "#" + c.getHexString();
}
export const NO_GLOW: RGB = [0, 0, 0];

/* ----------------------------------- builder ---------------------------------- */

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _e = new THREE.Euler();

export interface ShapeOpts {
  /** chamfer size (metres) on all edges */
  bevel?: number;
  rx?: number; ry?: number; rz?: number;
  /** emissive colour at night */
  glow?: string;
  /** "bottom" (default): y is the base; "center": y is the centre */
  anchor?: "bottom" | "center";
  /** darken vertices near the ground (weathering), 0..1 */
  grime?: number;
}

export class GB {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; glo: number[] = [];
  private stack: THREE.Matrix4[] = [];
  private cur = new THREE.Matrix4();
  /** per-vertex colour tweak hook (set by callers for weathering etc.) */
  grimeK = 0;

  push(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): this {
    this.stack.push(this.cur.clone());
    _e.set(rx, ry, rz, "YXZ");
    _m.makeRotationFromEuler(_e).setPosition(x, y, z);
    this.cur.multiply(_m);
    return this;
  }
  pushMatrix(m: THREE.Matrix4): this { this.stack.push(this.cur.clone()); this.cur.multiply(m); return this; }
  pop(): this { const m = this.stack.pop(); if (m) this.cur.copy(m); return this; }

  private xf(p: V3, m: THREE.Matrix4 = this.cur): V3 {
    _v.set(p[0], p[1], p[2]).applyMatrix4(m);
    return [_v.x, _v.y, _v.z];
  }

  /**
   * Convex polygon (world-space points already transformed). Winding is fixed automatically
   * when `hint` (an outward direction) is given. Flat normal per face.
   */
  polyRaw(pts: V3[], c: RGB, g: RGB, hint?: V3, grime = 0) {
    if (pts.length < 3) return;
    const [ax, ay, az] = pts[0], [bx, by, bz] = pts[1], [cx, cy, cz] = pts[2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return; // degenerate
    nx /= len; ny /= len; nz /= len;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { pts = pts.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
    const n = pts.length;
    for (let i = 1; i < n - 1; i++) {
      for (const p of [pts[0], pts[i], pts[i + 1]]) {
        this.pos.push(p[0], p[1], p[2]);
        this.nrm.push(nx, ny, nz);
        let k = 1;
        if (grime > 0) { const t = Math.min(1, Math.max(0, p[1] / 1.6)); k = 1 - grime * (1 - t); }
        this.col.push(c[0] * k, c[1] * k, c[2] * k);
        this.glo.push(g[0], g[1], g[2]);
      }
    }
  }
  /** polygon in the current local frame */
  poly(pts: V3[], color: string, hint?: V3, glow?: string) {
    const w = pts.map((p) => this.xf(p));
    const h = hint ? this.dir(hint) : undefined;
    this.polyRaw(w, rgb(color), glow ? rgb(glow) : NO_GLOW, h);
  }
  /** transform a direction by the current frame (rotation only) */
  private dir(d: V3): V3 {
    _v.set(d[0], d[1], d[2]).transformDirection(this.cur);
    return [_v.x, _v.y, _v.z];
  }

  /** convex polyhedron given as faces (local points); every face is oriented away from the centroid */
  convex(faces: V3[][], color: string | ((faceIndex: number) => string), glow?: string, m?: THREE.Matrix4, grime = 0) {
    const M = m ? _m.copy(this.cur).multiply(m) : this.cur;
    let cx = 0, cy = 0, cz = 0, n = 0;
    const w = faces.map((f) => f.map((p) => { const q = this.xf(p, M); cx += q[0]; cy += q[1]; cz += q[2]; n++; return q; }));
    cx /= n; cy /= n; cz /= n;
    const g = glow ? rgb(glow) : NO_GLOW;
    w.forEach((f, i) => {
      if (f.length < 3) return;
      let fx = 0, fy = 0, fz = 0; for (const p of f) { fx += p[0]; fy += p[1]; fz += p[2]; }
      fx /= f.length; fy /= f.length; fz /= f.length;
      this.polyRaw(f, rgb(typeof color === "string" ? color : color(i)), g, [fx - cx, fy - cy, fz - cz], grime);
    });
  }

  /** chamfered box. (x, y, z) is the centre of the base (anchor bottom) or the centre. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string | ((face: number) => string), o: ShapeOpts = {}) {
    const b = Math.min(o.bevel ?? 0, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const yc = o.anchor === "center" ? y : y + hh;
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, "YXZ");
    const M = new THREE.Matrix4().makeRotationFromEuler(_e).setPosition(x, yc, z);
    if (b <= 0) {
      const P = (sx: number, sy: number, sz: number): V3 => [sx * hw, sy * hh, sz * hd];
      const faces: V3[][] = [
        [P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)],     // +x
        [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)], // -x
        [P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1)],     // +y
        [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], // -y
        [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)],     // +z
        [P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1)], // -z
      ];
      this.convex(faces, color, o.glow, M, o.grime ?? 0);
      return;
    }
    // chamfered: 3 vertices per corner (on the x-face, y-face, z-face)
    const X = (sx: number, sy: number, sz: number): V3 => [sx * hw, sy * (hh - b), sz * (hd - b)];
    const Y = (sx: number, sy: number, sz: number): V3 => [sx * (hw - b), sy * hh, sz * (hd - b)];
    const Z = (sx: number, sy: number, sz: number): V3 => [sx * (hw - b), sy * (hh - b), sz * hd];
    const faces: V3[][] = [];
    for (const s of [1, -1]) {
      faces.push([X(s, -1, -1), X(s, 1, -1), X(s, 1, 1), X(s, -1, 1)]);
      faces.push([Y(-1, s, -1), Y(1, s, -1), Y(1, s, 1), Y(-1, s, 1)]);
      faces.push([Z(-1, -1, s), Z(1, -1, s), Z(1, 1, s), Z(-1, 1, s)]);
    }
    // edges along x (between y-face sy and z-face sz)
    for (const sy of [1, -1]) for (const sz of [1, -1]) faces.push([Y(-1, sy, sz), Y(1, sy, sz), Z(1, sy, sz), Z(-1, sy, sz)]);
    // edges along y (between x-face sx and z-face sz)
    for (const sx of [1, -1]) for (const sz of [1, -1]) faces.push([X(sx, -1, sz), X(sx, 1, sz), Z(sx, 1, sz), Z(sx, -1, sz)]);
    // edges along z (between x-face sx and y-face sy)
    for (const sx of [1, -1]) for (const sy of [1, -1]) faces.push([X(sx, sy, -1), X(sx, sy, 1), Y(sx, sy, 1), Y(sx, sy, -1)]);
    // corners
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) faces.push([X(sx, sy, sz), Y(sx, sy, sz), Z(sx, sy, sz)]);
    const colorFn = typeof color === "string" ? color : (i: number) => color(i < 6 ? [0, 2, 4, 1, 3, 5][i] : 6);
    this.convex(faces, colorFn, o.glow, M, o.grime ?? 0);
  }

  /** cylinder / cone / tapered column, base centred at (x,y,z). `n` sides. */
  cyl(x: number, y: number, z: number, r0: number, r1: number, h: number, n: number, color: string | ((i: number, top: boolean) => string), o: { glow?: string; rx?: number; rz?: number; ry?: number; caps?: boolean; anchor?: "bottom" | "center"; phase?: number } = {}) {
    const yc = o.anchor === "center" ? y : y + h / 2;
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, "YXZ");
    const M = new THREE.Matrix4().makeRotationFromEuler(_e).setPosition(x, yc, z);
    const faces: V3[][] = [];
    const ph = o.phase ?? 0;
    const bot: V3[] = [], top: V3[] = [];
    for (let i = 0; i < n; i++) {
      const a = ph + (i / n) * Math.PI * 2;
      bot.push([Math.cos(a) * r0, -h / 2, Math.sin(a) * r0]);
      top.push([Math.cos(a) * r1, h / 2, Math.sin(a) * r1]);
    }
    const sideIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const f: V3[] = [];
      f.push(bot[i], bot[j]);
      if (r1 > 1e-4) f.push(top[j], top[i]); else f.push([0, h / 2, 0]);
      faces.push(f); sideIdx.push(i);
    }
    if (o.caps !== false) {
      if (r0 > 1e-4) { faces.push(bot.slice()); sideIdx.push(-1); }
      if (r1 > 1e-4) { faces.push(top.slice()); sideIdx.push(-2); }
    }
    const cf = typeof color === "string" ? color : (fi: number) => { const s = sideIdx[fi]; return s >= 0 ? color(s, false) : color(0, true); };
    this.convex(faces, cf, o.glow, M);
  }

  /** low-poly sphere (icosahedron), centred */
  sphere(x: number, y: number, z: number, r: number, color: string, glow?: string) {
    const g = ICO;
    const M = new THREE.Matrix4().makeScale(r, r, r).setPosition(x, y, z);
    this.convex(g, color, glow, M);
  }

  /** append a three.js geometry (indexed or not) with a colour, transformed */
  addGeo(geo: THREE.BufferGeometry, color: string, m: THREE.Matrix4, glow?: string) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute("position");
    const M = _m.copy(this.cur).multiply(m);
    const c = rgb(color), gl = glow ? rgb(glow) : NO_GLOW;
    for (let i = 0; i < p.count; i += 3) {
      const tri: V3[] = [];
      for (let k = 0; k < 3; k++) { _v.set(p.getX(i + k), p.getY(i + k), p.getZ(i + k)).applyMatrix4(M); tri.push([_v.x, _v.y, _v.z]); }
      this.polyRaw(tri, c, gl);
    }
  }

  /** merge another builder's output (already in its own world frame) */
  append(o: GB) {
    for (const a of ["pos", "nrm", "col", "glo"] as const) { const src = o[a]; const dst = this[a]; for (let i = 0; i < src.length; i++) dst.push(src[i]); }
  }

  get triangles() { return this.pos.length / 9; }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("glow", new THREE.Float32BufferAttribute(this.glo, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

const ICO: V3[][] = (() => {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.getAttribute("position");
  const faces: V3[][] = [];
  for (let i = 0; i < p.count; i += 3) faces.push([[p.getX(i), p.getY(i), p.getZ(i)], [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)], [p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)]]);
  return faces;
})();

/* ------------------------------- small helpers -------------------------------- */

export const TAU = Math.PI * 2;
export const h01 = hash01;

/** a wall-attached frame: local +z points outward from the given face of a w×d box */
export function face(gb: GB, side: "front" | "back" | "left" | "right", along: number, y: number, w: number, d: number): void {
  switch (side) {
    case "front": gb.push(along, y, d / 2, 0); break;
    case "back": gb.push(-along, y, -d / 2, Math.PI); break;
    case "right": gb.push(w / 2, y, -along, Math.PI / 2); break; // +x face
    case "left": gb.push(-w / 2, y, along, -Math.PI / 2); break; // -x face
  }
}

/* ----------------------------------- walls ------------------------------------ */

export interface WallOpening { x: number; w: number; h: number; depth: number; floor?: string; inner?: string; glow?: string }
export interface WallStyle {
  color: string;
  trim: string;
  /** stone plinth colour */
  plinth?: string;
  bevel?: number;
  /** dark timber framing on the façades */
  timber?: string;
  /** stone quoins at the corners */
  quoins?: string;
  /** horizontal clapboard strips */
  clapboard?: boolean;
  /** number of storeys for the storey band (0 = none) */
  storeys?: number;
  storeyH?: number;
  grime?: number;
  /** stone-block pattern (darker random blocks) */
  stone?: boolean;
  seed?: string;
  /** a real opening in the front wall with a room behind it (for open doors / bays) */
  opening?: WallOpening;
}

/** Bevelled wall box with a stone plinth, optional timber frame / quoins / clapboard / storey band / front opening. */
export function walls(gb: GB, w: number, h: number, d: number, s: WallStyle) {
  const b = s.bevel ?? 0.12;
  const grime = s.grime ?? 0.12;
  // plinth reaches below ground so slopes never show a gap
  gb.box(0, -1.2, 0, w + 0.5, 1.2 + 0.28, d + 0.5, s.plinth ?? "#8d877c", { bevel: 0.1 });
  const op = s.opening;
  if (!op) gb.box(0, 0, 0, w, h, d, s.color, { bevel: b, grime });
  else {
    const t = 0.5, rd = Math.min(op.depth, d - 1), zc = d / 2 - rd / 2;
    gb.box(0, 0, -rd / 2, w, h, d - rd, s.color, { bevel: b, grime });               // solid rear block
    gb.box(-(w / 2 - t / 2), 0, zc, t, h, rd, s.color, { bevel: 0.03, grime });        // room side walls
    gb.box(w / 2 - t / 2, 0, zc, t, h, rd, s.color, { bevel: 0.03, grime });
    const lx0 = -w / 2, lx1 = op.x - op.w / 2, rx0 = op.x + op.w / 2, rx1 = w / 2;
    if (lx1 - lx0 > 0.05) gb.box((lx0 + lx1) / 2, 0, d / 2 - t / 2, lx1 - lx0, h, t, s.color, { bevel: 0.03, grime });
    if (rx1 - rx0 > 0.05) gb.box((rx0 + rx1) / 2, 0, d / 2 - t / 2, rx1 - rx0, h, t, s.color, { bevel: 0.03, grime });
    gb.box(op.x, op.h, d / 2 - t / 2, op.w + 0.02, h - op.h, t, s.color, { bevel: 0.03 });
    // the room: floor, ceiling, lining on the back and sides
    const fl = op.floor ?? "#4a3f34", inner = op.inner ?? "#5a4d40";
    gb.box(0, 0.02, zc, w - t * 2, 0.06, rd, fl, {});
    gb.box(0, h - 0.45, zc, w - t * 2, 0.1, rd, shade(inner, 0.6), {});
    gb.box(0, 0, d / 2 - rd + 0.06, w - t * 2, h - 0.4, 0.1, inner, { glow: op.glow });
    gb.box(-(w / 2 - t - 0.06), 0, zc, 0.1, h - 0.4, rd, shade(inner, 0.85), {});
    gb.box(w / 2 - t - 0.06, 0, zc, 0.1, h - 0.4, rd, shade(inner, 0.85), {});
  }
  if (s.clapboard) {
    const step = 0.36, sh = shade(s.color, 0.86);
    for (let y = 0.5; y < h - 0.25; y += step) {
      gb.box(0, y, 0, w + 0.06, 0.07, d + 0.06, sh, {});
    }
  }
  if (s.timber) {
    const t = s.timber;
    const beam = (x: number, y: number, z: number, bw: number, bh: number, bd: number, rz = 0) => gb.box(x, y, z, bw, bh, bd, t, { rz, anchor: "center" });
    const storeys = s.storeys ?? 1, sh = s.storeyH ?? h / storeys;
    for (const side of ["front", "back", "left", "right"] as const) {
      const len = side === "front" || side === "back" ? w : d;
      face(gb, side, 0, 0, w, d);
      // sill/head beams per storey
      for (let k = 0; k <= storeys; k++) { const y = Math.min(h - 0.12, k * sh); beam(0, y === 0 ? 0.4 : y, 0.05, len + 0.1, 0.22, 0.14); }
      // studs
      const n = Math.max(2, Math.round(len / 1.7));
      for (let i = 0; i <= n; i++) { const x = -len / 2 + (len * i) / n; beam(x, h / 2, 0.05, 0.2, h, 0.14); }
      // corner braces
      const bl = Math.min(1.6, sh * 0.6);
      beam(-len / 2 + 0.85, sh * 0.5, 0.05, 0.16, bl, 0.12, -0.75);
      beam(len / 2 - 0.85, sh * 0.5, 0.05, 0.16, bl, 0.12, 0.75);
      gb.pop();
    }
  }
  if (s.quoins) {
    const q = s.quoins, qh = 0.45;
    for (let y = 0.1; y < h - 0.3; y += qh * 2) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        gb.box(sx * (w / 2 - 0.3), y, sz * (d / 2 - 0.2), 0.7, qh, 0.5, q, {});
        gb.box(sx * (w / 2 - 0.2), y + qh, sz * (d / 2 - 0.3), 0.5, qh, 0.7, shade(q, 0.93), {});
      }
    }
  }
  if (s.stone) {
    const seed = s.seed ?? "stone";
    let k = 0;
    for (const side of ["front", "back", "left", "right"] as const) {
      const len = side === "front" || side === "back" ? w : d;
      face(gb, side, 0, 0, w, d);
      const n = Math.floor(len * h * 0.45);
      for (let i = 0; i < n; i++, k++) {
        const x = (h01(seed, k * 3 + 1) - 0.5) * (len - 1), y = 0.3 + h01(seed, k * 3 + 2) * (h - 0.8);
        if (side === "front" && op && Math.abs(x - op.x) < op.w / 2 + 0.6 && y < op.h + 0.3) continue;
        const bw = 0.5 + h01(seed, k * 3 + 3) * 0.7;
        gb.box(x, y, 0.02, bw, 0.28, 0.04, shade(s.color, 0.8 + h01(seed, k * 3 + 4) * 0.12), {});
      }
      gb.pop();
    }
  }
  if ((s.storeys ?? 1) > 1) {
    const sh = s.storeyH ?? h / (s.storeys ?? 1);
    for (let k = 1; k < (s.storeys ?? 1); k++) gb.box(0, k * sh - 0.1, 0, w + 0.16, 0.2, d + 0.16, s.trim, {});
  }
}

/* ----------------------------------- roofs ------------------------------------ */

export interface RoofStyle {
  color: string;
  /** fascia / bargeboard colour */
  trim?: string;
  overhang?: number;
  thick?: number;
  /** number of visible tile rows per slope (0 = plain) */
  tiles?: number;
  /** ridge cap colour */
  ridge?: string;
  /** corrugated: strips run down the slope */
  corrugated?: boolean;
  /** thatch look: thick, big overhang, rounded ridge */
  thatch?: boolean;
  /** ridge along "x" (gable ends at ±x, default) or "z" (gable faces the front) */
  ridgeAxis?: "x" | "z";
}

/**
 * Gable roof as a Λ band with thickness, fascia boards, optional tile rows and a ridge cap.
 * Spans w×d at base height y0, rising `rise` to the ridge (ridge along x by default).
 */
export function roofGable(gb: GB, w: number, d: number, y0: number, rise: number, s: RoofStyle) {
  if (s.ridgeAxis === "z") { gb.push(0, 0, 0, Math.PI / 2); roofGable(gb, d, w, y0, rise, { ...s, ridgeAxis: "x" }); gb.pop(); return; }
  const oh = s.overhang ?? 0.55, t = s.thick ?? (s.thatch ? 0.7 : 0.26);
  const W = w / 2 + oh, D = d / 2 + oh;
  const yE = y0 - 0.05 - (oh * rise) / (d / 2);          // eave height (roof plane extended past the wall)
  const yR = y0 - 0.05 + rise;                            // ridge (underside)
  const c = s.color, fas = s.trim ?? shade(c, 0.75);
  // outer (top) surface
  const A: V3 = [-W, yE + t, D], B: V3 = [W, yE + t, D], C: V3 = [W, yE + t, -D], Dp: V3 = [-W, yE + t, -D];
  const E: V3 = [-W, yR + t, 0], F: V3 = [W, yR + t, 0];
  // inner (under) surface
  const a: V3 = [-W, yE, D], b: V3 = [W, yE, D], cc: V3 = [W, yE, -D], dd: V3 = [-W, yE, -D];
  const e: V3 = [-W, yR, 0], f: V3 = [W, yR, 0];
  gb.poly([A, B, F, E], c, [0, 1, 1]);
  gb.poly([C, Dp, E, F], c, [0, 1, -1]);
  gb.poly([a, e, f, b], shade(c, 0.6), [0, -1, 1]);
  gb.poly([cc, f, e, dd], shade(c, 0.6), [0, -1, -1]);
  gb.poly([a, b, B, A], fas, [0, 0, 1]);         // front fascia
  gb.poly([cc, dd, Dp, C], fas, [0, 0, -1]);     // back fascia
  // gable end caps (bargeboards): two quads each
  gb.poly([b, B, F, f], fas, [1, 0, 0]); gb.poly([f, F, C, cc], fas, [1, 0, 0]);
  gb.poly([a, e, E, A], fas, [-1, 0, 0]); gb.poly([dd, Dp, E, e], fas, [-1, 0, 0]);
  const slopeLen = Math.hypot(D, yR - yE), ang = Math.atan2(rise + (oh * rise) / (d / 2), D);
  const rows = s.tiles ?? 0;
  if (rows > 0) {
    for (let k = 0; k < rows; k++) {
      const u = (k + 0.5) / rows; // 0 eave → 1 ridge
      const cz = D * (1 - u), cy = yE + t + (yR - yE) * u + 0.035;
      const sh = shade(c, k % 2 ? 0.9 : 1.06);
      gb.box(0, cy, cz, w + oh * 2 + 0.02, 0.07, 0.34, sh, { rx: ang, anchor: "center" });
      gb.box(0, cy, -cz, w + oh * 2 + 0.02, 0.07, 0.34, sh, { rx: -ang, anchor: "center" });
    }
  }
  if (s.corrugated) {
    const n = Math.max(2, Math.round((w + oh * 2) / 0.55));
    for (let i = 0; i <= n; i++) {
      const x = -W + ((W * 2) * i) / n;
      const cz = D / 2, cy = yE + t + (yR - yE) / 2 + 0.03;
      gb.box(x, cy, cz, 0.08, 0.06, slopeLen * 0.98, shade(c, 0.85), { rx: ang, anchor: "center" });
      gb.box(x, cy, -cz, 0.08, 0.06, slopeLen * 0.98, shade(c, 0.85), { rx: -ang, anchor: "center" });
    }
  }
  // ridge cap
  const rc = s.ridge ?? (s.thatch ? shade(c, 0.8) : shade(c, 0.7));
  const rh = s.thatch ? 0.5 : 0.24, rw = s.thatch ? 1.4 : 0.6;
  gb.convex([
    [[-W - 0.05, yR + t - 0.1, -rw / 2], [W + 0.05, yR + t - 0.1, -rw / 2], [W + 0.05, yR + t - 0.1, rw / 2], [-W - 0.05, yR + t - 0.1, rw / 2]],
    [[-W - 0.05, yR + t - 0.1, rw / 2], [W + 0.05, yR + t - 0.1, rw / 2], [W + 0.05, yR + t + rh, 0], [-W - 0.05, yR + t + rh, 0]],
    [[-W - 0.05, yR + t - 0.1, -rw / 2], [-W - 0.05, yR + t + rh, 0], [W + 0.05, yR + t + rh, 0], [W + 0.05, yR + t - 0.1, -rw / 2]],
    [[-W - 0.05, yR + t - 0.1, -rw / 2], [-W - 0.05, yR + t - 0.1, rw / 2], [-W - 0.05, yR + t + rh, 0]],
    [[W + 0.05, yR + t - 0.1, -rw / 2], [W + 0.05, yR + t + rh, 0], [W + 0.05, yR + t - 0.1, rw / 2]],
  ], rc);
}

/** the triangular gable-end walls under a gable roof (wall colour), ridge along x */
export function gableEnds(gb: GB, w: number, d: number, y0: number, rise: number, color: string, ridgeAxis: "x" | "z" = "x", grime = 0) {
  if (ridgeAxis === "z") { gb.push(0, 0, 0, Math.PI / 2); gableEnds(gb, d, w, y0, rise, color, "x", grime); gb.pop(); return; }
  const hw = w / 2, hd = d / 2;
  gb.convex([
    [[-hw, y0, -hd], [-hw, y0, hd], [-hw, y0 + rise, 0]],
    [[hw, y0, -hd], [hw, y0 + rise, 0], [hw, y0, hd]],
    [[-hw, y0, hd], [hw, y0, hd], [hw, y0 + rise, 0], [-hw, y0 + rise, 0]],
    [[-hw, y0, -hd], [-hw, y0 + rise, 0], [hw, y0 + rise, 0], [hw, y0, -hd]],
    [[-hw, y0, -hd], [hw, y0, -hd], [hw, y0, hd], [-hw, y0, hd]],
  ], color, undefined, undefined, grime);
}

/** hip roof (ridgeLen 0 → pyramid). Base at y0 spanning w×d plus overhang. */
export function roofHip(gb: GB, w: number, d: number, y0: number, rise: number, s: RoofStyle & { ridgeLen?: number }) {
  const oh = s.overhang ?? 0.55;
  const W = w / 2 + oh, D = d / 2 + oh, rl = Math.min(s.ridgeLen ?? Math.max(0, (w - d) * 0.9), W * 2 - 0.4) / 2;
  const yb = y0 - 0.05, yr = yb + rise, t = s.thick ?? 0.22;
  const c = s.color;
  const faces: V3[][] = [
    [[-W, yb, D], [W, yb, D], [rl, yr, 0], [-rl, yr, 0]],
    [[W, yb, -D], [-W, yb, -D], [-rl, yr, 0], [rl, yr, 0]],
    [[W, yb, D], [W, yb, -D], [rl, yr, 0]],
    [[-W, yb, -D], [-W, yb, D], [-rl, yr, 0]],
    [[-W, yb, -D], [W, yb, -D], [W, yb, D], [-W, yb, D]],
  ];
  gb.convex(faces, (i) => (i === 4 ? shade(c, 0.6) : c));
  // fascia ring
  const fas = s.trim ?? shade(c, 0.75);
  gb.box(0, yb - t, 0, W * 2 + 0.04, t, D * 2 + 0.04, (i) => (i === 3 ? shade(c, 0.6) : fas), {});
  // hip caps + ridge cap
  const rc = s.ridge ?? shade(c, 0.7);
  if (rl > 0.1) gb.box(0, yr - 0.02, 0, rl * 2 + 0.3, 0.2, 0.5, rc, { bevel: 0.05 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x0 = sx * W, z0 = sz * D, x1 = sx * rl, z1 = 0;
    const len = Math.hypot(x1 - x0, yr - yb, z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (yb + yr) / 2 + 0.03;
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const rx = -Math.atan2(yr - yb, Math.hypot(x1 - x0, z1 - z0));
    gb.box(cx, cy, cz, 0.3, 0.16, len, rc, { ry, rx, anchor: "center" });
  }
}

/** mansard: steep lower slope, shallow upper. */
export function roofMansard(gb: GB, w: number, d: number, y0: number, rise: number, s: RoofStyle) {
  const oh = s.overhang ?? 0.4;
  const W = w / 2 + oh, D = d / 2 + oh, yb = y0 - 0.05;
  const r1 = rise * 0.72, r2 = rise - r1, in1 = 0.9, in2 = Math.min(W, D) * 0.55;
  const ring = (hw: number, hd: number, y: number): V3[] => [[-hw, y, hd], [hw, y, hd], [hw, y, -hd], [-hw, y, -hd]];
  const R0 = ring(W, D, yb), R1 = ring(W - in1, D - in1, yb + r1), R2 = ring(W - in2, D - in2, yb + r1 + r2);
  const faces: V3[][] = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; faces.push([R0[i], R0[j], R1[j], R1[i]]); faces.push([R1[i], R1[j], R2[j], R2[i]]); }
  faces.push(R2.slice().reverse()); faces.push(R0.slice());
  const c = s.color;
  gb.convex(faces, (i) => (i === 9 ? shade(c, 0.6) : i >= 8 ? shade(c, 0.9) : i % 2 ? shade(c, 1.05) : c));
  gb.box(0, yb - 0.24, 0, W * 2 + 0.04, 0.24, D * 2 + 0.04, s.trim ?? shade(c, 0.75), {});
  gb.box(0, yb + r1 - 0.06, 0, (W - in1) * 2 + 0.1, 0.16, (D - in1) * 2 + 0.1, s.ridge ?? shade(c, 0.7), {});
  if ((s.tiles ?? 0) > 0) {
    const rows = s.tiles ?? 0;
    for (const side of [1, -1]) for (let k = 0; k < rows; k++) {
      const u = (k + 0.5) / rows;
      const z = side * (D - in1 * u), y = yb + r1 * u + 0.04;
      gb.box(0, y, z, W * 2 - in1 * u * 2 - 0.1, 0.07, 0.3, shade(c, k % 2 ? 0.9 : 1.06), { rx: side * Math.atan2(r1, in1), anchor: "center" });
    }
  }
}

/** single-slope shed roof: high at the back (−z), low at the front (+z). */
export function roofShed(gb: GB, w: number, d: number, y0: number, rise: number, s: RoofStyle) {
  const oh = s.overhang ?? 0.45, t = s.thick ?? 0.2;
  const W = w / 2 + oh, D = d / 2 + oh, yb = y0 - 0.05;
  const slope = rise / d;
  const yF = yb - oh * slope, yB = yb + rise + oh * slope;
  const faces: V3[][] = [
    [[-W, yF, D], [W, yF, D], [W, yB, -D], [-W, yB, -D]],
    [[-W, yF - t, D], [-W, yB - t, -D], [W, yB - t, -D], [W, yF - t, D]],
    [[-W, yF - t, D], [W, yF - t, D], [W, yF, D], [-W, yF, D]],
    [[-W, yB - t, -D], [-W, yB, -D], [W, yB, -D], [W, yB - t, -D]],
    [[W, yF - t, D], [W, yB - t, -D], [W, yB, -D], [W, yF, D]],
    [[-W, yF - t, D], [-W, yF, D], [-W, yB, -D], [-W, yB - t, -D]],
  ];
  const c = s.color, fas = s.trim ?? shade(c, 0.75);
  gb.convex(faces, (i) => (i === 0 ? c : i === 1 ? shade(c, 0.6) : fas));
  if (s.corrugated) {
    const n = Math.max(2, Math.round((W * 2) / 0.5)), ang = Math.atan2(yB - yF, D * 2), len = Math.hypot(yB - yF, D * 2);
    for (let i = 0; i <= n; i++) gb.box(-W + (W * 2 * i) / n, (yF + yB) / 2 + 0.03, 0, 0.08, 0.06, len * 0.98, shade(c, 0.85), { rx: ang, anchor: "center" });
  }
  // the triangular wall fill under the slope
  gb.convex([
    [[-w / 2, y0 - 0.02, d / 2], [w / 2, y0 - 0.02, d / 2], [w / 2, y0 - 0.02, -d / 2], [-w / 2, y0 - 0.02, -d / 2]],
    [[-w / 2, y0 - 0.02, -d / 2], [w / 2, y0 - 0.02, -d / 2], [w / 2, y0 + rise - 0.02, -d / 2], [-w / 2, y0 + rise - 0.02, -d / 2]],
    [[-w / 2, y0 - 0.02, d / 2], [-w / 2, y0 + rise - 0.02, -d / 2], [-w / 2, y0 - 0.02, -d / 2]],
    [[w / 2, y0 - 0.02, d / 2], [w / 2, y0 - 0.02, -d / 2], [w / 2, y0 + rise - 0.02, -d / 2]],
    [[-w / 2, y0 - 0.02, d / 2], [w / 2, y0 - 0.02, d / 2], [w / 2, y0 + rise - 0.02, -d / 2], [-w / 2, y0 + rise - 0.02, -d / 2]],
  ], s.trim ?? c);
}

/** flat roof with a parapet and coping */
export function roofFlat(gb: GB, w: number, d: number, y0: number, s: RoofStyle & { parapetH?: number; parapet?: string }) {
  const ph = s.parapetH ?? 0.7, pc = s.parapet ?? s.trim ?? shade(s.color, 0.8);
  gb.box(0, y0 - 0.05, 0, w + 0.3, 0.3, d + 0.3, s.color, {});
  const t = 0.35;
  gb.box(0, y0 + 0.2, (d + 0.3) / 2 - t / 2, w + 0.3, ph, t, pc, { bevel: 0.05 });
  gb.box(0, y0 + 0.2, -(d + 0.3) / 2 + t / 2, w + 0.3, ph, t, pc, { bevel: 0.05 });
  gb.box((w + 0.3) / 2 - t / 2, y0 + 0.2, 0, t, ph, d + 0.3, pc, { bevel: 0.05 });
  gb.box(-(w + 0.3) / 2 + t / 2, y0 + 0.2, 0, t, ph, d + 0.3, pc, { bevel: 0.05 });
  // coping
  gb.box(0, y0 + 0.2 + ph, 0, w + 0.5, 0.12, d + 0.5, shade(pc, 1.08), {});
}

/** a dormer on the front slope of a gable roof (ridge along x). `u` = fraction along the slope from eave. */
export function dormer(gb: GB, x: number, y0: number, d: number, rise: number, u: number, wallColor: string, roofColor: string, trim: string, opts: { w?: number; h?: number; glow?: string } = {}) {
  const dw = opts.w ?? 1.5, dh = opts.h ?? 1.5;
  const D = d / 2;
  const z = D * (1 - u), y = y0 + rise * u - 0.2;
  gb.push(x, y, z);
  gb.box(0, 0, -0.6, dw, dh, 1.6, wallColor, { bevel: 0.05 });
  gableEnds(gb, dw, 1.7, dh, 0.7, wallColor, "z");
  roofGable(gb, dw, 1.6, dh, 0.7, { color: roofColor, trim, overhang: 0.22, thick: 0.15, ridgeAxis: "z" });
  gb.push(0, 0, 0.2);
  windowEl(gb, 0, dh * 0.55, 0.8, 0.9, { frame: trim, glow: opts.glow });
  gb.pop();
  gb.pop();
}

/** chimney stack with a cap and pots; returns the world-local top position for smoke */
export function chimney(gb: GB, x: number, z: number, yBase: number, h: number, color: string, opts: { pots?: number; w?: number; capColor?: string } = {}): V3 {
  const w = opts.w ?? 0.9, pots = opts.pots ?? 2;
  gb.box(x, yBase, z, w, h, w, color, { bevel: 0.04, grime: 0 });
  gb.box(x, yBase + h, z, w + 0.3, 0.22, w + 0.3, opts.capColor ?? shade(color, 0.8), { bevel: 0.05 });
  for (let i = 0; i < pots; i++) {
    const px = pots === 1 ? 0 : (i / (pots - 1) - 0.5) * (w - 0.4);
    gb.cyl(x + px, yBase + h + 0.22, z, 0.16, 0.14, 0.5, 6, "#b0593a");
  }
  return [x, yBase + h + 0.75, z];
}

/* ------------------------------- openings & trim ------------------------------ */

export interface WindowOpts {
  frame?: string; pane?: string; glow?: string; sill?: boolean; shutters?: string; flowers?: boolean; mullions?: boolean; arch?: boolean;
}
/** window on the current wall frame (local +z outward): frame, recessed pane, sill, shutters, flower box */
export function windowEl(gb: GB, x: number, y: number, w: number, h: number, o: WindowOpts = {}) {
  const fr = o.frame ?? "#f4efe2", pane = o.pane ?? "#33465a";
  const ft = 0.09;
  gb.box(x, y - h / 2, 0.02, w + ft * 2, h + ft * 2, 0.14, fr, { bevel: 0.03 });
  gb.box(x, y - h / 2 + ft * 0.5, 0.11, w, h - ft, 0.05, pane, { glow: o.glow });
  if (o.mullions !== false) {
    gb.box(x, y - h / 2, 0.12, 0.06, h, 0.05, fr, {});
    gb.box(x, y - 0.03, 0.12, w, 0.06, 0.05, fr, {});
  }
  if (o.sill !== false) gb.box(x, y - h / 2 - ft - 0.1, 0.1, w + ft * 2 + 0.2, 0.1, 0.32, shade(fr, 0.92), { bevel: 0.02 });
  if (o.shutters) {
    const sw = w * 0.48;
    gb.box(x - w / 2 - ft - sw / 2 - 0.03, y - h / 2, 0.02, sw, h + ft, 0.08, o.shutters, { bevel: 0.02 });
    gb.box(x + w / 2 + ft + sw / 2 + 0.03, y - h / 2, 0.02, sw, h + ft, 0.08, o.shutters, { bevel: 0.02 });
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) gb.box(x + sx * (w / 2 + ft + sw / 2 + 0.03), y - h / 2 + 0.15 + k * ((h + ft - 0.3) / 2.5), 0.1, sw - 0.1, 0.06, 0.03, shade(o.shutters, 0.8), {});
  }
  if (o.flowers) flowerBox(gb, x, y - h / 2 - ft - 0.2, 0.2, w + 0.1);
}

export function flowerBox(gb: GB, x: number, y: number, z: number, w: number, colors: string[] = ["#e04a5a", "#f2b632", "#e86aa0"]) {
  gb.box(x, y - 0.3, z + 0.18, w, 0.32, 0.36, "#8a5a3a", { bevel: 0.03 });
  gb.box(x, y + 0.0, z + 0.18, w - 0.1, 0.12, 0.28, "#3f7d3a", {});
  const n = Math.max(2, Math.round(w / 0.32));
  for (let i = 0; i < n; i++) {
    const px = x - w / 2 + 0.16 + ((w - 0.32) * i) / Math.max(1, n - 1);
    gb.sphere(px, y + 0.16, z + 0.18 + (i % 2 ? 0.06 : -0.06), 0.12, colors[i % colors.length]);
    gb.sphere(px + 0.08, y + 0.05, z + 0.3, 0.1, "#5aa646");
  }
}

/** pointed stained-glass window (chapel). Panes glow in three colours at night. */
export function lancetWindow(gb: GB, x: number, y: number, w: number, h: number, frame: string) {
  const cols = ["#c93b3b", "#2f66b8", "#e6b83a", "#3f9a5a"];
  const fr = 0.08;
  // frame: box + triangle top
  gb.box(x, y, 0.02, w + fr * 2, h - w / 2, 0.12, frame, {});
  gb.convex([
    [[x - w / 2 - fr, y + h - w / 2, 0.02], [x + w / 2 + fr, y + h - w / 2, 0.02], [x, y + h + fr * 1.4, 0.02]],
    [[x - w / 2 - fr, y + h - w / 2, 0.14], [x, y + h + fr * 1.4, 0.14], [x + w / 2 + fr, y + h - w / 2, 0.14]],
    [[x - w / 2 - fr, y + h - w / 2, 0.02], [x, y + h + fr * 1.4, 0.02], [x, y + h + fr * 1.4, 0.14], [x - w / 2 - fr, y + h - w / 2, 0.14]],
    [[x + w / 2 + fr, y + h - w / 2, 0.02], [x + w / 2 + fr, y + h - w / 2, 0.14], [x, y + h + fr * 1.4, 0.14], [x, y + h + fr * 1.4, 0.02]],
    [[x - w / 2 - fr, y + h - w / 2, 0.02], [x - w / 2 - fr, y + h - w / 2, 0.14], [x + w / 2 + fr, y + h - w / 2, 0.14], [x + w / 2 + fr, y + h - w / 2, 0.02]],
  ], frame);
  const n = 3, pw = w / n;
  for (let i = 0; i < n; i++) {
    const px = x - w / 2 + pw * (i + 0.5);
    const c = cols[(i + 1) % cols.length];
    gb.box(px, y + fr, 0.1, pw - 0.03, h - w / 2 - fr, 0.05, shade(c, 0.6), { glow: c });
  }
  // pointed pane
  const tc = cols[0];
  gb.convex([
    [[x - w / 2, y + h - w / 2, 0.1], [x + w / 2, y + h - w / 2, 0.1], [x, y + h, 0.1]],
    [[x - w / 2, y + h - w / 2, 0.15], [x, y + h, 0.15], [x + w / 2, y + h - w / 2, 0.15]],
    [[x - w / 2, y + h - w / 2, 0.1], [x, y + h, 0.1], [x, y + h, 0.15], [x - w / 2, y + h - w / 2, 0.15]],
    [[x + w / 2, y + h - w / 2, 0.1], [x + w / 2, y + h - w / 2, 0.15], [x, y + h, 0.15], [x, y + h, 0.1]],
    [[x - w / 2, y + h - w / 2, 0.1], [x - w / 2, y + h - w / 2, 0.15], [x + w / 2, y + h - w / 2, 0.15], [x + w / 2, y + h - w / 2, 0.1]],
  ], shade(tc, 0.6), tc);
  gb.box(x, y - 0.12, 0.08, w + fr * 2 + 0.2, 0.12, 0.3, shade(frame, 0.9), {});
}

export interface DoorOpts { color?: string; frame?: string; open?: number; glass?: boolean; glow?: string; step?: boolean; double?: boolean; fanlight?: boolean; knob?: string }
/** door on the current wall frame: frame, leaf (optionally swung open), knob, step */
export function doorEl(gb: GB, x: number, w: number, h: number, o: DoorOpts = {}) {
  const fr = o.frame ?? "#f4efe2", c = o.color ?? "#5a3a26", ft = 0.12;
  gb.box(x - w / 2 - ft / 2, 0, 0.03, ft, h + ft, 0.16, fr, {});
  gb.box(x + w / 2 + ft / 2, 0, 0.03, ft, h + ft, 0.16, fr, {});
  gb.box(x, h, 0.03, w + ft * 2, ft, 0.16, fr, {});
  if (o.fanlight) { gb.box(x, h - 0.5, 0.06, w, 0.45, 0.05, "#33465a", { glow: o.glow ?? "#ffcf80" }); gb.box(x, h - 0.5, 0.03, w + ft * 2, 0.06, 0.16, fr, {}); }
  const leaf = (lx: number, lw: number, hingeSign: number) => {
    const open = o.open ?? 0;
    if (open > 0.01) {
      // swing the leaf about its hinge edge, inward
      const hx = lx + hingeSign * lw / 2;
      gb.push(hx, 0, 0.0, -hingeSign * open);
      gb.box(hingeSign * -lw / 2, 0.02, -0.04, lw, h - 0.04, 0.08, c, { bevel: 0.02 });
      gb.pop();
    } else {
      gb.box(lx, 0.02, 0.0, lw, h - 0.04, 0.08, c, { bevel: 0.02 });
      // panels
      gb.box(lx, h * 0.12, 0.05, lw * 0.6, h * 0.3, 0.03, shade(c, 0.85), {});
      gb.box(lx, h * 0.52, 0.05, lw * 0.6, h * 0.34, 0.03, o.glass ? "#33465a" : shade(c, 0.85), { glow: o.glass ? (o.glow ?? "#ffcf80") : undefined });
      gb.sphere(lx + hingeSign * -lw * 0.36, h * 0.48, 0.09, 0.05, o.knob ?? "#d3a74a");
    }
  };
  if (o.double) { leaf(x - w / 4, w / 2 - 0.02, -1); leaf(x + w / 4, w / 2 - 0.02, 1); }
  else leaf(x, w, -1);
  if (o.step !== false) gb.box(x, -0.22, 0.32, w + 0.7, 0.24, 0.65, "#a39c90", { bevel: 0.04 });
}

/** stone steps up to a raised door, on the current wall frame */
export function steps(gb: GB, x: number, w: number, n: number, color = "#a39c90") {
  const t = 0.55;
  for (let i = 0; i < n; i++) {
    // step i: top of the flight is at (n-1)*0.22 against the wall; each step drops 0.22 and moves out `t`
    gb.box(x, 0, 0.3 + i * t, w + i * 0.3, (n - i) * 0.22, t, i % 2 ? shade(color, 0.94) : color, { bevel: 0.03 });
  }
}

/** porch/portico: posts + a shed roof, on the front */
export function porch(gb: GB, w: number, depth: number, y0: number, postColor: string, roofColor: string, trim: string, opts: { posts?: number; rail?: boolean; deck?: boolean } = {}) {
  const n = opts.posts ?? Math.max(2, Math.round(w / 3) + 1);
  const ph = y0 - 0.3;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * i) / (n - 1);
    gb.box(x, 0, depth - 0.2, 0.22, ph, 0.22, postColor, { bevel: 0.03 });
    gb.box(x, ph - 0.5, depth - 0.2, 0.4, 0.5, 0.3, postColor, {});
  }
  if (opts.deck) gb.box(0, -0.15, depth / 2, w + 0.4, 0.2, depth + 0.2, shade(postColor, 0.85), { bevel: 0.03 });
  if (opts.rail) {
    for (const sx of [-1, 1]) {
      gb.box(sx * w / 2, 0.85, depth / 2 - 0.1, 0.1, 0.1, depth - 0.2, trim, {});
      for (let k = 0; k < 4; k++) gb.box(sx * w / 2, 0, 0.2 + ((depth - 0.5) * k) / 3, 0.06, 0.85, 0.06, trim, {});
    }
  }
  gb.push(0, 0, depth / 2 - 0.1);
  const wd = depth + 0.2;
  roofShed(gb, w + 0.2, wd, ph, 0.55, { color: roofColor, trim, overhang: 0.3, thick: 0.14 });
  gb.pop();
}

/** first-floor balcony with a railing, on the current wall frame at height y */
export function balcony(gb: GB, x: number, y: number, w: number, depth: number, color: string, rail: string) {
  gb.box(x, y - 0.18, depth / 2, w, 0.18, depth, color, { bevel: 0.03 });
  const n = Math.max(3, Math.round(w / 0.4));
  for (let i = 0; i <= n; i++) gb.box(x - w / 2 + (w * i) / n, y, depth - 0.1, 0.07, 1.0, 0.07, rail, {});
  gb.box(x, y + 1.0, depth - 0.1, w + 0.1, 0.08, 0.12, rail, {});
  for (const s of [-1, 1]) { gb.box(x + s * w / 2, y + 1.0, depth / 2, 0.12, 0.08, depth, rail, {}); for (let k = 0; k < 3; k++) gb.box(x + s * w / 2, y, (depth * (k + 0.5)) / 3, 0.07, 1.0, 0.07, rail, {}); }
  // brackets
  for (const s of [-1, 1]) gb.box(x + s * (w / 2 - 0.3), y - 0.6, 0.25, 0.14, 0.5, 0.5, shade(color, 0.8), { rx: 0.7, anchor: "center" });
}

/** striped awning (alternating vertex colours) on the current wall frame */
export function awning(gb: GB, x: number, y: number, w: number, depth: number, a: string, b: string, opts: { scallop?: boolean } = {}) {
  const n = Math.max(3, Math.round(w / 0.55));
  const ang = 0.32;
  gb.push(x, y, 0, 0, ang);
  for (let i = 0; i < n; i++) {
    const sx = -w / 2 + ((w * i) / n) + w / n / 2;
    gb.box(sx, 0, depth / 2, w / n + 0.01, 0.08, depth, i % 2 ? a : b, {});
    if (opts.scallop !== false) gb.box(sx, -0.22, depth - 0.04, w / n + 0.01, 0.24, 0.08, i % 2 ? a : b, {});
  }
  gb.pop();
  // support arms
  for (const s of [-1, 1]) gb.box(x + s * (w / 2 - 0.15), y - 0.9, 0.12, 0.06, 0.06, depth * 0.9, "#4a4a4a", { rx: -0.9, anchor: "center" });
}

/** wall lantern with a glowing glass box */
export function lantern(gb: GB, x: number, y: number, color = "#2b2b2b", glow = "#ffc46a") {
  gb.box(x, y, 0.18, 0.06, 0.06, 0.36, color, { anchor: "center" });
  gb.box(x, y - 0.3, 0.42, 0.28, 0.42, 0.28, "#fff3c8", { glow, bevel: 0.03 });
  gb.box(x, y + 0.12, 0.42, 0.36, 0.08, 0.36, color, { bevel: 0.03 });
  gb.cyl(x, y + 0.2, 0.42, 0.12, 0.03, 0.14, 6, color);
  gb.box(x, y - 0.38, 0.42, 0.36, 0.08, 0.36, color, { bevel: 0.03 });
}

/** drain pipe down a corner, on the current wall frame */
export function drainpipe(gb: GB, x: number, h: number, color = "#3a3a3a") {
  gb.cyl(x, 0.1, 0.14, 0.07, 0.07, h - 0.4, 6, color);
  gb.box(x, h - 0.4, 0.1, 0.3, 0.16, 0.3, color, {});
  gb.cyl(x, 0.0, 0.14, 0.07, 0.07, 0.4, 6, color, { rx: 0.9 });
}

/** classical column with base and capital */
export function column(gb: GB, x: number, z: number, h: number, r: number, color = "#efeae0") {
  gb.box(x, 0, z, r * 2.6, 0.3, r * 2.6, shade(color, 0.9), { bevel: 0.04 });
  gb.cyl(x, 0.3, z, r, r * 0.9, h - 0.8, 10, color);
  gb.box(x, h - 0.5, z, r * 2.6, 0.5, r * 2.6, color, { bevel: 0.06 });
}

/** triangular pediment across the front columns (ridge along x) */
export function pediment(gb: GB, w: number, y0: number, depth: number, rise: number, color: string, trim: string) {
  gb.box(0, y0, 0, w, 0.45, depth, color, { bevel: 0.05 });
  gb.push(0, 0, 0);
  gableEnds(gb, w, depth, y0 + 0.45, rise, color, "z");
  roofGable(gb, w, depth, y0 + 0.45, rise, { color: trim, trim, overhang: 0.25, thick: 0.18, ridgeAxis: "z" });
  gb.pop();
}

/** wooden picket fence run from (x0,z0) to (x1,z1) in the current frame, on level ground */
export function picketRun(gb: GB, x0: number, z0: number, x1: number, z1: number, color = "#e8e0cc", h = 1.0) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
  gb.push((x0 + x1) / 2, 0, (z0 + z1) / 2, ry);
  gb.box(0, h * 0.35, 0, len, 0.08, 0.05, color, {});
  gb.box(0, h * 0.8, 0, len, 0.08, 0.05, color, {});
  const n = Math.max(1, Math.round(len / 0.3));
  for (let i = 0; i <= n; i++) gb.box(-len / 2 + (len * i) / n, 0, 0, 0.1, h, 0.04, color, {});
  gb.pop();
}

/** low stone wall run */
export function stoneWallRun(gb: GB, x0: number, z0: number, x1: number, z1: number, color = "#8d877c", h = 0.9) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
  gb.push((x0 + x1) / 2, 0, (z0 + z1) / 2, ry);
  gb.box(0, 0, 0, len, h, 0.5, color, { bevel: 0.06 });
  gb.box(0, h, 0, len + 0.1, 0.14, 0.62, shade(color, 1.1), { bevel: 0.04 });
  const n = Math.floor(len / 0.9);
  for (let i = 0; i < n; i++) gb.box(-len / 2 + 0.45 + i * 0.9, 0.15 + (i % 3) * 0.22, 0.25, 0.5, 0.2, 0.04, shade(color, 0.82), {});
  gb.pop();
}

/** hedge run (rounded green box) */
export function hedgeRun(gb: GB, x0: number, z0: number, x1: number, z1: number, color = "#4e8f3e", h = 1.1, t = 0.8) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
  gb.push((x0 + x1) / 2, 0, (z0 + z1) / 2, ry);
  gb.box(0, 0, 0, len, h, t, color, { bevel: 0.25 });
  gb.pop();
}

/** flagstone path from (x,z) going along +z for `len`, in the current frame */
export function path(gb: GB, x: number, z: number, len: number, w = 1.4, color = "#b5ad9f") {
  const n = Math.max(1, Math.round(len / 0.9));
  for (let i = 0; i < n; i++) gb.box(x + (i % 2 ? 0.08 : -0.08), 0.01, z + (i + 0.5) * (len / n), w, 0.08, len / n - 0.12, i % 2 ? shade(color, 0.93) : color, { bevel: 0.03 });
}

/** simple flagpole; returns the top position */
export function flagpole(gb: GB, x: number, z: number, h: number, flag: string, base = true): V3 {
  if (base) gb.cyl(x, 0, z, 0.5, 0.4, 0.4, 8, "#9a948a");
  gb.cyl(x, 0.4, z, 0.08, 0.05, h, 6, "#e8e2d4");
  gb.sphere(x, h + 0.45, z, 0.1, "#d3a74a");
  void flag; // the flag itself is animated by the life layer from L.flagPoles
  return [x, h + 0.4, z];
}

/** bench (slatted) at origin of the current frame, facing +z */
export function benchEl(gb: GB, x: number, z: number, ry: number, wood = "#8b5a3c", iron = "#3a3a3a") {
  gb.push(x, 0, z, ry);
  for (let i = 0; i < 3; i++) gb.box(0, 0.42, -0.2 + i * 0.16, 1.8, 0.06, 0.13, wood, { bevel: 0.01 });
  for (let i = 0; i < 2; i++) gb.box(0, 0.6 + i * 0.2, -0.3, 1.8, 0.13, 0.05, wood, { bevel: 0.01, rx: -0.15 });
  for (const s of [-1, 1]) { gb.box(s * 0.75, 0, 0, 0.06, 0.42, 0.5, iron, {}); gb.box(s * 0.75, 0.42, -0.3, 0.06, 0.55, 0.06, iron, { rx: -0.15 }); }
  gb.pop();
}

/** barrel (staved cylinder with hoops) */
export function barrel(gb: GB, x: number, z: number, r = 0.42, h = 1.0, color = "#8b5a3c", onSide = false) {
  const o = onSide ? { rx: Math.PI / 2, anchor: "center" as const } : {};
  const y = onSide ? r : 0;
  gb.cyl(x, y, z, r * 0.88, r, h / 2, 10, (i) => (i % 2 ? color : shade(color, 0.9)), o);
  gb.cyl(x, onSide ? y : h / 2, z, r, r * 0.88, h / 2, 10, (i) => (i % 2 ? color : shade(color, 0.9)), onSide ? { rx: Math.PI / 2, anchor: "center" } : {});
  if (!onSide) { gb.cyl(x, h * 0.2, z, r * 0.99 + 0.02, r * 0.99 + 0.02, 0.08, 10, "#3a3a3a"); gb.cyl(x, h * 0.75, z, r * 0.99 + 0.02, r * 0.99 + 0.02, 0.08, 10, "#3a3a3a"); }
}

/** crate */
export function crate(gb: GB, x: number, y: number, z: number, s = 0.9, color = "#b08a5a", ry = 0) {
  gb.box(x, y, z, s, s * 0.8, s, color, { bevel: 0.03, ry });
  gb.push(x, y, z, ry);
  for (const sz of [-1, 1]) { gb.box(0, s * 0.05, sz * s / 2, s, 0.08, 0.04, shade(color, 0.75), {}); gb.box(0, s * 0.68, sz * s / 2, s, 0.08, 0.04, shade(color, 0.75), {}); gb.box(0, 0, sz * s / 2, s * 0.9, s * 0.8, 0.03, shade(color, 0.85), {}); }
  gb.pop();
}
