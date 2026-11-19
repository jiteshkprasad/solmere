"use client";
import { StreamFrame, type TownContent, type NpcContent, type Confessional, type Memory, type Newspaper, type NpcState, type RelationshipState, type WorldEvent } from "@npcworld/schema";
import { ENGINE_URL, useWorld } from "./store";
import { IS_REPLAY } from "./replay/mode";
import { replayApi, startReplay } from "./replay/player";

let es: EventSource | null = null;
const FRAME_KINDS = StreamFrame.options.map((o) => o.shape.kind.value);

/** Connect once (idempotent). Reconnects with backoff on error. */
export function connectEngine() {
  // replay mode: play the recorded season from static files, no engine and no EventSource
  if (IS_REPLAY) { startReplay(); return; }
  if (es) return;
  const open = (delay = 0) => {
    setTimeout(() => {
      es = new EventSource(`${ENGINE_URL}/api/stream`);
      es.onopen = () => useWorld.getState().setUi({ connected: true });
      const onFrame = (m: MessageEvent) => {
        try { useWorld.getState().applyFrame(StreamFrame.parse(JSON.parse(m.data))); } catch (e) { console.warn("bad frame", e); }
      };
      // The engine emits named events (event: snapshot|tick|events|...); EventSource only routes
      // unnamed ones to onmessage, so subscribe to every frame kind explicitly as well.
      es.onmessage = onFrame;
      for (const kind of FRAME_KINDS) es.addEventListener(kind, onFrame as EventListener);
      es.onerror = () => { useWorld.getState().setUi({ connected: false }); es?.close(); es = null; open(Math.min(delay * 2 + 500, 8000)); };
    }, delay);
  };
  open();
}

const j = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(`${ENGINE_URL}${path}`, init);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
};

const liveApi = {
  /** static content: the town map and the cast (secrets stripped) */
  content: () => j<{ town: TownContent; cast: NpcContent[] }>(`/api/content`),
  npc: (id: string) => j<{ state: NpcState; content: unknown; memories: Memory[]; relationships: RelationshipState[]; confessionals: Confessional[] }>(`/api/npcs/${id}`),
  paper: (day: number | "latest") => j<Newspaper>(`/api/paper/${day}`),
  confessionals: (day: number) => j<Confessional[]>(`/api/confessionals/${day}`),
  events: (since: number, limit = 200) => j<WorldEvent[]>(`/api/events?since=${since}&limit=${limit}`),
  llm: () => j<{ calls: number; costUsd: number; failures: number; byKind: Record<string, { calls: number; costUsd: number }> }>(`/api/llm`),
  admin: (path: "pause" | "resume" | "speed" | "inject" | "save", body?: unknown) =>
    j(`/api/admin/${path}`, { method: "POST", headers: { "content-type": "application/json", "x-admin-token": process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? "" }, body: body ? JSON.stringify(body) : undefined }),
};

/** The engine's HTTP API, or the static season files in replay mode (same shapes). */
export const api: typeof liveApi = IS_REPLAY ? (replayApi as unknown as typeof liveApi) : liveApi;
