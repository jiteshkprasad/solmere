/**
 * A one-hop bus for high-rate position frames.
 *
 * The store must not import from components/scene (that would drag three.js into
 * the HUD and the permalink pages), and the scene must not miss a frame by polling
 * the store once per render. So the store publishes here and the NPC layer
 * subscribes. Nothing in this file imports anything.
 */
type PosHandler = (ids: string[], p: number[]) => void;

const handlers = new Set<PosHandler>();
/** wall-clock ms of the last position frame, so the scene can fall back to tick-derived positions */
export let lastPosFrameAt = 0;

export function publishPositions(ids: string[], p: number[]): void {
  lastPosFrameAt = Date.now();
  for (const h of handlers) {
    try { h(ids, p); } catch (e) { console.warn("[pos] handler failed", e); }
  }
}

export function onPositions(h: PosHandler): () => void {
  handlers.add(h);
  return () => { handlers.delete(h); };
}
