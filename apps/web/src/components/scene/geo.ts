/**
 * Shared unit geometries + a material cache so the whole town draws with a
 * handful of geometry/material objects (scaled per mesh).
 */
import * as THREE from "three";

let _box: THREE.BoxGeometry | null = null;
export function unitBox() { return (_box ??= new THREE.BoxGeometry(1, 1, 1)); }

let _gable: THREE.BufferGeometry | null = null;
/** unit gable prism: footprint 1×1 (x × z), height 1, ridge along x, base at y=0 */
export function unitGable() {
  if (_gable) return _gable;
  const p: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => p.push(...a, ...b, ...c);
  const A = [-0.5, 0, 0.5], B = [0.5, 0, 0.5], C = [0.5, 0, -0.5], D = [-0.5, 0, -0.5];
  const E = [-0.5, 1, 0], F = [0.5, 1, 0];
  // front slope (faces +z)
  tri(A, B, F); tri(A, F, E);
  // back slope (faces -z)
  tri(C, D, E); tri(C, E, F);
  // gable ends
  tri(D, A, E);            // -x end
  tri(B, C, F);            // +x end
  // bottom
  tri(A, D, C); tri(A, C, B);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  _gable = g;
  return g;
}

let _pyr: THREE.BufferGeometry | null = null;
/** unit square pyramid: footprint 1×1, height 1, base at y=0 */
export function unitPyramid() {
  if (_pyr) return _pyr;
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  _pyr = g;
  return g;
}

let _cyl: THREE.CylinderGeometry | null = null;
/** unit cylinder r=0.5 h=1 base at y=0 */
export function unitCyl() { if (_cyl) return _cyl; _cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); _cyl.translate(0, 0.5, 0); return _cyl; }

let _cone: THREE.ConeGeometry | null = null;
/** unit cone r=0.5 h=1 base at y=0 (low-poly, 7 sides) */
export function unitCone() { if (_cone) return _cone; _cone = new THREE.ConeGeometry(0.5, 1, 7, 1); _cone.translate(0, 0.5, 0); return _cone; }

let _blob: THREE.BufferGeometry | null = null;
/** low-poly canopy blob r=0.5 centred at origin */
export function unitBlob() { return (_blob ??= new THREE.IcosahedronGeometry(0.5, 0)); }

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** cached flat-ish standard material by colour */
export function mat(color: string, opts: { roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number; flat?: boolean } = {}): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(opts);
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0, flatShading: opts.flat ?? false });
    if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
    mats.set(key, m);
  }
  return m;
}
