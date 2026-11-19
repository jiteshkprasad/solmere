/**
 * Main Street & Workshop Row businesses: bakery, general store, café (+flat), tavern (+room),
 * barber, tailor, brewery, carpentry, garage, and the square's inn, tea stall, bank, realty.
 */
import type { Ctx } from "../layout";
import { stdBuilding, externalStair, windowGlow } from "./common";
import { face, windowEl, doorEl, porch, balcony, column, pediment, barrel, flowerBox, shade, steps } from "../kit";

export function bakery(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: s.trim, bevel: 0.14, grime: 0.1 },
    roof: { type: "gable", color: s.roofColor, rise: s.roofH, tiles: 8 },
    door: { x: -3.2, w: 1.5, h: 3.0, color: "#7a3b2a", glass: true, fanlight: true },
    windows: { none: true },
    chimneys: [{ x: 3.2, z: -1.5, w: 1.1, pots: 2 }],
    dormers: 1,
    sign: { spec: { kind: "board", text: "Okafor's Bakery", icon: "loaf", w: 5.5, h: 0.95, bg: "#5a2a1a", fg: "#fff0c8", border: "#e0b050" }, y: 4.0 },
    hanging: { spec: { kind: "hanging", text: "BAKERY", icon: "loaf", w: 1.1, h: 1.1, bg: "#5a2a1a" }, x: s.w / 2 - 0.4 },
    awning: { a: "#c8623f", b: "#f7e6c8", w: 6, depth: 1.8, x: 1.2, y: 3.3 },
    lanterns: [-4.8],
  });
  // big shop window with bread display
  face(gb, "front", 1.2, 0, s.w, s.d);
  windowEl(gb, 0, 1.9, 4.4, 2.0, { frame: s.trim, glow: "#ffb768", mullions: false });
  for (let i = 0; i < 5; i++) gb.box(-1.6 + i * 0.8, 1.05, 0.14, 0.5, 0.22, 0.05, i % 2 ? "#c98a4a" : "#d9a05a", { bevel: 0.06 });
  gb.box(0, 0.86, 0.14, 4.2, 0.16, 0.05, "#7a3b2a", {});
  gb.pop();
  // side window
  face(gb, "left", 0, 0, s.w, s.d); windowEl(gb, 0, 2.4, 1.3, 1.6, { frame: s.trim, glow: "#ffb768", flowers: true }); gb.pop();
  face(gb, "back", 0, 0, s.w, s.d); windowEl(gb, -2.5, 2.4, 1.3, 1.6, { frame: s.trim, glow: windowGlow(p.loc.id, 5) }); windowEl(gb, 2.5, 2.4, 1.3, 1.6, { frame: s.trim, glow: windowGlow(p.loc.id, 6) }); gb.pop();
  // outside: bread racks, delivery bike, flour sacks, bench
  ctx.prop("breadRack", 4.2, s.d / 2 + 0.9, 0);
  ctx.prop("bike", -5.4, s.d / 2 + 2.2, 1.4);
  ctx.prop("sack", s.w / 2 + 0.9, -1, 0.4); ctx.prop("sack", s.w / 2 + 1.5, -0.4, 1.2);
  ctx.prop("windowBox", 1.2, s.d / 2 + 0.25, 0, { y: 3.05 });
  ctx.bench(-1.0, s.d / 2 + 1.3, 0);
}

export function generalStore(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 2,
    wall: { color: s.wall, trim: s.trim, clapboard: true, bevel: 0.1 },
    roof: { type: "hip", color: s.roofColor, rise: s.roofH },
    door: { x: 0, w: 1.8, h: 3.0, color: "#3a6b3a", double: true, glass: true, step: false },
    windows: { w: 1.3, h: 1.5, upperOnly: true, shutters: "#3a6b3a", flowers: false },
    chimneys: [{ x: -4, z: -2, w: 0.8, pots: 1 }],
    lanterns: [],
    path: false,
  });
  // covered porch across the front with a deck; the name board stands on the porch roof edge
  face(gb, "front", 0, 0, s.w, s.d);
  porch(gb, s.w - 0.5, 2.8, s.h / 2 + 0.4, "#e8e0cc", shade(s.roofColor, 1.1), s.trim, { posts: 5, deck: true, rail: false });
  gb.pop();
  const py = s.h / 2 + 0.4 - 0.3 + 0.15, pz = s.d / 2 + 2.7;
  gb.box(0, py - 0.1, pz, 7.4, 1.25, 0.14, "#1f3a1f", { bevel: 0.03 });
  for (const sx of [-1, 1]) gb.box(sx * 3.5, py - 0.1, pz - 0.3, 0.1, 1.2, 0.5, "#1f3a1f", { rx: 0.3, anchor: "bottom" });
  ctx.sign({ kind: "board", text: "Rao General Store", w: 7, h: 1.0, bg: "#2f5a2f", fg: "#fff6d8", border: "#d8b45a" }, 0, py + 0.5, pz + 0.08, 0);
  for (const sx of [-1, 1]) { gb.box(sx * 2.4, py + 1.3, pz + 0.2, 0.05, 0.05, 0.4, "#2b2b2b", { anchor: "center" }); gb.box(sx * 2.4, py + 1.15, pz + 0.4, 0.14, 0.05, 0.14, "#fff0c0", { glow: "#ffe0a0" }); }
  // big display windows either side of the door
  for (const sx of [-1, 1]) { face(gb, "front", sx * 3.3, 0, s.w, s.d); windowEl(gb, 0, 1.9, 2.6, 2.0, { frame: s.trim, glow: "#ffb768", mullions: true }); gb.pop(); }
  // goods on the porch: crates, sacks, a chalkboard
  ctx.prop("crate", -4.6, s.d / 2 + 1.0, 0.2, { y: 0.05 }); ctx.prop("crate", -4.6, s.d / 2 + 1.0, 0.5, { y: 0.77, s: 0.8 }); ctx.prop("crate", -3.6, s.d / 2 + 1.8, -0.3, { y: 0.05 });
  ctx.prop("sack", 4.6, s.d / 2 + 1.1, 0.3, { y: 0.05 }); ctx.prop("sack", 4.0, s.d / 2 + 1.9, 1.0, { y: 0.05 }); ctx.prop("basket", 3.2, s.d / 2 + 0.8, 0, { y: 0.05 });
  ctx.prop("barrel", 5.0, s.d / 2 + 2.2, 0, { y: 0.05 });
  ctx.sign({ kind: "chalk", text: "TODAY", sub: "eggs · flour|rope · lamp oil|fresh apples", w: 1.0, h: 1.3 }, -2.2, 0.8, s.d / 2 + 1.2, -0.5);
  gb.push(-2.2, 0.05, s.d / 2 + 1.2, -0.5); gb.box(0, 0, -0.1, 1.1, 1.45, 0.06, "#6b4a30", {}); for (const sx of [-1, 1]) gb.box(sx * 0.45, 0, -0.35, 0.05, 1.3, 0.05, "#6b4a30", { rx: -0.3 }); gb.pop();
  ctx.prop("bikeRack", s.w / 2 + 1.6, s.d / 2 - 1, Math.PI / 2);
  ctx.prop("bike", s.w / 2 + 1.6, s.d / 2 - 1.2, Math.PI / 2 + 0.2);
}

export function cafe(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 2,
    wall: { color: s.wall, trim: s.trim, bevel: 0.12, grime: 0.08 },
    roof: { type: "mansard", color: s.roofColor, rise: s.roofH, tiles: 4 },
    door: { x: -2.6, w: 1.5, h: 3.0, color: "#8a2a3a", glass: true },
    windows: { w: 1.2, h: 1.6, upperOnly: true, shutters: "#8a2a3a", flowers: true },
    chimneys: [{ x: 3.5, z: 0, w: 0.8, pots: 2 }],
    sign: { spec: { kind: "board", text: "Café Moreno", icon: "cup", w: 5, h: 0.9, bg: "#6e1f2e", fg: "#ffe9d0", border: "#e8b050" }, y: 4.05 },
    hanging: { spec: { kind: "hanging", text: "CAFÉ", icon: "cup", w: 1.0, h: 1.0, bg: "#6e1f2e" }, x: s.w / 2 - 0.4 },
    awning: { a: "#8a2a3a", b: "#f7e6d8", w: 8, depth: 2.2, y: 3.3 },
    lanterns: [-4.4],
  });
  face(gb, "front", 1.4, 0, s.w, s.d);
  windowEl(gb, 0, 1.9, 4.2, 2.0, { frame: s.trim, glow: "#ffb768", mullions: true });
  gb.pop();
  // pavement café: tables, chairs, umbrellas, planters, string lights on posts
  const T: [number, number][] = [[-3.2, 3.6], [0.2, 3.9], [3.4, 3.6], [1.6, 6.2], [-1.8, 6.4]];
  for (const [tx, tz] of T) {
    const lz = s.d / 2 + tz;
    ctx.prop("table", tx, lz, 0);
    ctx.prop("umbrella", tx, lz, 0.3);
    ctx.prop("chair", tx - 0.75, lz, Math.PI / 2); ctx.prop("chair", tx + 0.75, lz, -Math.PI / 2);
    if (tz > 5) ctx.prop("chair", tx, lz - 0.75, 0);
  }
  ctx.prop("planter", -4.6, s.d / 2 + 2.0, 0.2); ctx.prop("planter", 4.6, s.d / 2 + 2.0, -0.2);
  // string lights
  const L0 = -4.6, L1 = 4.6;
  for (const x of [L0, L1]) gb.cyl(x, ctx.ground(x, s.d / 2 + 7.2), s.d / 2 + 7.2, 0.05, 0.04, 3.2, 6, "#3a3a3a");
  for (let i = 0; i <= 14; i++) { const t = i / 14, x = L0 + (L1 - L0) * t; const y = 3.1 - Math.sin(t * Math.PI) * 0.35; gb.sphere(x, y, s.d / 2 + 7.2, 0.07, "#fff2c0", "#ffd68a"); }
  gb.box(0, 3.1, s.d / 2 + 7.2, L1 - L0, 0.02, 0.02, "#3a3a3a", { anchor: "center" });
  for (let i = 0; i <= 14; i++) { const t = i / 14, x = L0 + (L1 - L0) * t; const y = 3.1 - Math.sin(t * Math.PI) * 0.35; gb.sphere(x, y, s.d / 2 + 2.4, 0.07, "#fff2c0", "#ffd68a"); }
  ctx.prop("bin", 5.4, s.d / 2 + 0.6, 0);
}

/** the flat above the café: a rear annex with an outside stair (its own location) */
export function flatAboveCafe(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 2,
    wall: { color: s.wall, trim: s.trim, bevel: 0.1, grime: 0.12 },
    roof: { type: "shed", color: s.roofColor, rise: s.roofH },
    door: { none: true },
    windows: { w: 1.2, h: 1.5, sides: ["front", "left", "right"], flowers: true, upperOnly: true },
    drainpipes: false, path: false,
  });
  // first-floor door + landing + stair
  face(gb, "front", 1.4, s.h / 2, s.w, s.d);
  doorEl(gb, 0, 1.3, 2.6, { color: "#8a2a3a", frame: s.trim, step: false });
  gb.box(0, -0.15, 0.8, 2.6, 0.15, 1.6, "#6b5a40", {});
  gb.box(-1.3, 0, 0.8, 0.06, 1.0, 1.6, "#4a3a2a", {}); gb.box(0, 1.0, 1.55, 2.6, 0.06, 0.06, "#4a3a2a", {}); gb.box(1.3, 0, 0.8, 0.06, 1.0, 1.6, "#4a3a2a", {});
  gb.pop();
  externalStair(gb, -1.6, s.d / 2 + 1.0, Math.PI / 2, s.h / 2, "#6b5a40");
  ctx.door(1.4, s.h / 2, s.d / 2, 0, 1.3, 2.6);
  ctx.prop("bin", -3.2, s.d / 2 + 0.4, 0.3); ctx.prop("bike", 3.4, s.d / 2 + 0.8, 0.2);
  ctx.prop("windowBox", 1.4, s.d / 2 + 0.2, 0, { y: s.h / 2 + 2.7 });
  ctx.chimneyTop(-2, s.h + s.roofH + 0.8, -2);
  gb.box(-2, s.h - 0.5, -2, 0.7, s.roofH + 1.3, 0.7, "#7a6a60", {}); gb.box(-2, s.h + s.roofH + 0.8, -2, 0.9, 0.16, 0.9, "#5a4a40", {});
}

export function tavern(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 2,
    wall: { color: s.wall, trim: s.trim, timber: "#1e130c", bevel: 0.14, grime: 0.18 },
    roof: { type: "gable", color: s.roofColor, rise: s.roofH, tiles: 9, trim: "#2a1a10" },
    door: { x: 0, w: 2.0, h: 3.1, color: "#2a1a10", double: true, open: 0.9, step: true, frame: "#7a5a3a" },
    windows: { w: 1.3, h: 1.4, spacing: 3.0, frame: "#7a5a3a", lit: 0.95, pane: "#2e3a44" },
    chimneys: [{ x: -5, z: 0, w: 1.2, pots: 3 }, { x: 5.2, z: -1, w: 1.0, pots: 2 }],
    dormers: 2,
    hanging: { spec: { kind: "hanging", text: "THE DROWNED ANCHOR", icon: "anchor", w: 1.5, h: 1.5, bg: "#1e130c", fg: "#e8d8a8", border: "#b08a3a" }, x: -4.6, y: 4.9 },
    sign: { spec: { kind: "board", text: "The Drowned Anchor", icon: "anchor", w: 7.5, h: 1.0, bg: "#1a120c", fg: "#e8d8a8", border: "#b08a3a" }, y: 4.6, lamp: true },
    lanterns: [-1.7, 1.7],
    room: { depth: 4.5, floor: "#3a2a1a", inner: "#3a2618", glow: "#6a3a1a" },
  });
  // warm glowing interior seen through the open double door: bar with lamps
  gb.box(0, 0.9, s.d / 2 - 3.6, 4, 0.1, 0.8, "#5b3a29", {}); gb.box(0, 0, s.d / 2 - 3.6, 3.8, 0.9, 0.7, "#4a2e1c", {});
  for (let i = 0; i < 3; i++) gb.cyl(-1.2 + i * 1.2, 1.0, s.d / 2 - 3.6, 0.08, 0.07, 0.3, 6, "#e8c23a", { glow: "#ffd27a" });
  // barrels, kegs, bench outside
  ctx.prop("barrel", -5.6, s.d / 2 + 1.2, 0.2); ctx.prop("barrel", -6.3, s.d / 2 + 2.3, 0.9); ctx.prop("keg", -4.7, s.d / 2 + 2.0, 0);
  ctx.prop("keg", 5.8, s.d / 2 + 1.0, 0.4); ctx.prop("keg", 6.2, s.d / 2 + 1.9, 1.2);
  ctx.bench(3.6, s.d / 2 + 1.1, 0);
  ctx.prop("stool", -3.0, s.d / 2 + 2.2, 0); ctx.prop("stool", -3.6, s.d / 2 + 2.9, 0);
  // an upturned barrel table with tankards
  barrel(gb, 3.4, s.d / 2 + 2.8, 0.42, 1.0);
  gb.cyl(3.25, 1.02, s.d / 2 + 2.7, 0.08, 0.08, 0.2, 6, "#d8c8a0"); gb.cyl(3.55, 1.02, s.d / 2 + 2.95, 0.08, 0.08, 0.2, 6, "#d8c8a0");
  // ship's wheel on the gable end, an old net and lobster pots by the side wall
  face(gb, "right", -1.5, 0, s.w, s.d);
  gb.cyl(0, 3.0, 0.1, 0.5, 0.5, 0.08, 8, "#8b5a3c", { rx: Math.PI / 2, anchor: "center" });
  for (let i = 0; i < 4; i++) gb.box(0, 3.0, 0.12, 1.3, 0.08, 0.06, "#6b4a30", { rz: (i * Math.PI) / 4, anchor: "center" });
  gb.pop();
  ctx.prop("lobsterPot", s.w / 2 + 0.9, 2.0, 0.3); ctx.prop("lobsterPot", s.w / 2 + 1.1, 0.9, -0.2, { y: 0.0 }); ctx.prop("lobsterPot", s.w / 2 + 0.9, 2.0, 0.3, { y: 0.52 });
  ctx.prop("bin", -s.w / 2 - 0.6, s.d / 2 - 1.5, 0);
}

/** Costa's room above the tavern: rear annex with an outside stair */
export function roomAboveTavern(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 2,
    wall: { color: s.wall, trim: s.trim, timber: "#1e130c", bevel: 0.1, grime: 0.2 },
    roof: { type: "shed", color: s.roofColor, rise: s.roofH },
    door: { none: true },
    windows: { w: 1.1, h: 1.3, sides: ["front", "left", "right"], upperOnly: true, frame: "#7a5a3a", lit: 0.6 },
    drainpipes: false, path: false,
  });
  face(gb, "front", 1.2, s.h / 2, s.w, s.d);
  doorEl(gb, 0, 1.2, 2.5, { color: "#2a1a10", frame: "#7a5a3a", step: false });
  gb.box(0, -0.15, 0.8, 2.4, 0.15, 1.6, "#5b4a34", {});
  gb.box(-1.2, 0, 0.8, 0.06, 1.0, 1.6, "#3a2a1a", {}); gb.box(0, 1.0, 1.55, 2.4, 0.06, 0.06, "#3a2a1a", {}); gb.box(1.2, 0, 0.8, 0.06, 1.0, 1.6, "#3a2a1a", {});
  gb.pop();
  externalStair(gb, -1.6, s.d / 2 + 1.0, Math.PI / 2, s.h / 2, "#5b4a34");
  ctx.door(1.2, s.h / 2, s.d / 2, 0, 1.2, 2.5);
  ctx.prop("keg", -2.6, s.d / 2 + 0.5, 0); ctx.prop("keg", -2.0, s.d / 2 + 1.1, 0.6); ctx.prop("crate", 2.8, s.d / 2 + 0.7, 0.2);
  ctx.prop("bin", 3.4, -s.d / 2 - 0.5, 0);
}

export function barber(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: "#ffffff", bevel: 0.12 },
    roof: { type: "hip", color: s.roofColor, rise: s.roofH, trim: "#ffffff" },
    door: { x: -2.2, w: 1.4, h: 2.9, color: "#c8323c", glass: true, frame: "#ffffff" },
    windows: { none: true },
    sign: { spec: { kind: "board", text: "Sal's Barbershop", icon: "scissors", w: 5.2, h: 0.85, bg: "#1f2f5a", fg: "#ffffff", border: "#c8323c" }, y: 3.85 },
    awning: { a: "#c8323c", b: "#ffffff", w: 5.5, depth: 1.5, x: 0.8, y: 3.1 },
  });
  face(gb, "front", 1.2, 0, s.w, s.d);
  windowEl(gb, 0, 1.9, 3.0, 1.8, { frame: "#ffffff", glow: "#ffe0a0", mullions: false });
  // barber's chair silhouette in the window
  gb.box(0.4, 0.95, 0.15, 0.6, 0.5, 0.05, "#c8323c", {}); gb.box(0.4, 1.45, 0.15, 0.5, 0.6, 0.05, "#a8232c", {});
  gb.pop();
  // barber pole (stacked striped rings, glowing softly at night)
  face(gb, "front", s.w / 2 - 0.5, 0, s.w, s.d);
  gb.box(0, 2.2, 0.15, 0.08, 0.08, 0.3, "#3a3a3a", { anchor: "center" });
  gb.cyl(0, 1.5, 0.35, 0.18, 0.18, 0.12, 8, "#c8c8c8"); gb.cyl(0, 2.9, 0.35, 0.18, 0.18, 0.12, 8, "#c8c8c8");
  for (let i = 0; i < 9; i++) gb.cyl(0, 1.62 + i * 0.142, 0.35, 0.15, 0.15, 0.142, 8, i % 3 === 0 ? "#d8262c" : i % 3 === 1 ? "#f4f4f4" : "#1f4fa8", { glow: i % 3 === 1 ? "#ffffff" : undefined, phase: i * 0.3 });
  gb.sphere(0, 3.1, 0.35, 0.12, "#fff4d6", "#ffd27a");
  gb.pop();
  ctx.bench(-3.2, s.d / 2 + 1.4, 0);
  ctx.prop("planter", 3.4, s.d / 2 + 1.2, 0);
  ctx.prop("bin", -s.w / 2 - 0.5, s.d / 2 - 1, 0);
  // a small chimney at the back
  ctx.chimneyTop(-2.5, s.h + s.roofH + 0.3, -1.5);
  gb.box(-2.5, s.h - 0.5, -1.5, 0.7, s.roofH + 0.7, 0.7, "#8a7a70", {});
}

export function tailor(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  // tall narrow house with a stepped (Dutch) gable facing the street
  const r = stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 2,
    wall: { color: s.wall, trim: s.trim, bevel: 0.12, quoins: "#c9b06a" },
    roof: { type: "gableZ", color: s.roofColor, rise: s.roofH, tiles: 7 },
    door: { x: 2.6, w: 1.4, h: 3.0, color: "#3f3a37", glass: true, fanlight: true },
    windows: { w: 1.2, h: 1.6, upperOnly: true, shutters: "#3f3a37", spacing: 2.6 },
    sign: { spec: { kind: "board", text: "Achebe Tailoring", icon: "needle", w: 5.4, h: 0.9, bg: "#3a2a4a", fg: "#f6e8c0", border: "#c9a24a" }, y: 4.2 },
    hanging: { spec: { kind: "hanging", text: "TAILOR", icon: "needle", w: 1.0, h: 1.0, bg: "#3a2a4a" }, x: -s.w / 2 + 0.4 },
    awning: { a: "#7b4fa0", b: "#e8dcf0", w: 4.5, depth: 1.5, x: -1.2, y: 3.2 },
    chimneys: [{ x: 0, z: -2.4, w: 0.8, pots: 2 }],
  });
  // stepped gable over the front
  const steps_ = 4, gw = s.w + 0.6;
  for (let i = 0; i < steps_; i++) {
    const w = gw * (1 - i / steps_);
    gb.box(0, s.h + (s.roofH * i) / steps_ - 0.1, s.d / 2 + 0.05, w, s.roofH / steps_ + 0.12, 0.5, s.wall, { bevel: 0.04 });
    gb.box(0, s.h + (s.roofH * (i + 1)) / steps_ - 0.1, s.d / 2 + 0.05, w + 0.2, 0.14, 0.62, "#c9b06a", {});
  }
  gb.box(0, s.h + s.roofH + 0.05, s.d / 2 + 0.05, 0.4, 0.5, 0.5, "#c9b06a", {});
  // bay window with a dressmaker's dummy
  face(gb, "front", -1.2, 0, s.w, s.d);
  gb.box(0, 0.2, 0.3, 3.4, 2.9, 0.6, s.wall, { bevel: 0.06 });
  windowEl(gb, 0, 1.9, 2.6, 1.8, { frame: s.trim, glow: "#ffe0a0", mullions: true });
  gb.pop();
  face(gb, "front", -1.2, 0, s.w, s.d);
  gb.cyl(0, 0.3, 0.75, 0.12, 0.12, 1.0, 6, "#3f3a37"); gb.box(0, 1.3, 0.75, 0.5, 0.9, 0.3, "#7b4fa0", { bevel: 0.1 });
  gb.pop();
  ctx.prop("windowBox", -2.4, s.d / 2 + 0.2, 0, { y: r.storeyH + 1.2 }); ctx.prop("windowBox", 2.4, s.d / 2 + 0.2, 0, { y: r.storeyH + 1.2 });
  ctx.prop("bike", s.w / 2 + 1.2, 1.0, Math.PI / 2 + 0.3);
  ctx.prop("bin", -s.w / 2 - 0.6, -1.5, 0);
}

export function brewery(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: "#3a2a1a", bevel: 0.12, grime: 0.2, quoins: "#8a6a3a" },
    roof: { type: "gable", color: s.roofColor, rise: s.roofH, tiles: 8, trim: "#3a2a1a" },
    door: { x: -3.5, w: 3.2, h: 3.8, color: "#3a2a1a", double: true, open: 0.6, step: false, frame: "#5a4a3a" },
    windows: { w: 1.4, h: 1.2, groundY: 4.2, spacing: 3.2, frame: "#3a2a1a", lit: 0.6 },
    chimneys: [{ x: 4.5, z: -2.5, w: 1.4, pots: 1 }],
    sign: { spec: { kind: "board", text: "Kowalski Brewery", icon: "keg", w: 7, h: 1.05, bg: "#2a1a0c", fg: "#f2d9a0", border: "#c9a24a" }, y: 5.6, x: 2.5 },
    lanterns: [-1.6],
    path: false,
    room: { depth: 5, floor: "#3a3028", inner: "#2c241c" },
  });
  for (let i = 0; i < 2; i++) { gb.cyl(-4.5 + i * 2.2, 0.3, s.d / 2 - 3.5, 0.8, 0.8, 2.2, 10, "#b87333"); gb.cyl(-4.5 + i * 2.2, 2.5, s.d / 2 - 3.5, 0.8, 0.3, 0.7, 10, "#a8632a"); }
  // silo with a conical cap and a ladder
  const sx = s.w / 2 + 2.6;
  gb.cyl(sx, -0.5, -1, 2.0, 2.0, s.h + 3.3, 12, (i) => (i % 2 ? "#c9c3b5" : "#bfb9ab"));
  for (let k = 0; k < 4; k++) gb.cyl(sx, 0.5 + k * 2.2, -1, 2.05, 2.05, 0.12, 12, "#8a8478");
  gb.cyl(sx, s.h + 2.8, -1, 2.2, 0.2, 1.8, 12, s.roofColor);
  ctx.prop("ladder", sx - 2.0, -1, Math.PI / 2, { y: 0 });
  gb.cyl(sx + 1.2, 0, 1.2, 0.35, 0.35, 0.9, 8, "#2f2f33"); gb.box(sx + 1.2, 0.6, 1.2, 0.1, 0.1, 2.2, "#2f2f33", { rx: 0.9, anchor: "center" }); // hopper pipe
  // loading dock at the right side with kegs & pallets
  gb.box(s.w / 2 + 0.2, 0, s.d / 2 - 2, 3.6, 1.0, 5, "#8d877c", { bevel: 0.05 });
  gb.box(s.w / 2 + 0.2, 1.0, s.d / 2 - 2, 3.4, 0.08, 4.8, "#6b5a40", {});
  ctx.prop("keg", s.w / 2 - 0.4, s.d / 2 - 1, 0.2, { y: 1.08 }); ctx.prop("keg", s.w / 2 + 0.4, s.d / 2 - 1.6, 0.9, { y: 1.08 }); ctx.prop("keg", s.w / 2 + 0.2, s.d / 2 - 3.2, 0, { y: 1.08 }); ctx.prop("keg", s.w / 2 + 1.1, s.d / 2 - 2.8, 0.5, { y: 1.08 });
  ctx.prop("pallet", 1.0, s.d / 2 + 2.0, 0.1); ctx.prop("keg", 0.7, s.d / 2 + 1.8, 0, { y: 0.1 }); ctx.prop("keg", 1.4, s.d / 2 + 2.3, 0.7, { y: 0.1 }); ctx.prop("keg", 0.9, s.d / 2 + 2.0, 0.3, { y: 0.9 });
  ctx.prop("barrel", -6.2, s.d / 2 + 1.6, 0.4); ctx.prop("barrel", -6.9, s.d / 2 + 2.6, 1.1); ctx.prop("barrel", -5.4, s.d / 2 + 2.6, 0);
  ctx.prop("pallet", 4.8, s.d / 2 + 3.5, 1.2); ctx.prop("sack", 4.8, s.d / 2 + 3.5, 0.3, { y: 0.1 }); ctx.prop("sack", 5.3, s.d / 2 + 3.8, 1.2, { y: 0.1 });
  // hop bines on a wire along the back
  for (let i = 0; i < 6; i++) { gb.cyl(-6 + i * 2.4, ctx.ground(-6 + i * 2.4, -s.d / 2 - 1.5), -s.d / 2 - 1.5, 0.04, 0.03, 3.4, 5, "#6b5a40"); gb.sphere(-6 + i * 2.4, ctx.ground(-6 + i * 2.4, -s.d / 2 - 1.5) + 2.2, -s.d / 2 - 1.5, 0.45, "#5aa646"); gb.sphere(-6 + i * 2.4 + 0.2, ctx.ground(-6 + i * 2.4, -s.d / 2 - 1.5) + 1.3, -s.d / 2 - 1.4, 0.38, "#4e8f3e"); }
  ctx.lanternLight(-3.5, 3.5, s.d / 2 + 1, "#ffb35a");
}

export function carpentry(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: "#5b3a29", bevel: 0.1, timber: "#5b3a29", grime: 0.15 },
    roof: { type: "corrugated", color: "#6e6a62", rise: s.roofH, trim: "#5b3a29" },
    door: { x: 2.5, w: 4.0, h: 4.0, color: "#6b4a30", double: true, open: 1.2, step: false, frame: "#5b3a29" },
    windows: { w: 1.4, h: 1.2, groundY: 3.2, sides: ["back", "left", "right"], frame: "#5b3a29", lit: 0.7 },
    sign: { spec: { kind: "board", text: "Brand Carpentry", icon: "hammer", w: 5.6, h: 0.9, bg: "#4a3018", fg: "#ffe8c0", border: "#d8b45a" }, y: 4.6, x: -2.5 },
    path: false,
    room: { depth: 6, floor: "#5a4a3a", inner: "#4a3a2a" },
  });
  // open bay: workbench, tools, shavings
  gb.push(2.5, 0, s.d / 2 - 3);
  gb.box(0, 0.8, 0, 3.0, 0.14, 1.0, "#a07a4a", {}); for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 1.3, 0, sz * 0.4, 0.12, 0.8, 0.12, "#6b4a30", {});
  gb.box(-0.6, 0.94, 0.1, 0.5, 0.12, 0.3, "#3a3a3a", {}); gb.box(0.7, 0.94, -0.1, 0.9, 0.06, 0.12, "#8a8f94", {});
  gb.box(0, 0.5, -2.4, 4.5, 0.8, 0.12, "#6b5a40", {}); for (let i = 0; i < 6; i++) gb.box(-2 + i * 0.8, 0.6, -2.3, 0.08, 0.5, 0.05, i % 2 ? "#3a3a3a" : "#8a8f94", {});
  gb.pop();
  // timber stacks & sawhorses outside
  const stack = (x: number, z: number, n: number, len: number, ry: number) => {
    gb.push(x, ctx.ground(x, z), z, ry);
    for (let k = 0; k < n; k++) for (let i = 0; i < 4 - (k % 2); i++) gb.box(-0.6 + i * 0.4 + (k % 2) * 0.2, 0.1 + k * 0.22, 0, 0.36, 0.2, len, k % 2 ? "#c9a070" : "#d9b080", { bevel: 0.02 });
    gb.box(0, 0, 0.9, 1.8, 0.1, 0.2, "#6b4a30", {}); gb.box(0, 0, -0.9, 1.8, 0.1, 0.2, "#6b4a30", {});
    gb.pop();
  };
  stack(-4.2, s.d / 2 + 2.6, 5, 3.6, 0.2); stack(-1.0, s.d / 2 + 3.4, 3, 3.0, -0.3); stack(s.w / 2 + 1.8, 1.0, 6, 4.0, Math.PI / 2);
  ctx.prop("sawhorse", 3.5, s.d / 2 + 3.2, 0.2); ctx.prop("sawhorse", 5.0, s.d / 2 + 3.4, 0.2);
  gb.box(4.25, ctx.ground(4.25, s.d / 2 + 3.3) + 0.82, s.d / 2 + 3.3, 2.4, 0.08, 0.5, "#d9b080", { ry: 0.2 });
  ctx.prop("logPile", -s.w / 2 - 1.4, -1.0, Math.PI / 2); ctx.prop("logPile", -s.w / 2 - 1.4, 0.4, Math.PI / 2);
  ctx.prop("barrel", 5.6, s.d / 2 + 0.8, 0); ctx.prop("crate", -5.4, s.d / 2 + 0.7, 0.4);
  ctx.prop("bikeRack", s.w / 2 + 1.5, s.d / 2 - 1.5, Math.PI / 2);
  // a sawdust-coloured patch at the door
  gb.box(2.5, 0.01, s.d / 2 + 1.8, 5, 0.04, 3, "#d8c8a0", { bevel: 0.02 });
}

export function garage(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: s.trim, bevel: 0.08, grime: 0.22 },
    roof: { type: "flat", color: s.roofColor, parapet: s.trim, parapetH: 0.8 },
    door: { x: -2.5, w: 4.4, h: 4.0, color: "#5a6b78", double: true, open: 1.35, step: false, frame: s.trim },
    windows: { w: 1.6, h: 1.1, groundY: 3.4, sides: ["back", "left"], frame: s.trim, lit: 0.6 },
    sign: { spec: { kind: "modern", text: "DEMIR GARAGE", icon: "wrench", w: 6, h: 1.0, bg: "#1f2226", fg: "#ffffff", border: "#e8a020" }, y: 4.4, x: 0 },
    path: false,
    room: { depth: 7, floor: "#4a4e52", inner: "#3a3e42" },
  });
  // small office window + door on the right of the bay
  face(gb, "front", 3.8, 0, s.w, s.d); windowEl(gb, 0, 2.2, 1.8, 1.3, { frame: s.trim, glow: "#9cc4ff" }); gb.pop();
  // roller-door track above the bay
  face(gb, "front", -2.5, 0, s.w, s.d); gb.box(0, 4.05, 0.1, 4.8, 0.35, 0.3, s.trim, {}); for (let i = 0; i < 5; i++) gb.box(0, 4.1 + i * 0.0, 0.26, 4.6, 0.04, 0.02, "#7a848a", {}); gb.pop();
  // open bay interior: engine on a hoist, workbench, tool board
  gb.push(-2.5, 0, s.d / 2 - 3.5);
  gb.box(0.6, 0.6, 0, 1.4, 0.9, 1.0, "#3a3a3a", { bevel: 0.06 }); gb.box(0.6, 0, 0, 1.0, 0.6, 0.8, "#6b6b6b", {}); // engine block on blocks
  gb.box(0.6, 1.5, 0, 0.3, 0.3, 0.3, "#8a8f94", {}); gb.box(0.6, 1.8, 0, 0.06, 2.4, 0.06, "#2f2f33", {}); gb.box(0.6, 4.2, 0, 3.0, 0.1, 0.1, "#2f2f33", {});
  gb.box(-1.8, 0.85, -1.5, 2.2, 0.1, 0.8, "#8a8f94", {}); gb.box(-1.8, 0, -1.5, 2.0, 0.85, 0.7, "#5a6b78", {});
  gb.box(0, 1.5, -3.4, 4, 2, 0.06, "#8a7a5a", {}); for (let i = 0; i < 7; i++) gb.box(-1.6 + i * 0.55, 1.8 + (i % 3) * 0.4, -3.32, 0.12, 0.6, 0.06, "#2f2f33", {});
  gb.pop();
  // vehicle on blocks outside: a small van body, tyres stacked, oil drums, a boat engine
  gb.push(4.2, 0, s.d / 2 + 3.4, 0.3);
  gb.box(0, 0.55, 0, 2.2, 1.2, 4.2, "#c8533a", { bevel: 0.12 }); gb.box(0, 1.6, -0.6, 2.0, 1.0, 2.4, "#c8533a", { bevel: 0.12 }); gb.box(0, 1.7, 0.7, 1.9, 0.75, 0.05, "#33465a", {});
  gb.box(0, 1.7, -1.85, 1.9, 0.75, 0.05, "#33465a", {});
  for (const sx of [-1, 1]) for (const sz of [-1.3, 1.4]) gb.box(sx * 0.95, 0, sz, 0.5, 0.55, 0.5, "#6b6b6b", {});
  for (const sx of [-1, 1]) gb.cyl(sx * 1.15, 0.7, 1.4, 0.36, 0.36, 0.24, 10, "#222", { rz: Math.PI / 2, anchor: "center" });
  gb.pop();
  ctx.prop("tyre", -5.6, s.d / 2 + 1.0, 0); ctx.prop("tyre", -5.6, s.d / 2 + 1.0, 0.4, { y: 0.24 }); ctx.prop("tyre", -5.6, s.d / 2 + 1.0, 0.8, { y: 0.48 }); ctx.prop("tyre", -4.8, s.d / 2 + 1.6, 0.2);
  ctx.prop("oilDrum", s.w / 2 + 0.8, -2, 0); ctx.prop("oilDrum", s.w / 2 + 1.5, -1.6, 0.4); ctx.prop("oilDrum", s.w / 2 + 1.0, -0.9, 0.9);
  ctx.prop("trafficCone", -0.5, s.d / 2 + 5.5, 0); ctx.prop("trafficCone", 1.4, s.d / 2 + 6.2, 0.4);
  ctx.prop("crate", 1.2, s.d / 2 + 1.0, 0.3);
  // outboard engine on a stand
  gb.push(-4.6, ctx.ground(-4.6, s.d / 2 + 4), s.d / 2 + 4, 0.5);
  gb.box(0, 0, 0, 1.0, 1.0, 0.5, "#8a8f94", {}); gb.box(0, 0.9, 0, 0.7, 0.9, 0.5, "#2c4160", { bevel: 0.08 }); gb.box(0, 0.2, 0.1, 0.12, 1.0, 0.12, "#3a3a3a", {});
  gb.pop();
  // oil stain
  gb.box(-2.5, 0.01, s.d / 2 + 2.2, 3.5, 0.03, 2.5, "#3f4246", { bevel: 0.02 });
  // fuel pump beside the office
  gb.push(5.5, 0, s.d / 2 + 1.2, 0);
  gb.box(0, 0, 0, 0.7, 1.9, 0.5, "#c93b3b", { bevel: 0.06 }); gb.box(0, 1.2, 0.26, 0.4, 0.3, 0.04, "#f4f4f4", {}); gb.box(0.4, 0.8, 0, 0.06, 0.8, 0.06, "#2f2f33", {});
  gb.pop();
}

export function inn(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  const r = stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 2,
    wall: { color: s.wall, trim: s.trim, bevel: 0.14, grime: 0.06 },
    roof: { type: "hip", color: s.roofColor, rise: s.roofH, trim: "#5b3a29" },
    door: { x: 0, w: 1.9, h: 3.1, color: "#5b2a30", double: true, glass: true, fanlight: true, frame: "#e8dcc8" },
    windows: { w: 1.3, h: 1.7, shutters: "#7a2d3c", flowers: false, spacing: 2.8, lit: 0.9 },
    chimneys: [{ x: -4.5, z: 0, w: 1.0, pots: 2 }, { x: 4.5, z: 0, w: 1.0, pots: 2 }],
    hanging: { spec: { kind: "hanging", text: "ROOMS", icon: "key", w: 1.2, h: 1.2, bg: "#5a1f2c", fg: "#ffe8c8" }, x: -s.w / 2 + 0.5 },
    lanterns: [-1.9, 1.9],
  });
  // name board mounted on the balcony front
  const bz = s.d / 2 + 1.62, by = r.storeyH + 0.62;
  gb.box(0, by - 0.55, bz - 0.05, 7.2, 1.1, 0.1, "#3a1a20", { bevel: 0.03 });
  ctx.sign({ kind: "board", text: "The Fontaine Inn", icon: "key", w: 7, h: 1.0, bg: "#5a1f2c", fg: "#ffe8c8", border: "#e0b050" }, 0, by, bz + 0.02, 0);
  // balcony across the front at the first floor with flower boxes and a hanging lantern
  face(gb, "front", 0, 0, s.w, s.d);
  balcony(gb, 0, r.storeyH + 0.1, s.w - 2.4, 1.6, "#e8dcc8", "#5b3a29");
  for (const x of [-4, -1.3, 1.3, 4]) flowerBox(gb, x, r.storeyH + 0.3, 1.5, 1.2, ["#e04a5a", "#f7f4ec", "#e86aa0"]);
  // lantern hanging from the balcony underside
  gb.box(0, r.storeyH - 0.1, 1.2, 0.04, 0.5, 0.04, "#2b2b2b", { anchor: "center" });
  gb.box(0, r.storeyH - 0.7, 1.2, 0.3, 0.42, 0.3, "#fff3c8", { glow: "#ffc46a", bevel: 0.03 });
  gb.box(0, r.storeyH - 0.32, 1.2, 0.38, 0.06, 0.38, "#2b2b2b", {});
  // porch canopy over the door
  gb.box(0, 3.35, 0.9, 3.6, 0.12, 1.8, "#5b3a29", { bevel: 0.03 });
  gb.pop();
  ctx.bench(-4.6, s.d / 2 + 1.6, 0); ctx.bench(4.6, s.d / 2 + 1.6, 0);
  ctx.prop("planter", -2.8, s.d / 2 + 1.0, 0); ctx.prop("planter", 2.8, s.d / 2 + 1.0, 0);
  // luggage trolley & a bike by the side
  ctx.prop("crate", s.w / 2 + 0.8, 2.0, 0.3); ctx.prop("bike", -s.w / 2 - 1.0, 1.0, -Math.PI / 2 + 0.2);
  ctx.prop("bin", -s.w / 2 - 0.8, -2.5, 0);
}

export function chaiStall(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  // a painted tea cart: two big wheels, counter, canopy, kettle, glasses, marigold strings
  const w = s.w, d = s.d;
  gb.box(0, 0.55, 0, w, 1.0, d, s.wall, { bevel: 0.08 });
  gb.box(0, 1.55, 0, w + 0.3, 0.12, d + 0.3, "#f7e6c8", { bevel: 0.04 });
  gb.box(0, 0.75, d / 2 + 0.02, w - 0.4, 0.5, 0.05, "#f2c318", {});
  for (const sx of [-1, 1]) { gb.cyl(sx * (w / 2 + 0.12), 0.5, -0.3, 0.5, 0.5, 0.12, 10, "#3a2a1a", { rz: Math.PI / 2, anchor: "center" }); for (let k = 0; k < 4; k++) gb.box(sx * (w / 2 + 0.12), 0.5, -0.3, 0.05, 0.9, 0.05, "#c9a24a", { rz: Math.PI / 2, rx: (k * Math.PI) / 4, anchor: "center" }); }
  gb.box(0, 0.2, 1.8, 0.14, 0.14, 1.4, "#3a2a1a", { rx: 0.2, anchor: "center" }); gb.box(0, 0, 2.5, 0.12, 0.5, 0.12, "#3a2a1a", {});
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.cyl(sx * (w / 2 - 0.15), 1.6, sz * (d / 2 - 0.15), 0.06, 0.05, s.h - 1.6 + 0.4, 6, "#8a5a3a");
  // scalloped canopy
  gb.push(0, s.h + 0.35, 0, 0, 0.12);
  const n = 7;
  for (let i = 0; i < n; i++) gb.box(-w / 2 - 0.4 + ((w + 0.8) * (i + 0.5)) / n, 0, 0, (w + 0.8) / n + 0.01, 0.1, d + 1.2, i % 2 ? "#f2c318" : "#d05a2a", {});
  for (let i = 0; i < n; i++) for (const sz of [-1, 1]) gb.box(-w / 2 - 0.4 + ((w + 0.8) * (i + 0.5)) / n, -0.28, sz * (d / 2 + 0.55), (w + 0.8) / n + 0.01, 0.3, 0.06, i % 2 ? "#f2c318" : "#d05a2a", {});
  gb.pop();
  gb.box(0, s.h + 0.45, 0, 0.3, 0.5, 0.3, "#d05a2a", {}); gb.sphere(0, s.h + 1.05, 0, 0.16, "#f2c318");
  // kettle on a burner, cups, glass stack, tin of biscuits
  gb.cyl(-1.0, 1.61, -0.2, 0.32, 0.32, 0.12, 8, "#3a3a3a"); gb.sphere(-1.0, 1.95, -0.2, 0.32, "#c9c3b5"); gb.cyl(-1.0, 2.2, -0.2, 0.1, 0.06, 0.2, 6, "#c9c3b5"); gb.box(-0.65, 2.0, -0.2, 0.3, 0.05, 0.05, "#3a3a3a", { rz: -0.4, anchor: "center" });
  for (let i = 0; i < 5; i++) gb.cyl(0.2 + (i % 3) * 0.28, 1.61 + Math.floor(i / 3) * 0.2, -0.5 + Math.floor(i / 3) * 0.1, 0.1, 0.09, 0.2, 6, "#e8e2d4");
  for (let i = 0; i < 4; i++) gb.cyl(1.2, 1.61 + i * 0.16, 0.2, 0.09, 0.09, 0.16, 6, "#dbe9ff");
  gb.box(0.5, 1.61, 0.4, 0.5, 0.35, 0.4, "#c93b3b", { bevel: 0.04 });
  gb.cyl(-0.2, 1.61, 0.5, 0.2, 0.2, 0.3, 8, "#b87333");
  // marigold garlands
  for (let i = 0; i <= 10; i++) { const t = i / 10; gb.sphere(-w / 2 - 0.3 + (w + 0.6) * t, s.h + 0.05 - Math.sin(t * Math.PI) * 0.35, d / 2 + 0.7, 0.09, i % 2 ? "#f2a318" : "#f26a1b"); }
  // small chalk menu and a stool for Meena, a couple of crates for customers
  ctx.sign({ kind: "chalk", text: "CHAI", sub: "masala 2c|ginger 2c|biscuits", w: 0.8, h: 1.0 }, w / 2 + 0.7, 0.75, d / 2 + 0.2, -0.4);
  gb.push(w / 2 + 0.7, 0.05, d / 2 + 0.2, -0.4); gb.box(0, 0, -0.08, 0.9, 1.3, 0.06, "#6b4a30", {}); for (const sx of [-1, 1]) gb.box(sx * 0.4, 0, -0.3, 0.05, 1.2, 0.05, "#6b4a30", { rx: -0.3 }); gb.pop();
  ctx.prop("stool", -0.5, -d / 2 - 0.9, 0);
  ctx.prop("crate", -2.9, d / 2 + 1.4, 0.4); ctx.prop("crate", 2.6, d / 2 + 2.2, -0.3);
  ctx.prop("bin", 3.2, -1.0, 0);
}

export function bank(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: s.trim, bevel: 0.1, quoins: "#a39c90", stone: true, seed: "bank" },
    roof: { type: "flat", color: s.roofColor, parapet: "#a8a39a", parapetH: 1.0 },
    door: { x: 0, w: 2.0, h: 3.4, color: "#2a2a2a", double: true, open: 0.8, frame: "#d3a74a", step: false },
    windows: { w: 1.2, h: 2.2, groundY: 3.2, spacing: 3.0, frame: "#3a3a3a", lit: 0.35, pane: "#2a3a48" },
    sign: { spec: { kind: "board", text: "Ashdown & Co. Bank", icon: "crest", w: 7, h: 1.0, bg: "#1f2a3a", fg: "#e8d29a", border: "#c9a24a" }, y: 5.6, lamp: true },
    lanterns: [-2.2, 2.2],
    path: false,
    room: { depth: 5.5, floor: "#3a3530", inner: "#4a453e" },
  });
  // portico: 4 columns, entablature, pediment; broad steps with railings
  const cz = s.d / 2 + 2.2;
  for (const x of [-4.2, -1.5, 1.5, 4.2]) column(gb, x, cz, s.h - 0.2, 0.4, "#e6e1d3");
  gb.push(0, 0, cz);
  pediment(gb, 10.5, s.h - 0.2, 3.4, 1.4, "#e6e1d3", "#a8a39a");
  gb.pop();
  gb.box(0, s.h - 0.2, cz - 0.8, 10.5, 0.4, 3.4, "#dcd7c8", {});
  // clock/crest medallion in the pediment
  gb.cyl(0, s.h + 0.7, s.d / 2 + 3.9, 0.55, 0.55, 0.1, 10, "#c9a24a", { rx: Math.PI / 2, anchor: "center" });
  face(gb, "front", 0, 0, s.w, s.d);
  gb.box(0, 0, 0.0, s.w + 0.6, 0.9, 5.2, "#a39c90", { bevel: 0.06 }); // raised platform
  gb.pop();
  gb.push(0, 0.9, s.d / 2 + 3.0);
  steps(gb, 0, 7, 4, "#a39c90");
  for (const sx of [-1, 1]) { gb.box(sx * 3.8, 0, 0.6, 0.08, 1.0, 0.08, "#2f2f33", {}); gb.box(sx * 3.8, -0.88, 2.2, 0.08, 1.0, 0.08, "#2f2f33", {}); gb.box(sx * 3.8, 0.55, 1.4, 0.08, 0.08, 2.1, "#2f2f33", { rx: 0.47, anchor: "center" }); }
  gb.pop();
  // vault door visible inside the open door
  gb.push(0, 0.9, s.d / 2 - 5.1);
  gb.cyl(0, 0.3, 0, 1.3, 1.3, 0.3, 12, "#7a7f84", { rx: Math.PI / 2, anchor: "center" });
  gb.cyl(0, 0.3, 0.3, 1.1, 1.1, 0.1, 12, "#5a5f64", { rx: Math.PI / 2, anchor: "center" });
  for (let i = 0; i < 4; i++) gb.box(0, 1.6, 0.4, 0.08, 0.9, 0.08, "#c9c3b5", { rz: (i * Math.PI) / 4, anchor: "center" });
  gb.cyl(0, 1.6, 0.4, 0.14, 0.14, 0.1, 8, "#c9a24a", { rx: Math.PI / 2, anchor: "center" });
  gb.pop();
  gb.box(0, 0.9, s.d / 2 - 2.2, 3.4, 0.9, 0.6, "#5b3a29", { bevel: 0.04 }); // counter
  ctx.prop("planter", -s.w / 2 - 1.3, s.d / 2 + 1.5, 0); ctx.prop("planter", s.w / 2 + 1.3, s.d / 2 + 1.5, 0);
  ctx.prop("bollardStone", -5, s.d / 2 + 6.5, 0); ctx.prop("bollardStone", 5, s.d / 2 + 6.5, 0);
}

export function realty(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: s.trim, bevel: 0.06, grime: 0 },
    roof: { type: "flat", color: s.roofColor, parapet: "#2a2d31", parapetH: 0.5 },
    door: { x: 2.4, w: 1.4, h: 3.2, color: "#1f2226", glass: true, frame: "#c8b48a", step: false },
    windows: { w: 1.4, h: 2.4, groundY: 2.5, sides: ["back", "left", "right"], frame: "#c8b48a", lit: 0.6, pane: "#243040" },
    sign: { spec: { kind: "modern", text: "VALE PROPERTY", icon: "house", w: 5.5, h: 0.8, bg: "#1f2226", fg: "#f4efe2", border: "#c8b48a" }, y: 4.3 },
    lanterns: [],
    drainpipes: false,
  });
  // slick glass frontage
  face(gb, "front", -1.4, 0, s.w, s.d);
  windowEl(gb, 0, 1.75, 4.2, 2.9, { frame: "#c8b48a", glow: "#9cc4ff", mullions: false, sill: false, pane: "#243040" });
  gb.box(0, 0.2, 0.13, 0.06, 2.9, 0.04, "#c8b48a", {}); gb.box(0, 1.6, 0.13, 4.2, 0.06, 0.04, "#c8b48a", {});
  // property cards in the window
  for (let i = 0; i < 6; i++) gb.box(-1.6 + (i % 3) * 1.2, 1.4 + Math.floor(i / 3) * 0.9, 0.16, 0.7, 0.5, 0.02, "#f4efe2", {});
  gb.pop();
  // "TO LET" board on a post by the road, and a neat gravel strip with clipped shrubs
  ctx.sign({ kind: "tolet", text: "VALE PROPERTY", sub: "TO LET", w: 1.2, h: 1.0 }, -3.8, 2.2, s.d / 2 + 2.5, 0.3, true);
  gb.push(-3.8, ctx.ground(-3.8, s.d / 2 + 2.5), s.d / 2 + 2.5, 0.3); gb.box(0, 0, -0.05, 0.1, 2.7, 0.1, "#3a3a3a", {}); gb.pop();
  gb.box(0, 0.01, s.d / 2 + 1.0, s.w, 0.06, 2.0, "#b8b0a0", {});
  ctx.prop("shrub", -3.2, s.d / 2 + 0.8, 0, { s: 0.7 }); ctx.prop("shrub", 4.2, s.d / 2 + 0.8, 1, { s: 0.7 });
  ctx.prop("bin", s.w / 2 + 0.6, 0, 0);
  // parked bike for the agent
  ctx.prop("bike", s.w / 2 + 1.3, -1.5, Math.PI / 2);
}
