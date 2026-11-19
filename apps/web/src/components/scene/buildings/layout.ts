/**
 * Building specs per location + the pure `layoutTown()` that turns town.json into placed
 * buildings (each with a merged vertex-coloured geometry built by buildings/kinds/**), instanced
 * props, signs, windows/doors/trees/crops/lamps, fields, and the positions other systems need
 * (chimney tops for smoke, laundry lines, flag poles, moored boats).
 *
 * The result is memoised per `town` object, so Town.tsx and <Buildings/> share one layout.
 */
import type { TownContent, LocationContent } from "@npcworld/schema";
import { hash01, rng, WALLS, ROOFS } from "../palette";
import { coastDist, roadDist, terrainHeight, hillWeight, ROADS } from "../terrain";
import { GB } from "./kit";
import type { PropKind } from "./props";
import type { SignPlacement, SignSpec } from "./signs";
import { buildLocation } from "./kinds";

export type RoofKind = "gable" | "pyramid" | "flat" | "none" | "hip" | "mansard" | "shed" | "thatch";
export type Kind = "building" | "stall" | "farm" | "orchard" | "docks" | "lighthouse" | "park" | "beach" | "square" | "market";

export interface BuildingSpec {
  kind: Kind;
  w: number; d: number; h: number;
  storeys: number;
  roof: RoofKind;
  roofH: number;
  wall: string; roofColor: string; trim: string;
  yaw?: number;
  chimney?: boolean; columns?: number; spire?: boolean; cross?: boolean; silo?: boolean; awning?: string; pole?: boolean; flag?: boolean; bell?: boolean; sign?: boolean; parapet?: boolean; bigDoor?: boolean; steps?: boolean;
  windows: boolean;
  /** render offset in metres (mx, my) when a location sits on a road */
  off?: [number, number];
  /** house archetype for homes */
  arch?: "cottage" | "timber" | "stone" | "clapboard" | "harbour" | "rental" | "villa" | "farmhouse" | "cabin";
  /** distance from the wall to where people gather (steps/porch) */
  front?: number;
}

const base = (p: Partial<BuildingSpec>): BuildingSpec => ({
  kind: "building", w: 8, d: 7, h: 4.4, storeys: 1, roof: "gable", roofH: 2.6, wall: "#f1e3c8", roofColor: "#c8623f", trim: "#6e4a30", windows: true, ...p,
});

const E = Math.PI / 2, W = -Math.PI / 2, N = Math.PI, S = 0;

const BY_ID: Record<string, Partial<BuildingSpec>> = {
  // harbour
  fish_market:    { kind: "market", w: 13, d: 9, h: 4.2, roof: "gable", roofH: 2.2, wall: "#cfd8dc", roofColor: "#3d6b8f", awning: "#3d6b8f", off: [8, 8], yaw: -Math.PI / 4 },
  harbour_office: { w: 8, d: 7, h: 4.6, storeys: 1, roof: "hip", roofH: 2.2, wall: "#dfe6ea", roofColor: "#4f5a68", flag: true, trim: "#1f2f5a", yaw: E, off: [-8, 0] },
  docks:          { kind: "docks", w: 0, d: 0, h: 0, roof: "none", windows: false, yaw: Math.PI / 2 }, // pier runs west into the cove
  // main street (south side faces the road)
  bakery:         { w: 11, d: 9, h: 4.6, storeys: 1, roof: "gable", roofH: 3.2, wall: "#f4dcae", roofColor: "#a8452f", trim: "#6e4a30", chimney: true, awning: "#c8623f", sign: true, yaw: S },
  general_store:  { w: 12, d: 9, h: 8.0, storeys: 2, roof: "hip", roofH: 2.6, wall: "#c7dcb2", roofColor: "#3f6b3d", trim: "#f4efe2", awning: "#3a6b3a", sign: true, yaw: S, front: 3.2 },
  cafe:           { w: 10, d: 8, h: 8.2, storeys: 2, roof: "mansard", roofH: 2.6, wall: "#efb9c0", roofColor: "#5a3e33", trim: "#f7f0e8", awning: "#8a2a3a", sign: true, yaw: S, front: 3.5 },
  tavern:         { w: 14, d: 11, h: 8.4, storeys: 2, roof: "gable", roofH: 3.4, wall: "#4a3221", roofColor: "#3a3633", trim: "#2a1a10", chimney: true, sign: true, yaw: S },
  barber:         { w: 8, d: 7, h: 4.4, roof: "hip", roofH: 2.2, wall: "#bcd7e8", roofColor: "#a8352d", trim: "#ffffff", pole: true, awning: "#c8323c", sign: true, yaw: S },
  tailor:         { w: 9, d: 7, h: 8.0, storeys: 2, roof: "gable", roofH: 3.0, wall: "#e6c45a", roofColor: "#4f5a68", trim: "#3f3a37", awning: "#7b4fa0", sign: true, yaw: N },
  flat_cafe:      { w: 6, d: 6, h: 7.6, storeys: 2, roof: "shed", roofH: 1.4, wall: "#efb9c0", roofColor: "#5a3e33", trim: "#f7f0e8", yaw: N },
  room_costa:     { w: 6, d: 6, h: 7.4, storeys: 2, roof: "shed", roofH: 1.4, wall: "#4a3221", roofColor: "#3a3633", trim: "#2a1a10", yaw: N },
  // workshop row
  brewery:        { w: 14, d: 11, h: 6.5, storeys: 1, roof: "gable", roofH: 3.0, wall: "#a8763e", roofColor: "#4f5a68", silo: true, chimney: true, sign: true, yaw: S },
  carpentry:      { w: 12, d: 9, h: 5.2, roof: "gable", roofH: 2.6, wall: "#c9a070", roofColor: "#6e4a30", bigDoor: true, sign: true, yaw: N, off: [8, 4] },
  garage:         { w: 12, d: 10, h: 5.0, roof: "flat", roofH: 0.8, wall: "#9aa3a8", roofColor: "#6b7378", trim: "#4a5257", bigDoor: true, parapet: true, sign: true, yaw: S },
  // square
  inn:            { w: 14, d: 11, h: 8.8, storeys: 2, roof: "hip", roofH: 3.2, wall: "#f7f1e4", roofColor: "#7a2d3c", trim: "#5b3a29", chimney: true, sign: true, yaw: W, front: 3, off: [-4, 8] },
  chai_stall:     { kind: "stall", w: 3.6, d: 2.4, h: 2.6, roof: "none", roofH: 0.4, wall: "#d05a2a", roofColor: "#f2c318", awning: "#f2c318", windows: false, yaw: S },
  town_hall:      { w: 18, d: 12, h: 9.0, storeys: 2, roof: "hip", roofH: 2.8, wall: "#e8e2d4", roofColor: "#4f5a68", trim: "#b9b4a8", columns: 4, steps: true, flag: true, yaw: N, front: 4.5, off: [0, 4] },
  town_square:    { kind: "square", w: 0, d: 0, h: 0, roof: "none", windows: false, yaw: 0 },
  bank:           { w: 12, d: 10, h: 6.4, roof: "flat", roofH: 1.0, wall: "#b9b4a8", roofColor: "#8f8a80", trim: "#6b665e", columns: 2, parapet: true, steps: true, sign: true, yaw: E, front: 4, off: [0, -4] },
  clinic:         { w: 11, d: 9, h: 4.6, roof: "flat", roofH: 0.8, wall: "#fbfbf8", roofColor: "#dedede", trim: "#c9cfd4", cross: true, parapet: true, sign: true, yaw: E, front: 3 },
  post_office:    { w: 8, d: 7, h: 4.6, roof: "hip", roofH: 2.2, wall: "#bcd7e8", roofColor: "#1e5aa8", trim: "#1e5aa8", sign: true, yaw: W },
  realty:         { w: 8, d: 7, h: 4.8, roof: "flat", roofH: 0.6, wall: "#3a3d42", roofColor: "#2a2d31", trim: "#c8b48a", sign: true, yaw: W },
  // lane north
  school:         { w: 14, d: 9, h: 5.0, roof: "gable", roofH: 2.8, wall: "#d9c3a5", roofColor: "#a8352d", trim: "#f4efe2", bell: true, yaw: W, off: [14, 2] },
  temple:         { w: 9, d: 15, h: 6.0, roof: "gable", roofH: 3.6, wall: "#e6e1d3", roofColor: "#4f5a68", trim: "#8d877c", spire: true, yaw: E, off: [-5, -6] },
  park:           { kind: "park", w: 0, d: 0, h: 0, roof: "none", windows: false, yaw: 0 },
  // hill farms
  lindqvist_farm: { kind: "farm", w: 12, d: 9, h: 5.6, roof: "gable", roofH: 3.2, wall: "#b3412f", roofColor: "#3f3a37", trim: "#f7f4ec", windows: false, yaw: S },
  haddad_farm:    { kind: "farm", w: 12, d: 9, h: 5.6, roof: "gable", roofH: 3.2, wall: "#a8763e", roofColor: "#4f5a68", trim: "#f7f4ec", windows: false, yaw: S, off: [0, -9] },
  orchard:        { kind: "orchard", w: 6, d: 5, h: 3.2, roof: "gable", roofH: 1.8, wall: "#8b5a3c", roofColor: "#4d7a4a", windows: false, yaw: S },
  // shore
  studio:         { w: 11, d: 7, h: 5.4, storeys: 1, roof: "gable", roofH: 2.8, wall: "#7d7264", roofColor: "#4a4642", trim: "#3f3a37", yaw: S, off: [0, 8] },
  beach:          { kind: "beach", w: 0, d: 0, h: 0, roof: "none", windows: false, yaw: 0 },
  lighthouse:     { kind: "lighthouse", w: 0, d: 0, h: 0, roof: "none", windows: false, yaw: 0 },
  // homes
  rectory:        { w: 7, d: 6, h: 4.2, wall: "#e6e1d3", roofColor: "#4f5a68", trim: "#8d877c", arch: "stone", chimney: true },
  farmhouse_lindqvist: { w: 9, d: 8, h: 7.6, storeys: 2, wall: "#f7f4ec", roofColor: "#a8352d", trim: "#3f6b3d", chimney: true, arch: "farmhouse" },
  farmhouse_haddad:    { w: 9, d: 8, h: 4.6, wall: "#f0cfa6", roofColor: "#6e4a30", trim: "#5b3a29", chimney: true, arch: "farmhouse", roof: "hip" },
  cottage_mcbride:     { w: 7, d: 6, h: 3.8, wall: "#cfe0b8", roofColor: "#b8a060", trim: "#5b3a29", chimney: true, arch: "cottage", roof: "thatch" },
  home_okafor:    { w: 8, d: 6.5, h: 4.0, wall: "#f1e3c8", roofColor: "#b8a060", trim: "#6e4a30", chimney: true, arch: "cottage", roof: "thatch", off: [3, 6] },
  home_rao:       { w: 8, d: 7, h: 7.4, storeys: 2, wall: "#f3c9a6", roofColor: "#6e4a30", trim: "#f7f4ec", chimney: true, arch: "clapboard", off: [-3, -3] },
  home_halvorsen: { w: 9, d: 7, h: 7.8, storeys: 2, wall: "#f7f4ec", roofColor: "#4f5a68", trim: "#3a2a1a", chimney: true, arch: "timber", off: [-4, -6] },
  home_vale:      { w: 11, d: 8, h: 8.2, storeys: 2, wall: "#e9e2d2", roofColor: "#2f3a45", trim: "#f7f4ec", chimney: true, columns: 2, arch: "villa", roof: "hip" },
  home_ashdown:   { w: 10, d: 8, h: 8.0, storeys: 2, wall: "#b9b4a8", roofColor: "#4f5a68", trim: "#8d877c", chimney: true, arch: "stone", roof: "hip", off: [-6, -5] },
  home_achebe:    { w: 8, d: 7, h: 4.4, wall: "#c9d8d3", roofColor: "#8c4a3a", trim: "#f7f4ec", chimney: true, arch: "stone", off: [-3, -3] },
  home_volkov:    { w: 7, d: 6, h: 4.2, wall: "#bcd7e8", roofColor: "#3f3a37", trim: "#f7f4ec", chimney: true, arch: "clapboard" },
  home_moreno:    { w: 8, d: 7, h: 7.4, storeys: 2, wall: "#efc2c9", roofColor: "#8c4a3a", trim: "#f7f4ec", chimney: true, arch: "stone", off: [6, 0] },
  home_kowalski:  { w: 10, d: 8, h: 7.8, storeys: 2, wall: "#e9cf7a", roofColor: "#3f3a37", trim: "#3a2a1a", chimney: true, arch: "timber" },
  home_brand:     { w: 8, d: 7, h: 4.4, wall: "#d9c3a5", roofColor: "#4d7a4a", trim: "#f7f4ec", chimney: true, arch: "clapboard", off: [-8, 4] },
  home_demir:     { w: 8, d: 7, h: 4.4, wall: "#cfe0b8", roofColor: "#c8623f", trim: "#f7f4ec", chimney: true, arch: "clapboard" },
  home_romano:    { w: 7, d: 6, h: 7.2, storeys: 2, wall: "#f1e3c8", roofColor: "#a8352d", trim: "#3a2a1a", chimney: true, arch: "timber", off: [-3, 2] },
  home_finch:     { w: 7, d: 6, h: 3.8, wall: "#e6e1d3", roofColor: "#b8a060", trim: "#5b3a29", chimney: true, arch: "cottage", roof: "thatch", off: [6, 4] },
  home_chen:      { w: 6, d: 7, h: 9.6, storeys: 3, wall: "#3d6b8f", roofColor: "#3f3a37", trim: "#f7f4ec", chimney: true, arch: "harbour", off: [5, -5] },
  home_bello:     { w: 6, d: 7, h: 7.8, storeys: 2, wall: "#c86a3a", roofColor: "#3f3a37", trim: "#f7f4ec", chimney: true, arch: "harbour" },
  flat_kimura:    { w: 7, d: 6, h: 7.2, storeys: 2, wall: "#b8b0a0", roofColor: "#5a5651", trim: "#6b665e", arch: "rental", roof: "flat", roofH: 0.6 },
  flat_rahman:    { w: 7, d: 6, h: 7.2, storeys: 2, wall: "#a9a498", roofColor: "#5a5651", trim: "#6b665e", arch: "rental", roof: "flat", roofH: 0.6 },
  room_pillai:    { w: 6, d: 5, h: 3.8, wall: "#b5ad9f", roofColor: "#6b7378", trim: "#6b665e", arch: "rental", roof: "shed", roofH: 1.2, off: [2, -2] },
  room_whitlock:  { w: 6, d: 5, h: 3.8, wall: "#a8a29a", roofColor: "#6b7378", trim: "#6b665e", arch: "rental", roof: "shed", roofH: 1.2 },
  room_ferreira:  { w: 6, d: 5.5, h: 7.0, storeys: 2, wall: "#b0a89a", roofColor: "#5a5651", trim: "#6b665e", arch: "rental", roof: "flat", roofH: 0.6 },
  room_diallo:    { w: 6, d: 5.5, h: 7.0, storeys: 2, wall: "#a7a196", roofColor: "#5a5651", trim: "#6b665e", arch: "rental", roof: "flat", roofH: 0.6 },
  room_tanaka:    { w: 6, d: 5.5, h: 7.0, storeys: 2, wall: "#b6aa98", roofColor: "#5a5651", trim: "#6b665e", arch: "rental", roof: "flat", roofH: 0.6 },
  room_reyes:     { w: 6, d: 5, h: 3.6, wall: "#8b7a62", roofColor: "#6b7378", trim: "#5b3a29", arch: "cabin", roof: "shed", roofH: 1.2 },
};

export function specFor(l: LocationContent): BuildingSpec {
  const o = BY_ID[l.id];
  if (o) return base(o);
  if (l.type === "home") {
    const small = /^(room|flat)_/.test(l.id);
    return base({
      w: small ? 6 : 7.5, d: small ? 5 : 6.5, h: small ? 3.8 : 4.2, roof: small ? "shed" : "gable", roofH: small ? 1.2 : 2.4,
      wall: WALLS[Math.floor(hash01(l.id, 11) * WALLS.length)], roofColor: ROOFS[Math.floor(hash01(l.id, 12) * ROOFS.length)],
      chimney: hash01(l.id, 13) > 0.5, arch: small ? "rental" : "clapboard",
    });
  }
  if (l.type === "public") return base({ w: 10, d: 8, h: 4.6, wall: "#e8e2d4", roofColor: "#4f5a68" });
  return base({ wall: WALLS[Math.floor(hash01(l.id, 11) * WALLS.length)], roofColor: ROOFS[Math.floor(hash01(l.id, 12) * ROOFS.length)] });
}

/* ---------------------------------- layout ---------------------------------- */

export interface Xf { x: number; y: number; z: number; ry: number; sx: number; sy: number; sz: number; color?: string }
export interface Placed { loc: LocationContent; spec: BuildingSpec; x: number; y: number; z: number; yaw: number }
export interface Field { cx: number; cy: number; w: number; d: number; color: string }
export interface ChimneyTop { x: number; y: number; z: number }
export interface LaundryLine { x: number; y: number; z: number; ry: number; len: number }
export interface FlagPole { x: number; y: number; z: number; h: number }
export interface MooredBoat { x: number; y: number; z: number; ry: number; kind: "trawler" | "skiff" | "sloop" }
export interface TownLayout {
  buildings: Placed[];
  windows: Xf[]; doors: Xf[];
  trunks: Xf[]; conifers: Xf[]; broadleaf: Xf[];
  crops: Xf[]; fields: Field[];
  lampPosts: Xf[]; lampGlobes: Xf[];
  benches: Xf[];
  fences: Xf[];
  /* --- additive fields --- */
  /** merged geometry builder per location id (local frame; mesh placed at Placed x/y/z/yaw) */
  built: Map<string, GB>;
  /** instanced props by kind (world space) */
  props: Partial<Record<PropKind, Xf[]>>;
  /** every sign in town (world space) */
  signs: SignPlacement[];
  /** top of every chimney (world) — smoke goes here */
  chimneys: ChimneyTop[];
  /** laundry lines: centre, heading, length (world) — cloth hangs from y */
  laundryLines: LaundryLine[];
  /** flag poles: base position + pole height (flag flies at y+h) */
  flagPoles: FlagPole[];
  /** moored boats (world; y = water level). <Buildings/> renders and bobs them. */
  mooredBoats: MooredBoat[];
  /** point-light worthy spots (world) for the tavern/inn door lanterns */
  lanternLights: { x: number; y: number; z: number; color: string }[];
}

const snap45 = (a: number) => Math.round(a / (Math.PI / 4)) * (Math.PI / 4);

/** Building footprints (metres) — filled by layoutTown, used by npcRuntime to keep people outside walls. */
export interface Footprint { id: string; mx: number; my: number; w: number; d: number; h: number; yaw: number; front: number; radial?: boolean }
export const footprints: Footprint[] = [];

/** is world point (x, y, z) inside building f's box (with `margin` metres of padding)? */
export function insideBox(f: Footprint, x: number, y: number, z: number, margin = 0): boolean {
  const fy = terrainHeight(f.mx, f.my);
  if (y < fy - 1.5 || y > fy + f.h + margin) return false;
  const dx = x - f.mx, dz = z + f.my;
  const c = Math.cos(-f.yaw), s = Math.sin(-f.yaw);
  const lx = dx * c + dz * s, lz = -dx * s + dz * c;
  return Math.abs(lx) <= f.w / 2 + margin && Math.abs(lz) <= f.d / 2 + margin;
}

/**
 * If (mx,my) lies inside a building, return a spot just outside its front door
 * (spread deterministically by `seed` so groups fan out); otherwise return the input.
 */
export function outsideWalls(mx: number, my: number, seed: number): [number, number] {
  for (const f of footprints) {
    // to local: world x = mx, z = -my; local = R(-yaw) * (p - c)
    const dx = mx - f.mx, dz = -(my - f.my);
    const c = Math.cos(-f.yaw), s = Math.sin(-f.yaw);
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    if (Math.abs(lx) <= f.w / 2 + 0.6 && Math.abs(lz) <= f.d / 2 + 0.6) {
      if (f.radial) {
        // fountain / monument: fan people out all around it
        const a = seed * Math.PI * 2, rr = f.w / 2 + 2 + ((seed * 7.31) % 1) * 4;
        return [f.mx + Math.cos(a) * rr, f.my + Math.sin(a) * rr];
      }
      const ox = (seed - 0.5) * Math.max(2, f.w - 2);
      const oz = f.d / 2 + f.front + 0.6 + ((seed * 7.31) % 1) * 2.6;
      const c2 = Math.cos(f.yaw), s2 = Math.sin(f.yaw);
      const wx = f.mx + ox * c2 + oz * s2, wz = -f.my - ox * s2 + oz * c2;
      return [wx, -wz];
    }
  }
  return [mx, my];
}

/** closest point on the road network */
function nearestRoadPoint(mx: number, my: number): [number, number] {
  let best = Infinity, bx = mx, by = my - 1;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
    const [ax, ay] = r[i], [cx, cy] = r[i + 1];
    const vx = cx - ax, vy = cy - ay, wx = mx - ax, wy = my - ay;
    const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / (vx * vx + vy * vy || 1)));
    const px = ax + vx * t, py = ay + vy * t, dd = Math.hypot(px - mx, py - my);
    if (dd < best) { best = dd; bx = px; by = py; }
  }
  return [bx, by];
}

/** face the nearest road (houses, shops); fall back to the district centre */
function facing(l: LocationContent, town: TownContent): number {
  let [cx, cy] = nearestRoadPoint(l.pos[0], l.pos[1]);
  if (Math.hypot(cx - l.pos[0], cy - l.pos[1]) > 30) {
    const d = town.districts.find((x) => x.id === l.district);
    [cx, cy] = d ? d.center : [150, 150];
  }
  let dx = cx - l.pos[0], dy = cy - l.pos[1];
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) { dx = 0; dy = -1; }
  // world: x = mx, z = -my; yaw = rotation.y, front face is +z local
  return snap45(Math.atan2(dx, -dy));
}

/** rotate a local offset (lx, lz) by yaw and translate */
export function place(x: number, z: number, yaw: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

/* ------------------------------ builder context ------------------------------ */

/** Everything a location builder needs: a geometry builder in the building's local frame plus
 *  helpers that convert local offsets to world space and record props/signs/exports. */
export interface Ctx {
  gb: GB;
  p: Placed;
  L: TownLayout;
  town: TownContent;
  rand: () => number;
  /** terrain height at a local offset, relative to the building origin (so 0 at the centre) */
  ground(lx: number, lz: number): number;
  /** local → world */
  world(lx: number, ly: number, lz: number): [number, number, number];
  /** instanced prop on the ground at a local offset (y = terrain unless `y` given, local units) */
  prop(kind: PropKind, lx: number, lz: number, ry?: number, o?: { y?: number; s?: number; color?: string }): void;
  sign(spec: SignSpec, lx: number, ly: number, lz: number, ry?: number, twoSided?: boolean): void;
  chimneyTop(lx: number, ly: number, lz: number): void;
  laundry(lx: number, ly: number, lz: number, ry: number, len: number): void;
  flag(lx: number, ly: number, lz: number, h: number): void;
  window(lx: number, ly: number, lz: number, ry: number): void;
  door(lx: number, ly: number, lz: number, ry: number, w?: number, h?: number): void;
  bench(lx: number, lz: number, ry: number): void;
  fencePost(lx: number, lz: number): void;
  tree(lx: number, lz: number, kind: "conifer" | "broadleaf", s: number, color?: string): void;
  crop(lx: number, lz: number, s: number, color: string): void;
  lamp(lx: number, lz: number): void;
  lanternLight(lx: number, ly: number, lz: number, color?: string): void;
  boat(lx: number, lz: number, ry: number, kind: MooredBoat["kind"]): void;
}

function makeCtx(L: TownLayout, town: TownContent, p: Placed, rand: () => number): Ctx {
  const { x, y, z, yaw } = p;
  const world = (lx: number, ly: number, lz: number): [number, number, number] => { const [wx, wz] = place(x, z, yaw, lx, lz); return [wx, y + ly, wz]; };
  const ground = (lx: number, lz: number) => { const [wx, wz] = place(x, z, yaw, lx, lz); return terrainHeight(wx, -wz) - y; };
  const xf = (lx: number, ly: number, lz: number, ry = 0, s = 1, color?: string): Xf => { const [wx, wy, wz] = world(lx, ly, lz); return { x: wx, y: wy, z: wz, ry: yaw + ry, sx: s, sy: s, sz: s, color }; };
  return {
    gb: new GB(), p, L, town, rand, ground, world,
    prop(kind, lx, lz, ry = 0, o = {}) { const gy = o.y ?? ground(lx, lz); (L.props[kind] ??= []).push(xf(lx, gy, lz, ry, o.s ?? 1, o.color)); },
    sign(spec, lx, ly, lz, ry = 0, twoSided = false) { const [wx, wy, wz] = world(lx, ly, lz); L.signs.push({ spec, x: wx, y: wy, z: wz, ry: yaw + ry, twoSided }); },
    chimneyTop(lx, ly, lz) { const [wx, wy, wz] = world(lx, ly, lz); L.chimneys.push({ x: wx, y: wy, z: wz }); },
    laundry(lx, ly, lz, ry, len) { const [wx, wy, wz] = world(lx, ly, lz); L.laundryLines.push({ x: wx, y: wy, z: wz, ry: yaw + ry, len }); },
    flag(lx, ly, lz, h) { const [wx, wy, wz] = world(lx, ly, lz); L.flagPoles.push({ x: wx, y: wy, z: wz, h }); },
    window(lx, ly, lz, ry) { L.windows.push(xf(lx, ly, lz, ry)); },
    door(lx, ly, lz, ry, w = 1.4, h = 3) { const o = xf(lx, ly, lz, ry); o.sx = w; o.sy = h; L.doors.push(o); },
    bench(lx, lz, ry) { L.benches.push(xf(lx, ground(lx, lz), lz, ry)); },
    fencePost(lx, lz) { L.fences.push(xf(lx, ground(lx, lz), lz)); },
    tree(lx, lz, kind, s, color) { const [wx, , wz] = world(lx, 0, lz); addTree(L, wx, -wz, kind, s, color, rand); },
    crop(lx, lz, s, color) { const [wx, , wz] = world(lx, 0, lz); L.crops.push({ x: wx, y: terrainHeight(wx, -wz) + 0.05, z: wz, ry: rand() * 6.28, sx: s, sy: s, sz: s, color }); },
    lamp(lx, lz) { const [wx, , wz] = world(lx, 0, lz); addLamp(L, wx, -wz); },
    lanternLight(lx, ly, lz, color = "#ffb35a") { const [wx, wy, wz] = world(lx, ly, lz); L.lanternLights.push({ x: wx, y: wy, z: wz, color }); },
    boat(lx, lz, ry, kind) { const [wx, , wz] = world(lx, 0, lz); L.mooredBoats.push({ x: wx, y: 0, z: wz, ry: yaw + ry, kind }); },
  };
}

function addLamp(L: TownLayout, lx: number, ly: number) {
  const y = terrainHeight(lx, ly);
  L.lampPosts.push({ x: lx, y, z: -ly, ry: 0, sx: 1, sy: 1, sz: 1 });
  L.lampGlobes.push({ x: lx, y: y + 3.6, z: -ly, ry: 0, sx: 1, sy: 1, sz: 1 });
}

/* ---------------------------------- layoutTown -------------------------------- */

const memo = new WeakMap<TownContent, TownLayout>();

export function layoutTown(town: TownContent): TownLayout {
  const hit = memo.get(town);
  if (hit) return hit;
  const L: TownLayout = {
    buildings: [], windows: [], doors: [], trunks: [], conifers: [], broadleaf: [], crops: [], fields: [], lampPosts: [], lampGlobes: [], benches: [], fences: [],
    built: new Map(), props: {}, signs: [], chimneys: [], laundryLines: [], flagPoles: [], mooredBoats: [], lanternLights: [],
  };
  const rand = rng(1337);
  const occupied: { x: number; y: number; r: number }[] = [];
  footprints.length = 0;

  for (const l of town.locations) {
    const spec = specFor(l);
    const mx = l.pos[0] + (spec.off?.[0] ?? 0), my = l.pos[1] + (spec.off?.[1] ?? 0);
    const yaw = spec.yaw ?? facing({ ...l, pos: [mx, my] }, town);
    const y = terrainHeight(mx, my);
    const x = mx, z = -my;
    const p: Placed = { loc: l, spec, x, y, z, yaw };
    L.buildings.push(p);
    // keep scatter trees clear of the director's orbit radius around places people gather
    occupied.push({ x: mx, y: my, r: Math.max(spec.w, spec.d) / 2 + (l.type === "home" ? 6 : 14) });
    const front = spec.front ?? (spec.columns || spec.steps ? 3.4 : 1.6);
    if (spec.kind === "building" || spec.kind === "farm" || spec.kind === "orchard") {
      footprints.push({ id: l.id, mx, my, w: spec.w + (spec.silo ? 5 : 0), d: spec.d, h: spec.h + spec.roofH + (spec.spire ? 8 : 0), yaw, front });
    } else if (spec.kind === "lighthouse") footprints.push({ id: l.id, mx, my, w: 5.5, d: 5.5, h: 19, yaw, front: 1.5 });
    else if (spec.kind === "square") footprints.push({ id: l.id, mx, my, w: 9, d: 9, h: 3.5, yaw: 0, front: 0, radial: true });
    else if (spec.kind === "stall") footprints.push({ id: l.id, mx, my, w: spec.w, d: spec.d, h: spec.h + 0.6, yaw, front: 1.2 });

    const ctx = makeCtx(L, town, p, rand);
    buildLocation(ctx);
    L.built.set(l.id, ctx.gb);

    if (spec.kind === "farm") {
      // explicit fields per farm: Lindqvist keeps the land west of the disputed channel (x ≈ 236), Haddad the east
      const FIELDS: Record<string, { cx: number; cy: number; w: number; d: number; color: string; crop?: string; tall?: boolean }[]> = {
        lindqvist_farm: [{ cx: 212, cy: 18, w: 24, d: 16, color: "#8a6238", crop: "#7fbf4a", tall: true }, { cx: 181, cy: 69, w: 18, d: 18, color: "#6f5a2e", crop: "#c9b44a" }, { cx: 231, cy: 63, w: 6, d: 14, color: "#9aa860" }],
        haddad_farm: [{ cx: 249, cy: 66, w: 18, d: 20, color: "#7a5533", crop: "#7fbf4a", tall: true }, { cx: 279, cy: 39, w: 22, d: 18, color: "#6f5a2e", crop: "#c9b44a" }],
      };
      for (const f of FIELDS[l.id] ?? []) {
        L.fields.push({ cx: f.cx, cy: f.cy, w: f.w, d: f.d, color: f.color });
        if (f.crop) {
          const rows = Math.floor(f.d / 2.2), cols = Math.floor(f.w / 1.6);
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const px = f.cx - f.w / 2 + 1 + c * 1.6, py = f.cy - f.d / 2 + 1.1 + r * 2.2;
            const sc = 0.8 + rand() * 0.5;
            L.crops.push({ x: px, y: terrainHeight(px, py) + 0.05, z: -py, ry: rand() * 6.28, sx: sc, sy: sc * (f.tall ? 1.3 : 0.9), sz: sc, color: f.crop });
          }
        } else {
          for (let i = 0; i < 3; i++) { const px = f.cx + (rand() - 0.5) * (f.w - 2), py = f.cy + (rand() - 0.5) * (f.d - 2); (L.props.hayBale ??= []).push({ x: px, y: terrainHeight(px, py), z: -py, ry: rand() * 3, sx: 1, sy: 1, sz: 1 }); }
        }
        occupied.push({ x: f.cx, y: f.cy, r: Math.max(f.w, f.d) / 2 + 2 });
        // post-and-rail fence around the field (instanced panels + corner posts)
        const edge = (ax: number, ay: number, bx: number, by: number) => {
          const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / 3));
          const ry = Math.atan2(by - ay, bx - ax);
          for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
            (L.props.railPanel ??= []).push({ x: px, y: terrainHeight(px, py), z: -py, ry, sx: len / n / 3, sy: 1, sz: 1 });
            const qx = ax + (bx - ax) * (i / n), qy = ay + (by - ay) * (i / n);
            L.fences.push({ x: qx, y: terrainHeight(qx, qy) + 0.45, z: -qy, ry: 0, sx: 1, sy: 1, sz: 1 });
          }
        };
        const x0 = f.cx - f.w / 2, x1 = f.cx + f.w / 2, y0 = f.cy - f.d / 2, y1 = f.cy + f.d / 2;
        edge(x0, y0, x1, y0); edge(x1, y0, x1, y1); edge(x1, y1, x0, y1); edge(x0, y1, x0, y0);
      }
    }
    if (spec.kind === "orchard") {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
        const px = mx - 14 + c * 5.2 + (rand() - 0.5), py = my + 5 + r * 5 + (rand() - 0.5);
        if (Math.hypot(px - mx, py - my) < 4.5 || roadDist(px, py) < 3.8) continue;
        addTree(L, px, py, "broadleaf", 0.95 + rand() * 0.25, "#7cc242", rand);
      }
      occupied.push({ x: mx, y: my + 12, r: 20 });
    }
    if (spec.kind === "park") {
      for (let i = 0; i < 26; i++) {
        const a = rand() * 6.28, rr = 8 + rand() * 16;
        const px = mx + Math.cos(a) * rr, py = my + Math.sin(a) * rr;
        if (roadDist(px, py) < 3.5) continue;
        if (Math.abs(px - mx) < 7 && py > my - 3 && py < my + 9) continue; // pond
        addTree(L, px, py, rand() > 0.35 ? "broadleaf" : "conifer", 0.9 + rand() * 0.6, undefined, rand);
      }
      occupied.push({ x: mx, y: my, r: 24 });
    }
    if (spec.kind === "square") {
      for (const [ox, oy] of [[-16, 20], [16, 20], [-16, -18], [16, -18]] as [number, number][]) addTree(L, mx + ox, my + oy, "broadleaf", 1.15, "#5fa646", rand);
      occupied.push({ x: mx, y: my, r: 30 });
    }
    if (spec.kind === "beach") occupied.push({ x: mx, y: my, r: 22 });
  }

  // street lamps: Main Street both sides, the square, harbour, salt lane, gull lane
  const lamps: [number, number][] = [];
  for (let x = 112; x <= 212; x += 25) { lamps.push([x, 176.2], [x + 12, 183.8]); }
  lamps.push([131, 143], [169, 143], [131, 97], [169, 97], [36, 258], [52, 236], [200, 213], [216, 250], [96, 112], [242, 176], [76, 96], [150, 158]);
  for (const [lx, ly] of lamps) addLamp(L, lx, ly);

  // kerbs along the town's main roads (instanced)
  const kerbRoads: [number, number][][] = [
    [[104, 180], [216, 180]], [[150, 180], [150, 146]], [[170, 112], [200, 148], [216, 180]], [[216, 180], [240, 180], [262, 192]], [[32, 262], [45, 238], [70, 215], [110, 182]], [[184, 180], [198, 212], [214, 248], [238, 278]], [[130, 120], [96, 110], [80, 92], [62, 76]],
  ];
  for (const r of kerbRoads) for (let i = 0; i < r.length - 1; i++) {
    const [ax, ay] = r[i], [bx, by] = r[i + 1];
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / 1.6));
    const tx = (bx - ax) / len, ty = (by - ay) / len;
    const ry = Math.atan2(ty, tx);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      if (k === 0 || k === n - 1) continue;
      for (const s of [-1, 1]) {
        const qx = px - ty * s * 2.6, qy = py + tx * s * 2.6;
        if (Math.abs(qx - 150) < 24 && qy > 92 && qy < 150) continue; // plaza
        (L.props.kerb ??= []).push({ x: qx, y: terrainHeight(qx, qy) + 0.04, z: -qy, ry, sx: 1, sy: 1, sz: 1 });
      }
    }
  }

  // scattered trees across the land, denser on the hills, none on roads/buildings/plaza
  let placed = 0, tries = 0;
  while (placed < 260 && tries < 6000) {
    tries++;
    const px = -20 + rand() * 360, py = -30 + rand() * 340;
    const cd = coastDist(px, py);
    if (cd < 10) continue;
    if (roadDist(px, py) < 4.5) continue;
    let bad = false;
    for (const o of occupied) { const dx = o.x - px, dy = o.y - py; if (dx * dx + dy * dy < o.r * o.r) { bad = true; break; } }
    if (bad) continue;
    const inTown = Math.hypot(px - 150, py - 160) < 75;
    if (inTown && rand() < 0.6) continue;
    const hw = hillWeight(px, py);
    const conifer = rand() < (hw > 0.3 ? 0.55 : 0.3);
    addTree(L, px, py, conifer ? "conifer" : "broadleaf", 0.8 + rand() * 0.9, undefined, rand);
    placed++;
  }
  memo.set(town, L);
  return L;
}

function addTree(L: TownLayout, px: number, py: number, kind: "conifer" | "broadleaf", s: number, color: string | undefined, rand: () => number) {
  const y = terrainHeight(px, py);
  const ry = rand() * 6.28;
  L.trunks.push({ x: px, y: y, z: -py, ry, sx: s, sy: s, sz: s });
  const greens = kind === "conifer" ? ["#3f7d3a", "#4a8a43", "#356d34"] : ["#6fb549", "#7fc24e", "#5ea742", "#8cc65a"];
  const c = color ?? greens[Math.floor(rand() * greens.length)];
  (kind === "conifer" ? L.conifers : L.broadleaf).push({ x: px, y, z: -py, ry, sx: s, sy: s, sz: s, color: c });
}
