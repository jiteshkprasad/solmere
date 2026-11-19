/**
 * The audio director. Runs inside the Canvas, once per frame (throttled to ~10 Hz
 * for the mix maths): decides which music bed plays for where the camera is
 * looking, at what time of day, under which world event; sets spatial gain, pan
 * and distance low-pass for every ambience loop from the camera's ground focus
 * point; plays one-shots on sim beats (bells, thunder, fireworks, cheers) and
 * short indistinct "murmur" clips whenever a conversation line is spoken nearby.
 *
 * Three things make it sound like a place rather than a playlist:
 *
 *  · Distance is a filter, not just a fader. Every source gets a low-pass whose
 *    cutoff slides from ~18 kHz when you are on top of it down to ~900 Hz at the
 *    edge of its radius, so the far side of town is muffled instead of merely quiet.
 *  · Interiors get a send into the shared room reverb, so the tavern, the chapel
 *    and the workshops sound enclosed while the harbour stays open.
 *  · The busiest beds (sea, crowd, rain, crickets…) run as two instances of the
 *    same loop at different offsets, rates and pans, which kills the "that's a
 *    26-second loop" tell without a second download.
 *
 * Music beds crossfade over ~8 s, are never restarted once selected, and duck
 * when a point-source bed (tavern band, chapel organ, café radio) takes over.
 */
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useWorld } from "@/lib/store";
import { LoopPlayer, playOneShot, playBlip, isRunning, getSettings, subscribeSettings, loadBuffer } from "@/lib/audio/engine";
import { getContent, simHour } from "../content";
import { npcRender } from "../npcRuntime";
import appearanceJson from "../../../../../../content/appearance.json";

type Hours = [number, number];
interface MusicDef { id: string; zones: string[]; hours: Hours; gain: number; point?: boolean; event?: string; file: string | null }
interface Place { kind: "points" | "zone" | "line" | "global"; locations?: string[]; districts?: string[]; district?: string; points?: [number, number][]; radius?: number }
interface AmbDef { id: string; gain: number; place: Place; hours: Hours; event?: string; layers?: number; file: string | null }
interface ShotDef { id: string; gain: number; file: string | null }
interface Mix { crossfadeSeconds?: number; pointDuck?: number; distanceLowpass?: { nearHz: number; farHz: number; interiorHz: number } }
interface Manifest { music: MusicDef[]; ambience: AmbDef[]; oneShots: ShotDef[]; murmur: ShotDef[]; mix: Mix }

const inHours = (h: number, [a, b]: Hours) => (a <= b ? h >= a && h < b : h >= a || h < b);
/** soft edge: 1 inside, fading to 0 over `edge` sim-hours outside the window */
function hoursWeight(h: number, w: Hours, edge = 0.5): number {
  if (inHours(h, w)) return 1;
  const dist = (x: number, y: number) => Math.min(Math.abs(x - y), 24 - Math.abs(x - y));
  const d = Math.min(dist(h, w[0]), dist(h, w[1]));
  return Math.max(0, 1 - d / edge);
}
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const falloff = (d: number, r: number) => 1 - smooth((d / r - 0.25) / 0.75);
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967295; };

/** Locations whose ambience is heard from inside a room: reverb send + darker tone. */
const INTERIOR = new Set(["a_tavern", "a_cafe", "a_chapel", "a_school", "a_clinic", "a_bakery", "a_carpentry", "a_garage", "a_brewery"]);
const INTERIOR_MUSIC = new Set(["m_tavern", "m_chapel", "m_cafe"]);

type App = { gender?: string; age?: string; build?: string };
const APPEAR = (appearanceJson as { npcs: Record<string, App> }).npcs;
function murmurClipFor(npcId: string, clips: ShotDef[]): ShotDef | undefined {
  const a = APPEAR[npcId] ?? {};
  const pick = (id: string) => clips.find((c) => c.id === id && c.file);
  if (a.age === "elder") return pick("v_elder") ?? clips[0];
  if (a.age === "young") return pick("v_young") ?? clips[0];
  if (a.gender === "M") return (a.build === "heavy" || a.build === "sturdy" ? pick("v_m_low") : pick("v_m_mid")) ?? pick("v_m_low");
  if (a.gender === "F") return (a.age === "middle" || a.age === "senior" ? pick("v_f_low") : pick("v_f_mid")) ?? pick("v_f_mid");
  return pick("v_young") ?? clips.find((c) => c.file);
}

export default function AudioLayer() {
  const { camera } = useThree();
  const manifest = useRef<Manifest | null>(null);
  const music = useRef(new Map<string, LoopPlayer>());
  const amb = useRef(new Map<string, LoopPlayer[]>());
  const acc = useRef(0);
  const currentMusic = useRef<string | null>(null);
  const lastBell = useRef(-1);
  const lastThunder = useRef(0);
  const lastFoghorn = useRef(0);
  const lastFirework = useRef(0);
  const seenSeq = useRef<number>(-1);
  const lineSeen = useRef(new Map<string, number>());
  const enabled = useRef(getSettings().enabled);

  useEffect(() => subscribeSettings(() => { enabled.current = getSettings().enabled; }), []);

  useEffect(() => {
    let cancelled = false;
    const musicMap = music.current, ambMap = amb.current;
    fetch("/audio/manifest.json").then((r) => (r.ok ? r.json() : null)).then((m: Manifest | null) => {
      if (cancelled || !m) return;
      manifest.current = m;
      for (const d of m.music) if (d.file) musicMap.set(d.id, new LoopPlayer(d.file, "music", hash(d.id)));
      for (const d of m.ambience) {
        if (!d.file) continue;
        const n = Math.max(1, Math.min(2, d.layers ?? 1));
        // staggered instances: different start offsets and a ±1.5 % rate detune so
        // the two copies drift apart instead of doubling the same 26 seconds
        ambMap.set(d.id, Array.from({ length: n }, (_, i) =>
          new LoopPlayer(d.file!, "ambience", (hash(d.id) + i / n) % 1, n === 1 ? 1 : 1 + (i === 0 ? -0.015 : 0.015))));
      }
    }).catch(() => { /* no audio generated yet */ });
    return () => { cancelled = true; musicMap.forEach((p) => p.stop()); ambMap.forEach((ps) => ps.forEach((p) => p.stop())); };
  }, []);

  // scratch
  const focus = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const m = manifest.current;
    if (!m || !enabled.current || !isRunning()) return;
    acc.current += dt;
    if (acc.current < 0.1) return; // ~10 Hz
    acc.current = 0;

    const content = getContent();
    if (!content) return;
    const st = useWorld.getState();
    const hour = simHour();
    const events = new Set((st.snapshot?.activeWorldEvents ?? []).map((e) => e.cardId));
    if (st.election && st.time && st.election.nextElectionDay === st.time.day) events.add("election_day");

    // ground focus point: where the camera is looking, on y≈0
    camera.getWorldDirection(dir);
    const camY = camera.position.y;
    const t = dir.y < -0.05 ? -camY / dir.y : 200;
    focus.copy(camera.position).addScaledVector(dir, Math.min(t, 400));
    right.set(dir.z, 0, -dir.x).normalize();
    const localFactor = Math.max(0.25, Math.min(1, (110 - camY) / 70)); // high camera → hears a wide mix, less local detail

    const lp = m.mix?.distanceLowpass ?? { nearHz: 18000, farHz: 900, interiorHz: 5200 };
    /** proximity 0..1 → low-pass cutoff, interpolated in the log domain (how ears hear it) */
    const cutoffFor = (prox: number, interior = false) => {
      const near = interior ? Math.min(lp.interiorHz, lp.nearHz) : lp.nearHz;
      const p = Math.max(0, Math.min(1, prox)) * (0.55 + 0.45 * localFactor);
      return lp.farHz * Math.pow(near / lp.farHz, p);
    };

    const districtPos = (id: string): [number, number] | null => {
      const d = content.town.districts.find((x) => x.id === id);
      return d ? [d.center[0], -d.center[1]] : null;
    };
    const locPos = (id: string): [number, number] | null => {
      const l = content.town.locations.find((x) => x.id === id);
      return l ? [l.pos[0], -l.pos[1]] : null;
    };
    const dist2d = (p: [number, number]) => Math.hypot(focus.x - p[0], focus.z - p[1]);
    const panTo = (p: [number, number]) => { tmp.set(p[0] - camera.position.x, 0, p[1] - camera.position.z); const len = tmp.length() || 1; return Math.max(-0.7, Math.min(0.7, (tmp.dot(right) / len) * 0.7)); };

    /* ---------------- music ---------------- */
    let best: { def: MusicDef; score: number; pan: number } | null = null;
    let pointBest: { def: MusicDef; g: number; pan: number } | null = null;
    for (const def of m.music) {
      if (!def.file) continue;
      const hw = hoursWeight(hour, def.hours, 0.75);
      if (hw <= 0) continue;
      if (def.event && !events.has(def.event)) continue;
      if (def.point) {
        // room music at a specific location (tavern, chapel, café): only when close and low
        const p = locPos(def.zones[0]); if (!p) continue;
        const g = falloff(dist2d(p), 42) * hw * localFactor;
        if (g > 0.02 && (!pointBest || g > pointBest.g)) pointBest = { def, g, pan: panTo(p) };
        continue;
      }
      let zone = 0;
      for (const z of def.zones) {
        if (z === "*") { zone = Math.max(zone, 0.35); continue; }
        const p = districtPos(z); if (!p) continue;
        zone = Math.max(zone, 1 / (1 + Math.pow(dist2d(p) / 85, 2)));
      }
      const score = zone * hw * (def.event ? 1.6 : 1);
      if (!best || score > best.score) best = { def, score, pan: 0 };
    }
    // keep the current bed unless a clearly better one appears (hysteresis) or it became
    // ineligible. Selection only ever changes which player is faded *up* — players are
    // never stopped, so a bed that comes back does not restart from the top.
    const cur = currentMusic.current;
    if (best) {
      const curDef = m.music.find((d) => d.id === cur);
      const curStillOk = curDef && hoursWeight(hour, curDef.hours, 0.75) > 0 && (!curDef.event || events.has(curDef.event));
      if (!curStillOk || !cur) currentMusic.current = best.def.id;
      else {
        // recompute current's score for comparison
        let zone = 0;
        for (const z of curDef!.zones) { if (z === "*") { zone = Math.max(zone, 0.35); continue; } const p = districtPos(z); if (p) zone = Math.max(zone, 1 / (1 + Math.pow(dist2d(p) / 85, 2))); }
        const curScore = zone * hoursWeight(hour, curDef!.hours, 0.75) * (curDef!.event ? 1.6 : 1);
        if (best.score > curScore * 1.35) currentMusic.current = best.def.id;
      }
    } else currentMusic.current = null;
    const duckAmount = m.mix?.pointDuck ?? 0.75;
    const duck = pointBest ? 1 - pointBest.g * duckAmount : 1;
    const xf = m.mix?.crossfadeSeconds ?? 8;
    music.current.forEach((player, id) => {
      const def = m.music.find((d) => d.id === id)!;
      if (id === currentMusic.current) {
        // the town bed is "outside the window" while a room bed is playing: duck and darken it
        player.set(def.gain * duck, 0, xf, { cutoff: pointBest ? 1400 + 6000 * (1 - pointBest.g) : 20000 });
      } else if (pointBest && id === pointBest.def.id) {
        player.set(def.gain * pointBest.g, pointBest.pan, 2.5, {
          cutoff: cutoffFor(pointBest.g, INTERIOR_MUSIC.has(id)),
          send: INTERIOR_MUSIC.has(id) ? 0.22 * pointBest.g : 0,
        });
      } else player.set(0, 0, xf);
    });

    /* ---------------- ambience ---------------- */
    amb.current.forEach((players, id) => {
      const def = m.ambience.find((d) => d.id === id)!;
      const hw = hoursWeight(hour, def.hours, 0.6);
      if (hw <= 0 || (def.event && !events.has(def.event))) { players.forEach((p) => p.set(0, 0, 2.5)); return; }
      let g = 0, pan = 0, prox = 0;
      const pl = def.place;
      if (pl.kind === "global") { g = 1; prox = 0.85; }
      else if (pl.kind === "points" || pl.kind === "line") {
        const pts: [number, number][] = pl.kind === "points" ? (pl.locations ?? []).map(locPos).filter((p): p is [number, number] => !!p) : (pl.points ?? []).map(([x, y]) => [x, -y] as [number, number]);
        let bestD = Infinity, bestP: [number, number] | null = null;
        for (const p of pts) { const d = dist2d(p); if (d < bestD) { bestD = d; bestP = p; } }
        if (bestP) { g = falloff(bestD, pl.radius ?? 60) * (pl.kind === "points" ? localFactor : 1); pan = panTo(bestP); prox = g; }
      } else if (pl.kind === "zone") {
        let bestD = Infinity, bestP: [number, number] | null = null;
        for (const dId of pl.districts ?? []) { const p = districtPos(dId); if (!p) continue; const d = dist2d(p); if (d < bestD) { bestD = d; bestP = p; } }
        if (bestP) { g = falloff(bestD, pl.radius ?? 140); pan = panTo(bestP) * 0.5; prox = g; }
      }
      // storm quiets the birds and the market
      if (events.has("storm") && !def.event && /birds|songbirds|gulls|market|crickets|orchard/.test(id)) g *= 0.25;
      const interior = INTERIOR.has(id);
      const cutoff = cutoffFor(prox, interior);
      const send = interior ? 0.3 * prox : 0;
      const total = def.gain * g * hw;
      // two staggered instances share the level (÷√n keeps the summed power constant)
      const per = total / Math.sqrt(players.length);
      const spread = players.length > 1 ? 0.18 : 0;
      players.forEach((p, i) => p.set(per, pan + (i === 0 ? -spread : spread), 2.5, { cutoff, send }));
    });

    /* ---------------- beats (one-shots) ---------------- */
    const shot = (id: string, opts: { gain?: number; pan?: number; rate?: number; prox?: number; send?: number } = {}) => {
      const s = m.oneShots.find((x) => x.id === id); if (!s?.file) return;
      playOneShot(s.file, {
        gain: (s.gain ?? 0.5) * (opts.gain ?? 1), pan: opts.pan ?? 0, rate: opts.rate ?? 1, bus: "sfx",
        cutoff: cutoffFor(opts.prox ?? 0.9), send: opts.send ?? 0,
      });
    };
    const chapel = locPos("temple");
    const hFloor = Math.floor(hour);
    if ((hFloor === 6 || hFloor === 12 || hFloor === 18) && hour - hFloor < 0.05 && lastBell.current !== hFloor && chapel) {
      lastBell.current = hFloor;
      const near = falloff(dist2d(chapel), 160);
      shot("s_bell", { gain: 0.35 + 0.65 * near, pan: panTo(chapel), prox: 0.35 + 0.65 * near });
    }
    if (hFloor !== 6 && hFloor !== 12 && hFloor !== 18) lastBell.current = -1;
    const now = performance.now() / 1000;
    if (events.has("storm")) {
      if (now - lastThunder.current > 14 + Math.random() * 16) {
        lastThunder.current = now;
        const close = Math.random() < 0.3;
        shot(close ? "s_thunder_close" : "s_thunder", { pan: (Math.random() - 0.5) * 1.2, prox: close ? 0.95 : 0.4 });
      }
      const lh = locPos("lighthouse");
      if (lh && now - lastFoghorn.current > 45) { lastFoghorn.current = now; const near = falloff(dist2d(lh), 220); shot("s_foghorn", { gain: 0.3 + 0.7 * near, pan: panTo(lh), prox: 0.25 + 0.6 * near }); }
    }
    if (events.has("festival") && hour >= 21 && hour < 22.2 && now - lastFirework.current > 6 + Math.random() * 6) {
      lastFirework.current = now; const b = locPos("beach"); const near = b ? falloff(dist2d(b), 220) : 0.6;
      shot("s_fireworks", { gain: 0.4 + 0.6 * near, pan: b ? panTo(b) : 0, prox: 0.3 + 0.6 * near });
    }
    // event-driven: cheers / gasps for big drama, shop bell for nearby transactions
    const evs = st.events;
    if (evs.length) {
      const last = evs[evs.length - 1];
      if (seenSeq.current < 0) seenSeq.current = last.seq;
      else if (last.seq > seenSeq.current) {
        for (const e of evs) {
          if (e.seq <= seenSeq.current) continue;
          const p = e.locationId ? locPos(e.locationId) : null;
          const near = p ? falloff(dist2d(p), 90) : 0.3;
          if (e.type === "election_result" || e.type === "speech" || e.type === "festival") shot("s_cheer", { gain: 0.5 + 0.5 * near, pan: p ? panTo(p) : 0, prox: near });
          else if (e.drama >= 8 && (e.type === "argument" || e.type === "feud" || e.type === "eviction" || e.type === "crime" || e.type === "breakup")) shot("s_gasp", { gain: 0.3 + 0.7 * near, pan: p ? panTo(p) : 0, prox: near });
          else if (e.type === "transaction" && near > 0.6 && Math.random() < 0.35) shot("s_door_bell", { gain: near, pan: p ? panTo(p) : 0, rate: 0.95 + Math.random() * 0.1, prox: near, send: 0.2 });
        }
        seenSeq.current = last.seq;
      }
    }

    /* ---------------- murmur: a soft "bumble" per spoken line, from the speaker's position ---------------- */
    const murmurOn = getSettings().murmur > 0.01;
    for (const c of Object.values(st.conversations)) {
      if (c.done) { lineSeen.current.delete(c.id); continue; }
      const prev = lineSeen.current.get(c.id);
      if (prev === c.cursor) continue;
      lineSeen.current.set(c.id, c.cursor);
      if (prev === undefined && c.cursor > 0) continue; // joined mid-conversation
      const line = c.lines[c.cursor]; if (!line || !murmurOn) continue;
      const r = npcRender.get(line.speaker);
      const px: [number, number] = r ? [r.x, r.z] : (locPos(c.locationId) ?? [focus.x, focus.z]);
      const d = dist2d(px);
      const g = falloff(d, 70) * localFactor;
      if (g < 0.03) continue;
      const clip = murmurClipFor(line.speaker, m.murmur);
      const rate = 0.92 + hash(line.speaker) * 0.16;
      const words = line.text.split(/\s+/).length;
      // voices lose their consonants with distance faster than anything else
      const cutoff = cutoffFor(g * 0.9);
      if (clip?.file) {
        // longer lines → play the clip up to twice, slightly offset
        playOneShot(clip.file, { gain: 0.55 * g, pan: panTo(px), rate, bus: "murmur", cutoff });
        if (words > 12) setTimeout(() => playOneShot(clip.file!, { gain: 0.4 * g, pan: panTo(px), rate: rate * 1.03, bus: "murmur", cutoff }), 900 + Math.random() * 400);
      } else {
        playBlip(300 + hash(line.speaker) * 260, 0.12 * g, panTo(px));
      }
    }
    // warm the murmur clips so the first line isn't silent
    if (m.murmur.length && Math.random() < 0.05) for (const c of m.murmur) if (c.file) loadBuffer(c.file);
  });

  return null;
}
