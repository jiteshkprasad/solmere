/**
 * Shared client state. OWNED BY THIS FILE — both the 3D scene (components/scene)
 * and the HUD (components/hud) read from here; only engineClient.ts writes the
 * world data, and UI writes only the `ui` slice via the actions below.
 */
"use client";
import { track } from "./analytics";
import { create } from "zustand";
import { publishPositions } from "./posBus";
import type {
  WorldSnapshot, SimTime, NpcState, WorldEvent, Conversation, Metrics, ElectionState,
  Newspaper, Confessional, Storyline, BusinessState, StreamFrame,
} from "@npcworld/schema";

export type CameraMode = "overview" | "follow" | "director";
export type Panel = "feed" | "npc" | "paper" | "economy" | "politics" | "society" | "confessionals" | "storylines" | "admin" | "season" | "talk" | "people" | null;

export interface UiState {
  cameraMode: CameraMode;
  selectedNpcId: string | null;      // NPC card target
  followNpcId: string | null;        // follow-cam target (director sets this too)
  directorFocus: { npcIds: string[]; locationId: string | null; reason: string } | null;
  panel: Panel;
  showLabels: boolean;
  connected: boolean;
}

export interface WorldState {
  snapshot: WorldSnapshot | null;
  time: SimTime | null;
  npcs: Record<string, NpcState>;
  businesses: Record<string, BusinessState>;
  events: WorldEvent[];              // newest last, capped at 500
  conversations: Record<string, Conversation>; // active + recently finished
  metrics: Metrics | null;
  metricsHistory: Metrics[];
  election: ElectionState | null;
  papers: Record<number, Newspaper>;
  confessionals: Confessional[];     // newest last, capped at 200
  storylines: Storyline[];
  ui: UiState;
  // actions
  applyFrame: (f: StreamFrame) => void;
  setUi: (patch: Partial<UiState>) => void;
  selectNpc: (id: string | null) => void;
  follow: (id: string | null) => void;
  setCameraMode: (m: CameraMode) => void;
  setPanel: (p: Panel) => void;
}

const CAP_EVENTS = 500;
const CAP_CONF = 200;

export const useWorld = create<WorldState>((set, get) => ({
  snapshot: null, time: null, npcs: {}, businesses: {}, events: [], conversations: {}, metrics: null,
  metricsHistory: [], election: null, papers: {}, confessionals: [], storylines: [],
  ui: { cameraMode: "director", selectedNpcId: null, followNpcId: null, directorFocus: null, panel: "feed", showLabels: true, connected: false },

  applyFrame: (f) => {
    switch (f.kind) {
      case "snapshot": {
        const convs: Record<string, Conversation> = {};
        for (const c of f.snapshot.conversations) convs[c.id] = c;
        set({
          snapshot: f.snapshot, time: f.snapshot.time, npcs: f.snapshot.npcs, businesses: f.snapshot.businesses,
          conversations: convs, metrics: f.snapshot.metrics, metricsHistory: f.snapshot.metricsHistory,
          election: f.snapshot.election, storylines: f.snapshot.storylines,
          papers: f.snapshot.latestPaper ? { ...get().papers, [f.snapshot.latestPaper.day]: f.snapshot.latestPaper } : get().papers,
        });
        return;
      }
      case "tick": {
        const npcs = { ...get().npcs };
        for (const p of f.npcs) if (npcs[p.id]) npcs[p.id] = { ...npcs[p.id], ...p };
        set({ time: f.time, npcs });
        return;
      }
      case "events": {
        const events = [...get().events, ...f.events];
        set({ events: events.length > CAP_EVENTS ? events.slice(events.length - CAP_EVENTS) : events });
        return;
      }
      case "pos": publishPositions(f.ids, f.p); return;
      case "conversation": set({ conversations: { ...get().conversations, [f.conversation.id]: f.conversation } }); return;
      case "metrics": set({ metrics: f.metrics, metricsHistory: [...get().metricsHistory.filter((m) => m.day !== f.metrics.day), f.metrics] }); return;
      case "election": set({ election: f.election }); return;
      case "paper": set({ papers: { ...get().papers, [f.paper.day]: f.paper } }); return;
      case "confessional": { const c = [...get().confessionals, f.confessional]; set({ confessionals: c.length > CAP_CONF ? c.slice(c.length - CAP_CONF) : c }); return; }
      case "storylines": set({ storylines: f.storylines }); return;
      case "npc": set({ npcs: { ...get().npcs, [f.npc.id]: f.npc } }); return;
      case "business": set({ businesses: { ...get().businesses, [f.business.locationId]: f.business } }); return;
    }
  },
  setUi: (patch) => set({ ui: { ...get().ui, ...patch } }),
  selectNpc: (id) => set({ ui: { ...get().ui, selectedNpcId: id, panel: id ? "npc" : get().ui.panel } }),
  follow: (id) => { if (id) track("follow_person", { person: id }); set({ ui: { ...get().ui, followNpcId: id, cameraMode: id ? "follow" : "overview" } }); },
  setCameraMode: (m) => set({ ui: { ...get().ui, cameraMode: m, followNpcId: m === "follow" ? get().ui.followNpcId : null } }),
  setPanel: (p) => { if (p) track("open_panel", { panel: p }); set({ ui: { ...get().ui, panel: p } }); },
}));

export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:4000";
