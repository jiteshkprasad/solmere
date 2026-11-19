/**
 * Instanced props — small repeated objects (barrels, crates, bollards, chairs, hay bales…).
 * Each kind is one vertex-coloured geometry built with the kit at the origin (base at y = 0,
 * facing +z) and drawn as ONE InstancedMesh with the shared town material.
 */
import * as THREE from "three";
import { GB, shade, barrel, crate, benchEl, TAU } from "./kit";

export type PropKind =
  | "lampPost" | "bollardIron" | "bollardStone" | "barrel" | "keg" | "crate" | "hayBale" | "headstone" | "bin" | "planter"
  | "chair" | "table" | "umbrella" | "railPanel" | "picketPanel" | "lobsterPot" | "bike" | "bench" | "kerb" | "oilDrum" | "tyre"
  | "sawhorse" | "pallet" | "sack" | "bucket" | "basket" | "ladder" | "reeds" | "shrub" | "bikeRack" | "trafficCone" | "pew" | "breadRack"
  | "stoneCross" | "bollardWood" | "logPile" | "milkChurn" | "cleat" | "ropeCoil" | "netFrame" | "stool" | "flowerClump" | "trough" | "parasol" | "windowBox";

export const PROP_KINDS: PropKind[] = [
  "lampPost", "bollardIron", "bollardStone", "barrel", "keg", "crate", "hayBale", "headstone", "bin", "planter", "chair", "table", "umbrella", "railPanel", "picketPanel",
  "lobsterPot", "bike", "bench", "kerb", "oilDrum", "tyre", "sawhorse", "pallet", "sack", "bucket", "basket", "ladder", "reeds", "shrub", "bikeRack", "trafficCone", "pew",
  "breadRack", "stoneCross", "bollardWood", "logPile", "milkChurn", "cleat", "ropeCoil", "netFrame", "stool", "flowerClump", "trough", "parasol", "windowBox",
];

const cache = new Map<PropKind, THREE.BufferGeometry>();

export function propGeometry(kind: PropKind): THREE.BufferGeometry {
  let g = cache.get(kind);
  if (g) return g;
  const gb = new GB();
  BUILDERS[kind](gb);
  g = gb.build();
  cache.set(kind, g);
  return g;
}

const IRON = "#2f2f33", WOOD = "#8b5a3c", PALE = "#c9b48a";

const BUILDERS: Record<PropKind, (gb: GB) => void> = {
  lampPost(gb) {
    gb.cyl(0, 0, 0, 0.22, 0.16, 0.5, 8, IRON);
    gb.cyl(0, 0.5, 0, 0.09, 0.07, 3.6, 6, IRON);
    gb.box(0, 4.05, 0, 0.14, 0.14, 0.14, IRON, {});
    // bracket arm + lantern
    gb.box(0, 4.05, 0.3, 0.08, 0.08, 0.6, IRON, {});
    gb.box(0, 3.6, 0.55, 0.36, 0.5, 0.36, "#fff0c0", { glow: "#ffd27a", bevel: 0.03 });
    gb.box(0, 4.1, 0.55, 0.46, 0.08, 0.46, IRON, { bevel: 0.03 });
    gb.box(0, 3.52, 0.55, 0.46, 0.08, 0.46, IRON, { bevel: 0.03 });
    gb.cyl(0, 4.18, 0.55, 0.18, 0.04, 0.16, 6, IRON);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) gb.box(Math.sin(a) * 0.19, 3.6, 0.55 + Math.cos(a) * 0.19, 0.04, 0.5, 0.04, IRON, {});
  },
  bollardIron(gb) { gb.cyl(0, 0, 0, 0.3, 0.26, 0.55, 8, IRON); gb.cyl(0, 0.55, 0, 0.34, 0.2, 0.28, 8, IRON); },
  bollardStone(gb) { gb.cyl(0, 0, 0, 0.16, 0.14, 1.0, 6, "#9a948a"); gb.sphere(0, 1.05, 0, 0.16, "#9a948a"); gb.box(0, 0.45, 0, 0.36, 0.06, 0.36, IRON, {}); },
  barrel(gb) { barrel(gb, 0, 0); },
  keg(gb) {
    gb.cyl(0, 0, 0, 0.3, 0.32, 0.25, 10, "#9aa0a6");
    gb.cyl(0, 0.25, 0, 0.32, 0.32, 0.3, 10, "#b8bec4");
    gb.cyl(0, 0.55, 0, 0.32, 0.3, 0.25, 10, "#9aa0a6");
    gb.cyl(0, 0.8, 0, 0.12, 0.12, 0.05, 6, IRON);
  },
  crate(gb) { crate(gb, 0, 0, 0, 0.9); },
  hayBale(gb) { gb.cyl(0, 0.7, 0, 0.7, 0.7, 1.3, 9, (i) => (i % 2 ? "#d9b95a" : "#c9a94a"), { rz: Math.PI / 2, anchor: "center" }); gb.box(0, 0.05, 0, 1.32, 1.3, 0.1, "#6b4a30", { anchor: "bottom" }); gb.box(0, 0.05, 0, 0.1, 1.3, 1.42, "#6b4a30", {}); },
  headstone(gb) { gb.box(0, 0, 0, 0.7, 0.12, 0.5, "#8d877c", {}); gb.box(0, 0.1, 0, 0.55, 0.8, 0.12, "#a39c90", { bevel: 0.05 }); gb.cyl(0, 0.9, 0, 0.275, 0.275, 0.12, 8, "#a39c90", { rx: Math.PI / 2, anchor: "center" }); gb.box(0, 0.35, 0.03, 0.3, 0.05, 0.08, "#6b665e", {}); },
  bin(gb) { gb.cyl(0, 0, 0, 0.26, 0.3, 0.9, 8, "#4b5a45"); gb.cyl(0, 0.9, 0, 0.33, 0.28, 0.12, 8, "#3a4536"); gb.box(0, 1.02, 0, 0.12, 0.08, 0.12, "#3a4536", {}); },
  planter(gb) {
    gb.box(0, 0, 0, 1.2, 0.6, 0.6, "#7d6a55", { bevel: 0.06 });
    gb.box(0, 0.55, 0, 1.1, 0.1, 0.5, "#4a3a2a", {});
    for (let i = 0; i < 4; i++) { gb.sphere(-0.42 + i * 0.28, 0.78, (i % 2 ? 0.1 : -0.1), 0.15, ["#e04a5a", "#f2b632", "#e86aa0", "#f7f4ec"][i]); gb.sphere(-0.35 + i * 0.25, 0.66, (i % 2 ? -0.14 : 0.14), 0.14, "#4e8f3e"); }
  },
  chair(gb) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gb.box(sx * 0.2, 0, sz * 0.2, 0.05, 0.48, 0.05, IRON, {});
    gb.box(0, 0.48, 0, 0.5, 0.05, 0.5, "#c9a24a", { bevel: 0.02 });
    for (let i = 0; i < 3; i++) gb.box(0, 0.53 + i * 0.18, -0.22, 0.5, 0.06, 0.04, "#c9a24a", {});
    gb.box(-0.22, 0.48, -0.22, 0.05, 0.6, 0.05, IRON, {}); gb.box(0.22, 0.48, -0.22, 0.05, 0.6, 0.05, IRON, {});
  },
  table(gb) { gb.cyl(0, 0, 0, 0.3, 0.05, 0.04, 8, IRON); gb.cyl(0, 0.04, 0, 0.04, 0.04, 0.72, 6, IRON); gb.cyl(0, 0.76, 0, 0.45, 0.45, 0.05, 8, "#f4efe2"); gb.cyl(0, 0.81, 0, 0.14, 0.14, 0.05, 6, "#e8e2d4"); gb.box(0, 0.84, 0, 0.12, 0.16, 0.12, "#c0392b", {}); },
  umbrella(gb) { gb.cyl(0, 0.8, 0, 0.03, 0.03, 1.6, 6, "#e8e2d4"); gb.cyl(0, 2.05, 0, 1.4, 0.05, 0.42, 8, (i) => (i % 2 ? "#8a2a3a" : "#f4efe2")); gb.cyl(0, 2.47, 0, 0.05, 0.02, 0.15, 6, "#e8e2d4"); },
  railPanel(gb) { gb.box(-1.5, 0, 0, 0.16, 1.1, 0.16, "#8a7a5a", {}); gb.box(0, 0.45, 0, 3.0, 0.1, 0.06, "#a08a6a", {}); gb.box(0, 0.9, 0, 3.0, 0.1, 0.06, "#a08a6a", {}); },
  picketPanel(gb) { gb.box(0, 0.32, 0, 2.0, 0.07, 0.05, "#e8e0cc", {}); gb.box(0, 0.75, 0, 2.0, 0.07, 0.05, "#e8e0cc", {}); for (let i = 0; i < 7; i++) { gb.box(-1 + i * (2 / 6), 0, 0, 0.1, 0.95 + (i % 2) * 0.05, 0.04, "#e8e0cc", {}); } gb.box(-1, 0, 0, 0.14, 1.05, 0.14, "#d8cfb8", {}); },
  lobsterPot(gb) { gb.box(0, 0, 0, 0.9, 0.5, 0.6, "#6b5a40", { bevel: 0.08 }); for (let i = 0; i < 4; i++) gb.box(-0.36 + i * 0.24, 0, 0, 0.04, 0.52, 0.64, "#3f3a37", {}); for (let i = 0; i < 3; i++) gb.box(0, 0.05 + i * 0.2, 0, 0.94, 0.04, 0.64, "#3f3a37", {}); gb.cyl(0, 0.5, 0, 0.16, 0.16, 0.15, 6, "#e8c23a"); },
  bike(gb) {
    for (const z of [-0.55, 0.55]) { gb.cyl(0, 0.34, z, 0.34, 0.34, 0.05, 10, IRON, { rz: Math.PI / 2, anchor: "center", caps: false }); gb.cyl(0, 0.34, z, 0.26, 0.26, 0.06, 10, "#9aa0a6", { rz: Math.PI / 2, anchor: "center" }); }
    gb.box(0, 0.6, 0.0, 0.05, 0.05, 1.0, "#2f5f9e", { rx: 0.0, anchor: "center" });
    gb.box(0, 0.5, -0.25, 0.05, 0.05, 0.7, "#2f5f9e", { rx: 0.9, anchor: "center" });
    gb.box(0, 0.5, 0.3, 0.05, 0.05, 0.7, "#2f5f9e", { rx: -0.9, anchor: "center" });
    gb.box(0, 0.86, -0.28, 0.2, 0.06, 0.28, "#3a2a1a", { bevel: 0.02 });
    gb.box(0, 0.86, 0.45, 0.5, 0.04, 0.04, IRON, {});
    gb.box(0, 0.92, 0.45, 0.4, 0.3, 0.4, "#b08a5a", { bevel: 0.03 });
  },
  bench(gb) { benchEl(gb, 0, 0, 0); },
  kerb(gb) { gb.box(0, 0, 0, 1.5, 0.16, 0.32, "#a8a29a", { bevel: 0.03 }); },
  oilDrum(gb) { gb.cyl(0, 0, 0, 0.3, 0.3, 0.9, 10, "#3d5a80"); gb.cyl(0, 0.28, 0, 0.32, 0.32, 0.05, 10, "#2c4160"); gb.cyl(0, 0.6, 0, 0.32, 0.32, 0.05, 10, "#2c4160"); },
  tyre(gb) { gb.cyl(0, 0, 0, 0.36, 0.36, 0.24, 10, "#222"); gb.cyl(0, 0.24, 0, 0.2, 0.2, 0.01, 8, "#666"); },
  sawhorse(gb) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 0.5, 0, sz * 0.15, 0.08, 0.8, 0.08, WOOD, { rx: sz * 0.28 }); gb.box(0, 0.78, 0, 1.3, 0.1, 0.12, WOOD, {}); },
  pallet(gb) { for (let i = 0; i < 5; i++) gb.box(-0.5 + i * 0.25, 0.1, 0, 0.18, 0.04, 1.0, PALE, {}); for (const z of [-0.45, 0, 0.45]) gb.box(0, 0, z, 1.2, 0.1, 0.1, shade(PALE, 0.8), {}); },
  sack(gb) { gb.box(0, 0, 0, 0.6, 0.65, 0.45, "#c9b48a", { bevel: 0.14 }); gb.box(0, 0.62, 0, 0.3, 0.14, 0.2, "#b9a47a", { bevel: 0.05 }); },
  bucket(gb) { gb.cyl(0, 0, 0, 0.16, 0.2, 0.32, 8, "#8a8f94"); gb.cyl(0, 0.32, 0, 0.2, 0.2, 0.02, 8, "#6f7378"); gb.box(0, 0.32, 0, 0.42, 0.03, 0.03, IRON, {}); },
  basket(gb) { gb.cyl(0, 0, 0, 0.22, 0.3, 0.3, 8, (i) => (i % 2 ? "#b08a5a" : "#a07a4a")); gb.cyl(0, 0.3, 0, 0.28, 0.28, 0.02, 8, "#8a6a3a"); for (let i = 0; i < 5; i++) gb.sphere(Math.cos(i * 1.3) * 0.13, 0.36, Math.sin(i * 1.3) * 0.13, 0.08, i % 2 ? "#c93b3b" : "#d8483a"); },
  ladder(gb) { for (const sx of [-1, 1]) gb.box(sx * 0.22, 0, 0, 0.06, 3.2, 0.06, PALE, { rx: -0.35 }); for (let i = 0; i < 9; i++) gb.box(0, 0.25 + i * 0.32, -0.12 - i * 0.115, 0.5, 0.05, 0.05, PALE, {}); },
  reeds(gb) { for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.1 + (i % 3) * 0.12; gb.cyl(Math.cos(a) * r, 0, Math.sin(a) * r, 0.03, 0.01, 1.1 + (i % 4) * 0.25, 4, i % 3 ? "#6f9a3a" : "#8fb04a", { rx: (i % 2 ? 0.1 : -0.1) }); if (i % 3 === 0) gb.cyl(Math.cos(a) * r, 1.1 + (i % 4) * 0.25 - 0.2, Math.sin(a) * r, 0.05, 0.05, 0.22, 5, "#6b4a30"); } },
  shrub(gb) { gb.sphere(0, 0.45, 0, 0.5, "#4e8f3e"); gb.sphere(0.3, 0.35, 0.2, 0.35, "#5a9a46"); gb.sphere(-0.28, 0.32, -0.15, 0.33, "#468636"); },
  bikeRack(gb) { for (let i = 0; i < 3; i++) { gb.box(-0.6 + i * 0.6, 0, 0, 0.05, 0.8, 0.05, IRON, {}); gb.box(-0.6 + i * 0.6, 0.78, 0, 0.05, 0.05, 0.7, IRON, {}); } },
  trafficCone(gb) { gb.box(0, 0, 0, 0.5, 0.04, 0.5, "#1a1a1a", {}); gb.cyl(0, 0.04, 0, 0.2, 0.05, 0.7, 6, "#f26a1b"); gb.cyl(0, 0.3, 0, 0.16, 0.13, 0.12, 6, "#f4efe2"); },
  pew(gb) { gb.box(0, 0.4, 0, 2.2, 0.06, 0.45, WOOD, {}); gb.box(0, 0.46, -0.2, 2.2, 0.55, 0.06, WOOD, {}); for (const sx of [-1, 1]) gb.box(sx * 1.06, 0, 0, 0.06, 1.0, 0.5, shade(WOOD, 0.85), {}); },
  breadRack(gb) { for (const sx of [-1, 1]) gb.box(sx * 0.45, 0, 0, 0.06, 1.7, 0.4, WOOD, {}); for (let k = 0; k < 4; k++) { gb.box(0, 0.35 + k * 0.42, 0, 0.9, 0.04, 0.4, WOOD, {}); for (let i = 0; i < 3; i++) gb.box(-0.28 + i * 0.28, 0.39 + k * 0.42, 0, 0.22, 0.14, 0.3, i % 2 ? "#c98a4a" : "#d9a05a", { bevel: 0.05 }); } },
  stoneCross(gb) { gb.box(0, 0, 0, 0.8, 0.2, 0.8, "#8d877c", {}); gb.box(0, 0.2, 0, 0.16, 1.6, 0.16, "#a39c90", {}); gb.box(0, 1.25, 0, 0.7, 0.16, 0.16, "#a39c90", {}); },
  bollardWood(gb) { gb.cyl(0, 0, 0, 0.2, 0.18, 1.2, 7, "#5b3a29"); gb.cyl(0, 1.2, 0, 0.16, 0.0, 0.14, 7, "#4a2e1c"); },
  logPile(gb) { for (let k = 0; k < 3; k++) for (let i = 0; i < 4 - k; i++) gb.cyl(-0.45 + i * 0.3 + k * 0.15, 0.15 + k * 0.26, 0, 0.15, 0.15, 1.1, 7, (j, top) => (top ? "#d9b98a" : j % 2 ? "#6b4a30" : "#5b3a29"), { rx: Math.PI / 2, anchor: "center" }); },
  milkChurn(gb) { gb.cyl(0, 0, 0, 0.22, 0.2, 0.6, 8, "#aab0b6"); gb.cyl(0, 0.6, 0, 0.2, 0.12, 0.15, 8, "#9aa0a6"); gb.cyl(0, 0.75, 0, 0.13, 0.13, 0.08, 8, "#9aa0a6"); },
  cleat(gb) { gb.box(0, 0, 0, 0.12, 0.16, 0.12, IRON, {}); gb.box(0, 0.16, 0, 0.5, 0.08, 0.1, IRON, { bevel: 0.02 }); },
  ropeCoil(gb) { gb.cyl(0, 0, 0, 0.4, 0.4, 0.14, 10, (i) => (i % 2 ? "#c9b48a" : "#b9a47a")); gb.cyl(0, 0.14, 0, 0.32, 0.32, 0.1, 10, "#c9b48a"); gb.cyl(0, 0, 0, 0.14, 0.14, 0.25, 8, "#8a7a5a"); },
  netFrame(gb) {
    for (const sx of [-1, 1]) gb.box(sx * 1.4, 0, 0, 0.12, 2.2, 0.12, "#6b4a30", {});
    gb.box(0, 2.1, 0, 3.0, 0.1, 0.1, "#6b4a30", {});
    gb.box(0, 0.3, 0, 2.6, 1.8, 0.04, "#5b6b3a", { bevel: 0.0 });
    for (let i = 0; i < 8; i++) gb.box(-1.2 + i * 0.34, 0.2, 0.03, 0.03, 1.9, 0.02, "#3f4a2a", {});
    for (let i = 0; i < 5; i++) gb.box(0, 0.4 + i * 0.4, 0.03, 2.6, 0.03, 0.02, "#3f4a2a", {});
    gb.sphere(-0.9, 1.6, 0.06, 0.08, "#e8c23a"); gb.sphere(0.6, 1.2, 0.06, 0.08, "#d8262c");
  },
  stool(gb) { gb.cyl(0, 0.45, 0, 0.18, 0.18, 0.05, 8, WOOD); for (let i = 0; i < 3; i++) { const a = i * TAU / 3; gb.cyl(Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13, 0.025, 0.025, 0.45, 5, WOOD); } },
  flowerClump(gb) { for (let i = 0; i < 6; i++) { const a = i * 1.05, r = 0.25; gb.sphere(Math.cos(a) * r, 0.22, Math.sin(a) * r, 0.12, ["#e04a5a", "#f2b632", "#e86aa0", "#f7f4ec", "#8a5ac8", "#f26a1b"][i]); } gb.sphere(0, 0.14, 0, 0.32, "#4e8f3e"); },
  trough(gb) { gb.box(0, 0, 0, 1.8, 0.55, 0.7, "#8a8f94", { bevel: 0.05 }); gb.box(0, 0.42, 0, 1.6, 0.06, 0.5, "#4a8fc0", {}); },
  parasol(gb) { gb.cyl(0, 0, 0, 0.04, 0.04, 2.4, 6, "#e8e2d4"); gb.cyl(0, 2.1, 0, 1.6, 0.05, 0.6, 8, (i) => (i % 2 ? "#e84f5a" : "#f7f4ec")); },
  windowBox(gb) { gb.box(0, 0, 0, 1.1, 0.3, 0.34, "#8a5a3a", { bevel: 0.03 }); for (let i = 0; i < 4; i++) gb.sphere(-0.4 + i * 0.27, 0.42, i % 2 ? 0.06 : -0.06, 0.12, ["#e04a5a", "#f2b632", "#e86aa0", "#f7f4ec"][i]); },
};
