/**
 * Colour + lighting helpers shared by the scene. Pure functions, no React.
 */
import * as THREE from "three";
import type { Mood } from "@npcworld/schema";

/* ---------------------------------- hashing ---------------------------------- */

export function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** deterministic 0..1 from a string + salt */
export function hash01(s: string, salt = 0): number { return ((hash32(s + ":" + salt) % 100000) / 100000); }

/** tiny seeded RNG (mulberry32) for procedural scatter */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* --------------------------------- sky palette -------------------------------- */

interface SkyKey {
  h: number;
  top: string; mid: string; horizon: string;       // sky gradient: zenith / mid-sky / horizon band
  sun: string; sunI: number;                       // key light colour + intensity
  amb: number; ambC: string;                       // ambient
  hemiSky: string; hemiGround: string;             // hemisphere fill
  fogFar: number; night: number; exposure: number; // fog distance, 0..1 nightness, tone-mapping exposure
  sat: number;                                      // post-grade saturation offset
}

const KEYS: SkyKey[] = [
  { h: 0,    top: "#05091f", mid: "#0d1638", horizon: "#1c2a55", sun: "#aebef2", sunI: 0.62, amb: 0.3,  ambC: "#2c3a72", hemiSky: "#3a4c8c", hemiGround: "#141820", fogFar: 560, night: 1,    exposure: 0.92, sat: -0.22 },
  { h: 4.7,  top: "#05091f", mid: "#0d1638", horizon: "#1c2a55", sun: "#aebef2", sunI: 0.62, amb: 0.3,  ambC: "#2c3a72", hemiSky: "#3a4c8c", hemiGround: "#141820", fogFar: 560, night: 1,    exposure: 0.92, sat: -0.22 },
  { h: 5.5,  top: "#152350", mid: "#3a4a86", horizon: "#b8707e", sun: "#ffa072", sunI: 0.5,  amb: 0.32, ambC: "#5a5484", hemiSky: "#7a76a8", hemiGround: "#2a2320", fogFar: 540, night: 0.72, exposure: 0.90, sat: 0.02 },
  { h: 6.3,  top: "#3f5fa6", mid: "#9d8fbb", horizon: "#f9a86c", sun: "#ffb37e", sunI: 1.25, amb: 0.42, ambC: "#9a86a4", hemiSky: "#d4a6b0", hemiGround: "#4a3c2c", fogFar: 600, night: 0.3,  exposure: 1.0,  sat: 0.08 },
  // day keys (visual pass, Nov 2026): deeper zenith, a bluer horizon band instead of the grey-white
  // that read as haze from the overview, a longer warm morning and a warmer afternoon
  { h: 7.6,  top: "#3f86dc", mid: "#8fbdee", horizon: "#f6d3a6", sun: "#ffd9a4", sunI: 1.95, amb: 0.42, ambC: "#d2cfdc", hemiSky: "#a9cbee", hemiGround: "#7a6a4a", fogFar: 720, night: 0,    exposure: 1.06, sat: 0.08 },
  { h: 9.4,  top: "#2f7ddb", mid: "#6eaaea", horizon: "#e6dcc2", sun: "#ffeccb", sunI: 2.2,  amb: 0.44, ambC: "#d9dfec", hemiSky: "#b2d3f3", hemiGround: "#7a7656", fogFar: 820, night: 0,    exposure: 1.1,  sat: 0.07 },
  { h: 12,   top: "#1f6fd6", mid: "#539ce8", horizon: "#a9cff0", sun: "#fff5e0", sunI: 2.3,  amb: 0.46, ambC: "#dde8f4", hemiSky: "#b6d8f8", hemiGround: "#7a7a5c", fogFar: 900, night: 0,    exposure: 1.1,  sat: 0.06 },
  { h: 16.5, top: "#2c7bd6", mid: "#7fb2ea", horizon: "#efd7ae", sun: "#ffe0ae", sunI: 2.1,  amb: 0.44, ambC: "#dcd7dc", hemiSky: "#b3d2f0", hemiGround: "#7a6c4e", fogFar: 820, night: 0,    exposure: 1.08, sat: 0.08 },
  { h: 18.2, top: "#3b5aa0", mid: "#c07a70", horizon: "#ffad5e", sun: "#ffa652", sunI: 1.6,  amb: 0.5,   ambC: "#b08f98", hemiSky: "#e0a88e", hemiGround: "#584232", fogFar: 660, night: 0.18, exposure: 1.08, sat: 0.14 },
  { h: 19.1, top: "#252f6a", mid: "#7b4d7e", horizon: "#f2825f", sun: "#ff8a52", sunI: 0.65, amb: 0.3,  ambC: "#6a5484", hemiSky: "#8a5e88", hemiGround: "#2e2426", fogFar: 560, night: 0.48, exposure: 0.95, sat: 0.1 },
  { h: 20.1, top: "#0f173d", mid: "#22305f", horizon: "#5b4b7c", sun: "#9092d2", sunI: 0.5,  amb: 0.28, ambC: "#3f3f74", hemiSky: "#454a84", hemiGround: "#1a1a20", fogFar: 520, night: 0.82, exposure: 0.88, sat: -0.05 },
  { h: 21.6, top: "#05091f", mid: "#0d1638", horizon: "#1c2a55", sun: "#aebef2", sunI: 0.62, amb: 0.3,  ambC: "#2c3a72", hemiSky: "#3a4c8c", hemiGround: "#141820", fogFar: 560, night: 1,    exposure: 0.92, sat: -0.22 },
  { h: 24,   top: "#05091f", mid: "#0d1638", horizon: "#1c2a55", sun: "#aebef2", sunI: 0.62, amb: 0.3,  ambC: "#2c3a72", hemiSky: "#3a4c8c", hemiGround: "#141820", fogFar: 560, night: 1,    exposure: 0.92, sat: -0.22 },
];
const KEY_COLORS = KEYS.map((k) => ({
  top: new THREE.Color(k.top), mid: new THREE.Color(k.mid), horizon: new THREE.Color(k.horizon), sun: new THREE.Color(k.sun), ambC: new THREE.Color(k.ambC), hemiSky: new THREE.Color(k.hemiSky), hemiGround: new THREE.Color(k.hemiGround),
}));

export interface SkyState {
  top: THREE.Color; horizon: THREE.Color; sun: THREE.Color; ambC: THREE.Color; hemiSky: THREE.Color; hemiGround: THREE.Color;
  /** mid-sky colour between zenith and horizon */
  mid: THREE.Color;
  sunI: number; amb: number; fogFar: number; night: number;
  /** tone-mapping exposure for the renderer */
  exposure: number;
  /** post-grade saturation offset (-1..1) */
  sat: number;
  /** unit sun direction (from scene towards the sun) */
  sunDir: THREE.Vector3;
  /** true when the sun is below the horizon and we light with the moon */
  moon: boolean;
  /** 0..1 moon phase (0 = new, 0.5 = full) */
  moonPhase: number;
  /** 0..1 storm weight (set by <Atmosphere/> from the world's active event cards) */
  storm: number;
  /** sun elevation -1..1 (sin of altitude) regardless of moon */
  sunElev: number;
  hour: number;
}

/** Module-level lighting state, updated once per frame by <Atmosphere/> and read by lamps/windows/lighthouse. */
export const sky: SkyState = {
  top: new THREE.Color(), horizon: new THREE.Color(), sun: new THREE.Color(), ambC: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), mid: new THREE.Color(),
  sunI: 1, amb: 0.5, fogFar: 700, night: 0, exposure: 1, sat: 0, sunDir: new THREE.Vector3(0, 1, 0), moon: false, moonPhase: 0.6, storm: 0, sunElev: 1, hour: 12,
};

/** sunrise / sunset hours (long summer day; matches the dawn/dusk keyframes) */
export const SUNRISE = 5.6, SUNSET = 19.0;

/** Fill `sky` for a fractional hour 0..24. Allocation-free. */
export function updateSky(hour: number, out: SkyState = sky): SkyState {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smooth((h - a.h) / Math.max(0.001, b.h - a.h));
  const ca = KEY_COLORS[i], cb = KEY_COLORS[i + 1];
  out.top.copy(ca.top).lerp(cb.top, t);
  out.mid.copy(ca.mid).lerp(cb.mid, t);
  out.horizon.copy(ca.horizon).lerp(cb.horizon, t);
  out.sun.copy(ca.sun).lerp(cb.sun, t);
  out.ambC.copy(ca.ambC).lerp(cb.ambC, t);
  out.hemiSky.copy(ca.hemiSky).lerp(cb.hemiSky, t);
  out.hemiGround.copy(ca.hemiGround).lerp(cb.hemiGround, t);
  out.sunI = lerp(a.sunI, b.sunI, t);
  out.amb = lerp(a.amb, b.amb, t);
  out.fogFar = lerp(a.fogFar, b.fogFar, t);
  out.night = lerp(a.night, b.night, t);
  out.exposure = lerp(a.exposure, b.exposure, t);
  out.sat = lerp(a.sat, b.sat, t);
  out.hour = h;
  // sun path: rises in the east (+x) at SUNRISE, sets in the west at SUNSET, arcs across the south (+z, toward the default camera)
  const ang = ((h - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI;
  const elev = Math.sin(ang);
  out.sunElev = elev;
  if (elev > 0.04) {
    out.moon = false;
    out.sunDir.set(Math.cos(ang) * 0.85, elev, 0.45).normalize();
  } else {
    // moon: rises in the east after sunset and crosses the sky over the night
    out.moon = true;
    const hn = (((h - SUNSET) % 24) + 24) % 24;
    const mang = (hn / (24 - (SUNSET - SUNRISE))) * Math.PI;
    out.sunDir.set(Math.cos(mang) * 0.7, Math.max(0.35, Math.sin(mang)), 0.5).normalize();
  }
  return out;
}

/* ----------------------------------- moods ----------------------------------- */

export const MOOD_COLOR: Record<Mood, string | null> = {
  elated: "#ffcf4d", happy: "#ffb347", content: "#f4d58d", neutral: null, tense: "#c58bff", sad: "#4d8dff", angry: "#ff3b3b", afraid: "#8a6cff",
};

/* -------------------------------- NPC look-up -------------------------------- */

/** overall figure scale — stylised town, big people read from the overview */
export const NPC_SCALE = 1.8;

export const SKIN_TONES = ["#f6d5b8", "#e8b894", "#d39a6b", "#b07a4f", "#8a5a3a", "#5e3d26"];
export const TROUSER_COLORS = ["#2f3a4a", "#4a3b2f", "#3a4a3a", "#5a4a6a", "#2a2f3a", "#6b4d3b", "#3b3b3b"];

export type HatKind = "none" | "cap" | "brim" | "top" | "helmet" | "souwester" | "veil" | "chef";
export type ApronKind = "none" | "apron" | "sash" | "coat";

export interface JobLook { hat: HatKind; hatColor: string; apron: ApronKind; apronColor: string; cloth?: string; }

const LOOKS: Record<string, JobLook> = {
  fisher:               { hat: "souwester", hatColor: "#f2c318", apron: "none", apronColor: "#000", cloth: "#f2c318" },
  fisher_apprentice:    { hat: "souwester", hatColor: "#f2c318", apron: "none", apronColor: "#000", cloth: "#e0b520" },
  harbourmaster:        { hat: "cap", hatColor: "#1f2f5a", apron: "none", apronColor: "#000", cloth: "#1f2f5a" },
  constable:            { hat: "helmet", hatColor: "#1d3f8f", apron: "none", apronColor: "#000", cloth: "#2649a8" },
  night_watchman:       { hat: "cap", hatColor: "#2c2c3a", apron: "none", apronColor: "#000", cloth: "#3a3a4a" },
  doctor:               { hat: "none", hatColor: "#fff", apron: "coat", apronColor: "#f8f8f8", cloth: "#f8f8f8" },
  nurse:                { hat: "none", hatColor: "#fff", apron: "coat", apronColor: "#f2f6ff", cloth: "#dfe8ff" },
  mayor:                { hat: "none", hatColor: "#000", apron: "sash", apronColor: "#d8262c", cloth: "#4a2c6a" },
  town_clerk:           { hat: "none", hatColor: "#000", apron: "none", apronColor: "#000", cloth: "#6b6f8a" },
  baker:                { hat: "chef", hatColor: "#ffffff", apron: "apron", apronColor: "#ffffff" },
  assistant_baker:      { hat: "chef", hatColor: "#ffffff", apron: "apron", apronColor: "#f0e6d8" },
  tavern_keeper:        { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#5b3a29" },
  brewer:               { hat: "cap", hatColor: "#4a3020", apron: "apron", apronColor: "#6b4a34" },
  cafe_owner:           { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#2f2f2f" },
  barista:              { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#2f2f2f" },
  stall_vendor:         { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#d05a2a" },
  store_owner:          { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#3a6b3a" },
  store_clerk:          { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#3a6b3a" },
  fish_trader:          { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#cfd8dc" },
  market_porter:        { hat: "cap", hatColor: "#555", apron: "apron", apronColor: "#cfd8dc" },
  banker:               { hat: "top", hatColor: "#1a1a1a", apron: "none", apronColor: "#000", cloth: "#2b2b2b" },
  landlord:             { hat: "top", hatColor: "#2a1f1a", apron: "none", apronColor: "#000", cloth: "#5a3a2a" },
  farmer:               { hat: "brim", hatColor: "#e2c36c", apron: "none", apronColor: "#000" },
  farmhand:             { hat: "brim", hatColor: "#e2c36c", apron: "none", apronColor: "#000" },
  orchard_keeper:       { hat: "brim", hatColor: "#c9a95a", apron: "none", apronColor: "#000" },
  carpenter:            { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#a8763e" },
  carpenter_apprentice: { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#a8763e" },
  mechanic:             { hat: "cap", hatColor: "#333", apron: "coat", apronColor: "#3d5a80", cloth: "#3d5a80" },
  teacher:              { hat: "none", hatColor: "#000", apron: "none", apronColor: "#000" },
  student:              { hat: "cap", hatColor: "#c0392b", apron: "none", apronColor: "#000" },
  journalist:           { hat: "brim", hatColor: "#6b5b45", apron: "none", apronColor: "#000", cloth: "#a35b3c" },
  tailor:               { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#7b4fa0" },
  barber:               { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#ffffff", cloth: "#c8323c" },
  innkeeper:            { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#7a2d3c" },
  temple_keeper:        { hat: "veil", hatColor: "#f5f5f5", apron: "none", apronColor: "#000", cloth: "#2b2b3a" },
  musician:             { hat: "brim", hatColor: "#2b2b2b", apron: "none", apronColor: "#000", cloth: "#b03a7a" },
  painter:              { hat: "none", hatColor: "#000", apron: "apron", apronColor: "#e8d9b8" },
  postman:              { hat: "cap", hatColor: "#1e5aa8", apron: "none", apronColor: "#000", cloth: "#2f6fc4" },
  retiree:              { hat: "brim", hatColor: "#8a8a8a", apron: "none", apronColor: "#000" },
  unemployed:           { hat: "none", hatColor: "#000", apron: "none", apronColor: "#000" },
  drifter:              { hat: "cap", hatColor: "#556b2f", apron: "none", apronColor: "#000" },
  odd_jobs:             { hat: "cap", hatColor: "#6b6b6b", apron: "none", apronColor: "#000" },
};
const DEFAULT_LOOK: JobLook = { hat: "none", hatColor: "#000", apron: "none", apronColor: "#000" };
export function jobLook(job: string): JobLook { return LOOKS[job] ?? DEFAULT_LOOK; }

/** cloth colour: job override or a hue from the id hash */
export function clothColor(id: string, job: string): string {
  const look = jobLook(job);
  if (look.cloth) return look.cloth;
  const c = new THREE.Color().setHSL(hash01(id, 1), 0.45 + hash01(id, 2) * 0.3, 0.42 + hash01(id, 3) * 0.2);
  return "#" + c.getHexString();
}
export const skinColor = (id: string) => SKIN_TONES[Math.floor(hash01(id, 7) * SKIN_TONES.length)];
export const trouserColor = (id: string) => TROUSER_COLORS[Math.floor(hash01(id, 9) * TROUSER_COLORS.length)];

/* ------------------------------- building palette ----------------------------- */

export const WALLS = ["#f1e3c8", "#f3c9a6", "#cfe0b8", "#bcd7e8", "#efc2c9", "#e9cf7a", "#f7f4ec", "#d9c3a5", "#c9d8d3"];
export const ROOFS = ["#c8623f", "#4f5a68", "#a8352d", "#6e4a30", "#4d7a4a", "#8c4a3a", "#3f3a37"];
