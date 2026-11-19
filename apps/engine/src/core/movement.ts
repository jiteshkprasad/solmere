import type { NpcState } from "@npcworld/schema";
import type { World } from "./types.js";
import { absMinutes } from "./clock.js";
import { emit } from "./eventlog.js";

export const WALK_SPEED_MPS = 1.4;

const routesByWorld = new WeakMap<World, Map<string, [number, number][]>>(); // npcId -> remaining waypoints
function routesOf(w: World): Map<string, [number, number][]> {
  let m = routesByWorld.get(w);
  if (!m) routesByWorld.set(w, (m = new Map()));
  return m;
}

/** Start walking to a location (no-op if already there). Returns true if a walk began. */
export function startWalk(w: World, npc: NpcState, locationId: string): boolean {
  if (npc.locationId === locationId && npc.targetLocationId === null) return false;
  if (npc.targetLocationId === locationId) return false;
  const loc = w.content.locations[locationId];
  if (!loc) return false;
  const from = npc.pos;
  const waypoints: [number, number][] = [];
  const center = w.content.districtCenter[loc.district];
  // long trips route via the destination district's centre so paths look like streets
  if (center && dist(from, loc.pos) > 120 && dist(center, loc.pos) > 15) waypoints.push([center[0], center[1]]);
  waypoints.push([loc.pos[0] + jitter(w, locationId, npc.id), loc.pos[1] + jitter(w, npc.id, locationId)]);
  routesOf(w).set(npc.id, waypoints);
  npc.targetLocationId = locationId;
  npc.action = "walk";
  npc.activity = `walking to ${loc.name}`;
  w.rt[npc.id].hereSinceMin = Infinity;
  return true;
}

/** deterministic small offset so NPCs at the same place don't stack on one point */
function jitter(w: World, a: string, b: string): number {
  let h = 0;
  for (const ch of a + b) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (h / 997 - 0.5) * 6;
}

export function dist(a: readonly [number, number], b: readonly [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.hypot(dx, dy);
}

/** Advance every walking NPC by dtMinutes. Emits "arrival" only for notable arrivals. */
export function stepMovement(w: World, dtMinutes: number): string[] {
  const arrived: string[] = [];
  const budget = dtMinutes * 60 * WALK_SPEED_MPS;
  const routes = routesOf(w);
  for (const npc of Object.values(w.npcs)) {
    if (!npc.targetLocationId) continue;
    let remaining = budget;
    const wps = routes.get(npc.id) ?? [];
    while (remaining > 0 && wps.length) {
      const target = wps[0];
      const d = dist(npc.pos, target);
      if (d <= remaining) {
        npc.pos = [target[0], target[1]];
        remaining -= d;
        wps.shift();
      } else {
        const t = remaining / d;
        npc.pos = [npc.pos[0] + (target[0] - npc.pos[0]) * t, npc.pos[1] + (target[1] - npc.pos[1]) * t];
        remaining = 0;
      }
    }
    if (wps.length === 0) {
      routes.delete(npc.id);
      const to = npc.targetLocationId;
      npc.locationId = to;
      npc.targetLocationId = null;
      w.rt[npc.id].hereSinceMin = absMinutes(w.clock);
      arrived.push(npc.id);
      const loc = w.content.locations[to];
      if (loc && isNotableArrival(w, npc, to)) {
        emit(w, "arrival", `${npc.name} arrives at ${loc.name}.`, { actors: [npc.id], locationId: to, importance: 1, drama: 1, quiet: true });
      }
    }
  }
  return arrived;
}

/** Notable = arriving somewhere public where an enemy or a romance is already present. */
function isNotableArrival(w: World, npc: NpcState, locationId: string): boolean {
  const loc = w.content.locations[locationId];
  if (!loc || loc.type === "home") return false;
  for (const other of Object.values(w.npcs)) {
    if (other.id === npc.id || other.locationId !== locationId || other.targetLocationId) continue;
    const a = w.rel.get(`${npc.id}|${other.id}`)?.affinity ?? 0;
    if (a <= -40 || a >= 70) return true;
  }
  return false;
}

export function teleport(w: World, npc: NpcState, locationId: string): void {
  const loc = w.content.locations[locationId];
  if (!loc) return;
  routesOf(w).delete(npc.id);
  npc.pos = [loc.pos[0], loc.pos[1]];
  npc.locationId = locationId;
  npc.targetLocationId = null;
  w.rt[npc.id].hereSinceMin = absMinutes(w.clock);
}
