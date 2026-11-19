/**
 * Faceted ground mesh: non-uniform grid (2.5 m in the playable area, coarse
 * far out), non-indexed so every triangle carries its own flat colour, and
 * layered vertex colours by height / slope / shore zone / moisture.
 */
import * as THREE from "three";
import { clamp, smooth } from "../palette";
import { coastDist, terrainHeight, hillWeight, townWeight, pointWeight, shoreZones, roadDistKind, POND, POND_Y } from "../terrain";
import { fbm, hash2 } from "./noise";

const C = (hex: string) => new THREE.Color(hex);
const PAL = {
  seabedShallow: C("#c9c08f"), seabedMid: C("#4f8f8c"), seabedDeep: C("#213f5c"),
  wetSand: C("#c4ad7a"), sand: C("#e8d7a4"), duneGrass: C("#b4bd63"),
  meadow: C("#5c9a43"), meadowLight: C("#88b955"), meadowDark: C("#3f7d33"), lawn: C("#66a648"),
  hillGrass: C("#5b9040"), dryGrass: C("#a9a35a"), heather: C("#857a70"),
  rock: C("#8b8579"), rockDark: C("#6d675d"), cliff: C("#9a8f7e"),
  dirt: C("#8d7350"), mud: C("#6f5a3c"), quay: C("#9d998e"),
  pondBed: C("#5c6b46"),
  meadowGold: C("#a6ad4c"), clover: C("#3c8a46"), bloomPink: C("#b3828a"), bloomYellow: C("#c8bd52"),
};

const _c = new THREE.Color(), _t = new THREE.Color();

/** vertex colour for the ground at (mx,my) — pure, allocation-free */
export function groundColor(mx: number, my: number, h: number, slope: number, out: THREE.Color): THREE.Color {
  const d = coastDist(mx, my);
  const z = shoreZones(mx, my);
  const pw = pointWeight(mx, my);
  const hw = hillWeight(mx, my);
  const tw = townWeight(mx, my);
  const nLow = fbm(mx / 55, my / 55, 3, 21);        // meadow patchiness
  const nHi = fbm(mx / 9, my / 9, 2, 22);          // fine speckle
  if (d < 0) {
    // sea bed seen through the shallows
    out.copy(PAL.seabedShallow).lerp(PAL.seabedMid, smooth(-d / 14)).lerp(PAL.seabedDeep, smooth((-d - 12) / 40));
    if (pw > 0.2) out.lerp(PAL.rockDark, pw * 0.7 * smooth(-d / 4 + 1));
    return out.multiplyScalar(1 + 0.05 * nHi);
  }
  // base grass with patchiness
  out.copy(PAL.meadow).lerp(PAL.meadowLight, 0.5 + 0.5 * nLow);
  const nMid = fbm(mx / 22, my / 22, 2, 23);
  out.lerp(PAL.meadowDark, clamp(0.5 + 0.9 * nMid, 0, 1) * 0.6);
  out.lerp(PAL.dryGrass, clamp((nLow - 0.25) * 2.2, 0, 1) * 0.35 * (1 - tw));
  out.lerp(PAL.lawn, tw * 0.55);
  // meadow variety (visual pass, Nov 2026 — wide even green read as empty from the overview):
  // sun-bleached golden swathes, lush clover hollows and faint wildflower tints, all low-frequency
  // so they read as fields of different grass, kept mostly out of the town's lawns
  const open = 1 - tw * 0.7;
  const nGold = fbm(mx / 34 + 7.1, my / 34 - 3.3, 2, 31);
  out.lerp(PAL.meadowGold, smooth((nGold - 0.12) / 0.32) * 0.5 * open);
  const nLush = fbm(mx / 27 - 11.7, my / 27 + 5.2, 2, 32);
  out.lerp(PAL.clover, smooth((nLush - 0.18) / 0.3) * 0.45 * open);
  const nBloom = fbm(mx / 16 + 2.3, my / 16 + 9.9, 2, 33);
  const bloomT = smooth((nBloom - 0.32) / 0.2) * 0.32 * open;
  out.lerp(nHi > 0 ? PAL.bloomPink : PAL.bloomYellow, bloomT);
  // hills: darker/olive with dry patches and heather near the crest
  const hillT = clamp(hw * 1.2, 0, 1);
  out.lerp(PAL.hillGrass, hillT * 0.8);
  out.lerp(PAL.dryGrass, hillT * smooth((h - 9) / 5) * (0.35 + 0.35 * nLow));
  out.lerp(PAL.heather, smooth((h - 13) / 5) * 0.4 * (0.5 + 0.5 * nHi));
  // backdrop ridges: greyer and drier with height
  out.lerp(PAL.dryGrass, smooth((h - 16) / 8) * 0.5);
  // shore: sand → dune grass → meadow
  const sandT = z.beach * (1 - smooth((d - 9) / 8));
  const wet = 1 - smooth((d - 1.5) / 2.5);
  _t.copy(PAL.sand).lerp(PAL.wetSand, wet);
  out.lerp(_t, sandT);
  out.lerp(PAL.duneGrass, z.beach * smooth((d - 7) / 5) * (1 - smooth((d - 22) / 12)) * 0.75);
  // harbour quay: stone grey apron
  out.lerp(PAL.quay, z.quay * (1 - smooth((d - 6) / 4)));
  // rock on steep slopes and on the point / cliff faces
  const rockT = smooth((slope - 0.45) / 0.35);
  _t.copy(PAL.rock).lerp(PAL.rockDark, 0.5 + 0.5 * nHi);
  out.lerp(_t, rockT);
  out.lerp(PAL.cliff, z.cliff * (1 - smooth((d - 5) / 3)) * 0.85);
  out.lerp(_t, pw * (0.55 + 0.3 * nHi) * (1 - smooth((d - 3) / 6) * 0.5));
  // road verges: dusty/worn strips beside tarmac and cobbles so the ribbons blend into the grass
  const tdist = roadDistKind(mx, my, "tarmac"), cdist = roadDistKind(mx, my, "cobble");
  _t.copy(PAL.quay).lerp(PAL.dirt, 0.45);
  out.lerp(_t, (1 - smooth((tdist - 3.0) / 2.6)) * 0.55 + (1 - smooth((cdist - 3.2) / 2.2)) * 0.35);
  // worn dirt: dirt tracks, docks, workshop row
  const dd = roadDistKind(mx, my, "dirt");
  const dirtT = 1 - smooth((dd - 1.8) / 3.6);
  const docks = Math.exp(-((mx - 26) ** 2 + (my - 268) ** 2) / (2 * 16 * 16));
  const shop = Math.exp(-((mx - 245) ** 2 + (my - 185) ** 2) / (2 * 20 * 20));
  _t.copy(PAL.dirt).lerp(PAL.mud, 0.5 + 0.5 * nHi);
  out.lerp(_t, clamp(dirtT * 0.85 + docks * 0.7 + shop * 0.6, 0, 0.9) * (1 - sandT));
  // pond bed
  const pr = Math.hypot(mx - POND.mx, my - POND.my);
  out.lerp(PAL.pondBed, 1 - smooth((pr - POND.r) / 2.5));
  // speckle
  return out.multiplyScalar(1 + 0.06 * nHi);
}

/** axis coordinates: fine inside [a,b], coarse outside to [lo,hi] */
function axis(lo: number, a: number, b: number, hi: number, fine: number, coarse: number): number[] {
  const xs: number[] = [];
  for (let v = lo; v < a; v += coarse) xs.push(v);
  for (let v = a; v <= b + 1e-6; v += fine) xs.push(v);
  for (let v = b + coarse; v <= hi + 1e-6; v += coarse) xs.push(v);
  return xs;
}

export interface GroundBuild { geometry: THREE.BufferGeometry; triangles: number }

export function buildFacetedGround(fine = 2.5): GroundBuild {
  const xs = axis(-260, -70, 370, 560, fine, 18);
  const ys = axis(-260, -70, 370, 560, fine, 18);
  const nx = xs.length, ny = ys.length;
  const H = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = terrainHeight(xs[i], ys[j]);
  const tris = (nx - 1) * (ny - 1) * 2;
  const pos = new Float32Array(tris * 9);
  const col = new Float32Array(tris * 9);
  let k = 0;
  const slopeAt = (i: number, j: number) => {
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(ny - 1, j + 1);
    const dx = (H[j * nx + i1] - H[j * nx + i0]) / (xs[i1] - xs[i0]);
    const dy = (H[j1 * nx + i] - H[j0 * nx + i]) / (ys[j1] - ys[j0]);
    return Math.hypot(dx, dy);
  };
  const push = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, ha: number, hb: number, hc: number, r: number, g: number, b: number) => {
    pos[k] = ax; pos[k + 1] = ha; pos[k + 2] = -ay; col[k] = r; col[k + 1] = g; col[k + 2] = b;
    pos[k + 3] = bx; pos[k + 4] = hb; pos[k + 5] = -by; col[k + 3] = r; col[k + 4] = g; col[k + 5] = b;
    pos[k + 6] = cx; pos[k + 7] = hc; pos[k + 8] = -cy; col[k + 6] = r; col[k + 7] = g; col[k + 8] = b;
    k += 9;
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
      const h00 = H[j * nx + i], h10 = H[j * nx + i + 1], h01 = H[(j + 1) * nx + i], h11 = H[(j + 1) * nx + i + 1];
      // alternate the diagonal for a less regular facet pattern
      const flip = hash2(i, j, 4) > 0.5;
      const sl = (slopeAt(i, j) + slopeAt(i + 1, j + 1)) * 0.5;
      // colour sampled at each triangle centroid, with a per-face jitter
      const tri = (ax: number, ay: number, ha: number, bx: number, by: number, hb: number, cx: number, cy: number, hc: number, seed: number) => {
        const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mh = (ha + hb + hc) / 3;
        groundColor(mx, my, mh, sl, _c);
        const j2 = 1 + (hash2(i, j, seed) - 0.5) * 0.13;
        push(ax, ay, bx, by, cx, cy, ha, hb, hc, _c.r * j2, _c.g * j2, _c.b * j2);
      };
      if (!flip) {
        tri(x0, y0, h00, x1, y0, h10, x0, y1, h01, 7);
        tri(x1, y0, h10, x1, y1, h11, x0, y1, h01, 8);
      } else {
        tri(x0, y0, h00, x1, y0, h10, x1, y1, h11, 7);
        tri(x0, y0, h00, x1, y1, h11, x0, y1, h01, 8);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); // non-indexed → true face normals
  g.computeBoundingSphere();
  return { geometry: g, triangles: tris };
}

/** flat pond disc geometry (world space) */
export function buildPondGeometry(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(POND.r + 1.6, 24);
  g.rotateX(-Math.PI / 2);
  g.translate(POND.mx, POND_Y, -POND.my);
  return g;
}

/** field patch with furrow stripes as vertex colours (terrain-following) */
export function buildFieldGeometry(cx: number, cy: number, w: number, d: number, color: string, yOff = 0.05): THREE.BufferGeometry {
  const segW = Math.max(6, Math.round(w / 1.6)), segD = Math.max(4, Math.round(d / 2.2));
  const tris = segW * segD * 2;
  const pos = new Float32Array(tris * 9), col = new Float32Array(tris * 9);
  const base = new THREE.Color(color);
  const dark = base.clone().multiplyScalar(0.78), light = base.clone().multiplyScalar(1.12);
  let k = 0;
  const v = (mx: number, my: number, c: THREE.Color) => { pos[k] = mx; pos[k + 1] = terrainHeight(mx, my) + yOff; pos[k + 2] = -my; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; k += 3; };
  for (let j = 0; j < segD; j++) for (let i = 0; i < segW; i++) {
    const x0 = cx - w / 2 + (w * i) / segW, x1 = cx - w / 2 + (w * (i + 1)) / segW;
    const y0 = cy - d / 2 + (d * j) / segD, y1 = cy - d / 2 + (d * (j + 1)) / segD;
    const c = (i % 2 === 0 ? dark : light).clone().multiplyScalar(1 + (hash2(i, j, 31) - 0.5) * 0.08);
    v(x0, y0, c); v(x1, y0, c); v(x0, y1, c);
    v(x1, y0, c); v(x1, y1, c); v(x0, y1, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
