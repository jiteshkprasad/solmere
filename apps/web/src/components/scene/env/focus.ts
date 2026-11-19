/**
 * Depth-of-field focus provider. The composition root (Town.tsx) installs a
 * provider that knows where the followed subject is; env/Effects only reads it.
 */
import type * as THREE from "three";

export const dofFocus: { provider: ((out: THREE.Vector3) => boolean) | null } = { provider: null };
