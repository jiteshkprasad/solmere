"use client";
import ExploreControls from "./ExploreControls";
import TalkPanel from "@/components/comments/TalkPanel";
import PeoplePanel from "@/components/people/PeoplePanel";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useWorld, type Panel } from "@/lib/store";
import { useNarrow } from "@/lib/useNarrow";
import { setViewInset } from "@/lib/viewInset";
import TopBar from "./TopBar";
import LeftRail from "./LeftRail";
import DirectorBanner from "./DirectorBanner";
import NowStrip from "./NowStrip";
import Toasts from "./Toasts";
import NpcDrawer from "./NpcDrawer";
import FeedPanel from "./FeedPanel";
import PaperPanel from "./PaperPanel";
import EconomyPanel from "./EconomyPanel";
import PoliticsPanel from "./PoliticsPanel";
import SocietyPanel from "./SocietyPanel";
import ConfessionalsPanel from "./ConfessionalsPanel";
import StorylinesPanel from "./StorylinesPanel";
import AdminPanel from "./AdminPanel";
import { IS_REPLAY } from "@/lib/replay/mode";
import SeasonBar from "@/components/replay/SeasonBar";
import SeasonPanel from "@/components/replay/SeasonPanel";
import MomentBanner from "@/components/replay/MomentBanner";
import ReplayController from "@/components/replay/ReplayController";

const MOCK = process.env.NEXT_PUBLIC_MOCK_WORLD === "1";

function ActivePanel({ panel }: { panel: Panel }) {
  switch (panel) {
    case "feed": return <FeedPanel />;
    case "paper": return <PaperPanel />;
    case "economy": return <EconomyPanel />;
    case "politics": return <PoliticsPanel />;
    case "society": return <SocietyPanel />;
    case "confessionals": return <ConfessionalsPanel />;
    case "storylines": return <StorylinesPanel />;
    case "admin": return <AdminPanel />;
    case "season": return <SeasonPanel />;
    case "talk": return <TalkPanel />;
    case "people": return <PeoplePanel />;
    default: return null;
  }
}

/** Keep lib/viewInset in step with an element's box (ResizeObserver + window resize). */
function useInset(measure: () => void, deps: unknown[]) {
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(document.body);
    document.querySelectorAll("[data-inset]").forEach((el) => ro.observe(el));
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * HUD layout shell. The root is pointer-events-none (page.tsx wraps it so);
 * every interactive panel opts back in with pointer-events-auto.
 *
 * Desktop (≥ 768 px):
 *  ┌ TopBar ───────────────────────────────────────────┐
 *  │ rail │ panel │   scene (toasts ↗, banner ↙)  │ npc │
 *  └───────────────────────────────────────────────────┘
 * Phone (< 768 px): the town is full-screen. Compact top bar; at the bottom a
 * one-line "now happening" strip and a tab row. Panels and the NPC card open
 * as a bottom sheet (closed by default).
 *
 * Both layouts report what they cover to lib/viewInset, and the camera rig
 * shifts the projection centre so the director's subject stays in the visible
 * part of the town rather than behind the feed.
 */
export default function Hud() {
  const narrow = useNarrow();
  const panel = useWorld((s) => s.ui.panel);
  const selectedNpcId = useWorld((s) => s.ui.selectedNpcId);

  // store.selectNpc sets panel="npc"; keep showing the last real panel underneath the drawer.
  const lastPanel = useRef<Panel>("feed");
  if (panel !== "npc") lastPanel.current = panel;
  const shown: Panel = panel === "npc" ? lastPanel.current : panel;

  // phone: start with the town, not the feed (unless a deep link asked for a panel)
  const phoneInit = useRef(false);
  useEffect(() => {
    if (!narrow || phoneInit.current) return;
    phoneInit.current = true;
    if (new URLSearchParams(window.location.search).has("panel")) return;
    const st = useWorld.getState();
    if (st.ui.panel === "feed") st.setPanel(null);
  }, [narrow]);

  useEffect(() => {
    if (!MOCK) return;
    let stop: (() => void) | undefined;
    import("./DevMock").then((m) => { stop = m.installDevMock(); });
    return () => stop?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useWorld.getState().selectNpc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sheetOpen = narrow && (!!selectedNpcId || !!shown);

  useInset(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (narrow) {
      const top = topRef.current?.getBoundingClientRect().bottom ?? 0;
      const b = bottomRef.current?.getBoundingClientRect();
      setViewInset({ left: 0, right: 0, top, bottom: b ? Math.max(0, vh - b.top) : 0 });
    } else {
      const l = leftRef.current?.getBoundingClientRect();
      const r = rightRef.current?.getBoundingClientRect();
      setViewInset({ left: l ? l.right : 0, right: r ? Math.max(0, vw - r.left) : 0, top: 0, bottom: 0 });
    }
  }, [narrow, shown, selectedNpcId, sheetOpen]);
  useEffect(() => () => setViewInset({ left: 0, right: 0, top: 0, bottom: 0 }), []);

  if (narrow) {
    const closeSheet = () => {
      const st = useWorld.getState();
      if (st.ui.selectedNpcId) st.selectNpc(null);
      st.setPanel(null);
    };
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-1.5 p-1.5 text-[13px] text-slate-100">
        <div ref={topRef} className="flex flex-col gap-1.5">
          <TopBar compact />
          {IS_REPLAY && !sheetOpen && <MomentBanner compact />}
        </div>
        {IS_REPLAY && <ReplayController />}
        <div className="relative min-h-0 flex-1">
          {!sheetOpen && <div className="absolute right-0 bottom-0"><ExploreControls compact /></div>}
        </div>
        <div ref={bottomRef} data-inset className="safe-bottom flex min-h-0 flex-col gap-1.5" style={{ maxHeight: "70%" }}>
          {sheetOpen && (
            <div className="sheet-in pointer-events-auto flex min-h-0 flex-col gap-1" style={{ height: "56vh" }}>
              <button type="button" onClick={closeSheet} aria-label="Close panel and show the town"
                className="glass-strong mx-auto flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-slate-200">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
                Show the town
              </button>
              <div className="min-h-0 flex-1">
                {selectedNpcId ? <NpcDrawer id={selectedNpcId} /> : <ActivePanel panel={shown} />}
              </div>
            </div>
          )}
          {!sheetOpen && <NowStrip />}
          {IS_REPLAY && !sheetOpen && <SeasonBar compact />}
          <LeftRail active={selectedNpcId ? null : shown} horizontal />
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-2 text-[13px] text-slate-100">
      <TopBar />
      {IS_REPLAY && <ReplayController />}
      <div className="flex min-h-0 flex-1 gap-2">
        <div ref={leftRef} data-inset className="flex min-h-0 shrink-0 gap-2">
          <LeftRail active={shown} />
          {shown && (
            <div className="min-h-0 w-[300px] shrink-0 md:w-[320px] xl:w-[380px]">
              <ActivePanel panel={shown} />
            </div>
          )}
        </div>
        {/* scene space: toasts top-right, director banner bottom-left */}
        <div className="pointer-events-none relative min-w-0 flex-1 @container">
          <div className="absolute top-0 right-0 max-w-full"><Toasts /></div>
          <div className="absolute bottom-0 left-0 max-w-full"><DirectorBanner /></div>
          <div className="absolute right-0 bottom-0"><ExploreControls /></div>
          {IS_REPLAY && <div className="absolute top-0 left-1/2 w-[min(560px,100%)] -translate-x-1/2"><MomentBanner /></div>}
        </div>
        {selectedNpcId && (
          <div ref={rightRef} data-inset className="min-h-0 w-[300px] shrink-0 md:w-[340px] xl:w-[380px]">
            <NpcDrawer id={selectedNpcId} />
          </div>
        )}
      </div>
      {IS_REPLAY && <SeasonBar />}
    </div>
  );
}
