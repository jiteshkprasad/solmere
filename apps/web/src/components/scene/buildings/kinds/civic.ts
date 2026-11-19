/**
 * Civic & public buildings: town hall, clinic, school, chapel (+graveyard), post office,
 * harbourmaster's office, fish market.
 */
import type { Ctx } from "../layout";
import { stdBuilding } from "./common";
import { face, column, pediment, lancetWindow, roofGable, gableEnds, roofHip, flagpole, stoneWallRun, steps, picketRun, lantern } from "../kit";

export function townHall(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  const r = stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 2,
    wall: { color: s.wall, trim: s.trim, bevel: 0.12, quoins: "#cfc9bb", stone: true, seed: "hall", grime: 0.06 },
    roof: { type: "hip", color: s.roofColor, rise: s.roofH, trim: "#b9b4a8" },
    door: { x: 0, w: 2.2, h: 3.6, color: "#3a2a1a", double: true, frame: "#cfc9bb", step: false, fanlight: true },
    windows: { w: 1.4, h: 2.0, spacing: 3.0, frame: "#cfc9bb", lit: 0.5, groundY: 2.9 },
    chimneys: [{ x: -6, z: 0, w: 1.0, pots: 2 }, { x: 6, z: 0, w: 1.0, pots: 2 }],
    lanterns: [-2.6, 2.6],
    path: false,
  });
  // raised terrace + broad steps + railings
  const cz = s.d / 2;
  gb.box(0, 0, cz + 1.4, s.w * 0.7, 0.9, 2.8, "#a39c90", { bevel: 0.06 });
  gb.push(0, 0.9, cz + 2.8); steps(gb, 0, 9, 3, "#a39c90"); gb.pop();
  // four-column portico with a pediment and the town crest
  for (const x of [-4.8, -1.6, 1.6, 4.8]) column(gb, x, cz + 1.9, s.h - 0.4, 0.42, "#efeae0");
  gb.push(0, 0, cz + 1.9);
  pediment(gb, 12, s.h - 0.4, 3.2, 1.5, "#efeae0", "#b9b4a8");
  gb.pop();
  gb.box(0, s.h - 0.4, cz + 1.0, 12, 0.5, 2.6, "#e6e1d3", {});
  // cupola with a clock and a small dome
  const cy0 = s.h + s.roofH - 0.3;
  gb.box(0, cy0, 0, 3.0, 0.5, 3.0, "#dcd7c8", { bevel: 0.05 });
  gb.box(0, cy0 + 0.5, 0, 2.4, 2.4, 2.4, "#efeae0", { bevel: 0.08 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 1.1, cy0 + 0.5, sz * 1.1, 0.25, 2.4, 0.25, "#cfc9bb", {});
  gb.box(0, cy0 + 2.9, 0, 3.0, 0.3, 3.0, "#cfc9bb", { bevel: 0.05 });
  gb.cyl(0, cy0 + 3.2, 0, 1.4, 0.2, 1.2, 10, "#5a7a68");
  gb.cyl(0, cy0 + 4.4, 0, 0.06, 0.06, 0.9, 5, "#d3a74a"); gb.sphere(0, cy0 + 5.4, 0, 0.12, "#d3a74a");
  ctx.sign({ kind: "clock", text: "", w: 1.5, h: 1.5 }, 0, cy0 + 1.7, 1.22, 0);
  ctx.sign({ kind: "clock", text: "", w: 1.5, h: 1.5 }, 0, cy0 + 1.7, -1.22, Math.PI);
  // sign over the door
  gb.box(0, r.storeyH + 0.3, cz + 0.05, 5.4, 0.9, 0.12, "#3a3530", { bevel: 0.03 });
  ctx.sign({ kind: "board", text: "Town Hall", icon: "crest", w: 5.2, h: 0.8, bg: "#2c2c30", fg: "#e8d29a", border: "#c9a24a" }, 0, r.storeyH + 0.75, cz + 0.13, 0);
  // flagpole on the terrace, notice board, benches, bins, bollards
  const top = flagpole(gb, 7.6, cz + 1.6, 9, "#1f5fa8");
  ctx.flag(top[0], 0.4, top[2], 9);
  ctx.sign({ kind: "notice", text: "TOWN NOTICES", w: 2.2, h: 1.5 }, -8.2, 1.9, cz + 3.6, 0);
  gb.push(-8.2, ctx.ground(-8.2, cz + 3.6), cz + 3.6); gb.box(0, 0, -0.1, 2.4, 2.75, 0.1, "#5b4a34", { bevel: 0.03 }); gb.box(0, 2.75, -0.1, 2.7, 0.2, 0.6, "#4a3a2a", { bevel: 0.03 }); for (const sx of [-1, 1]) gb.box(sx * 1.15, 0, -0.1, 0.16, 2.8, 0.16, "#4a3a2a", {}); gb.pop();
  ctx.bench(-8.2, cz + 0.9, 0); ctx.bench(8.4, cz + 0.9, 0);
  ctx.prop("bin", -10.2, cz + 1.2, 0);
  ctx.prop("planter", -7.2, cz + 0.3, 0); ctx.prop("planter", 7.2, cz + 0.3, 0);
}

export function clinic(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: s.trim, bevel: 0.1, grime: 0.03 },
    roof: { type: "flat", color: s.roofColor, parapet: "#e9ecee", parapetH: 0.7 },
    door: { x: 0, w: 1.9, h: 3.0, color: "#3a7bd5", double: true, glass: true, frame: "#e9ecee", step: false },
    windows: { w: 1.6, h: 1.5, spacing: 2.8, frame: "#c9cfd4", lit: 0.7, pane: "#3a5060" },
    sign: { spec: { kind: "modern", text: "SOLMERE CLINIC", icon: "cross", w: 5.5, h: 0.85, bg: "#f4f6f8", fg: "#1f2f5a", border: "#d8262c" }, y: 3.9 },
    path: false,
  });
  // big red cross on the parapet and a glowing red-cross lamp by the door
  const cz = s.d / 2;
  gb.box(0, s.h + 0.35, cz + 0.2, 0.5, 1.6, 0.2, "#d8262c", {}); gb.box(0, s.h + 0.9, cz + 0.2, 1.6, 0.5, 0.2, "#d8262c", {});
  face(gb, "front", -3.2, 0, s.w, s.d);
  gb.box(0, 3.4, 0.2, 0.06, 0.06, 0.4, "#3a3a3a", { anchor: "center" });
  gb.box(0, 3.0, 0.45, 0.7, 0.7, 0.25, "#fff0f0", { glow: "#ff4a4a", bevel: 0.04 });
  gb.box(0, 3.2, 0.58, 0.12, 0.4, 0.02, "#d8262c", {}); gb.box(0, 3.34, 0.58, 0.4, 0.12, 0.02, "#d8262c", {});
  gb.pop();
  // ramp with handrail + entrance canopy
  gb.box(0, 0, cz + 1.0, 4.0, 0.3, 2.0, "#c9cfd4", { bevel: 0.03 });
  gb.box(3.2, 0.0, cz + 1.7, 2.2, 0.3, 3.4, "#c9cfd4", { rx: 0.09, anchor: "bottom" });
  for (const sx of [2.2, 4.2]) { gb.box(sx, 0.3, cz + 1.9, 0.05, 0.9, 0.05, "#7a848a", {}); gb.box(sx, 0.05, cz + 3.3, 0.05, 0.9, 0.05, "#7a848a", {}); gb.box(sx, 1.05, cz + 2.6, 0.05, 0.05, 1.5, "#7a848a", { rx: 0.17, anchor: "center" }); }
  gb.box(0, 3.55, cz + 0.9, 3.4, 0.14, 1.8, "#e9ecee", { bevel: 0.03 });
  for (const sx of [-1, 1]) gb.box(sx * 1.5, 0.3, cz + 1.7, 0.1, 3.25, 0.1, "#c9cfd4", {});
  ctx.bench(-3.6, cz + 1.6, 0);
  ctx.prop("planter", 1.4, cz + 0.5, 0);
  ctx.prop("bin", -s.w / 2 - 0.5, cz - 0.5, 0);
  ctx.prop("bike", -4.5, cz + 3.4, 0.3);
  // ambulance-style handcart & an oxygen bottle rack at the side
  ctx.prop("crate", s.w / 2 + 0.8, -1.5, 0.2);
  gb.box(s.w / 2 + 0.9, 0, 0.5, 0.6, 1.4, 0.6, "#7a848a", {}); gb.cyl(s.w / 2 + 0.8, 0, 0.5, 0.16, 0.16, 1.3, 7, "#3a7bd5"); gb.cyl(s.w / 2 + 1.05, 0, 0.5, 0.16, 0.16, 1.2, 7, "#3a7bd5");
}

export function school(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: s.trim, bevel: 0.12, clapboard: true },
    roof: { type: "gable", color: s.roofColor, rise: s.roofH, tiles: 8, trim: "#f4efe2" },
    door: { x: 0, w: 1.8, h: 3.0, color: "#a8352d", double: true, frame: "#f4efe2", fanlight: true },
    windows: { w: 1.5, h: 1.8, spacing: 2.6, frame: "#f4efe2", lit: 0.5, groundY: 2.8 },
    chimneys: [{ x: -5, z: -1.5, w: 0.9, pots: 1 }],
    sign: { spec: { kind: "board", text: "Solmere Schoolhouse", icon: "book", w: 6.5, h: 0.85, bg: "#7a2a22", fg: "#fff3d0", border: "#f4efe2" }, y: 4.2 },
  });
  // belfry with a bell on the ridge
  const by = s.h + s.roofH;
  gb.box(0, by - 0.6, 0, 1.8, 0.7, 1.8, s.wall, { bevel: 0.05 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 0.7, by + 0.1, sz * 0.7, 0.18, 1.6, 0.18, "#f4efe2", {});
  gb.push(0, 0, 0); roofHip(gb, 1.9, 1.9, by + 1.7, 1.0, { color: s.roofColor, trim: "#f4efe2", overhang: 0.2, ridgeLen: 0 }); gb.pop();
  gb.cyl(0, by + 0.5, 0, 0.32, 0.4, 0.5, 8, "#c9a227"); gb.cyl(0, by + 1.0, 0, 0.2, 0.06, 0.2, 8, "#c9a227"); gb.sphere(0, by + 0.42, 0, 0.09, "#6b5a30");
  gb.box(0, by + 1.65, 0, 0.06, 0.06, 1.4, "#3a2a1a", {});
  // playground: fence, swing, seesaw, hopscotch
  const cz = s.d / 2;
  gb.push(-9.5, ctx.ground(-9.5, cz + 3), cz + 3, 0);
  for (const sx of [-1, 1]) { gb.box(sx * 1.4, 0, 0.6, 0.1, 2.6, 0.1, "#3a6b3a", { rz: sx * 0.2 }); gb.box(sx * 1.4, 0, -0.6, 0.1, 2.6, 0.1, "#3a6b3a", { rz: sx * 0.2 }); }
  gb.box(0, 2.55, 0, 3.2, 0.1, 0.1, "#3a6b3a", {});
  for (const x of [-0.6, 0.6]) { for (const z of [-0.2, 0.2]) gb.box(x, 0.6, z, 0.03, 1.95, 0.03, "#8a8f94", {}); gb.box(x, 0.55, 0, 0.5, 0.06, 0.25, "#c93b3b", {}); }
  gb.pop();
  gb.push(-9.5, ctx.ground(-9.5, cz + 6.5), cz + 6.5, 0.3);
  gb.box(0, 0, 0, 0.6, 0.5, 0.5, "#8a8f94", {}); gb.box(0, 0.5, 0, 3.2, 0.1, 0.3, "#f2c318", { rz: 0.18, anchor: "bottom" });
  gb.pop();
  for (let i = 0; i < 8; i++) gb.box(4.5 + (i % 2) * 0.0 + (i === 3 || i === 6 ? 0.55 : 0), 0.02, cz + 2.5 + i * 0.55, i === 3 || i === 6 ? 0.5 : 0.5, 0.02, 0.5, i % 2 ? "#f4efe2" : "#e8dcc8", {});
  picketRun(gb, -12, cz + 1.2, -12, cz + 9, "#e8e0cc", 0.9); picketRun(gb, -12, cz + 9, -3, cz + 9, "#e8e0cc", 0.9); picketRun(gb, -3, cz + 9, -3, cz + 1.2, "#e8e0cc", 0.9);
  ctx.bench(2.5, cz + 1.4, 0);
  ctx.prop("bikeRack", 7.5, cz + 1.2, 0); ctx.prop("bike", 7.2, cz + 1.4, 0.1); ctx.prop("bike", 7.9, cz + 1.4, -0.1);
  const top = flagpole(gb, 9, cz + 4, 6, "#1f5fa8");
  ctx.flag(top[0], 0.4, top[2], 6);
  ctx.prop("bin", -s.w / 2 - 0.6, cz - 1, 0);
}

export function chapel(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  // nave (ridge along z, gable faces the front), tower with spire and bell, buttresses, lancet windows
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: s.trim, bevel: 0.1, stone: true, seed: "chapel", quoins: "#cfc9bb", grime: 0.14 },
    roof: { type: "gableZ", color: s.roofColor, rise: s.roofH, tiles: 9, trim: "#8d877c" },
    door: { x: 0, w: 2.0, h: 3.6, color: "#4a2e1c", double: true, open: 0.75, frame: "#cfc9bb", step: true },
    windows: { none: true },
    room: { depth: 9, floor: "#7a6a58", inner: "#8d877c", glow: "#3a2a20" },
    drainpipes: false,
  });
  // pews inside, altar at the back
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) ctx.prop("pew", sx * 1.9, s.d / 2 - 2.4 - i * 1.5, 0, { y: 0.05 });
  gb.box(0, 0.05, s.d / 2 - 8.5, 2.6, 1.1, 0.8, "#a39c90", { bevel: 0.03 }); gb.box(0, 1.15, s.d / 2 - 8.5, 0.12, 0.9, 0.12, "#d3a74a", {}); gb.box(0, 1.75, s.d / 2 - 8.5, 0.5, 0.12, 0.12, "#d3a74a", {});
  for (const sx of [-1, 1]) gb.cyl(sx * 0.9, 1.15, s.d / 2 - 8.5, 0.06, 0.05, 0.5, 6, "#f4efe2", { glow: "#ffd27a" });
  // buttresses & lancet windows along both sides
  for (const side of ["left", "right"] as const) {
    for (let i = 0; i < 4; i++) {
      const along = (i - 1.5) * 3.4;
      face(gb, side, along, 0, s.w, s.d);
      lancetWindow(gb, 0, 1.6, 1.0, 3.2, "#cfc9bb");
      gb.pop();
      face(gb, side, along + 1.7, 0, s.w, s.d);
      gb.box(0, 0, 0.35, 0.7, s.h * 0.55, 0.7, "#cfc9bb", { bevel: 0.05 });
      gb.box(0, s.h * 0.55, 0.3, 0.7, 0.4, 0.6, "#cfc9bb", { rx: 0.5, anchor: "bottom" });
      gb.pop();
    }
  }
  // rose window over the door and the big east window
  face(gb, "front", 0, 0, s.w, s.d);
  gb.cyl(0, s.h + 0.9, 0.02, 1.15, 1.15, 0.14, 12, "#cfc9bb", { rx: Math.PI / 2, anchor: "center" });
  // rose window: 12 stained-glass wedges round a gold boss, each glowing its own colour at night
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2, cy = s.h + 0.9, c = ["#c93b3b", "#2f66b8", "#e6b83a", "#3f9a5a"][i % 4];
    gb.poly([[0, cy, 0.12], [Math.cos(a0) * 0.95, cy + Math.sin(a0) * 0.95, 0.12], [Math.cos(a1) * 0.95, cy + Math.sin(a1) * 0.95, 0.12]], c, [0, 0, 1], c);
    gb.box(Math.cos(a0) * 0.5, cy + Math.sin(a0) * 0.5, 0.13, 0.05, 0.95, 0.03, "#3a3530", { rz: a0 + Math.PI / 2, anchor: "center" });
  }
  gb.sphere(0, s.h + 0.9, 0.14, 0.12, "#d3a74a");
  gb.pop();
  face(gb, "back", 0, 0, s.w, s.d); lancetWindow(gb, 0, 1.4, 2.2, 4.6, "#cfc9bb"); gb.pop();
  // tower at the front-left corner: stone, belfry openings, bell, spire, cross, clock
  const tx = -s.w / 2 + 1.6, tz = s.d / 2 - 1.6, tw = 3.4, th = s.h + s.roofH + 3.0;
  gb.box(tx, 0, tz, tw, th, tw, s.wall, { bevel: 0.1, grime: 0.14 });
  for (let y = 0.1; y < th - 0.4; y += 0.9) for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(tx + sx * (tw / 2 - 0.25), y, tz + sz * (tw / 2 - 0.25), 0.55, 0.45, 0.55, "#cfc9bb", {});
  gb.box(tx, th, tz, tw + 0.5, 0.35, tw + 0.5, "#cfc9bb", { bevel: 0.05 });
  for (const [ox, oz, ry] of [[0, tw / 2, 0], [0, -tw / 2, Math.PI], [tw / 2, 0, Math.PI / 2], [-tw / 2, 0, -Math.PI / 2]] as [number, number, number][]) {
    gb.push(tx + ox, th - 2.4, tz + oz, ry);
    gb.box(0, 0, 0.02, 1.1, 1.8, 0.1, "#2a2420", {});
    for (let k = 0; k < 4; k++) gb.box(0, 0.2 + k * 0.42, 0.08, 1.1, 0.12, 0.08, "#8d877c", {});
    gb.pop();
  }
  gb.cyl(tx, th - 1.9, tz, 0.34, 0.42, 0.6, 8, "#c9a227"); gb.cyl(tx, th - 1.3, tz, 0.22, 0.08, 0.25, 8, "#c9a227");
  gb.cyl(tx, th + 0.35, tz, tw * 0.62, 0.08, 6.5, 8, s.roofColor);
  gb.box(tx, th + 6.9, tz, 0.14, 1.4, 0.14, "#d3a74a", {}); gb.box(tx, th + 7.8, tz, 0.8, 0.14, 0.14, "#d3a74a", {});
  ctx.sign({ kind: "clock", text: "", w: 1.4, h: 1.4 }, tx, th - 4.4, tz + tw / 2 + 0.03, 0);
  // wall lanterns by the door and a sign
  face(gb, "front", 0, 0, s.w, s.d); lantern(gb, -1.7, 3.8); lantern(gb, 1.7, 3.8); gb.pop();
  ctx.lanternLight(0, 3.4, s.d / 2 + 0.6, "#ffcf80");
  gb.box(3.0, 0.9, s.d / 2 + 0.06, 2.4, 0.9, 0.1, "#3a3530", { bevel: 0.03 });
  ctx.sign({ kind: "board", text: "Chapel of the Tides", icon: "bell", w: 2.3, h: 0.8, bg: "#2c2c30", fg: "#e8d29a", border: "#c9a24a" }, 3.0, 1.35, s.d / 2 + 0.12, 0);
  // graveyard on the left (away from the rectory) with a low stone wall, headstones, a cross, a yew
  const gx0 = -(s.w / 2 + 1.5), gx1 = -(s.w / 2 + 12), gz0 = -s.d / 2 - 1, gz1 = s.d / 2 + 2;
  stoneWallRun(gb, gx0, gz1, gx1, gz1); stoneWallRun(gb, gx1, gz1, gx1, gz0); stoneWallRun(gb, gx1, gz0, gx0, gz0); stoneWallRun(gb, gx0, gz0, gx0, gz1 - 2.6);
  // gap in the wall = gate posts
  gb.box(gx0, 0, gz1 - 2.6, 0.5, 1.4, 0.5, "#8d877c", { bevel: 0.05 }); gb.box(gx0, 0, gz1, 0.5, 1.4, 0.5, "#8d877c", { bevel: 0.05 });
  let k = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++, k++) {
    const x = gx0 - 2.5 - c * 2.4, z = gz0 + 2.2 + r * 3.6;
    ctx.prop("headstone", x + (k % 3) * 0.15, z, (k % 5) * 0.12 - 0.25, { s: 0.85 + (k % 4) * 0.08 });
    if (k % 4 === 1) ctx.prop("flowerClump", x + 0.2, z + 0.5, 0, { s: 0.6 });
  }
  ctx.prop("stoneCross", gx1 + 2.4, gz1 - 2.0, 0.4);
  ctx.tree(gx1 + 1.8, gz0 + 2.0, "conifer", 1.2, "#2f5a34");
  ctx.bench(gx0 - 4, gz1 - 0.9, Math.PI);
  // path from the road to the door
  gb.box(0, 0.01, s.d / 2 + 2.6, 2.6, 0.06, 4.0, "#b5ad9f", { bevel: 0.03 });
}

export function postOffice(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: s.trim, bevel: 0.12, grime: 0.06 },
    roof: { type: "hip", color: s.roofColor, rise: s.roofH, trim: "#1e5aa8" },
    door: { x: -1.6, w: 1.5, h: 3.0, color: "#1e5aa8", glass: true, frame: "#f4efe2" },
    windows: { w: 1.4, h: 1.6, spacing: 2.6, frame: "#f4efe2", lit: 0.6 },
    chimneys: [{ x: 2.5, z: -1.5, w: 0.8, pots: 1 }],
    sign: { spec: { kind: "board", text: "Post Office", icon: "letter", w: 4.2, h: 0.85, bg: "#1e5aa8", fg: "#ffffff", border: "#f2c318" }, y: 3.85 },
  });
  // red pillar box, letter slot on the wall, postman's bike, parcel crates
  const cz = s.d / 2;
  gb.push(3.2, ctx.ground(3.2, cz + 1.8), cz + 1.8);
  gb.cyl(0, 0, 0, 0.36, 0.34, 1.5, 10, "#c93b3b"); gb.cyl(0, 1.5, 0, 0.42, 0.3, 0.25, 10, "#a82e2e"); gb.cyl(0, 1.75, 0, 0.1, 0.1, 0.1, 6, "#a82e2e");
  gb.box(0, 1.1, 0.3, 0.42, 0.06, 0.06, "#1a1a1a", {}); gb.box(0, 0.6, 0.34, 0.3, 0.35, 0.02, "#e8dcc8", {});
  gb.pop();
  face(gb, "front", 1.4, 0, s.w, s.d); gb.box(0, 1.3, 0.06, 0.5, 0.12, 0.06, "#1a1a1a", {}); gb.pop();
  ctx.prop("bike", -3.8, cz + 1.4, 0.2); ctx.prop("crate", s.w / 2 + 0.7, 1.0, 0.3); ctx.prop("sack", s.w / 2 + 1.1, 1.8, 0.9);
  ctx.bench(1.2, cz + 3.2, 0);
  ctx.prop("bin", -s.w / 2 - 0.5, cz - 0.6, 0);
}

export function harbourOffice(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  stdBuilding(ctx, {
    w: s.w, d: s.d, h: s.h, storeys: 1,
    wall: { color: s.wall, trim: s.trim, bevel: 0.12, clapboard: true, grime: 0.1 },
    roof: { type: "hip", color: s.roofColor, rise: s.roofH, trim: "#1f2f5a" },
    door: { x: 0, w: 1.5, h: 3.0, color: "#1f2f5a", frame: "#f4efe2", glass: true },
    windows: { w: 1.5, h: 1.5, spacing: 2.5, frame: "#f4efe2", lit: 0.7 },
    chimneys: [{ x: -2.5, z: 0, w: 0.8, pots: 1 }],
    sign: { spec: { kind: "board", text: "Harbourmaster", icon: "boat", w: 4.6, h: 0.85, bg: "#1f2f5a", fg: "#ffffff", border: "#f2c318" }, y: 3.85 },
    lanterns: [-2.4],
  });
  // lookout platform on the roof with a railing, signal mast with flags, life ring, tide board
  const ry0 = s.h + 0.3;
  gb.box(0, ry0 - 0.4, -1.2, 3.2, 0.5, 2.4, "#8d877c", { bevel: 0.05 });
  for (let i = 0; i <= 6; i++) { const x = -1.6 + (3.2 * i) / 6; gb.box(x, ry0 + 0.1, -0.05, 0.06, 1.0, 0.06, "#f4efe2", {}); gb.box(x, ry0 + 0.1, -2.35, 0.06, 1.0, 0.06, "#f4efe2", {}); }
  gb.box(0, ry0 + 1.1, -0.05, 3.3, 0.06, 0.06, "#f4efe2", {}); gb.box(0, ry0 + 1.1, -2.35, 3.3, 0.06, 0.06, "#f4efe2", {});
  gb.cyl(1.2, ry0 + 0.1, -1.2, 0.07, 0.05, 6.5, 6, "#f4efe2"); gb.box(1.2, ry0 + 4.2, -1.2, 2.6, 0.06, 0.06, "#f4efe2", {});
  ctx.flag(1.2, ry0 + 0.1, -1.2, 6.5);
  face(gb, "front", 2.8, 0, s.w, s.d);
  gb.cyl(0, 2.2, 0.15, 0.45, 0.45, 0.14, 10, (i) => (i % 2 ? "#d8262c" : "#f4efe2"), { rx: Math.PI / 2, anchor: "center" });
  gb.box(0, 0.9, 0.06, 1.2, 1.0, 0.06, "#2a2a2a", {});
  gb.pop();
  ctx.sign({ kind: "chalk", text: "TIDES", sub: "high 06:40|low 12:55|high 19:10", w: 1.1, h: 0.9 }, 2.8, 1.4, s.d / 2 + 0.1, 0);
  ctx.bench(-2.6, s.d / 2 + 2.2, 0);
  ctx.prop("bollardIron", s.w / 2 + 1.2, 2.0, 0); ctx.prop("ropeCoil", s.w / 2 + 1.0, 0.5, 0.3); ctx.prop("lobsterPot", -s.w / 2 - 1.0, 1.5, 0.3);
  ctx.prop("bin", -s.w / 2 - 0.7, -1.5, 0);
}

export function fishMarket(ctx: Ctx) {
  const { gb, p } = ctx; const s = p.spec;
  // open-sided hall: stone floor, timber posts, tiled gable roof with a clerestory, ice counters
  const w = s.w, d = s.d, h = s.h;
  gb.box(0, -1.0, 0, w + 1.5, 1.1, d + 1.5, "#8d877c", { bevel: 0.08 });
  gb.box(0, 0.08, 0, w + 1.0, 0.1, d + 1.0, "#a8a29a", {});
  for (const sx of [-1, 1]) for (const z of [-d / 2 + 0.4, 0, d / 2 - 0.4]) { gb.box(sx * (w / 2 - 0.4), 0.15, z, 0.4, h - 0.15, 0.4, "#5b3a29", { bevel: 0.04 }); gb.box(sx * (w / 2 - 0.4), h - 0.9, z, 0.5, 0.5, 1.6, "#5b3a29", { bevel: 0.03 }); gb.box(sx * (w / 2 - 0.4), h - 0.9, z, 1.6, 0.5, 0.5, "#5b3a29", { bevel: 0.03 }); }
  for (const sx of [-1, 1]) gb.box(sx * (w / 2 - 0.4), h - 0.3, 0, 0.5, 0.35, d, "#4a2e1c", {});
  gb.box(0, h - 0.3, d / 2 - 0.4, w, 0.35, 0.5, "#4a2e1c", {}); gb.box(0, h - 0.3, -d / 2 + 0.4, w, 0.35, 0.5, "#4a2e1c", {});
  roofGable(gb, w, d, h, s.roofH, { color: s.roofColor, trim: "#2a3a48", tiles: 8, overhang: 0.9 });
  gableEnds(gb, w, d, h, s.roofH, "#e6ebee", "x");
  // clerestory vent + gable sign
  gb.box(0, h + s.roofH - 0.1, 0, 4, 0.9, 1.6, "#cfd8dc", { bevel: 0.05 }); gb.push(0, 0, 0); roofGable(gb, 4, 1.6, h + s.roofH + 0.8, 0.5, { color: s.roofColor, trim: "#2a3a48", overhang: 0.2, thick: 0.12 }); gb.pop();
  gb.box(0, h + 0.5, d / 2 + 0.55, 5.4, 1.0, 0.12, "#1f2f5a", { bevel: 0.03 });
  ctx.sign({ kind: "board", text: "Fish Market", icon: "fish", w: 5.2, h: 0.9, bg: "#1f2f5a", fg: "#ffffff", border: "#7ab3d8" }, 0, h + 1.0, d / 2 + 0.62, 0);
  // striped side awnings
  for (const side of ["left", "right"] as const) { face(gb, side, 0, 0, w, d); gb.push(0, 3.0, 0, 0, 0.3); for (let i = 0; i < 8; i++) gb.box(-d / 2 + 0.5 + (d - 1) * (i + 0.5) / 8, 0, 0.9, (d - 1) / 8 + 0.01, 0.06, 1.8, i % 2 ? "#3d6b8f" : "#e6ebee", {}); gb.pop(); gb.pop(); }
  // ice counters with fish, hanging scales, buckets, crates
  const counter = (x: number, z: number, ry: number) => {
    gb.push(x, 0.18, z, ry);
    gb.box(0, 0, 0, 3.6, 0.95, 1.3, "#e0e6ea", { bevel: 0.05 });
    gb.box(0, 0.95, 0, 3.5, 0.25, 1.2, "#dff3ff", { bevel: 0.08 });
    for (let i = 0; i < 6; i++) gb.box(-1.4 + i * 0.56, 1.18, (i % 2 ? 0.25 : -0.25), 0.5, 0.12, 0.22, i % 3 === 0 ? "#7ab3d8" : i % 3 === 1 ? "#c0c8d0" : "#e88a6a", { bevel: 0.04, ry: (i % 2) * 0.3 });
    gb.box(0, 1.3, -0.5, 1.4, 0.35, 0.05, "#2a2a2a", {}); gb.box(0, 1.34, -0.47, 1.3, 0.22, 0.02, "#e8dcc8", {});
    gb.pop();
  };
  counter(-3.0, 1.6, 0); counter(3.0, 1.6, 0); counter(-3.0, -2.2, Math.PI); counter(3.0, -2.2, Math.PI);
  // hanging scales from the beam
  gb.box(0, h - 0.5, 0, 0.04, 1.3, 0.04, "#2a2a2a", { anchor: "bottom" }); gb.cyl(0, h - 0.6, 0, 0.3, 0.3, 0.12, 8, "#c9a227"); gb.cyl(0, h - 1.5, 0, 0.35, 0.28, 0.14, 8, "#8a8f94");
  ctx.prop("crate", -5.2, 0.4, 0.3, { y: 0.18 }); ctx.prop("crate", -5.2, 0.4, 0.1, { y: 0.9, s: 0.9 }); ctx.prop("crate", 5.0, -0.2, -0.2, { y: 0.18 });
  ctx.prop("bucket", -1.2, 0.2, 0, { y: 0.18 }); ctx.prop("bucket", 1.4, -0.3, 0, { y: 0.18 }); ctx.prop("bucket", -0.5, -0.6, 0, { y: 0.18 });
  ctx.prop("barrel", 5.3, 2.8, 0, { y: 0.18 });
  ctx.prop("crate", -w / 2 - 1.6, 1.0, 0.4); ctx.prop("crate", -w / 2 - 1.6, 1.0, 0.9, { y: 0.72, s: 0.8 }); ctx.prop("lobsterPot", w / 2 + 1.4, -1.0, 0.2); ctx.prop("lobsterPot", w / 2 + 1.4, 0.0, -0.3);
  ctx.prop("bin", w / 2 + 1.2, 3.0, 0);
  // chalk price board
  ctx.sign({ kind: "chalk", text: "TODAY'S CATCH", sub: "mackerel 3c|cod 5c|crab 4c", w: 1.3, h: 1.1 }, -4.6, 2.2, d / 2 - 0.35, 0);
  ctx.prop("netFrame", -w / 2 - 2.6, -2.0, Math.PI / 2 + 0.3);
}
