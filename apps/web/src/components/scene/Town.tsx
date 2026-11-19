/**
 * ENVIRONMENT + composition root: terrain, water, roads, fields, vegetation.
 * Mounts <Buildings/> (structures) and <Life/> (ambient life).
 *
 * Dev hook: window.__envInfo() → draw calls / triangles for the whole frame and
 * for the environment alone (buildings + life hidden for one measurement render).
 */
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { TownContent } from "@npcworld/schema";
import { layoutTown, type TownLayout } from "./buildings/layout";
import { sky } from "./palette";
import Buildings from "./buildings";
import Life from "./life";
import Ground, { groundStats } from "./env/Ground";
import Water from "./env/Water";
import Roads from "./env/Roads";
import Vegetation from "./env/Vegetation";
import { buildFieldGeometry } from "./env/terrainGeometry";
import { envUniforms } from "./env/materials";
import { getQuality, lastFps } from "./env/perf";
import { dofFocus } from "./env/focus";
import { npcRender } from "./npcRuntime";
import { locWorld } from "./content";
import { useWorld } from "@/lib/store";

function Field({ cx, cy, w, d, color }: { cx: number; cy: number; w: number; d: number; color: string }) {
  const geo = useMemo(() => buildFieldGeometry(cx, cy, w, d, color, 0.05), [cx, cy, w, d, color]);
  const m = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), []);
  return <mesh geometry={geo} material={m} receiveShadow />;
}

/* ----------------------------------- town ----------------------------------- */

export default function Town({ town }: { town: TownContent }) {
  const L: TownLayout = useMemo(() => layoutTown(town), [town]);
  const others = useRef<THREE.Group>(null);
  const { gl, scene, camera } = useThree();

  useFrame(({ clock }) => {
    envUniforms.uTime.value = clock.elapsedTime;
    envUniforms.uWind.value = 1 + sky.storm * 1.6;
  });

  // depth-of-field focus: the followed NPC, else the director's subject / location
  useEffect(() => {
    dofFocus.provider = (out) => {
      const ui = useWorld.getState().ui;
      const id = ui.followNpcId ?? ui.directorFocus?.npcIds[0] ?? null;
      const r = id ? npcRender.get(id) : undefined;
      if (r && r.visible) { out.set(r.x, r.y + 1.5, r.z); return true; }
      const p = ui.directorFocus?.locationId ? locWorld(ui.directorFocus.locationId) : null;
      if (p) { out.set(p[0], p[1] + 1.5, p[2]); return true; }
      return false;
    };
    return () => { dofFocus.provider = null; };
  }, []);

  // dev hook for the screenshot / perf scripts
  useEffect(() => {
    const w = window as unknown as { __envInfo?: () => unknown };
    w.__envInfo = () => {
      // measure one plain scene render (shadow pass included), then the same with buildings + life hidden
      gl.info.autoReset = false;
      gl.info.reset(); gl.render(scene, camera);
      const all = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
      let env = all;
      const g = others.current;
      if (g) {
        const was = g.visible; g.visible = false;
        gl.info.reset(); gl.render(scene, camera);
        env = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
        g.visible = was;
      }
      gl.info.autoReset = true;
      return { frame: all, environmentOnly: env, groundTriangles: groundStats.triangles, quality: getQuality(), fps: Math.round(lastFps), hour: +sky.hour.toFixed(2), storm: sky.storm };
    };
    return () => { delete w.__envInfo; };
  }, [gl, scene, camera]);

  return (
    <group>
      <Ground />
      <Water />
      <Roads />
      {L.fields.map((f, i) => <Field key={i} cx={f.cx} cy={f.cy} w={f.w} d={f.d} color={f.color} />)}
      <Vegetation town={town} layout={L} />
      <group ref={others}>
        <Buildings town={town} />
        <Life town={town} />
      </group>
    </group>
  );
}
