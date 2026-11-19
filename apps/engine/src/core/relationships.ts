import type { RelationshipState, RelationshipType } from "@npcworld/schema";
import type { World } from "./types.js";
import { emit } from "./eventlog.js";
import { addMemory } from "./memory.js";

export const relKey = (a: string, b: string) => `${a}|${b}`;

export function getRel(w: World, a: string, b: string): RelationshipState | undefined {
  return w.rel.get(relKey(a, b));
}

export function affinity(w: World, a: string, b: string): number {
  return w.rel.get(relKey(a, b))?.affinity ?? 0;
}

export function ensureRel(w: World, a: string, b: string, type: RelationshipType = "colleague"): RelationshipState {
  let r = w.rel.get(relKey(a, b));
  if (!r) {
    r = { a, b, type, affinity: 0, lastInteractionDay: null };
    w.rel.set(relKey(a, b), r);
  }
  return r;
}

export function edgesOf(w: World, id: string): RelationshipState[] {
  const out: RelationshipState[] = [];
  for (const r of w.rel.values()) if (r.a === id) out.push(r);
  return out.sort((x, y) => Math.abs(y.affinity) - Math.abs(x.affinity));
}

export function edgesTouching(w: World, id: string): RelationshipState[] {
  const out: RelationshipState[] = [];
  for (const r of w.rel.values()) if (r.a === id || r.b === id) out.push(r);
  return out;
}

const clamp = (n: number) => Math.max(-100, Math.min(100, n));

/**
 * Apply an affinity delta a->b (clamped to +-30 per update, -100..100 total) and emit the
 * derived social events when a threshold is crossed: romance (+70 with a romantic type),
 * friendship (+50), feud (-50), breakup (romantic/spouse falling under 20).
 */
export function applyAffinity(w: World, a: string, b: string, delta: number, locationId: string | null = null): void {
  if (a === b || !w.npcs[a] || !w.npcs[b]) return;
  const d = Math.max(-30, Math.min(30, delta));
  const r = ensureRel(w, a, b, d >= 0 ? "friend" : "rival");
  const before = r.affinity;
  r.affinity = clamp(before + d);
  r.lastInteractionDay = w.clock.day;
  const na = w.npcs[a].name;
  const nb = w.npcs[b].name;
  const reverse = getRel(w, b, a);
  const romanticType = r.type === "romantic" || reverse?.type === "romantic";
  const coupled = r.type === "spouse" || reverse?.type === "spouse" || romanticType;
  if (romanticType && before < 70 && r.affinity >= 70) {
    emit(w, "romance", `${na} has fallen for ${nb}.`, { actors: [a, b], locationId, importance: 8 });
  } else if (!coupled && before < 50 && r.affinity >= 50) {
    if (r.type !== "family") r.type = "friend";
    emit(w, "friendship", `${na} and ${nb} are becoming real friends.`, { actors: [a, b], locationId, importance: 5 });
  }
  if (before > -50 && r.affinity <= -50) {
    if (r.type !== "family" && r.type !== "spouse") r.type = "enemy";
    emit(w, "feud", `${na} now counts ${nb} as an enemy.`, { actors: [a, b], locationId, importance: 7 });
  }
  if (coupled && before >= 20 && r.affinity < 20) {
    emit(w, "breakup", `${na} is done with ${nb}. Whatever they had is over.`, { actors: [a, b], locationId, importance: 8 });
    if (r.type === "romantic") r.type = "rival";
    if (reverse && reverse.type === "romantic") reverse.type = "rival";
  }
}

export function addGossip(w: World, npcId: string, text: string, about: string[] = []): void {
  addMemory(w, npcId, "gossip", text, 4, about);
}

export function relationshipsArray(w: World): RelationshipState[] {
  return [...w.rel.values()];
}

/** cohesion (0..1) and lonely list for metrics */
export function socialMetrics(w: World): { cohesion: number; lonely: string[] } {
  const ids = Object.keys(w.npcs);
  const n = ids.length;
  let positive = 0;
  const hasPositive = new Set<string>();
  for (const r of w.rel.values()) {
    if (r.affinity > 0) {
      positive++;
      hasPositive.add(r.a);
      hasPositive.add(r.b);
    }
  }
  // density relative to a "well-connected" town of ~8 positive edges per person
  const cohesion = Math.min(1, positive / (n * 8));
  const lonely = ids.filter((id) => !hasPositive.has(id));
  return { cohesion, lonely };
}
