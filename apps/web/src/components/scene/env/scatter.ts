/**
 * Deterministic placement of vegetation and shore props, driven by the terrain
 * model, town.json districts and the building footprints from buildings/layout.
 */
import * as THREE from "three";
import type { TownContent } from "@npcworld/schema";
import { footprints, type TownLayout, type Xf } from "../buildings/layout";
import { coastDist, terrainHeight, hillWeight, townWeight, pointWeight, shoreZones, roadDist, terrainSlope, POND, westLine, northLine } from "../terrain";
import { rng, smooth, clamp } from "../palette";
import { fbm } from "./noise";

export interface Scatter {
  oaks: Xf[]; pines: Xf[]; coastalPines: Xf[]; poplars: Xf[];
  bushes: Xf[]; hedges: Xf[]; flowers: Xf[]; reeds: Xf[]; grass: Xf[];
  rocks: Xf[]; boulders: Xf[]; driftwood: Xf[];
}

const PLAZA = { cx: 150, cy: 121, w: 46, d: 56 };
const _c = new THREE.Color();

/** vary a colour: hue shift + luminance jitter, returns hex */
function vary(hex: string, r: () => number, hue = 0.03, lum = 0.14, sat = 0.1): string {
  _c.set(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  _c.getHSL(hsl);
  _c.setHSL((hsl.h + (r() - 0.5) * hue * 2 + 1) % 1, clamp(hsl.s + (r() - 0.5) * sat * 2, 0, 1), clamp(hsl.l * (1 + (r() - 0.5) * lum * 2), 0, 1));
  return "#" + _c.getHexString();
}

export function scatterTown(town: TownContent, L: TownLayout): Scatter {
  const S: Scatter = { oaks: [], pines: [], coastalPines: [], poplars: [], bushes: [], hedges: [], flowers: [], reeds: [], grass: [], rocks: [], boulders: [], driftwood: [] };
  const r = rng(2024);

  /* ------------------------------ exclusion ------------------------------ */
  interface Box { mx: number; my: number; w: number; d: number; yaw: number }
  const boxes: Box[] = [];
  for (const b of L.buildings) {
    const s = b.spec;
    if (s.kind === "building" || s.kind === "market" || s.kind === "farm" || s.kind === "orchard" || s.kind === "stall") boxes.push({ mx: b.x, my: -b.z, w: s.w + (s.silo ? 5 : 0), d: s.d, yaw: b.yaw });
    else if (s.kind === "lighthouse") boxes.push({ mx: b.x, my: -b.z, w: 7, d: 7, yaw: 0 });
    else if (s.kind === "docks") boxes.push({ mx: b.x, my: -b.z, w: 26, d: 22, yaw: 0 });
  }
  for (const f of L.fields) boxes.push({ mx: f.cx, my: f.cy, w: f.w, d: f.d, yaw: 0 });
  // the exact footprints layoutTown registered for the NPC runtime (already includes per-building offsets)
  for (const f of footprints) boxes.push({ mx: f.mx, my: f.my, w: f.w, d: f.d, yaw: f.yaw });
  const inBox = (mx: number, my: number, margin: number) => {
    for (const b of boxes) {
      const dx = mx - b.mx, dz = -(my - b.my);
      const c = Math.cos(-b.yaw), s = Math.sin(-b.yaw);
      const lx = dx * c + dz * s, lz = -dx * s + dz * c;
      if (Math.abs(lx) <= b.w / 2 + margin && Math.abs(lz) <= b.d / 2 + margin) return true;
    }
    return false;
  };
  const inPlaza = (mx: number, my: number, margin: number) => Math.abs(mx - PLAZA.cx) < PLAZA.w / 2 + margin && Math.abs(my - PLAZA.cy) < PLAZA.d / 2 + margin;
  const nearPond = (mx: number, my: number, margin: number) => Math.hypot(mx - POND.mx, my - POND.my) < POND.r + margin;
  /** places people gather — keep the director's orbit clear of trunks */
  const gather: { x: number; y: number; r: number }[] = [];
  for (const l of town.locations) gather.push({ x: l.pos[0], y: l.pos[1], r: l.type === "home" ? 5 : l.type === "open" ? 6 : 9 });
  const nearGather = (mx: number, my: number, extra = 0) => gather.some((g) => Math.hypot(g.x - mx, g.y - my) < g.r + extra);
  const treeSpots: [number, number, number][] = []; // x, y, radius (spacing)
  const spaced = (mx: number, my: number, rad: number) => treeSpots.every(([x, y, rr]) => Math.hypot(x - mx, y - my) > rad + rr);

  const clearForTree = (mx: number, my: number, spacing: number) =>
    coastDist(mx, my) > 3 && roadDist(mx, my) > 4.2 && !inBox(mx, my, 3) && !inPlaza(mx, my, 4) && !nearPond(mx, my, 3) && !nearGather(mx, my) && spaced(mx, my, spacing);

  const xf = (mx: number, my: number, s: number, ry: number, color?: string, yOff = 0, sy = s): Xf => ({ x: mx, y: terrainHeight(mx, my) + yOff, z: -my, ry, sx: s, sy, sz: s, color });

  const addTree = (list: Xf[], mx: number, my: number, s: number, color: string, spacing = 3.5, ry = r() * 6.28) => {
    list.push(xf(mx, my, s, ry, color, -0.1));
    treeSpots.push([mx, my, spacing]);
  };

  /* --------------------------- designed plantings --------------------------- */
  // park: oaks + poplars around the pond
  for (let i = 0; i < 40; i++) {
    const a = r() * 6.28, rr = 8 + r() * 15;
    const mx = 110 + Math.cos(a) * rr, my = 70 + Math.sin(a) * rr;
    if (!clearForTree(mx, my, 3)) continue;
    if (r() < 0.3) addTree(S.poplars, mx, my, 0.9 + r() * 0.4, vary("#8dbc4b", r));
    else addTree(S.oaks, mx, my, 0.85 + r() * 0.45, vary("#6cb047", r, 0.04));
  }
  // square corners: four big oaks
  for (const [ox, oy] of [[-17, 19], [17, 19], [-17, -19], [17, -19]]) addTree(S.oaks, 150 + ox, 121 + oy, 1.25, vary("#5fa646", r, 0.02, 0.06), 4);
  // orchard rows
  for (let row = 0; row < 4; row++) for (let c = 0; c < 6; c++) {
    const mx = 240 - 14 + c * 5.2 + (r() - 0.5) * 0.8, my = 20 + 5 + row * 5 + (r() - 0.5) * 0.8;
    if (Math.hypot(mx - 240, my - 20) < 4.5 || inBox(mx, my, 1.5)) continue;
    addTree(S.oaks, mx, my, 0.72 + r() * 0.12, vary("#7cc242", r, 0.02, 0.06), 2.4);
  }
  // harbour road: wind-bent pines leaning inland
  for (const [mx, my] of [[38, 250], [52, 232], [62, 222], [80, 206], [95, 194], [24, 246], [18, 258]]) {
    if (!clearForTree(mx, my, 2.5)) continue;
    addTree(S.coastalPines, mx + (r() - 0.5) * 2, my + (r() - 0.5) * 2, 0.9 + r() * 0.35, vary("#4d7f44", r), 3, leanYaw(mx, my));
  }
  // poplar line along the top of Main Street (behind the shops) and by the farms
  for (let mx = 112; mx <= 214; mx += 9) {
    const my = 199 + (r() - 0.5) * 2;
    if (!clearForTree(mx, my, 2.5)) continue;
    addTree(S.poplars, mx, my, 0.9 + r() * 0.3, vary("#8dbc4b", r), 3);
  }
  for (const [mx, my] of [[196, 30], [199, 36], [202, 42], [274, 62], [277, 56], [280, 50], [283, 44]]) {
    if (!clearForTree(mx, my, 2)) continue;
    addTree(S.poplars, mx, my, 1.0 + r() * 0.3, vary("#96c452", r), 3);
  }

  /* ------------------------------ random trees ------------------------------ */
  let placed = 0, tries = 0;
  while (placed < 300 && tries < 12000) {
    tries++;
    const mx = -30 + r() * 380, my = -40 + r() * 360;
    const cd = coastDist(mx, my);
    if (cd < 4) continue;
    const tw = townWeight(mx, my), hw = hillWeight(mx, my);
    const z = shoreZones(mx, my);
    if (z.beach > 0.3 && cd < 26) continue;              // no trees on the beach / dunes
    if (r() < tw * 0.85) continue;                        // sparse in the centre
    if (inBox(mx, my, 3.5) || inPlaza(mx, my, 6) || roadDist(mx, my) < 4.5 || nearPond(mx, my, 4) || nearGather(mx, my, 1)) continue;
    if (!spaced(mx, my, 3.5)) continue;
    const slope = terrainSlope(mx, my);
    if (slope > 0.75) continue;
    const s = 0.8 + r() * 0.7;
    if (cd < 28 && r() < 0.7) addTree(S.coastalPines, mx, my, s, vary("#4d7f44", r), 3.5, leanYaw(mx, my));
    else if (hw > 0.3 && r() < 0.6) addTree(S.pines, mx, my, s, vary("#3e7240", r, 0.03, 0.12));
    else if (r() < 0.15) addTree(S.poplars, mx, my, s, vary("#8dbc4b", r));
    else if (r() < 0.25) addTree(S.pines, mx, my, s, vary("#3e7240", r, 0.03, 0.12));
    else addTree(S.oaks, mx, my, s, vary("#6cb047", r, 0.05));
    placed++;
  }
  // backdrop forest on the ridges beyond the map (south + east)
  for (let i = 0; i < 260; i++) {
    const mx = -60 + r() * 560, my = -230 + r() * 640;
    const inMap = mx > -20 && mx < 330 && my > -30 && my < 330;
    if (inMap) continue;
    const cd = coastDist(mx, my);
    if (cd < 8) continue;
    const h = terrainHeight(mx, my);
    if (h < 1 || h > 40 || terrainSlope(mx, my) > 0.9) continue;
    const s = 1.0 + r() * 1.0;
    (r() < 0.7 ? S.pines : S.oaks).push(xf(mx, my, s, r() * 6.28, vary(r() < 0.7 ? "#3a6b3c" : "#5f9e45", r, 0.03, 0.15), -0.2));
  }

  /* ------------------------------- bushes/hedges ------------------------------- */
  for (const b of L.buildings) {
    const s = b.spec;
    if (!(s.kind === "building" || s.kind === "farm")) continue;
    const mx = b.x, my = -b.z;
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      // along the back or a side wall, just outside
      const side = r() < 0.5 ? -1 : 1;
      const back = r() < 0.55;
      const lx = back ? (r() - 0.5) * s.w : side * (s.w / 2 + 1.1);
      const lz = back ? -(s.d / 2 + 1.1) : (r() - 0.5) * s.d;
      const c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
      const px = mx + lx * c + lz * sn, py = my - (-lx * sn + lz * c);
      if (roadDist(px, py) < 2.8 || coastDist(px, py) < 2 || inPlaza(px, py, 1)) continue;
      if (b.loc.type === "home" && r() < 0.5) S.hedges.push(xf(px, py, 0.8 + r() * 0.5, back ? b.yaw : b.yaw + Math.PI / 2, vary("#467f3a", r, 0.03)));
      else S.bushes.push(xf(px, py, 0.6 + r() * 0.6, r() * 6.28, vary("#4f8a3c", r, 0.04)));
    }
  }
  // roadside bushes + meadow scatter
  for (let i = 0; i < 1400 && S.bushes.length < 260; i++) {
    const mx = -20 + r() * 340, my = -30 + r() * 340;
    const cd = coastDist(mx, my);
    if (cd < 2.5 || inBox(mx, my, 1.5) || inPlaza(mx, my, 2) || nearPond(mx, my, 2)) continue;
    const rd = roadDist(mx, my);
    if (rd < 3.2) continue;
    const z = shoreZones(mx, my);
    if (z.beach > 0.3 && cd < 16) continue;
    if (nearGather(mx, my, -2)) continue;
    const want = rd < 6 ? 0.6 : 0.12 + 0.3 * (1 - townWeight(mx, my));
    if (r() > want) continue;
    if (!spaced(mx, my, 1.2)) continue;
    S.bushes.push(xf(mx, my, 0.55 + r() * 0.7, r() * 6.28, vary(cd < 30 ? "#5f8f4a" : "#4f8a3c", r, 0.05)));
  }

  /* --------------------------------- flowers --------------------------------- */
  const FLOWER = ["#ff6b6b", "#ffd43b", "#f8a5d0", "#ffffff", "#8e7cf0"];
  for (let i = 0; i < 3000 && S.flowers.length < 420; i++) {
    const mx = 10 + r() * 300, my = -10 + r() * 320;
    const cd = coastDist(mx, my);
    if (cd < 6 || inBox(mx, my, 0.8) || inPlaza(mx, my, 0.5) || nearPond(mx, my, 1.5) || roadDist(mx, my) < 2.4) continue;
    const z = shoreZones(mx, my);
    if (z.beach > 0.3 && cd < 14) continue;
    // clumps: a noise field decides where flowers grow
    const n = fbm(mx / 18, my / 18, 2, 77);
    if (n < 0.15) continue;
    const ci = Math.floor(fbm(mx / 25, my / 25, 1, 78) * 2.5 + 2.5) % FLOWER.length;
    S.flowers.push(xf(mx, my, 0.8 + r() * 0.6, r() * 6.28, r() < 0.8 ? FLOWER[ci] : FLOWER[Math.floor(r() * FLOWER.length)]));
  }

  /* ---------------------------------- reeds ---------------------------------- */
  for (let i = 0; i < 90; i++) {
    const a = r() * 6.28, rr = POND.r - 0.4 + r() * 2.8;
    const mx = POND.mx + Math.cos(a) * rr, my = POND.my + Math.sin(a) * rr;
    if (roadDist(mx, my) < 2) continue;
    S.reeds.push(xf(mx, my, 0.7 + r() * 0.6, r() * 6.28, vary("#94ad58", r, 0.03), -0.35));
  }
  // quiet shore: the inner harbour bank and the east end of the bay
  for (let i = 0; i < 700 && S.reeds.length < 330; i++) {
    const east = r() < 0.5;
    const mx = east ? 86 + r() * 30 : 8 + r() * 22, my = east ? 290 + r() * 14 : 284 + r() * 12;
    const cd = coastDist(mx, my);
    if (cd < -1.2 || cd > 2.2) continue;
    if (inBox(mx, my, 1) || roadDist(mx, my) < 2 || pointWeight(mx, my) > 0.5) continue;
    S.reeds.push(xf(mx, my, 0.7 + r() * 0.6, r() * 6.28, vary("#8aa352", r, 0.03), -0.3));
  }

  /* ---------------------------------- grass ---------------------------------- */
  for (let i = 0; i < 6000 && S.grass.length < 900; i++) {
    const mx = -30 + r() * 380, my = -40 + r() * 370;
    const cd = coastDist(mx, my);
    if (cd < 3 || inBox(mx, my, 0.6) || inPlaza(mx, my, 0.5) || nearPond(mx, my, 0.5) || roadDist(mx, my) < 2.2) continue;
    const z = shoreZones(mx, my);
    if (z.beach > 0.3 && cd < 9) continue;
    if (terrainSlope(mx, my) > 0.6) continue;
    const tw = townWeight(mx, my);
    if (r() < tw * 0.7) continue;
    const dune = z.beach * smooth((cd - 8) / 6) * (1 - smooth((cd - 24) / 10));
    const s = 0.8 + r() * 0.8 + dune * 0.6;
    S.grass.push(xf(mx, my, s, r() * 6.28, vary(dune > 0.4 ? "#b9c26c" : hillWeight(mx, my) > 0.4 ? "#8fae4f" : "#7cb84f", r, 0.04, 0.16), -0.02, s * (0.8 + r() * 0.5)));
  }

  /* ------------------------------ rocks / driftwood ------------------------------ */
  // shore rocks: below the cliffs, on the point, tide pools by the beach edge
  for (let i = 0; i < 2500 && S.rocks.length < 200; i++) {
    const west = r() < 0.4;
    const mx = west ? -14 + r() * 24 : -10 + r() * 330, my = west ? -30 + r() * 340 : 288 + r() * 26;
    const cd = coastDist(mx, my);
    if (cd < -5 || cd > 5) continue;
    const z = shoreZones(mx, my);
    const pw = pointWeight(mx, my);
    if (z.quay > 0.4) continue;
    if (inBox(mx, my, 1)) continue;
    const want = pw > 0.3 ? 0.9 : z.beach > 0.4 ? (mx < 40 || mx > 78 ? 0.45 : 0.08) : 0.5;
    if (r() > want) continue;
    const s = 0.4 + r() * (pw > 0.3 ? 1.6 : 0.9);
    S.rocks.push(xf(mx, my, s, r() * 6.28, vary(pw > 0.3 ? "#7d7568" : "#8b8579", r, 0.02, 0.18, 0.05), -0.15 * s, s * (0.7 + r() * 0.6)));
  }
  // hill rocks + boulders
  for (let i = 0; i < 1200 && S.boulders.length < 70; i++) {
    const mx = 150 + r() * 220, my = -60 + r() * 150;
    const hw = hillWeight(mx, my), h = terrainHeight(mx, my);
    if (hw < 0.25 && h < 12) continue;
    if (inBox(mx, my, 2) || roadDist(mx, my) < 3 || nearGather(mx, my, 2)) continue;
    const slope = terrainSlope(mx, my);
    if (r() > 0.25 + slope * 1.4 + smooth((h - 12) / 6) * 0.4) continue;
    if (!spaced(mx, my, 1.5)) continue;
    const s = 0.6 + r() * 1.8;
    S.boulders.push(xf(mx, my, s, r() * 6.28, vary("#8a8474", r, 0.02, 0.2, 0.05), -0.25 * s, s * (0.6 + r() * 0.6)));
  }
  // driftwood on the beach
  for (let i = 0; i < 400 && S.driftwood.length < 14; i++) {
    const mx = 22 + r() * 70, my = 286 + r() * 14;
    const cd = coastDist(mx, my);
    const z = shoreZones(mx, my);
    if (z.beach < 0.5 || cd < 1.5 || cd > 11 || inBox(mx, my, 1.5) || nearGather(mx, my, -3)) continue;
    S.driftwood.push(xf(mx, my, 0.45 + r() * 0.5, r() * 6.28, vary("#b0a48c", r, 0.02, 0.15)));
  }
  return S;
}

/** yaw so the geometry's +x lean points inland (away from the nearest coast) */
function leanYaw(mx: number, my: number): number {
  const dn = northLine(mx) - my, dw = mx - westLine(my);
  // inland direction in metres: away from the west coast = +x; away from the north coast = -my
  let ix: number, iy: number;
  if (dw < dn) { ix = 1; iy = 0; } else { ix = 0; iy = -1; }
  // world: x = mx, z = -my. yaw rotates +x toward -z for positive angles: dir = (cos yaw, -sin yaw) in (x, z)
  const wz = -iy;
  return Math.atan2(-wz, ix);
}
