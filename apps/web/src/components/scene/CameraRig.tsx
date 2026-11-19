/**
 * Camera modes: overview ("Explore": free map-style camera), follow (chase cam you can orbit around),
 * director (cinematic dolly/orbit around ui.directorFocus, cutting with a fade).
 * Keys: 1/2/3 switch modes, Escape → overview; in Explore WASD/arrows move, Q/E turn, R/F tilt, +/- zoom.
 *
 * Explore gestures (map style, the same on every screen): drag = move over the town, pinch / scroll =
 * zoom toward the finger or cursor, two-finger drag / right-drag / shift-drag = turn and tilt.
 * Any drag, pinch or scroll while the Director (or a one-finger drag while following) hands the
 * camera to the viewer right where it is: no fly back to the middle of town.
 */
"use client";
import { useEffect, useRef, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useWorld, type CameraMode } from "@/lib/store";
import { npcRender, centroid } from "./npcRuntime";
import { locWorld } from "./content";
import { terrainHeight } from "./terrain";
import { fadeCut, FADE_CUT_MS } from "./overlay";
import { hash01, NPC_SCALE, sky } from "./palette";
import { footprints, insideBox, type Footprint } from "./buildings/layout";
import { directorState } from "@/lib/director";
import { registerCameraApi } from "@/lib/cameraApi";
import { track } from "@/lib/analytics";
import { viewInset } from "@/lib/viewInset";

export const OVERVIEW_POS = new THREE.Vector3(150, 122, 66);
export const OVERVIEW_TARGET = new THREE.Vector3(150, 0, -156);

/** follow cam: distance behind the person and height above their eyes (m) */
const FOLLOW_DIST = 7.5, FOLLOW_RISE = 2.0;
/** vertical fov on landscape screens; portrait screens widen it so the horizontal view isn't a slit */
const FOV_LANDSCAPE = 42, FOV_PORTRAIT_MAX = 62;

interface Lens { x: number; y: number; fov: number; applied: boolean }

/**
 * Per-frame lens: (1) fov from the aspect ratio, (2) a projection offset so the
 * look-at point lands in the middle of the part of the canvas the HUD leaves
 * visible (lib/viewInset — desktop feed/drawer, phone top bar + bottom dock/sheet).
 * Both ease, so opening a panel slides the shot over instead of jumping.
 */
function frameLens(cam: THREE.PerspectiveCamera, w: number, h: number, dt: number, s: Lens) {
  if (!w || !h) return;
  const aspect = w / h;
  const fov = aspect >= 1 ? FOV_LANDSCAPE : Math.min(FOV_PORTRAIT_MAX, FOV_LANDSCAPE + (1 - aspect) * 36);
  const ins = viewInset();
  // the visible region's centre relative to the canvas centre, px (+x right, +y down)
  const tx = Math.max(-w * 0.3, Math.min(w * 0.3, (ins.left - ins.right) / 2));
  const ty = Math.max(-h * 0.3, Math.min(h * 0.3, (ins.top - ins.bottom) / 2));
  const k = s.applied ? 1 - Math.exp(-dt * 5) : 1;
  s.x += (tx - s.x) * k; s.y += (ty - s.y) * k;
  let dirty = false;
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; dirty = true; }
  const ox = -s.x, oy = -s.y;
  const v = cam.view;
  if (Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5) {
    if (v && v.enabled) { cam.clearViewOffset(); dirty = false; }
  } else if (!v || !v.enabled || v.fullWidth !== w || v.fullHeight !== h || Math.abs(v.offsetX - ox) > 0.25 || Math.abs(v.offsetY - oy) > 0.25) {
    cam.setViewOffset(w, h, ox, oy, w, h); dirty = false; // setViewOffset updates the projection itself
  }
  if (dirty) cam.updateProjectionMatrix();
  s.applied = true; s.fov = fov;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _probe = new THREE.Vector3(), _focus = { x: 150, y: 0, z: -150 };

interface Shot { key: string; angle: number; radius: number; height: number; speed: number; cutAt: number; pendingKey: string; startedAt: number; fx: number; fz: number }
interface Fly { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number; dur: number }

export default function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const size = useThree((s) => s.size);
  const lens = useRef<Lens>({ x: 0, y: 0, fov: 0, applied: false });
  const lastMode = useRef<CameraMode | null>(null);
  const lastFollow = useRef<string | null>(null);
  const fly = useRef<Fly | null>(null);
  const shot = useRef<Shot>({ key: "", angle: 0, radius: 14, height: 6, speed: 0.08, cutAt: 0, pendingKey: "", startedAt: 0, fx: 0, fz: 0 });
  const desired = useRef(new THREE.Vector3());
  const keyLight = useRef<THREE.PointLight>(null);
  const desiredT = useRef(new THREE.Vector3());
  /** the viewer grabbed the camera: switch to Explore without flying anywhere */
  const taken = useRef(false);
  /** smoothed button/keyboard nudges still to apply */
  const nudge = useRef({ rot: 0, tilt: 0, zoom: 0 });
  const keys = useRef(new Set<string>());
  const gl = useThree((s) => s.gl);

  // hand the camera to the viewer on a real gesture (a tap still selects people)
  useEffect(() => {
    const el = gl.domElement;
    const down = new Map<number, { x: number; y: number; button: number; mod: boolean }>();
    const take = (fromFollowToo: boolean) => {
      const st = useWorld.getState();
      const mode = st.ui.cameraMode;
      if (mode === "director" || (mode === "follow" && fromFollowToo)) { taken.current = true; st.setCameraMode("overview"); track("explore_takeover", { from: mode }); }
    };
    const onDown = (e: PointerEvent) => {
      down.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, mod: e.shiftKey || e.ctrlKey || e.metaKey });
      if (down.size >= 2) take(false);
    };
    const onMove = (e: PointerEvent) => {
      const d = down.get(e.pointerId);
      if (!d || down.size >= 2) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) take(d.button === 0 && !d.mod);
    };
    const onUp = (e: PointerEvent) => { down.delete(e.pointerId); };
    const onWheel = () => take(false);
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl]);

  // HUD buttons → camera
  useEffect(() => {
    const toExplore = () => { const st = useWorld.getState(); if (st.ui.cameraMode !== "overview") { taken.current = true; st.setCameraMode("overview"); } };
    registerCameraApi({
      rotate: (r) => { toExplore(); nudge.current.rot += r; },
      tilt: (r) => { toExplore(); nudge.current.tilt += r; },
      zoom: (f) => { toExplore(); nudge.current.zoom += Math.log(f); },
      home: () => { const st = useWorld.getState(); taken.current = false; if (st.ui.cameraMode !== "overview") st.setCameraMode("overview"); else startFly(OVERVIEW_POS, OVERVIEW_TARGET, 1.2); },
    });
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e", "r", "f", "+", "=", "-", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        keys.current.add(k);
        const st = useWorld.getState();
        if (st.ui.cameraMode !== "overview") { taken.current = true; st.setCameraMode("overview"); }
        if (k.startsWith("arrow")) e.preventDefault();
      }
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const st = useWorld.getState();
      if (e.key === "Escape") { st.setCameraMode("overview"); }
      else if (e.key === "1") st.setCameraMode("overview");
      else if (e.key === "2") {
        const id = st.ui.followNpcId ?? st.ui.selectedNpcId ?? Object.keys(st.npcs)[Math.floor(Math.random() * Object.keys(st.npcs).length)] ?? null;
        if (id) st.follow(id); else st.setCameraMode("follow");
      }
      else if (e.key === "3") st.setCameraMode("director");
    };
    window.addEventListener("keydown", onKey);
    // dev hook: window.__scene.flyTo([x,y,z],[tx,ty,tz]) (used by the screenshot script)
    const w = window as unknown as { __scene?: { flyTo: (p: number[], t: number[], dur?: number) => void } };
    w.__scene = { flyTo: (p, t, dur = 0.8) => { useWorld.getState().setCameraMode("overview"); lastMode.current = "overview"; startFly(new THREE.Vector3(...p), new THREE.Vector3(...t), dur); } };
    const wd = window as unknown as { __sceneDebug?: () => unknown };
    wd.__sceneDebug = () => {
      const ui = useWorld.getState().ui;
      const c = controls.current;
      return {
        mode: ui.cameraMode, focus: ui.directorFocus, follow: ui.followNpcId,
        cam: camera.position.toArray().map((v) => +v.toFixed(1)), target: c ? c.target.toArray().map((v) => +v.toFixed(1)) : null,
        groundAtCam: +terrainHeight(camera.position.x, -camera.position.z).toFixed(2),
        focusPt: { ..._focus }, shot: { ...shot.current }, fade: (document.querySelector(".sc-fade") as HTMLElement | null)?.style.opacity,
        npcs: (ui.directorFocus?.npcIds ?? []).map((id) => { const r = npcRender.get(id); return r ? [id, +r.x.toFixed(1), +r.y.toFixed(1), +r.z.toFixed(1), r.visible] : [id, "missing"]; }),
      };
    };
    return () => { window.removeEventListener("keydown", onKey); delete w.__scene; delete wd.__sceneDebug; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startFly = (to: THREE.Vector3, target: THREE.Vector3, dur = 1.2) => {
    const c = controls.current;
    fly.current = { from: camera.position.clone(), to: to.clone(), tFrom: (c ? c.target : OVERVIEW_TARGET).clone(), tTo: target.clone(), t: 0, dur };
  };

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    frameLens(camera as THREE.PerspectiveCamera, size.width, size.height, dt, lens.current);
    const ui = useWorld.getState().ui;
    const mode = ui.cameraMode;
    const now = performance.now();

    // ---- mode transitions
    if (mode !== lastMode.current) {
      const prev = lastMode.current;
      lastMode.current = mode;
      if (mode === "overview" && prev !== null) {
        if (taken.current) fly.current = null; // the viewer took over: stay exactly here
        else startFly(OVERVIEW_POS, OVERVIEW_TARGET, 1.4);
      }
      taken.current = false;
      if (mode === "director") { shot.current.key = ""; shot.current.pendingKey = ""; shot.current.cutAt = 0; shot.current.startedAt = 0; }
      if (mode === "follow") lastFollow.current = null;
      c.minDistance = mode === "follow" ? 4 : mode === "overview" ? 3 : 10;
      c.maxDistance = mode === "follow" ? 90 : 420;
      c.zoomToCursor = mode === "overview";
    }

    // ---- fly tween (used for entering overview / follow)
    if (fly.current) {
      const f = fly.current;
      f.t += dt / f.dur;
      const k = f.t >= 1 ? 1 : 1 - Math.pow(1 - f.t, 3);
      camera.position.lerpVectors(f.from, f.to, k);
      c.target.lerpVectors(f.tFrom, f.tTo, k);
      c.enabled = false;
      if (f.t >= 1) { fly.current = null; c.enabled = mode !== "director"; }
      c.update();
      return;
    }

    if (mode === "overview") {
      c.enabled = true;
      if (keyLight.current) keyLight.current.intensity = 0;
      applyNudges(c, dt);
      // keep the target on the map and above ground; keep the camera above the terrain
      c.target.x = THREE.MathUtils.clamp(c.target.x, -60, 360);
      c.target.z = THREE.MathUtils.clamp(c.target.z, -400, 60);
      const ty = terrainHeight(c.target.x, -c.target.z);
      c.target.y = Math.max(c.target.y, ty);
      clampAboveGround(camera);
      resolveCamera(camera.position, c.target);
      c.update();
      return;
    }

    if (mode === "follow") {
      let id = ui.followNpcId;
      if (!id) {
        // follow with nobody chosen: take the director's subject (else stay put until someone is picked)
        const pick = ui.directorFocus?.npcIds[0] ?? ui.selectedNpcId;
        if (pick) { useWorld.getState().follow(pick); id = pick; }
      }
      const r = id ? npcRender.get(id) : undefined;
      if (!r) { c.enabled = true; c.update(); return; }
      _v.set(r.x, r.y + 1.2 * NPC_SCALE, r.z);
      if (lastFollow.current !== id) {
        lastFollow.current = id;
        // settle behind and a little to the side of the NPC, at a conversational distance
        // people often stand right at a shop front, so search around them for a spot with a clear view
        const base = r.heading + Math.PI + 0.55;
        const subj = { x: r.x, y: r.y, z: r.z };
        const to = new THREE.Vector3();
        for (let k = 0; k <= 12; k++) {
          const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
          to.set(Math.sin(a), 0, Math.cos(a)).multiplyScalar(FOLLOW_DIST).add(_v);
          to.y += FOLLOW_RISE;
          resolveCamera(to, subj);
          if (!occluded(to, subj, 1.2 * NPC_SCALE) && !insideAny(to)) break;
        }
        startFly(to, _v, 1.0);
        return;
      }
      // move camera with the target so the user's orbit offset is preserved
      _v2.subVectors(_v, c.target);
      camera.position.add(_v2);
      c.target.copy(_v);
      c.enabled = true;
      resolveCamera(camera.position, { x: r.x, y: r.y, z: r.z });
      // the same soft key light the director uses, so the person you follow reads at night
      if (keyLight.current) {
        keyLight.current.position.set(r.x + 2.5, r.y + 6.5, r.z + 2.5);
        keyLight.current.intensity = sky.night * 60;
      }
      c.update();
      return;
    }

    // ---- director
    c.enabled = false;
    const focus = ui.directorFocus;
    // scene identity from the director (stable while a crowd's membership churns); fall back to the focus contents
    const key = directorState.key || (focus ? `${focus.npcIds.join(",")}|${focus.locationId ?? ""}` : "idle");
    const sh = shot.current;
    const EYE = 1.2 * NPC_SCALE;
    if (key !== sh.key) {
      computeFocus(focus);
      const first = !sh.key;
      const moved = Math.hypot(_focus.x - sh.fx, _focus.z - sh.fz);
      const recent = now - sh.startedAt < 4000;
      if (!first && (moved < 10 || recent)) {
        // the new subject is right here, or we cut moments ago: no fade, glide to it (prevents strobing)
        sh.key = key; sh.pendingKey = ""; sh.cutAt = 0;
        if (!recent) sh.startedAt = now;
        newShot(sh, key, focus, false);
      } else {
        if (sh.pendingKey !== key) { sh.pendingKey = key; fadeCut(); sh.cutAt = now + FADE_CUT_MS; }
        if (now >= sh.cutAt) {
          sh.key = key; sh.pendingKey = ""; sh.startedAt = now;
          newShot(sh, key, focus, true);
          snapTo(sh);
          c.target.set(_focus.x, _focus.y + EYE, _focus.z);
        }
      }
    }
    computeFocus(focus);
    sh.fx = _focus.x; sh.fz = _focus.z;
    sh.angle += sh.speed * dt;
    // slow push-in over the first 10 s of a shot
    const age = (now - sh.startedAt) / 1000;
    const push = focus ? 1 - 0.12 * Math.min(1, age / 10) : 1;
    const orbit = (a: number, out: THREE.Vector3) => out.set(_focus.x + Math.cos(a) * sh.radius * push, _focus.y + sh.height * (focus ? push : 1), _focus.z + Math.sin(a) * sh.radius * push);
    orbit(sh.angle, desired.current);
    resolveCamera(desired.current, _focus);
    // line of sight: if a building sits between the camera and the subject, swing to the nearest clear angle
    if (focus && occluded(desired.current, _focus, EYE)) {
      for (let k = 1; k <= 6; k++) {
        let clear = false;
        for (const sgn of [1, -1]) {
          const a = sh.angle + sgn * k * (Math.PI / 6);
          orbit(a, _probe); resolveCamera(_probe, _focus);
          if (!occluded(_probe, _focus, EYE)) { sh.angle = a; desired.current.copy(_probe); clear = true; break; }
        }
        if (clear) break;
      }
    }
    if (keyLight.current) {
      keyLight.current.position.set(_focus.x + 3, _focus.y + 7, _focus.z + 3);
      keyLight.current.intensity = focus ? sky.night * 60 : 0;
    }
    desiredT.current.set(_focus.x, _focus.y + (focus ? EYE : 0), _focus.z);
    const k = 1 - Math.exp(-dt * 2.2);
    camera.position.lerp(desired.current, k);
    c.target.lerp(desiredT.current, k);
    resolveCamera(camera.position, _focus);
    c.update();
  });

  /** buttons and keys: eased turn / tilt / zoom, plus WASD/arrow moves over the ground */
  function applyNudges(c: ComponentRef<typeof OrbitControls>, dt: number) {
    const n = nudge.current, K = keys.current;
    const ease = 1 - Math.exp(-dt * 9);
    const step = 1.6 * dt; // radians per second while a key is held
    let rot = n.rot * ease, tilt = n.tilt * ease, zoom = n.zoom * ease;
    n.rot -= rot; n.tilt -= tilt; n.zoom -= zoom;
    if (K.has("q")) rot -= step;
    if (K.has("e")) rot += step;
    if (K.has("r")) tilt -= step * 0.6;
    if (K.has("f")) tilt += step * 0.6;
    if (K.has("+") || K.has("=")) zoom -= dt * 1.4;
    if (K.has("-")) zoom += dt * 1.4;
    const off = _v.subVectors(camera.position, c.target);
    if (rot || tilt || zoom) {
      const sp = new THREE.Spherical().setFromVector3(off);
      sp.theta -= rot;
      sp.phi = THREE.MathUtils.clamp(sp.phi + tilt, c.minPolarAngle, c.maxPolarAngle);
      sp.radius = THREE.MathUtils.clamp(sp.radius * Math.exp(zoom), c.minDistance, c.maxDistance);
      off.setFromSpherical(sp);
      camera.position.copy(c.target).add(off);
    }
    let fw = 0, rt = 0;
    if (K.has("w") || K.has("arrowup")) fw += 1;
    if (K.has("s") || K.has("arrowdown")) fw -= 1;
    if (K.has("d") || K.has("arrowright")) rt += 1;
    if (K.has("a") || K.has("arrowleft")) rt -= 1;
    if (fw || rt) {
      const dist = camera.position.distanceTo(c.target);
      const speed = Math.max(8, dist * 0.9) * dt;
      const f = _v2.subVectors(c.target, camera.position).setY(0).normalize();
      const r = _probe.set(-f.z, 0, f.x);
      const mv = f.multiplyScalar(fw * speed).add(r.multiplyScalar(rt * speed));
      camera.position.add(mv); c.target.add(mv);
    }
  }

  function newShot(sh: Shot, key: string, focus: { npcIds: string[] } | null, reseed: boolean) {
    if (reseed) {
      sh.angle = hash01(key, 3) * Math.PI * 2;
      sh.speed = (hash01(key, 4) > 0.5 ? 1 : -1) * (0.05 + hash01(key, 5) * 0.06);
    }
    const n = focus ? focus.npcIds.length : 0;
    // conversational framing (metres, for ~3.5 m stylised figures): one person ≈ a medium shot,
    // two ≈ a two-shot, a crowd pulls back. Was 19/23/34 m, which read as a town shot with specks in it.
    // Portrait screens have a narrow horizontal view even with the wider fov, so pull back a little there.
    const portrait = size.height > size.width ? 1.12 : 1;
    sh.radius = focus ? (n >= 8 ? 23 : n >= 4 ? 18 : n === 3 ? 14.5 : n === 2 ? 12.5 : 10) * portrait : 260;
    sh.height = focus ? (n >= 8 ? 11 : n >= 4 ? 8 : n === 3 ? 6.2 : n === 2 ? 5.4 : 4.6) : 170;
  }
  function snapTo(sh: Shot) {
    camera.position.set(_focus.x + Math.cos(sh.angle) * sh.radius, _focus.y + sh.height, _focus.z + Math.sin(sh.angle) * sh.radius);
    resolveCamera(camera.position, _focus);
  }

  return (
    <>
    {/* soft "film" key light on the director's subject at night */}
    <pointLight ref={keyLight} color="#ffe2b8" intensity={0} distance={26} decay={2} />
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      minDistance={10}
      maxDistance={420}
      minPolarAngle={0.12}
      maxPolarAngle={1.45}
      screenSpacePanning={false}
      mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      panSpeed={1}
      target={OVERVIEW_TARGET}
      zoomSpeed={0.9}
      rotateSpeed={0.6}
    />
    </>
  );
}

/** does the segment subject → camera pass through any building? */
function occluded(cam: THREE.Vector3, focus: { x: number; y: number; z: number }, eye: number): boolean {
  const fx = focus.x, fy = focus.y + eye, fz = focus.z;
  const dx = cam.x - fx, dy = cam.y - fy, dz = cam.z - fz;
  const n = Math.max(2, Math.ceil(Math.hypot(dx, dy, dz)));
  for (let i = 1; i < n; i++) {
    const t = i / n, px = fx + dx * t, py = fy + dy * t, pz = fz + dz * t;
    for (const f of footprints) if (insideBox(f, px, py, pz, 0.3)) return true;
  }
  return false;
}

function insideAny(p: THREE.Vector3): boolean {
  for (const f of footprints) if (insideBox(f, p.x, p.y, p.z, 1.2)) return true;
  return false;
}

function clampAboveGround(camera: THREE.Camera) {
  const floor = terrainHeight(camera.position.x, -camera.position.z) + 2;
  if (camera.position.y < floor) camera.position.y = floor;
}

/**
 * Make a camera position usable: never below terrain + 2 m, never inside a
 * building's box — pushed out along the view vector (away from the focus),
 * and lifted over the roof if pushing out doesn't clear it.
 */
function resolveCamera(p: THREE.Vector3, focus: { x: number; y: number; z: number }) {
  const floor = terrainHeight(p.x, -p.z) + 2;
  if (p.y < floor) p.y = floor;
  let dx = p.x - focus.x, dz = p.z - focus.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  for (let i = 0; i < 40; i++) {
    let hit: Footprint | null = null;
    for (const f of footprints) if (insideBox(f, p.x, p.y, p.z, 1.2)) { hit = f; break; }
    if (!hit) break;
    if (i < 30) { p.x += dx; p.z += dz; } else p.y += 1.5;                 // push out 1 m per step, then lift
    const fl = terrainHeight(p.x, -p.z) + 2;
    if (p.y < fl) p.y = fl;
  }
}

/** focus point: centroid of the subjects (or the location), sampled at terrain height */
function computeFocus(focus: { npcIds: string[]; locationId: string | null } | null) {
  if (!focus) { _focus.x = 150; _focus.y = 0; _focus.z = -150; return; }
  let ok = false;
  if (focus.npcIds.length && centroid(focus.npcIds, _focus)) ok = true;
  else {
    const l = locWorld(focus.locationId);
    if (l) { _focus.x = l[0]; _focus.z = l[2]; ok = true; }
  }
  if (!ok) { _focus.x = 150; _focus.z = -150; }
  _focus.y = terrainHeight(_focus.x, -_focus.z);
}
