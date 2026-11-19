import type { EventType, StreamFrame, WorldEvent } from "@npcworld/schema";
import type { World } from "./types.js";
import { dramaFor, importanceFor } from "./director.js";
import { addMemory } from "./memory.js";
import { fmtClock } from "./clock.js";

export const EVENT_CAP = 25000;

export interface EmitOpts {
  actors?: string[];
  locationId?: string | null;
  importance?: number;
  drama?: number;
  data?: Record<string, unknown>;
  /** who stores this as a memory; default = actors */
  witnesses?: string[];
  /** memory kind for the witnesses */
  memoryKind?: "observation" | "event" | "gossip";
  /** don't print in the headless log (transactions etc.) */
  quiet?: boolean;
}

export function emit(w: World, type: EventType, text: string, opts: EmitOpts = {}): WorldEvent {
  const drama = dramaFor(type, opts.drama);
  const importance = importanceFor(type, drama, opts.importance);
  const ev: WorldEvent = {
    id: `e${(++w.lastEventSeq).toString(36)}`,
    seq: w.lastEventSeq,
    day: w.clock.day,
    hour: Math.floor(w.clock.dayMinutes / 60),
    minute: Math.floor(w.clock.dayMinutes % 60),
    type,
    actors: opts.actors ?? [],
    locationId: opts.locationId ?? null,
    text,
    importance,
    drama,
    data: opts.data,
  };
  w.events.push(ev);
  if (w.events.length > EVENT_CAP) w.events.splice(0, w.events.length - EVENT_CAP);
  w.unsavedEvents.push(ev);
  w.todayEvents.push(ev);
  w.eventsTotal += 1;
  const witnesses = opts.witnesses ?? ev.actors;
  if (importance >= 2) for (const id of witnesses) if (w.npcs[id]) addMemory(w, id, opts.memoryKind ?? "event", text, importance, ev.actors);
  if (!opts.quiet) w.log(`${fmtClock(w.clock)}  [${type}] ${text}`);
  pendingEvents.push(ev);
  return ev;
}

/** events batched per real second for SSE */
const pendingEvents: WorldEvent[] = [];

export function drainPendingEvents(): WorldEvent[] {
  return pendingEvents.splice(0, pendingEvents.length);
}

export function broadcast(w: World, frame: StreamFrame): void {
  if (!w.listeners.size) return;
  // serialise once for every listener, not once per listener
  const json = JSON.stringify(frame);
  for (const l of w.listeners) {
    try {
      l(frame, json);
    } catch (e) {
      console.error("[bus] listener failed", e);
    }
  }
}
