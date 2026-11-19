/**
 * LIFE — everything that moves or lives in the town that is not a person or a building:
 * boats under way, gulls, chimney smoke, flags, laundry, animals, weather particles,
 * festival dressing and small ambient beats. Mounted by Town.tsx as <Life town={town} />.
 *
 * Systems read the sim through `lifeState` (life/state.ts), which <LifeClock/> refreshes
 * once per frame from the store (time, activeWorldEvents), palette.sky and the camera.
 * See apps/web/NOTES-life.md for the map of systems, schedules and draw-call budget.
 */
"use client";
import { useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { TownContent } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { layoutTown, type TownLayout } from "../buildings/layout";
import { lifeState, stepLifeState, triggerLightning } from "./state";
import { npcRender } from "../npcRuntime";
import Particles, { particleUsage } from "./particles";
import Smoke from "./smoke";
import Sea from "./sea";
import Birds, { Owl } from "./birds";
import Cloth from "./cloth";
import Animals from "./animals";
import Weather from "./weather";
import Festival from "./festival";
import Beats from "./beats";

export { lifeState } from "./state";

/** Refreshes lifeState before every other life system runs (priority −1). */
function LifeClock({ groupRef, L }: { groupRef: React.RefObject<THREE.Group | null>; L: TownLayout }) {
  const { camera, gl, scene } = useThree();
  useFrame((_, dt) => stepLifeState(Math.min(dt, 0.1), camera), -1);
  // dev hook: window.__life — inspect state, inject world events / set the hour, count draw calls
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __life?: unknown };
    w.__life = {
      state: lifeState,
      layout: L,
      particles: particleUsage,
      calls: () => gl.info.render.calls,
      /**
       * Draw calls the life layer costs. Scene.tsx only refreshes the shadow map every
       * Nth frame, so a single frame's `calls` swings by ~100 — sample a run of frames in
       * each state and compare like with like: `colour` is the colour pass alone (the
       * cheapest frame of the run), `shadow` a frame that also rebuilt the shadow map.
       */
      lifeCalls: async (frames = 40) => {
        const g = groupRef.current;
        if (!g) return -1;
        const sample = async () => {
          const o: number[] = [];
          for (let i = 0; i < frames; i++) o.push(await new Promise<number>((r) => requestAnimationFrame(() => r(gl.info.render.calls))));
          o.sort((a, b) => a - b);
          return { min: o[0], max: o[o.length - 1] };
        };
        const was = g.visible;
        g.visible = true; const on = await sample();
        g.visible = false; const off = await sample();
        g.visible = was;
        return { on, off, colour: on.min - off.min, shadow: on.max - off.max };
      },
      /** per-subsystem colour-pass cost: hide one child of <group name="life"> at a time */
      breakdown: async () => {
        const g = groupRef.current;
        if (!g) return [];
        const sample = async () => { const o: number[] = []; for (let i = 0; i < 24; i++) o.push(await new Promise<number>((r) => requestAnimationFrame(() => r(gl.info.render.calls)))); return Math.min(...o); };
        const base = await sample();
        const rows: Array<{ i: number; cost: number }> = [];
        for (let i = 0; i < g.children.length; i++) {
          const c = g.children[i];
          if (!c.visible) continue;
          c.visible = false;
          const off = await sample();
          c.visible = true;
          rows.push({ i, cost: base - off });
        }
        return { base, rows };
      },
      /** every drawable in the life group that is actually visible right now */
      meshes: () => {
        const g = groupRef.current;
        const out: Array<{ name: string; type: string; shadow: boolean }> = [];
        g?.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if ((o as unknown as { isMesh?: boolean; isPoints?: boolean; isLine?: boolean }).isMesh ||
              (o as unknown as { isPoints?: boolean }).isPoints ||
              (o as unknown as { isLine?: boolean }).isLine) out.push({ name: o.name || o.type, type: o.type, shadow: !!m.castShadow });
        });
        return { count: out.length, shadowCasters: out.filter((o) => o.shadow).length, list: out };
      },
      /** drop a phantom pedestrian at (x,z) for `ms` so the sparrow-scatter rule can be screenshotted */
      scare: (x = 150, z = -120, ms = 6000) => {
        const any = npcRender.values().next().value;
        if (!any) return false;
        npcRender.set("__devScare", { ...any, id: "__devScare", x, z, visible: true, moving: true });
        window.setTimeout(() => npcRender.delete("__devScare"), ms);
        return true;
      },
      /** fire a lightning strike right now (dev screenshots) */
      flash: (holdSeconds = 0) => triggerLightning(holdSeconds),
      setEvents: (ids: string[]) => {
        const st = useWorld.getState();
        if (!st.snapshot) return;
        useWorld.setState({ snapshot: { ...st.snapshot, activeWorldEvents: ids.map((cardId) => ({ cardId, title: cardId, endsDay: 999 })) } });
      },
      setHour: (hour: number, minute?: number) => {
        const st = useWorld.getState();
        if (!st.time) return;
        const h = Math.floor(hour), m = minute ?? Math.round((hour - h) * 60);
        useWorld.setState({ time: { ...st.time, hour: h, minute: m, wallMs: Date.now() } });
      },
    };
    return () => { delete w.__life; };
  }, [gl, scene, camera, groupRef, L]);
  return null;
}

export default function Life({ town }: { town: TownContent }) {
  const L: TownLayout = useMemo(() => layoutTown(town), [town]);
  const groupRef = useRef<THREE.Group>(null);
  return (
    <group name="life" ref={groupRef}>
      <LifeClock groupRef={groupRef} L={L} />
      <Particles />
      <Smoke L={L} />
      <Sea L={L} />
      <Birds />
      <Owl />
      <Cloth L={L} />
      <Animals L={L} />
      <Weather />
      <Festival L={L} />
      <Beats />
    </group>
  );
}
