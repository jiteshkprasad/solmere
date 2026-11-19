/**
 * Build-time (server) access to the exported season files in public/season/<s>/.
 * Used by the static Herald and moment pages; returns empty data when the season
 * has not been exported (e.g. a live-mode checkout), so those routes just 404.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Newspaper } from "@npcworld/schema";
import type { Manifest } from "./types";

const SEASON = process.env.NEXT_PUBLIC_REPLAY || "s1";
const dir = () => join(process.cwd(), "public", "season", SEASON);

function read<T>(file: string): T | null {
  try { return JSON.parse(readFileSync(join(dir(), file), "utf8")) as T; } catch { return null; }
}

let man: Manifest | null | undefined;
let pap: Newspaper[] | null | undefined;
export const seasonManifest = (): Manifest | null => (man === undefined ? (man = read<Manifest>("manifest.json")) : man);
export const seasonPapers = (): Newspaper[] => (pap === undefined ? (pap = read<Newspaper[]>("papers.json")) : pap) ?? [];

/** Absolute site origin for OG tags in the static export (set REPLAY_SITE_URL when deploying). */
export const SITE_URL = (process.env.REPLAY_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
