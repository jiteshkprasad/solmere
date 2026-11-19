"use client";
/**
 * Dev-only route: the NPC layer alone (mock world, flat ground, no town) so the
 * crowd can be inspected without the rest of the scene.
 *   /dev-npcs?hour=14   camera over the square; ?x=&z= to move it; ?cam=near for a low angle
 */
import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import NpcLayer from "@/components/scene/Npc";
import { OverlayProjector, OVERLAY_CSS } from "@/components/scene/overlay";
import { NpcLabels } from "@/components/scene/Labels";
import SpeechBubbles from "@/components/scene/SpeechBubbles";
import { terrainHeight } from "@/components/scene/terrain";

export default function DevNpcsPage() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState({ x: 150, z: -150, near: false });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setView({ x: Number(q.get("x") ?? 150), z: Number(q.get("z") ?? -150), near: q.get("cam") === "near" });
    let stop: (() => void) | undefined;
    import("@/components/scene/DevMock").then((m) => { stop = m.startDevMock(); setReady(true); });
    return () => stop?.();
  }, []);
  const pos: [number, number, number] = view.near ? [view.x + 14, 6, view.z + 22] : [view.x, 40, view.z + 60];
  // simple heightfield so people stand on the same ground as in the town
  const ground = useMemo(() => {
    const g = new THREE.PlaneGeometry(400, 400, 100, 100);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 150, z = p.getZ(i) - 150; p.setXYZ(i, x, terrainHeight(x, -z), z); }
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <main className="relative h-screen w-screen overflow-hidden" style={{ background: "#0b1020" }}>
      <style>{OVERLAY_CSS}</style>
      <Canvas shadows dpr={1} camera={{ fov: 40, near: 0.5, far: 2000, position: pos }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }} style={{ position: "absolute", inset: 0 }}>
        <color attach="background" args={["#8fb4d9"]} />
        <hemisphereLight args={["#bcdcf7", "#7a7a5c", 0.7]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[view.x + 60, 90, view.z + 40]} intensity={2.2} color="#fff4dc" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-120} shadow-camera-right={120} shadow-camera-top={120} shadow-camera-bottom={-120} shadow-camera-near={10} shadow-camera-far={400} shadow-bias={-0.0004} shadow-normalBias={0.03} />
        <mesh geometry={ground} receiveShadow><meshStandardMaterial color="#8a9d63" /></mesh>
        {ready && <NpcLayer />}
        <OrbitControls target={[view.x, terrainHeight(view.x, -view.z) + 2, view.z]} />
        <OverlayProjector />
      </Canvas>
      <div className="sc-overlay">
        <NpcLabels />
        <SpeechBubbles />
      </div>
    </main>
  );
}
