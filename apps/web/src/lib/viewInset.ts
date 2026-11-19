/**
 * How much of the canvas the HUD covers, in CSS pixels, per edge.
 *
 * The HUD measures its panels (desktop rail + panel on the left, NPC drawer on
 * the right; phone top bar, bottom dock and bottom sheet) and writes here; the
 * camera rig reads it every frame and shifts the projection centre so the
 * director's subject sits in the middle of the part of the town you can
 * actually see, instead of behind a panel.
 *
 * Lives on globalThis for the same reason as perf/marks.ts: Next can hand the
 * same "use client" module to two chunks (the page and the lazily imported
 * scene), and two copies would never see each other's writes.
 */
export interface ViewInset { left: number; right: number; top: number; bottom: number }

const KEY = "__solmereViewInset";
type G = typeof globalThis & { [KEY]?: ViewInset };

export function viewInset(): ViewInset {
  const g = globalThis as G;
  if (!g[KEY]) g[KEY] = { left: 0, right: 0, top: 0, bottom: 0 };
  return g[KEY]!;
}

export function setViewInset(patch: Partial<ViewInset>) {
  Object.assign(viewInset(), patch);
}
