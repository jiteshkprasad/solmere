/**
 * Sky dome (3-stop gradient + sun glow + horizon haze + faint Milky Way band),
 * a star field, the sun disc with its glow billboard, and a moon with phase.
 */
"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sky, rng } from "../palette";

export const SKY_CENTRE = new THREE.Vector3(150, 0, -150);
const R_DOME = 1400, R_BODIES = 900;

const SKY_VERT = /* glsl */ `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SKY_FRAG = /* glsl */ `
uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
uniform float sunGlow; uniform float night; uniform float storm; uniform float lowSun; uniform vec3 bandN;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec3 d = normalize(vWorld - vec3(150.0, 0.0, -150.0));
  float h = d.y;
  vec3 c;
  if (h < 0.0) c = mix(horizon * 0.82, horizon, smoothstep(-0.2, 0.0, h));
  else if (h < 0.22) c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
  else c = mix(mid, top, pow(smoothstep(0.22, 1.0, h), 0.75));
  // sun glow: wide aureole + tight corona
  float s = max(dot(d, sunDir), 0.0);
  c += sunColor * (pow(s, 5.0) * 0.16 + pow(s, 32.0) * 0.45 + pow(s, 300.0) * 1.2) * sunGlow;
  // warm band along the horizon on the sun's side when the sun is low
  vec2 dh = normalize(d.xz + 1e-4), sh = normalize(sunDir.xz + 1e-4);
  float side = max(dot(dh, sh), 0.0);
  c += sunColor * pow(1.0 - abs(h), 9.0) * (0.15 + 0.35 * side) * lowSun * sunGlow;
  // Milky Way: soft luminous band with patchy structure
  float band = exp(-pow(dot(d, bandN), 2.0) * 90.0);
  float mw = 0.55 + 0.45 * vnoise(d.xz * 9.0 + d.y * 6.0);
  c += vec3(0.62, 0.66, 0.85) * band * mw * 0.17 * night * smoothstep(-0.05, 0.25, h);
  // storm: grey, flat overcast
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, vec3(lum) * vec3(0.78, 0.8, 0.84), storm * 0.85);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const GLOW_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GLOW_FRAG = /* glsl */ `uniform vec3 color; uniform float strength; varying vec2 vUv;
void main(){ float r = length(vUv); float a = exp(-r * r * 6.0) * 0.55 + exp(-r * r * 40.0) * 0.8; gl_FragColor = vec4(color * a * strength, 1.0); }`;

const MOON_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const MOON_FRAG = /* glsl */ `uniform float phase; uniform float bright; varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float r = length(vUv);
  float edge = 1.0 - smoothstep(0.93, 1.0, r);
  if (edge <= 0.0) discard;
  vec3 n = vec3(vUv, sqrt(max(0.0, 1.0 - r * r)));
  float a = phase * 6.2831853;
  vec3 L = normalize(vec3(sin(a), 0.15, -cos(a)));
  float lit = smoothstep(-0.08, 0.12, dot(n, L));
  float maria = vnoise(vUv * 3.0 + 4.0) * 0.5 + vnoise(vUv * 7.0) * 0.3;
  vec3 col = mix(vec3(0.86, 0.88, 0.95), vec3(0.6, 0.64, 0.74), maria);
  col *= 0.08 + 0.92 * lit;
  gl_FragColor = vec4(col * bright, edge);
}`;

export default function SkyDome() {
  const skyMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, sunGlow: { value: 1 }, night: { value: 0 }, storm: { value: 0 }, lowSun: { value: 0 },
      bandN: { value: new THREE.Vector3(0.55, 0.35, 0.75).normalize() },
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  }), []);
  const glowMat = useMemo(() => new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color() }, strength: { value: 1 } }, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), []);
  const moonMat = useMemo(() => new THREE.ShaderMaterial({ uniforms: { phase: { value: 0.6 }, bright: { value: 1 } }, vertexShader: MOON_VERT, fragmentShader: MOON_FRAG, transparent: true, depthWrite: false, fog: false }), []);

  const stars = useMemo(() => {
    const r = rng(7);
    const n = 3000;
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
    const bandN = new THREE.Vector3(0.55, 0.35, 0.75).normalize();
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      // half the stars cluster along the Milky Way band
      let tries = 0;
      do {
        const a = r() * Math.PI * 2, e = Math.asin(r() * 0.98 + 0.02);
        v.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
        tries++;
      } while (i % 2 === 0 && Math.abs(v.dot(bandN)) > 0.12 + r() * 0.1 && tries < 20);
      p[i * 3] = SKY_CENTRE.x + v.x * R_DOME * 0.62; p[i * 3 + 1] = v.y * R_DOME * 0.62; p[i * 3 + 2] = SKY_CENTRE.z + v.z * R_DOME * 0.62;
      const b = 0.35 + r() * r() * 0.65;
      const warm = r();
      c[i * 3] = b * (warm > 0.8 ? 1 : 0.85 + 0.15 * warm); c[i * 3 + 1] = b * (0.9 + 0.1 * warm); c[i * 3 + 2] = b * (warm > 0.8 ? 0.8 : 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    return g;
  }, []);
  const starMat = useMemo(() => new THREE.PointsMaterial({ vertexColors: true, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }), []);

  const sunDisc = useRef<THREE.Mesh>(null), glow = useRef<THREE.Mesh>(null), moon = useRef<THREE.Mesh>(null), starRef = useRef<THREE.Points>(null);
  const _p = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    const u = skyMat.uniforms;
    (u.top.value as THREE.Color).copy(sky.top);
    (u.mid.value as THREE.Color).copy(sky.mid);
    (u.horizon.value as THREE.Color).copy(sky.horizon);
    (u.sunDir.value as THREE.Vector3).copy(sky.sunDir);
    (u.sunColor.value as THREE.Color).copy(sky.sun);
    u.sunGlow.value = sky.moon ? 0.12 : 1;
    u.night.value = sky.night;
    u.storm.value = sky.storm;
    u.lowSun.value = sky.moon ? 0 : 1 - THREE.MathUtils.smoothstep(sky.sunElev, 0.05, 0.45);
    // sun + glow
    _p.copy(sky.sunDir).multiplyScalar(R_BODIES).add(SKY_CENTRE);
    if (sunDisc.current) { sunDisc.current.position.copy(_p); sunDisc.current.visible = !sky.moon; }
    if (glow.current) {
      glow.current.position.copy(sky.sunDir).multiplyScalar(R_BODIES - 40).add(SKY_CENTRE); glow.current.visible = !sky.moon && sky.storm < 0.9;
      glow.current.quaternion.copy(camera.quaternion);
      (glowMat.uniforms.color.value as THREE.Color).copy(sky.sun);
      glowMat.uniforms.strength.value = (0.7 + 0.6 * (1 - THREE.MathUtils.smoothstep(sky.sunElev, 0.05, 0.5))) * (1 - sky.storm * 0.8);
    }
    if (moon.current) {
      moon.current.position.copy(_p); moon.current.visible = sky.moon;
      moon.current.quaternion.copy(camera.quaternion);
      moonMat.uniforms.phase.value = sky.moonPhase;
      moonMat.uniforms.bright.value = 0.9 + 0.5 * sky.night;
    }
    starMat.opacity = Math.max(0, (sky.night - 0.35) / 0.65) * (1 - sky.storm);
    if (starRef.current) starRef.current.visible = starMat.opacity > 0.01;
  });

  return (
    <>
      <mesh material={skyMat} position={SKY_CENTRE} frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[R_DOME, 32, 16]} />
      </mesh>
      <points ref={starRef} geometry={stars} material={starMat} frustumCulled={false} renderOrder={-9} />
      <mesh ref={glow} material={glowMat} frustumCulled={false} renderOrder={-8}>
        <planeGeometry args={[260, 260]} />
      </mesh>
      <mesh ref={sunDisc} frustumCulled={false} renderOrder={-7}>
        <sphereGeometry args={[24, 16, 10]} />
        <meshBasicMaterial color="#fff7dc" fog={false} toneMapped={false} />
      </mesh>
      <mesh ref={moon} material={moonMat} frustumCulled={false} renderOrder={-7}>
        <planeGeometry args={[44, 44]} />
      </mesh>
    </>
  );
}
