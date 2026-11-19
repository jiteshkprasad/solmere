import type { EventType } from "@npcworld/schema";

/**
 * Server-side drama hint for engine-generated events. The viewer's auto-director ranks
 * live scenes by this number; conversation/world-event drama comes from the brain/deck instead.
 */
const DRAMA: Record<EventType, number> = {
  system: 0,
  arrival: 1,
  transaction: 1,
  wage: 1,
  wage_missed: 5,
  rent: 2,
  rent_missed: 5,
  eviction: 8,
  loan: 3,
  loan_default: 7,
  hired: 4,
  fired: 6,
  quit: 5,
  price_change: 3,
  conversation: 2,
  argument: 7,
  romance: 8,
  breakup: 8,
  friendship: 4,
  feud: 7,
  gossip: 4,
  policy_proposed: 5,
  policy_vote: 6,
  election_declared: 6,
  speech: 6,
  vote: 3,
  election_result: 9,
  world_event: 5,
  newspaper: 3,
  confessional: 3,
  reflection: 1,
  sick: 4,
  recovered: 2,
  festival: 6,
  crime: 8,
  windfall: 7,
  storyline: 4,
};

export function dramaFor(type: EventType, override?: number): number {
  if (override !== undefined) return clamp10(override);
  return DRAMA[type] ?? 2;
}

/** Memory importance derived from drama unless given explicitly. */
export function importanceFor(type: EventType, drama: number, override?: number): number {
  if (override !== undefined) return clamp10(override);
  if (type === "transaction" || type === "arrival") return 1;
  return clamp10(Math.max(2, Math.round(drama)));
}

export function clamp10(n: number): number {
  return Math.max(0, Math.min(10, Math.round(n)));
}
