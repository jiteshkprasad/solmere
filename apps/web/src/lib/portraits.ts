/**
 * Portrait store: head-and-shoulders images of every NPC.
 *
 * Fast path — a **build-time sprite atlas** (`/portraits/atlas.webp` +
 * `/portraits/index.json`, produced by `scripts/gen-portraits.mjs`). One image
 * request, then each tile is cut out of it lazily the first time a card asks
 * for that face. Nothing 3D happens at runtime.
 *
 * Fallback — if the atlas is missing (404) the old runtime path takes over:
 * `components/scene/characters/portraits.ts` renders one head per frame into a
 * render target and calls `setPortrait`.
 *
 * The HUD reads them through `usePortrait` / `getPortrait`; until a portrait
 * exists the Avatar falls back to initials.
 *
 * OWNED BY THE PERFORMANCE AGENT.
 */
"use client";
import { useSyncExternalStore } from "react";
import { mark } from "@/components/scene/perf/marks";

const portraits = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;
let complete = false;

/* ------------------------------- atlas state ------------------------------- */

export type PortraitSource = "pending" | "atlas" | "runtime";
interface AtlasIndex { version: number; size: number; cols: number; ids: string[] }

let source: PortraitSource = "pending";
let atlasImage: HTMLImageElement | null = null;
let atlasIndex: AtlasIndex | null = null;
const atlasSlot = new Map<string, number>();
let sliceCanvas: HTMLCanvasElement | null = null;

/** "pending" until we know whether the atlas exists; then "atlas" or "runtime" */
export const portraitSource = (): PortraitSource => source;
/** true while we still don't know — the runtime renderer must wait this out */
export const portraitsPending = (): boolean => source === "pending";

function bump() { version++; listeners.forEach((l) => l()); }

function fallbackToRuntime(reason: string) {
  if (source !== "pending") return;
  source = "runtime";
  if (process.env.NODE_ENV !== "production") console.info(`[portraits] no atlas (${reason}) — rendering at runtime`);
  bump();
}

async function loadAtlas() {
  if (typeof window === "undefined") return;
  // the atlas build script needs the runtime renderer, so let it opt out
  if (window.location.search.includes("portraits=render")) { fallbackToRuntime("forced"); return; }
  try {
    const r = await fetch("/portraits/index.json", { cache: "force-cache" });
    if (!r.ok) { fallbackToRuntime(`index ${r.status}`); return; }
    const idx = (await r.json()) as AtlasIndex;
    if (!idx?.ids?.length || !idx.size || !idx.cols) { fallbackToRuntime("bad index"); return; }
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("image")); img.src = "/portraits/atlas.webp"; });
    if (img.decode) await img.decode().catch(() => {});
    atlasImage = img; atlasIndex = idx;
    idx.ids.forEach((id, i) => atlasSlot.set(id, i));
    source = "atlas"; complete = true;
    mark("portraits");
    bump();
  } catch (e) {
    fallbackToRuntime(String(e));
  }
}
if (typeof window !== "undefined") void loadAtlas();

/** cut one tile out of the atlas (≈1 ms) and cache it */
function slice(id: string): string | null {
  const idx = atlasIndex, img = atlasImage;
  if (!idx || !img) return null;
  const slot = atlasSlot.get(id);
  if (slot === undefined) return null;
  const s = idx.size;
  const c = (sliceCanvas ??= document.createElement("canvas"));
  c.width = s; c.height = s;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, s, s);
  ctx.drawImage(img, (slot % idx.cols) * s, Math.floor(slot / idx.cols) * s, s, s, 0, 0, s, s);
  const url = c.toDataURL("image/webp", 0.92);
  portraits.set(id, url);
  return url;
}

/* --------------------------------- public --------------------------------- */

export function getPortrait(id: string): string | null {
  const hit = portraits.get(id);
  if (hit) return hit;
  if (source === "atlas") return slice(id);
  return null;
}
/** does a portrait exist *without* paying to decode it? (used by the runtime renderer) */
export function hasPortrait(id: string): boolean { return portraits.has(id) || atlasSlot.has(id); }
export function portraitCount(): number { return source === "atlas" && atlasIndex ? atlasIndex.ids.length : portraits.size; }
export function portraitsComplete(): boolean { return complete; }

/** called by the runtime renderer */
export function setPortrait(id: string, dataUrl: string) { portraits.set(id, dataUrl); bump(); }
export function markPortraitsComplete() { complete = true; mark("portraits"); bump(); }

/**
 * Subscribe to portrait updates. `cb` fires after every new portrait and once
 * more when the whole cast is done; if portraits already exist it fires immediately.
 */
export function onPortraitsReady(cb: () => void): () => void {
  listeners.add(cb);
  if (portraits.size || source === "atlas") cb();
  return () => { listeners.delete(cb); };
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getVersion = () => version;
const serverVersion = () => 0;
/** React hook: the portrait image for an NPC, or null (re-renders when it arrives). */
export function usePortrait(id: string): string | null {
  useSyncExternalStore(subscribe, getVersion, serverVersion);
  return getPortrait(id);
}

/** dev hook used by scripts/gen-portraits.mjs to harvest the runtime renders */
if (typeof window !== "undefined") {
  (window as unknown as { __portraitDump?: () => Record<string, string> }).__portraitDump = () => Object.fromEntries(portraits);
}
