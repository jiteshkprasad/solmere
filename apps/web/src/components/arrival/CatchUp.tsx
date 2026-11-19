/**
 * "Catch me up" — the last two or three sim-days of Solmere as a compact
 * timeline: the day's Herald headline, its highest-drama beats with faces, and
 * where every running storyline currently stands.
 *
 * The store only keeps the last 500 events, so this pages /api/events on open
 * and merges; with no engine it falls back to whatever the store has and, in
 * the worst case, to the seeded conflicts.
 *
 * `CatchUpButton` is a self-contained trigger the HUD can mount anywhere
 * (see apps/web/NOTES-arrival.md). OWNED BY THE STORY/SHARE AGENT.
 */
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Storyline, WorldEvent } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { api } from "@/lib/engineClient";
import { Avatar } from "@/components/hud/Avatar";
import { Flame } from "@/components/hud/ui";
import { arrivalStorylines, clip, cx, fmtClock, locationName, TOWN_NAME } from "@/lib/share";

const STATUS_COLOR: Record<Storyline["status"], string> = {
  brewing: "#94a3b8", active: "#3987e5", climax: "var(--hud-live)", resolved: "#199e70",
};

/** Store events + one backfill page, deduped, newest last. */
function useRecapEvents(days: number[]): { events: WorldEvent[]; loading: boolean } {
  const stored = useWorld((s) => s.events);
  const [extra, setExtra] = useState<WorldEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const oldestWanted = Math.min(...days);
    const haveOldest = stored.length ? stored[0].day : Infinity;
    if (haveOldest <= oldestWanted) { setLoading(false); return; }
    (async () => {
      try {
        const list = await api.events(0, 1000);
        if (alive) setExtra(list.filter((e) => e.day >= oldestWanted));
      } catch { /* engine down — store events only */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- days is a fresh array each render; its min is what matters
  }, [days.join(","), stored.length === 0]);

  const events = useMemo(() => {
    const byId = new Map<string, WorldEvent>();
    for (const e of extra) byId.set(e.id, e);
    for (const e of stored) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => a.seq - b.seq);
  }, [extra, stored]);
  return { events, loading };
}

function Beat({ e }: { e: WorldEvent }) {
  const selectNpc = useWorld((s) => s.selectNpc);
  const place = locationName(e.locationId);
  const where = place && !e.text.includes(place) ? place : "";
  return (
    <li className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hud-row-hover">
      <span className="mt-[3px] w-[34px] shrink-0 font-mono text-[10px] text-slate-500">{fmtClock(e.hour, e.minute)}</span>
      <span className="mt-px flex shrink-0 items-center -space-x-1.5">
        {e.actors.slice(0, 2).map((a) => <Avatar key={a} id={a} size={20} ring={false} onClick={() => selectNpc(a)} />)}
      </span>
      <span className="min-w-0 flex-1 text-[12px] leading-snug text-slate-200">
        {e.text}
        {where && <span className="text-slate-500"> · {where}</span>}
      </span>
      <Flame drama={e.drama} className="mt-1" />
    </li>
  );
}

export function CatchUpBody({ dayCount = 3, perDay = 6 }: { dayCount?: number; perDay?: number }) {
  const today = useWorld((s) => s.time?.day ?? 1);
  const papers = useWorld((s) => s.papers);
  const storylines = useWorld((s) => s.storylines);
  const selectNpc = useWorld((s) => s.selectNpc);

  const days = useMemo(() => {
    const out: number[] = [];
    for (let d = today; d > Math.max(0, today - dayCount); d--) out.push(d);
    return out;
  }, [today, dayCount]);

  const { events, loading } = useRecapEvents(days);
  const { items: arcs, live: liveArcs, seededIds } = arrivalStorylines(storylines, today, 6);

  const grouped = useMemo(() => {
    const all = days.map((day) => {
      const onDay = events.filter((e) => e.day === day);
      const top = [...onDay].sort((a, b) => b.drama - a.drama || b.seq - a.seq).slice(0, perDay);
      // read each day forwards, newest day first
      top.sort((a, b) => a.hour - b.hour || a.minute - b.minute || a.seq - b.seq);
      return { day, beats: top, total: onDay.length };
    });
    // a world three hours old has no "day 2"; don't print empty headers for days that never ran
    return all.some((g) => g.beats.length) ? all.filter((g) => g.beats.length) : all.slice(0, 1);
  }, [days, events, perDay]);

  const anyBeats = grouped.some((g) => g.beats.length > 0);

  return (
    <div className="space-y-4">
      <section>
        <div className="hud-kicker mb-1.5">Where the stories stand</div>
        <div className="flex flex-wrap gap-1.5">
          {arcs.map((s) => (
            <span key={s.id} className="hud-chip max-w-full" style={{ color: "#e2e8f0" }} title={s.summary}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: seededIds.has(s.id) ? "#94a3b8" : STATUS_COLOR[s.status] }} />
              <span className="truncate">{s.title}</span>
              <span className="shrink-0 font-mono text-[10px] text-slate-500">{seededIds.has(s.id) ? "fuse lit" : s.status}</span>
            </span>
          ))}
        </div>
        {!liveArcs && <p className="mt-1.5 text-[11px] text-slate-500">Twenty dramas were wound up before day one. These are the ones with the shortest fuses.</p>}
      </section>

      {grouped.map(({ day, beats, total }) => {
        const paper = papers[day];
        return (
          <section key={day}>
            <div className="sticky top-0 z-10 -mx-1 flex items-baseline gap-2 bg-[rgba(10,15,30,0.92)] px-1 py-1 backdrop-blur">
              <h4 className="text-[13px] font-semibold text-white">Day {day}</h4>
              {day === (days[0] ?? 0) && <span className="hud-chip" style={{ color: "var(--hud-live)", borderColor: "rgba(255,59,92,0.4)" }}>today</span>}
              {total > beats.length && <span className="font-mono text-[10px] text-slate-500">top {beats.length} of {total}</span>}
            </div>
            {paper?.headline && (
              <p className="mt-1 mb-1 border-l-2 border-[#efe9dc]/40 pl-2.5 text-[13px] leading-snug text-[#efe9dc]" style={{ fontFamily: "var(--font-serif)" }}>
                “{clip(paper.headline, 110)}”
                <span className="ml-1.5 font-sans text-[10px] uppercase tracking-widest text-slate-500">The Herald</span>
              </p>
            )}
            {beats.length ? (
              <ul className="mt-0.5 space-y-px">{beats.map((e) => <Beat key={e.id} e={e} />)}</ul>
            ) : (
              <p className="px-2 py-2 text-[12px] text-slate-500">{loading ? "Reading back through the day…" : "Nothing on the record for this day."}</p>
            )}
          </section>
        );
      })}

      {!anyBeats && !loading && (
        <section className="rounded-xl border border-[var(--hud-border)] bg-white/[0.02] p-3">
          <div className="hud-kicker mb-1.5">Nothing recorded yet</div>
          <p className="text-[12px] leading-relaxed text-slate-300">
            {TOWN_NAME} has only just opened its eyes. Here is what is already wound up and waiting:
          </p>
          <ul className="mt-2 space-y-1.5">
            {arcs.slice(0, 3).map((s) => (
              <li key={s.id} className="text-[12px] leading-snug text-slate-300">
                <span className="font-semibold text-white">{s.title}</span> — {clip(s.summary, 130)}
                <span className="ml-1 inline-flex items-center gap-1 align-middle">
                  {s.actors.slice(0, 3).map((a) => <Avatar key={a} id={a} size={16} ring={false} onClick={() => selectNpc(a)} />)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The recap as a centred modal. Controlled. */
export function CatchUpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "radial-gradient(120% 90% at 50% 40%, rgba(3,7,18,0.55), rgba(3,7,18,0.86))", backdropFilter: "blur(3px)" }}
      onClick={onClose}>
      <div className="glass-strong fade-in flex max-h-[86vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--hud-border)] px-4 py-3">
          <div>
            <div className="hud-kicker">Catch me up</div>
            <h3 className="text-[15px] font-semibold text-white">The last few days in {TOWN_NAME}</h3>
          </div>
          <button type="button" onClick={onClose} className="hud-btn shrink-0" aria-label="Close recap">Close ✕</button>
        </header>
        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <CatchUpBody />
        </div>
      </div>
    </div>
  );
}

/** Drop-in trigger for the HUD: a small button that owns its own overlay. */
export function CatchUpButton({ className, label = "Catch me up" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx("hud-btn pointer-events-auto", className)}>{label}</button>
      <CatchUpOverlay open={open} onClose={close} />
    </>
  );
}

export default CatchUpOverlay;
