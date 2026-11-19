/**
 * The 3D viewport: Canvas + atmosphere + town + NPCs + camera rig + post stack,
 * with a DOM overlay for labels/speech bubbles and the director's cut-fade.
 *
 * Startup is **staged** so something is on screen almost immediately instead of
 * after one long stall (see NOTES-perf.md):
 *
 *   1. the Canvas paints the sky + terrain-less atmosphere on frame 1;
 *   2. `<Town/>` (buildings + life, the biggest chunk) mounts on the next frame;
 *   3. `<NpcLayer/>` streams the 50 rigs in once the town has painted;
 *   4. `<Effects/>` compiles the post stack in three steps after that;
 *   5. `<AudioLayer/>` last — nothing about the first paint depends on it.
 *
 * Every stage is a separate JS chunk (React.lazy), prefetched in the background
 * so the network work overlaps the CPU work. Milestones go to `perf/marks.ts`,
 * which drives `<LoadingScreen/>`'s progress bar and the `?stats=1` overlay.
 *
 * Renderer: ACES tone mapping (exposure driven by palette.sky), PCFSoft shadows
 * (size + cadence from the quality tier), adaptive dpr, AA via SMAA (MSAA off).
 */
"use client";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { api } from "@/lib/engineClient";
import { startDirector } from "@/lib/director";
import { useWorld } from "@/lib/store";
import { setContent, useContent } from "./content";
import Atmosphere from "./Atmosphere";
import CameraRig, { OVERVIEW_POS } from "./CameraRig";
import { OverlayProjector, OVERLAY_CSS, setFadeElement } from "./overlay";
import { TownLabels, NpcLabels } from "./Labels";
import SpeechBubbles from "./SpeechBubbles";
import { hasCharacter } from "./characters";
import { getQuality, probeRenderer, setRenderStats, tickFps, useQuality } from "./env/perf";
import { mark, setPeople, setPhase } from "./perf/marks";

const MOCK = process.env.NEXT_PUBLIC_MOCK_WORLD === "1";

/* Everything below the first painted frame is a separate chunk. */
const Town = lazy(() => import("./Town"));
const NpcLayer = lazy(() => import("./Npc"));
const Effects = lazy(() => import("./env/Effects"));
const AudioLayer = lazy(() => import("./audio/AudioLayer"));
const StatsOverlay = lazy(() => import("./perf/Stats"));

/** if a stage hasn't been reached by now, mount it anyway and let the scene catch up */
const STAGE_TIMEOUT_MS = 9000;

interface Stages { town: boolean; people: boolean; post: boolean; audio: boolean }

export default function Scene() {
  const content = useContent();
  const [error, setError] = useState<string | null>(null);
  const q = useQuality();
  // ?boot=eager reproduces the old behaviour (everything mounted in one go) so
  // the staged path can be measured against it on the same build — see NOTES-perf.md
  const [eager] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("boot") === "eager");
  const [stages, setStages] = useState<Stages>({ town: eager, people: eager, post: eager, audio: eager });
  const [stats] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("stats"));

  useEffect(() => {
    mark("scene-mount");
    setPhase("content");
    let stopMock: (() => void) | undefined;
    let cancelled = false;
    if (MOCK) {
      import("./DevMock").then((m) => { if (!cancelled) { stopMock = m.startDevMock(); mark("content"); } });
    } else if (!content) {
      const load = (attempt = 0) => api.content().then((c) => { if (!cancelled) { setContent({ town: c.town, cast: c.cast }); mark("content"); } }).catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setTimeout(() => load(attempt + 1), Math.min(8000, 1000 * 2 ** attempt));
      });
      load();
    }
    const stopDirector = startDirector();
    // warm the chunks while the canvas is still booting — the import is free once cached
    const prefetch = window.setTimeout(() => {
      void import("./Town");
      void import("./Npc");
      window.setTimeout(() => { void import("./env/Effects"); void import("./audio/AudioLayer"); }, 300);
    }, 0);
    return () => { cancelled = true; window.clearTimeout(prefetch); stopMock?.(); stopDirector(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full" style={{ background: "#0b1020" }}>
      <style>{OVERLAY_CSS}</style>
      <Canvas
        shadows="soft"
        dpr={q.dpr}
        camera={{ fov: 42, near: 0.5, far: 3000, position: OVERVIEW_POS.toArray() as [number, number, number] }}
        gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, stencil: false }}
        onCreated={({ gl }) => {
          mark("gl");
          gl.setClearColor("#0b1020");
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          probeRenderer(gl);
          setPhase("canvas");
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Atmosphere />
        <CameraRig />
        <OverlayProjector />
        <BootDirector content={!!content} stages={stages} setStages={setStages} />
        {content && (stages.town || eager) && <Suspense fallback={null}><Town town={content.town} /></Suspense>}
        {stages.people && <Suspense fallback={null}><NpcLayer /></Suspense>}
        {stages.post && <Suspense fallback={null}><Effects /></Suspense>}
        {stages.audio && <Suspense fallback={null}><AudioLayer /></Suspense>}
      </Canvas>
      <div className="sc-overlay">
        <TownLabels />
        <NpcLabels />
        <SpeechBubbles />
        <div className="sc-fade" ref={setFadeElement} />
      </div>
      {stats && <Suspense fallback={null}><StatsOverlay /></Suspense>}
      {error && !content && (
        <div style={{ position: "absolute", left: 16, bottom: 16, color: "#94a3b8", fontSize: 12, pointerEvents: "none" }}>waiting for the engine…</div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * BootDirector — the only always-mounted useFrame. It owns:
 *   - the frame-time histogram + renderer counters (perf.ts),
 *   - the staged mount schedule above,
 *   - shadow-map size and update cadence for the current quality tier.
 * ------------------------------------------------------------------------- */
function BootDirector({ content, stages, setStages }: { content: boolean; stages: Stages; setStages: (fn: (s: Stages) => Stages) => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const frames = useRef(0);
  const townFrames = useRef(0);
  const shadowTick = useRef(0);
  const t0 = useRef(0);
  const peopleDone = useRef(false);
  const st = useRef(stages);
  st.current = stages;

  // shadow map: the tier picks the resolution; Atmosphere's ?shadow= override wins
  useEffect(() => {
    const forced = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("shadow");
    if (forced) return;
    const size = getQuality().shadowSize;
    scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (l.isDirectionalLight && l.castShadow && l.shadow.mapSize.x !== size) {
        l.shadow.mapSize.set(size, size);
        l.shadow.map?.dispose();
        l.shadow.map = null as unknown as THREE.WebGLRenderTarget;
      }
    });
  }, [scene, stages.town, stages.post]);

  useFrame(() => {
    const now = performance.now();
    tickFps(now);
    setRenderStats(gl.info.render.calls, gl.info.render.triangles, gl.info.programs?.length ?? 0);
    const n = ++frames.current;
    if (n === 1) { t0.current = now; mark("first-frame"); setPhase("town", 0.05); }

    // shadows: only re-render the map every Nth frame (the sun barely moves, and
    // the town is static — only the 50 walkers change, which reads fine at 2–3 Hz-ish)
    const every = getQuality().shadowEvery;
    if (every > 1) {
      if (gl.shadowMap.autoUpdate) gl.shadowMap.autoUpdate = false;
      if (++shadowTick.current >= every) { shadowTick.current = 0; gl.shadowMap.needsUpdate = true; }
    } else if (!gl.shadowMap.autoUpdate) { gl.shadowMap.autoUpdate = true; }

    const s = st.current;
    // 1) town on the frame after the first painted one
    if (!s.town && n >= 2 && content) { setStages((p) => ({ ...p, town: true })); return; }
    if (!s.town) return;
    townFrames.current++;
    if (townFrames.current === 2) { mark("town-painted"); setPhase("town", 1); }
    // 2) people once the town has actually painted a frame
    if (!s.people && townFrames.current >= 3) { setStages((p) => ({ ...p, people: true })); return; }
    if (!s.people) return;

    // rig progress — 50 map lookups every 5th frame, and nothing at all once the
    // crowd is complete (this useFrame must stay allocation-free after startup)
    if (!peopleDone.current && n % 5 === 0) {
      const ids = Object.keys(useWorld.getState().npcs);
      let built = 0;
      for (let i = 0; i < ids.length; i++) if (hasCharacter(ids[i])) built++;
      setPeople(built, ids.length);
      if (ids.length && built >= ids.length) peopleDone.current = true;
    }
    // 3) post stack once the crowd is complete, or after 4 s either way
    if (!s.post && (peopleDone.current || now - t0.current > 4000)) { setStages((p) => ({ ...p, post: true })); mark("post-start"); return; }
    if (!s.post) return;
    if (!s.audio && now - t0.current > 1500) { setStages((p) => ({ ...p, audio: true })); return; }
  });

  // a stage that never arrived (a chunk that 404s, an empty world) must not hold
  // the rest back; the loading screen has its own hard timeout for the fade
  useEffect(() => {
    const t = window.setTimeout(() => {
      setStages((p) => ({ town: p.town || content, people: true, post: true, audio: true }));
      mark("stage-timeout");
    }, STAGE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [content, setStages]);

  return null;
}
