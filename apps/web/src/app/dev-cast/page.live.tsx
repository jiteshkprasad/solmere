"use client";
/**
 * Dev-only cast line-up (no store, no town): all 50 characters on a stepped
 * stage facing the camera with name labels, or 8 close-ups.
 *   /dev-cast                      grid of 50
 *   /dev-cast?view=close&from=8    close-ups of characters 8..15
 *   ?pose=walk|talk|work|eat|drink|sleep|worship|speech|sick|leisure|shop|create
 *   ?t=<seconds>                   freeze the animation clock at t (screenshots)
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { ActionKind } from "@npcworld/schema";
import { APPEARANCES, CAST, appearanceOf, castOf } from "@/components/scene/characters/appearance";
import { buildCharacter, type CharacterRig } from "@/components/scene/characters/builder";
import { animate, createAnim, type AnimCtx, type AnimInstance } from "@/components/scene/characters/animation";

const IDS = Object.keys(APPEARANCES);
const NAME = new Map(CAST.map((c) => [c.id, c.name]));

interface Params { view: string; from: number; pose: string; t: number | null; spin: boolean; lite: boolean; row: number | null }
function useParams(): Params {
  const [p, setP] = useState<Params>({ view: "grid", from: 0, pose: "idle", t: null, spin: false, lite: false, row: null });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("t");
    setP({ view: q.get("view") ?? "grid", from: Number(q.get("from") ?? 0), pose: q.get("pose") ?? "idle", t: t != null ? Number(t) : null, spin: q.get("spin") === "1", lite: q.get("lite") === "1", row: q.get("row") != null ? Number(q.get("row")) : null });
  }, []);
  return p;
}

function Figure({ id, pose, t0, x, y, z, ry = 0, label = true }: { id: string; pose: string; t0: number | null; x: number; y: number; z: number; ry?: number; label?: boolean }) {
  const rig = useMemo<CharacterRig>(() => buildCharacter(id, appearanceOf(id), castOf(id)), [id]);
  const anim = useMemo<AnimInstance>(() => createAnim(rig), [rig]);
  const ctx = useRef<AnimCtx>({ t: 0, moving: false, phase: 0, speed: 0, action: "idle", talking: false, speaking: false, seed: (IDS.indexOf(id) % 7) / 7 });
  useFrame(({ clock }, dt) => {
    const t = t0 ?? clock.elapsedTime;
    const c = ctx.current;
    c.t = t;
    c.moving = pose === "walk";
    c.phase = t * 6.5;
    c.speed = 1.4;
    c.action = (pose === "walk" || pose === "idle" ? "idle" : pose) as ActionKind;
    c.talking = pose === "talk";
    c.speaking = pose === "talk" && IDS.indexOf(id) % 2 === 0;
    animate(anim, c, t0 != null ? 1 : Math.min(dt, 0.05));
  });
  return (
    <group position={[x, y, z]} rotation={[0, ry, 0]}>
      <primitive object={rig.mesh} />
      {label && (
        <Html position={[0, rig.headTop + 0.22, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div style={{ color: "#fff", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", background: "rgba(0,0,0,.55)", padding: "1px 6px", borderRadius: 5, fontFamily: "system-ui, sans-serif" }}>{NAME.get(id) ?? id}</div>
        </Html>
      )}
    </group>
  );
}

function Lights({ lite }: { lite: boolean }) {
  return (
    <>
      <hemisphereLight args={["#cfe0f5", "#7a6a55", 0.9]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[8, 14, 12]} intensity={2.4} color="#fff2dc" castShadow={!lite} shadow-mapSize={[2048, 2048]} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} shadow-bias={-0.0003} shadow-normalBias={0.02} />
      <directionalLight position={[-10, 6, -6]} intensity={0.6} color="#cfe2ff" />
    </>
  );
}

function Grid({ p }: { p: Params }) {
  const cols = 10, rows = 5, dx = 2.3, dz = 2.6, step = 1.0;
  return (
    <>
      <color attach="background" args={["#8fb4d9"]} />
      <Lights lite={p.lite} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 4]} receiveShadow><planeGeometry args={[80, 60]} /><meshStandardMaterial color="#7f9b5e" /></mesh>
      {Array.from({ length: rows }, (_, r) => (
        <mesh key={r} position={[0, (r * step) / 2 - 0.002, -r * dz]} receiveShadow castShadow>
          <boxGeometry args={[cols * dx + 1.5, r * step + 0.004, dz]} />
          <meshStandardMaterial color={r % 2 ? "#a7a196" : "#b6b0a4"} />
        </mesh>
      ))}
      {IDS.map((id, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        if (p.row != null && r !== p.row) return null;
        return <Figure key={id} id={id} pose={p.pose} t0={p.t} x={(c - (cols - 1) / 2) * (p.row != null ? 1.45 : dx)} y={p.row != null ? 0 : r * step} z={p.row != null ? 0 : -r * dz} ry={p.spin ? Math.PI * 0.75 : 0} />;
      })}
      <OrbitControls target={p.row != null ? [0, 1.1, 0] : [0, 2.2, -5]} />
      {p.row != null && <PerspectiveCamera makeDefault fov={16} position={[0, 2.4, 22]} near={0.1} far={200} />}
    </>
  );
}

function CloseUp({ id, p }: { id: string; p: Params }) {
  const rig = useMemo(() => buildCharacter(id, appearanceOf(id), castOf(id)), [id]);
  const anim = useMemo(() => createAnim(rig), [rig]);
  const ctx = useRef<AnimCtx>({ t: 0, moving: false, phase: 0, speed: 0, action: "idle", talking: false, speaking: false, seed: 0.3 });
  const d = rig.dims;
  const top = rig.headTop + d.headH * 0.15, bottom = d.chestY - d.H * 0.04;
  const cy = (top + bottom) / 2, span = top - bottom;
  const dist = (span / 2) / Math.tan((26 / 2) * Math.PI / 180) * 1.05;
  const cam = useRef<THREE.PerspectiveCamera>(null);
  useFrame(({ clock }) => {
    const c = ctx.current; c.t = p.t ?? clock.elapsedTime;
    c.action = (p.pose === "walk" || p.pose === "idle" ? "idle" : p.pose) as ActionKind; c.moving = p.pose === "walk"; c.phase = c.t * 6.5; c.speed = 1.4; c.talking = p.pose === "talk"; c.speaking = true;
    animate(anim, c, p.t != null ? 1 : 0.016);
    if (cam.current) { cam.current.position.set(Math.sin(0.55) * dist, cy + span * 0.1, Math.cos(0.55) * dist); cam.current.lookAt(0, cy, 0); }
  });
  return (
    <>
      <PerspectiveCamera ref={cam} makeDefault fov={26} near={0.05} far={30} />
      <color attach="background" args={[`hsl(${(IDS.indexOf(id) * 47) % 360} 30% 78%)`]} />
      <hemisphereLight args={["#dfe8f4", "#6a5a4a", 1.2]} />
      <directionalLight position={[-1.2, 1.6, 2.2]} intensity={2.4} color="#fff4e0" />
      <directionalLight position={[1.8, 0.6, 1.4]} intensity={0.9} color="#cfe2ff" />
      <directionalLight position={[0.6, 1.2, -2.2]} intensity={0.8} />
      <primitive object={rig.mesh} />
    </>
  );
}

export default function DevCastPage() {
  const p = useParams();
  if (p.view === "close") {
    const ids = IDS.slice(p.from, p.from + 8);
    return (
      <main style={{ height: "100vh", width: "100vw", background: "#1b2230", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: 6, padding: 6, boxSizing: "border-box" }}>
        {ids.map((id) => (
          <div key={id} style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}>
            <Canvas dpr={1} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
              <Suspense fallback={null}><CloseUp id={id} p={p} /></Suspense>
            </Canvas>
            <div style={{ position: "absolute", left: 8, bottom: 6, color: "#fff", fontFamily: "system-ui, sans-serif", fontSize: 13, fontWeight: 700, textShadow: "0 1px 3px #000" }}>
              {NAME.get(id)} <span style={{ fontWeight: 400, opacity: 0.85 }}>— {appearanceOf(id).signature}</span>
            </div>
          </div>
        ))}
      </main>
    );
  }
  return (
    <main style={{ height: "100vh", width: "100vw", background: "#8fb4d9" }}>
      <Canvas shadows={!p.lite} dpr={1} camera={{ fov: 20, position: [0, 8, 44], near: 0.1, far: 200 }} gl={{ antialias: !p.lite, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
        <Suspense fallback={null}><Grid p={p} /></Suspense>
      </Canvas>
    </main>
  );
}
