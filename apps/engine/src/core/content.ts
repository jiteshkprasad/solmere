import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  CastContent, TownContent, RelationshipsContent, EconomyContent, EventsContent,
  type CastContent as Cast, type TownContent as Town, type RelationshipsContent as Rels,
  type EconomyContent as Economy, type EventsContent as Events, type LocationContent, type NpcContent,
} from "@npcworld/schema";
import type { ArcsContent } from "./story.js";

export interface Content {
  town: Town;
  cast: Cast;
  economy: Economy;
  relationships: Rels;
  events: Events;
  /** story arcs for the director (content/arcs.json); optional */
  arcs: ArcsContent | null;
  /** derived lookups */
  locations: Record<string, LocationContent>;
  npcs: Record<string, NpcContent>;
  districtCenter: Record<string, [number, number]>;
}

const here = dirname(fileURLToPath(import.meta.url));
/** apps/engine/src/core -> repo root */
export const REPO_ROOT = resolve(here, "../../../..");
export const ENGINE_ROOT = resolve(here, "../..");

export function contentDir(): string {
  return process.env.CONTENT_DIR ?? resolve(REPO_ROOT, "content");
}

function readJson(dir: string, name: string): unknown {
  return JSON.parse(readFileSync(resolve(dir, name), "utf8"));
}

/** Loads and zod-validates every content file. Throws on invalid content. */
export function loadContent(dir = contentDir()): Content {
  const town = TownContent.parse(readJson(dir, "town.json"));
  const cast = CastContent.parse(readJson(dir, "cast.json"));
  const economy = EconomyContent.parse(readJson(dir, "economy.json"));
  const relationships = RelationshipsContent.parse(readJson(dir, "relationships.json"));
  const events = EventsContent.parse(readJson(dir, "events.json"));
  const arcs = existsSync(resolve(dir, "arcs.json")) ? (readJson(dir, "arcs.json") as ArcsContent) : null;
  const locations: Record<string, LocationContent> = {};
  for (const l of town.locations) locations[l.id] = l;
  const npcs: Record<string, NpcContent> = {};
  for (const n of cast.npcs) npcs[n.id] = n;
  const districtCenter: Record<string, [number, number]> = {};
  for (const d of town.districts) districtCenter[d.id] = d.center;
  return { town, cast, economy, relationships, events, arcs, locations, npcs, districtCenter };
}

/** Public cast: the `secret` field never leaves the engine. */
export function publicCast(cast: Cast) {
  return { ...cast, npcs: cast.npcs.map(({ secret: _secret, ...rest }) => rest) };
}
