/**
 * The parametrised standard building: walls + roof + windows + door + chimneys + dormers +
 * sign + lanterns + drainpipes + path. Every shop, civic building and house starts here and
 * then adds its own set dressing.
 */
import type { Ctx } from "../layout";
import { GB, walls, roofGable, gableEnds, roofHip, roofMansard, roofShed, roofFlat, windowEl, doorEl, chimney, dormer, face, lantern, drainpipe, path, awning, shade, h01, type WallStyle, type V3 } from "../kit";
import type { SignSpec } from "../signs";

export type Side = "front" | "back" | "left" | "right";
export type RoofType = "gable" | "gableZ" | "hip" | "pyramid" | "mansard" | "shed" | "flat" | "thatch" | "corrugated";

export interface StdOpts {
  w: number; d: number; h: number; storeys?: number;
  wall: Omit<WallStyle, "storeys" | "storeyH"> & { storeyBand?: boolean };
  roof: { type: RoofType; color: string; rise?: number; tiles?: number; trim?: string; overhang?: number; ridge?: string; parapet?: string; parapetH?: number };
  door?: { x?: number; w?: number; h?: number; color?: string; frame?: string; open?: number; double?: boolean; glass?: boolean; fanlight?: boolean; side?: Side; step?: boolean; none?: boolean };
  windows?: { w?: number; h?: number; shutters?: string; flowers?: boolean; sides?: Side[]; spacing?: number; frame?: string; upperOnly?: boolean; groundY?: number; none?: boolean; lit?: number; pane?: string };
  chimneys?: { x: number; z: number; w?: number; pots?: number }[];
  dormers?: number;
  sign?: { spec: SignSpec; x?: number; y?: number; side?: Side; lamp?: boolean };
  hanging?: { spec: SignSpec; x: number; y?: number; side?: Side };
  lanterns?: number[];
  awning?: { a: string; b: string; w?: number; depth?: number; x?: number; y?: number };
  drainpipes?: boolean;
  path?: boolean | number;
  chimneyColor?: string;
  /** a real opening behind the (open) front door with a visible room */
  room?: { depth: number; floor?: string; inner?: string; glow?: string };
}

export interface StdResult { ridgeY: number; storeyH: number; eaveY: number }

/** glow colour for a window from a hash: mostly warm, some cool, some dark */
export function windowGlow(seed: string, i: number, litFraction = 0.8): string | undefined {
  const r = h01(seed, i * 7 + 3);
  if (r > litFraction) return undefined;
  if (r < litFraction * 0.12) return "#9cc4ff";
  if (r < litFraction * 0.3) return "#c98a3a";
  return "#ffb768";
}

/** the ridge/roof height above the wall for a spec */
export function stdBuilding(ctx: Ctx, o: StdOpts): StdResult {
  const { gb, p } = ctx;
  const storeys = o.storeys ?? 1;
  const storeyH = o.h / storeys;
  const seed = p.loc.id;
  const rise = o.roof.rise ?? 2.6;
  const ws: WallStyle = { ...o.wall, storeys: o.wall.storeyBand === false ? 1 : storeys, storeyH };
  if (o.room && !o.door?.none && (o.door?.side ?? "front") === "front") {
    ws.opening = { x: o.door?.x ?? 0, w: o.door?.w ?? 1.5, h: o.door?.h ?? 3.0, depth: o.room.depth, floor: o.room.floor, inner: o.room.inner, glow: o.room.glow };
  }
  walls(gb, o.w, o.h, o.d, ws);

  // roof
  const rc = o.roof.color, rt = o.roof.trim ?? o.wall.trim;
  let ridgeY = o.h + rise, eaveY = o.h;
  switch (o.roof.type) {
    case "gable":
      gableEnds(gb, o.w, o.d, o.h, rise, o.wall.color, "x", o.wall.grime ?? 0);
      roofGable(gb, o.w, o.d, o.h, rise, { color: rc, trim: rt, tiles: o.roof.tiles ?? 7, ridge: o.roof.ridge, overhang: o.roof.overhang });
      break;
    case "gableZ":
      gableEnds(gb, o.w, o.d, o.h, rise, o.wall.color, "z", o.wall.grime ?? 0);
      roofGable(gb, o.w, o.d, o.h, rise, { color: rc, trim: rt, tiles: o.roof.tiles ?? 7, ridge: o.roof.ridge, overhang: o.roof.overhang, ridgeAxis: "z" });
      break;
    case "thatch":
      gableEnds(gb, o.w, o.d, o.h, rise, o.wall.color, "x", o.wall.grime ?? 0);
      roofGable(gb, o.w, o.d, o.h, rise, { color: rc, trim: shade(rc, 0.7), thatch: true, overhang: 0.9, thick: 0.7, ridge: shade(rc, 0.75) });
      break;
    case "corrugated":
      gableEnds(gb, o.w, o.d, o.h, rise, o.wall.color, "x", o.wall.grime ?? 0);
      roofGable(gb, o.w, o.d, o.h, rise, { color: rc, trim: rt, corrugated: true, thick: 0.12, overhang: o.roof.overhang ?? 0.5 });
      break;
    case "hip":
      roofHip(gb, o.w, o.d, o.h, rise, { color: rc, trim: rt, ridge: o.roof.ridge, overhang: o.roof.overhang });
      break;
    case "pyramid":
      roofHip(gb, o.w, o.d, o.h, rise, { color: rc, trim: rt, ridgeLen: 0, overhang: o.roof.overhang });
      break;
    case "mansard":
      roofMansard(gb, o.w, o.d, o.h, rise, { color: rc, trim: rt, tiles: o.roof.tiles ?? 4 });
      break;
    case "shed":
      roofShed(gb, o.w, o.d, o.h, rise, { color: rc, trim: rt, corrugated: false });
      ridgeY = o.h + rise;
      break;
    case "flat":
      roofFlat(gb, o.w, o.d, o.h, { color: rc, trim: rt, parapet: o.roof.parapet, parapetH: o.roof.parapetH });
      ridgeY = o.h + (o.roof.parapetH ?? 0.7) + 0.3; eaveY = o.h + 0.3;
      break;
  }

  // chimneys (through the roof)
  for (const c of o.chimneys ?? []) {
    let topY: number;
    const cw = c.w ?? 0.9;
    if (o.roof.type === "flat") topY = o.h + 1.6;
    else if (o.roof.type === "hip" || o.roof.type === "pyramid" || o.roof.type === "mansard") topY = o.h + rise * 0.9 + 0.9;
    else if (o.roof.type === "shed") topY = o.h + rise + 0.9;
    else topY = o.h + rise * (1 - Math.abs(c.z) / (o.d / 2)) + 1.1;
    const yBase = o.h - 0.5;
    const top = chimney(gb, c.x, c.z, yBase, topY - yBase, o.chimneyColor ?? (o.wall.quoins ? "#8d877c" : "#7a6a60"), { w: cw, pots: c.pots ?? 2 });
    ctx.chimneyTop(top[0], top[1], top[2]);
  }
  // dormers on the front slope
  if (o.dormers && (o.roof.type === "gable" || o.roof.type === "thatch")) {
    const n = o.dormers;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : (i / (n - 1) - 0.5) * (o.w - 4);
      dormer(gb, x, o.h, o.d, rise, 0.42, o.wall.color, rc, rt, { glow: windowGlow(seed, 90 + i, o.windows?.lit ?? 0.8) });
      ctx.window(x, o.h + rise * 0.42 + 0.6, o.d * 0.29, 0);
    }
  }

  // windows
  const win = o.windows ?? {};
  if (!win.none) {
    const ww = win.w ?? 1.3, wh = win.h ?? 1.6, spacing = win.spacing ?? 2.9;
    const sides = win.sides ?? (["front", "back", ...(o.w >= 8 || o.d >= 8 ? ["left", "right"] as Side[] : [])] as Side[]);
    const doorSide = o.door?.side ?? "front", doorX = o.door?.x ?? 0, doorW = (o.door?.w ?? 1.5) + 0.9;
    let wi = 0;
    for (const side of sides) {
      const len = side === "front" || side === "back" ? o.w : o.d;
      const n = Math.max(1, Math.floor((len - 1.2) / spacing));
      for (let s = 0; s < storeys; s++) {
        if (win.upperOnly && s === 0) continue;
        const cy = s === 0 ? (win.groundY ?? storeyH * 0.58) : storeyH * s + storeyH * 0.55;
        for (let i = 0; i < n; i++) {
          const along = ((i + 0.5) / n - 0.5) * (len - 1.6);
          if (side === doorSide && s === 0 && !o.door?.none && Math.abs(along - doorX) < doorW / 2 + ww / 2) continue;
          if (side === "front" && s === 0 && o.hanging && Math.abs(along - o.hanging.x) < 1.2) continue;
          face(gb, side, along, 0, o.w, o.d);
          windowEl(gb, 0, cy, ww, wh, { frame: win.frame ?? o.wall.trim, shutters: win.shutters, flowers: win.flowers && s > 0, glow: windowGlow(seed, wi, win.lit ?? 0.8), pane: win.pane });
          gb.pop();
          const wp = wallPoint(side, along, o.w, o.d);
          ctx.window(wp[0], cy, wp[2], wp[3]);
          wi++;
        }
      }
    }
  }

  // door + step + path
  if (!o.door?.none) {
    const dside = o.door?.side ?? "front", dx = o.door?.x ?? 0, dw = o.door?.w ?? 1.5, dh = o.door?.h ?? 3.0;
    face(gb, dside, dx, 0, o.w, o.d);
    doorEl(gb, 0, dw, dh, { color: o.door?.color ?? shade(o.wall.trim, 0.55), frame: o.door?.frame ?? o.wall.trim, open: o.door?.open, double: o.door?.double, glass: o.door?.glass, fanlight: o.door?.fanlight, step: o.door?.step });
    if (o.path !== false) path(gb, 0, 0.66, typeof o.path === "number" ? o.path : 2.6);
    gb.pop();
    const wp = wallPoint(dside, dx, o.w, o.d);
    ctx.door(wp[0], 0, wp[2], wp[3], dw, dh);
  }

  // sign board over the door
  if (o.sign) {
    const side = o.sign.side ?? "front", sx = o.sign.x ?? 0, sy = o.sign.y ?? Math.min(o.h - 0.2, storeyH + 0.1);
    const sw = o.sign.spec.w, sh = o.sign.spec.h;
    face(gb, side, sx, 0, o.w, o.d);
    gb.box(0, sy - sh / 2 - 0.08, 0.05, sw + 0.24, sh + 0.16, 0.12, shade(o.wall.trim, 0.8), { bevel: 0.03 });
    if (o.sign.lamp !== false) {
      // little gooseneck lamp lighting the board at night
      for (const s of [-1, 1]) {
        gb.box(s * sw * 0.3, sy + sh / 2 + 0.25, 0.25, 0.05, 0.05, 0.5, "#2b2b2b", { anchor: "center" });
        gb.cyl(s * sw * 0.3, sy + sh / 2 + 0.05, 0.5, 0.16, 0.06, 0.2, 6, "#2b2b2b");
        gb.box(s * sw * 0.3, sy + sh / 2 + 0.02, 0.5, 0.14, 0.04, 0.14, "#fff0c0", { glow: "#ffe0a0" });
      }
    }
    gb.pop();
    const wp = wallPoint(side, sx, o.w, o.d);
    ctx.sign(o.sign.spec, wp[0] + wp[4] * 0.13, sy, wp[2] + wp[5] * 0.13, wp[3]);
  }
  // hanging sign on a bracket
  if (o.hanging) {
    const side = o.hanging.side ?? "front", hx = o.hanging.x, hy = o.hanging.y ?? Math.min(o.h - 0.3, storeyH + 0.6);
    const sw = o.hanging.spec.w, sh = o.hanging.spec.h;
    face(gb, side, hx, 0, o.w, o.d);
    gb.box(0, hy + sh / 2 + 0.2, 0.06, 0.08, 0.08, sw + 0.5, "#2b2b2b", {});
    gb.box(0, hy + sh / 2 - 0.3, 0.06, 0.08, 1.0, 0.08, "#2b2b2b", { bevel: 0 });
    gb.box(0, hy + sh / 2 - 0.25, 0.3, 0.06, 0.06, 0.6, "#2b2b2b", { rx: -0.8, anchor: "center" });
    gb.box(0, hy - sh / 2 - 0.02, 0.35 + sw / 2, sw + 0.12, sh + 0.06, 0.06, shade(o.wall.trim, 0.7), { bevel: 0.02, ry: Math.PI / 2 });
    gb.pop();
    const wp = wallPoint(side, hx, o.w, o.d);
    const ox = wp[4], oz = wp[5];
    ctx.sign(o.hanging.spec, wp[0] + ox * (0.35 + sw / 2), hy, wp[2] + oz * (0.35 + sw / 2), wp[3] + Math.PI / 2, true);
  }
  for (const lx of o.lanterns ?? []) {
    face(gb, "front", lx, 0, o.w, o.d);
    lantern(gb, 0, Math.min(o.h - 0.6, 3.4));
    gb.pop();
    const wp = wallPoint("front", lx, o.w, o.d);
    ctx.lanternLight(wp[0] + wp[4] * 0.5, 3.1, wp[2] + wp[5] * 0.5);
  }
  if (o.awning) {
    const a = o.awning;
    face(gb, "front", a.x ?? 0, 0, o.w, o.d);
    awning(gb, 0, a.y ?? Math.min(o.h - 0.3, 3.5), a.w ?? Math.min(o.w * 0.8, 7), a.depth ?? 1.8, a.a, a.b);
    gb.pop();
  }
  if (o.drainpipes !== false && o.roof.type !== "flat") {
    for (const s of [-1, 1]) { face(gb, "front", s * (o.w / 2 - 0.35), 0, o.w, o.d); drainpipe(gb, 0, o.h); gb.pop(); }
  }
  return { ridgeY, storeyH, eaveY };
}

/** local point on a wall + outward direction: [x, y, z, ry, nx, nz] */
export function wallPoint(side: Side, along: number, w: number, d: number): [number, number, number, number, number, number] {
  switch (side) {
    case "front": return [along, 0, d / 2, 0, 0, 1];
    case "back": return [-along, 0, -d / 2, Math.PI, 0, -1];
    case "right": return [w / 2, 0, -along, Math.PI / 2, 1, 0];
    case "left": return [-w / 2, 0, along, -Math.PI / 2, -1, 0];
  }
}

/** a shed / outhouse at a local offset */
export function shed(gb: GB, x: number, z: number, ry: number, w = 2.4, d = 2, h = 2.2, color = "#6b5a40", roof = "#4f5a68") {
  gb.push(x, 0, z, ry);
  gb.box(0, 0, 0, w, h, d, color, { bevel: 0.05, grime: 0.15 });
  roofShed(gb, w, d, h, 0.5, { color: roof, trim: shade(color, 0.7), overhang: 0.25, thick: 0.1, corrugated: true });
  gb.box(0, 0, d / 2 + 0.01, 0.9, h * 0.8, 0.08, shade(color, 0.7), {});
  gb.pop();
}

/** laundry pole pair + line (exported for the life agent) at local offset */
export function laundry(ctx: Ctx, x: number, z: number, ry: number, len = 4) {
  const { gb } = ctx;
  const gy = ctx.ground(x, z);
  gb.push(x, gy, z, ry);
  for (const s of [-1, 1]) { gb.cyl(s * len / 2, 0, 0, 0.06, 0.05, 2.4, 6, "#8a8f94"); gb.box(s * len / 2, 2.3, 0, 0.3, 0.06, 0.06, "#8a8f94", {}); }
  gb.box(0, 2.28, 0, len, 0.025, 0.025, "#f4efe2", {});
  gb.pop();
  ctx.laundry(x, gy + 2.28, z, ry, len);
}

/** vegetable patch: soil bed + rows of crops (crops go to L.crops so they render with the town's crop instances) */
export function vegPatch(ctx: Ctx, x: number, z: number, w: number, d: number, ry = 0) {
  const { gb } = ctx;
  const gy = ctx.ground(x, z);
  gb.push(x, gy, z, ry);
  gb.box(0, 0.02, 0, w, 0.18, d, "#5a4630", { bevel: 0.05 });
  for (let i = 0; i < 4; i++) gb.box(0, 0.16, -d / 2 + (d * (i + 0.5)) / 4, w - 0.3, 0.1, 0.25, "#4a3826", {});
  gb.pop();
  const rows = 4, cols = Math.max(2, Math.floor(w / 0.7));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lx = -w / 2 + 0.35 + c * ((w - 0.7) / (cols - 1)), lz = -d / 2 + (d * (r + 0.5)) / 4;
    const cx = x + lx * Math.cos(ry) + lz * Math.sin(ry), cz = z - lx * Math.sin(ry) + lz * Math.cos(ry);
    ctx.crop(cx, cz, 0.45 + (r % 2) * 0.2, ["#5aa646", "#7fbf4a", "#3f8f3a", "#a9c84a"][r]);
  }
}

/** flower bed at local offset */
export function flowerBed(gb: GB, x: number, z: number, w: number, d: number, seed: string) {
  gb.box(x, 0.02, z, w, 0.14, d, "#5a4630", { bevel: 0.04 });
  const n = Math.floor(w * d * 2.2);
  const cols = ["#e04a5a", "#f2b632", "#e86aa0", "#f7f4ec", "#8a5ac8", "#f26a1b"];
  for (let i = 0; i < n; i++) {
    const px = x + (h01(seed, i * 2) - 0.5) * (w - 0.3), pz = z + (h01(seed, i * 2 + 1) - 0.5) * (d - 0.3);
    gb.sphere(px, 0.28, pz, 0.11, cols[i % cols.length]);
    gb.sphere(px + 0.05, 0.18, pz + 0.05, 0.13, "#4e8f3e");
  }
}

/** external timber staircase up to a first-floor door on `side` (rental blocks, flats above shops) */
export function externalStair(gb: GB, x: number, z: number, ry: number, h: number, color = "#6b5a40") {
  gb.push(x, 0, z, ry);
  const n = Math.max(4, Math.round(h / 0.33));
  const run = 3.2 / n;
  for (let i = 0; i < n; i++) gb.box(0, (i * h) / n, -1.6 + (i + 0.5) * run, 1.1, 0.08, run, i % 2 ? color : shade(color, 0.9), {});
  for (const s of [-1, 1]) gb.box(s * 0.55, h / 2, 0, 0.08, 0.1, Math.hypot(h, 3.2), shade(color, 0.7), { rx: -Math.atan2(h, 3.2), anchor: "center" });
  for (const s of [-1, 1]) gb.box(s * 0.55, h / 2 + 0.9, 0, 0.05, 0.06, Math.hypot(h, 3.2), shade(color, 0.6), { rx: -Math.atan2(h, 3.2), anchor: "center" });
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) gb.box(s * 0.55, ((i + 0.5) / 4) * h, -1.6 + ((i + 0.5) / 4) * 3.2, 0.04, 0.9, 0.04, shade(color, 0.6), {});
  gb.pop();
}

export const dirV: V3 = [0, 0, 1];
