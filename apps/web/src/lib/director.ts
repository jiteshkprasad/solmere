/**
 * The Director: every ~3 s it scores candidate "scenes" from the live store
 * and, when the camera is in director mode, writes ui.directorFocus (+ the
 * primary NPC into followNpcId) so CameraRig can frame it and the HUD can
 * show `reason` as a banner.
 *
 * Scoring (see NOTES-scene.md):
 *   conversation    base = drama; +2 romantic/rival/enemy pair or storyline; +3 recent (30 s) event drama ≥ 7 with a participant; +2 crowd ≥ 4 at that spot
 *   event           drama ≥ 6 in the last 20 s → drama (+5 speech/election/festival)
 *   crowd           ≥ 4 awake NPCs at one location → 2 + 0.5/extra (+5 if a festival / speech is on)
 *   speech          an NPC whose action is "speech" → 5 + crowd
 *   wander          fallback: a walking/working NPC, score 1 — so there's always something to watch
 * The winner is held ≥ 12 s (events 20 s) unless a candidate with score ≥ 8 appears.
 */
"use client";
import { useWorld } from "./store";
import { firstName, locName } from "@/components/scene/content";

export interface Candidate { key: string; score: number; npcIds: string[]; locationId: string | null; reason: string; primary: string | null; hold: number }

const INTERVAL_MS = 3000;
const HOLD_MS = 12000;
const EVENT_HOLD_MS = 20000;
const RECENT_MS = 30000;
const eventSeen = new Map<number, number>(); // seq → wall ms first seen
let timer: number | null = null;
let held: { key: string; until: number } | null = null;
let firstRun = true;
let lastWrittenKey = "";

/** Identity of the scene currently in ui.directorFocus (stable while a crowd's membership churns). CameraRig keys its cuts on this. */
export const directorState = { key: "", since: 0 };

export function startDirector(): () => void {
  if (timer != null) return stopDirector;
  tick();
  timer = window.setInterval(tick, INTERVAL_MS);
  return stopDirector;
}
/**
 * Replay mode: hold the camera on a given scene (a jumped-to moment) for `ms`,
 * whatever else scores higher, and switch to director mode so the cut happens.
 */
let pin: { focus: { npcIds: string[]; locationId: string | null; reason: string }; until: number } | null = null;
export function pinDirector(focus: { npcIds: string[]; locationId: string | null; reason: string }, ms: number) {
  pin = { focus, until: Date.now() + ms };
  held = null;
  const s = useWorld.getState();
  if (s.ui.cameraMode !== "director") s.setCameraMode("director");
  tick();
}

export function stopDirector() { if (timer != null) { window.clearInterval(timer); timer = null; } }

const pairKey = (a: string, b: string) => (a < b ? a + "|" + b : b + "|" + a);
const HOT_STORY = /romanc|romantic|rival|feud|enemy|affair|date|jealous|scandal|betray|love/i;
const BIG_EVENT = new Set(["speech", "election_declared", "election_result", "vote", "festival"]);

function names(ids: string[]): string {
  const n = ids.map(firstName);
  if (n.length <= 1) return n[0] ?? "Someone";
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}
const trim = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

/** Score every candidate scene from the current store. Exported for tests/HUD debugging. */
export function scoreScenes(): Candidate[] {
  const s = useWorld.getState();
  const now = Date.now();

  // stamp events with the wall-clock time we first saw them
  for (const e of s.events) if (!eventSeen.has(e.seq)) eventSeen.set(e.seq, firstRun ? now - RECENT_MS - 1 : now);
  if (firstRun) { for (const e of s.events.slice(-5)) eventSeen.set(e.seq, now); firstRun = false; }
  for (const [seq, t] of eventSeen) if (now - t > 5 * 60_000) eventSeen.delete(seq);

  const recent = s.events.filter((e) => now - (eventSeen.get(e.seq) ?? 0) < RECENT_MS);
  const recentHigh = recent.filter((e) => e.drama >= 7);

  // relationship hot pairs
  const hot = new Set<string>();
  for (const r of s.snapshot?.relationships ?? []) if (r.type === "romantic" || r.type === "rival" || r.type === "enemy") hot.add(pairKey(r.a, r.b));
  const hotStoryActors = new Set<string>();
  for (const st of s.storylines) if (st.status !== "resolved" && HOT_STORY.test(st.title + " " + st.summary)) for (const a of st.actors) hotStoryActors.add(a);

  // crowds by location (awake NPCs only)
  const byLoc = new Map<string, string[]>();
  for (const id in s.npcs) { const n = s.npcs[id]; if (n.action === "sleep") continue; const arr = byLoc.get(n.locationId) ?? []; arr.push(id); byLoc.set(n.locationId, arr); }

  const festival = (s.snapshot?.activeWorldEvents ?? []).some((e) => /festival|market day|fair/i.test(e.title));
  const out: Candidate[] = [];

  // conversations
  for (const c of Object.values(s.conversations)) {
    if (c.done) continue;
    let score = c.drama;
    const p = c.participants;
    let hotPair = false;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (hot.has(pairKey(p[i], p[j]))) hotPair = true;
    if (hotPair || p.some((id) => hotStoryActors.has(id))) score += 2;
    if (recentHigh.some((e) => e.actors.some((a) => p.includes(a)))) score += 3;
    const crowd = byLoc.get(c.locationId)?.length ?? 0;
    if (crowd >= 4) score += 2;
    const line = c.lines[c.cursor];
    const speaker = line?.speaker ?? p[0] ?? null;
    const tail = c.summary ? trim(c.summary, 48) : line ? trim(line.text, 48) : "talking";
    out.push({ key: "conv:" + c.id, score, npcIds: p, locationId: c.locationId, reason: `${names(p)}, at ${locName(c.locationId)} — ${tail}`, primary: speaker, hold: HOLD_MS });
  }

  // recent high-drama events
  for (const e of recent) {
    const age = now - (eventSeen.get(e.seq) ?? 0);
    if (e.drama < 6 || age > 20000) continue;
    const score = e.drama + (BIG_EVENT.has(e.type) ? 5 : 0);
    const locId = e.locationId ?? (e.actors[0] ? s.npcs[e.actors[0]]?.locationId ?? null : null);
    out.push({ key: "evt:" + e.seq, score, npcIds: e.actors, locationId: locId, reason: trim(e.text, 90), primary: e.actors[0] ?? null, hold: EVENT_HOLD_MS });
  }

  // crowds + speeches
  for (const [locId, ids] of byLoc) {
    const speaker = ids.find((id) => s.npcs[id].action === "speech");
    if (ids.length >= 4 || speaker) {
      let score = ids.length >= 4 ? 2 + 0.5 * (ids.length - 4) : 0;
      if (speaker) score += 5;
      if (festival && (locId === "town_square" || ids.length >= 6)) score += 5;
      if (ids.some((id) => s.npcs[id].action === "talk")) score += 1;
      const reason = speaker ? `${firstName(speaker)} addresses the crowd at ${locName(locId)}` : festival && locId === "town_square" ? `Festival in ${locName(locId)}` : `A crowd of ${ids.length} at ${locName(locId)}`;
      out.push({ key: "crowd:" + locId, score, npcIds: speaker ? [speaker, ...ids.filter((i) => i !== speaker)] : ids, locationId: locId, reason, primary: speaker ?? ids[0], hold: HOLD_MS });
    }
  }

  // fallback: someone on the move / at work
  const wanderers = Object.values(s.npcs).filter((n) => n.action === "walk" || n.action === "work" || n.action === "leisure");
  if (wanderers.length) {
    const n = wanderers[Math.floor((now / 15000) % wanderers.length)]; // rotates slowly; stable within a hold window
    const verb = n.action === "walk" ? `heading to ${locName(n.targetLocationId ?? n.locationId)}` : n.activity || `at ${locName(n.locationId)}`;
    out.push({ key: "npc:" + n.id, score: 1, npcIds: [n.id], locationId: n.locationId, reason: `${firstName(n.id)} — ${trim(verb, 60)}`, primary: n.id, hold: HOLD_MS });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

function tick() {
  const s = useWorld.getState();
  const now = Date.now();
  const pinned = pin && now < pin.until ? pin : null;
  if (pin && !pinned) pin = null;
  const cands = pinned
    ? [{ key: "pin:" + pinned.focus.reason, score: 99, npcIds: pinned.focus.npcIds, locationId: pinned.focus.locationId, reason: pinned.focus.reason, primary: pinned.focus.npcIds[0] ?? null, hold: HOLD_MS }]
    : scoreScenes();
  if (!cands.length) return;
  let pick = cands[0];
  if (!pinned && held && now < held.until) {
    const cur = cands.find((c) => c.key === held!.key);
    if (cur && !(pick.score >= 8 && pick.key !== cur.key)) pick = cur; // keep the held scene
    else if (!cur) held = null; // the held scene ended
  }
  if (!held || held.key !== pick.key) held = { key: pick.key, until: now + pick.hold };

  // directorFocus is kept current in every camera mode (the HUD banner reads it);
  // the camera target (followNpcId) is only touched in director mode.
  const director = s.ui.cameraMode === "director";
  if (pick.key === lastWrittenKey && s.ui.directorFocus) {
    // same scene: refresh participants/reason (someone joined, the line moved on).
    // CameraRig keys its cuts on directorState.key, so this never causes a cut.
    const f = s.ui.directorFocus;
    if (f.reason !== pick.reason || f.npcIds.join() !== pick.npcIds.join()) s.setUi({ directorFocus: { ...f, npcIds: pick.npcIds, reason: pick.reason } });
    return;
  }
  lastWrittenKey = pick.key;
  directorState.key = pick.key; directorState.since = now;
  const patch: Parameters<typeof s.setUi>[0] = { directorFocus: { npcIds: pick.npcIds, locationId: pick.locationId, reason: pick.reason } };
  if (director) patch.followNpcId = pick.primary;
  s.setUi(patch);
}
