import type { Memory } from "@npcworld/schema";
import type { World } from "./types.js";
import { absHours } from "./clock.js";

export const MEMORY_CAP = 400;

let memSeq = 0;

export function addMemory(
  w: World,
  npcId: string,
  kind: Memory["kind"],
  text: string,
  importance: number,
  about: string[] = [],
): Memory {
  const m: Memory = {
    id: `m${w.clock.day}_${(memSeq++).toString(36)}_${npcId.slice(0, 4)}`,
    npcId,
    day: w.clock.day,
    hour: Math.floor(w.clock.dayMinutes / 60),
    kind,
    text,
    importance: Math.max(0, Math.min(10, importance)),
    about: about.filter((a) => a !== npcId),
  };
  const list = (w.memories[npcId] ??= []);
  list.push(m);
  if (list.length > MEMORY_CAP) list.splice(0, list.length - MEMORY_CAP);
  w.unsavedMemories.push(m);
  if (importance >= 6 && kind !== "reflection" && kind !== "plan") w.rt[npcId]?.notable.push(text);
  return m;
}

const STOP = new Set(["the", "a", "an", "and", "to", "of", "in", "at", "is", "i", "my", "me", "for", "on", "with", "it", "he", "she", "they", "that", "this", "was", "be", "about", "from", "by", "not", "we", "you", "his", "her", "their", "as", "or", "but", "so", "are"]);

export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of text.toLowerCase().split(/[^a-z0-9_']+/)) if (t.length > 2 && !STOP.has(t)) out.add(t);
  return out;
}

/**
 * Retrieval = recency x importance x lexical overlap (no embeddings). Returns rendered lines,
 * most relevant first. The query is whatever the caller is about to think about.
 */
export function retrieve(w: World, npcId: string, query: string, limit = 15): string[] {
  const list = w.memories[npcId] ?? [];
  if (list.length === 0) return [];
  const q = tokens(query);
  const nowH = absHours(w.clock);
  const scored = list.map((m) => {
    const ageH = Math.max(0, nowH - ((m.day - 1) * 24 + m.hour));
    const recency = Math.pow(0.985, ageH);
    const imp = 0.3 + m.importance / 10;
    let overlap = 0;
    if (q.size) {
      const mt = tokens(m.text);
      for (const t of q) if (mt.has(t)) overlap++;
      overlap = overlap / Math.sqrt(q.size);
    }
    const kindBoost = m.kind === "reflection" ? 1.3 : 1;
    return { m, score: (recency * 0.6 + 0.4) * imp * (1 + overlap) * kindBoost };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ m }) => renderMemory(m));
}

export function renderMemory(m: Memory): string {
  const tag = m.kind === "reflection" ? "Reflection" : m.kind === "gossip" ? "Heard" : m.kind === "conversation" ? "Talked" : m.kind === "plan" ? "Planned" : "";
  return `Day ${m.day} ${String(m.hour).padStart(2, "0")}:00${tag ? ` (${tag})` : ""} — ${m.text}`;
}

export function recentMemories(w: World, npcId: string, n = 30): Memory[] {
  const list = w.memories[npcId] ?? [];
  return list.slice(-n).reverse();
}
