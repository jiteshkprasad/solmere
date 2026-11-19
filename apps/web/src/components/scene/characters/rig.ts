/**
 * Skeleton layout shared by the builder and the animator.
 * Character space: metres, feet at y=0, facing +z, the character's left is -x.
 */
import * as THREE from "three";
import type { Appearance, Build, AgeBand } from "./appearance";

/** joint indices — bone order in the skeleton and in pose buffers */
export const J = {
  hips: 0, spine: 1, chest: 2, neck: 3, head: 4,
  uArmL: 5, fArmL: 6, handL: 7, uArmR: 8, fArmR: 9, handR: 10,
  thighL: 11, shinL: 12, footL: 13, thighR: 14, shinR: 15, footR: 16,
  COUNT: 17,
} as const;
const PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15];

export interface Dims {
  H: number;             // total height (m, before NPC_SCALE)
  hipsY: number; kneeY: number; ankleY: number;
  waistY: number; chestY: number; shoulderY: number; neckY: number; headY: number; headTop: number;
  headH: number; headW: number; headD: number;
  shoulderW: number; hipW: number; torsoD: number; torsoW: number;
  uArm: number; fArm: number; hand: number; armR: number;
  legR: number; footL: number;
  wide: number;          // build width factor
}

const BUILD_W: Record<Build, number> = { slight: 0.9, wiry: 0.86, average: 1, sturdy: 1.12, heavy: 1.3 };
const BUILD_D: Record<Build, number> = { slight: 0.92, wiry: 0.88, average: 1, sturdy: 1.08, heavy: 1.35 };
const AGE_H: Record<AgeBand, number> = { young: 1, adult: 1, middle: 1, senior: 0.985, elder: 0.965 };

export function computeDims(a: Appearance, gender: string): Dims {
  const H = a.height * AGE_H[a.age] * 1.1; // ×1.1 keeps figures the size the camera/labels were tuned for
  const wide = BUILD_W[a.build] * (gender === "F" ? 0.94 : 1);
  const deep = BUILD_D[a.build];
  const hipsY = H * 0.46, kneeY = H * 0.245, ankleY = H * 0.055;
  const torso = H * 0.29;
  const waistY = hipsY + torso * 0.12, chestY = hipsY + torso * 0.55, shoulderY = hipsY + torso;
  const neckY = shoulderY + H * 0.012, headY = neckY + H * 0.035;
  const headH = H * 0.2 * (a.build === "heavy" ? 1.03 : 1);
  const headW = H * 0.15 * (a.build === "heavy" ? 1.1 : a.build === "wiry" || a.build === "slight" ? 0.96 : 1);
  return {
    H, hipsY, kneeY, ankleY, waistY, chestY, shoulderY, neckY, headY, headTop: headY + headH,
    headH, headW, headD: headW * 1.04,
    shoulderW: H * 0.26 * wide, hipW: H * 0.17 * (gender === "F" ? 1.12 : 1) * (a.build === "heavy" ? 1.25 : a.build === "sturdy" ? 1.08 : 1),
    torsoD: H * 0.13 * deep, torsoW: H * 0.21 * wide,
    uArm: H * 0.155, fArm: H * 0.135, hand: H * 0.06, armR: H * 0.036 * (a.build === "heavy" ? 1.3 : a.build === "sturdy" ? 1.15 : a.build === "wiry" ? 0.85 : 1),
    legR: H * 0.052 * (a.build === "heavy" ? 1.3 : a.build === "sturdy" ? 1.12 : a.build === "wiry" || a.build === "slight" ? 0.9 : 1),
    footL: H * 0.15, wide,
  };
}

/** rest position of every joint in character space */
export function jointRest(d: Dims): THREE.Vector3[] {
  const sx = d.shoulderW / 2, hx = d.hipW * 0.28;
  const P = new Array<THREE.Vector3>(J.COUNT);
  P[J.hips] = new THREE.Vector3(0, d.hipsY, 0);
  P[J.spine] = new THREE.Vector3(0, d.waistY, 0);
  P[J.chest] = new THREE.Vector3(0, d.chestY, 0);
  P[J.neck] = new THREE.Vector3(0, d.neckY, 0);
  P[J.head] = new THREE.Vector3(0, d.headY, 0);
  P[J.uArmL] = new THREE.Vector3(-sx, d.shoulderY - d.H * 0.015, 0);
  P[J.fArmL] = new THREE.Vector3(-sx, d.shoulderY - d.H * 0.015 - d.uArm, 0);
  P[J.handL] = new THREE.Vector3(-sx, d.shoulderY - d.H * 0.015 - d.uArm - d.fArm, 0);
  P[J.uArmR] = P[J.uArmL].clone().setX(sx);
  P[J.fArmR] = P[J.fArmL].clone().setX(sx);
  P[J.handR] = P[J.handL].clone().setX(sx);
  P[J.thighL] = new THREE.Vector3(-hx, d.hipsY, 0);
  P[J.shinL] = new THREE.Vector3(-hx, d.kneeY, 0);
  P[J.footL] = new THREE.Vector3(-hx, d.ankleY, 0);
  P[J.thighR] = P[J.thighL].clone().setX(hx);
  P[J.shinR] = P[J.shinL].clone().setX(hx);
  P[J.footR] = P[J.footL].clone().setX(hx);
  return P;
}

/** build the bone hierarchy (root = hips) at rest */
export function makeBones(d: Dims): THREE.Bone[] {
  const rest = jointRest(d);
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < J.COUNT; i++) {
    const b = new THREE.Bone();
    const p = PARENT[i];
    if (p < 0) b.position.copy(rest[i]); else { b.position.copy(rest[i]).sub(rest[p]); bones[p].add(b); }
    bones.push(b);
  }
  bones[0].updateMatrixWorld(true);
  return bones;
}
