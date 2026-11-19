/**
 * buildCharacter(appearance, cast) → one skinned, vertex-coloured, flat-shaded
 * low-poly figure per NPC (1 draw call each). Every visually meaningful field of
 * content/appearance.json is rendered here: proportions, face, hair, facial
 * hair, glasses, hats, outfit layers, aprons, accessories, shoes and props.
 *
 * Coordinates: character space in metres, feet at y=0, facing +z, left = -x.
 * Parts are authored at their rest position and rigidly bound to one bone.
 */
import * as THREE from "three";
import type { NpcContent } from "@npcworld/schema";
import { Assembler, bbox, box, cyl, fnoise, ico, loft, mix, shade, sphere, torus, tube, wedge, type ColorFn, type Paint, type Ring, type V3 } from "./geometry";
import { computeDims, jointRest, makeBones, J, type Dims } from "./rig";
import { hairHex, skinHex, type Appearance } from "./appearance";

export type WorkKind =
  | "knead" | "hammer" | "saw" | "fish" | "haul" | "sweep" | "write" | "pour" | "carry" | "dig" | "paint" | "strum"
  | "type" | "examine" | "cut" | "weigh" | "sew" | "stir" | "wrench" | "telescope" | "patrol" | "lantern" | "sort" | "stand" | "gesture" | "teach";

export interface Gait {
  stoop: number;      // forward spine bend (rad) at rest
  bounce: number;     // vertical bob multiplier
  sway: number;       // hip roll multiplier (heavy builds)
  cadence: number;    // stride frequency multiplier
  swing: number;      // arm swing multiplier
  proud: number;      // chest up / chin up
  tired: number;      // shoulders + head down
  restless: number;   // idle fidget rate
  cane: boolean;      // right hand holds a cane → arm stays down, taps
  slow: number;       // overall tempo multiplier for idles
  holdL: number;      // left forearm raised at rest (holding something) 0..1
  holdR: number;      // right forearm raised at rest 0..1
  shoulderCarry: boolean; // left hand up holding something on the shoulder
}

export interface CharacterRig {
  id: string;
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  dims: Dims;
  gait: Gait;
  job: string;
  work: WorkKind;
  /** y of the highest point (hat/hair) in character space */
  headTop: number;
}

let _material: THREE.MeshStandardMaterial | null = null;
/** the one material every character shares (vertex colours, flat shading) */
export function characterMaterial(): THREE.MeshStandardMaterial {
  return (_material ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0 }));
}

const WORK_BY_JOB: Record<string, WorkKind> = {
  baker: "knead", assistant_baker: "knead", fisher: "fish", fisher_apprentice: "haul", harbourmaster: "telescope", constable: "patrol", night_watchman: "lantern",
  doctor: "examine", nurse: "write", mayor: "gesture", town_clerk: "write", tavern_keeper: "pour", brewer: "stir", cafe_owner: "pour", barista: "pour",
  stall_vendor: "pour", store_owner: "write", store_clerk: "sort", fish_trader: "weigh", market_porter: "carry", banker: "write", landlord: "stand",
  farmer: "dig", farmhand: "dig", orchard_keeper: "carry", carpenter: "hammer", carpenter_apprentice: "saw", mechanic: "wrench", teacher: "teach", student: "write",
  journalist: "write", tailor: "sew", barber: "cut", innkeeper: "sweep", temple_keeper: "sweep", musician: "strum", painter: "paint", postman: "sort",
  retiree: "stand", unemployed: "stand", drifter: "stand", odd_jobs: "sweep",
};

const _n0 = new THREE.Vector3();
const WHITE = "#f4f1ea", GOLD = "#d4af37", BRASS = "#c9a227", STEEL = "#b9bec4", WOOD = "#8b5a2b", DARKWOOD = "#4a3320";

export function buildCharacter(id: string, a: Appearance, cast?: NpcContent): CharacterRig {
  const gender = cast?.gender ?? "M";
  const job = cast?.job ?? "";
  const d = computeDims(a, gender);
  const R = jointRest(d);
  const A = new Assembler();
  const H = d.H;
  const o = a.outfit;
  const hair = a.hair;
  let headTop = d.headTop;

  /* ------------------------------------------------------------ palette */
  let skin = skinHex(a.skin);
  if (o.weathered) skin = shade(skin, 0.88);
  const hairC = hair.dye && (hair.style === "afro") ? mix(hairHex(hair.color), hair.dye, 0.45) : hairHex(hair.color);
  const greyC = hair.color === "white" || hair.color === "silver" ? hairC : mix(hairC, "#b8b4ad", 0.75);
  const faceDark = shade(skin, 0.72);
  const lipC = mix(skin, "#8a3a3a", gender === "F" ? 0.55 : 0.3);
  const eyeC = a.skin === "porcelain" || a.skin === "fair" ? (fnoise(id.length, 3) > 0.5 ? "#3b6a9a" : "#4a7a4a") : "#2a1a12";
  const skinPaint: ColorFn = (x, y, z) => {
    if (o.ruddy && z > d.headD * 0.28 && Math.abs(x) > d.headW * 0.18 && Math.abs(x) < d.headW * 0.46 && y > d.headY + d.headH * 0.32 && y < d.headY + d.headH * 0.55) return mix(skin, "#c8412b", 0.35);
    return skin;
  };
  const hairPaint = (base: string): ColorFn => (x, y, z, f) => {
    if (hair.greying && (Math.abs(x) > d.headW * 0.42 || z < -d.headD * 0.35) && y < d.headY + d.headH * 0.95) return fnoise(f, 1) < 0.65 ? greyC : base;
    if (hair.greyStreak && x < -d.headW * 0.05 && x > -d.headW * 0.25 && z > -d.headD * 0.2) return greyC;
    if (hair.sunBleached && fnoise(f, 2) < 0.35) return mix(base, "#f2e2a8", 0.5);
    if (hair.dye && hair.style !== "afro" && y > d.headY + d.headH * 0.9) return hair.dye;
    return base;
  };

  /* ------------------------------------------------------------ helpers */
  const add = (g: THREE.BufferGeometry, bone: number, paint: Paint, p?: V3, r?: V3, s?: number | V3) => A.add(g, bone, paint, { p, r, s });
  const headRings = (scale: number, tFrom: number, tTo = 1, zOff = 0, cut = 0.27): Ring[] => {
    const prof: [number, number, number][] = [[0, 0.6, 0.66], [0.18, 0.9, 0.94], [0.5, 1, 1], [0.8, 0.96, 0.98], [1, 0.62, 0.7]];
    const rings: Ring[] = [];
    const at = (t: number): [number, number] => {
      for (let i = 0; i < prof.length - 1; i++) {
        const [t0, w0, d0] = prof[i], [t1, w1, d1] = prof[i + 1];
        if (t >= t0 && t <= t1) { const k = (t - t0) / (t1 - t0); return [w0 + (w1 - w0) * k, d0 + (d1 - d0) * k]; }
      }
      return [prof[prof.length - 1][1], prof[prof.length - 1][2]];
    };
    const ts = [tFrom, ...prof.map((p) => p[0]).filter((t) => t > tFrom && t < tTo), tTo];
    for (const t of ts) { const [w, dd] = at(t); rings.push({ y: d.headY + d.headH * t, w: d.headW * w * scale, d: d.headD * dd * scale, cut, z: zOff }); }
    return rings;
  };

  /* ------------------------------------------------------------ body: skin + trousers (clothes overlay later) */
  const legTop = d.hipsY + H * 0.02;
  const trousers = o.overalls ?? o.coverall ?? (o.scrubs ? o.top : o.bottom);
  const trouserPaint: ColorFn = (x, y, z, f) => {
    if (o.patched && fnoise(f, 4) < 0.1) return mix(trousers, "#a8763e", 0.6);
    if (o.oilStains && fnoise(f, 5) < 0.14) return shade(trousers, 0.55);
    if (o.paintStains && fnoise(f, 6) < 0.12) return o.paintStains[Math.floor(fnoise(f, 7) * o.paintStains.length)];
    if (o.worn && fnoise(f, 8) < 0.1) return shade(trousers, 0.8);
    return trousers;
  };
  const hx = d.hipW * 0.28;
  const skirted = !!(o.dress || o.sari || o.habit || o.kilt);
  for (const side of [-1, 1]) {
    const tb = side < 0 ? J.thighL : J.thighR, sb = side < 0 ? J.shinL : J.shinR, fb = side < 0 ? J.footL : J.footR;
    const x = hx * side;
    const lr = d.legR;
    // thigh (hips → knee) and shin (knee → ankle), both in trouser colour unless skirted (then skin below the hem)
    const thighPaint: Paint = skirted && !o.habit ? (o.dress && o.bottom !== o.dress ? trousers : skin) : trouserPaint;
    add(loft([{ y: d.kneeY - H * 0.01, w: lr * 1.7, d: lr * 1.7 }, { y: d.kneeY + H * 0.09, w: lr * 2, d: lr * 2 }, { y: legTop, w: lr * 2.15, d: lr * 2.1 }]), tb, thighPaint, [x, 0, 0]);
    add(loft([{ y: d.ankleY - H * 0.01, w: lr * 1.35, d: lr * 1.4 }, { y: d.kneeY - H * 0.05, w: lr * 1.65, d: lr * 1.7 }, { y: d.kneeY + H * 0.02, w: lr * 1.8, d: lr * 1.8 }]), sb, skirted && !o.habit ? skin : trouserPaint, [x, 0, 0]);
    // shoes
    const shoeC = o.shoes;
    const fl = d.footL, fw = lr * 1.7;
    if (o.wellies) {
      const wc = o.shoes === "#1e1a18" ? "#2a3a2a" : o.shoes;
      add(loft([{ y: 0, w: fw * 1.05, d: fl * 0.9, cut: 0.25, z: fl * 0.12 }, { y: d.ankleY * 1.3, w: fw * 1.05, d: fl * 0.62, cut: 0.25, z: -fl * 0.02 }]), fb, wc, [x, 0, 0]);
      add(loft([{ y: d.ankleY * 1.1, w: fw * 1.15, d: fw * 1.2, cut: 0.3 }, { y: d.kneeY - H * 0.06, w: fw * 1.25, d: fw * 1.3, cut: 0.3 }]), sb, wc, [x, 0, 0]);
    } else if (o.boots) {
      add(loft([{ y: 0, w: fw * 1.05, d: fl * 0.95, cut: 0.25, z: fl * 0.14 }, { y: d.ankleY * 1.2, w: fw * 1.05, d: fl * 0.62, cut: 0.25, z: 0 }, { y: d.ankleY * 2.4, w: fw * 1.02, d: fw * 1.15, cut: 0.3, z: -fl * 0.02 }]), fb, shade(shoeC, 1.05), [x, 0, 0]);
      add(box(fw * 1.12, d.ankleY * 0.3, fl * 0.98), fb, shade(shoeC, 0.7), [x, d.ankleY * 0.15, fl * 0.12]);
    } else {
      const sole = o.sneakers ? (shoeC === "#ffffff" || shoeC === "#f2f2f2" ? "#c9c9c9" : "#f2f2f2") : shade(shoeC, 0.6);
      add(loft([{ y: 0, w: fw, d: fl * 0.95, cut: 0.25, z: fl * 0.14 }, { y: d.ankleY * 0.55, w: fw * 0.98, d: fl * 0.92, cut: 0.28, z: fl * 0.12 }, { y: d.ankleY * 1.15, w: fw * 0.8, d: fl * 0.5, cut: 0.3, z: fl * 0.02 }]), fb, o.polished ? shade(shoeC, 1.15) : shoeC, [x, 0, 0]);
      add(box(fw * 1.05, d.ankleY * 0.28, fl * 0.98), fb, sole, [x, d.ankleY * 0.14, fl * 0.13]);
    }
  }
  // patches on trousers
  if (o.patched) { add(box(H * 0.05, H * 0.05, H * 0.005), J.shinL, "#a8763e", [-hx, d.kneeY - H * 0.06, d.legR * 0.85]); add(box(H * 0.045, H * 0.06, H * 0.005), J.thighR, "#6b5a3a", [hx + d.legR * 0.2, d.kneeY + H * 0.1, d.legR * 0.95]); }

  /* ------------------------------------------------------------ torso layers */
  const outer = o.coat ?? o.jacket ?? o.suit ?? (typeof o.blazer === "string" ? o.blazer : o.blazer ? o.top : undefined) ?? o.cardigan ?? o.sweater ?? o.hoodie ?? o.tunic ?? o.dress ?? o.habit ?? o.coverall ?? o.overalls ?? (o.uniform ? o.top : undefined);
  const inner = o.shirt ?? o.tee ?? o.top;
  const vest = o.vest ?? o.waistcoat;
  const buttoned = !!(o.uniform || o.coverall || o.overalls || o.hoodie || o.sweater || o.tunic || o.dress || o.habit || o.scrubs || o.waxJacket || o.oilskin || o.labCoat === undefined && o.coat && !o.longCoat && !o.navalCoat && !o.armyJacket);
  const base = outer ?? inner;
  const tw = d.torsoW, td = d.torsoD, sw = d.shoulderW;
  const vOpen = !buttoned && outer !== undefined && outer !== inner;
  const torsoPaint: ColorFn = (x, y, z, f) => {
    // V opening shows the shirt under an open jacket / suit / cardigan / coat
    if (vOpen && z > td * 0.2) {
      const k = (y - d.waistY) / (d.shoulderY - d.waistY);
      if (Math.abs(x) < H * (o.openCollar ? 0.02 : 0.01) + k * k * H * (o.openCollar ? 0.05 : 0.035)) return inner;
    }
    if (o.scrubs && z > td * 0.2) { const k = (y - d.chestY) / (d.shoulderY - d.chestY); if (k > 0.55 && Math.abs(x) < (k - 0.55) * H * 0.12) return skin; }
    if (o.plaid && !o.overalls) return plaidAt(x, y, base, o.plaid);
    if (o.plaid && o.overalls && (Math.abs(x) > tw * 0.28 || y > d.chestY + H * 0.04)) return plaidAt(x, y, o.shirt ?? o.top, o.plaid);
    if (o.overalls && !o.plaid && (Math.abs(x) > tw * 0.3 || y > d.chestY + H * 0.05) && !(o.paintStains)) return inner;
    if (o.overalls && o.paintStains && (Math.abs(x) > tw * 0.3 || y > d.chestY + H * 0.05)) return inner;
    if (o.paintStains && fnoise(f, 9) < 0.16) return o.paintStains[Math.floor(fnoise(f, 10) * o.paintStains.length)];
    if (o.oilStains && fnoise(f, 11) < 0.12) return shade(base, 0.55);
    if (o.holes && fnoise(f, 12) < 0.06) return shade(base, 0.45);
    if (o.worn && fnoise(f, 13) < 0.1) return shade(base, 0.8);
    if (o.pattern && z * z + x * x > 0 && fnoise(f, 14) < 0.22) return o.pattern;
    if (o.denim && fnoise(f, 15) < 0.3) return shade(base, 0.92);
    if (o.sari && z > 0) return base; // handled by drape
    return base;
  };
  const heavyK = a.build === "heavy" ? 1.12 : 1;
  const hipRing: Ring = { y: d.hipsY - H * 0.035, w: d.hipW * 1.15, d: td * 1.05, cut: 0.28 };
  const bodyRings: Ring[] = [
    hipRing,
    { y: d.waistY, w: tw * (a.build === "heavy" ? 1.1 : 0.95), d: td * (a.build === "heavy" ? 1.15 : 0.95), cut: 0.28 },
    { y: d.chestY, w: tw * 1.03 * heavyK, d: td * 1.05 * heavyK, cut: 0.28 },
    { y: d.shoulderY - H * 0.025, w: sw * 0.98, d: td * 0.98, cut: 0.3 },
    { y: d.shoulderY + H * 0.012, w: sw * 0.78, d: td * 0.78, cut: 0.35 },
  ];
  // lower half → spine bone, upper → chest bone (split at chest) — overlapped slightly so bending doesn't open a gap
  add(loft(bodyRings.slice(0, 3), { top: false }), J.spine, torsoPaint);
  add(loft(bodyRings.slice(2), { bottom: false }), J.chest, torsoPaint);
  add(loft([{ y: d.chestY - H * 0.01, w: bodyRings[2].w * 0.97, d: bodyRings[2].d * 0.97, cut: 0.28 }, { y: d.chestY + H * 0.01, w: bodyRings[2].w * 0.97, d: bodyRings[2].d * 0.97, cut: 0.28 }]), J.spine, torsoPaint);
  // waist / belt line
  if (o.belt) add(loft([{ y: d.hipsY - H * 0.005, w: hipRing.w * 1.02, d: hipRing.d * 1.02, cut: 0.28 }, { y: d.hipsY + H * 0.022, w: hipRing.w * 1.02, d: hipRing.d * 1.02, cut: 0.28 }]), J.hips, o.belt);
  if (o.belt) add(box(H * 0.03, H * 0.022, H * 0.008), J.hips, BRASS, [0, d.hipsY + H * 0.008, hipRing.d / 2 + H * 0.002]);
  // vest / waistcoat over the shirt
  if (vest && !o.tunic) {
    const vp: ColorFn = (x, y, z) => { const k = (y - d.waistY) / (d.shoulderY - d.waistY); if (z > td * 0.2 && Math.abs(x) < H * 0.006 + k * k * H * 0.045) return inner; return vest; };
    add(loft([{ y: d.hipsY + H * 0.005, w: tw * 1.0 * heavyK + H * 0.012, d: td * heavyK + H * 0.012, cut: 0.28 }, { y: d.chestY, w: tw * 1.04 * heavyK + H * 0.012, d: td * 1.06 * heavyK + H * 0.012, cut: 0.28 }, { y: d.shoulderY - H * 0.035, w: sw * 0.93, d: td * 0.98 + H * 0.01, cut: 0.3 }], { top: false, bottom: false }), J.spine, vp);
    for (const yy of [d.chestY - H * 0.03, d.chestY + H * 0.02]) add(sphere(H * 0.006, 5, 3), J.spine, o.watchChain ? BRASS : shade(vest, 0.6), [0, yy, td * 0.55 * heavyK + H * 0.014]);
  }
  // work vest over tunic (fatima) — same shape, buttoned
  if (vest && o.tunic) add(loft([{ y: d.hipsY + H * 0.01, w: tw + H * 0.012, d: td + H * 0.012, cut: 0.28 }, { y: d.chestY, w: tw * 1.04 + H * 0.012, d: td * 1.06 + H * 0.012, cut: 0.28 }, { y: d.shoulderY - H * 0.035, w: sw * 0.9, d: td + H * 0.01, cut: 0.3 }], { top: false, bottom: false }), J.spine, vest);
  // lapels for suits / blazers / jackets
  if (o.suit || o.blazer || (o.jacket && !o.denim && !o.armyJacket) || o.navalCoat) {
    const lc = shade(base, 0.85);
    for (const s of [-1, 1]) add(wedge(H * 0.026, H * 0.08, H * 0.008), J.chest, lc, [s * H * 0.04, d.chestY + H * 0.1, td * 0.52 * heavyK + H * 0.008], [0, 0, Math.PI + s * 0.32]);
  }
  // long garments below the hips: coats, dresses, skirts, habit, kilt, sari
  const hemOf = () => {
    if (o.habit || o.sari) return H * 0.05;
    if (o.longCoat) return d.kneeY - H * 0.03;
    if (o.navalCoat || o.labCoat || o.waxJacket) return d.kneeY + H * 0.03;
    if (o.coat && o.oilskin) return d.kneeY + H * 0.06;
    if (o.dress) return d.kneeY - H * 0.02;
    if (o.kilt) return d.kneeY + H * 0.015;
    return -1;
  };
  const hem = hemOf();
  if (hem > 0) {
    const gc = o.kilt ?? o.sari ?? o.dress ?? o.habit ?? o.coat ?? base;
    const flare = o.kilt || o.dress || o.sari ? 1.35 : 1.15;
    const gp: ColorFn = (x, y, z, f) => {
      if (o.kilt && o.tartan) { const u = Math.atan2(x, z); return (Math.abs(Math.sin(u * 5)) > 0.85 || Math.abs(Math.sin((y - hem) / H * 80)) > 0.86) ? o.tartan : gc; }
      if (o.sari && o.border && y < hem + H * 0.03) return o.border;
      if (o.pattern && fnoise(f, 16) < 0.22) return o.pattern;
      if (o.oilStains && fnoise(f, 11) < 0.12) return shade(gc, 0.55);
      if (o.dress && o.lace && y > hem) return gc;
      return gc;
    };
    const w0 = d.hipW * 1.2, d0 = td * 1.1;
    add(loft([{ y: hem, w: w0 * flare, d: d0 * flare, cut: 0.28 }, { y: d.hipsY - H * 0.04, w: w0, d: d0, cut: 0.28 }, { y: d.hipsY + H * 0.03, w: w0 * 0.98, d: d0 * 0.98, cut: 0.28 }], { top: false }), J.hips, gp);
  }
  // sari drape across the torso (over the left shoulder) with a gold border
  if (o.sari) {
    const bc = o.border ?? GOLD;
    add(box(H * 0.11, H * 0.03, H * 0.012), J.chest, (x, y) => (y < d.chestY - H * 0.06 + H * 0.006 || y > d.chestY + H * 0.12 - H * 0.006 ? bc : o.sari!), [-H * 0.005, d.chestY + H * 0.03, td * 0.55 + H * 0.01], [0, 0, 0.75], [1, 6.5, 1]);
    add(box(H * 0.09, H * 0.16, H * 0.012), J.chest, (x) => (x < -H * 0.075 ? bc : o.sari!), [-sw * 0.36, d.shoulderY - H * 0.06, -td * 0.5], [0, 0, 0.1]);
  }
  // overalls bib + straps
  if (o.overalls) {
    add(box(tw * 0.55, H * 0.1, H * 0.012), J.chest, (x, y, z, f) => (o.paintStains && fnoise(f, 17) < 0.2 ? o.paintStains[Math.floor(fnoise(f, 18) * o.paintStains.length)] : o.overalls!), [0, d.chestY + H * 0.03, td * 0.55 + H * 0.006]);
    for (const s of [-1, 1]) add(tube([[s * tw * 0.22, d.chestY + H * 0.075, td * 0.55 + H * 0.005], [s * sw * 0.3, d.shoulderY + H * 0.01, 0], [s * tw * 0.25, d.chestY + H * 0.06, -td * 0.52]], H * 0.008, 4), J.chest, o.overalls);
  }
  // aprons
  if (o.apron) {
    const ac = o.apron;
    const ap: ColorFn = (x, y, z, f) => {
      if (o.sawdust && fnoise(f, 19) < 0.18) return mix(ac, "#e9d8a6", 0.6);
      if (id === "mira_okafor" && fnoise(f, 20) < 0.15) return mix(ac, "#ffffff", 0.6);
      if (o.leatherApron && fnoise(f, 21) < 0.15) return shade(ac, 1.3);
      return ac;
    };
    const waistOnly = !!(o.barberApron || job === "cafe_owner" || job === "barista" || job === "store_clerk" || job === "innkeeper");
    const bibTop = o.leatherApron ? d.shoulderY - H * 0.04 : d.chestY + H * 0.05;
    const skirtHem = o.leatherApron || o.rubberApron ? d.kneeY - H * 0.02 : d.kneeY + H * 0.03;
    const aw = o.rubberApron || o.leatherApron ? tw * 0.9 * heavyK : tw * 0.78 * heavyK;
    const zf = td * 0.55 * heavyK + H * 0.012;
    if (!waistOnly) {
      add(box(aw * 0.72, bibTop - d.waistY, H * 0.01), J.spine, ap, [0, (bibTop + d.waistY) / 2, zf]);
      // straps over the shoulders
      for (const s of [-1, 1]) add(tube([[s * aw * 0.3, bibTop, zf], [s * sw * 0.28, d.shoulderY + H * 0.015, 0], [s * tw * 0.3, d.chestY, -td * 0.5]], H * 0.007, 4), J.chest, shade(ac, 0.8));
    }
    add(loft([{ y: skirtHem, w: aw * 1.05, d: H * 0.014, cut: 0.05, z: zf + H * 0.006 }, { y: d.waistY + H * 0.005, w: aw, d: H * 0.012, cut: 0.05, z: zf }]), J.hips, ap);
    // waist tie
    add(loft([{ y: d.waistY - H * 0.005, w: hipRing.w * 1.05 + H * 0.02, d: hipRing.d * 1.02 + H * 0.02, cut: 0.28 }, { y: d.waistY + H * 0.015, w: hipRing.w * 1.05 + H * 0.02, d: hipRing.d * 1.02 + H * 0.02, cut: 0.28 }], { top: false, bottom: false }), J.hips, shade(ac, 0.85));
    if (o.barberApron) add(box(H * 0.035, H * 0.045, H * 0.006), J.chest, "#f2f2f2", [-H * 0.045, d.chestY + H * 0.04, td * 0.55 + H * 0.01]); // breast pocket (comb)
    if (o.barberApron) add(box(H * 0.006, H * 0.04, H * 0.004), J.chest, "#1a1a1a", [-H * 0.04, d.chestY + H * 0.07, td * 0.55 + H * 0.014], [0, 0, 0.15]);
  }
  if (o.toolBelt) {
    add(loft([{ y: d.hipsY - H * 0.02, w: hipRing.w + H * 0.03, d: hipRing.d + H * 0.03, cut: 0.28 }, { y: d.hipsY + H * 0.015, w: hipRing.w + H * 0.03, d: hipRing.d + H * 0.03, cut: 0.28 }], { top: false, bottom: false }), J.hips, o.toolBelt);
    for (const s of [-1, 1]) add(bbox(H * 0.045, H * 0.06, H * 0.03), J.hips, shade(o.toolBelt, 1.15), [s * (hipRing.w / 2 + H * 0.01), d.hipsY - H * 0.045, H * 0.01]);
  }
  // hoodie hood behind the neck
  if (o.hoodie) add(loft([{ y: d.shoulderY - H * 0.02, w: sw * 0.7, d: H * 0.05, cut: 0.3, z: -td * 0.45 }, { y: d.neckY + H * 0.03, w: sw * 0.55, d: H * 0.06, cut: 0.3, z: -td * 0.4 }]), J.chest, shade(o.hoodie, 0.9));
  // epaulettes + buttons on the naval coat, gold band
  if (o.epaulettes) for (const s of [-1, 1]) add(box(H * 0.05, H * 0.012, H * 0.035), J.chest, o.epaulettes, [s * sw * 0.45, d.shoulderY + H * 0.015, 0], [0, 0, s * 0.15]);
  if (o.navalCoat || o.uniform && !o.postal && !o.navalCoat) for (const yy of [d.chestY - H * 0.04, d.chestY + H * 0.01, d.chestY + H * 0.06]) for (const s of [-1, 1]) add(sphere(H * 0.007, 5, 3), J.chest, o.navalCoat ? GOLD : STEEL, [s * H * 0.028, yy, td * 0.55 * heavyK + H * 0.01]);
  if (o.postal && o.trim) { add(loft([{ y: d.shoulderY - H * 0.035, w: sw * 0.97, d: td * 0.98 + H * 0.006, cut: 0.3 }, { y: d.shoulderY - H * 0.02, w: sw * 0.97, d: td * 0.98 + H * 0.006, cut: 0.3 }], { top: false, bottom: false }), J.chest, o.trim); for (const s of [-1, 1]) add(box(H * 0.012, H * 0.02, H * 0.006), J.chest, o.trim, [s * H * 0.03, d.shoulderY - H * 0.005, td * 0.5]); }
  // lace collar (beatrice) / white collar (agnes)
  if (o.lace || o.collar) add(loft([{ y: d.shoulderY - H * 0.005, w: sw * 0.62, d: td * 0.8, cut: 0.3 }, { y: d.shoulderY + H * 0.02, w: sw * 0.5, d: td * 0.65, cut: 0.32 }], { bottom: false, top: false }), J.chest, o.collar ?? WHITE);
  // shawl over the shoulders
  if (o.shawl) add(loft([{ y: d.chestY - H * 0.03, w: sw * 1.12, d: td * 1.3, cut: 0.3 }, { y: d.shoulderY + H * 0.01, w: sw * 0.8, d: td * 0.85, cut: 0.32 }], { bottom: false }), J.chest, o.shawl);
  // sash (mayor) across the chest, brooch
  if (o.sash) add(box(H * 0.045, H * 0.02, H * 0.012), J.chest, o.sash, [0, d.chestY + H * 0.01, td * 0.55 + H * 0.01], [0, 0, 0.8], [1, 13, 1]);
  if (o.brooch) add(sphere(H * 0.011, 6, 4), J.chest, o.brooch, [-H * 0.045, d.shoulderY - H * 0.03, td * 0.5 + H * 0.012]);
  // ties
  if (o.tie) { add(box(H * 0.016, H * 0.02, H * 0.008), J.chest, o.tie, [0, d.shoulderY - H * 0.015, td * 0.53 * heavyK + H * 0.008]); add(box(H * 0.02, H * 0.13, H * 0.006), J.chest, shade(o.tie, 0.95), [0, d.chestY + H * 0.005, td * 0.55 * heavyK + H * 0.008], [0.06, 0, 0]); }
  if (o.bowTie) for (const s of [-1, 1]) add(wedge(H * 0.03, H * 0.024, H * 0.01), J.chest, o.bowTie, [s * H * 0.014, d.shoulderY - H * 0.006, td * 0.52 + H * 0.01], [0, 0, s * Math.PI / 2]);
  if (o.pocketSquare) add(box(H * 0.022, H * 0.008, H * 0.006), J.chest, o.pocketSquare, [-H * 0.05, d.chestY + H * 0.055, td * 0.55 + H * 0.01]);
  if (o.watchChain) add(tube([[H * 0.005, d.chestY + H * 0.01, td * 0.55 * heavyK + H * 0.016], [H * 0.035, d.chestY - H * 0.025, td * 0.55 * heavyK + H * 0.018], [H * 0.06, d.chestY + H * 0.005, td * 0.5 * heavyK + H * 0.016]], H * 0.004, 4), J.spine, o.watchChain);
  // scarf / bandana at the neck
  if (o.scarf) { add(loft([{ y: d.shoulderY - H * 0.01, w: sw * 0.62, d: td * 0.82, cut: 0.3 }, { y: d.neckY + H * 0.02, w: sw * 0.5, d: td * 0.66, cut: 0.32 }], { bottom: false, top: false }), J.chest, o.scarf); add(box(H * 0.035, H * 0.12, H * 0.012), J.chest, o.scarf, [H * 0.03, d.chestY + H * 0.02, td * 0.55 + H * 0.012], [0, 0, -0.12]); }
  if (o.bandana && (id === "tomas_reyes")) add(loft([{ y: d.shoulderY - H * 0.012, w: sw * 0.58, d: td * 0.78, cut: 0.3 }, { y: d.neckY + H * 0.01, w: sw * 0.45, d: td * 0.62, cut: 0.32 }], { bottom: false, top: false }), J.chest, o.bandana);
  if (o.bandana && id === "tomas_reyes") add(wedge(H * 0.05, H * 0.06, H * 0.008), J.chest, o.bandana, [0, d.shoulderY - H * 0.07, td * 0.55 + H * 0.008], [Math.PI, 0, 0]);
  // lanyard + card
  if (o.lanyard) { for (const s of [-1, 1]) add(tube([[s * H * 0.035, d.shoulderY - H * 0.01, td * 0.5 + H * 0.012], [0, d.chestY - H * 0.02, td * 0.55 * heavyK + H * 0.014]], H * 0.0035, 4), J.chest, o.lanyard); add(box(H * 0.028, H * 0.036, H * 0.005), J.chest, WHITE, [0, d.chestY - H * 0.04, td * 0.55 * heavyK + H * 0.014]); }
  // badge on the uniform
  if (o.badge) add(cyl(H * 0.011, H * 0.011, H * 0.006, 6), J.chest, o.badge, [-H * 0.05, d.chestY + H * 0.05, td * 0.55 * heavyK + H * 0.008], [Math.PI / 2, 0, 0]);
  // stethoscope: tube round the neck, chest piece
  if (o.stethoscope) { add(tube([[-H * 0.04, d.neckY + H * 0.01, td * 0.15], [-H * 0.05, d.chestY + H * 0.05, td * 0.55 + H * 0.02], [-H * 0.02, d.chestY - H * 0.02, td * 0.55 + H * 0.02]], H * 0.005, 4), J.chest, o.stethoscope); add(tube([[H * 0.04, d.neckY + H * 0.01, td * 0.15], [H * 0.05, d.chestY + H * 0.05, td * 0.55 + H * 0.02], [H * 0.02, d.chestY - H * 0.02, td * 0.55 + H * 0.02]], H * 0.005, 4), J.chest, o.stethoscope); add(loft([{ y: -H * 0.015, w: H * 0.03, d: H * 0.03, cut: 0.3 }, { y: H * 0.015, w: H * 0.03, d: H * 0.03, cut: 0.3 }]), J.chest, STEEL, [0, d.chestY - H * 0.02, td * 0.55 + H * 0.02], [0, 0, 0]); add(tube([[-H * 0.04, d.neckY + H * 0.012, td * 0.15], [0, d.neckY + H * 0.018, -td * 0.4], [H * 0.04, d.neckY + H * 0.012, td * 0.15]], H * 0.005, 4), J.chest, o.stethoscope); }
  // measuring tape round the neck
  if (o.measuringTape) { add(tube([[-H * 0.035, d.chestY - H * 0.04, td * 0.55 + H * 0.02], [-H * 0.045, d.neckY + H * 0.01, td * 0.2], [0, d.neckY + H * 0.02, -td * 0.42], [H * 0.045, d.neckY + H * 0.01, td * 0.2], [H * 0.035, d.chestY - H * 0.06, td * 0.55 + H * 0.02]], H * 0.007, 4), J.chest, (x, y, z, f) => (fnoise(f, 22) < 0.3 ? "#222" : o.measuringTape!)); }
  // towel over the shoulder
  if (o.towelOnShoulder) add(box(H * 0.06, H * 0.15, H * 0.02), J.chest, o.towelOnShoulder, [sw * 0.42, d.shoulderY - H * 0.05, 0], [0, 0, -0.1]);
  // headphones round the neck
  if (o.headphones) { add(torus(H * 0.05, H * 0.008, 10, 4), J.chest, o.headphones, [0, d.neckY + H * 0.005, td * 0.05], [Math.PI / 2 + 0.3, 0, 0]); for (const s of [-1, 1]) add(cyl(H * 0.02, H * 0.02, H * 0.014, 8), J.chest, shade(o.headphones, 0.8), [s * H * 0.05, d.shoulderY - H * 0.01, td * 0.35], [0, 0, Math.PI / 2]); }
  // necklace with pendant
  if (o.necklace || o.pendant) { add(tube([[-H * 0.03, d.neckY, td * 0.25], [0, d.shoulderY - H * 0.04, td * 0.55 + H * 0.01], [H * 0.03, d.neckY, td * 0.25]], H * 0.003, 4), J.chest, o.necklace ?? o.pendant!); add(o.pendant ? box(H * 0.012, H * 0.016, H * 0.004) : sphere(H * 0.007, 5, 3), J.chest, o.pendant ?? o.necklace!, [0, d.shoulderY - H * 0.045, td * 0.55 + H * 0.012]); }
  // keys on the waist
  if (o.keys) { add(torus(H * 0.014, H * 0.003, 8, 4), J.hips, o.keys, [d.hipW * 0.58, d.hipsY - H * 0.01, td * 0.25]); for (let i = 0; i < 3; i++) add(box(H * 0.005, H * 0.03, H * 0.003), J.hips, o.keys, [d.hipW * 0.58 + (i - 1) * H * 0.008, d.hipsY - H * 0.035, td * 0.25 + (i - 1) * H * 0.002]); }
  // rag in the back pocket
  if (o.rag) add(box(H * 0.04, H * 0.06, H * 0.012), J.hips, o.rag, [d.hipW * 0.35, d.hipsY - H * 0.05, -td * 0.55], [0.1, 0, 0.2]);
  // backpack / totebag / duffel / post bag / guitar / rope on the back
  if (o.backpack) { add(bbox(sw * 0.62, H * 0.17, H * 0.07), J.chest, o.backpack, [0, d.chestY, -td * 0.55 - H * 0.035]); for (const s of [-1, 1]) add(tube([[s * sw * 0.25, d.shoulderY + H * 0.01, -td * 0.2], [s * sw * 0.25, d.chestY - H * 0.05, td * 0.5]], H * 0.008, 4), J.chest, shade(o.backpack, 0.7)); add(bbox(sw * 0.4, H * 0.05, H * 0.03), J.chest, shade(o.backpack, 0.8), [0, d.chestY - H * 0.04, -td * 0.55 - H * 0.075]); }
  if (o.totebag) { add(bbox(H * 0.1, H * 0.13, H * 0.035), J.hips, o.totebag, [-d.hipW * 0.62 - H * 0.02, d.hipsY - H * 0.02, 0]); add(tube([[-d.hipW * 0.62 - H * 0.03, d.hipsY + H * 0.04, 0], [-sw * 0.42, d.shoulderY + H * 0.02, 0]], H * 0.006, 4), J.chest, shade(o.totebag, 0.8)); }
  if (o.duffel) { add(cyl(H * 0.06, H * 0.06, H * 0.22, 8), J.chest, o.duffel, [sw * 0.28, d.chestY - H * 0.02, -td * 0.7], [0.3, 0, 1.1]); add(tube([[sw * 0.2, d.shoulderY + H * 0.01, -td * 0.3], [-sw * 0.15, d.chestY - H * 0.06, td * 0.55]], H * 0.007, 4), J.chest, shade(o.duffel, 0.7)); }
  if (o.bag) { add(bbox(H * 0.12, H * 0.1, H * 0.045), J.hips, o.bag, [d.hipW * 0.6 + H * 0.02, d.hipsY, H * 0.01]); add(box(H * 0.12, H * 0.04, H * 0.048), J.hips, shade(o.bag, 0.75), [d.hipW * 0.6 + H * 0.02, d.hipsY + H * 0.04, H * 0.01]); add(box(H * 0.018, H * 0.02, H * 0.012), J.chest, o.bag, [-sw * 0.3, d.shoulderY, td * 0.2], [0, 0, 0.9], [1, 14, 1]); }
  if (o.guitar) {
    const gc = o.guitar;
    add(loft([{ y: -H * 0.012, w: H * 0.13, d: H * 0.16, cut: 0.4 }, { y: H * 0.012, w: H * 0.13, d: H * 0.16, cut: 0.4 }]), J.chest, gc, [0, d.chestY - H * 0.06, -td * 0.55 - H * 0.03], [Math.PI / 2, 0, 0.35]);
    add(loft([{ y: -H * 0.012, w: H * 0.1, d: H * 0.12, cut: 0.4 }, { y: H * 0.012, w: H * 0.1, d: H * 0.12, cut: 0.4 }]), J.chest, gc, [-H * 0.03, d.chestY + H * 0.02, -td * 0.55 - H * 0.03], [Math.PI / 2, 0, 0.35]);
    add(cyl(H * 0.02, H * 0.02, H * 0.01, 8), J.chest, "#2a1a10", [-H * 0.01, d.chestY - H * 0.02, -td * 0.55 - H * 0.045], [Math.PI / 2, 0, 0]);
    add(box(H * 0.022, H * 0.25, H * 0.012), J.chest, DARKWOOD, [-H * 0.075, d.shoulderY + H * 0.08, -td * 0.55 - H * 0.03], [0, 0, 0.35]);
    add(tube([[-sw * 0.3, d.shoulderY + H * 0.01, -td * 0.2], [sw * 0.3, d.chestY - H * 0.08, td * 0.5]], H * 0.007, 4), J.chest, "#3a2a1e");
  }
  if (id === "tunde_okafor") add(torus(H * 0.075, H * 0.018, 10, 5), J.chest, "#c9b48a", [-sw * 0.42, d.chestY + H * 0.02, 0], [0, 0.1, 0.35]);
  if (id === "lakshmi_rao") add(bbox(H * 0.02, H * 0.13, H * 0.1), J.spine, "#5a3a2a", [-tw * 0.55 - H * 0.02, d.chestY - H * 0.02, 0]);
  if (id === "sigrid_vale") add(bbox(H * 0.03, H * 0.11, H * 0.085), J.spine, (x, y, z, f) => ["#d94a4a", "#3a6ab0", "#d9b26a"][Math.floor(fnoise(f, 23) * 3)], [-tw * 0.55 - H * 0.02, d.chestY - H * 0.02, 0]);
  if (id === "kofi_mensah") add(box(H * 0.035, H * 0.5, H * 0.012), J.chest, (x, y, z, f) => (fnoise(f, 24) < 0.3 ? "#c9a06a" : WOOD), [-sw * 0.38, d.shoulderY + H * 0.06, -H * 0.01], [0.2, 0, -0.25]);
  if (id === "bakary_diallo") { add(bbox(H * 0.2, H * 0.09, H * 0.13), J.chest, (x, y, z, f) => (fnoise(f, 25) < 0.15 ? "#c9c9c9" : "#bcbfc4"), [-sw * 0.5, d.shoulderY + H * 0.07, 0]); add(box(H * 0.06, H * 0.02, H * 0.03), J.chest, "#4a8ab0", [-sw * 0.5, d.shoulderY + H * 0.12, H * 0.02]); }

  /* ------------------------------------------------------------ arms */
  const gloves = o.gloves;
  const sleeveC = o.sleeveless ? undefined : (outer ?? (o.shirt ?? o.top));
  const rolled = o.sleeves === "rolled" || o.sleeveless || (!!o.tattoo && !o.sweater); // a tattoo needs a bare forearm to show
  const bare = o.sleeveless;
  const sleeveBig = o.tooBig ? 1.35 : 1;
  const forePaint: Paint = (x, y, z, f) => {
    if (o.tattoo && rolled && fnoise(f, 26) < 0.45) return o.tattoo;
    return skin;
  };
  for (const side of [-1, 1]) {
    const ub = side < 0 ? J.uArmL : J.uArmR, fb = side < 0 ? J.fArmL : J.fArmR, hb = side < 0 ? J.handL : J.handR;
    const S = R[ub], E = R[fb], W = R[hb];
    const ar = d.armR;
    const uc: Paint = bare ? skin : o.plaid && o.overalls ? (x, y) => plaidAt(x, y, o.shirt ?? o.top, o.plaid!) : o.plaid ? (x, y) => plaidAt(x, y, base, o.plaid!) : (sleeveC ?? skin);
    // shoulder cap + upper arm
    add(loft([{ y: E.y - H * 0.005, w: ar * 1.75 * sleeveBig, d: ar * 1.75 * sleeveBig, cut: 0.3 }, { y: S.y - H * 0.02, w: ar * 2.0 * sleeveBig, d: ar * 2.0 * sleeveBig, cut: 0.3 }, { y: S.y + H * 0.02, w: ar * 2.05 * (bare ? 0.9 : 1), d: ar * 2.05 * (bare ? 0.9 : 1), cut: 0.32 }]), ub, bare ? skin : uc, [S.x + side * ar * 0.25, 0, 0]);
    // forearm: sleeve or skin (rolled)
    const fc: Paint = rolled ? forePaint : o.tooBig ? (sleeveC ?? skin) : (sleeveC ?? skin);
    const fLen = o.tooBig ? d.fArm + d.hand * 0.6 : d.fArm;
    add(loft([{ y: E.y - fLen + H * 0.005, w: ar * 1.45 * (o.tooBig ? 1.5 : 1), d: ar * 1.45 * (o.tooBig ? 1.5 : 1), cut: 0.3 }, { y: E.y - H * 0.005, w: ar * 1.7 * sleeveBig, d: ar * 1.7 * sleeveBig, cut: 0.3 }, { y: E.y + H * 0.01, w: ar * 1.75 * sleeveBig, d: ar * 1.75 * sleeveBig, cut: 0.3 }]), fb, fc, [S.x + side * ar * 0.25, 0, 0]);
    // cuff of a rolled sleeve
    if (o.sleeves === "rolled" && sleeveC) add(loft([{ y: E.y - H * 0.02, w: ar * 1.85, d: ar * 1.85, cut: 0.3 }, { y: E.y + H * 0.005, w: ar * 1.9, d: ar * 1.9, cut: 0.3 }], { top: false, bottom: false }), fb, shade(sleeveC, 0.9), [S.x + side * ar * 0.25, 0, 0]);
    // hand (mitten block)
    if (!o.tooBig) add(bbox(ar * 1.35, d.hand, ar * 1.0, ar * 0.3), hb, gloves ?? skin, [S.x + side * ar * 0.25, W.y - d.hand * 0.45, 0]);
    if (o.rings && !gloves) add(box(ar * 0.35, H * 0.005, ar * 1.05), hb, GOLD, [S.x + side * ar * 0.25 - side * ar * 0.2, W.y - d.hand * 0.3, 0]);
    if (o.bangles) for (let i = 0; i < 3; i++) add(torus(ar * 1.05, H * 0.004, 8, 4), fb, o.bangles, [S.x + side * ar * 0.25, W.y + H * 0.012 + i * H * 0.012, 0], [Math.PI / 2, 0, 0]);
    if (o.watch && side > 0) add(box(ar * 1.85, H * 0.012, ar * 1.85), fb, o.watch, [S.x + side * ar * 0.25, W.y + H * 0.02, 0]);
    if (o.pinCushion && side < 0) add(sphere(H * 0.016, 6, 4), fb, o.pinCushion, [S.x + side * ar * 0.25 - ar * 0.9, W.y + H * 0.02, 0]);
  }

  /* ------------------------------------------------------------ neck + head + face */
  add(loft([{ y: d.shoulderY - H * 0.01, w: d.headW * 0.42, d: d.headW * 0.42, cut: 0.3 }, { y: d.headY + H * 0.01, w: d.headW * 0.4, d: d.headW * 0.4, cut: 0.3 }]), J.neck, skin);
  add(loft(headRings(1, 0)), J.head, skinPaint);
  /** z of the face surface at a head height fraction t */
  const faceAt = (t: number) => (d.headD / 2) * headRings(1, t, t)[0].d / d.headD;
  const tEye = 0.5;
  const eyeY = d.headY + d.headH * tEye, eyeX = d.headW * 0.2;
  const faceZ = faceAt(tEye);
  const eyeR = d.headW * 0.105 * (a.age === "elder" || a.age === "senior" ? 0.9 : a.age === "young" ? 1.05 : 1);
  for (const s of [-1, 1]) {
    add(sphere(eyeR, 8, 6), J.head, WHITE, [s * eyeX, eyeY, faceZ - eyeR * 0.3], undefined, [1, 1, 0.75]);
    add(sphere(eyeR * 0.5, 7, 5), J.head, eyeC, [s * eyeX, eyeY - eyeR * 0.05, faceZ + eyeR * 0.28], undefined, [1, 1, 0.55]);
    add(sphere(eyeR * 0.24, 5, 4), J.head, "#0a0806", [s * eyeX, eyeY - eyeR * 0.05, faceZ + eyeR * 0.5]);
    // brow
    add(box(eyeR * 2.1, eyeR * 0.4, eyeR * 0.5), J.head, hair.style === "bald" ? shade(skin, 0.65) : shade(hairC, 0.9), [s * eyeX, eyeY + eyeR * 1.3, faceAt(0.62) - eyeR * 0.05], [0.25, 0, s * (a.age === "young" ? 0.06 : 0.14)]);
    // ear
    add(sphere(d.headW * 0.1, 6, 4), J.head, skin, [s * (d.headW * 0.5), eyeY - eyeR * 0.4, -d.headD * 0.02], undefined, [0.5, 1.15, 0.85]);
  }
  // nose wedge, mouth
  const noseY = d.headY + d.headH * 0.385;
  add(wedge(d.headW * 0.2, d.headD * 0.15, d.headH * 0.13, d.headH * 0.035), J.head, shade(skin, 0.93), [0, noseY, faceAt(0.385) - d.headD * 0.03], [Math.PI / 2, 0, 0]);
  const mouthW = d.headW * (id === "tomas_reyes" ? 0.4 : a.age === "young" ? 0.26 : 0.3), mouthY = d.headY + d.headH * 0.215; // "big grin"
  const beardShell = a.facialHair === "stubble" || a.facialHair === "beard-short";
  const mouthZ = faceAt(0.215) + d.headD * (beardShell ? 0.035 : 0.012);
  if (a.facialHair !== "beard-full" && a.facialHair !== "beard-grey") add(box(mouthW, d.headH * 0.04, d.headD * 0.035), J.head, lipC, [0, mouthY, mouthZ], [0.25, 0, 0]);
  // age lines: faint lower-eye shadow for seniors/elders
  if (a.age === "elder" || a.age === "senior") for (const s of [-1, 1]) add(box(eyeR * 1.5, eyeR * 0.25, eyeR * 0.25), J.head, mix(skin, faceDark, 0.5), [s * eyeX, eyeY - eyeR * 1.1, faceAt(0.4) - eyeR * 0.05]);
  if (o.nosePin) add(sphere(H * 0.0045, 5, 3), J.head, GOLD, [-d.headW * 0.09, noseY - d.headH * 0.03, faceAt(0.36) + d.headD * 0.07]);
  // earrings
  if (o.earrings) for (const s of [-1, 1]) {
    const ec = o.earrings === "gold" ? GOLD : o.earrings === "hoops" ? "#e8c56a" : STEEL;
    if (o.earrings === "hoops") add(torus(d.headW * 0.08, H * 0.004, 8, 4), J.head, ec, [s * d.headW * 0.5, eyeY - eyeR * 1.8, -d.headD * 0.02], [0, Math.PI / 2, 0]);
    else if (o.earrings === "many") for (let i = 0; i < 3; i++) add(sphere(H * 0.0045, 5, 3), J.head, ec, [s * d.headW * 0.54, eyeY - eyeR * (0.7 + i * 0.45), -d.headD * 0.05 + i * H * 0.004]);
    else add(sphere(H * 0.008, 5, 3), J.head, ec, [s * d.headW * 0.52, eyeY - eyeR * 1.7, -d.headD * 0.02]);
  }
  // pencil / pen behind the ear
  if (o.pencilBehindEar || o.notebook || id === "priya_nair") add(cyl(H * 0.004, H * 0.004, H * 0.08, 5), J.head, o.pencilBehindEar ? "#e8b23c" : "#2a3a6b", [d.headW * 0.54, eyeY - eyeR * 0.2, -d.headD * 0.1], [0.9, 0, 0.25]);

  /* ------------------------------------------------------------ facial hair */
  const fh = a.facialHair;
  const beardC = fh === "beard-grey" ? (hair.color === "white" ? "#e6e2da" : "#bdb8b0") : shade(hairC, 0.95);
  const jawY = d.headY + d.headH * 0.12;
  const lipZ = faceAt(0.28);
  if (fh === "stubble") add(loft(headRings(1.015, 0.0, 0.36, 0)), J.head, (x, y, z) => (z > -d.headD * 0.05 && y < d.headY + d.headH * 0.38 && !(y > mouthY - d.headH * 0.05 && Math.abs(x) < mouthW * 0.55 && z > faceZ * 0.7) ? mix(skin, hairC, 0.35) : skin));
  if (fh === "moustache") {
    const thin = id === "sal_romano";
    add(box(d.headW * (thin ? 0.32 : 0.46), d.headH * (thin ? 0.035 : 0.09), d.headD * 0.08), J.head, hair.color === "white" ? "#e6e2da" : shade(hairC, 0.95), [0, mouthY + d.headH * (thin ? 0.055 : 0.07), lipZ + d.headD * 0.02], [0.25, 0, 0]);
    if (!thin) for (const s of [-1, 1]) add(box(d.headW * 0.12, d.headH * 0.06, d.headD * 0.07), J.head, shade(hairC, 0.95), [s * d.headW * 0.27, mouthY + d.headH * 0.04, lipZ - d.headD * 0.01], [0.25, 0, s * -0.5]);
  }
  if (fh === "goatee") { add(box(d.headW * 0.22, d.headH * 0.14, d.headD * 0.1), J.head, beardC, [0, d.headY + d.headH * 0.07, faceAt(0.08) - d.headD * 0.03], [0.3, 0, 0]); add(box(d.headW * 0.38, d.headH * 0.045, d.headD * 0.07), J.head, beardC, [0, mouthY + d.headH * 0.065, lipZ + d.headD * 0.015], [0.25, 0, 0]); }
  if (fh === "beard-short") { add(loft(headRings(1.035, -0.06, 0.34, -d.headD * 0.015)), J.head, (x, y, z) => ((z > -d.headD * 0.1 && y < jawY + d.headH * 0.1) || (Math.abs(x) > d.headW * 0.36 && z > -d.headD * 0.1) ? beardC : skin)); add(box(d.headW * 0.42, d.headH * 0.05, d.headD * 0.08), J.head, beardC, [0, mouthY + d.headH * 0.065, lipZ + d.headD * 0.015], [0.25, 0, 0]); }
  if (fh === "beard-full" || fh === "beard-grey") {
    const big = id === "jonah_kowalski" || id === "hamish_mcbride" || id === "bjorn_halvorsen";
    const len = big ? d.headH * (id === "jonah_kowalski" ? 0.7 : 0.55) : d.headH * 0.3;
    const wild = hair.wild;
    add(loft([
      { y: jawY - len, w: d.headW * (big ? 0.7 : 0.5), d: d.headD * 0.35, cut: 0.3, z: d.headD * 0.2 },
      { y: jawY - len * 0.5, w: d.headW * (big ? 0.95 : 0.8), d: d.headD * 0.6, cut: 0.3, z: d.headD * 0.12 },
      { y: jawY + d.headH * 0.05, w: d.headW * 1.05, d: d.headD * 0.97, cut: 0.28, z: 0.0 },
      { y: d.headY + d.headH * 0.4, w: d.headW * 1.06, d: d.headD * 1.04, cut: 0.28, z: 0 },
    ]), J.head, (x, y, z, f) => (z < -d.headD * 0.12 && y > jawY ? skin : wild && fnoise(f, 27) < 0.3 ? shade(beardC, 0.9) : beardC));
    add(box(d.headW * 0.44, d.headH * 0.07, d.headD * 0.1), J.head, beardC, [0, mouthY + d.headH * 0.07, lipZ + d.headD * 0.04], [0.25, 0, 0]);
    add(box(mouthW * 0.8, d.headH * 0.028, d.headD * 0.04), J.head, "#3a1f1a", [0, mouthY, mouthZ + d.headD * 0.045]);
    if (wild) for (let i = 0; i < 6; i++) add(wedge(d.headW * 0.1, d.headH * 0.16, d.headW * 0.08), J.head, beardC, [(fnoise(i, 28) - 0.5) * d.headW * 0.9, jawY - len * (0.3 + fnoise(i, 29) * 0.6), d.headD * 0.3 + fnoise(i, 30) * d.headD * 0.1], [Math.PI / 2 + (fnoise(i, 31) - 0.5), 0, (fnoise(i, 32) - 0.5) * 1.2]);
  }

  /* ------------------------------------------------------------ hair */
  const hp = hairPaint(hairC);
  const topY = d.headY + d.headH;
  const T_LINE = 0.63; // hairline height fraction
  /**
   * One continuous hair shell: below the hairline the front is recessed (inside the face)
   * so hair frames the face from the sides/back; above it the shell is proud of the skull.
   */
  const shellRings = (opt: { bottom?: number; scale?: number; front?: number; taper?: number; top?: number; openTop?: boolean; fringe?: number } = {}): Ring[] => {
    const scale = opt.scale ?? 1.1, front = (opt.front ?? 0.4) * d.headD, taper = opt.taper ?? 1, tTop = opt.top ?? 1, bottom = opt.bottom ?? eyeY - eyeR * 0.6;
    const back = -d.headD * 0.5 * scale - d.headD * 0.02;
    const low = (y: number, k: number): Ring => ({ y, w: d.headW * scale * k, d: front - back, cut: 0.3, z: (front + back) / 2 });
    const rings: Ring[] = [];
    if (bottom < d.headY + d.headH * 0.5) rings.push(low(bottom, taper));
    rings.push(low(d.headY + d.headH * 0.5, 1));
    rings.push(low(d.headY + d.headH * T_LINE, 1));
    // above the hairline: skull rings scaled, with a small ledge (fringe) at the front
    const fr = opt.fringe ?? 0.012;
    const upper = headRings(scale, T_LINE + 0.03, tTop, 0);
    upper[0] = { ...upper[0], d: upper[0].d + d.headD * fr, z: d.headD * fr * 0.5 };
    rings.push(...upper);
    return rings;
  };
  const shell = (opt: Parameters<typeof shellRings>[0] = {}) => loft(shellRings(opt), { bottom: false, top: !opt.openTop });
  const tuft = (bone: number, x: number, y: number, z: number, rx: number, rz: number, s = 1, c: Paint = hp) => add(wedge(d.headW * 0.18 * s, d.headH * 0.22 * s, d.headW * 0.14 * s), bone, c, [x, y, z], [rx, 0, rz]);
  let hairTop = topY;
  const st = hair.style;
  const skinTint = (x: number, y: number, z: number, f: number) => mix(skin, hp(x, y, z, f, _n0) as string, 0.72);
  switch (st) {
    case "bald": break;
    case "buzz": add(shell({ scale: 1.03, front: 0.4, fringe: 0.004 }), J.head, skinTint); hairTop = topY + d.headH * 0.03; break;
    case "cropped": add(shell({ scale: 1.06, fringe: 0.008 }), J.head, hp); hairTop = topY + d.headH * 0.06; break;
    case "short": {
      const sc = hair.thick ? 1.15 : 1.1;
      add(shell({ scale: sc, bottom: eyeY - eyeR * 0.9 }), J.head, hair.thinning ? (x, y, z, f) => (y > topY - d.headH * 0.1 && fnoise(f, 37) < 0.45 ? skin : hp(x, y, z, f, _n0)) : hp);
      if (hair.messy || hair.unkempt) for (let i = 0; i < 6; i++) tuft(J.head, (fnoise(i, 33) - 0.5) * d.headW * 0.9, topY + d.headH * 0.04, (fnoise(i, 34) - 0.6) * d.headD * 0.6, (fnoise(i, 35) - 0.5) * 1.4, (fnoise(i, 36) - 0.5) * 1.6, 0.55);
      hairTop = topY + d.headH * (sc - 1) + d.headH * 0.02; break;
    }
    case "balding": {
      // horseshoe: hair round the sides and back, bare crown (the shell stops at t≈0.84, front always recessed)
      add(loft([
        { y: eyeY - eyeR * 0.6, w: d.headW * 1.07, d: d.headD * 0.78, cut: 0.3, z: -d.headD * 0.2 },
        { y: d.headY + d.headH * 0.6, w: d.headW * 1.08, d: d.headD * 0.8, cut: 0.3, z: -d.headD * 0.21 },
        { y: d.headY + d.headH * 0.8, w: d.headW * 1.03, d: d.headD * 0.76, cut: 0.3, z: -d.headD * 0.23 },
        { y: d.headY + d.headH * 0.86, w: d.headW * 0.8, d: d.headD * 0.6, cut: 0.32, z: -d.headD * 0.26 },
      ], { bottom: false }), J.head, hp);
      if (hair.sideParting) add(loft([{ y: topY - d.headH * 0.12, w: d.headW * 0.6, d: d.headD * 0.75, cut: 0.3, x: -d.headW * 0.22, z: -d.headD * 0.05 }, { y: topY + d.headH * 0.02, w: d.headW * 0.55, d: d.headD * 0.7, cut: 0.3, x: -d.headW * 0.25, z: -d.headD * 0.05 }], { bottom: false }), J.head, hp);
      if (hair.wisps && !o.hat && !o.cap) for (let i = 0; i < 4; i++) add(tube([[(i - 1.5) * d.headW * 0.18, topY - d.headH * 0.02, d.headD * 0.05], [(i - 1.5) * d.headW * 0.22, topY + d.headH * 0.14, -d.headD * 0.1 + (fnoise(i, 38) - 0.5) * d.headD * 0.3]], H * 0.003, 3), J.head, hairC);
      hairTop = topY + d.headH * 0.03; break;
    }
    case "slicked": {
      add(shell({ scale: 1.05, front: 0.22, fringe: 0.004 }), J.head, (x, y, z, f) => (y > topY - d.headH * 0.05 && z > -d.headD * 0.2 && fnoise(f, 70) < 0.3 ? shade(hairC, 1.5) : hp(x, y, z, f, _n0)));
      if (hair.pompadour) add(loft([{ y: topY - d.headH * 0.18, w: d.headW * 0.95, d: d.headD * 0.55, cut: 0.3, z: d.headD * 0.2 }, { y: topY + d.headH * 0.12, w: d.headW * 0.9, d: d.headD * 0.6, cut: 0.32, z: d.headD * 0.25 }, { y: topY + d.headH * 0.22, w: d.headW * 0.55, d: d.headD * 0.35, cut: 0.35, z: d.headD * 0.22 }]), J.head, hp);
      hairTop = topY + d.headH * (hair.pompadour ? 0.22 : 0.06); break;
    }
    case "bun": {
      add(shell({ scale: 1.07, front: 0.22 }), J.head, hp);
      const low = hair.loose;
      add(sphere(d.headW * (hair.tight ? 0.25 : 0.31), 8, 6), J.head, hp, [0, low ? d.headY + d.headH * 0.45 : topY - d.headH * 0.02, -d.headD * 0.62]);
      if (hair.loose) for (let i = 0; i < 3; i++) add(tube([[(i - 1) * d.headW * 0.25, d.headY + d.headH * 0.4, -d.headD * 0.45], [(i - 1) * d.headW * 0.35, d.headY + d.headH * 0.15, -d.headD * 0.35]], H * 0.005, 4), J.head, hairC);
      hairTop = topY + d.headH * 0.08; break;
    }
    case "tied": {
      add(shell({ scale: 1.06, front: 0.22 }), J.head, hp);
      add(sphere(d.headW * 0.23, 7, 5), J.head, hp, [0, hair.lowBun ? d.headY + d.headH * 0.28 : d.headY + d.headH * 0.55, -d.headD * 0.6]);
      hairTop = topY + d.headH * 0.06; break;
    }
    case "ponytail": {
      add(shell({ scale: 1.08, front: 0.25 }), J.head, hp);
      const py = hair.high ? topY - d.headH * 0.02 : d.headY + d.headH * 0.32;
      const len = hair.high ? d.headH * 1.0 : d.headH * 0.85;
      add(sphere(d.headW * 0.14, 6, 4), J.head, shade(hairC, 0.8), [0, py, -d.headD * 0.56]);
      add(loft([{ y: py - len, w: d.headW * 0.12, d: d.headW * 0.12, cut: 0.3, z: -d.headD * 0.72 }, { y: py - len * 0.5, w: d.headW * 0.3, d: d.headW * 0.24, cut: 0.3, z: -d.headD * 0.75 }, { y: py, w: d.headW * 0.24, d: d.headW * 0.22, cut: 0.3, z: -d.headD * 0.62 }]), J.head, hp);
      hairTop = topY + d.headH * 0.08; break;
    }
    case "braids": {
      add(shell({ scale: 1.08, front: 0.36, bottom: eyeY - eyeR * 0.3 }), J.head, (x, y, z, f) => (y > d.headY + d.headH * T_LINE && fnoise(f, 39) < 0.3 ? shade(hairC, 1.6) : hp(x, y, z, f, _n0)));
      if (hair.single) {
        const y0 = d.headY + d.headH * 0.5;
        add(loft([{ y: y0 - H * 0.42, w: d.headW * 0.1, d: d.headW * 0.1, cut: 0.3, z: -d.headD * 0.55 }, { y: y0 - H * 0.2, w: d.headW * 0.2, d: d.headW * 0.18, cut: 0.3, z: -d.headD * 0.62 }, { y: y0, w: d.headW * 0.24, d: d.headW * 0.22, cut: 0.3, z: -d.headD * 0.6 }]), J.head, (x, y) => (Math.abs(Math.sin((y) / H * 140)) > 0.8 ? shade(hairC, 1.6) : hairC));
        if (hair.jasmine) for (let i = 0; i < 5; i++) add(sphere(H * 0.007, 5, 3), J.head, hair.jasmine, [(fnoise(i, 40) - 0.5) * d.headW * 0.3, y0 - i * H * 0.02, -d.headD * 0.62 - H * 0.01]);
      } else {
        const n = 9;
        for (let i = 0; i < n; i++) {
          const ang = -Math.PI * 0.85 + (i / (n - 1)) * Math.PI * 1.7;
          const x = Math.sin(ang) * d.headW * 0.55, z = -Math.cos(ang) * d.headD * 0.52 - d.headD * 0.05;
          const y0 = d.headY + d.headH * (0.45 + 0.15 * Math.abs(Math.cos(ang)));
          const len = H * (0.2 + fnoise(i, 41) * 0.05);
          add(tube([[x, y0, z], [x * 1.15, y0 - len, z * 1.1 - d.headD * 0.05]], d.headW * 0.05, 4), J.head, (px, py) => (hair.tips && py < y0 - len * 0.78 ? hair.tips : hairC));
        }
      }
      hairTop = topY + d.headH * 0.08; break;
    }
    case "locs": {
      add(shell({ scale: 1.1, front: 0.36 }), J.head, hp);
      if (hair.upTwist) {
        for (let i = 0; i < 10; i++) { const ang = (i / 10) * Math.PI * 2; const r = d.headW * (0.12 + fnoise(i, 42) * 0.2); add(tube([[Math.cos(ang) * r, topY - d.headH * 0.02, Math.sin(ang) * r - d.headD * 0.05], [Math.cos(ang) * r * 1.6, topY + d.headH * (0.32 + fnoise(i, 43) * 0.2), Math.sin(ang) * r * 1.6 - d.headD * 0.05]], d.headW * 0.05, 4), J.head, hairC); }
        add(torus(d.headW * 0.3, d.headW * 0.06, 10, 5), J.head, hairC, [0, topY + d.headH * 0.06, -d.headD * 0.05], [Math.PI / 2, 0, 0]);
        hairTop = topY + d.headH * 0.5;
      } else {
        for (let i = 0; i < 14; i++) { const ang = -Math.PI * 0.9 + (i / 13) * Math.PI * 1.8; const x = Math.sin(ang) * d.headW * 0.56, z = -Math.cos(ang) * d.headD * 0.5; add(tube([[x, d.headY + d.headH * 0.65, z], [x * 1.1, d.headY + d.headH * 0.65 - H * 0.16, z * 1.05]], d.headW * 0.05, 4), J.head, hairC); }
        hairTop = topY + d.headH * 0.1;
      }
      break;
    }
    case "afro": {
      const big = !hair.short;
      const r = d.headW * (big ? 0.88 : 0.74);
      add(shell({ scale: 1.03, front: 0.4 }), J.head, hp);
      add(ico(r, 1), J.head, (x, y, z, f) => (hair.dye && fnoise(f, 44) < 0.45 ? mix(hairC, hair.dye, 0.7) : hairC), [0, d.headY + d.headH * (big ? 1.0 : 0.95), -d.headD * 0.04], undefined, [1.05, 0.92, 1]);
      hairTop = d.headY + d.headH * (big ? 1.0 : 0.95) + r * 0.92; break;
    }
    case "bob": {
      add(shell({ scale: 1.14, front: 0.44, bottom: d.headY + d.headH * (hair.sharp ? 0.08 : 0.14), taper: 1.06 }), J.head, hp);
      // fringe
      add(box(d.headW * 1.0, d.headH * 0.1, d.headD * 0.12), J.head, hp, [0, d.headY + d.headH * 0.73, faceAt(0.73) + d.headD * 0.03], [0.25, 0, 0]);
      hairTop = topY + d.headH * 0.14; break;
    }
    case "long": {
      if (hair.tiedBack) { add(shell({ scale: 1.08, front: 0.22 }), J.head, hp); add(loft([{ y: d.shoulderY, w: d.headW * 0.16, d: d.headW * 0.12, cut: 0.3, z: -d.headD * 0.55 }, { y: d.headY + d.headH * 0.3, w: d.headW * 0.26, d: d.headW * 0.2, cut: 0.3, z: -d.headD * 0.6 }], { top: true }), J.head, hp); }
      else {
        add(shell({ scale: 1.14, front: 0.42, bottom: d.shoulderY - H * 0.02, taper: 1.12 }), J.head, hp);
        if (hair.wild) for (let i = 0; i < 12; i++) { const ang = -Math.PI * 0.9 + (i / 11) * Math.PI * 1.8; if (Math.cos(ang) < -0.25) continue; tuft(J.head, Math.sin(ang) * d.headW * 0.62, topY - d.headH * (0.1 + fnoise(i, 45) * 0.5), -Math.cos(ang) * d.headD * 0.55, Math.PI / 2 - Math.cos(ang) * 0.9 + (fnoise(i, 46) - 0.5), Math.sin(ang) * 1.2 + (fnoise(i, 47) - 0.5), 1.2 + fnoise(i, 48) * 0.6); }
      }
      hairTop = topY + d.headH * 0.14; break;
    }
    case "curly": {
      const big = hair.big, small = hair.short;
      const r = d.headW * (big ? 0.34 : small ? 0.2 : 0.26);
      const n = big ? 22 : small ? 12 : 16;
      for (let i = 0; i < n; i++) {
        const u = fnoise(i, 49) * Math.PI * 2, v = fnoise(i, 50) * 0.75 + 0.15;
        const rr = d.headW * (big ? 0.68 : 0.58);
        const x = Math.cos(u) * Math.sin(v * Math.PI / 2 + 0.3) * rr, z = Math.sin(u) * Math.sin(v * Math.PI / 2 + 0.3) * rr * 0.95 - d.headD * 0.12, y = d.headY + d.headH * (0.55 + Math.cos(v * Math.PI / 2 + 0.3) * 0.55);
        if (z > d.headD * 0.3 && y < d.headY + d.headH * 0.75) continue; // keep the face clear
        add(ico(r * (0.8 + fnoise(i, 51) * 0.4), 0), J.head, hp, [x, y, z]);
      }
      add(shell({ scale: 1.08, front: 0.38 }), J.head, hp);
      if (hair.long) { add(shell({ scale: 1.12, front: 0.42, bottom: d.shoulderY, taper: 1.08, openTop: true, top: 0.7 }), J.head, hp); for (let i = 0; i < 8; i++) add(ico(r * 0.9, 0), J.head, hp, [(fnoise(i, 52) - 0.5) * d.headW * 1.4, d.headY + d.headH * (0.1 + fnoise(i, 53) * 0.4), -d.headD * 0.25 + (fnoise(i, 54) - 0.6) * d.headD * 0.5]); }
      hairTop = topY + d.headH * (big ? 0.4 : 0.22); break;
    }
    case "wavy": {
      const bottom = hair.long ? d.shoulderY - H * 0.01 : d.headY + d.headH * 0.22;
      add(shell({ scale: 1.14, front: 0.42, bottom, taper: 1.1 }), J.head, hp);
      for (let i = 0; i < (hair.long ? 6 : 4); i++) { const s = i % 2 ? 1 : -1; add(bbox(d.headW * 0.16, d.headH * 0.5, d.headW * 0.2), J.head, hp, [s * d.headW * (0.58 + fnoise(i, 55) * 0.1), bottom + d.headH * (0.1 + fnoise(i, 56) * 0.3), -d.headD * 0.1 + (fnoise(i, 57) - 0.5) * d.headD * 0.6], [0, 0, s * 0.12]); }
      if (hair.loose && !hair.long) add(box(d.headW * 0.7, d.headH * 0.1, d.headD * 0.14), J.head, hp, [-d.headW * 0.12, d.headY + d.headH * 0.74, faceAt(0.74) + d.headD * 0.02], [0.35, 0, 0.12]);
      hairTop = topY + d.headH * 0.14; break;
    }
    case "shaved-sides": {
      // shaved sides: skin-tinted; top strip in hair (dye) colour
      add(shell({ scale: 1.02, front: 0.3, fringe: 0.003 }), J.head, mix(skin, hairC, 0.55));
      const topC = hair.dye ?? hairC;
      if (hair.topTwists) { add(loft([{ y: topY - d.headH * 0.1, w: d.headW * 0.6, d: d.headD * 0.88, cut: 0.3, z: -d.headD * 0.04 }, { y: topY + d.headH * 0.04, w: d.headW * 0.6, d: d.headD * 0.88, cut: 0.3, z: -d.headD * 0.04 }], { bottom: false }), J.head, topC); for (let i = 0; i < 8; i++) add(tube([[(fnoise(i, 58) - 0.5) * d.headW * 0.5, topY + d.headH * 0.02, (fnoise(i, 59) - 0.55) * d.headD * 0.75], [(fnoise(i, 60) - 0.5) * d.headW * 0.6, topY + d.headH * 0.24, (fnoise(i, 61) - 0.55) * d.headD * 0.8]], d.headW * 0.045, 4), J.head, topC); hairTop = topY + d.headH * 0.26; }
      else {
        // undercut swept to one side
        add(loft([{ y: topY - d.headH * 0.14, w: d.headW * 0.66, d: d.headD * 0.92, cut: 0.3, x: -d.headW * 0.08 }, { y: topY + d.headH * 0.1, w: d.headW * 0.72, d: d.headD * 0.94, cut: 0.3, x: -d.headW * 0.2 }, { y: topY + d.headH * 0.18, w: d.headW * 0.3, d: d.headD * 0.6, cut: 0.35, x: -d.headW * 0.35 }], { bottom: false }), J.head, topC);
        add(box(d.headW * 0.2, d.headH * 0.3, d.headD * 0.6), J.head, topC, [-d.headW * 0.54, d.headY + d.headH * 0.84, -d.headD * 0.05], [0, 0, 0.2]);
        hairTop = topY + d.headH * 0.2;
      }
      break;
    }
    case "headwrap": {
      const wc = hair.wrap ?? "#c8452b";
      const base = shellRings({ scale: 1.14, front: 0.3, bottom: eyeY - eyeR * 0.2, top: 0.86, fringe: 0.03 }).map((r, i, arr) => (i < 3 ? r : { ...r, w: r.w * (1 + ((i - 2) / (arr.length - 2)) * 0.18), d: r.d * (1 + ((i - 2) / (arr.length - 2)) * 0.16) }));
      add(loft([...base, { y: topY + d.headH * 0.12, w: d.headW * 1.1, d: d.headD * 1.05, cut: 0.3 }, { y: topY + d.headH * 0.26, w: d.headW * 0.85, d: d.headD * 0.8, cut: 0.3 }, { y: topY + d.headH * 0.32, w: d.headW * 0.45, d: d.headD * 0.45, cut: 0.35 }], { bottom: false }), J.head, wc);
      if (!hair.veil) { add(box(d.headW * 0.34, d.headH * 0.2, d.headW * 0.22), J.head, shade(wc, 0.9), [d.headW * 0.5, topY + d.headH * 0.15, -d.headD * 0.1], [0.3, 0, -0.7]); add(box(d.headW * 0.3, d.headH * 0.16, d.headW * 0.2), J.head, shade(wc, 0.85), [d.headW * 0.62, topY + d.headH * 0.05, -d.headD * 0.05], [0.1, 0, 0.5]); }
      if (hair.veil) { const vc = o.habit ?? "#2c3e50"; add(loft([{ y: d.shoulderY - H * 0.04, w: sw * 0.95, d: d.headD * 0.9, cut: 0.3, z: -d.headD * 0.35 }, { y: d.headY + d.headH * 0.5, w: d.headW * 1.3, d: d.headD * 0.85, cut: 0.3, z: -d.headD * 0.28 }, { y: topY + d.headH * 0.22, w: d.headW * 1.15, d: d.headD * 1.1, cut: 0.3, z: -d.headD * 0.12 }, { y: topY + d.headH * 0.38, w: d.headW * 0.6, d: d.headD * 0.6, cut: 0.35, z: -d.headD * 0.1 }], { top: true, bottom: false }), J.head, (x, y, z) => (z > d.headD * 0.25 && y < topY + d.headH * 0.2 ? wc : vc)); hairTop = topY + d.headH * 0.38; }
      else hairTop = topY + d.headH * 0.3;
      break;
    }
    case "hijab": {
      const wc = hair.wrap ?? "#2e5d4a";
      // wrap: skull + cheeks covered, face open (front recessed below the brow), draping to the shoulders
      const back = -d.headD * 0.62;
      const lowRing = (y: number, w: number, extraBack = 0): Ring => { const ff = faceAt(Math.max(0, (y - d.headY) / d.headH)) - d.headD * 0.05; return { y, w, d: ff - (back - extraBack), cut: 0.3, z: (ff + back - extraBack) / 2 }; };
      add(loft([
        { y: d.shoulderY - H * 0.05, w: sw * 1.0, d: td * 1.15, cut: 0.28 },
        { y: d.shoulderY + H * 0.01, w: sw * 0.78, d: d.headD * 1.2, cut: 0.3, z: -d.headD * 0.05 },
        lowRing(d.headY + d.headH * 0.15, d.headW * 1.32, d.headD * 0.05),
        lowRing(d.headY + d.headH * 0.45, d.headW * 1.26),
        lowRing(d.headY + d.headH * T_LINE, d.headW * 1.2),
        ...headRings(1.13, T_LINE + 0.03, 1, 0).map((r, i) => (i === 0 ? { ...r, d: r.d + d.headD * 0.02, z: d.headD * 0.01 } : r)),
        { y: topY + d.headH * 0.14, w: d.headW * 0.5, d: d.headD * 0.5, cut: 0.35 },
      ], { bottom: false }), J.head, wc);
      hairTop = topY + d.headH * 0.14; break;
    }
  }
  // bandana on the head (lucia / moe) — a band above the brow, knot at the back
  if (o.bandana && id !== "tomas_reyes") { add(loft([{ y: d.headY + d.headH * T_LINE - H * 0.005, w: d.headW * 1.22, d: d.headD * 1.17, cut: 0.28 }, { y: d.headY + d.headH * T_LINE + H * 0.03, w: d.headW * 1.2, d: d.headD * 1.14, cut: 0.28 }], { top: false, bottom: false }), J.head, o.bandana); add(wedge(H * 0.03, H * 0.05, H * 0.008), J.head, o.bandana, [d.headW * 0.35, d.headY + d.headH * T_LINE, -d.headD * 0.55], [-Math.PI / 2 + 0.5, 0, 0.6]); if (id === "moe_tanaka") add(wedge(H * 0.03, H * 0.05, H * 0.008), J.head, o.bandana, [d.headW * 0.4, d.headY + d.headH * 0.5, -d.headD * 0.55], [Math.PI, 0, 0.6]); }
  if (o.goggles) { add(loft([{ y: d.headY + d.headH * T_LINE + H * 0.01, w: d.headW * 1.2, d: d.headD * 1.14, cut: 0.28 }, { y: d.headY + d.headH * T_LINE + H * 0.025, w: d.headW * 1.2, d: d.headD * 1.14, cut: 0.28 }], { top: false, bottom: false }), J.head, "#3a3a40"); for (const s of [-1, 1]) add(cyl(H * 0.014, H * 0.014, H * 0.012, 8), J.head, "#6a8a9a", [s * d.headW * 0.22, d.headY + d.headH * T_LINE + H * 0.02, d.headD * 0.56], [Math.PI / 2, 0, 0]); }
  if (o.sunglassesOnHead) { add(box(d.headW * 0.92, H * 0.012, H * 0.014), J.head, "#111", [0, d.headY + d.headH * 0.94, d.headD * 0.36], [-0.5, 0, 0]); for (const s of [-1, 1]) add(box(d.headW * 0.34, H * 0.022, H * 0.006), J.head, "#1a1a1a", [s * d.headW * 0.22, d.headY + d.headH * 0.96, d.headD * 0.41], [-0.5, 0, 0]); }
  /* ------------------------------------------------------------ glasses */
  const gk = o.glasses;
  if (gk) {
    const frame = gk === "thin" || gk === "chain" ? "#8a7a5a" : gk === "reading" ? "#5a4030" : "#2a2622";
    const gy = gk === "reading" || gk === "chain" ? eyeY - eyeR * 0.45 : eyeY;
    const gz = faceZ + eyeR * 0.9;
    const gr = gk === "small" ? eyeR * 1.0 : eyeR * 1.35;
    for (const s of [-1, 1]) {
      if (gk === "round" || gk === "small" || gk === "chain" || gk === "reading") add(torus(gr, H * (gk === "chain" ? 0.0025 : 0.0035), 10, 4), J.head, frame, [s * eyeX, gy, gz]);
      else { const w = gr * 2, h = gk === "thin" ? gr * 1.2 : gr * 1.5, t = H * (gk === "thin" ? 0.003 : 0.004); add(box(w, t, t), J.head, frame, [s * eyeX, gy + h / 2, gz]); add(box(w, t, t), J.head, frame, [s * eyeX, gy - h / 2, gz]); add(box(t, h, t), J.head, frame, [s * (eyeX + w / 2), gy, gz]); add(box(t, h, t), J.head, frame, [s * (eyeX - w / 2), gy, gz]); }
      // temple arm
      add(tube([[s * (eyeX + gr), gy, gz], [s * d.headW * 0.52, gy + eyeR * 0.15, -d.headD * 0.02]], H * 0.0025, 3), J.head, frame);
    }
    add(box(eyeX * 2 - gr * 2 + H * 0.004, H * 0.003, H * 0.003), J.head, frame, [0, gy, gz]);
    if (gk === "chain") for (const s of [-1, 1]) add(tube([[s * d.headW * 0.52, gy, -d.headD * 0.02], [s * sw * 0.32, d.chestY + H * 0.03, td * 0.3]], H * 0.002, 3), J.head, "#c9b46a");
  }

  /* ------------------------------------------------------------ headwear */
  const hatBase = hairTop - d.headH * 0.05;
  const hatC = o.hatColor ?? o.capColor ?? o.beanie ?? "#333";
  const hw = d.headW * 1.22, hd = d.headD * 1.18;
  const hRing = (y: number, k: number, cut = 0.28, z = 0): Ring => ({ y, w: hw * k, d: hd * k, cut, z });
  const brim = (y: number, k: number, thick = H * 0.008, zOff = 0, kz = k) => add(loft([{ y, w: hw * k, d: hd * kz, cut: 0.22, z: zOff }, { y: y + thick, w: hw * k, d: hd * kz, cut: 0.22, z: zOff }]), J.head, shade(hatC, 0.92));
  const hatKind = o.hat ?? o.cap ?? (o.beanie ? "beanie" : undefined);
  const capBand = (y0: number, kw = 1.06) => add(loft([hRing(y0, kw, 0.28), hRing(y0 + H * 0.018, kw, 0.28)], { top: false, bottom: false }), J.head, shade(hatC, 0.75));
  switch (hatKind) {
    case "sou'wester": {
      const y0 = d.headY + d.headH * 0.68;
      add(loft([hRing(y0, 1.12), hRing(y0 + d.headH * 0.3, 1.12), hRing(hatBase + d.headH * 0.2, 0.95), hRing(hatBase + d.headH * 0.36, 0.55, 0.35)]), J.head, hatC);
      // brim: short front, long sloping back
      add(loft([{ y: y0 - H * 0.025, w: hw * 1.35, d: hd * 1.7, cut: 0.22, z: -hd * 0.3 }, { y: y0 + H * 0.005, w: hw * 1.25, d: hd * 1.45, cut: 0.22, z: -hd * 0.12 }]), J.head, shade(hatC, 0.9));
      headTop = hatBase + d.headH * 0.36; break;
    }
    case "captain": {
      const y0 = d.headY + d.headH * 0.72;
      add(loft([hRing(y0, 1.06), hRing(y0 + d.headH * 0.14, 1.08)]), J.head, shade(hatC, 0.8));
      add(loft([hRing(y0 + d.headH * 0.12, 1.05, 0.28, -hd * 0.02), hRing(y0 + d.headH * 0.28, 1.3, 0.28, -hd * 0.08), hRing(y0 + d.headH * 0.36, 1.2, 0.3, -hd * 0.1)]), J.head, id === "bjorn_halvorsen" ? hatC : hatC);
      if (id === "idris_bello") { add(loft([hRing(y0 + d.headH * 0.05, 1.07, 0.28), hRing(y0 + d.headH * 0.09, 1.07, 0.28)], { top: false, bottom: false }), J.head, GOLD); add(cyl(H * 0.01, H * 0.01, H * 0.006, 6), J.head, GOLD, [0, y0 + d.headH * 0.18, hd * 0.5], [Math.PI / 2, 0, 0]); }
      else add(cyl(H * 0.009, H * 0.009, H * 0.006, 6), J.head, BRASS, [0, y0 + d.headH * 0.12, hd * 0.52], [Math.PI / 2, 0, 0]);
      add(loft([{ y: y0 - H * 0.005, w: hw * 0.9, d: hd * 0.5, cut: 0.25, z: hd * 0.5 }, { y: y0 + H * 0.01, w: hw * 0.85, d: hd * 0.45, cut: 0.25, z: hd * 0.46 }]), J.head, "#111");
      headTop = y0 + d.headH * 0.36; break;
    }
    case "postal": {
      const y0 = d.headY + d.headH * 0.72;
      add(loft([hRing(y0, 1.05), hRing(y0 + d.headH * 0.22, 1.12, 0.28, -hd * 0.04), hRing(y0 + d.headH * 0.3, 1.0, 0.3, -hd * 0.06)]), J.head, hatC);
      add(loft([hRing(y0 + H * 0.002, 1.06), hRing(y0 + H * 0.014, 1.06)], { top: false, bottom: false }), J.head, o.trim ?? "#d8262c");
      add(loft([{ y: y0 - H * 0.005, w: hw * 0.85, d: hd * 0.45, cut: 0.25, z: hd * 0.48 }, { y: y0 + H * 0.008, w: hw * 0.8, d: hd * 0.4, cut: 0.25, z: hd * 0.45 }]), J.head, "#111");
      headTop = y0 + d.headH * 0.3; break;
    }
    case "flat": {
      const y0 = d.headY + d.headH * 0.7;
      add(loft([hRing(y0, 1.08, 0.28, -hd * 0.01), hRing(y0 + d.headH * 0.12, 1.18, 0.28, -hd * 0.06), hRing(y0 + d.headH * 0.2, 1.05, 0.3, -hd * 0.13), hRing(y0 + d.headH * 0.24, 0.5, 0.35, -hd * 0.17)]), J.head, (x, y, z, f) => (fnoise(f, 62) < 0.25 ? shade(hatC, 0.9) : hatC));
      add(loft([{ y: y0 - H * 0.004, w: hw * 0.7, d: hd * 0.36, cut: 0.25, z: hd * 0.5 }, { y: y0 + H * 0.008, w: hw * 0.68, d: hd * 0.32, cut: 0.25, z: hd * 0.47 }]), J.head, shade(hatC, 0.8));
      headTop = y0 + d.headH * 0.24; break;
    }
    case "bowler": {
      const y0 = hatBase - d.headH * 0.02;
      brim(y0, 1.42);
      add(loft([hRing(y0, 1.05), hRing(y0 + d.headH * 0.22, 1.07), hRing(y0 + d.headH * 0.36, 0.9), hRing(y0 + d.headH * 0.42, 0.5, 0.35)]), J.head, hatC);
      capBand(y0 + H * 0.005, 1.07);
      headTop = y0 + d.headH * 0.42; break;
    }
    case "fedora": {
      const y0 = hatBase - d.headH * 0.02;
      brim(y0, 1.6, H * 0.008, hd * 0.03);
      add(loft([hRing(y0, 1.08), hRing(y0 + d.headH * 0.3, 1.02), { y: y0 + d.headH * 0.42, w: hw * 0.72, d: hd * 0.95, cut: 0.3 }, { y: y0 + d.headH * 0.44, w: hw * 0.55, d: hd * 0.7, cut: 0.35 }]), J.head, hatC);
      add(loft([hRing(y0 + H * 0.004, 1.09), hRing(y0 + H * 0.022, 1.09)], { top: false, bottom: false }), J.head, "#1a1410");
      headTop = y0 + d.headH * 0.44; break;
    }
    case "straw": {
      const y0 = hatBase - d.headH * 0.02;
      add(loft([{ y: y0 - H * 0.01, w: hw * 1.9, d: hd * 1.85, cut: 0.22 }, { y: y0 + H * 0.002, w: hw * 1.6, d: hd * 1.55, cut: 0.22 }, { y: y0 + H * 0.01, w: hw * 1.06, d: hd * 1.06, cut: 0.28 }]), J.head, (x, y, z, f) => (fnoise(f, 63) < 0.3 ? shade(hatC, 0.92) : hatC));
      add(loft([hRing(y0, 1.06), hRing(y0 + d.headH * 0.24, 1.0), hRing(y0 + d.headH * 0.3, 0.6, 0.35)]), J.head, hatC);
      add(loft([hRing(y0 + H * 0.004, 1.07), hRing(y0 + H * 0.02, 1.07)], { top: false, bottom: false }), J.head, o.bandana ?? "#6b3a2a");
      headTop = y0 + d.headH * 0.3; break;
    }
    case "wide-brim": {
      const y0 = hatBase - d.headH * 0.03;
      add(loft([{ y: y0 - H * 0.008, w: hw * 1.75, d: hd * 1.75, cut: 0.22 }, { y: y0 + H * 0.004, w: hw * 1.55, d: hd * 1.55, cut: 0.22 }, { y: y0 + H * 0.01, w: hw * 1.06, d: hd * 1.06, cut: 0.28 }]), J.head, shade(hatC, 0.95));
      add(loft([hRing(y0, 1.06), hRing(y0 + d.headH * 0.28, 0.98), hRing(y0 + d.headH * 0.36, 0.55, 0.35)]), J.head, hatC);
      capBand(y0 + H * 0.004, 1.07);
      headTop = y0 + d.headH * 0.36; break;
    }
    case "tam": {
      const y0 = hatBase - d.headH * 0.05;
      add(loft([hRing(y0, 1.05), hRing(y0 + d.headH * 0.1, 1.55, 0.3), hRing(y0 + d.headH * 0.24, 1.45, 0.3), hRing(y0 + d.headH * 0.3, 0.8, 0.35)]), J.head, (x, y, z, f) => (o.tartan && fnoise(f, 64) < 0.18 ? o.tartan : hatC));
      add(sphere(H * 0.016, 6, 4), J.head, "#d8262c", [0, y0 + d.headH * 0.32, 0]);
      headTop = y0 + d.headH * 0.34; break;
    }
    case "beanie":
    case "knit": {
      const y0 = d.headY + d.headH * 0.62;
      const tall = hatKind === "knit" ? 0.5 : 0.42;
      add(loft([hRing(y0, 1.1), hRing(y0 + d.headH * 0.12, 1.12), hRing(y0 + d.headH * (tall - 0.1), 0.95), hRing(y0 + d.headH * tall, 0.45, 0.35)]), J.head, (x, y, z, f) => (fnoise(f, 65) < 0.2 ? shade(hatC, 0.9) : hatC));
      add(loft([hRing(y0, 1.14), hRing(y0 + d.headH * 0.1, 1.16)], { top: false, bottom: false }), J.head, shade(hatC, 0.85));
      headTop = y0 + d.headH * tall; break;
    }
    case "constable": {
      const y0 = d.headY + d.headH * 0.62;
      add(loft([hRing(y0, 1.12), hRing(y0 + d.headH * 0.2, 1.14), hRing(y0 + d.headH * 0.55, 0.9), hRing(y0 + d.headH * 0.72, 0.5, 0.35), hRing(y0 + d.headH * 0.78, 0.2, 0.4)]), J.head, hatC);
      add(loft([{ y: y0 - H * 0.006, w: hw * 1.22, d: hd * 1.2, cut: 0.25 }, { y: y0 + H * 0.004, w: hw * 1.18, d: hd * 1.18, cut: 0.25 }]), J.head, shade(hatC, 0.8));
      add(cyl(H * 0.012, H * 0.012, H * 0.006, 6), J.head, STEEL, [0, y0 + d.headH * 0.3, hd * 0.55], [Math.PI / 2, 0, 0]);
      add(sphere(H * 0.008, 5, 3), J.head, STEEL, [0, y0 + d.headH * 0.8, 0]);
      headTop = y0 + d.headH * 0.8; break;
    }
    default: headTop = Math.max(headTop, hairTop);
  }
  headTop = Math.max(headTop, hairTop);

  // pipe in the mouth (bjorn)
  if (id === "bjorn_halvorsen") { add(tube([[d.headW * 0.1, mouthY, faceZ + d.headD * 0.02], [d.headW * 0.3, mouthY - d.headH * 0.08, faceZ + d.headD * 0.35]], H * 0.004, 4), J.head, "#3a2a1e"); add(cyl(H * 0.012, H * 0.01, H * 0.025, 6), J.head, "#3a2a1e", [d.headW * 0.3, mouthY - d.headH * 0.1, faceZ + d.headD * 0.35]); }

  /* ------------------------------------------------------------ hand props (rigid to the hand bone) */
  const WL = R[J.handL], WR = R[J.handR];
  const handOff = d.armR * 0.25;
  const hxL = WL.x - handOff, hxR = WR.x + handOff;
  const hy = WL.y - d.hand * 0.45; // palm centre
  const gait: Gait = { stoop: 0, bounce: 1, sway: 0, cadence: 1, swing: 1, proud: 0, tired: 0, restless: 0, cane: false, slow: 1, holdL: 0, holdR: 0, shoulderCarry: false };
  switch (id) {
    case "mira_okafor": add(cyl(H * 0.014, H * 0.014, H * 0.2, 7), J.handR, "#d9b27a", [hxR, hy, -H * 0.1], [Math.PI / 2, 0, 0]); add(cyl(H * 0.008, H * 0.008, H * 0.05, 5), J.handR, "#c49a5a", [hxR, hy, -H * 0.15], [Math.PI / 2, 0, 0]); add(cyl(H * 0.008, H * 0.008, H * 0.05, 5), J.handR, "#c49a5a", [hxR, hy, H * 0.1], [Math.PI / 2, 0, 0]); gait.holdR = 0.7; break;
    case "zara_okafor": add(bbox(H * 0.07, H * 0.09, H * 0.014), J.handL, "#2a2a3a", [hxL, hy, H * 0.02], [0.3, 0, 0]); gait.holdL = 0.9; break;
    case "teodor_ilic": add(loft([{ y: -H * 0.03, w: H * 0.12, d: H * 0.09, cut: 0.3 }, { y: H * 0.03, w: H * 0.15, d: H * 0.11, cut: 0.3 }], { top: false }), J.handL, "#b0844a", [hxL - H * 0.02, hy - H * 0.04, H * 0.03]); for (let i = 0; i < 3; i++) add(ico(H * 0.02, 0), J.handL, ["#d8a865", "#c9924c", "#e0b878"][i], [hxL - H * 0.02 + (i - 1) * H * 0.035, hy - H * 0.005, H * 0.03]); gait.holdL = 0.8; break;
    case "devendra_rao": add(cyl(H * 0.004, H * 0.004, H * 0.12, 5), J.handR, BRASS, [hxR, hy, H * 0.02]); add(box(H * 0.11, H * 0.004, H * 0.004), J.handR, BRASS, [hxR, hy + H * 0.12, H * 0.02]); for (const s of [-1, 1]) { add(tube([[hxR + s * H * 0.05, hy + H * 0.12, H * 0.02], [hxR + s * H * 0.05, hy + H * 0.06, H * 0.02]], H * 0.002, 3), J.handR, BRASS); add(cyl(H * 0.02, H * 0.016, H * 0.006, 8), J.handR, BRASS, [hxR + s * H * 0.05, hy + H * 0.055, H * 0.02]); } gait.holdR = 1; gait.proud = 0.6; break;
    case "arjun_rao": add(bbox(H * 0.035, H * 0.07, H * 0.006), J.handR, "#1a1a1a", [hxR, hy, H * 0.02], [0.4, 0, 0]); gait.holdR = 0.85; break;
    case "ingrid_halvorsen": add(bbox(H * 0.02, H * 0.13, H * 0.1), J.handL, "#3a4a6a", [hxL - H * 0.02, hy - H * 0.03, H * 0.02]); gait.holdL = 0.6; gait.proud = 0.7; break;
    case "marcus_vale": add(bbox(H * 0.025, H * 0.13, H * 0.1), J.handL, "#4a2a1a", [hxL - H * 0.02, hy - H * 0.03, H * 0.02]); gait.holdL = 0.5; gait.proud = 0.8; break;
    case "cornelius_ashdown": case "osman_kaya": case "walter_finch": {
      const cc = o.cane ?? "#3a2a1e";
      add(cyl(H * 0.007, H * 0.008, hy - H * 0.005, 6), J.handR, cc, [hxR, 0, H * 0.02]); add(torus(H * 0.02, H * 0.006, 8, 4), J.handR, id === "cornelius_ashdown" ? "#c9c6c0" : cc, [hxR, hy, H * 0.02], [0, Math.PI / 2, 0]); gait.cane = true; break;
    }
    case "priya_nair": add(bbox(H * 0.07, H * 0.09, H * 0.012), J.handL, "#8a2020", [hxL, hy, H * 0.02], [0.3, 0, 0]); gait.holdL = 0.9; break;
    case "ben_carter": add(cyl(H * 0.01, H * 0.012, H * 0.09, 6), J.handR, "#222", [hxR, hy - H * 0.05, H * 0.015]); gait.proud = 0.6; break;
    case "hana_kimura": add(bbox(H * 0.075, H * 0.1, H * 0.008), J.handL, "#c9a27a", [hxL, hy, H * 0.02], [0.35, 0, 0]); add(box(H * 0.065, H * 0.08, H * 0.004), J.handL, WHITE, [hxL, hy, H * 0.026], [0.35, 0, 0]); gait.holdL = 0.9; break;
    case "aylin_demir": add(bbox(H * 0.075, H * 0.1, H * 0.008), J.handL, "#4a4a52", [hxL, hy, H * 0.02], [0.35, 0, 0]); add(box(H * 0.065, H * 0.08, H * 0.004), J.handL, WHITE, [hxL, hy, H * 0.026], [0.35, 0, 0]); gait.holdL = 0.9; break;
    case "fatima_haddad": add(bbox(H * 0.075, H * 0.1, H * 0.008), J.handL, "#5c4030", [hxL, hy, H * 0.02], [0.35, 0, 0]); add(box(H * 0.065, H * 0.08, H * 0.004), J.handL, WHITE, [hxL, hy, H * 0.026], [0.35, 0, 0]); add(ico(H * 0.045, 0), J.handR, "#c9b48a", [hxR, hy - H * 0.05, H * 0.01], undefined, [1, 1.3, 1]); gait.holdL = 0.9; break;
    case "rosa_moreno": add(loft([{ y: 0, w: H * 0.05, d: H * 0.05, cut: 0.3 }, { y: H * 0.07, w: H * 0.06, d: H * 0.06, cut: 0.3 }, { y: H * 0.085, w: H * 0.03, d: H * 0.03, cut: 0.35 }]), J.handR, STEEL, [hxR + H * 0.01, hy - H * 0.06, H * 0.03]); add(tube([[hxR + H * 0.04, hy - H * 0.05, H * 0.03], [hxR + H * 0.04, hy + H * 0.0, H * 0.06], [hxR + H * 0.04, hy - H * 0.0, H * 0.01]], H * 0.004, 4), J.handR, "#222"); gait.holdR = 0.9; break;
    case "lucia_moreno": add(cyl(H * 0.02, H * 0.016, H * 0.04, 8), J.handR, WHITE, [hxR, hy - H * 0.02, H * 0.03]); add(cyl(H * 0.021, H * 0.021, H * 0.006, 8), J.handR, "#3a2a1e", [hxR, hy + H * 0.02, H * 0.03]); gait.holdR = 0.9; gait.bounce = 1.2; break;
    case "jonah_kowalski": add(cyl(H * 0.028, H * 0.025, H * 0.07, 8), J.handR, "#c9b48a", [hxR, hy - H * 0.035, H * 0.03]); add(torus(H * 0.02, H * 0.005, 8, 4), J.handR, "#c9b48a", [hxR + H * 0.035, hy, H * 0.03], [0, Math.PI / 2, 0]); add(cyl(H * 0.03, H * 0.03, H * 0.012, 8), J.handR, "#f4ead0", [hxR, hy + H * 0.035, H * 0.03]); gait.holdR = 0.8; gait.sway = 1; break;
    case "wojciech_kowalski": add(cyl(H * 0.006, H * 0.006, H * 0.12, 5), J.handR, "#a8c8d8", [hxR, hy - H * 0.04, H * 0.02]); add(sphere(H * 0.012, 6, 4), J.handR, "#a8c8d8", [hxR, hy - H * 0.04, H * 0.02]); gait.holdR = 0.7; break;
    case "elias_brand": add(cyl(H * 0.008, H * 0.008, H * 0.14, 6), J.handR, WOOD, [hxR, hy - H * 0.06, H * 0.02]); add(bbox(H * 0.05, H * 0.025, H * 0.025), J.handR, "#4a4a50", [hxR, hy + H * 0.08, H * 0.02]); gait.holdR = 0.5; break;
    case "kofi_mensah": gait.shoulderCarry = true; gait.bounce = 1.3; break;
    case "yusuf_demir": add(box(H * 0.012, H * 0.13, H * 0.006), J.handR, STEEL, [hxR, hy + H * 0.01, H * 0.02]); add(box(H * 0.035, H * 0.03, H * 0.008), J.handR, STEEL, [hxR, hy + H * 0.075, H * 0.02], [0, 0, 0.3]); add(box(H * 0.03, H * 0.025, H * 0.008), J.handR, STEEL, [hxR, hy - H * 0.05, H * 0.02], [0, 0, -0.3]); gait.holdR = 0.4; break;
    case "anna_lindqvist": add(cyl(H * 0.008, H * 0.01, hy - H * 0.005, 6), J.handR, "#6b4a2a", [hxR, 0, H * 0.02]); add(sphere(H * 0.016, 6, 4), J.handR, "#6b4a2a", [hxR, hy, H * 0.02]); gait.cane = true; gait.proud = 0.6; break;
    case "per_lindqvist": add(cyl(H * 0.008, H * 0.008, H * 0.62, 6), J.handR, WOOD, [hxR, hy - H * 0.35, H * 0.02]); for (let i = -1; i <= 1; i++) add(cyl(H * 0.003, H * 0.003, H * 0.08, 4), J.handR, STEEL, [hxR + i * H * 0.02, hy + H * 0.27, H * 0.02]); add(box(H * 0.05, H * 0.006, H * 0.006), J.handR, STEEL, [hxR, hy + H * 0.27, H * 0.02]); gait.holdR = 0.3; break;
    case "tomas_reyes": add(cyl(H * 0.007, H * 0.007, H * 0.6, 6), J.handR, WOOD, [hxR, hy - H * 0.35, H * 0.02]); add(box(H * 0.06, H * 0.03, H * 0.006), J.handR, "#4a4a50", [hxR, hy + H * 0.25, H * 0.03], [0.5, 0, 0]); gait.holdR = 0.3; gait.bounce = 1.3; break;
    case "hamish_mcbride": add(sphere(H * 0.018, 6, 4), J.handL, "#c8412b", [hxL, hy - H * 0.01, H * 0.03]); gait.holdL = 0.8; break;
    case "chen_wei": add(bbox(H * 0.06, H * 0.08, H * 0.012), J.handL, "#3a3a40", [hxL, hy, H * 0.02], [0.3, 0, 0]); gait.holdL = 0.8; break;
    case "leo_petrov": add(loft([{ y: 0, w: H * 0.07, d: H * 0.07, cut: 0.3 }, { y: H * 0.09, w: H * 0.085, d: H * 0.085, cut: 0.3 }], { top: false }), J.handL, "#4a5a6a", [hxL, hy - H * 0.16, H * 0.01]); add(tube([[hxL - H * 0.04, hy - H * 0.07, H * 0.01], [hxL, hy - H * 0.005, H * 0.01], [hxL + H * 0.04, hy - H * 0.07, H * 0.01]], H * 0.004, 4), J.handL, "#3a3a40"); break;
    case "noor_rahman": break;
    case "idris_bello": add(cyl(H * 0.012, H * 0.016, H * 0.13, 8), J.handR, BRASS, [hxR, hy - H * 0.06, H * 0.02], [0, 0, 0]); add(cyl(H * 0.009, H * 0.009, H * 0.03, 8), J.handR, "#8a7020", [hxR, hy + H * 0.07, H * 0.02]); gait.holdR = 0.35; gait.proud = 1; break;
    case "gus_ferreira": add(bbox(H * 0.045, H * 0.07, H * 0.045), J.handR, "#fff0b0", [hxR, hy - H * 0.09, H * 0.015]); add(box(H * 0.05, H * 0.012, H * 0.05), J.handR, "#2a2a2e", [hxR, hy - H * 0.05, H * 0.015]); add(box(H * 0.05, H * 0.012, H * 0.05), J.handR, "#2a2a2e", [hxR, hy - H * 0.13, H * 0.015]); add(torus(H * 0.012, H * 0.003, 8, 4), J.handR, "#2a2a2e", [hxR, hy - H * 0.03, H * 0.015]); gait.slow = 0.7; gait.tired = 0.4; break;
    case "agnes_duarte": add(cyl(H * 0.006, H * 0.006, H * 0.55, 5), J.handR, WOOD, [hxR, hy - H * 0.4, H * 0.02]); add(loft([{ y: 0, w: H * 0.06, d: H * 0.025, cut: 0.2 }, { y: H * 0.06, w: H * 0.03, d: H * 0.015, cut: 0.2 }]), J.handR, "#c9a860", [hxR, hy - H * 0.46, H * 0.02]); gait.slow = 0.75; gait.holdR = 0.2; break;
    case "rafael_costa": gait.bounce = 1.2; break;
    case "ines_larsson": add(loft([{ y: -H * 0.004, w: H * 0.12, d: H * 0.09, cut: 0.4 }, { y: H * 0.004, w: H * 0.12, d: H * 0.09, cut: 0.4 }]), J.handL, (x, y, z, f) => (fnoise(f, 66) < 0.25 && o.paintStains ? o.paintStains[Math.floor(fnoise(f, 67) * o.paintStains.length)] : "#c9a87a"), [hxL - H * 0.02, hy, H * 0.03], [0.2, 0, 0]); add(cyl(H * 0.004, H * 0.004, H * 0.11, 5), J.handR, "#8a6a4a", [hxR, hy - H * 0.02, H * 0.02]); add(cyl(H * 0.006, H * 0.004, H * 0.02, 5), J.handR, "#3c8ed6", [hxR, hy + H * 0.09, H * 0.02]); gait.holdL = 0.9; gait.holdR = 0.6; break;
    case "meena_pillai": add(loft([{ y: 0, w: H * 0.07, d: H * 0.07, cut: 0.3 }, { y: H * 0.05, w: H * 0.085, d: H * 0.085, cut: 0.3 }, { y: H * 0.075, w: H * 0.04, d: H * 0.04, cut: 0.35 }]), J.handR, STEEL, [hxR + H * 0.01, hy - H * 0.11, H * 0.02]); add(tube([[hxR - H * 0.03, hy - H * 0.06, H * 0.02], [hxR + H * 0.01, hy - H * 0.005, H * 0.02], [hxR + H * 0.05, hy - H * 0.06, H * 0.02]], H * 0.005, 4), J.handR, "#222"); add(tube([[hxR + H * 0.05, hy - H * 0.08, H * 0.02], [hxR + H * 0.09, hy - H * 0.05, H * 0.02]], H * 0.005, 4), J.handR, STEEL); gait.holdR = 0.25; break;
    case "bakary_diallo": gait.shoulderCarry = true; gait.proud = 0.7; break;
    case "jay_whitlock": add(cyl(H * 0.012, H * 0.012, H * 0.11, 7), J.handR, "#e8e2d4", [hxR, hy - H * 0.05, H * 0.02], [0.3, 0, 0]); gait.restless = 1; gait.tired = 0.3; break;
    case "moe_tanaka": add(bbox(H * 0.045, H * 0.014, H * 0.02), J.handR, STEEL, [hxR, hy, H * 0.03]); gait.holdR = 0.9; gait.tired = 0.3; break;
    case "samuel_achebe": gait.tired = 0.5; break;
    case "grace_achebe": gait.proud = 0.6; break;
    case "sal_romano": gait.bounce = 1.1; break;
    case "dmitri_volkov": gait.tired = 0.3; break;
    case "sigrid_vale": gait.holdL = 0.6; gait.proud = 0.5; break;
    case "lakshmi_rao": gait.holdL = 0.5; break;
    case "tunde_okafor": gait.sway = 1; break;
    case "sunny_adebayo": gait.bounce = 1.15; break;
    case "felix_ashdown": gait.bounce = 1.3; gait.restless = 0.6; break;
  }
  if (o.prayerBeads) add(tube([[hxL, hy - H * 0.02, H * 0.02], [hxL - H * 0.01, hy - H * 0.08, H * 0.03], [hxL + H * 0.015, hy - H * 0.1, H * 0.03], [hxL + H * 0.01, hy - H * 0.02, H * 0.02]], H * 0.005, 4), J.handL, (x, y, z, f) => (fnoise(f, 68) < 0.5 ? o.prayerBeads! : shade(o.prayerBeads!, 0.6)));

  /* ------------------------------------------------------------ gait from age / build / traits */
  const traits = cast?.traits ?? [];
  const has = (...ks: string[]) => traits.some((t) => ks.some((k) => t.includes(k)));
  if (a.age === "elder") { gait.stoop += o.stooped ? 0.32 : 0.22; gait.cadence *= 0.85; gait.swing *= 0.7; gait.slow *= 0.75; gait.bounce *= 0.5; }
  else if (a.age === "senior") { gait.stoop += 0.08; gait.cadence *= 0.93; gait.slow *= 0.9; gait.bounce *= 0.7; }
  else if (a.age === "young") { gait.bounce *= 1.25; gait.cadence *= 1.08; gait.swing *= 1.15; }
  if (a.build === "heavy") { gait.sway = Math.max(gait.sway, 0.8); gait.cadence *= 0.92; gait.bounce *= 0.8; }
  if (a.build === "wiry") { gait.cadence *= 1.08; }
  if (has("proud", "formal", "disciplined", "incorruptible", "rigid", "polished", "elegant", "steady", "exacting")) gait.proud = Math.max(gait.proud, 0.6);
  if (has("tired", "melancholy", "grieving", "lonely", "wounded", "unhappy", "reclusive")) gait.tired = Math.max(gait.tired, 0.5);
  if (has("restless", "anxious", "angry", "short-tempered", "chatty", "theatrical", "eager")) gait.restless = Math.max(gait.restless, 0.7);
  if (has("cheerful", "sunny", "charming", "funny", "gregarious", "mischievous")) gait.bounce *= 1.15;
  if (has("serene", "patient", "gentle", "quiet")) gait.slow *= 0.85;
  gait.stoop = Math.min(gait.stoop, 0.4);

  /* ------------------------------------------------------------ assemble */
  const geometry = A.build();
  const bones = makeBones(d);
  const mesh = new THREE.SkinnedMesh(geometry, characterMaterial());
  mesh.add(bones[0]);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H * 0.5, 0), H * 0.85);
  mesh.userData.npcId = id;
  return { id, mesh, bones, dims: d, gait, job, work: WORK_BY_JOB[job] ?? "stand", headTop };
}

/** plaid: two stripe families over a base colour */
function plaidAt(x: number, y: number, base: string, stripe: string): string {
  const a = Math.abs(Math.sin(x * 70)) > 0.82, b = Math.abs(Math.sin(y * 70)) > 0.82;
  return a && b ? shade(stripe, 0.8) : a || b ? stripe : base;
}

/** cheap estimate of the tallest point for a rig (used before build for layout) */
export const estimatedHeight = (a: Appearance) => a.height * 1.1;
