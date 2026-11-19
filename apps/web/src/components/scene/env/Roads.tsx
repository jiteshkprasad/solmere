/**
 * Roads: cobbled Main Street / square / lanes (procedural stone texture with
 * kerbs), tarmac harbour road, dirt tracks to the farms, and puddles that
 * appear while the "storm" world event is active.
 */
"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildRoadGeometry, ROAD_SPECS, terrainHeight, sampleRoad, type Road } from "../terrain";
import { rng } from "../palette";
import { sky } from "../palette";
import { hash2 } from "./noise";

/* ------------------------------ cobble texture ------------------------------ */

function makeCobbleTexture(size = 512, tint = 1): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = `rgb(${Math.round(92 * tint)},${Math.round(88 * tint)},${Math.round(82 * tint)})`;
  ctx.fillRect(0, 0, size, size);
  const cols = 12, rows = 14;
  const cw = size / cols, ch = size / rows;
  const r = rng(11);
  const stones = ["#8f8a82", "#9a948b", "#857f77", "#a39c90", "#8b8377", "#948e85", "#7f7a73", "#a8a196"];
  const draw = (x: number, y: number, w: number, h: number, i: number, j: number) => {
    const base = new THREE.Color(stones[Math.floor(hash2(i, j, 3) * stones.length)]).multiplyScalar(tint * (0.94 + hash2(i, j, 5) * 0.12));
    const rad = Math.min(w, h) * 0.32;
    const inset = 2.2;
    const rr = (px: number, py: number, pw: number, ph: number) => { ctx.beginPath(); ctx.roundRect(px, py, pw, ph, rad); };
    // shadow (bottom-right)
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    rr(x + inset + 1.5, y + inset + 2, w - inset * 2, h - inset * 2); ctx.fill();
    // stone
    ctx.fillStyle = "#" + base.getHexString();
    rr(x + inset, y + inset, w - inset * 2, h - inset * 2); ctx.fill();
    // highlight (top-left)
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    rr(x + inset, y + inset, w - inset * 2, (h - inset * 2) * 0.45); ctx.fill();
    // speckle
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + inset + r() * (w - inset * 2), y + inset + r() * (h - inset * 2), 1.2 + r() * 1.6, 0, 6.28); ctx.fill(); }
  };
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * cw * 0.5;
    for (let i = -1; i <= cols; i++) {
      const jitter = (hash2(i, j, 9) - 0.5) * 3;
      draw(i * cw + off + jitter, j * ch + (hash2(i, j, 10) - 0.5) * 2, cw + (hash2(i, j, 12) - 0.5) * 4, ch, i, j);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** overwrite uvs with world-planar coordinates (metres / tile) */
function worldUv(g: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / tile; uv[i * 2 + 1] = -pos.getZ(i) / tile; }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** vertex colour jitter for plain surfaces */
function jitterColor(g: THREE.BufferGeometry, color: string, amount: number, seed: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const j = 1 + (hash2(Math.round(pos.getX(i) * 3), Math.round(pos.getZ(i) * 3), seed) - 0.5) * amount;
    col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** the town square plaza: rounded rectangle, terrain following */
function buildPlazaGeometry(cx: number, cy: number, w: number, d: number, yOff: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const r = 9;
  shape.moveTo(-w / 2 + r, -d / 2);
  shape.lineTo(w / 2 - r, -d / 2); shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  shape.lineTo(w / 2, d / 2 - r); shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  shape.lineTo(-w / 2 + r, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  shape.lineTo(-w / 2, -d / 2 + r); shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  // triangulate on a grid so it follows the terrain: sample a fine grid and keep cells inside the shape
  const step = 2;
  const pos: number[] = [], idx: number[] = [];
  const inside = (x: number, y: number) => {
    const pts = shape.getPoints(24);
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const nx = Math.ceil(w / step) + 1, ny = Math.ceil(d / step) + 1;
  const map = new Int32Array(nx * ny).fill(-1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const lx = -w / 2 + i * step, ly = -d / 2 + j * step;
    // clamp to the outline so edge verts sit on the boundary
    const x = Math.min(lx, w / 2), y = Math.min(ly, d / 2);
    if (!inside(Math.max(-w / 2 + 0.01, Math.min(x, w / 2 - 0.01)), Math.max(-d / 2 + 0.01, Math.min(y, d / 2 - 0.01)))) continue;
    map[j * nx + i] = pos.length / 3;
    const mx = cx + x, my = cy + y;
    pos.push(mx, terrainHeight(mx, my) + yOff, -my);
  }
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = map[j * nx + i], b = map[j * nx + i + 1], c = map[(j + 1) * nx + i], dd = map[(j + 1) * nx + i + 1];
    if (a >= 0 && b >= 0 && c >= 0) idx.push(a, b, c);
    if (b >= 0 && dd >= 0 && c >= 0) idx.push(b, dd, c);
  }
  // outline ring for the kerb
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildRing(cx: number, cy: number, w: number, d: number, width: number, yOff: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const r = 9;
  shape.moveTo(-w / 2 + r, -d / 2);
  shape.lineTo(w / 2 - r, -d / 2); shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  shape.lineTo(w / 2, d / 2 - r); shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  shape.lineTo(-w / 2 + r, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  shape.lineTo(-w / 2, -d / 2 + r); shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  const pts = shape.getPoints(10);
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], o = pts[(i - 1 + pts.length) % pts.length];
    const tx = q.x - o.x, ty = q.y - o.y, l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l, ny = tx / l;
    const ax = cx + p.x - nx * width / 2, ay = cy + p.y - ny * width / 2, bx = cx + p.x + nx * width / 2, by = cy + p.y + ny * width / 2;
    pos.push(ax, terrainHeight(ax, ay) + yOff, -ay, bx, terrainHeight(bx, by) + yOff, -by);
  }
  const n = pts.length;
  for (let i = 0; i < n; i++) { const a = i * 2, b = a + 1, c = ((i + 1) % n) * 2, d2 = c + 1; idx.push(a, b, c, b, d2, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------- roads ---------------------------------- */

const COBBLE: Road[] = ROAD_SPECS.filter((r) => r.kind === "cobble");
const TARMAC: Road[] = ROAD_SPECS.filter((r) => r.kind === "tarmac");
const DIRT: Road[] = ROAD_SPECS.filter((r) => r.kind === "dirt");

export const PLAZA = { cx: 150, cy: 121, w: 46, d: 56 };

export default function Roads() {
  const cobbleTex = useMemo(() => makeCobbleTexture(512, 1), []);
  const plazaTex = useMemo(() => makeCobbleTexture(512, 1.12), []);
  const cobbleGeo = useMemo(() => worldUv(buildRoadGeometry(5, 0.08, COBBLE), 4.2), []);
  const plazaGeo = useMemo(() => worldUv(buildPlazaGeometry(PLAZA.cx, PLAZA.cy, PLAZA.w, PLAZA.d, 0.09), 4.2), []);
  const kerbGeo = useMemo(() => {
    // kerbs: two thin ribbons per cobble road, offset to either edge, plus a ring around the plaza
    const parts: THREE.BufferGeometry[] = [];
    for (const r of COBBLE) {
      parts.push(buildRoadGeometry(5, 0.17, [r], r.width / 2 + 0.2, 0.45));
      parts.push(buildRoadGeometry(5, 0.17, [r], -(r.width / 2 + 0.2), 0.45));
    }
    parts.push(buildRing(PLAZA.cx, PLAZA.cy, PLAZA.w + 0.9, PLAZA.d + 0.9, 0.5, 0.18));
    return jitterColor(mergeGeometries(parts), "#bcb5a8", 0.12, 41);
  }, []);
  const tarmacGeo = useMemo(() => jitterColor(buildRoadGeometry(5, 0.08, TARMAC), "#4d4c4e", 0.14, 42), []);
  const dirtGeo = useMemo(() => jitterColor(buildRoadGeometry(5, 0.07, DIRT), "#8f7452", 0.22, 43), []);

  const cobbleMat = useMemo(() => new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.95, color: "#e6e0d6" }), [cobbleTex]);
  const plazaMat = useMemo(() => new THREE.MeshStandardMaterial({ map: plazaTex, roughness: 0.95, color: "#efe9dd" }), [plazaTex]);
  const kerbMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), []);
  const tarmacMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), []);
  const dirtMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), []);

  return (
    <group>
      <mesh geometry={cobbleGeo} material={cobbleMat} receiveShadow />
      <mesh geometry={plazaGeo} material={plazaMat} receiveShadow />
      <mesh geometry={kerbGeo} material={kerbMat} receiveShadow />
      <mesh geometry={tarmacGeo} material={tarmacMat} receiveShadow />
      <mesh geometry={dirtGeo} material={dirtMat} receiveShadow />
      <Puddles />
    </group>
  );
}

/** merge plain position(+index) geometries into one non-indexed geometry */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const chunks: Float32Array[] = [];
  let total = 0;
  for (const p of parts) {
    const ni = p.index ? p.toNonIndexed() : p;
    const arr = (ni.attributes.position as THREE.BufferAttribute).array as Float32Array;
    chunks.push(arr); total += arr.length;
  }
  const pos = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { pos.set(c, o); o += c.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/* --------------------------------- puddles --------------------------------- */

const _o = new THREE.Object3D();
function Puddles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const r = rng(77);
    const out: { x: number; y: number; z: number; s: number; ry: number; sx: number }[] = [];
    for (const road of ROAD_SPECS) {
      const samples = sampleRoad(road.pts, 3);
      for (const [x, y] of samples) {
        if (r() > 0.38) continue;
        const ox = (r() - 0.5) * (road.width - 1.4), oy = (r() - 0.5) * 1.5;
        const px = x + ox, py = y + oy;
        out.push({ x: px, y: terrainHeight(px, py) + 0.115, z: -py, s: 0.7 + r() * 1.4, ry: r() * 6.28, sx: 0.6 + r() * 0.8 });
      }
    }
    return out;
  }, []);
  const geo = useMemo(() => { const g = new THREE.CircleGeometry(1, 9); g.rotateX(-Math.PI / 2); return g; }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1e2a36", roughness: 0.08, metalness: 0.55, transparent: true, opacity: 0.85, depthWrite: false }), []);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return;
    spots.forEach((p, i) => { _o.position.set(p.x, p.y, p.z); _o.rotation.set(0, p.ry, 0); _o.scale.set(p.s * p.sx, 1, p.s); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); });
    m.instanceMatrix.needsUpdate = true;
    m.count = 0;
  }, [spots]);
  const shown = useRef(0);
  useFrame(() => {
    const m = ref.current; if (!m) return;
    const want = sky.storm;
    const n = Math.round(spots.length * want);
    if (n !== shown.current) {
      // scale puddles in as the storm builds: instances beyond n are hidden by count
      m.count = n; shown.current = n;
    }
    m.visible = n > 0;
    mat.color.set(sky.night > 0.5 ? "#0c1218" : "#2a3a48").lerp(sky.horizon, 0.35 * (1 - sky.night));
  });
  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, spots.length)]} frustumCulled={false} receiveShadow />;
}
