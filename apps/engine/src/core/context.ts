import type { BrainContext, NpcState } from "@npcworld/schema";
import type { World } from "./types.js";
import { retrieve } from "./memory.js";
import { edgesOf } from "./relationships.js";
import { isOpen } from "./economy.js";
import { toSimTime } from "./clock.js";
import { priceIndex } from "./metrics.js";
import { storyFor } from "./story.js";

/** "Name [id]" — brains get both the display name and the id they must use in outputs. */
export function tag(w: World, id: string): string {
  const n = w.npcs[id];
  return n ? `${n.name} [${id}]` : id;
}

export function presentAt(w: World, locationId: string, except?: string): NpcState[] {
  return Object.values(w.npcs).filter((n) => n.id !== except && n.locationId === locationId && !n.targetLocationId && n.action !== "sleep");
}

export function relationshipLines(w: World, id: string, limit = 14): string[] {
  return edgesOf(w, id)
    .filter((r) => r.affinity !== 0)
    .slice(0, limit)
    .map((r) => {
      const other = w.content.npcs[r.b];
      const sign = r.affinity > 0 ? "+" : "";
      const note = w.content.relationships.edges.find((e) => e.a === r.a && e.b === r.b)?.note;
      return `${tag(w, r.b)} (${other?.job.replace(/_/g, " ") ?? "?"}) — ${r.type}, ${sign}${r.affinity}${note ? `: ${note}` : ""}`;
    });
}

export function headlines(w: World): string[] {
  const p = w.papers[w.papers.length - 1];
  if (!p) return [];
  return [p.headline, ...p.stories.slice(0, 2).map((s) => s.headline)];
}

/** Build everything the brain is allowed to see about "me" right now. */
export function buildContext(w: World, npcId: string, trigger: string | null, query?: string): BrainContext {
  const state = w.npcs[npcId];
  const self = w.content.npcs[npcId];
  const rt = w.rt[npcId];
  const here = w.content.locations[state.locationId];
  const present = presentAt(w, state.locationId, npcId).map((n) => tag(w, n.id));
  const q = query ?? [trigger ?? "", state.plan[state.planStepIndex]?.intent ?? "", ...present].join(" ");
  return {
    self,
    state: { ...state, needs: { ...state.needs }, plan: state.plan.map((s) => ({ ...s })) },
    time: toSimTime(w),
    relationships: relationshipLines(w, npcId),
    memories: retrieve(w, npcId, q, 15),
    here: { locationId: state.locationId, locationName: here?.name ?? state.locationId, present, openNow: here ? isOpen(w, here.id) : false },
    world: {
      mayor: tag(w, w.election.mayor),
      daysToElection: Math.max(0, w.election.nextElectionDay - w.clock.day),
      headlines: headlines(w),
      prices: compactPrices(w),
      activeEvents: w.effects.map((e) => e.title).concat(w.festivalDay !== null && w.festivalDay >= w.clock.day ? [`Tide Festival on day ${w.festivalDay}`] : []),
    },
    lastReflection: rt.lastReflection,
    trigger,
    places: w.content.town.locations
      .filter((l) => l.type !== "home" || l.id === state.home)
      .map((l) => ({ id: l.id, name: l.hours && !(l.hours[0] === 0 && l.hours[1] === 24) ? `${l.name} (open ${l.hours[0]}–${l.hours[1]})` : l.name, type: l.type })),
    story: storyFor(w, npcId),
  };
}

/** Only the prices an NPC would actually know about day to day. */
function compactPrices(w: World): Record<string, number> {
  const all = priceIndex(w);
  const keep = ["bread", "fish", "meal", "beer", "coffee", "tea", "snack", "goods", "clothes", "haircut", "grain", "fruit", "rent"];
  const out: Record<string, number> = {};
  for (const k of keep) if (all[k] !== undefined) out[k] = Math.round(all[k] * 100) / 100;
  return out;
}
