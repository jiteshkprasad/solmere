/**
 * Atmosphere: drives the shared `sky` state from the sim clock and the world's
 * event cards (storm), and owns the lights, fog, renderer exposure and the
 * shadow camera (4096 map, tight frustum that follows what the camera looks at).
 * Sky dome / sun / moon / stars live in env/SkyDome, clouds in env/Clouds.
 */
"use client";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useWorld } from "@/lib/store";
import { simHour } from "./content";
import { sky, updateSky, lerp } from "./palette";
import { terrainHeight } from "./terrain";
import SkyDome from "./env/SkyDome";
import Clouds from "./env/Clouds";

const _dir = new THREE.Vector3(), _focus = new THREE.Vector3(150, 3, -150), _tmp = new THREE.Vector3();
const STORM_FOG = new THREE.Color("#8d949c");
/** shadow map size — 4096 by default; `?shadow=2048` for slow software renderers / screenshots */
const SHADOW_SIZE = (() => { if (typeof window === "undefined") return 4096; const v = Number(new URLSearchParams(window.location.search).get("shadow")); return v >= 512 && v <= 8192 ? v : 4096; })();

export default function Atmosphere() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const { scene, gl } = useThree();

  const fog = useMemo(() => new THREE.Fog("#cfe6f8", 250, 800), []);
  useMemo(() => { scene.fog = fog; }, [scene, fog]);
  const stormT = useRef(0);
  const shadowSize = useRef(200);

  useFrame(({ camera }, dt) => {
    const h = simHour();
    updateSky(h);
    // storm weight: eases in/out over a few seconds when the "storm" card is active
    const st = useWorld.getState();
    const cards = st.snapshot?.activeWorldEvents ?? [];
    const stormOn = cards.some((c) => c.cardId === "storm" || /storm/i.test(c.title));
    stormT.current = lerp(stormT.current, stormOn ? 1 : 0, Math.min(1, dt * 0.35));
    sky.storm = stormT.current < 0.005 ? 0 : stormT.current;
    const storm = sky.storm;
    // moon phase from the sim day (29.5-day cycle, starts waxing gibbous)
    const day = st.time?.day ?? 3;
    sky.moonPhase = ((day + 14) % 29.5) / 29.5;
    // dawn mist: thicker fog around sunrise
    const dawn = 1 - Math.min(1, Math.abs(h - 6.4) / 1.6);
    const fogMul = (1 - 0.18 * dawn * dawn) * (1 - 0.5 * storm);

    // where is the camera looking? march the view ray to the ground for the shadow focus
    camera.getWorldDirection(_dir);
    const groundY = terrainHeight(camera.position.x, -camera.position.z);
    let t = _dir.y < -0.02 ? (camera.position.y - Math.max(groundY, 0) - 1) / -_dir.y : 400;
    t = THREE.MathUtils.clamp(t, 8, 420);
    _tmp.copy(camera.position).addScaledVector(_dir, t);
    _focus.lerp(_tmp, Math.min(1, dt * 4));
    const dist = camera.position.distanceTo(_focus);
    const wantSize = THREE.MathUtils.clamp(dist * 0.85 + 30, 45, 215);
    shadowSize.current = lerp(shadowSize.current, wantSize, Math.min(1, dt * 3));

    const s = sun.current, a = amb.current, hm = hemi.current;
    if (s) {
      const size = Math.round(shadowSize.current / 5) * 5;
      const fx = Math.round(_focus.x), fz = Math.round(_focus.z), fy = Math.round(_focus.y);
      s.position.set(fx, fy, fz).addScaledVector(sky.sunDir, 380);
      s.target.position.set(fx, fy, fz);
      s.target.updateMatrixWorld();
      s.color.copy(sky.sun).lerp(STORM_FOG, storm * 0.5);
      s.intensity = sky.sunI * (1 - storm * 0.55);
      const cam = s.shadow.camera;
      if (cam.right !== size) { cam.left = -size; cam.right = size; cam.top = size; cam.bottom = -size; cam.updateProjectionMatrix(); }
      s.shadow.bias = -0.00025 - size * 0.0000015;
      s.shadow.normalBias = 0.02 + size * 0.0004;
    }
    if (a) { a.color.copy(sky.ambC).lerp(STORM_FOG, storm * 0.4); a.intensity = sky.amb * (1 + storm * 0.25); }
    if (hm) { hm.color.copy(sky.hemiSky).lerp(STORM_FOG, storm * 0.5); hm.groundColor.copy(sky.hemiGround); hm.intensity = (0.35 + (1 - sky.night) * 0.55) * (1 - storm * 0.25); } // a bit more sky fill by day: softer, bluer shadow sides
    fog.color.copy(sky.horizon).lerp(sky.mid, 0.45).lerp(STORM_FOG, storm * 0.8);
    fog.far = sky.fogFar * fogMul;
    fog.near = fog.far * (0.55 - 0.12 * dawn * dawn - 0.25 * storm);
    gl.toneMappingExposure = sky.exposure * (1 - storm * 0.12);
  });

  return (
    <>
      <SkyDome />
      <Clouds />
      <ambientLight ref={amb} intensity={0.5} />
      <hemisphereLight ref={hemi} intensity={0.5} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2}
        position={[150, 200, 0]}
        shadow-mapSize={[SHADOW_SIZE, SHADOW_SIZE]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-radius={3}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
        shadow-camera-near={20}
        shadow-camera-far={900}
      />
    </>
  );
}
