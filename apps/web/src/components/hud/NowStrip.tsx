"use client";
import { useMemo } from "react";
import { useWorld } from "@/lib/store";
import { Avatar } from "./Avatar";
import { firstName, atLocation } from "./lib";

function joinNames(ids: string[]): string {
  const names = ids.map(firstName);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length > 2) return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  return `${names[0]} and ${names[1]}`;
}

/**
 * Phone: one line at the bottom that says what is happening right now
 * ("● Chen and Tunde, at the docks — prices again"). Tapping it closes any open
 * sheet and cuts the camera to that scene (director mode); while following
 * someone it opens their card instead.
 */
export default function NowStrip({ onTap }: { onTap?: () => void }) {
  const focus = useWorld((s) => s.ui.directorFocus);
  const mode = useWorld((s) => s.ui.cameraMode);
  const followId = useWorld((s) => s.ui.followNpcId);
  const followActivity = useWorld((s) => (s.ui.followNpcId ? s.npcs[s.ui.followNpcId]?.activity : undefined));
  const lastEvent = useWorld((s) => {
    for (let i = s.events.length - 1, n = 0; i >= 0 && n < 40; i--, n++) if (s.events[i].drama >= 6) return s.events[i];
    return undefined;
  });

  const view = useMemo(() => {
    if (mode === "follow" && followId) return { label: "FOLLOWING", ids: [followId], title: firstName(followId), sub: followActivity ?? "" };
    if (focus && focus.npcIds.length) {
      const where = atLocation(focus.locationId);
      return { label: "NOW", ids: focus.npcIds, title: `${joinNames(focus.npcIds)}${where ? `, ${where}` : ""}`, sub: focus.reason ?? "" };
    }
    if (lastEvent) return { label: "NOW", ids: lastEvent.actors, title: lastEvent.text, sub: "" };
    return null;
  }, [mode, followId, followActivity, focus, lastEvent]);

  if (!view) return null;

  const tap = () => {
    const st = useWorld.getState();
    onTap?.();
    if (mode === "follow" && followId) { st.selectNpc(followId); return; }
    st.setCameraMode("director");
  };

  return (
    <button type="button" onClick={tap}
      className="glass-strong pointer-events-auto flex w-full min-w-0 items-center gap-2 rounded-xl py-1.5 pr-3 pl-2 text-left"
      aria-label={`${view.label === "FOLLOWING" ? "Following" : "Now happening"}: ${view.title}${view.sub ? ` — ${view.sub}` : ""}`}>
      <span className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--hud-live)]/90 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.16em] text-white">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />{view.label}
      </span>
      <span className="flex shrink-0 items-center -space-x-1.5">
        {view.ids.slice(0, 2).map((id) => <Avatar key={id} id={id} size={24} ring={false} />)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] leading-tight">
        <span className="font-semibold text-white">{view.title}</span>
        {view.sub && <span className="text-slate-400"> — {view.sub}</span>}
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400"><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );
}
