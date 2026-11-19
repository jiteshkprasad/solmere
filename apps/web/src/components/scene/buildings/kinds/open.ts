/**
 * Open spaces: the town square (tiered fountain, cobbles, memorial, notice board, planters,
 * phone box, bike rack, bollards) and Tide Park (pond, reeds, bridge, bandstand, benches).
 */
import type { Ctx } from "../layout";
import { shade, h01 } from "../kit";
import { POND, POND_Y } from "../../terrain";

export function townSquare(ctx: Ctx) {
  const { gb } = ctx;
  // cobblestone paving: a grid of slightly varied flat stones following the terrain, with a ring pattern round the fountain
  const R = 21, cell = 1.25;
  const n = Math.round((R * 2) / cell);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = -R + (i + 0.5) * cell, z = -R + (j + 0.5) * cell;
    const d = Math.hypot(x, z);
    if (d > R) continue;
    const ring = Math.floor(d / 2.2) % 2 === 0;
    const k = 0.9 + h01("cob", i * 97 + j) * 0.16 + (ring ? 0.04 : -0.04);
    gb.box(x, ctx.ground(x, z) + 0.09, z, cell - 0.08, 0.06, cell - 0.08, shade(d < 7 ? "#b8aea0" : "#c2b8a8", k), {});
  }
  // tiered fountain: octagonal basin, water, central column, two upper bowls, spout (animated water discs live in <Buildings/>)
  gb.cyl(0, 0.05, 0, 5.0, 5.0, 0.15, 8, "#a8a398");
  gb.cyl(0, 0.2, 0, 4.4, 4.4, 0.45, 8, "#8f8a80");
  // basin wall + coping as octagon segments so the water inside stays visible
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, side = 2 * 4.35 * Math.sin(Math.PI / 8);
    gb.box(Math.cos(a) * 4.35 * Math.cos(Math.PI / 8), 0.2, Math.sin(a) * 4.35 * Math.cos(Math.PI / 8), side + 0.25, 0.9, 0.55, "#b9b4a8", { ry: -a + Math.PI / 2, bevel: 0.04 });
    gb.box(Math.cos(a) * 4.35 * Math.cos(Math.PI / 8), 1.1, Math.sin(a) * 4.35 * Math.cos(Math.PI / 8), side + 0.35, 0.18, 0.75, "#cfc9bb", { ry: -a + Math.PI / 2, bevel: 0.04 });
  }
  gb.cyl(0, 0.65, 0, 3.85, 3.85, 0.06, 8, "#4a9fd8", { glow: "#1a4a6a", phase: Math.PI / 8 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; gb.box(Math.cos(a) * 4.1, 1.28, Math.sin(a) * 4.1, 0.5, 0.35, 0.5, "#cfc9bb", { ry: -a, bevel: 0.05 }); }
  gb.cyl(0, 0.9, 0, 0.9, 0.7, 1.6, 8, "#a8a398");
  gb.cyl(0, 2.5, 0, 0.5, 2.4, 0.5, 8, "#b9b4a8");
  gb.cyl(0, 3.0, 0, 2.3, 2.3, 0.08, 8, "#4a9fd8", { glow: "#1a4a6a" });
  gb.cyl(0, 3.0, 0, 0.4, 0.3, 1.2, 8, "#a8a398");
  gb.cyl(0, 4.2, 0, 0.3, 1.3, 0.35, 8, "#b9b4a8");
  gb.cyl(0, 4.55, 0, 1.25, 1.25, 0.06, 8, "#4a9fd8", { glow: "#1a4a6a" });
  gb.cyl(0, 4.6, 0, 0.18, 0.1, 0.9, 6, "#a8a398"); gb.sphere(0, 5.6, 0, 0.28, "#c9a227");
  // war-memorial column on the south side, planters, notice board, phone box, bike rack, bins, bollards, benches
  gb.push(-13, ctx.ground(-13, 12), 12);
  gb.box(0, 0, 0, 3.0, 0.5, 3.0, "#a39c90", { bevel: 0.05 }); gb.box(0, 0.5, 0, 2.2, 0.4, 2.2, "#b9b4a8", { bevel: 0.05 });
  gb.box(0, 0.9, 0, 1.4, 1.6, 1.4, "#cfc9bb", { bevel: 0.06 }); gb.box(0, 1.5, 0.71, 0.9, 0.7, 0.03, "#8d877c", {});
  gb.cyl(0, 2.5, 0, 0.5, 0.42, 4.6, 8, "#cfc9bb"); gb.box(0, 7.1, 0, 1.1, 0.3, 1.1, "#b9b4a8", { bevel: 0.05 }); gb.sphere(0, 7.75, 0, 0.42, "#c9a227");
  for (let i = 0; i < 3; i++) gb.sphere(-0.5 + i * 0.5, 0.95, 1.3, 0.16, ["#c93b3b", "#f7f4ec", "#c93b3b"][i]);
  gb.pop();
  for (const [x, z] of [[-9, 9], [9, 9], [-9, -9], [9, -9], [-12, 0], [12, 0]]) ctx.prop("planter", x, z, 0);
  for (const i of [0, 1, 3, 4, 5, 6, 7]) { const a = (i / 8) * Math.PI * 2; ctx.bench(Math.cos(a) * 8.5, Math.sin(a) * 8.5, -a - Math.PI / 2); }
  for (const [x, z] of [[-16, 10], [-10, 14], [-16, 14]]) ctx.prop("bollardStone", x, z, 0);
  ctx.prop("bin", -6, 12, 0); ctx.prop("bin", 7, -12, 0);
  ctx.prop("bikeRack", -14, -6, Math.PI / 2); ctx.prop("bike", -14.2, -5.6, Math.PI / 2 + 0.1); ctx.prop("bike", -14.2, -6.4, Math.PI / 2 - 0.15);
  // notice board on the east side
  ctx.sign({ kind: "notice", text: "NOTICES · SOLMERE", w: 2.4, h: 1.5 }, 15, 1.9, 6, -Math.PI / 2, true);
  gb.push(15, ctx.ground(15, 6), 6, -Math.PI / 2); gb.box(0, 2.75, 0, 2.7, 0.2, 0.6, "#4a3a2a", { bevel: 0.03 }); for (const sx of [-1, 1]) gb.box(sx * 1.25, 0, 0, 0.16, 2.85, 0.16, "#4a3a2a", {}); gb.pop();
  // red phone box on the north-east corner
  gb.push(15, ctx.ground(15, -8), -8, 0.3);
  gb.box(0, 0, 0, 1.1, 2.7, 1.1, "#c93b3b", { bevel: 0.04 });
  for (const sx of [-1, 1]) gb.box(sx * 0.35, 0.9, 0.53, 0.32, 1.5, 0.06, "#33465a", { glow: "#ffe0a0" });
  gb.box(0, 0.9, 0.53, 0.32, 1.5, 0.06, "#33465a", { glow: "#ffe0a0" });
  gb.box(0, 2.7, 0, 1.2, 0.2, 1.2, "#a82e2e", { bevel: 0.08 }); gb.box(0, 2.9, 0, 0.9, 0.2, 0.9, "#a82e2e", { bevel: 0.1 });
  gb.box(0, 2.35, 0.55, 0.9, 0.22, 0.03, "#f4efe2", {});
  gb.pop();
  // a small drinking fountain / well head near the stall
  gb.push(-6, ctx.ground(-6, -14), -14);
  gb.cyl(0, 0, 0, 0.5, 0.45, 1.0, 8, "#8d877c"); gb.cyl(0, 1.0, 0, 0.5, 0.5, 0.1, 8, "#a39c90"); gb.box(0.35, 0.8, 0, 0.3, 0.06, 0.06, "#2f4a2f", {});
  gb.pop();
  // flower beds at the north corners, a couple of stone steps down to the road on the south edge
  for (const [x, z] of [[-17, -17], [17, -17]]) { gb.box(x, ctx.ground(x, z) + 0.05, z, 4, 0.3, 4, "#5a4630", { bevel: 0.05 }); for (let i = 0; i < 10; i++) gb.sphere(x - 1.5 + (i % 4) * 1.0, ctx.ground(x, z) + 0.5, z - 1.5 + Math.floor(i / 4) * 1.2, 0.22, ["#e04a5a", "#f2b632", "#e86aa0", "#f7f4ec", "#8a5ac8"][i % 5]); }
}

export function park(ctx: Ctx) {
  const { gb, p } = ctx;
  // The terrain (env layer) carves the pond at POND (100,68) with water at POND_Y and scatters reeds; the life
  // layer adds ducks. Here: rim stones, lily pads, a jetty, a bandstand, benches, winding path, bird bath, sign.
  const px = POND.mx - p.x, pz = -POND.my - p.z, wy = POND_Y - p.y;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.2, r = POND.r + 0.9 + (i % 3) * 0.3; const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r; gb.box(x, ctx.ground(x, z) - 0.15, z, 0.9 + (i % 2) * 0.3, 0.5, 0.7, i % 2 ? "#8d877c" : "#9a948a", { bevel: 0.12, ry: i * 0.6 }); }
  for (let i = 0; i < 8; i++) { const a = i * 1.9, r = 1.5 + (i % 4); gb.cyl(px + Math.cos(a) * r, wy + 0.01, pz + Math.sin(a) * r, 0.35, 0.35, 0.03, 7, "#4e8f3e"); if (i % 3 === 0) gb.sphere(px + Math.cos(a) * r + 0.2, wy + 0.1, pz + Math.sin(a) * r, 0.1, "#f2b6c8"); }
  // small timber jetty poking into the pond from the east bank
  gb.push(px + POND.r + 0.6, wy + 0.25, pz, Math.PI / 2);
  for (let i = 0; i < 9; i++) gb.box(0, 0.12, -0.4 - i * 0.42, 1.6, 0.08, 0.36, i % 2 ? "#8b5a3c" : "#946446", {});
  for (const sx of [-0.7, 0.7]) for (const z of [-0.6, -2.2, -3.7]) gb.cyl(sx, -1.2, z, 0.1, 0.1, 1.5, 6, "#4a2e1c");
  gb.box(-0.75, 0.2, -2.1, 0.06, 0.9, 3.8, "#5b3a29", {}); gb.box(-0.75, 1.05, -2.1, 0.08, 0.08, 3.8, "#5b3a29", {});
  gb.pop();
  // bandstand: octagonal platform, 8 posts, railings, conical roof with a finial (north of the pond)
  gb.push(17, ctx.ground(17, -11), -11);
  gb.cyl(0, 0, 0, 4.2, 4.0, 0.7, 8, "#a39c90"); gb.cyl(0, 0.7, 0, 3.9, 3.9, 0.12, 8, "#8b5a3c");
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, x = Math.cos(a) * 3.5, z = Math.sin(a) * 3.5; gb.box(x, 0.8, z, 0.18, 3.2, 0.18, "#f4efe2", {}); if (i !== 2) { const a2 = ((i + 1) / 8) * Math.PI * 2, x2 = Math.cos(a2) * 3.5, z2 = Math.sin(a2) * 3.5; const len = Math.hypot(x2 - x, z2 - z); gb.box((x + x2) / 2, 1.7, (z + z2) / 2, len, 0.08, 0.08, "#3f6b3d", { ry: -Math.atan2(z2 - z, x2 - x) }); gb.box((x + x2) / 2, 1.2, (z + z2) / 2, len, 0.06, 0.06, "#3f6b3d", { ry: -Math.atan2(z2 - z, x2 - x) }); for (let k = 1; k < 4; k++) gb.box(x + ((x2 - x) * k) / 4, 0.8, z + ((z2 - z) * k) / 4, 0.05, 0.9, 0.05, "#3f6b3d", {}); } }
  gb.cyl(0, 3.95, 0, 4.4, 4.4, 0.25, 8, "#3f6b3d"); gb.cyl(0, 4.2, 0, 4.6, 0.3, 2.2, 8, "#3f6b3d"); gb.sphere(0, 6.5, 0, 0.2, "#c9a227");
  for (let i = 0; i < 8; i++) { const a = ((i + 0.5) / 8) * Math.PI * 2; gb.box(Math.cos(a) * 4.2, 3.6, Math.sin(a) * 4.2, 1.2, 0.5, 0.06, "#f4efe2", { ry: -a + Math.PI / 2 }); }
  gb.box(0, 0.82, 1.5, 1.4, 0.8, 0.5, "#5b3a29", { bevel: 0.04 }); gb.box(0, 1.62, 1.5, 1.2, 0.05, 0.4, "#3a3a3a", { rx: -0.4 }); // music stand
  gb.pop();
  // benches round the pond, bins, path, bird bath, shrubs, sign
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.8; ctx.bench(px + Math.cos(a) * (POND.r + 2.6), pz + Math.sin(a) * (POND.r + 2.6), -a + Math.PI / 2); }
  ctx.bench(17, -5.4, 0); ctx.bench(11.4, -11, -Math.PI / 2);
  ctx.prop("bin", 6, -2, 0); ctx.prop("bin", -4, -14, 0);
  for (let i = 0; i < 14; i++) { const t = i / 13; const x = -8 + t * 22, z = -3 + Math.sin(t * Math.PI * 1.5) * 3 - 6; if (Math.hypot(x - px, z - pz) < POND.r + 2) continue; gb.box(x, ctx.ground(x, z) + 0.02, z, 2.0, 0.06, 1.5, i % 2 ? "#b5ad9f" : "#c2b8a8", { bevel: 0.03, ry: Math.cos(t * Math.PI * 1.5) * 0.4 }); }
  gb.push(6, ctx.ground(6, 6), 6);
  gb.cyl(0, 0, 0, 0.35, 0.25, 0.9, 8, "#a39c90"); gb.cyl(0, 0.9, 0, 0.65, 0.55, 0.15, 10, "#a39c90"); gb.cyl(0, 1.02, 0, 0.55, 0.55, 0.04, 10, "#4a9fd8");
  gb.pop();
  ctx.prop("shrub", 4, -6, 0); ctx.prop("shrub", -2, -14, 1, { s: 1.2 }); ctx.prop("shrub", 10, 4, 2, { s: 0.9 }); ctx.prop("flowerClump", 8, 8, 0); ctx.prop("flowerClump", -6, 10.5, 0);
  ctx.sign({ kind: "board", text: "Tide Park", icon: "star", w: 2.6, h: 0.6, bg: "#2f5a2f", fg: "#fff3d0", border: "#e6b83a" }, 6, 2.0, -14, 0, true);
  gb.push(6, ctx.ground(6, -14), -14); for (const sx of [-1, 1]) gb.box(sx * 1.4, 0, 0, 0.16, 2.5, 0.16, "#5b3a29", {}); gb.pop();
}
