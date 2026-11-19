"use client";
import { memo, useMemo, useState } from "react";
import type { Conversation, WorldEvent } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { Avatar } from "./Avatar";
import { PanelFrame, Flame, Empty } from "./ui";
import { fmtClock, eventMatches, type FeedFilter, EVENT_GROUP, EVENT_TINT, EVENT_ICON, cx, locationName, firstName } from "./lib";

const FILTERS: Array<{ id: FeedFilter; label: string }> = [
  { id: "all", label: "All" }, { id: "drama", label: "Drama ≥5" }, { id: "economy", label: "Economy" }, { id: "politics", label: "Politics" }, { id: "society", label: "Society" },
];
const MAX_ROWS = 200;

const Row = memo(function Row({ e, onSelect }: { e: WorldEvent; onSelect: (id: string) => void }) {
  const group = EVENT_GROUP[e.type];
  const hot = e.drama >= 7;
  return (
    <button type="button" onClick={() => e.actors[0] && onSelect(e.actors[0])}
      className={cx("hud-row-hover flex w-full items-start gap-2 px-3 py-1.5 text-left", hot && "bg-[var(--hud-live)]/[0.06]")}
      style={{ borderLeft: `2px solid ${hot ? "var(--hud-live)" : "transparent"}` }}>
      <span className="mt-0.5 w-[34px] shrink-0 font-mono text-[10px] text-slate-500">{fmtClock(e.hour, e.minute)}</span>
      <span className="mt-px flex shrink-0 items-center -space-x-1">
        {e.actors.slice(0, 3).map((a) => <Avatar key={a} id={a} size={18} ring={false} />)}
        {e.actors.length === 0 && (
          <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px]" style={{ background: `${EVENT_TINT[group]}33`, color: EVENT_TINT[group] }}>{EVENT_ICON[e.type] ?? "·"}</span>
        )}
      </span>
      <span className="min-w-0 flex-1 text-[12px] leading-snug text-slate-200">
        <span className="mr-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: EVENT_TINT[group] }}>{e.type.replace(/_/g, " ")}</span>
        {e.text}
        {e.locationId && <span className="text-slate-500"> · {locationName(e.locationId)}</span>}
      </span>
      <Flame drama={e.drama} className="mt-0.5" />
    </button>
  );
});

/** Currently-revealing conversation line, quieter style. */
function LiveLine({ c, onSelect }: { c: Conversation; onSelect: (id: string) => void }) {
  const line = c.lines[Math.min(c.cursor, c.lines.length - 1)];
  if (!line) return null;
  return (
    <div className="flex items-start gap-2 px-3 py-1.5" style={{ borderLeft: "2px solid rgba(255,59,92,0.5)" }}>
      <span className="mt-0.5 w-[34px] shrink-0 text-[9px] font-bold tracking-widest" style={{ color: "var(--hud-live)" }}>LIVE</span>
      <Avatar id={line.speaker} size={18} onClick={() => onSelect(line.speaker)} />
      <span className="min-w-0 flex-1 text-[12px] italic leading-snug text-slate-300">
        <span className="not-italic text-slate-400">{firstName(line.speaker)}: </span>“{line.text}”
        <span className="ml-1 text-[10px] not-italic text-slate-500">{c.cursor + 1}/{c.lines.length} · {locationName(c.locationId)}</span>
      </span>
      <Flame drama={c.drama} className="mt-0.5 opacity-70" />
    </div>
  );
}

export default function FeedPanel() {
  const events = useWorld((s) => s.events);
  const conversations = useWorld((s) => s.conversations);
  const selectNpc = useWorld((s) => s.selectNpc);
  const [filter, setFilter] = useState<FeedFilter>("all");

  const rows = useMemo(() => {
    const out: WorldEvent[] = [];
    for (let i = events.length - 1; i >= 0 && out.length < MAX_ROWS; i--) if (eventMatches(events[i], filter)) out.push(events[i]);
    return out;
  }, [events, filter]);
  const live = useMemo(() => Object.values(conversations).filter((c) => !c.done && c.lines.length > 0), [conversations]);

  return (
    <PanelFrame kicker="Live feed" title="What's happening" right={<span className="font-mono text-[10px] text-slate-500">{events.length} events</span>}>
      <div className="hud-scroll sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-[var(--hud-border)] bg-[rgba(10,15,30,0.85)] px-2 py-1.5 backdrop-blur">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)} data-active={filter === f.id ? "true" : undefined}
            className="hud-btn whitespace-nowrap px-2 py-0.5 text-[11px]">{f.label}</button>
        ))}
      </div>
      {live.length > 0 && (
        <div className="border-b border-[var(--hud-border)] bg-black/20 py-0.5">
          {live.map((c) => <LiveLine key={c.id} c={c} onSelect={selectNpc} />)}
        </div>
      )}
      {rows.length === 0 ? <Empty>No events yet — the town is waking up.</Empty> : (
        <div className="divide-y divide-white/[0.05] py-0.5">
          {rows.map((e) => <Row key={e.id} e={e} onSelect={selectNpc} />)}
        </div>
      )}
    </PanelFrame>
  );
}
