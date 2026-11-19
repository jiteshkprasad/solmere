/**
 * The faceted terrain mesh (built once, ~80k triangles) and the park pond.
 */
"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildFacetedGround, buildPondGeometry } from "./terrainGeometry";
import { sky } from "../palette";

export const groundStats = { triangles: 0 };

export default function Ground() {
  const built = useMemo(() => buildFacetedGround(2.5), []);
  groundStats.triangles = built.triangles;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }), []);
  const pondGeo = useMemo(() => buildPondGeometry(), []);
  const pondMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3f7f86", roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.85, flatShading: true }), []);
  useFrame(() => { pondMat.color.set("#3f8088").lerp(sky.horizon, 0.3).multiplyScalar(1 - sky.night * 0.7); });
  return (
    <group>
      <mesh geometry={built.geometry} material={mat} receiveShadow castShadow={false} />
      <mesh geometry={pondGeo} material={pondMat} receiveShadow />
    </group>
  );
}
