"use client";
import { useWorld, type Panel } from "@/lib/store";
import { IS_REPLAY } from "@/lib/replay/mode";

const TABS: Array<{ id: Exclude<Panel, null | "npc" | "season" | "talk" | "people">; label: string; icon: string }> = [
  { id: "feed", label: "Feed", icon: "M4 6h16M4 12h16M4 18h10" },
  { id: "paper", label: "Paper", icon: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" },
  { id: "economy", label: "Economy", icon: "M4 19l5-7 4 4 7-10M3 21h18" },
  { id: "politics", label: "Politics", icon: "M4 21h16M6 21V10M18 21V10M3 10l9-6 9 6z" },
  { id: "society", label: "Society", icon: "M8 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M16 16m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M10 10l4 4M17 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0" },
  { id: "confessionals", label: "Confess", icon: "M4 5h16v11H9l-5 4z" },
  { id: "storylines", label: "Stories", icon: "M4 4h16M4 12h10M4 20h14M18 10l3 2-3 2" },
  { id: "admin", label: "Admin", icon: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8" },
];

const SEASON_TAB = { id: "season" as const, label: "Season", icon: "M4 5h16v14H4zM4 9h16M9 13l3 2-3 2z" };
const PEOPLE_TAB = { id: "people" as const, label: "People", icon: "M9 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 7m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M16 13.5c2.9.4 5 2.8 5 5.5" };
const TALK_TAB = { id: "talk" as const, label: "Talk", icon: "M4 5h16v11H10l-5 4v-4H4zM8 9h8M8 12h5" };
// replay mode has no engine to administer; the Season tab (timeline, story arcs, days) takes its place, first
const RAIL = IS_REPLAY ? [SEASON_TAB, PEOPLE_TAB, TALK_TAB, ...TABS.filter((t) => t.id !== "admin")] : [TABS[0], PEOPLE_TAB, ...TABS.slice(1)];

export default function LeftRail({ active, horizontal = false }: { active: Panel; horizontal?: boolean }) {
  const setPanel = useWorld((s) => s.setPanel);
  if (horizontal) {
    // phone: a bottom tab row; tapping a tab opens that panel as a bottom sheet, tapping it again closes it
    return (
      <nav className="glass-strong hud-scroll-x pointer-events-auto flex w-full items-stretch justify-between overflow-x-auto rounded-xl px-0.5" aria-label="Panels">
        {RAIL.map((t) => (
          <button key={t.id} type="button" title={t.label} aria-label={t.label} aria-pressed={active === t.id}
            data-active={active === t.id ? "true" : "false"}
            onClick={() => setPanel(active === t.id ? null : t.id)}
            className="hud-tab hud-tab-h flex min-w-[42px] flex-1 flex-col items-center gap-0.5 py-1.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
            <span className="text-[8.5px] font-medium tracking-wide">{t.label}</span>
          </button>
        ))}
      </nav>
    );
  }
  return (
    <nav className="glass-strong pointer-events-auto flex w-12 shrink-0 flex-col items-stretch rounded-xl py-1 lg:w-14">
      {RAIL.map((t) => (
        <button key={t.id} type="button" title={t.label} data-active={active === t.id ? "true" : "false"}
          onClick={() => setPanel(active === t.id ? null : t.id)}
          className="hud-tab flex flex-col items-center gap-0.5 py-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
          <span className="hidden text-[9px] font-medium tracking-wide lg:block">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
