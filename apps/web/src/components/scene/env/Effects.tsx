/**
 * Post-processing stack, mounted only *after* the town has painted (see
 * `Scene.tsx`) and compiled **progressively** so the shaders never land as one
 * long stall on the first frame:
 *
 *   step 0  grade (hue/sat + contrast + vignette) + ACES tone mapping — one merged pass
 *   step 1  + SMAA                      (med / high)
 *   step 2  + Bloom                     (all tiers)
 *   step 3  + N8AO and DepthOfField     (high only, follow/director for DoF)
 *
 * Each step is ~250 ms after the previous one, so the compiles are spread over
 * three frames instead of one. Degrades by quality tier (see perf.ts):
 * low = bloom + grade, med = + SMAA, high = everything.
 */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer, N8AO, Bloom, DepthOfField, HueSaturation, BrightnessContrast, Vignette, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode, type BloomEffect, type DepthOfFieldEffect, type HueSaturationEffect, type BrightnessContrastEffect, type VignetteEffect } from "postprocessing";
import { useWorld } from "@/lib/store";
import { sky } from "../palette";
import { useQuality } from "./perf";
import { dofFocus } from "./focus";
import { mark, setPhase } from "../perf/marks";

const STEP_MS = 250;

export default function Effects() {
  const q = useQuality();
  const mode = useWorld((s) => s.ui.cameraMode);
  const maxStep = q.tier >= 2 ? 3 : q.tier >= 1 ? 2 : 2; // low still gets bloom, just no SMAA
  const [step, setStep] = useState(0);

  useEffect(() => { mark("post-mount"); setPhase("polish", 0.2); }, []);
  useEffect(() => {
    if (step >= maxStep) {
      mark(`post-ready`);
      setPhase("ready", 1);
      return;
    }
    const t = window.setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => window.clearTimeout(t);
  }, [step, maxStep]);

  const bloom = useRef<BloomEffect>(null);
  const dof = useRef<DepthOfFieldEffect>(null);
  const hs = useRef<HueSaturationEffect>(null);
  const bc = useRef<BrightnessContrastEffect>(null);
  const vig = useRef<VignetteEffect>(null);
  const target = useMemo(() => new THREE.Vector3(150, 3, -150), []);
  const useDof = q.tier >= 2 && mode !== "overview" && step >= 3;

  useFrame(({ camera }) => {
    // grade shifts with the time of day and the weather
    if (hs.current) hs.current.saturation = sky.sat - sky.storm * 0.25;
    if (bc.current) { bc.current.contrast = 0.06 + sky.night * 0.04 - sky.storm * 0.03; bc.current.brightness = -sky.storm * 0.03; }
    if (vig.current) vig.current.darkness = 0.45 + sky.night * 0.15;
    if (bloom.current) bloom.current.intensity = 0.32 + sky.night * 0.45;
    // keep the followed subject in focus
    const d = dof.current;
    if (d) {
      if (dofFocus.provider) dofFocus.provider(target);
      d.target = target;
      const dist = camera.position.distanceTo(target);
      // strong bokeh close to the subject, none once the camera is far (overview-like framing)
      d.bokehScale = THREE.MathUtils.clamp((75 - dist) / 45, 0, 1) * 3;
    }
  });

  return (
    <EffectComposer multisampling={0} enableNormalPass={false} resolutionScale={1}>
      {q.tier >= 2 && step >= 3 ? <N8AO halfRes quality="performance" aoRadius={5} distanceFalloff={1.2} intensity={2.4} screenSpaceRadius={false} depthAwareUpsampling /> : null}
      {step >= 2 ? <Bloom ref={bloom} luminanceThreshold={0.82} luminanceSmoothing={0.25} intensity={0.4} mipmapBlur radius={0.65} levels={q.tier >= 1 ? 6 : 4} /> : null}
      {useDof ? <DepthOfField ref={dof} focusRange={0.02} focusDistance={0.02} bokehScale={2.5} resolutionScale={0.5} /> : null}
      <HueSaturation ref={hs} saturation={0} />
      <BrightnessContrast ref={bc} contrast={0.06} />
      <Vignette ref={vig} offset={0.22} darkness={0.5} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {q.tier >= 1 && step >= 1 ? <SMAA /> : null}
    </EffectComposer>
  );
}
