/**
 * Procedural terrain model for Solmere. Everything is a pure function of metre
 * coordinates (mx, my) from town.json — origin bottom-left, my = "north".
 * World mapping: x = mx, z = -my, y = terrainHeight(mx, my).
 *
 * Geography (metres): the sea lies west of mx≈0 and north of my≈303. The
 * north-west corner is a rocky point with the lighthouse; east of it a sandy
 * bay (the beach, mx 20–90); the west coast has the harbour quays (my 240–292)
 * and low cliffs elsewhere. The hill farms sit on a rise centred near
 * (245, 22) that climbs ~11 m, with taller backdrop ridges beyond the map edge.
 *
 * Exports used by other agents (keep stable): terrainHeight, WATER_Y, coastDist,
 * hillWeight, roadDist, ROADS, toWorld, worldToMetres, buildGroundGeometry,
 * buildPatchGeometry, buildRoadGeometry.
 */
import * as THREE from "three";
import { clamp, smooth } from "./palette";
import { fbm, ridged } from "./env/noise";

export const WATER_Y = -0.45;
export const MAP = 300;

/* --------------------------------- helpers --------------------------------- */

const bell = (v: number, c: number, s: number) => Math.exp(-((v - c) * (v - c)) / (2 * s * s));
const window1 = (v: number, a: number, b: number, w: number) => smooth((v - a) / w) * (1 - smooth((v - b) / w));

/** x of the west coastline for a given my */
export function westLine(my: number): number {
  return -3 + 3.5 * Math.sin(my * 0.05 + 0.4) + 2 * Math.sin(my * 0.13) + 14 * bell(my, 277, 11);
}
/** my of the north coastline for a given mx */
export function northLine(mx: number): number {
  return 303 + 3 * Math.sin(mx * 0.045 + 1) + 2 * Math.sin(mx * 0.12) + 9 * bell(mx, 6, 11) - 3 * bell(mx, 58, 26);
}

/** signed distance to the coastline in metres; positive on land, negative at sea. */
export function coastDist(mx: number, my: number): number {
  const dn = northLine(mx) - my;
  const dw = mx - westLine(my);
  const k = 12;
  const h = Math.max(k - Math.abs(dn - dw), 0) / k;
  return Math.min(dn, dw) - h * h * k * 0.25;
}

/** weight of the farm hill 0..1 */
export function hillWeight(mx: number, my: number): number {
  const dx = mx - 245, dy = my - 22;
  return Math.exp(-(dx * dx + dy * dy) / (2 * 58 * 58));
}

/** 1 in the built-up centre, fading out — used to keep the streets calm */
export function townWeight(mx: number, my: number): number {
  const dx = mx - 150, dy = my - 150;
  return Math.exp(-(dx * dx + dy * dy) / (2 * 95 * 95));
}

/** the rocky lighthouse point 0..1 */
export function pointWeight(mx: number, my: number): number {
  const r = Math.hypot(mx - 8, my - 302);
  return 1 - smooth((r - 9) / 13);
}

export const POND = { mx: 100, my: 68, r: 6.5, depth: 1.0 };

/** coastal zone weights for a point (which kind of shore is nearest) */
export function shoreZones(mx: number, my: number): { beach: number; quay: number; cliff: number; wN: number } {
  const dn = northLine(mx) - my, dw = mx - westLine(my);
  const wN = clamp((dw - dn) / 10 + 0.5, 0, 1);
  const beach = wN * window1(mx, 18, 92, 12) * (1 - pointWeight(mx, my));
  const quay = (1 - wN) * window1(my, 228, 294, 10) * (1 - pointWeight(mx, my) * 0.5);
  const cliff = clamp(1 - beach - quay, 0, 1);
  return { beach, quay, cliff, wN };
}

/* --------------------------------- height --------------------------------- */

export function terrainHeight(mx: number, my: number): number {
  const d = coastDist(mx, my);
  const z = shoreZones(mx, my);
  const pw = pointWeight(mx, my);
  const hw = hillWeight(mx, my);
  const tw = townWeight(mx, my);
  const cliffH = 3.2 + 1.2 * Math.sin(mx * 0.031 + my * 0.023) + 2.5 * pw;
  let h: number;
  if (d < 0) {
    // sea bed: gentle in the bay, steeper under the cliffs, then deep water
    const shallow = z.beach * (-0.7 + d * 0.085) + z.quay * (-1.4 + d * 0.12) + z.cliff * (-1.1 + d * 0.22);
    h = shallow - 0.55 * Math.max(0, -d - 26) - 0.35 * Math.max(0, -d - 70);
    h += 0.35 * fbm(mx / 9, my / 9, 2, 3) * smooth(-d / 6); // rocks + ripples on the bed
    h += 1.8 * pw * smooth(-d / 3) * (0.4 + ridged(mx / 7, my / 7, 2, 9)); // reef off the point
    if (h < -32) h = -32;
  } else {
    const base = 1.8 + 1.2 * smooth((d - 25) / 120); // inland level: 1.8 near the coast → 3.0 deep inland
    const hs = -0.35 + 0.8 * smooth(d / 14) + (base - 0.45) * smooth((d - 10) / 26);
    const hq = 1.1 * smooth(d / 2.5) + (base - 1.1) * smooth((d - 4) / 30);
    const hc = smooth(d / 4.5) * (cliffH + (base - cliffH) * smooth((d - 10) / 45));
    h = z.beach * hs + z.quay * hq + z.cliff * hc;
    // low-frequency undulation, calmer in town, stronger on the hills and beyond
    const n = fbm(mx / 42, my / 42, 4, 1);
    h += n * (0.3 + 0.9 * (1 - tw) * smooth((d - 20) / 40) + 1.6 * hw);
    // sand ripples on the beach
    h += z.beach * 0.05 * Math.sin(my * 1.7 + Math.sin(mx * 0.35) * 1.2) * smooth((d - 1) / 3) * (1 - smooth((d - 12) / 6));
  }
  // the farm hill + rocky crest
  h += 9.5 * hw + 1.4 * hw * hw * ridged(mx / 30, my / 30, 3, 5);
  // the rocky point
  h += 3.2 * pw * smooth(d / 3);
  // backdrop ridges beyond the map (south + east), then the land falls back into the sea
  const r1 = Math.exp(-((mx - 310) ** 2) / (2 * 80 * 80) - ((my + 70) ** 2) / (2 * 40 * 40));
  const r2 = Math.exp(-((mx - 150) ** 2) / (2 * 70 * 70) - ((my + 80) ** 2) / (2 * 40 * 40));
  const r3 = Math.exp(-((mx - 395) ** 2) / (2 * 60 * 60) - ((my - 130) ** 2) / (2 * 80 * 80));
  const r4 = Math.exp(-((mx - 60) ** 2) / (2 * 55 * 55) - ((my + 95) ** 2) / (2 * 38 * 38));
  const ridges = 22 * r1 + 16 * r2 + 13 * r3 + 12 * r4;
  h += ridges * smooth(d / 10) + ridges * 0.12 * ridged(mx / 24, my / 24, 3, 6);
  h -= 30 * smooth((-my - 175) / 70) + 30 * smooth((mx - 470) / 70);
  // Tide Park pond
  const pr = Math.hypot(mx - POND.mx, my - POND.my);
  h -= POND.depth * smooth((POND.r + 2.5 - pr) / 4.5);
  return h;
}

/** world position for a metre coordinate */
export function toWorld(mx: number, my: number, yOff = 0): [number, number, number] {
  return [mx, terrainHeight(mx, my) + yOff, -my];
}
export const worldToMetres = (x: number, z: number): [number, number] => [x, -z];

/** surface height of the park pond (world y) */
export const POND_Y = terrainHeight(POND.mx + POND.r + 5, POND.my) - 0.32;

/** slope magnitude (dh/dm) by central difference */
export function terrainSlope(mx: number, my: number, e = 1.2): number {
  const dx = terrainHeight(mx + e, my) - terrainHeight(mx - e, my);
  const dy = terrainHeight(mx, my + e) - terrainHeight(mx, my - e);
  return Math.hypot(dx, dy) / (2 * e);
}

/* ---------------------------------- roads ---------------------------------- */

export type Polyline = [number, number][];
export type RoadKind = "cobble" | "tarmac" | "dirt";
export interface Road { pts: Polyline; kind: RoadKind; width: number }

/** Road network in metres, with surface type. */
export const ROAD_SPECS: Road[] = [
  { pts: [[32, 262], [45, 238], [70, 215], [110, 182]], kind: "tarmac", width: 5.2 },          // harbour road
  { pts: [[104, 180], [216, 180]], kind: "cobble", width: 6 },                                // Main Street
  { pts: [[150, 180], [150, 146]], kind: "cobble", width: 5.5 },                              // Main Street → square
  { pts: [[170, 112], [200, 148], [216, 180]], kind: "cobble", width: 5 },                    // square → workshop row
  { pts: [[216, 180], [240, 180], [262, 192]], kind: "cobble", width: 5 },                    // workshop row
  { pts: [[240, 180], [250, 168], [256, 152], [242, 110], [228, 80], [212, 52], [262, 52]], kind: "dirt", width: 4.2 }, // hill track
  { pts: [[236, 52], [238, 30]], kind: "dirt", width: 3.4 },                                  // orchard spur
  { pts: [[184, 180], [198, 212], [214, 248], [238, 278]], kind: "cobble", width: 4.6 },      // Salt Lane
  { pts: [[130, 120], [96, 110], [80, 92], [62, 76]], kind: "cobble", width: 4.6 },           // Gull Lane
  { pts: [[96, 110], [80, 118], [62, 122]], kind: "cobble", width: 4 },                       // to chapel
  { pts: [[112, 100], [112, 74]], kind: "dirt", width: 3.2 },                                 // school → park
  { pts: [[150, 96], [140, 74], [122, 62]], kind: "cobble", width: 4 },                       // south lane
  { pts: [[32, 262], [50, 284], [70, 286]], kind: "tarmac", width: 4.6 },                     // shore road
  { pts: [[50, 284], [30, 290], [16, 292]], kind: "dirt", width: 3 },                         // lighthouse path
  { pts: [[45, 238], [62, 232]], kind: "cobble", width: 3.6 },                                // Chen's
  { pts: [[32, 262], [22, 280]], kind: "tarmac", width: 4.6 },                                // docks
];
export const ROADS: Polyline[] = ROAD_SPECS.map((r) => r.pts);

function segDist(pts: Polyline, mx: number, my: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const vx = bx - ax, vy = by - ay, wx = mx - ax, wy = my - ay;
    const t = clamp((vx * wx + vy * wy) / (vx * vx + vy * vy || 1), 0, 1);
    const dx = ax + vx * t - mx, dy = ay + vy * t - my;
    const dd = dx * dx + dy * dy;
    if (dd < best) best = dd;
  }
  return Math.sqrt(best);
}

/** distance from a point to the road network (metres) */
export function roadDist(mx: number, my: number): number {
  let best = Infinity;
  for (const r of ROADS) { const d = segDist(r, mx, my); if (d < best) best = d; }
  return best;
}
/** distance to the nearest road of a given kind */
export function roadDistKind(mx: number, my: number, kind: RoadKind): number {
  let best = Infinity;
  for (const r of ROAD_SPECS) { if (r.kind !== kind) continue; const d = segDist(r.pts, mx, my); if (d < best) best = d; }
  return best;
}

/* ------------------------------ ground geometry ------------------------------ */

/** Ground mesh (the detailed builder lives in env/terrainGeometry). Kept for API stability. */
export function buildGroundGeometry(size = 760, seg = 152): THREE.BufferGeometry {
  const n = (seg + 1) * (seg + 1);
  const pos = new Float32Array(n * 3);
  const x0 = 150 - size / 2, y0 = 150 - size / 2, step = size / seg;
  let k = 0;
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
    const mx = x0 + i * step, my = y0 + j * step;
    pos[k * 3] = mx; pos[k * 3 + 1] = terrainHeight(mx, my); pos[k * 3 + 2] = -my; k++;
  }
  const idx: number[] = [];
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + 1, cI = a + seg + 1, d = cI + 1;
    idx.push(a, b, cI, b, d, cI);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A terrain-following rectangular patch (plaza, field, sand) at yOff above ground. */
export function buildPatchGeometry(cx: number, cy: number, w: number, d: number, yOff = 0.05, segW = 8, segD = 8): THREE.BufferGeometry {
  const n = (segW + 1) * (segD + 1);
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let k = 0;
  for (let j = 0; j <= segD; j++) for (let i = 0; i <= segW; i++) {
    const mx = cx - w / 2 + (w * i) / segW, my = cy - d / 2 + (d * j) / segD;
    pos[k * 3] = mx; pos[k * 3 + 1] = terrainHeight(mx, my) + yOff; pos[k * 3 + 2] = -my;
    uv[k * 2] = i / segW; uv[k * 2 + 1] = j / segD;
    k++;
  }
  const idx: number[] = [];
  for (let j = 0; j < segD; j++) for (let i = 0; i < segW; i++) {
    const a = j * (segW + 1) + i, b = a + 1, c = a + segW + 1, dd = c + 1;
    idx.push(a, b, c, b, dd, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Resample a polyline every `step` metres → [x, y, tx, ty] samples (tangent normalised). */
export function sampleRoad(pts: Polyline, step = 2.5): [number, number, number, number][] {
  const samples: [number, number, number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / step));
    const tx = (bx - ax) / len, ty = (by - ay) / len;
    for (let s = 0; s <= n; s++) {
      if (s === n && i < pts.length - 2) continue; // shared corner handled by next segment
      const t = s / n;
      samples.push([ax + (bx - ax) * t, ay + (by - ay) * t, tx, ty]);
    }
  }
  // smooth tangents at corners
  for (let i = 1; i < samples.length - 1; i++) {
    const p = samples[i - 1], q = samples[i + 1];
    const tx = q[0] - p[0], ty = q[1] - p[1], l = Math.hypot(tx, ty) || 1;
    samples[i][2] = tx / l; samples[i][3] = ty / l;
  }
  return samples;
}

/**
 * One merged ribbon geometry for a set of roads (default: all), following the terrain,
 * with uv.x across (0..1) and uv.y along (metres) for surface textures.
 */
export function buildRoadGeometry(width = 5, yOff = 0.07, roads: Road[] = ROAD_SPECS, offset = 0, widthOverride?: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const pushRibbon = (pts: Polyline, w: number) => {
    const samples = sampleRoad(pts, 2.5);
    const base = pos.length / 3;
    let along = 0;
    for (let i = 0; i < samples.length; i++) {
      const [x, y, tx, ty] = samples[i];
      if (i > 0) along += Math.hypot(x - samples[i - 1][0], y - samples[i - 1][1]);
      const nx = -ty, ny = tx;
      const l: [number, number] = [x + nx * (offset + w / 2), y + ny * (offset + w / 2)], r: [number, number] = [x + nx * (offset - w / 2), y + ny * (offset - w / 2)];
      pos.push(l[0], terrainHeight(l[0], l[1]) + yOff, -l[1]); uv.push(0, along);
      pos.push(r[0], terrainHeight(r[0], r[1]) + yOff, -r[1]); uv.push(1, along);
    }
    for (let i = 0; i < samples.length - 1; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    if (offset === 0) {
      const cap = (cx: number, cy: number) => {
        const c0 = pos.length / 3;
        pos.push(cx, terrainHeight(cx, cy) + yOff, -cy); uv.push(0.5, 0);
        const N = 12;
        for (let k = 0; k <= N; k++) {
          const a = (k / N) * Math.PI * 2;
          const px = cx + Math.cos(a) * w / 2, py = cy + Math.sin(a) * w / 2;
          pos.push(px, terrainHeight(px, py) + yOff, -py); uv.push(0.5 + Math.cos(a) * 0.5, Math.sin(a) * w / 2);
        }
        for (let k = 0; k < N; k++) idx.push(c0, c0 + 1 + k, c0 + 2 + k);
      };
      cap(pts[0][0], pts[0][1]);
      cap(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      for (let i = 1; i < pts.length - 1; i++) cap(pts[i][0], pts[i][1]);
    }
  };
  for (const r of roads) pushRibbon(r.pts, widthOverride ?? r.width ?? width);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
