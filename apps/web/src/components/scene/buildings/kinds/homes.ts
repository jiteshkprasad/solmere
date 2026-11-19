/**
 * Homes: cottage (thatch), timber-frame, stone, painted clapboard, tall narrow harbour house,
 * villa, farmhouse, cabin and the shabby rental rooms — with gardens, sheds, laundry, bins, bikes.
 */
import type { Ctx } from "../layout";
import { stdBuilding, shed, laundry, vegPatch, flowerBed, externalStair, type StdOpts } from "./common";
import { face, doorEl, porch, column, hedgeRun, picketRun, stoneWallRun, shade, h01, path, lantern } from "../kit";

export function house(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  const id = p.loc.id, arch = s.arch ?? "clapboard";
  const r = (i: number) => h01(id, 40 + i);
  const storeys = s.storeys;
  const base: StdOpts = {
    w: s.w, d: s.d, h: s.h, storeys,
    wall: { color: s.wall, trim: s.trim, bevel: 0.12, grime: 0.12 },
    roof: { type: "gable", color: s.roofColor, rise: s.roofH, tiles: 6 },
    door: { x: r(1) > 0.5 ? -s.w * 0.22 : s.w * 0.22, w: 1.4, h: 2.9, color: shade(s.trim, 0.6) },
    windows: { w: 1.2, h: 1.4, lit: 0.8, shutters: r(2) > 0.55 ? shade(s.roofColor, 1.1) : undefined, flowers: r(3) > 0.4 },
    chimneys: s.chimney ? [{ x: r(4) > 0.5 ? s.w * 0.3 : -s.w * 0.3, z: r(5) > 0.5 ? -1 : 0.5, w: 0.8, pots: 1 + Math.round(r(6)) }] : [],
    lanterns: [],
  };
  switch (arch) {
    case "cottage":
      base.roof = { type: "thatch", color: s.roofColor, rise: s.roofH + 0.6 };
      base.wall = { color: s.wall, trim: s.trim, bevel: 0.2, grime: 0.15, stone: r(7) > 0.5, seed: id };
      base.windows = { w: 1.0, h: 1.1, lit: 0.85, flowers: true, frame: "#f4efe2" };
      base.door = { ...base.door, h: 2.7, w: 1.3, color: shade(s.trim, 0.9) };
      base.dormers = s.w > 7.5 ? 1 : 0;
      break;
    case "timber":
      base.wall = { color: s.wall, trim: s.trim, bevel: 0.12, timber: s.trim, grime: 0.14 };
      base.roof = { type: r(8) > 0.5 ? "gable" : "gableZ", color: s.roofColor, rise: s.roofH + 0.4, tiles: 7 };
      base.windows = { w: 1.1, h: 1.3, lit: 0.8, flowers: true, frame: "#f4efe2" };
      if (base.roof.type === "gable") base.dormers = 1;
      break;
    case "stone":
      base.wall = { color: s.wall, trim: s.trim, bevel: 0.1, stone: true, quoins: shade(s.wall, 0.85), seed: id, grime: 0.1 };
      base.roof = { type: s.roof === "hip" ? "hip" : "gable", color: s.roofColor, rise: s.roofH, tiles: 6 };
      base.windows = { w: 1.2, h: 1.5, lit: 0.75, frame: "#f4efe2", shutters: r(2) > 0.5 ? "#3f5a68" : undefined };
      base.door = { ...base.door, fanlight: true };
      break;
    case "clapboard":
      base.wall = { color: s.wall, trim: s.trim, bevel: 0.1, clapboard: true, grime: 0.08 };
      base.roof = { type: r(8) > 0.6 ? "hip" : "gable", color: s.roofColor, rise: s.roofH, tiles: 6 };
      base.windows = { w: 1.2, h: 1.5, lit: 0.8, frame: "#f4efe2", shutters: r(2) > 0.35 ? shade(s.roofColor, 1.05) : undefined, flowers: r(3) > 0.5 };
      break;
    case "harbour":
      // tall, narrow, gable to the street, hoist beam under the gable
      base.roof = { type: "gableZ", color: s.roofColor, rise: s.roofH + 0.8, tiles: 6 };
      base.wall = { color: s.wall, trim: s.trim, bevel: 0.1, grime: 0.16, clapboard: true };
      base.windows = { w: 1.2, h: 1.6, lit: 0.8, frame: "#f4efe2", spacing: 2.4 };
      base.door = { x: -s.w * 0.22, w: 1.3, h: 2.9, color: shade(s.wall, 0.5), frame: "#f4efe2" };
      break;
    case "villa":
      base.wall = { color: s.wall, trim: s.trim, bevel: 0.12, quoins: shade(s.wall, 0.88), grime: 0.02 };
      base.roof = { type: "hip", color: s.roofColor, rise: s.roofH, trim: "#f7f4ec" };
      base.windows = { w: 1.4, h: 2.0, lit: 0.6, frame: "#f7f4ec", spacing: 3.0, shutters: "#2f3a45" };
      base.door = { x: 0, w: 1.8, h: 3.2, color: "#1f2226", double: true, fanlight: true, frame: "#f7f4ec", step: false };
      base.lanterns = [-1.8, 1.8];
      break;
    case "farmhouse":
      base.wall = { color: s.wall, trim: s.trim, bevel: 0.12, clapboard: id === "farmhouse_lindqvist", stone: id !== "farmhouse_lindqvist", seed: id, grime: 0.12 };
      base.roof = { type: s.roof === "hip" ? "hip" : "gable", color: s.roofColor, rise: s.roofH + 0.4, tiles: 7 };
      base.windows = { w: 1.3, h: 1.5, lit: 0.8, frame: "#f4efe2", shutters: s.trim, flowers: true };
      base.door = { x: 0, w: 1.5, h: 3.0, color: shade(s.trim, 0.8), frame: "#f4efe2", step: false };
      if (storeys > 1) base.dormers = 2;
      break;
    case "cabin":
      base.wall = { color: s.wall, trim: s.trim, bevel: 0.08, timber: shade(s.wall, 0.6), grime: 0.25 };
      base.roof = { type: "shed", color: s.roofColor, rise: s.roofH };
      base.windows = { w: 1.0, h: 1.0, lit: 0.6, frame: shade(s.wall, 0.6), sides: ["front", "left"] };
      base.door = { x: s.w * 0.2, w: 1.2, h: 2.6, color: shade(s.wall, 0.5), frame: shade(s.wall, 0.6) };
      base.drainpipes = false;
      break;
    case "rental":
      rental(ctx);
      return;
  }
  const res = stdBuilding(ctx, base);

  // porches for the farmhouse & villa
  if (arch === "farmhouse") { face(gb, "front", 0, 0, s.w, s.d); porch(gb, s.w * 0.7, 2.4, Math.min(res.storeyH + 0.2, s.h - 0.4), "#f4efe2", shade(s.roofColor, 1.05), s.trim, { posts: 4, rail: true, deck: true }); gb.pop(); }
  if (arch === "villa") {
    for (const x of [-2.6, 2.6]) column(gb, x, s.d / 2 + 1.6, res.storeyH - 0.2, 0.32, "#f7f4ec");
    gb.box(0, res.storeyH - 0.2, s.d / 2 + 0.9, 7, 0.45, 2.2, "#f7f4ec", { bevel: 0.04 });
    gb.box(0, res.storeyH + 0.25, s.d / 2 + 0.9, 6.6, 0.12, 1.9, "#e0dccf", {});
    for (let i = 0; i <= 12; i++) gb.box(-3.2 + (6.4 * i) / 12, res.storeyH + 0.35, s.d / 2 + 1.85, 0.07, 0.8, 0.07, "#f7f4ec", {});
    gb.box(0, res.storeyH + 1.15, s.d / 2 + 1.85, 6.6, 0.08, 0.1, "#f7f4ec", {});
    gb.box(0, 0.0, s.d / 2 + 1.0, 8, 0.3, 2.4, "#c9c3b5", { bevel: 0.04 });
    gb.box(0, 0.01, s.d / 2 + 4.0, 3.0, 0.06, 3.6, "#b8b0a0", {});
  }
  if (arch === "harbour") {
    // hoist beam + pulley under the gable, a boat hook, nets drying, lobster pots
    gb.box(0, s.h + s.roofH * 0.55, s.d / 2 + 0.6, 0.18, 0.18, 1.6, "#4a2e1c", {});
    gb.cyl(0, s.h + s.roofH * 0.55 - 0.3, s.d / 2 + 1.3, 0.12, 0.12, 0.1, 8, "#2a2a2a", { rz: Math.PI / 2, anchor: "center" });
    gb.box(0, s.h * 0.55, s.d / 2 + 1.3, 0.03, s.h * 0.45 + s.roofH * 0.55 - 0.3, 0.03, "#c9b48a", {});
    ctx.prop("lobsterPot", s.w / 2 + 1.0, 1.0, 0.3); ctx.prop("lobsterPot", s.w / 2 + 1.0, 1.0, 0.1, { y: 0.52 });
    ctx.prop("ropeCoil", -s.w / 2 - 0.8, 1.5, 0);
    ctx.prop("netFrame", -s.w / 2 - 2.4, -1.0, Math.PI / 2 + 0.2);
    face(gb, "front", 0, 0, s.w, s.d); lantern(gb, s.w * 0.22, 3.3); gb.pop();
  }

  // gardens: boundary (hedge / picket / stone wall), path, flower beds, veg patch, shed, laundry, bins, bike
  garden(ctx, arch, r);
}

/** rental rooms owned by Marcus Vale: cheap render, flat or shed roofs, external stairs, bins, no garden */
function rental(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  const id = p.loc.id;
  const r = (i: number) => h01(id, 60 + i);
  const two = s.storeys > 1;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: s.storeys,
    wall: { color: s.wall, trim: s.trim, bevel: 0.05, grime: 0.32, plinth: "#7a746a" },
    roof: two ? { type: "flat", color: s.roofColor, parapet: shade(s.wall, 0.8), parapetH: 0.45 } : { type: "shed", color: s.roofColor, rise: s.roofH },
    door: { x: -s.w * 0.25, w: 1.2, h: 2.6, color: "#4a4a4a", frame: shade(s.wall, 0.7), step: false },
    windows: { w: 1.0, h: 1.1, lit: 0.55, frame: shade(s.wall, 0.7), spacing: 2.3, pane: "#2c3a44" },
    drainpipes: true,
    path: false,
  });
  // peeling render: a few darker patches, a boarded window, a crooked gutter
  for (let i = 0; i < 5; i++) {
    const side = i % 2 ? "front" : "right";
    face(gb, side as "front" | "right", (r(i) - 0.5) * (s.w - 2), 0, s.w, s.d);
    gb.box(0, 0.2 + r(i + 5) * (s.h - 1.2), 0.03, 0.5 + r(i + 10) * 0.9, 0.3 + r(i + 15) * 0.6, 0.02, shade(s.wall, 0.78), {});
    gb.pop();
  }
  if (two) {
    // first-floor door with a mean landing and an outside stair
    face(gb, "front", s.w * 0.25, s.h / 2, s.w, s.d);
    doorEl(gb, 0, 1.1, 2.4, { color: "#4a4a4a", frame: shade(s.wall, 0.7), step: false });
    gb.box(0, -0.12, 0.7, 2.0, 0.12, 1.4, "#6b6b6b", {});
    gb.box(1.0, 0, 0.7, 0.05, 0.9, 1.4, "#4a4a4a", {}); gb.box(0, 0.9, 1.38, 2.0, 0.05, 0.05, "#4a4a4a", {});
    gb.pop();
    externalStair(gb, s.w * 0.25 - 1.3, s.d / 2 + 0.75, Math.PI / 2, s.h / 2, "#6b6b6b");
    ctx.door(s.w * 0.25, s.h / 2, s.d / 2, 0, 1.1, 2.4);
    gb.box(s.w * 0.3, s.h + 0.3, -1, 0.5, 0.9, 0.5, "#6b6b6b", {}); // vent stack
  }
  // rubbish: bins, a broken crate, a tyre, a bike with no front wheel
  ctx.prop("bin", s.w / 2 + 0.5, s.d / 2 - 0.5, 0.2); ctx.prop("bin", s.w / 2 + 1.1, s.d / 2 - 0.9, -0.3);
  ctx.prop("crate", -s.w / 2 - 0.8, -1.0, 0.7, { s: 0.7 });
  if (r(20) > 0.5) ctx.prop("tyre", s.w / 2 + 0.9, -1.4, 0);
  if (r(21) > 0.4) ctx.prop("bike", -s.w / 2 - 0.8, s.d / 2 - 1.2, -Math.PI / 2 + 0.3);
  // a "ROOMS — VALE PROPERTY" board on some blocks
  if (r(22) > 0.45) {
    face(gb, "front", s.w * 0.1, 0, s.w, s.d);
    gb.box(0, s.h - 1.2, 0.04, 1.6, 0.5, 0.08, "#2a2d31", {});
    gb.pop();
    ctx.sign({ kind: "tolet", text: "VALE PROPERTY", sub: "ROOMS", w: 1.5, h: 0.45 }, s.w * 0.1, s.h - 0.95, s.d / 2 + 0.09, 0);
  }
  // scrappy laundry and a puddle-coloured yard patch
  laundry(ctx, s.w / 2 + 2.4, -0.5, Math.PI / 2, 3);
  gb.box(0, 0.005, s.d / 2 + 1.4, s.w + 1, 0.04, 2.4, "#9a9488", {});
  ctx.prop("shrub", -s.w / 2 - 0.6, s.d / 2 + 0.8, 0, { s: 0.55 });
}

function garden(ctx: Ctx, arch: string, r: (i: number) => number) {
  const { gb, p } = ctx; const s = p.spec;
  const hw = s.w / 2 + 3.2, hd = s.d / 2 + 3.6;
  const gateX = (p.spec.arch === "villa" ? 0 : (r(1) > 0.5 ? -s.w * 0.22 : s.w * 0.22));
  // boundary along the front & sides, with a gap at the gate
  const kind = arch === "stone" || arch === "villa" ? "wall" : arch === "cottage" || arch === "farmhouse" ? "picket" : r(9) > 0.5 ? "hedge" : "picket";
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    if (kind === "wall") stoneWallRun(gb, x0, z0, x1, z1, "#8d877c", 0.8);
    else if (kind === "picket") picketRun(gb, x0, z0, x1, z1, r(10) > 0.5 ? "#e8e0cc" : "#b8a37c", 0.95);
    else hedgeRun(gb, x0, z0, x1, z1, r(11) > 0.5 ? "#4e8f3e" : "#3f7d3a", 1.0, 0.8);
  };
  const gy = ctx.ground(0, hd);
  gb.push(0, gy, 0);
  run(-hw, hd, gateX - 0.9, hd); run(gateX + 0.9, hd, hw, hd);
  run(-hw, hd, -hw, -s.d / 2 - 1); run(hw, hd, hw, -s.d / 2 - 1);
  // gate
  gb.box(gateX - 0.95, 0, hd, 0.16, 1.2, 0.16, "#6b5a40", {}); gb.box(gateX + 0.95, 0, hd, 0.16, 1.2, 0.16, "#6b5a40", {});
  gb.push(gateX - 0.9, 0, hd, 0.5);
  gb.box(0.8, 0.2, 0, 1.6, 0.08, 0.05, "#8b5a3c", {}); gb.box(0.8, 0.8, 0, 1.6, 0.08, 0.05, "#8b5a3c", {}); for (let i = 0; i < 5; i++) gb.box(0.15 + i * 0.35, 0.1, 0, 0.08, 0.9, 0.04, "#8b5a3c", {});
  gb.pop();
  // path from the gate to the door (the door path covers the first 2.6 m)
  path(gb, gateX, s.d / 2 + 2.6, hd - s.d / 2 - 2.4, 1.3);
  gb.pop();
  // flower beds beside the path, a veg patch at the back, a shed, laundry, bins, bike
  flowerBed(gb, gateX + (gateX > 0 ? 2.2 : -2.2), s.d / 2 + 1.6, 2.4, 1.2, p.loc.id + "fb");
  if (r(12) > 0.3) vegPatch(ctx, -s.w / 2 - 0.4 + (r(13) > 0.5 ? s.w + 0.8 : 0) - 1.2 + (r(13) > 0.5 ? 2.4 : 0), -s.d / 2 - 1.8, 3.2, 2.2);
  if (r(14) > 0.35) shed(gb, hw - 1.6, -s.d / 2 - 0.8, r(15) > 0.5 ? 0 : Math.PI / 2, 2.4, 2.0, 2.2, r(16) > 0.5 ? "#6b5a40" : "#4f6b4a", r(17) > 0.5 ? "#4f5a68" : "#6e4a30");
  if (r(18) > 0.3) laundry(ctx, -hw + 2.4, -s.d / 2 - 1.6, Math.PI / 2 + 0.2, 3.6);
  ctx.prop("bin", -hw + 0.6, s.d / 2 + 0.6, 0.3);
  if (r(19) > 0.5) ctx.prop("bike", hw - 0.9, s.d / 2 + 1.2, Math.PI / 2 + 0.3);
  if (r(20) > 0.6) ctx.prop("logPile", hw - 1.2, s.d / 2 - 2.6, Math.PI / 2, { s: 0.8 });
  if (r(21) > 0.5) ctx.prop("shrub", -gateX + (gateX > 0 ? -2.2 : 2.2), s.d / 2 + 2.6, 0, { s: 0.8 });
  ctx.prop("shrub", hw - 0.8, -s.d / 2 + 1.5, 1, { s: 0.7 });
  if (r(22) > 0.55) ctx.tree(-hw + 1.4, hd - 1.4, "broadleaf", 0.75, "#6fb549");
  ctx.prop("flowerClump", gateX + (gateX > 0 ? -1.4 : 1.4), s.d / 2 + 0.7, 0, { s: 0.7 });
}

