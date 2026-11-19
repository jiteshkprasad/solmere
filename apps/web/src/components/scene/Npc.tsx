/**
 * 50 townsfolk, each a unique skinned low-poly figure built from
 * content/appearance.json (characters/builder.ts) and posed procedurally every
 * frame (characters/animation.ts). One draw call per character; the mood ring
 * and the select/follow marker are two shared InstancedMeshes.
 *
 * Per-frame transforms come from npcRuntime (tweened positions), not React.
 * React only re-renders when the *set* of NPC ids changes.
 */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useWorld } from "@/lib/store";
import { npcRender, stepRuntime, syncRuntime, pushPositions, pushPositionsFromStates, type NpcRender } from "./npcRuntime";
import { onPositions, lastPosFrameAt } from "@/lib/posBus";
import { hash01, MOOD_COLOR, NPC_SCALE } from "./palette";
import { getCharacter, hasCharacter, type Character } from "./characters";
import { animate, type AnimCtx } from "./characters/animation";
import { PortraitRenderer } from "./characters/portraits";
import { hoverState } from "./overlay";

const CAP = 64;
const S = NPC_SCALE;
const ANIM_RADIUS = 220; // beyond this (m) characters keep their last pose
/** distance size boost: none within BOOST_NEAR m of the camera, then +1 per BOOST_SPAN m, capped */
const BOOST_NEAR = 45, BOOST_SPAN = 150, BOOST_MAX = 1.65;

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _cam = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const TOWN_SPHERE = new THREE.Sphere(new THREE.Vector3(150, 0, -150), 700);

const ctx: AnimCtx = { t: 0, moving: false, phase: 0, speed: 0, action: "idle", talking: false, speaking: false, seed: 0 };
/** dev stats (read by window.__npcStats): last full-frame renderer counters + smoothed frame time */
const stats = { calls: 0, triangles: 0, frameMs: 0, animMs: 0 };

export default function NpcLayer() {
  const gl = useThree((s) => s.gl);
  const ring = useRef<THREE.InstancedMesh>(null);
  const marker = useRef<THREE.InstancedMesh>(null);
  const [ids, setIds] = useState<string[]>(() => Object.keys(useWorld.getState().npcs).sort());
  const idsRef = useRef(ids);
  const portraits = useRef<PortraitRenderer | null>(null);

  // keep the runtime in sync with the store, re-render only when the id set changes
  useEffect(() => {
    const s0 = useWorld.getState();
    syncRuntime(s0.npcs, s0.conversations);
    pushPositionsFromStates(s0.npcs);
    const offPos = onPositions(pushPositions);
    const offStore = useWorld.subscribe((s, prev) => {
      if (s.npcs === prev.npcs && s.conversations === prev.conversations) return;
      syncRuntime(s.npcs, s.conversations);
      // engines that only emit the 1 Hz tick (older builds, replays) still animate,
      // just with fewer samples between which to interpolate
      if (Date.now() - lastPosFrameAt > 1500) pushPositionsFromStates(s.npcs);
      const k = Object.keys(s.npcs);
      const cur = idsRef.current;
      if (k.length !== cur.length || k.some((id) => !npcRender.has(id) || !cur.includes(id))) {
        const sorted = k.sort();
        idsRef.current = sorted;
        setIds(sorted);
      }
    });
    return () => { offPos(); offStore(); };
  }, []);

  // one rig per id: cached ones are used at once, the rest are built a few per frame (≈6 ms budget) so mounting never hitches
  const [chars, setChars] = useState<Character[]>([]);
  const queue = useRef<string[]>([]);
  /** built-but-not-yet-committed rigs, flushed in batches (see the build loop below) */
  const pendingChars = useRef<Character[]>([]);
  const lastFlush = useRef(0);
  useEffect(() => {
    const wanted = ids.slice(0, CAP);
    queue.current = wanted.filter((id) => !hasCharacter(id));
    setChars(wanted.filter(hasCharacter).map(getCharacter));
  }, [ids]);
  const seeds = useMemo(() => chars.map((c) => hash01(c.rig.id, 3)), [chars]);
  useEffect(() => {
    if (!chars.length || queue.current.length || portraits.current) return;
    if (typeof window !== "undefined" && window.location.search.includes("noportraits")) return;
    portraits.current = new PortraitRenderer(chars.map((c) => c.rig.id));
  }, [chars]);
  // dev hook: renderer stats for the whole frame (characters are 1 draw call each + shadow pass)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __npcStats?: () => unknown };
    w.__npcStats = () => ({ characters: chars.length, visible: chars.filter((c) => c.rig.mesh.visible).length, calls: stats.calls, triangles: stats.triangles, frameMs: +stats.frameMs.toFixed(1), animMs: +stats.animMs.toFixed(2), geometries: gl.info.memory.geometries, portraits: portraits.current ? chars.length - portraits.current.pending : 0 });
    return () => { delete w.__npcStats; };
  }, [chars, gl]);

  useFrame(({ clock, camera }, dt) => {
    // previous frame's counters (info resets at the start of each render)
    stats.calls = gl.info.render.calls; stats.triangles = gl.info.render.triangles;
    stats.frameMs += (dt * 1000 - stats.frameMs) * 0.1;
    const tA = performance.now();
    const step = Math.min(dt, 0.1);
    stepRuntime(step);
    if (queue.current.length) {
      while (queue.current.length && performance.now() - tA < 6) pendingChars.current.push(getCharacter(queue.current.shift()!));
      // Commit in batches, not every frame. Committing per frame re-rendered up to
      // 50 <primitive> children ~50 frames in a row during startup, which is a
      // visible hitch. Order only has to be stable (it indexes the instanced ring
      // and marker meshes), so append — the old .sort() was pure waste.
      const now = performance.now();
      if (pendingChars.current.length && (!queue.current.length || now - lastFlush.current > 120)) {
        lastFlush.current = now;
        const batch = pendingChars.current;
        pendingChars.current = [];
        setChars((c) => [...c, ...batch]);
      }
    }
    const st = useWorld.getState();
    const ui = st.ui;
    const t = clock.elapsedTime;
    camera.getWorldPosition(_cam);
    const R = ring.current, M = marker.current;
    for (let i = 0; i < chars.length; i++) {
      const { rig, anim } = chars[i];
      const mesh = rig.mesh;
      const r: NpcRender | undefined = npcRender.get(rig.id);
      if (!r || !r.visible) { mesh.visible = false; R?.setMatrixAt(i, ZERO); M?.setMatrixAt(i, ZERO); continue; }
      mesh.visible = true;
      mesh.position.set(r.x, r.y, r.z);
      mesh.rotation.y = r.heading;
      // people grow a little with camera distance so they still read as people from the
      // overview (a 3.5 m figure is a few pixels at 250 m) while staying in proportion up close
      const dCam = Math.hypot(r.x - _cam.x, r.y - _cam.y, r.z - _cam.z);
      const boost = dCam <= BOOST_NEAR ? 1 : Math.min(BOOST_MAX, 1 + (dCam - BOOST_NEAR) / BOOST_SPAN);
      r.boost = boost;
      const sc = S * boost;
      mesh.scale.setScalar(sc);
      r.headTop = rig.headTop * sc;
      // animation context
      const near = Math.abs(r.x - _cam.x) + Math.abs(r.z - _cam.z) < ANIM_RADIUS;
      if (near) {
        ctx.t = t; ctx.moving = r.moving; ctx.phase = r.phase; ctx.speed = r.speed / S; ctx.action = r.action; ctx.seed = seeds[i];
        ctx.talking = r.conversationId !== null && (r.action === "talk" || r.partnerId !== null);
        let speaking = false;
        if (r.conversationId) { const c = st.conversations[r.conversationId]; if (c && !c.done) speaking = c.lines[c.cursor]?.speaker === rig.id; }
        ctx.speaking = speaking;
        animate(anim, ctx, step);
      }
      // mood ring (flat on the ground) + selection marker
      const selected = rig.id === ui.selectedNpcId, followed = rig.id === ui.followNpcId;
      const moodC = MOOD_COLOR[r.mood];
      if (R) {
        if (selected || followed || moodC) {
          const pulse = selected || followed ? 1.05 + Math.sin(t * 4) * 0.08 : 1;
          _p.set(r.x, r.y + 0.04, r.z); _e.set(0, 0, 0); _q.setFromEuler(_e); _s.set(pulse * sc, 1, pulse * sc);
          R.setMatrixAt(i, _m.compose(_p, _q, _s));
          R.setColorAt(i, _c.set(selected ? "#ffd23c" : followed ? "#7fd4ff" : moodC!));
        } else R.setMatrixAt(i, ZERO);
      }
      if (M) {
        if (selected || followed) {
          _p.set(r.x, r.y + rig.headTop * sc + 0.55 * boost + Math.sin(t * 3) * 0.08, r.z); _e.set(0, t * 1.5, 0); _q.setFromEuler(_e); _s.set(boost, boost, boost);
          M.setMatrixAt(i, _m.compose(_p, _q, _s));
          M.setColorAt(i, _c.set(selected ? "#ffd23c" : "#7fd4ff"));
        } else M.setMatrixAt(i, ZERO);
      }
    }
    stats.animMs += (performance.now() - tA - stats.animMs) * 0.1;
    if (R) { R.count = chars.length; R.instanceMatrix.needsUpdate = true; if (R.instanceColor) R.instanceColor.needsUpdate = true; }
    if (M) { M.count = chars.length; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true; }
    // one portrait per frame, after the crowd has settled in (keeps the first seconds smooth)
    const pr = portraits.current;
    if (pr && pr.pending && t > 1.5) pr.step(gl);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = e.object.userData.npcId as string | undefined;
    if (id) useWorld.getState().selectNpc(id);
  };
  const onDouble = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = e.object.userData.npcId as string | undefined;
    if (id) { useWorld.getState().selectNpc(id); useWorld.getState().follow(id); }
  };
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation(); document.body.style.cursor = "pointer";
    hoverState.npcId = (e.object.userData.npcId as string | undefined) ?? null;
  };
  const out = () => { document.body.style.cursor = "auto"; hoverState.npcId = null; };

  const ringGeo = useMemo(() => { const g = new THREE.RingGeometry(0.5, 0.75, 20); g.rotateX(-Math.PI / 2); return g; }, []);
  const markerGeo = useMemo(() => { const g = new THREE.ConeGeometry(0.28, 0.6, 4); g.rotateX(Math.PI); return g; }, []);

  return (
    <group>
      {chars.map((c) => (
        <primitive key={c.rig.id} object={c.rig.mesh} onClick={onClick} onDoubleClick={onDouble} onPointerOver={over} onPointerOut={out} />
      ))}
      <instancedMesh ref={(el) => { if (el) { ring.current = el; el.boundingSphere = TOWN_SPHERE; } }} args={[ringGeo, undefined, CAP]} frustumCulled={false}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.75} depthWrite={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={(el) => { if (el) { marker.current = el; el.boundingSphere = TOWN_SPHERE; } }} args={[markerGeo, undefined, CAP]} frustumCulled={false}>
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.35} roughness={0.5} />
      </instancedMesh>
    </group>
  );
}
