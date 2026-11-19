/** Shared static instancing helper (owned by the orchestrator; keep the API stable). */
"use client";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import type { Xf } from "./buildings/layout";

/* ------------------------------ instancing helper ------------------------------ */

const _o = new THREE.Object3D();
const _c = new THREE.Color();
export function StaticInstances({ geometry, material, items, castShadow = true, receiveShadow = false }: { geometry: THREE.BufferGeometry; material: THREE.Material; items: Xf[]; castShadow?: boolean; receiveShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((it, i) => {
      _o.position.set(it.x, it.y, it.z); _o.rotation.set(0, it.ry, 0); _o.scale.set(it.sx, it.sy, it.sz); _o.updateMatrix();
      m.setMatrixAt(i, _o.matrix);
      if (it.color) m.setColorAt(i, _c.set(it.color));
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} />;
}
