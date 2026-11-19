/**
 * The waterfront: docks (quay, pier, crane, fuel pump, nets, pots, moored boats), lighthouse
 * (banded tower, gallery, keeper's shed), the old net-loft studio on stilts, and the beach.
 */
import type { Ctx } from "../layout";
import { GB, roofGable, gableEnds, roofShed, windowEl, doorEl, face, shade, picketRun } from "../kit";
import { stdBuilding } from "./common";

export function docks(ctx: Ctx) {
  const { gb, p } = ctx;
  // The docks location is at (20,275) with yaw π/2, so local -z points WEST into the harbour cove
  // (the terrain's quay zone). Heights are absolute (relative to the water), so shift by -gy.
  const gy = p.y;
  const deck = 0.75;
  gb.push(0, -gy, 0);
  // quay: a chunky stone wall with a capping, cobbled top
  gb.box(0, -2.2, -1, 22, 3.3, 12, "#7d776c", { bevel: 0.15 });
  gb.box(0, 1.05, -1, 22.4, 0.22, 12.4, "#9a948a", { bevel: 0.06 });
  for (let i = 0; i < 40; i++) { const x = -10 + (i % 10) * 2.2, z = -6 + Math.floor(i / 10) * 2.6; gb.box(x, 1.27, z, 1.9, 0.05, 2.2, i % 2 ? "#8f8a80" : "#8a857b", {}); }
  // quay edge fenders (old tyres) and iron ladder
  for (const x of [-8, -3, 2, 7]) gb.cyl(x, 0.3, -7.0, 0.42, 0.42, 0.25, 10, "#1f1f1f", { rx: Math.PI / 2, anchor: "center" });
  gb.box(9.5, -1.5, -7.1, 0.5, 3.0, 0.08, "#3a3a3a", {}); for (let k = 0; k < 6; k++) gb.box(9.5, -1.4 + k * 0.5, -7.1, 0.5, 0.05, 0.05, "#3a3a3a", {});
  // pier: pilings + plank deck + rails, running north
  const pz0 = -8, plen = 46;
  for (let i = 0; i < 10; i++) for (const sx of [-2.3, 2.3]) gb.cyl(2 + sx, -4.5, pz0 - 2 - i * 5, 0.28, 0.25, 5.2 + 0.2, 7, "#4a2e1c");
  for (const sx of [-2.3, 2.3]) gb.box(2 + sx, deck - 0.35, pz0 - plen / 2, 0.3, 0.3, plen, "#5b3a29", {});
  for (let i = 0; i < Math.floor(plen / 0.42); i++) { const z = pz0 - 0.2 - i * 0.42; gb.box(2 + (i % 3) * 0.04, deck - 0.1, z, 4.6, 0.12, 0.34, i % 3 === 0 ? "#8b5a3c" : i % 3 === 1 ? "#946446" : "#805236", {}); }
  gb.box(2, deck - 0.1, pz0 - plen - 0.3, 5.6, 0.12, 0.8, "#8b5a3c", {});
  // bollards & cleats on the pier
  for (let i = 0; i < 6; i++) { ctx.prop("bollardIron", 2 + (i % 2 ? 2.0 : -2.0), pz0 - 4 - i * 7, 0, { y: deck - gy }); }
  for (let i = 0; i < 5; i++) ctx.prop("cleat", 2 + (i % 2 ? -2.1 : 2.1), pz0 - 7 - i * 8, Math.PI / 2, { y: deck - gy });
  // lamp on the pier end and one on the quay
  gb.cyl(4.0, deck, pz0 - plen + 0.5, 0.08, 0.06, 3.6, 6, "#2f2f33"); gb.box(4.0, deck + 3.5, pz0 - plen + 0.5, 0.36, 0.5, 0.36, "#fff0c0", { glow: "#ffd27a", bevel: 0.03 }); gb.box(4.0, deck + 4.0, pz0 - plen + 0.5, 0.46, 0.08, 0.46, "#2f2f33", {});
  // hand crane on the quay: mast, jib, winch, rope, hook, crate on the hook
  gb.push(-6, 1.27, -4.5, 0.6);
  gb.box(0, 0, 0, 1.6, 0.5, 1.6, "#5b3a29", { bevel: 0.05 });
  gb.cyl(0, 0.5, 0, 0.26, 0.22, 6.5, 8, "#6b4a30");
  gb.box(0, 5.9, 2.4, 0.3, 0.3, 5.2, "#6b4a30", { rx: -0.35, anchor: "center" });
  gb.box(0, 4.3, 1.5, 0.2, 0.2, 3.2, "#6b4a30", { rx: 0.6, anchor: "center" });
  gb.cyl(0.6, 1.4, 0, 0.3, 0.3, 0.6, 8, "#2f2f33", { rz: Math.PI / 2, anchor: "center" }); gb.box(0.95, 1.4, 0, 0.06, 0.6, 0.06, "#2f2f33", { anchor: "center" });
  gb.box(0, 4.6, 4.7, 0.03, 4.4, 0.03, "#c9b48a", { anchor: "center" });
  gb.box(0, 2.3, 4.7, 0.2, 0.3, 0.1, "#2f2f33", {});
  gb.box(0, 1.4, 4.7, 0.9, 0.8, 0.9, "#b08a5a", { bevel: 0.03 });
  gb.pop();
  // fuel pump + hose, drums
  gb.push(6.5, 1.27, -3.5, 0);
  gb.box(0, 0, 0, 0.8, 1.9, 0.6, "#c93b3b", { bevel: 0.06 }); gb.box(0, 1.2, 0.31, 0.5, 0.35, 0.04, "#f4f4f4", {}); gb.box(0.5, 0.6, 0, 0.06, 1.0, 0.06, "#2f2f33", {}); gb.box(0.7, 0.2, 0.4, 0.06, 0.06, 1.2, "#2f2f33", { ry: 0.6 });
  gb.pop();
  ctx.prop("oilDrum", 8.2, -2.0, 0, { y: 1.27 - gy }); ctx.prop("oilDrum", 8.9, -2.6, 0.5, { y: 1.27 - gy });
  // nets on frames, lobster pots, crates, rope coils, buckets, a fish box stack, a winch
  ctx.prop("netFrame", -3, 3.2, 0, { y: 1.27 - gy }); ctx.prop("netFrame", 0.5, 3.4, 0.15, { y: 1.27 - gy });
  for (let i = 0; i < 6; i++) ctx.prop("lobsterPot", -9 + (i % 3) * 1.1, 1.8 + Math.floor(i / 3) * 0.8, (i % 2) * 0.3, { y: 1.27 - gy + (i >= 3 ? 0 : 0) });
  ctx.prop("lobsterPot", -8.4, 2.2, 0.2, { y: 1.27 - gy + 0.52 });
  ctx.prop("crate", 4.5, 1.5, 0.3, { y: 1.27 - gy }); ctx.prop("crate", 5.4, 1.2, -0.2, { y: 1.27 - gy }); ctx.prop("crate", 4.9, 1.4, 0.6, { y: 1.27 - gy + 0.72, s: 0.9 });
  ctx.prop("ropeCoil", -1.5, -5.5, 0, { y: 1.27 - gy }); ctx.prop("ropeCoil", 3.5, -6.0, 0.4, { y: 1.27 - gy }); ctx.prop("bucket", 0.8, -4.8, 0, { y: 1.27 - gy });
  ctx.prop("barrel", 8.6, 0.5, 0, { y: 1.27 - gy }); ctx.prop("barrel", 9.4, 1.4, 0.7, { y: 1.27 - gy });
  ctx.prop("bollardIron", -9.5, -6.2, 0, { y: 1.27 - gy }); ctx.prop("bollardIron", -4.5, -6.2, 0, { y: 1.27 - gy }); ctx.prop("bollardIron", 5.5, -6.2, 0, { y: 1.27 - gy });
  // a small tarred hut (harbour store) with a notice board
  gb.push(-8.5, 1.27, 2.5, 0.2);
  gb.box(0, 0, 0, 3.2, 2.6, 2.6, "#2e2a26", { bevel: 0.05 });
  roofShed(gb, 3.2, 2.6, 2.6, 0.6, { color: "#4a4642", trim: "#1f1c19", overhang: 0.3, thick: 0.12, corrugated: true });
  gb.box(0.7, 0, 1.31, 0.9, 2.0, 0.06, "#1f1c19", {});
  gb.box(-0.9, 1.0, 1.31, 1.1, 0.9, 0.06, "#8a7a5a", {});
  gb.pop();
  ctx.sign({ kind: "notice", text: "HARBOUR", w: 1.0, h: 0.8 }, -9.4, 1.27 - gy + 1.45, 3.85, 0.2);
  ctx.sign({ kind: "warning", text: "DEEP WATER", sub: "NO SWIMMING", w: 1.4, h: 0.9 }, 9.8, 1.27 - gy + 2.2, -6.9, 0);
  gb.box(9.8, 1.27, -6.7, 0.1, 2.6, 0.1, "#3a3a3a", {});
  gb.pop();
  // moored boats (bobbed by <Buildings/>; positions exported for the life agent)
  ctx.boat(-4.8, -30, 0.25, "trawler");
  ctx.boat(8.6, -38, -0.3, "skiff");
  ctx.boat(-5.5, -44, 0.15, "sloop");
  ctx.boat(9.2, -26, 0.4, "skiff");
}

/** hull shapes for the moored boats (local: bow at -z) */
export function boatGeometry(kind: "trawler" | "skiff" | "sloop"): GB {
  const gb = new GB();
  const hull = (len: number, beam: number, depth: number, color: string, trim: string, freeboard = 0.5) => {
    // convex hull: flat stern, pointed bow, keel line
    const hb = beam / 2, hl = len / 2;
    const faces: [number, number, number][][] = [];
    const P = { sbl: [-hb, 0, hl], sbr: [hb, 0, hl], stl: [-hb, depth, hl], str: [hb, depth, hl], ml: [-hb * 1.05, 0, 0], mr: [hb * 1.05, 0, 0], mtl: [-hb * 1.05, depth, 0], mtr: [hb * 1.05, depth, 0], bow: [0, depth * 0.35, -hl], bowT: [0, depth + 0.2, -hl], kb: [0, -depth * 0.5, hl * 0.5], km: [0, -depth * 0.6, -hl * 0.2] } as Record<string, [number, number, number]>;
    faces.push([P.sbl, P.sbr, P.str, P.stl]);            // stern
    faces.push([P.stl, P.str, P.mtr, P.mtl]);            // deck (aft)
    faces.push([P.mtl, P.mtr, P.bowT]);                  // deck (fore)
    faces.push([P.sbr, P.mr, P.mtr, P.str]); faces.push([P.sbl, P.stl, P.mtl, P.ml]); // mid sides
    faces.push([P.mr, P.bow, P.bowT, P.mtr]); faces.push([P.ml, P.mtl, P.bowT, P.bow]);  // bow sides
    faces.push([P.sbl, P.ml, P.km, P.kb]); faces.push([P.sbr, P.kb, P.km, P.mr]);    // bottom
    faces.push([P.ml, P.bow, P.km]); faces.push([P.mr, P.km, P.bow]);
    faces.push([P.sbl, P.kb, P.sbr]);
    gb.convex(faces, (i) => (i === 1 || i === 2 ? "#c9b48a" : i >= 7 ? shade(color, 0.7) : color));
    // gunwale strip
    gb.box(0, depth - 0.06, hl * 0.5, beam + 0.12, 0.1, hl, trim, { bevel: 0.02 });
    gb.box(0, depth - 0.06, -hl * 0.45, beam * 0.5 + 0.12, 0.1, hl * 0.95, trim, { bevel: 0.02 });
    void freeboard;
  };
  if (kind === "trawler") {
    hull(9, 3.2, 1.4, "#2b5f9e", "#f7f4ec");
    gb.box(0, 1.34, 1.2, 2.2, 1.6, 2.4, "#f7f4ec", { bevel: 0.06 }); gb.box(0, 2.94, 1.2, 2.4, 0.15, 2.6, "#3a3a3a", {});
    for (const z of [0.1, 2.3]) gb.box(0, 1.9, z, 1.6, 0.6, 0.05, "#33465a", { glow: "#ffcf80" });
    for (const sx of [-1, 1]) gb.box(sx * 1.1, 1.9, 1.2, 0.05, 0.6, 1.4, "#33465a", { glow: "#ffcf80" });
    gb.cyl(0, 1.34, -1.6, 0.1, 0.07, 5.5, 6, "#5b3a29"); gb.box(0, 5.2, -1.6, 2.6, 0.1, 0.1, "#5b3a29", {});
    gb.cyl(0.6, 3.1, 1.2, 0.12, 0.1, 1.0, 6, "#2f2f33"); gb.sphere(0, 5.3, -1.6, 0.12, "#d8262c");
    gb.box(0, 1.34, -3.0, 1.4, 0.4, 1.2, "#5b3a29", { bevel: 0.03 }); gb.cyl(0.8, 1.34, 2.9, 0.35, 0.35, 0.5, 8, "#3a3a3a");
    gb.box(1.55, 1.9, 0.5, 0.06, 0.05, 6, "#e8c23a", {}); gb.cyl(0, 1.34, 3.4, 0.5, 0.5, 0.3, 8, "#c9b48a");
    for (const sx of [-1, 1]) gb.cyl(sx * 1.66, 0.9, -0.5, 0.3, 0.3, 0.2, 8, "#1f1f1f", { rz: Math.PI / 2, anchor: "center" });
    gb.box(0, 1.15, 3.2, 1.8, 0.35, 0.05, "#f7f4ec", {});
  } else if (kind === "skiff") {
    hull(5, 1.9, 0.8, "#b3412f", "#e9cf7a");
    for (const z of [-1.2, 0.2, 1.6]) gb.box(0, 0.5, z, 1.7, 0.08, 0.3, "#c9b48a", {});
    gb.box(0.3, 0.3, 0.6, 0.12, 0.05, 3.0, "#8b5a3c", { rz: 0.1, ry: 0.15, anchor: "center" });
    gb.box(-0.4, 0.3, 0.2, 0.12, 0.05, 3.0, "#8b5a3c", { ry: -0.12, anchor: "center" });
    gb.cyl(0, 0.2, 1.8, 0.28, 0.28, 0.3, 8, "#8a8f94"); gb.sphere(-0.4, 0.4, -1.4, 0.16, "#e8c23a");
    // faded, patched paint on the old skiff
    gb.box(0.96, 0.35, -0.8, 0.02, 0.35, 0.9, "#8a6a5a", {}); gb.box(-0.96, 0.25, 0.6, 0.02, 0.3, 0.7, "#7a5a4a", {});
  } else {
    hull(7.5, 2.4, 1.1, "#f7f4ec", "#2b5f9e");
    gb.box(0, 1.04, 0.4, 1.8, 0.7, 2.6, "#e8e2d4", { bevel: 0.08 }); gb.box(0, 1.5, -0.6, 1.0, 0.3, 0.05, "#33465a", { glow: "#ffcf80" });
    gb.cyl(0, 1.0, -0.6, 0.1, 0.06, 8.5, 6, "#e8e2d4"); gb.box(0, 1.8, 1.5, 0.12, 0.12, 3.6, "#e8e2d4", {});
    gb.box(0.02, 3.4, 0.1, 0.06, 3.4, 2.2, "#f7f4ec", { bevel: 0.02 }); // furled sail bundle
    gb.box(0, 9.3, -0.6, 0.6, 0.35, 0.05, "#1f5fa8", {});
    for (let i = 0; i < 5; i++) { gb.box(-1.25, 1.2, -2.5 + i * 1.3, 0.04, 0.5, 0.04, "#8a8f94", {}); gb.box(1.25, 1.2, -2.5 + i * 1.3, 0.04, 0.5, 0.04, "#8a8f94", {}); }
    gb.box(0, 1.65, 0.1, 2.5, 0.03, 5.5, "#8a8f94", {});
    for (const sx of [-1, 1]) gb.cyl(sx * 1.25, 0.7, 1.5, 0.22, 0.22, 0.6, 8, "#ffffff", { rz: Math.PI / 2, anchor: "center" });
  }
  return gb;
}

export function lighthouse(ctx: Ctx) {
  const { gb } = ctx;
  // rock base, tapered banded tower, gallery with railing, lantern room, dome, keeper's shed, path, bench
  gb.cyl(0, -1.2, 0, 5.2, 4.6, 1.5, 10, "#7d776c");
  gb.cyl(0, 0.3, 0, 4.8, 4.4, 0.6, 10, "#9a948a");
  const bands = 5, H = 14, r0 = 2.3, r1 = 1.7;
  for (let i = 0; i < bands; i++) {
    const y0 = 0.9 + (H * i) / bands, ra = r0 + (r1 - r0) * (i / bands), rb = r0 + (r1 - r0) * ((i + 1) / bands);
    gb.cyl(0, y0, 0, ra, rb, H / bands + 0.02, 14, i % 2 ? "#d8262c" : "#f7f4ec");
  }
  // door + small windows up the tower
  gb.push(0, 0.9, r0 - 0.05, 0);
  doorEl(gb, 0, 1.2, 2.6, { color: "#2a4a6a", frame: "#3a3a3a", step: false });
  gb.pop();
  for (let i = 0; i < 3; i++) { const y = 4.5 + i * 3.4, r = r0 + (r1 - r0) * ((y - 0.9) / H); gb.push(0, y, r - 0.05, 0); windowEl(gb, 0, 0.6, 0.7, 0.9, { frame: "#3a3a3a", glow: "#ffcf80", mullions: false, sill: false }); gb.pop(); }
  // gallery
  const gy = 0.9 + H;
  gb.cyl(0, gy, 0, r1 + 0.9, r1 + 0.9, 0.35, 14, "#3f3a37");
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, rr = r1 + 0.75; gb.box(Math.cos(a) * rr, gy + 0.35, Math.sin(a) * rr, 0.07, 1.1, 0.07, "#2f2f33", {}); }
  for (let i = 0; i < 14; i++) { const a = ((i + 0.5) / 14) * Math.PI * 2, rr = r1 + 0.75, seg = (2 * Math.PI * rr) / 14; gb.box(Math.cos(a) * rr, gy + 1.4, Math.sin(a) * rr, seg + 0.1, 0.07, 0.07, "#2f2f33", { ry: -a }); gb.box(Math.cos(a) * rr, gy + 0.9, Math.sin(a) * rr, seg + 0.1, 0.05, 0.05, "#2f2f33", { ry: -a }); }
  // lantern room: glazing (glow), mullions, dome, vent, weathervane
  gb.cyl(0, gy + 0.35, 0, r1 - 0.1, r1 - 0.1, 0.4, 12, "#3f3a37");
  gb.cyl(0, gy + 0.75, 0, r1 - 0.15, r1 - 0.15, 2.4, 12, "#fff6d8", { glow: "#ffd86a" });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; gb.box(Math.cos(a) * (r1 - 0.12), gy + 0.75, Math.sin(a) * (r1 - 0.12), 0.08, 2.4, 0.08, "#2f2f33", {}); }
  gb.cyl(0, gy + 3.15, 0, r1 + 0.1, r1 + 0.1, 0.25, 12, "#3f3a37");
  gb.cyl(0, gy + 3.4, 0, r1 + 0.05, 0.35, 1.6, 12, "#d8262c");
  gb.cyl(0, gy + 5.0, 0, 0.3, 0.2, 0.4, 8, "#3f3a37"); gb.cyl(0, gy + 5.4, 0, 0.04, 0.04, 1.2, 5, "#2f2f33"); gb.box(0.35, gy + 6.3, 0, 0.7, 0.25, 0.03, "#2f2f33", {});
  // keeper's shed, coal bunker, path, bench, a small flag mast
  gb.push(5.4, ctx.ground(5.4, 2.6), 2.6, -0.5);
  gb.box(0, 0, 0, 3.6, 2.8, 3.0, "#f7f4ec", { bevel: 0.06, grime: 0.15 });
  gableEnds(gb, 3.6, 3.0, 2.8, 1.2, "#f7f4ec", "x");
  roofGable(gb, 3.6, 3.0, 2.8, 1.2, { color: "#d8262c", trim: "#3f3a37", tiles: 4, overhang: 0.35 });
  gb.push(0, 0, 1.5); doorEl(gb, -0.7, 1.0, 2.2, { color: "#2a4a6a", frame: "#3f3a37", step: false }); windowEl(gb, 0.9, 1.5, 0.9, 0.9, { frame: "#3f3a37", glow: "#ffcf80" }); gb.pop();
  gb.box(1.2, 2.5, -0.8, 0.5, 1.6, 0.5, "#3f3a37", {});
  gb.pop();
  ctx.chimneyTop(5.4 + Math.sin(0.5) * 0, ctx.ground(5.4, 2.6) + 4.2, 2.6);
  gb.box(-5.2, ctx.ground(-5.2, 2.0), 2.0, 2.2, 1.0, 1.6, "#3a3a3a", { bevel: 0.05 }); gb.box(-5.2, ctx.ground(-5.2, 2.0) + 1.0, 2.0, 2.0, 0.3, 1.4, "#1f1f1f", { bevel: 0.1 });
  ctx.bench(2.5, 5.2, 0.2);
  ctx.prop("ropeCoil", -3.6, 4.4, 0); ctx.prop("bucket", -3.0, 4.0, 0);
  gb.cyl(-4, ctx.ground(-4, 5.5), 5.5, 0.07, 0.05, 6, 6, "#e8e2d4");
  ctx.flag(-4, ctx.ground(-4, 5.5), 5.5, 6);
  picketRun(gb, -7, 7.5, 7, 7.5, "#e8e0cc", 0.9);
  gb.box(0, 0.02, 5.6, 1.6, 0.06, 4.0, "#b5ad9f", { bevel: 0.03 });
}

export function studio(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  // old net loft: weathered grey boards on stilts with a deck over the shore, a big north skylight, hoist door
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: s.trim, bevel: 0.08, clapboard: true, grime: 0.28, plinth: "#5a5651" },
    roof: { type: "gable", color: s.roofColor, rise: s.roofH, tiles: 0, trim: "#3f3a37", overhang: 0.7 },
    door: { x: -3.0, w: 1.5, h: 2.9, color: "#3a5a6a", frame: "#3f3a37", step: false, open: 0.5 },
    windows: { w: 1.4, h: 1.5, sides: ["front", "left", "right"], frame: "#3f3a37", lit: 0.7 },
    chimneys: [{ x: 3.5, z: 1.5, w: 0.7, pots: 1 }],
    lanterns: [-4.4],
    path: false, drainpipes: false,
    room: { depth: 4, floor: "#6b5a40", inner: "#4a4642", glow: "#3a3a30" },
  });
  // big north-light studio window across the back (sea side) + hoist beam under the gable
  face(gb, "back", 0, 0, s.w, s.d);
  windowEl(gb, 0, 2.6, 5.2, 2.6, { frame: "#3f3a37", glow: "#ffe0a0", mullions: true });
  gb.box(0, s.h + 0.6, 0.6, 0.16, 0.16, 1.6, "#3a2a1a", {}); gb.box(0, s.h - 1.4, 1.35, 0.03, 2.0, 0.03, "#c9b48a", {});
  gb.pop();
  ctx.sign({ kind: "board", text: "The Old Net Loft", icon: "fish", w: 4.6, h: 0.8, bg: "#3a3a36", fg: "#d8d0b8", border: "#8a8478" }, -3.0, 4.1, s.d / 2 + 0.12, 0);
  gb.box(-3.0, 3.6, s.d / 2 + 0.05, 4.9, 1.0, 0.12, "#2a2a28", { bevel: 0.03 });
  // skylight on the north (back) slope
  gb.box(0, s.h + s.roofH * 0.45 + 0.1, -s.d / 4 - 0.4, 4.0, 0.16, 2.6, "#3f3a37", { rx: -Math.atan2(s.roofH, s.d / 2), anchor: "center" });
  gb.box(0, s.h + s.roofH * 0.45 + 0.14, -s.d / 4 - 0.4, 3.6, 0.1, 2.2, "#6a8aa8", { rx: -Math.atan2(s.roofH, s.d / 2), anchor: "center", glow: "#ffe0a0" });
  // deck over the shore (behind the loft, seaward) with railing, easels, canvases, paint pots, a stool
  gb.push(0, 0, 0, Math.PI);
  const dz = s.d / 2 + 2.6, dw = s.w + 2;
  gb.box(0, -0.1, dz, dw, 0.2, 5.2, "#6b5a40", { bevel: 0.03 });
  for (let i = 0; i < Math.floor(dw / 0.4); i++) gb.box(-dw / 2 + 0.2 + i * 0.4, 0.1, dz, 0.34, 0.06, 5.0, i % 2 ? "#7a6a50" : "#6b5a40", {});
  for (const x of [-dw / 2 + 0.5, -dw / 2 * 0.33, dw / 2 * 0.33, dw / 2 - 0.5]) for (const z of [dz + 2.4, dz - 0.6]) { const wy = ctx.ground(-x, -z) - 0.9; gb.cyl(x, Math.min(wy, -1.2), z, 0.2, 0.2, Math.abs(Math.min(wy, -1.2)) + 0.1, 7, "#4a2e1c"); }
  for (let i = 0; i <= 10; i++) gb.box(-dw / 2 + (dw * i) / 10, 0.16, dz + 2.55, 0.07, 1.0, 0.07, "#4a4642", {});
  gb.box(0, 1.16, dz + 2.55, dw, 0.08, 0.1, "#4a4642", {});
  for (const sx of [-1, 1]) { for (let k = 0; k < 5; k++) gb.box(sx * dw / 2, 0.16, dz - 2.6 + (5.2 * (k + 0.5)) / 5, 0.07, 1.0, 0.07, "#4a4642", {}); gb.box(sx * dw / 2, 1.16, dz, 0.1, 0.08, 5.2, "#4a4642", {}); }
  const easel = (x: number, z: number, ry: number, canvas: string) => {
    gb.push(x, 0.16, z, ry);
    for (const sx of [-1, 1]) gb.box(sx * 0.3, 0, 0.1, 0.05, 1.9, 0.05, "#8b5a3c", { rz: sx * 0.08 });
    gb.box(0, 0, -0.35, 0.05, 1.85, 0.05, "#8b5a3c", { rx: -0.35 });
    gb.box(0, 0.7, 0.14, 0.7, 0.05, 0.12, "#8b5a3c", {});
    gb.box(0, 0.75, 0.13, 0.75, 0.9, 0.04, canvas, {});
    gb.box(0, 0.95, 0.16, 0.5, 0.35, 0.02, shade(canvas, 0.7), {}); gb.box(0.1, 0.8, 0.16, 0.4, 0.2, 0.02, "#e88a6a", {});
    gb.pop();
  };
  easel(-3.4, dz + 0.4, 0.4, "#dfe8f0"); easel(2.8, dz + 1.2, -0.3, "#f4efe2");
  ctx.prop("stool", 2.6, -(dz + 1.6), 0, { y: 0.16 });
  for (let i = 0; i < 4; i++) gb.cyl(0.4 + i * 0.35, 0.16, dz + 2.0, 0.12, 0.12, 0.2, 6, ["#c93b3b", "#2f66b8", "#e6b83a", "#3f9a5a"][i]);
  // stacked canvases against the wall + a crate of brushes
  for (let i = 0; i < 3; i++) gb.box(4.2 + i * 0.12, 0.2, s.d / 2 + 0.6 + i * 0.1, 0.05, 1.2 + i * 0.1, 1.0, ["#f4efe2", "#e8dcc8", "#dfe8f0"][i], { rx: 0.1 });
  ctx.prop("crate", 4.8, -(dz + 2.0), 0.2, { y: 0.16, s: 0.7 });
  ctx.prop("lobsterPot", -s.w / 2 - 1.2, -0.5, 0.2);
  // steps from the deck down to the sand
  for (let i = 0; i < 3; i++) gb.box(0, -0.35 - i * 0.28, dz + 2.9 + i * 0.4, 2.0, 0.28, 0.4, "#6b5a40", {});
  gb.pop();
  // a gravel yard at the road side with a bike and a bin
  gb.box(0, 0.01, s.d / 2 + 1.6, s.w - 2, 0.05, 3.0, "#b8b0a0", {});
  ctx.prop("bike", 4.2, s.d / 2 + 1.2, 0.3); ctx.prop("bin", -s.w / 2 - 0.6, s.d / 2 - 1.0, 0);
}

export function beach(ctx: Ctx) {
  const { gb } = ctx;
  // parasols, a lifeguard chair, upturned boats, driftwood, a beach hut, towels, a bucket & spade
  const G = (x: number, z: number) => ctx.ground(x, z);
  const parasol = (x: number, z: number, a: string, b: string) => { gb.cyl(x, G(x, z), z, 0.04, 0.04, 2.4, 6, "#e8e2d4"); gb.cyl(x, G(x, z) + 2.1, z, 1.6, 0.05, 0.6, 8, (i) => (i % 2 ? a : b)); };
  parasol(-8, -3, "#e84f5a", "#f7f4ec"); parasol(3, -5, "#3c8ed6", "#f7f4ec"); parasol(11, -2, "#f2c318", "#2a2a2a"); parasol(-2, 1, "#5aa646", "#f7f4ec");
  for (const [x, z, c] of [[-7.2, -2.0, "#e84f5a"], [3.8, -4.0, "#3c8ed6"], [11.6, -1.0, "#f2c318"], [-1.2, 2.0, "#e86aa0"]] as [number, number, string][]) gb.box(x, G(x, z) + 0.02, z, 0.9, 0.04, 1.8, c, { ry: 0.3 });
  // lifeguard chair
  gb.push(6, G(6, 4), 4, 0.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 0.6, 0, sz * 0.6, 0.1, 2.8, 0.1, "#f7f4ec", {});
  gb.box(0, 2.8, 0, 1.5, 0.12, 1.5, "#f7f4ec", {}); gb.box(0, 2.9, -0.6, 1.4, 1.0, 0.1, "#f7f4ec", {}); gb.box(0, 2.92, 0, 1.0, 0.1, 0.9, "#c93b3b", {});
  for (let k = 0; k < 6; k++) gb.box(0, 0.3 + k * 0.42, 0.75, 0.6, 0.05, 0.05, "#f7f4ec", {});
  gb.box(0, 3.95, 0, 0.06, 1.2, 0.06, "#3a3a3a", {}); gb.box(0.35, 4.75, 0, 0.7, 0.4, 0.03, "#d8262c", {});
  gb.cyl(0.85, 2.9, 0.4, 0.28, 0.28, 0.1, 10, (i) => (i % 2 ? "#d8262c" : "#f7f4ec"), { rx: Math.PI / 2, anchor: "center" });
  gb.pop();
  // upturned boats
  for (const [x, z, ry, c] of [[-4, -7, 0.5, "#3c8ed6"], [-11, 2, -0.3, "#b3412f"]] as [number, number, number, string][]) {
    gb.push(x, G(x, z), z, ry);
    // simple upturned hull (convex)
    gb.convex([
      [[-0.9, 0.85, 2.4], [0.9, 0.85, 2.4], [0.9, 0.85, -0.5], [0, 0.85, -2.5], [-0.9, 0.85, -0.5]],
      [[-0.9, 0.85, 2.4], [-0.9, 0.85, -0.5], [0, 0.3, -2.5], [-0.5, 0.05, -0.3], [-0.5, 0.05, 2.1]],
      [[0.9, 0.85, 2.4], [0.5, 0.05, 2.1], [0.5, 0.05, -0.3], [0, 0.3, -2.5], [0.9, 0.85, -0.5]],
      [[-0.9, 0.85, 2.4], [-0.5, 0.05, 2.1], [0.5, 0.05, 2.1], [0.9, 0.85, 2.4]],
      [[-0.5, 0.05, 2.1], [-0.5, 0.05, -0.3], [0, 0.3, -2.5], [0.5, 0.05, -0.3], [0.5, 0.05, 2.1]],
      [[-0.9, 0.85, -0.5], [0, 0.85, -2.5], [0, 0.3, -2.5]], [[0.9, 0.85, -0.5], [0, 0.3, -2.5], [0, 0.85, -2.5]],
    ], (i) => (i === 0 ? shade(c, 0.75) : c));
    for (let k = 0; k < 3; k++) gb.box(0, 0.86, -1.2 + k * 1.2, 1.7, 0.06, 0.12, shade(c, 0.6), {});
    gb.pop();
  }
  // driftwood, rocks, a bucket & spade, a beach hut
  for (let i = 0; i < 6; i++) { const x = -14 + i * 5 + (i % 2) * 1.5, z = -1.5 + (i % 3) * 1.2; gb.box(x, G(x, z) + 0.1, z, 2.0 + (i % 3) * 0.6, 0.2, 0.25, i % 2 ? "#a89a80" : "#8a7a60", { ry: i * 0.7, rz: 0.05, bevel: 0.08, anchor: "center" }); }
  for (let i = 0; i < 5; i++) { const x = 14 + (i % 3) * 1.4, z = -4 + i * 1.6; gb.sphere(x, G(x, z) + 0.2, z, 0.5 + (i % 2) * 0.3, i % 2 ? "#7d776c" : "#8d877c"); }
  ctx.prop("bucket", -1.6, -0.2, 0); gb.box(-1.2, G(-1.2, -0.4), -0.4, 0.05, 0.7, 0.05, "#e8c23a", { rz: 0.3 }); gb.box(-1.05, G(-1.2, -0.4) + 0.55, -0.4, 0.2, 0.25, 0.02, "#e8c23a", { rz: 0.3 });
  // striped beach hut
  gb.push(-13, G(-13, -4), -4, 0.4);
  gb.box(0, 0, 0, 2.8, 2.6, 2.4, "#f7f4ec", { bevel: 0.05 });
  for (let i = 0; i < 5; i++) gb.box(-1.1 + i * 0.55, 0.05, 1.21, 0.5, 2.5, 0.03, i % 2 ? "#3c8ed6" : "#f7f4ec", {});
  gableEnds(gb, 2.8, 2.4, 2.6, 1.0, "#f7f4ec", "z");
  roofGable(gb, 2.8, 2.4, 2.6, 1.0, { color: "#3c8ed6", trim: "#f7f4ec", overhang: 0.3, thick: 0.12, ridgeAxis: "z" });
  gb.box(0.4, 0, 1.22, 0.9, 2.0, 0.06, "#2a4a6a", {});
  gb.pop();
  ctx.bench(-10, 7.2, Math.PI); ctx.bench(0, 7.4, Math.PI); ctx.bench(9, 7.0, Math.PI);
  ctx.prop("bin", 4, 7.2, 0);
}
