/**
 * Server-side data access for the permalink pages and OG routes.
 * OWNED BY THE STORY/SHARE AGENT. Never imported from a client component:
 * it reads the filesystem and talks to the engine directly.
 *
 * Every call is best-effort — the engine is frequently down in a sandbox, so
 * each helper returns null/[] instead of throwing and the pages fall back to
 * the static `content/*.json` cast.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Confessional, Memory, Newspaper, NpcState, RelationshipState, Storyline, WorldEvent, WorldSnapshot } from "@npcworld/schema";
import type { AtlasIndex } from "./share";

const ENGINE_URL = process.env.ENGINE_URL ?? process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:4000";
const TIMEOUT_MS = 2500;
export const MOCK = process.env.NEXT_PUBLIC_MOCK_WORLD === "1";

/** GET from the engine; null on any failure (down, 404, timeout, bad JSON). */
export async function eng<T>(p: string, revalidate = 15): Promise<T | null> {
  try {
    const r = await fetch(`${ENGINE_URL}${p}`, { signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/* --------------------------------- atlas --------------------------------- */

let atlasCache: { idx: AtlasIndex | null } | null = null;
/** The portrait sprite index from /public, or null when the atlas hasn't been built. */
export async function atlasIndex(): Promise<AtlasIndex | null> {
  if (atlasCache) return atlasCache.idx;
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "portraits", "index.json"), "utf8");
    const idx = JSON.parse(raw) as AtlasIndex;
    atlasCache = { idx: idx?.ids?.length && idx.size && idx.cols ? idx : null };
  } catch {
    atlasCache = { idx: null };
  }
  return atlasCache.idx;
}

/** The atlas bitmap as a data URI (for `next/og`, which cannot fetch local files). */
export async function atlasDataUri(): Promise<string | null> {
  for (const [file, mime] of [["atlas.png", "image/png"], ["atlas.webp", "image/webp"]] as const) {
    try {
      const buf = await readFile(path.join(process.cwd(), "public", "portraits", file));
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch { /* try next */ }
  }
  return null;
}

/* ------------------------------- engine data ------------------------------ */

export interface NpcDossier {
  online: boolean;
  state: NpcState | null;
  memories: Memory[];
  relationships: RelationshipState[];
  confessionals: Confessional[];
}

export async function npcDossier(id: string): Promise<NpcDossier> {
  const r = await eng<{ state: NpcState; memories: Memory[]; relationships: RelationshipState[]; confessionals: Confessional[] }>(`/api/npcs/${encodeURIComponent(id)}`);
  if (r?.state) return { online: true, state: r.state, memories: r.memories ?? [], relationships: r.relationships ?? [], confessionals: r.confessionals ?? [] };
  if (MOCK) { const m = await import("./shareMock"); return m.mockDossier(id); }
  return { online: false, state: null, memories: [], relationships: [], confessionals: [] };
}

export async function storylines(): Promise<Storyline[]> {
  const r = await eng<Storyline[]>("/api/storylines");
  if (r?.length) return r;
  if (MOCK) { const m = await import("./shareMock"); return m.mockStorylines(); }
  return [];
}

export async function snapshot(): Promise<WorldSnapshot | null> {
  return eng<WorldSnapshot>("/api/state", 10);
}

/** Current sim day, from the engine if it is up. */
export async function currentDay(): Promise<number | null> {
  const h = await eng<{ ok: boolean; day: number }>("/healthz", 10);
  if (typeof h?.day === "number") return h.day;
  if (MOCK) { const m = await import("./shareMock"); return m.MOCK_DAY; }
  return null;
}

export async function paper(day: number | "latest"): Promise<Newspaper | null> {
  const p = await eng<Newspaper>(`/api/paper/${day}`, 60);
  if (p?.headline) return p;
  if (MOCK) { const m = await import("./shareMock"); return m.mockPaper(day === "latest" ? m.MOCK_DAY - 1 : day); }
  return null;
}

export async function confessionals(day: number): Promise<Confessional[]> {
  const c = await eng<Confessional[]>(`/api/confessionals/${day}`, 60);
  if (c?.length) return c;
  if (MOCK) { const m = await import("./shareMock"); return m.mockConfessionals(day); }
  return [];
}

const PAGE = 500;
/**
 * Every event on one sim day. The events API pages forward by seq, so we walk
 * from the start and stop as soon as we are past the day we want.
 */
export async function eventsOnDay(day: number, maxPages = 12): Promise<WorldEvent[]> {
  const out: WorldEvent[] = [];
  let since = 0;
  for (let i = 0; i < maxPages; i++) {
    const list = await eng<WorldEvent[]>(`/api/events?since=${since}&limit=${PAGE}`, 30);
    if (!list?.length) break;
    for (const e of list) if (e.day === day) out.push(e);
    const last = list[list.length - 1];
    since = last.seq;
    if (last.day > day || list.length < PAGE) break;
  }
  if (!out.length && MOCK) { const m = await import("./shareMock"); return m.mockEvents(day); }
  return out;
}

/* ------------------------------ share origin ------------------------------ */

/** Absolute origin for og:image URLs. */
export async function siteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
    if (host) return `${proto}://${host}`;
  } catch { /* outside a request scope */ }
  return "http://localhost:3000";
}

/** One NPC's face as a PNG data URI for `next/og` (satori cannot decode WebP). */
export async function ogPortrait(id: string): Promise<string | null> {
  if (!/^[a-z0-9_-]+$/i.test(id)) return null;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "og", "portraits", `${id}.png`));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
