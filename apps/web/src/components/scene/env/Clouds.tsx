/**
 * Soft low-poly cloud clusters drifting high above the town (y ≥ 240).
 * One InstancedMesh; colour follows the sky, darkens and thickens in a storm.
 */
"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sky, rng } from "../palette";

const WHITE = new THREE.Color("#ffffff"), STORM = new THREE.Color("#5c6169");
const _c = new THREE.Color();

export default function Clouds() {
  const data = useMemo(() => {
    const r = rng(99);
    const out: { x: number; y: number; z: number; sx: number; sy: number; sz: number; speed: number; ry: number; storm: boolean }[] = [];
    const cluster = (cx: number, cy: number, cz: number, size: number, speed: number, storm: boolean) => {
      const puffs = 4 + Math.floor(r() * 4);
      for (let k = 0; k < puffs; k++) {
        const s = size * (0.55 + r() * 0.7);
        const off = k === 0 ? 0 : 1;
        out.push({ x: cx + (r() - 0.5) * size * 2.6 * off, y: cy + s * 0.35 + (r() - 0.5) * size * 0.3, z: cz + (r() - 0.5) * size * 1.4 * off, sx: s * (1.3 + r() * 0.6), sy: s * 0.55, sz: s, speed, ry: r() * 6.28, storm });
      }
    };
    for (let i = 0; i < 18; i++) cluster(-150 + r() * 650, 245 + r() * 55, -600 + r() * 750, 9 + r() * 10, 0.7 + r() * 1.3, false);
    for (let i = 0; i < 16; i++) cluster(-150 + r() * 650, 210 + r() * 40, -600 + r() * 750, 14 + r() * 12, 1.4 + r() * 1.6, true); // extra storm deck
    return out;
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const rr = rng(5);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const s = 1 + (rr() - 0.5) * 0.25; p.setXYZ(i, p.getX(i) * s, Math.max(-0.35, p.getY(i)) * s, p.getZ(i) * s); }
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, flatShading: true, transparent: true, opacity: 0.93, fog: true }), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const t = useRef(0);
  useFrame((_, dt) => {
    const m = ref.current; if (!m) return;
    t.current += dt * (1 + sky.storm * 1.5);
    const storm = sky.storm;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      let x = d.x - t.current * d.speed;
      x = ((((x + 150) % 650) + 650) % 650) - 150;
      const s = d.storm ? storm : 1;
      dummy.position.set(x, d.y - storm * 40, d.z); dummy.scale.set(d.sx * s + 1e-3, d.sy * s + 1e-3, d.sz * s + 1e-3); dummy.rotation.set(0, d.ry, 0); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    _c.copy(sky.horizon).lerp(sky.sun, 0.25).lerp(WHITE, 0.6).multiplyScalar(1 - sky.night * 0.75);
    mat.color.copy(_c).lerp(STORM, storm * 0.85);
    mat.opacity = 0.93 + storm * 0.07;
  });
  return <instancedMesh ref={ref} args={[geo, mat, data.length]} frustumCulled={false} castShadow={false} receiveShadow={false} />;
}
