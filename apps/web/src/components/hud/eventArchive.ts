/**
 * Client-side archive of every WorldEvent seen: the store keeps only the last 500,
 * but storylines reference event ids from any day. Pages GET /api/events once,
 * then stays current from the store.
 */
import type { WorldEvent } from "@npcworld/schema";
import { api } from "@/lib/engineClient";
import { useWorld } from "@/lib/store";

const byId = new Map<string, WorldEvent>();
let maxSeq = 0;
let loading: Promise<void> | null = null;
const progress = new Set<() => void>();
/** Called after every page lands so panels can fill in progressively. */
export function onArchiveProgress(l: () => void) { progress.add(l); return () => { progress.delete(l); }; }
const PAGE = 1000; // engine caps limit at 1000
const MAX_PAGES = 20;

export function archiveGet(id: string): WorldEvent | undefined { return byId.get(id) ?? useWorld.getState().events.find((e) => e.id === id); }

/** Absorb the store's current buffer (cheap; call whenever the store events change). */
export function archiveAbsorb(events: WorldEvent[]) { for (const e of events) { if (!byId.has(e.id)) byId.set(e.id, e); if (e.seq > maxSeq) maxSeq = e.seq; } }

/** Backfill everything before the store's buffer from the API. Idempotent; resolves when done. */
export function archiveBackfill(): Promise<void> {
  if (loading) return loading;
  const target = useWorld.getState().snapshot?.lastEventSeq ?? Infinity;
  const first = useWorld.getState().events[0]?.seq ?? Infinity;
  loading = (async () => {
    let since = 0, pages = 0;
    while (pages++ < MAX_PAGES && since < Math.min(target, first)) {
      let list: WorldEvent[];
      try { list = await api.events(since, PAGE); } catch { break; }
      if (list.length === 0) break;
      for (const e of list) if (!byId.has(e.id)) byId.set(e.id, e);
      since = list[list.length - 1].seq;
      for (const l of progress) l();
      if (list.length < PAGE) break;
    }
  })().finally(() => { loading = null; });
  return loading;
}
