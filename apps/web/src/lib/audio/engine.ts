/**
 * Web Audio engine for Solmere: buses, a master limiter, a shared "interior"
 * reverb send, a buffer cache, spatialised looping players with distance
 * low-pass filtering, one-shots, and a settings store persisted per viewer.
 *
 * Nothing here knows about the town; components/scene/audio/AudioLayer.tsx
 * decides what should be audible, how loud, how far away and how muffled,
 * every frame.
 *
 * Signal path:
 *
 *   LoopPlayer:  source → lowpass (distance) → panner → gain ─┬→ bus → master
 *                                                             └→ reverbSend → convolver → master
 *   master:      master gain → limiter (DynamicsCompressor, hard knee) → destination
 *
 * The limiter is what lets several loud ambience beds, a music bed, one-shots
 * and murmur all be up at once without the sum ever clipping.
 */
"use client";

export interface AudioSettings { enabled: boolean; master: number; music: number; ambience: number; murmur: number }
const LS_KEY = "npcworld.audio";
const DEFAULTS: AudioSettings = { enabled: false, master: 0.85, music: 0.7, ambience: 0.75, murmur: 0.7 };

let settings: AudioSettings = load();
const subs = new Set<() => void>();
function load(): AudioSettings {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }; } catch { /* private mode etc. */ }
  return { ...DEFAULTS };
}
export const getSettings = () => settings;
export function setSettings(patch: Partial<AudioSettings>) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  applyBusGains();
  subs.forEach((s) => s());
}
export const subscribeSettings = (s: () => void) => { subs.add(s); return () => { subs.delete(s); }; };

/* ------------------------------------------------------------------ context ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let master: GainNode, limiter: DynamicsCompressorNode;
let musicBus: GainNode, ambBus: GainNode, murmurBus: GainNode, sfxBus: GainNode;
let reverbIn: GainNode, reverb: ConvolverNode;
let status: "off" | "suspended" | "running" = "off";
const statusSubs = new Set<() => void>();
export const getStatus = () => status;
export const subscribeStatus = (s: () => void) => { statusSubs.add(s); return () => { statusSubs.delete(s); }; };
function setStatus(s: typeof status) { if (s !== status) { status = s; statusSubs.forEach((f) => f()); } }

/** Small, cheap, procedurally generated room impulse: a smoothed noise burst with
 *  an exponential decay and a dark tail. Used as the "indoors" send, so a tavern
 *  or a chapel sounds like a room rather than like the open street. */
function makeRoomIR(c: AudioContext, seconds = 1.5, decay = 3.2): AudioBuffer {
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      // one-pole low-pass on white noise → darker, more plausible tail than raw noise
      lp += 0.32 * ((Math.random() * 2 - 1) - lp);
      const early = i < c.sampleRate * 0.01 ? 0.3 : 1;
      d[i] = lp * Math.pow(1 - t, decay) * early;
    }
  }
  return buf;
}

/** Must be called from a user gesture the first time (autoplay policy). */
export async function enable(): Promise<boolean> {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      // master → limiter → out. Ratio 20 with a fast attack is a limiter in all but name.
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 3; limiter.ratio.value = 20;
      limiter.attack.value = 0.004; limiter.release.value = 0.22;
      limiter.connect(ctx.destination);
      master = ctx.createGain(); master.connect(limiter);
      musicBus = ctx.createGain(); musicBus.connect(master);
      ambBus = ctx.createGain(); ambBus.connect(master);
      murmurBus = ctx.createGain(); murmurBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      reverb = ctx.createConvolver(); reverb.buffer = makeRoomIR(ctx);
      reverbIn = ctx.createGain(); reverbIn.gain.value = 1;
      reverbIn.connect(reverb); reverb.connect(master);
      ctx.onstatechange = () => setStatus(ctx?.state === "running" ? "running" : "suspended");
      (window as unknown as { __npcAudio?: typeof debugState }).__npcAudio = debugState;
    }
    if (ctx.state !== "running") await ctx.resume();
    applyBusGains();
    setStatus(ctx.state === "running" ? "running" : "suspended");
    setSettings({ enabled: true });
    return ctx.state === "running";
  } catch (e) { console.warn("[audio] enable failed", e); return false; }
}
export async function disable() {
  setSettings({ enabled: false });
  if (ctx && ctx.state === "running") await ctx.suspend();
  setStatus(ctx ? "suspended" : "off");
}
function applyBusGains() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.master, t, 0.05);
  musicBus.gain.setTargetAtTime(settings.music, t, 0.05);
  ambBus.gain.setTargetAtTime(settings.ambience, t, 0.05);
  murmurBus.gain.setTargetAtTime(settings.murmur, t, 0.05);
  sfxBus.gain.setTargetAtTime(settings.ambience, t, 0.05);
}
export const isRunning = () => !!ctx && ctx.state === "running";
/** Debug/observability hook used by the smoke tests (window.__npcAudio()). */
export function debugState() {
  return {
    state: ctx?.state ?? "off", sampleRate: ctx?.sampleRate ?? 0,
    buffers: [...buffers.keys()], loaded: buffers.size, settings,
    reduction: limiter ? limiter.reduction : 0,
  };
}

/* ------------------------------------------------------------------ buffers ------------------------------------------------------------------ */

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
export function loadBuffer(url: string): Promise<AudioBuffer | null> {
  if (!ctx) return Promise.resolve(null);
  const hit = buffers.get(url); if (hit) return Promise.resolve(hit);
  const inflight = loading.get(url); if (inflight) return inflight;
  const p = (async () => {
    try {
      const res = await fetch(url); if (!res.ok) throw new Error(String(res.status));
      const buf = await ctx!.decodeAudioData(await res.arrayBuffer());
      buffers.set(url, buf); return buf;
    } catch (e) { console.warn("[audio] failed to load", url, e); return null; }
    finally { loading.delete(url); }
  })();
  loading.set(url, p);
  return p;
}
export const hasBuffer = (url: string) => buffers.has(url);

/* ------------------------------------------------------------------ loop players ------------------------------------------------------------------ */

export type Bus = "music" | "ambience" | "murmur" | "sfx";
const busOf = (b: Bus) => (b === "music" ? musicBus : b === "ambience" ? ambBus : b === "murmur" ? murmurBus : sfxBus);

export interface LoopOpts {
  /** low-pass cutoff in Hz — distance muffling. 20000 = wide open. */
  cutoff?: number;
  /** 0..1 send into the shared room reverb — "this source is indoors". */
  send?: number;
  /** playback rate; used to detune the second instance of a doubled loop. */
  rate?: number;
  /** seconds for the gain ramp (music beds want 6-10 s, ambience ~2 s). */
  ramp?: number;
}

/**
 * One looping source with its own filter, pan, gain and reverb send. Created
 * once per (asset, layer) and then only *set* — it is never stopped and
 * restarted for mix reasons, so a music bed that is re-selected keeps playing
 * from where it was instead of jumping back to the top.
 */
export class LoopPlayer {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private send: GainNode | null = null;
  private target = 0;
  private started = false;
  readonly url: string;
  /** 0..1 — where in the buffer this instance starts, so doubled loops stay out of phase. */
  constructor(url: string, private bus: Bus, private offset = Math.random(), private baseRate = 1) { this.url = url; }

  /** Target gain 0..1, pan -1..1, and optional filtering/send. Ramps smoothly. */
  set(gain: number, pan = 0, ramp = 1.5, opts: LoopOpts = {}) {
    this.target = gain;
    if (!ctx || !isRunning()) return;
    if (gain > 0.004 && !this.started) this.start();
    if (!this.gain) return;
    const t = ctx.currentTime;
    // setTargetAtTime's time constant: ~3τ to settle, so τ = ramp/3 makes `ramp` the audible crossfade length
    this.gain.gain.setTargetAtTime(Math.max(0, gain), t, Math.max(0.02, ramp / 3));
    if (this.pan) this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.3);
    if (this.lp) this.lp.frequency.setTargetAtTime(Math.max(180, Math.min(20000, opts.cutoff ?? 20000)), t, 0.35);
    if (this.send) this.send.gain.setTargetAtTime(Math.max(0, Math.min(1, opts.send ?? 0)), t, 0.5);
    if (this.src && opts.rate !== undefined) this.src.playbackRate.setTargetAtTime(this.baseRate * opts.rate, t, 0.5);
  }
  private start() {
    if (!ctx) return;
    this.started = true;
    loadBuffer(this.url).then((buf) => {
      if (!buf || !ctx || this.src) return;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = this.baseRate;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 20000; lp.Q.value = 0.7;
      const p = ctx.createStereoPanner();
      const g = ctx.createGain(); g.gain.value = 0;
      const send = ctx.createGain(); send.gain.value = 0;
      src.connect(lp); lp.connect(p); p.connect(g); g.connect(busOf(this.bus)); g.connect(send); send.connect(reverbIn);
      // start at a fixed-per-instance offset so two instances of one loop, or the
      // same bed heard twice, never phase-lock into obvious repetition
      src.start(0, this.offset * Math.max(0, buf.duration - 0.5));
      this.src = src; this.gain = g; this.pan = p; this.lp = lp; this.send = send;
      g.gain.setTargetAtTime(this.target, ctx.currentTime, 0.8);
    });
  }
  stop() {
    try { this.src?.stop(); } catch { /* already stopped */ }
    for (const n of [this.src, this.gain, this.pan, this.lp, this.send]) n?.disconnect();
    this.src = null; this.gain = null; this.pan = null; this.lp = null; this.send = null; this.started = false;
  }
  get active() { return this.started; }
  get level() { return this.target; }
}

/* ------------------------------------------------------------------ one-shots ------------------------------------------------------------------ */

export function playOneShot(url: string, opts: { gain?: number; pan?: number; rate?: number; bus?: Bus; cutoff?: number; send?: number } = {}) {
  if (!ctx || !isRunning()) return;
  loadBuffer(url).then((buf) => {
    if (!buf || !ctx) return;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = opts.rate ?? 1;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.max(180, Math.min(20000, opts.cutoff ?? 20000)); lp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = opts.gain ?? 1;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0));
    src.connect(lp); lp.connect(p); p.connect(g); g.connect(busOf(opts.bus ?? "sfx"));
    let send: GainNode | null = null;
    if (opts.send) { send = ctx.createGain(); send.gain.value = opts.send; g.connect(send); send.connect(reverbIn); }
    src.start();
    src.onended = () => { src.disconnect(); lp.disconnect(); g.disconnect(); p.disconnect(); send?.disconnect(); };
  });
}

/** Tiny synthesized "bumble" used when no murmur clip is available (two soft sine blips). */
export function playBlip(pitch = 440, gain = 0.15, pan = 0) {
  if (!ctx || !isRunning()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(pitch, t); o.frequency.exponentialRampToValueAtTime(pitch * 0.8, t + 0.18);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  o.connect(g); g.connect(p); p.connect(murmurBus); o.start(t); o.stop(t + 0.25);
}
