/**
 * Module-level holder for the static town + cast content (fetched once by
 * <Scene/>). Read by the town builder, labels and lib/director.ts.
 */
"use client";
import { useSyncExternalStore } from "react";
import type { TownContent, LocationContent, NpcContent } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { terrainHeight } from "./terrain";

export interface Content { town: TownContent; cast: NpcContent[] }

let content: Content | null = null;
const listeners = new Set<() => void>();
const locIndex = new Map<string, LocationContent>();
const castIndex = new Map<string, NpcContent>();
const districtIndex = new Map<string, { id: string; name: string; center: [number, number] }>();

export function setContent(c: Content) {
  content = c;
  locIndex.clear(); castIndex.clear(); districtIndex.clear();
  for (const l of c.town.locations) locIndex.set(l.id, l);
  for (const n of c.cast) castIndex.set(n.id, n);
  for (const d of c.town.districts) districtIndex.set(d.id, d);
  listeners.forEach((l) => l());
}
export const getContent = () => content;
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useContent(): Content | null { return useSyncExternalStore(subscribe, () => content, () => null); }

export const loc = (id: string | null | undefined) => (id ? locIndex.get(id) : undefined);
export const district = (id: string) => districtIndex.get(id);
export const npcInfo = (id: string) => castIndex.get(id);

export function locName(id: string | null | undefined): string {
  if (!id) return "somewhere";
  return locIndex.get(id)?.name ?? id.replace(/_/g, " ");
}

const TITLES = new Set(["dr", "dr.", "captain", "sister", "mr", "mrs", "ms"]);
/** "Dolores 'Dolly' Quinn" → "Dolly"; "Dr Samuel Achebe" → "Samuel"; unknown id → prettified id */
export function firstName(id: string): string {
  const full = castIndex.get(id)?.name ?? useWorld.getState().npcs[id]?.name;
  if (!full) return id.split("_")[0].replace(/^\w/, (c) => c.toUpperCase());
  const nick = full.match(/'([^']+)'/);
  if (nick) return nick[1];
  const parts = full.split(/\s+/).filter((p) => !TITLES.has(p.toLowerCase()));
  return parts[0] ?? full;
}
export function fullName(id: string): string {
  return castIndex.get(id)?.name ?? useWorld.getState().npcs[id]?.name ?? id;
}

/** world position of a location's centre (x, y, z) */
export function locWorld(id: string | null | undefined): [number, number, number] | null {
  const l = loc(id);
  if (!l) return null;
  return [l.pos[0], terrainHeight(l.pos[0], l.pos[1]), -l.pos[1]];
}

/** fractional sim hour, interpolated from the last tick's wall-clock */
export function simHour(): number {
  const t = useWorld.getState().time;
  if (!t) return 12;
  const extra = t.paused ? 0 : Math.min(((Date.now() - t.wallMs) / 1000) * t.speed, Math.max(2, t.speed * 2));
  const h = t.hour + (t.minute + extra) / 60;
  return ((h % 24) + 24) % 24;
}
