/**
 * Low-poly plant / rock geometries. Each species is ONE merged geometry with
 * vertex colours, `aWind` (sway weight) and `aTint` (instance-colour mask) so
 * a whole species draws as a single InstancedMesh.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "../palette";

interface Part { geo: THREE.BufferGeometry; color: THREE.ColorRepresentation; tint: number; wind: [number, number]; jitter?: number }

/**
 * Merge parts into one geometry. Parts with `tint = 1` store their colour RELATIVE to `base`
 * (per channel), so the instance colour (a varied `base`) carries the absolute colour and the
 * per-part differences survive as subtle shading. Untinted parts (trunks) keep absolute colours.
 */
function assemble(parts: Part[], base?: THREE.ColorRepresentation): THREE.BufferGeometry {
  const baseC = base ? new THREE.Color(base) : null;
  const prepared = parts.map((p, pi) => {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone());
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const h = Math.max(1e-4, bb.max.y - bb.min.y);
    const c = new THREE.Color(p.color);
    if (p.tint > 0 && baseC) c.set(Math.min(1.6, c.r / Math.max(0.02, baseC.r)), Math.min(1.6, c.g / Math.max(0.02, baseC.g)), Math.min(1.6, c.b / Math.max(0.02, baseC.b)));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), wind = new Float32Array(n), tint = new Float32Array(n);
    const r = rng(100 + pi);
    for (let i = 0; i < n; i++) {
      const j = 1 + (r() - 0.5) * (p.jitter ?? 0);
      col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
      const t = (g.attributes.position.getY(i) - bb.min.y) / h;
      wind[i] = p.wind[0] + (p.wind[1] - p.wind[0]) * t;
      tint[i] = p.tint;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aWind", new THREE.BufferAttribute(wind, 1));
    g.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  });
  const merged = mergeGeometries(prepared, false)!;
  merged.computeBoundingSphere();
  return merged;
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, ry = 0) => {
  g.scale(sx, sy, sz); g.rotateY(ry); g.translate(x, y, z); return g;
};
const ico = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d);
/** icosahedron with vertex jitter for organic blobs / rocks */
function lumpy(r: number, detail: number, amount: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const rand = rng(seed);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const s = 1 + (rand() - 0.5) * amount;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * (1 + (rand() - 0.5) * amount * 0.6), p.getZ(i) * s);
  }
  return g;
}

/* --------------------------------- trees --------------------------------- */

export function oakGeometry(): THREE.BufferGeometry {
  const trunk = at(new THREE.CylinderGeometry(0.2, 0.34, 2.0, 6), 0, 1.0, 0);
  const b1 = at(new THREE.CylinderGeometry(0.1, 0.16, 1.3, 5), 0.55, 2.4, 0.2, 1, 1, 1);
  b1.rotateZ(-0.6);
  const parts: Part[] = [
    { geo: trunk, color: "#6b4a30", tint: 0, wind: [0, 0.15] },
    { geo: b1, color: "#6b4a30", tint: 0, wind: [0.1, 0.25] },
    { geo: at(lumpy(1.95, 0, 0.12, 1), 0, 3.4, 0), color: "#6cb047", tint: 1, wind: [0.35, 0.8], jitter: 0.06 },
    { geo: at(lumpy(1.35, 0, 0.14, 2), 1.25, 2.85, 0.5), color: "#62a642", tint: 1, wind: [0.3, 0.7], jitter: 0.06 },
    { geo: at(lumpy(1.3, 0, 0.14, 3), -1.15, 3.0, -0.6), color: "#77bb4d", tint: 1, wind: [0.3, 0.7], jitter: 0.06 },
    { geo: at(lumpy(1.15, 0, 0.14, 4), 0.2, 4.4, -0.9), color: "#7fc451", tint: 1, wind: [0.5, 1.0], jitter: 0.06 },
  ];
  return assemble(parts, "#6cb047");
}

export function pineGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: at(new THREE.CylinderGeometry(0.14, 0.26, 2.4, 6), 0, 1.2, 0), color: "#5a3d28", tint: 0, wind: [0, 0.1] },
    { geo: at(new THREE.ConeGeometry(1.55, 2.6, 7, 1), 0, 1.6 + 1.3, 0, 1, 1, 1, 0.2), color: "#3b6d3a", tint: 1, wind: [0.2, 0.45], jitter: 0.08 },
    { geo: at(new THREE.ConeGeometry(1.2, 2.3, 7, 1), 0, 3.3 + 1.15, 0, 1, 1, 1, 0.5), color: "#417a40", tint: 1, wind: [0.35, 0.6], jitter: 0.08 },
    { geo: at(new THREE.ConeGeometry(0.8, 2.1, 6, 1), 0, 4.9 + 1.05, 0), color: "#4a8747", tint: 1, wind: [0.5, 1.0], jitter: 0.08 },
  ];
  return assemble(parts, "#417a40");
}

/** wind-bent coastal pine — leans toward +x (rotate the instance so +x points inland) */
export function coastalPineGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.16, 0.3, 3.0, 6);
  trunk.translate(0, 1.5, 0);
  { const p = trunk.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.5 * p.getY(i)); } // lean: x += 0.5*y
  const parts: Part[] = [
    { geo: trunk, color: "#5b4633", tint: 0, wind: [0, 0.15] },
    { geo: at(lumpy(1.0, 0, 0.2, 11), 1.9, 3.1, 0.3, 1.8, 0.62, 1.4), color: "#4d7f44", tint: 1, wind: [0.3, 0.7], jitter: 0.08 },
    { geo: at(lumpy(0.9, 0, 0.2, 12), 2.6, 3.65, -0.5, 1.5, 0.55, 1.2), color: "#57894a", tint: 1, wind: [0.4, 0.85], jitter: 0.08 },
    { geo: at(lumpy(0.75, 0, 0.2, 13), 1.2, 2.35, -0.9, 1.3, 0.5, 1.1), color: "#456f3d", tint: 1, wind: [0.25, 0.6], jitter: 0.08 },
  ];
  return assemble(parts, "#4d7f44");
}

export function poplarGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: at(new THREE.CylinderGeometry(0.13, 0.22, 2.2, 6), 0, 1.1, 0), color: "#7a6146", tint: 0, wind: [0, 0.1] },
    { geo: at(lumpy(1.0, 1, 0.12, 21), 0, 4.6, 0, 1.05, 3.0, 1.05), color: "#8dbc4b", tint: 1, wind: [0.2, 1.0], jitter: 0.07 },
  ];
  return assemble(parts, "#8dbc4b");
}

/* ------------------------------ undergrowth ------------------------------ */

export function bushGeometry(): THREE.BufferGeometry {
  return assemble([
    { geo: at(lumpy(1.0, 1, 0.18, 31), 0, 0.75, 0, 1.25, 0.85, 1.1), color: "#4f8a3c", tint: 1, wind: [0.1, 0.6], jitter: 0.08 },
    { geo: at(lumpy(0.7, 0, 0.18, 32), 0.9, 0.55, 0.4, 1.1, 0.8, 1.0), color: "#579545", tint: 1, wind: [0.1, 0.6], jitter: 0.08 },
    { geo: at(lumpy(0.6, 0, 0.18, 33), -0.8, 0.5, -0.5), color: "#478236", tint: 1, wind: [0.1, 0.6], jitter: 0.08 },
  ], "#4f8a3c");
}

export function hedgeGeometry(): THREE.BufferGeometry {
  const g = lumpy(1, 1, 0.1, 34);
  return assemble([{ geo: at(g, 0, 0.7, 0, 1.5, 0.72, 0.6), color: "#467f3a", tint: 1, wind: [0.05, 0.4], jitter: 0.08 }], "#467f3a");
}

export function flowerGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const r = rng(5);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28 + r() * 0.5, rr = i === 0 ? 0 : 0.18 + r() * 0.2, h = 0.3 + r() * 0.2;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    parts.push({ geo: at(new THREE.CylinderGeometry(0.025, 0.035, h, 3), x, h / 2, z), color: "#4e8b3a", tint: 0, wind: [0, 1] });
    parts.push({ geo: at(ico(0.12, 0), x, h + 0.06, z, 1, 0.75, 1), color: "#ffffff", tint: 1, wind: [1, 1] });
  }
  return assemble(parts);
}

export function reedGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const r = rng(6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28 + r(), rr = i === 0 ? 0 : 0.1 + r() * 0.16, h = 1.3 + r() * 0.7;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const blade = new THREE.ConeGeometry(0.05, h, 3, 1);
    blade.translate(0, h / 2, 0);
    blade.rotateZ((r() - 0.5) * 0.25); blade.rotateX((r() - 0.5) * 0.25);
    blade.translate(x, 0, z);
    parts.push({ geo: blade, color: "#7f9c4c", tint: 1, wind: [0, 1], jitter: 0.1 });
    if (i % 2 === 0) parts.push({ geo: at(new THREE.CylinderGeometry(0.035, 0.05, 0.28, 4), x, h * 0.86, z), color: "#6b4a2a", tint: 0, wind: [0.85, 1] });
  }
  return assemble(parts, "#7f9c4c");
}

export function grassGeometry(): THREE.BufferGeometry {
  // 7 thin double-sided blades
  const pos: number[] = [];
  const r = rng(8);
  for (let i = 0; i < 7; i++) {
    const a = r() * 6.28, lean = 0.25 + r() * 0.35, h = 0.45 + r() * 0.35, w = 0.05 + r() * 0.03;
    const bx = Math.cos(a) * 0.12 * r(), bz = Math.sin(a) * 0.12 * r();
    const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(bx + px, 0, bz + pz, bx - px, 0, bz - pz, tx, h, tz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return assemble([{ geo: g, color: "#7cb84f", tint: 1, wind: [0, 1], jitter: 0.12 }], "#7cb84f");
}

/* --------------------------------- rocks --------------------------------- */

export function rockGeometry(seed = 41): THREE.BufferGeometry {
  return assemble([{ geo: at(lumpy(1, 1, 0.35, seed), 0, 0.35, 0, 1, 0.68, 0.85), color: "#8b8579", tint: 1, wind: [0, 0], jitter: 0.1 }], "#8b8579");
}

export function driftwoodGeometry(): THREE.BufferGeometry {
  const log = new THREE.CylinderGeometry(0.11, 0.2, 2.6, 5);
  log.rotateZ(Math.PI / 2); log.translate(0, 0.16, 0);
  const stub = new THREE.CylinderGeometry(0.05, 0.09, 0.7, 4);
  stub.rotateZ(0.5); stub.rotateX(0.9); stub.translate(0.6, 0.35, 0.15);
  return assemble([
    { geo: log, color: "#b0a48c", tint: 1, wind: [0, 0], jitter: 0.12 },
    { geo: stub, color: "#a3967e", tint: 1, wind: [0, 0], jitter: 0.12 },
  ], "#b0a48c");
}

/** crop plant for the farm fields (rendered from layout.ts's crop list) */
export function cropGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28;
    parts.push({ geo: at(new THREE.ConeGeometry(0.28, 0.85, 4, 1), Math.cos(a) * 0.22, 0.42, Math.sin(a) * 0.22, 1, 1, 1, a), color: "#ffffff", tint: 1, wind: [0.2, 1], jitter: 0.1 });
  }
  return assemble(parts);
}
