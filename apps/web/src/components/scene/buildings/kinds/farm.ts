/**
 * Hill farms: the Lindqvist and Haddad barns (with yards, tractor / cart, hay, troughs, coops),
 * the disputed boundary with its irrigation channel and stone, and the McBride orchard store.
 */
import type { Ctx } from "../layout";
import { roofGable, gableEnds, roofShed, doorEl, face, windowEl, shade, picketRun } from "../kit";
import { laundry } from "./common";

function barn(ctx: Ctx, color: string, roofColor: string, trim: string) {
  const { gb, p } = ctx; const s = p.spec;
  const w = s.w, d = s.d, h = s.h;
  gb.box(0, -1.2, 0, w + 0.6, 1.5, d + 0.6, "#8d877c", { bevel: 0.1 });
  // board walls with vertical battens, big double doors on the front (open), hay loft door above
  gb.box(0, 0, 0, w, h, d, color, { bevel: 0.1, grime: 0.2 });
  for (const side of ["front", "back", "left", "right"] as const) {
    const len = side === "front" || side === "back" ? w : d;
    face(gb, side, 0, 0, w, d);
    const n = Math.round(len / 0.9);
    for (let i = 0; i <= n; i++) gb.box(-len / 2 + (len * i) / n, 0.2, 0.04, 0.08, h - 0.4, 0.06, shade(color, 0.8), {});
    gb.box(0, h - 0.5, 0.06, len + 0.2, 0.25, 0.1, trim, {});
    gb.pop();
  }
  gableEnds(gb, w, d, h, s.roofH, color, "x", 0.1);
  roofGable(gb, w, d, h, s.roofH, { color: roofColor, trim, corrugated: true, thick: 0.14, overhang: 0.7 });
  // cupola vent on the ridge
  gb.box(0, h + s.roofH - 0.2, 0, 1.6, 1.0, 1.6, color, { bevel: 0.04 }); gb.push(0, 0, 0); roofGable(gb, 1.6, 1.6, h + s.roofH + 0.8, 0.6, { color: roofColor, trim, overhang: 0.2, thick: 0.1 }); gb.pop();
  gb.box(0, h + s.roofH + 1.45, 0, 0.05, 0.9, 0.05, "#2f2f33", {}); gb.box(0.3, h + s.roofH + 2.1, 0, 0.6, 0.25, 0.03, "#2f2f33", {});
  // big doors (open) with a dark interior
  face(gb, "front", 0, 0, w, d);
  gb.box(0, 0.02, -0.05, 4.6, 4.2, 0.05, "#1e1a14", {});
  gb.box(-2.3 - 1.1, 0, 0.0, 2.2, 4.2, 0.12, trim, { ry: -1.4, bevel: 0.03 }); gb.box(2.3 + 1.1, 0, 0.0, 2.2, 4.2, 0.12, trim, { ry: 1.4, bevel: 0.03 });
  for (const sx of [-1, 1]) { gb.box(sx * 3.2, 0.2, 0.05, 1.8, 0.14, 0.05, shade(trim, 0.8), { ry: sx * 1.4, rz: sx * 0.7 }); }
  gb.box(0, 4.2, 0.08, 5.2, 0.35, 0.2, trim, {});
  gb.box(0, h - 0.2, 0.1, 1.4, 1.4, 0.1, "#2e2a26", {}); gb.box(0, h - 0.2, 0.05, 1.5, 0.12, 0.16, trim, {}); gb.box(0, h + 1.2, 0.05, 1.5, 0.12, 0.16, trim, {});
  gb.box(0, h + 1.5, 0.6, 0.16, 0.16, 1.4, trim, {}); gb.cyl(0, h + 1.2, 1.2, 0.12, 0.12, 0.1, 8, "#2f2f33", { rz: Math.PI / 2, anchor: "center" });
  gb.pop();
  // hay inside the doorway
  gb.box(0, 0.05, d / 2 - 0.9, 3.6, 1.2, 1.2, "#d9b95a", { bevel: 0.2 }); gb.box(0.6, 1.2, d / 2 - 1.0, 2.0, 0.8, 0.9, "#c9a94a", { bevel: 0.2 });
  // side lean-to with tools
  gb.push(w / 2 + 1.4, 0, -1, 0);
  for (const z of [-2.5, 2.5]) gb.box(1.0, 0, z, 0.2, 2.6, 0.2, trim, {});
  roofShed(gb, 2.8, 6, 2.9, 0.6, { color: roofColor, trim, overhang: 0.2, thick: 0.1, corrugated: true });
  gb.pop();
  ctx.prop("milkChurn", w / 2 + 1.0, -2.6, 0); ctx.prop("milkChurn", w / 2 + 1.6, -2.4, 0); ctx.prop("sack", w / 2 + 1.5, 0.2, 0.4); ctx.prop("sack", w / 2 + 0.9, 0.8, 1.0);
  ctx.prop("bucket", w / 2 + 2.0, 1.4, 0);
  ctx.prop("ladder", -w / 2 - 0.3, 1.0, Math.PI / 2 + 0.1);
}

export function lindqvistFarm(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  barn(ctx, s.wall, s.roofColor, s.trim);
  const cz = s.d / 2;
  // tractor (red, big rear wheels), hay bales, trough, chicken coop, water pump, sign
  gb.push(6.5, ctx.ground(6.5, cz + 4), cz + 4, -0.6);
  gb.box(0, 0.7, 0.4, 1.4, 0.9, 2.2, "#c93b3b", { bevel: 0.08 }); gb.box(0, 1.6, -0.5, 1.2, 0.1, 1.2, "#c93b3b", {});
  gb.box(0, 1.15, 1.0, 0.9, 0.7, 1.1, "#2f2f33", { bevel: 0.06 }); gb.cyl(0.35, 1.85, 1.3, 0.09, 0.07, 0.9, 6, "#2f2f33");
  gb.box(0, 1.6, -0.7, 0.6, 0.5, 0.5, "#3a3a3a", { bevel: 0.05 }); gb.cyl(0, 1.7, -0.2, 0.25, 0.25, 0.05, 8, "#3a3a3a", { rx: 1.2, anchor: "center" });
  for (const sx of [-1, 1]) { gb.cyl(sx * 0.95, 0.9, -0.5, 0.9, 0.9, 0.5, 10, "#222", { rz: Math.PI / 2, anchor: "center" }); gb.cyl(sx * 1.05, 0.9, -0.5, 0.5, 0.5, 0.34, 8, "#e8c23a", { rz: Math.PI / 2, anchor: "center" }); }
  for (const sx of [-1, 1]) { gb.cyl(sx * 0.7, 0.5, 1.4, 0.5, 0.5, 0.3, 10, "#222", { rz: Math.PI / 2, anchor: "center" }); gb.cyl(sx * 0.78, 0.5, 1.4, 0.28, 0.28, 0.2, 8, "#e8c23a", { rz: Math.PI / 2, anchor: "center" }); }
  gb.pop();
  for (let i = 0; i < 5; i++) ctx.prop("hayBale", -7 - (i % 3) * 1.5, cz + 2.5 + Math.floor(i / 3) * 1.5, (i % 2) * 0.4);
  ctx.prop("hayBale", -8.5, cz + 2.5, 0.2, { y: 1.3 });
  ctx.prop("trough", -3.5, cz + 6.0, 0.3); ctx.prop("milkChurn", -3.0, cz + 4.8, 0);
  // chicken coop with a run
  gb.push(-9.5, ctx.ground(-9.5, -2), -2, 0.3);
  gb.box(0, 0.4, 0, 2.2, 1.4, 1.6, "#a8763e", { bevel: 0.05 }); roofShed(gb, 2.2, 1.6, 1.8, 0.5, { color: "#4f5a68", trim: "#6b4a30", overhang: 0.2, thick: 0.08, corrugated: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 0.9, 0, sz * 0.6, 0.12, 0.4, 0.12, "#6b4a30", {});
  gb.box(0, 0.5, 0.81, 0.5, 0.6, 0.03, "#2e2a26", {}); gb.box(0.3, 0.05, 1.2, 0.5, 0.04, 0.8, "#6b4a30", { rx: 0.5, anchor: "center" });
  gb.pop();
  picketRun(gb, -12, -4.5, -6.5, -4.5, "#b8a37c", 0.8); picketRun(gb, -6.5, -4.5, -6.5, 1.0, "#b8a37c", 0.8); picketRun(gb, -6.5, 1.0, -12, 1.0, "#b8a37c", 0.8); picketRun(gb, -12, 1.0, -12, -4.5, "#b8a37c", 0.8);
  for (let i = 0; i < 4; i++) { const x = -8 - (i % 2) * 2, z = -3.5 + Math.floor(i / 2) * 2.5; gb.sphere(x, ctx.ground(x, z) + 0.18, z, 0.18, i % 2 ? "#f4efe2" : "#c98a4a"); gb.sphere(x + 0.14, ctx.ground(x, z) + 0.32, z, 0.1, i % 2 ? "#f4efe2" : "#c98a4a"); gb.box(x + 0.22, ctx.ground(x, z) + 0.3, z, 0.08, 0.06, 0.04, "#e8c23a", {}); gb.box(x + 0.1, ctx.ground(x, z) + 0.42, z, 0.06, 0.1, 0.04, "#d8262c", {}); }
  // water pump & barrel
  gb.push(3.5, ctx.ground(3.5, cz + 1.5), cz + 1.5, 0);
  gb.cyl(0, 0, 0, 0.16, 0.14, 1.2, 8, "#2f4a2f"); gb.box(0.3, 1.1, 0, 0.6, 0.06, 0.06, "#2f4a2f", { rz: 0.4, anchor: "center" }); gb.cyl(0.25, 0.75, 0, 0.05, 0.05, 0.3, 6, "#2f4a2f", { rx: Math.PI / 2, anchor: "center" });
  gb.pop();
  ctx.prop("barrel", 3.8, cz + 2.2, 0);
  // farm sign at the yard entrance
  ctx.sign({ kind: "board", text: "Lindqvist Farm", w: 3.2, h: 0.7, bg: "#7a2a22", fg: "#fff3d0", border: "#f7f4ec" }, 0, 2.4, cz + 9, 0, true);
  gb.push(0, ctx.ground(0, cz + 9), cz + 9); for (const sx of [-1, 1]) gb.box(sx * 1.7, 0, 0, 0.18, 3.0, 0.18, "#5b3a29", {}); gb.pop();
  laundry(ctx, -4, cz + 9.5, 0, 4);
  boundary(ctx);
}

export function haddadFarm(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  barn(ctx, s.wall, s.roofColor, s.trim);
  const cz = s.d / 2;
  // hay cart with a horse-less shaft, sheep pen, well, dovecote, olive/herb pots, sign
  gb.push(-2.5, ctx.ground(-2.5, cz + 5.5), cz + 5.5, 0.5);
  gb.box(0, 0.7, 0, 1.8, 0.6, 3.2, "#8b5a3c", { bevel: 0.04 }); gb.box(0, 1.3, 0, 1.6, 0.9, 2.8, "#d9b95a", { bevel: 0.3 });
  for (const sx of [-1, 1]) { gb.cyl(sx * 1.0, 0.7, 0.6, 0.7, 0.7, 0.16, 10, "#5b3a29", { rz: Math.PI / 2, anchor: "center" }); for (let k = 0; k < 4; k++) gb.box(sx * 1.0, 0.7, 0.6, 0.06, 1.3, 0.06, "#c9b48a", { rz: Math.PI / 2, rx: (k * Math.PI) / 4, anchor: "center" }); }
  gb.box(0.4, 0.5, -2.6, 0.1, 0.1, 2.2, "#8b5a3c", { rx: 0.3, anchor: "center" }); gb.box(-0.4, 0.5, -2.6, 0.1, 0.1, 2.2, "#8b5a3c", { rx: 0.3, anchor: "center" });
  gb.pop();
  // sheep pen
  picketRun(gb, 5, cz + 1.5, 12, cz + 1.5, "#b8a37c", 0.9); picketRun(gb, 12, cz + 1.5, 12, cz + 8, "#b8a37c", 0.9); picketRun(gb, 12, cz + 8, 5, cz + 8, "#b8a37c", 0.9); picketRun(gb, 5, cz + 8, 5, cz + 1.5, "#b8a37c", 0.9);
  for (let i = 0; i < 5; i++) { const x = 6.5 + (i % 3) * 1.8, z = cz + 3 + Math.floor(i / 3) * 2.4; const g = ctx.ground(x, z); gb.box(x, g + 0.35, z, 0.7, 0.55, 1.0, "#f0ece0", { bevel: 0.22, ry: i * 0.6 }); gb.box(x + Math.sin(i * 0.6) * 0.5, g + 0.55, z + Math.cos(i * 0.6) * 0.5, 0.3, 0.3, 0.35, "#2e2a26", { bevel: 0.08, ry: i * 0.6 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(x + sx * 0.22, g, z + sz * 0.3, 0.1, 0.36, 0.1, "#2e2a26", {}); }
  ctx.prop("trough", 8.5, cz + 7.2, 0); ctx.prop("hayBale", 10.8, cz + 3.0, 0.3);
  // well
  gb.push(3.0, ctx.ground(3.0, cz + 4.5), cz + 4.5, 0);
  gb.cyl(0, 0, 0, 0.8, 0.8, 1.0, 10, "#8d877c"); gb.cyl(0, 0.05, 0, 0.6, 0.6, 1.0, 10, "#3a5a6a");
  for (const sx of [-1, 1]) gb.box(sx * 0.7, 1.0, 0, 0.12, 1.4, 0.12, "#6b4a30", {}); gb.box(0, 2.4, 0, 1.7, 0.12, 0.12, "#6b4a30", {});
  gb.push(0, 0, 0); roofGable(gb, 1.6, 1.6, 2.5, 0.6, { color: "#6e4a30", trim: "#5b3a29", overhang: 0.2, thick: 0.1 }); gb.pop();
  gb.cyl(0, 2.0, 0, 0.12, 0.12, 0.8, 8, "#5b3a29", { rz: Math.PI / 2, anchor: "center" }); gb.box(0, 1.55, 0, 0.03, 0.9, 0.03, "#c9b48a", {}); gb.cyl(0, 1.3, 0, 0.16, 0.14, 0.25, 8, "#8a8f94");
  gb.pop();
  // herb pots by the barn, a dovecote pole
  for (let i = 0; i < 4; i++) { const x = -s.w / 2 - 1 + i * 0.8, z = cz - 1.5; gb.cyl(x, ctx.ground(x, z), z, 0.22, 0.28, 0.4, 8, "#b0593a"); gb.sphere(x, ctx.ground(x, z) + 0.6, z, 0.3, i % 2 ? "#6f9a3a" : "#8fb04a"); }
  gb.cyl(-10, ctx.ground(-10, -3), -3, 0.1, 0.08, 3.6, 6, "#8b5a3c"); gb.box(-10, ctx.ground(-10, -3) + 3.6, -3, 1.0, 0.8, 1.0, "#f4efe2", { bevel: 0.05 }); gb.push(-10, ctx.ground(-10, -3), -3); roofGable(gb, 1.0, 1.0, 4.4, 0.4, { color: "#6e4a30", trim: "#5b3a29", overhang: 0.15, thick: 0.08 }); gb.pop();
  ctx.prop("basket", -3.5, cz + 1.2, 0); ctx.prop("basket", -2.8, cz + 1.6, 0.5); ctx.prop("sack", -4.5, cz + 1.0, 0.3);
  ctx.sign({ kind: "board", text: "Haddad Farm", w: 3.0, h: 0.7, bg: "#3a4a2a", fg: "#fff3d0", border: "#e6b83a" }, 0, 2.4, cz + 9, 0, true);
  gb.push(0, ctx.ground(0, cz + 9), cz + 9); for (const sx of [-1, 1]) gb.box(sx * 1.6, 0, 0, 0.18, 3.0, 0.18, "#5b3a29", {}); gb.pop();
  laundry(ctx, 5, cz + 10.5, 0.2, 4);
}

/** the disputed boundary between the two farms: an irrigation channel with banks, a boundary stone, and rival signs */
function boundary(ctx: Ctx) {
  const { gb, p } = ctx;
  // world coordinates: channel runs north-south at mx ≈ 236 from my = 54 to my = 79 (between the two farms' north
  // fields); built in the local frame of the Lindqvist barn (yaw 0 → local = world − origin)
  const ox = 236 - p.x, oz0 = -(54) - p.z, oz1 = -(79) - p.z;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const z0 = oz0 + (oz1 - oz0) * t0, z1 = oz0 + (oz1 - oz0) * t1, zc = (z0 + z1) / 2, len = Math.abs(z1 - z0) + 0.05;
    const gy = ctx.ground(ox, zc), gy1 = ctx.ground(ox, z1), rx = Math.atan2(gy1 - ctx.ground(ox, z0), Math.abs(z1 - z0)) * (oz1 < oz0 ? 1 : -1);
    const wob = Math.sin(i * 1.7) * 0.4;
    // a raised leat: stone-lined bed with the water just above the ground so it reads on the terrain
    gb.box(ox + wob, gy - 0.3, zc, 2.4, 0.45, len, "#5a4a3a", { rx, anchor: "bottom" });      // channel bed
    gb.box(ox + wob, gy + 0.12, zc, 1.5, 0.08, len, "#3f7fa8", { rx, anchor: "bottom", glow: "#0f2a3a" }); // water
    gb.box(ox + wob - 1.15, gy - 0.3, zc, 0.6, 0.85, len, "#7d776c", { rx, anchor: "bottom", bevel: 0.1 }); // stone banks
    gb.box(ox + wob + 1.15, gy - 0.3, zc, 0.6, 0.85, len, "#7d776c", { rx, anchor: "bottom", bevel: 0.1 });
    gb.box(ox + wob - 1.6, gy - 0.3, zc, 0.5, 0.5, len, "#6b7a3a", { rx, anchor: "bottom", bevel: 0.15 }); // grass banks
    gb.box(ox + wob + 1.6, gy - 0.3, zc, 0.5, 0.5, len, "#6b7a3a", { rx, anchor: "bottom", bevel: 0.15 });
  }
  // a plank bridge over the channel, a sluice gate, the boundary stone, two rival signs facing each other
  const bz = oz0 + (oz1 - oz0) * 0.45;
  gb.box(ox, ctx.ground(ox, bz) + 0.62, bz, 4.2, 0.14, 1.4, "#8b5a3c", {});
  for (let k = 0; k < 4; k++) gb.box(ox, ctx.ground(ox, bz) + 0.76, bz - 0.5 + k * 0.33, 4.2, 0.03, 0.05, "#6b4a30", {});
  for (const sx of [-1, 1]) { gb.box(ox + sx * 1.9, ctx.ground(ox, bz) + 0.62, bz - 0.6, 0.08, 0.9, 0.08, "#6b4a30", {}); gb.box(ox + sx * 1.9, ctx.ground(ox, bz) + 0.62, bz + 0.6, 0.08, 0.9, 0.08, "#6b4a30", {}); gb.box(ox + sx * 1.9, ctx.ground(ox, bz) + 1.5, bz, 0.06, 0.06, 1.3, "#6b4a30", {}); }
  const sz = oz0 + (oz1 - oz0) * 0.7;
  gb.box(ox, ctx.ground(ox, sz) - 0.3, sz, 0.15, 1.6, 2.0, "#6b4a30", {}); gb.box(ox, ctx.ground(ox, sz) + 1.3, sz, 0.5, 0.08, 0.08, "#2f2f33", {}); gb.cyl(ox, ctx.ground(ox, sz) + 1.35, sz, 0.3, 0.3, 0.06, 8, "#2f2f33");
  const st = oz0 + (oz1 - oz0) * 0.5;
  gb.box(ox + 2.4, ctx.ground(ox + 2.4, st), st, 0.7, 1.1, 0.6, "#8d877c", { bevel: 0.14, ry: 0.3, rz: 0.06 });
  gb.box(ox + 2.4, ctx.ground(ox + 2.4, st) + 0.55, st + 0.31, 0.3, 0.3, 0.02, "#5a5651", { ry: 0.3 });
  // rival signs at the road end of the channel, facing the track so passers-by (and the camera) can read them
  const sy = oz0 + 1.2;
  ctx.sign({ kind: "post", text: "LINDQVIST LAND", sub: "", w: 2.2, h: 0.7, bg: "#f4efe2", border: "#7a2a22", fg: "#7a2a22" }, ox - 3.0, ctx.ground(ox - 3.0, sy) + 1.9, sy, 0.15, true);
  gb.push(ox - 3.0, ctx.ground(ox - 3.0, sy), sy, 0.15); gb.box(0, 0, -0.08, 0.14, 2.3, 0.14, "#5b3a29", { rz: 0.05 }); gb.pop();
  ctx.sign({ kind: "warning", text: "PRIVATE", sub: "HADDAD FARM|KEEP OUT", w: 1.8, h: 1.2, bg: "#e8c23a" }, ox + 3.2, ctx.ground(ox + 3.2, sy) + 2.1, sy, -0.2, true);
  gb.push(ox + 3.2, ctx.ground(ox + 3.2, sy), sy, -0.2); gb.box(0, 0, -0.08, 0.14, 2.7, 0.14, "#3a3a3a", { rz: -0.04 }); gb.pop();
  // a broken fence section on the disputed line
  for (let k = 0; k < 6; k++) { const z = oz0 + (oz1 - oz0) * (0.12 + k * 0.05); ctx.prop("bollardWood", ox + 3.6, z, k * 0.4, { s: 0.7 }); }
  gb.box(ox + 3.6, ctx.ground(ox + 3.6, oz0 + (oz1 - oz0) * 0.2) + 0.5, oz0 + (oz1 - oz0) * 0.2, 0.08, 0.1, 3.0, "#8a7a5a", { rz: 0.25, anchor: "center" });
}

export function orchardStore(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  // small timber apple store with a shed roof, crates, ladders, baskets, a press, and apples on the trees (rows are laid out by layoutTown)
  gb.box(0, -1.0, 0, s.w + 0.5, 1.2, s.d + 0.5, "#8d877c", { bevel: 0.08 });
  gb.box(0, 0, 0, s.w, s.h, s.d, s.wall, { bevel: 0.08, grime: 0.18 });
  for (const side of ["front", "back", "left", "right"] as const) { const len = side === "front" || side === "back" ? s.w : s.d; face(gb, side, 0, 0, s.w, s.d); for (let i = 0; i <= Math.round(len / 0.7); i++) gb.box(-len / 2 + (len * i) / Math.round(len / 0.7), 0.2, 0.03, 0.07, s.h - 0.4, 0.05, shade(s.wall, 0.8), {}); gb.pop(); }
  gableEnds(gb, s.w, s.d, s.h, s.roofH, s.wall, "x", 0.1);
  roofGable(gb, s.w, s.d, s.h, s.roofH, { color: s.roofColor, trim: "#5b3a29", tiles: 5, overhang: 0.6 });
  face(gb, "front", -1.2, 0, s.w, s.d); doorEl(gb, 0, 1.6, 2.6, { color: "#5b3a29", frame: "#6b4a30", open: 0.9, step: false, double: true }); gb.pop();
  face(gb, "front", 1.6, 0, s.w, s.d); windowEl(gb, 0, 1.9, 1.0, 0.9, { frame: "#6b4a30", glow: "#ffcf80" }); gb.pop();
  gb.box(-1.2, 0.02, s.d / 2 - 0.4, 2.0, 2.4, 0.06, "#2e2a26", {});
  gb.box(0, s.h - 0.6, s.d / 2 + 0.06, 3.8, 0.8, 0.1, "#3a2a1a", { bevel: 0.03 });
  ctx.sign({ kind: "board", text: "McBride Orchard", icon: "apple", w: 3.6, h: 0.7, bg: "#2f5a2f", fg: "#fff3d0", border: "#e6b83a" }, 0, s.h - 0.2, s.d / 2 + 0.12, 0);
  // crates of apples, baskets, ladders leaning, a cider press, a wheelbarrow
  for (let i = 0; i < 5; i++) ctx.prop("crate", s.w / 2 + 0.9 + (i % 2) * 1.0, -1.5 + Math.floor(i / 2) * 1.1, (i % 3) * 0.3, { s: 0.85, y: i === 4 ? 0.7 : 0 });
  ctx.prop("basket", -1.2, s.d / 2 + 1.4, 0); ctx.prop("basket", -0.4, s.d / 2 + 1.9, 0.6); ctx.prop("basket", 2.4, s.d / 2 + 1.0, 0.2);
  ctx.prop("ladder", -s.w / 2 - 0.4, 0.5, -Math.PI / 2);
  // apple trees in rows: ladders & baskets under a few of them (world rows: mx-14..+12, my+5..+20)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const lx = -14 + c * 5.2, lz = -(5 + r * 5);
    if (Math.hypot(lx, lz) < 4.5) continue;
    const g = ctx.ground(lx, lz);
    for (let k = 0; k < 4; k++) { const a = k * 1.7 + r + c; gb.sphere(lx + Math.cos(a) * 1.1, g + 2.4 + Math.sin(a * 1.3) * 0.6, lz + Math.sin(a) * 1.1, 0.16, k % 2 ? "#d8262c" : "#c93b3b"); }
    if ((r + c) % 5 === 0) ctx.prop("ladder", lx + 0.8, lz + 0.9, (r + c) * 0.7);
    if ((r + c) % 4 === 1) ctx.prop("basket", lx - 0.9, lz + 0.6, 0);
    if ((r * 7 + c) % 6 === 2) gb.sphere(lx + 0.8, g + 0.16, lz - 0.7, 0.16, "#d8262c");
  }
  // cider press
  gb.push(-s.w / 2 - 1.8, ctx.ground(-s.w / 2 - 1.8, s.d / 2 - 0.5), s.d / 2 - 0.5, 0.4);
  gb.cyl(0, 0, 0, 0.6, 0.6, 0.25, 8, "#6b4a30"); gb.cyl(0, 0.25, 0, 0.45, 0.45, 0.7, 8, (i) => (i % 2 ? "#a07a4a" : "#8b5a3c")); gb.box(0, 0.95, 0, 0.9, 0.12, 0.9, "#6b4a30", {});
  for (const sx of [-1, 1]) gb.box(sx * 0.4, 0, 0, 0.1, 1.9, 0.1, "#3a3a3a", {}); gb.box(0, 1.85, 0, 1.0, 0.1, 0.1, "#3a3a3a", {}); gb.cyl(0, 1.05, 0, 0.05, 0.05, 0.8, 6, "#3a3a3a"); gb.box(0, 1.6, 0, 0.7, 0.05, 0.05, "#3a3a3a", { ry: 0.6 });
  gb.pop();
  // wheelbarrow
  gb.push(3.4, ctx.ground(3.4, s.d / 2 + 2.6), s.d / 2 + 2.6, -0.5);
  gb.box(0, 0.35, 0, 0.8, 0.4, 1.2, "#4f6b4a", { bevel: 0.06 }); gb.cyl(0, 0.25, -0.7, 0.25, 0.25, 0.12, 8, "#2f2f33", { rz: Math.PI / 2, anchor: "center" });
  for (const sx of [-1, 1]) { gb.box(sx * 0.3, 0.2, 0.9, 0.06, 0.06, 0.8, "#8b5a3c", { rx: -0.2, anchor: "center" }); gb.box(sx * 0.3, 0, -0.1, 0.06, 0.35, 0.06, "#8b5a3c", {}); }
  for (let k = 0; k < 5; k++) gb.sphere(-0.25 + (k % 3) * 0.25, 0.6 + Math.floor(k / 3) * 0.15, -0.3 + Math.floor(k / 2) * 0.3, 0.14, k % 2 ? "#d8262c" : "#c93b3b");
  gb.pop();
  ctx.bench(-2.4, s.d / 2 + 3.6, 0);
  laundry(ctx, s.w / 2 + 4.5, -1, Math.PI / 2, 3);
}
