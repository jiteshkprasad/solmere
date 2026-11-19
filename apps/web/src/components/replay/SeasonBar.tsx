"use client";
import { useMemo, useRef, useState } from "react";
import { useReplay, togglePlay, cycleSpeed, seek, jumpToMoment, nextBestBit } from "@/lib/replay/player";
import { bestOrder, kindColor, playableEnd, playableStart, momentWhen } from "@/lib/replay/moments";
import { fmtSim } from "@/lib/replay/mode";

/**
 * The season timeline: play/pause, speed (1×/4×/16×), a scrubber over all 30 days
 * with the best moments marked, and "Jump to the best bit". Phone first: one row
 * at 375 px; on desktop it spans the bottom of the HUD.
 */
export default function SeasonBar({ compact = false }: { compact?: boolean }) {
  const man = useReplay((s) => s.manifest);
  const s = useReplay((s) => s.s);
  const playing = useReplay((s) => s.playing);
  const speed = useReplay((s) => s.speed);
  const night = useReplay((s) => s.night);
  const loading = useReplay((s) => s.loading);
  const ended = useReplay((s) => s.ended);
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const range = useMemo(() => (man ? { a: playableStart(man), b: playableEnd(man) } : null), [man]);
  const marks = useMemo(() => (man ? bestOrder(man).map((i) => ({ i, m: man.moments[i] })) : []), [man]);
  const dayLines = useMemo(() => (man ? Object.entries(man.dayStarts).map(([d, st]) => ({ d: Number(d), st })).filter((x) => range && x.st > range.a && x.st < range.b) : []), [man, range]);

  if (!man || !range) {
    return <div className="glass-strong pointer-events-auto flex h-11 items-center rounded-xl px-3 text-[11px] text-slate-400">Loading the season…</div>;
  }
  const frac = (v: number) => Math.min(1, Math.max(0, (v - range.a) / (range.b - range.a)));
  const shown = drag ?? s;

  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return range.a + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (range.b - range.a);
  };
  /** a release within 7 px of a marked moment jumps to that moment rather than a bare minute */
  const nearMark = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    let best: { i: number; d: number } | null = null;
    for (const { i, m } of marks) {
      const d = Math.abs(r.left + frac(m.s) * r.width - clientX);
      if (d < 7 && (!best || d < best.d)) best = { i, d };
    }
    return best?.i ?? null;
  };

  return (
    <div className="glass-strong pointer-events-auto flex w-full min-w-0 items-center gap-1.5 rounded-xl py-1 pr-1.5 pl-1 sm:gap-2" role="group" aria-label="Season timeline">
      <button type="button" onClick={() => (ended ? void seek(range.a).then(() => togglePlay()) : togglePlay())} aria-label={playing ? "Pause" : "Play"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/15">
        {playing
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z" /></svg>}
      </button>
      <button type="button" onClick={cycleSpeed} aria-label={`Speed ${speed}×, tap to change`} title="Playback speed"
        className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--hud-border)] font-mono text-[11.5px] text-slate-100 hover:bg-white/10">
        {speed}×
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 font-mono text-[10.5px] leading-none text-slate-300">
          <span className="truncate">
            {fmtSim(shown)}
            {night && !drag && <span className="text-slate-500"> · night ⏩</span>}
            {loading && <span className="text-slate-500"> · loading</span>}
          </span>
          {!compact && <span className="shrink-0 text-slate-500">{man.title}</span>}
        </div>
        <div ref={track} className="relative mt-1 h-5 cursor-pointer touch-none select-none"
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag(at(e.clientX)); }}
          onPointerMove={(e) => { if (drag !== null) setDrag(at(e.clientX)); }}
          onPointerUp={(e) => {
            if (drag === null) return;
            const mi = nearMark(e.clientX);
            setDrag(null);
            if (mi !== null) void jumpToMoment(mi); else void seek(at(e.clientX));
          }}
          onPointerCancel={() => setDrag(null)}>
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
          <div className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full" style={{ width: `${frac(shown) * 100}%`, background: "linear-gradient(90deg,#38bdf8,#a78bfa)" }} />
          {dayLines.map(({ d, st }) => (
            <span key={d} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/15" style={{ left: `${frac(st) * 100}%` }} />
          ))}
          {marks.map(({ i, m }) => (
            <span key={i} title={`${momentWhen(m)} — ${m.title}`} className="absolute top-1/2 rounded-full"
              style={{ left: `${frac(m.s) * 100}%`, width: m.kind === "election" ? 8 : 5, height: m.kind === "election" ? 8 : 5, transform: "translate(-50%,-50%)", background: kindColor(m.kind), boxShadow: "0 0 0 1px rgba(3,7,18,.7)" }} />
          ))}
          <span className="absolute top-1/2 h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--hud-live)]" style={{ left: `${frac(shown) * 100}%`, transform: "translate(-50%,-50%)" }} />
        </div>
      </div>

      <button type="button" onClick={nextBestBit} title="Jump to the best bit (cycles through the season's top moments)"
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-white hover:brightness-110"
        style={{ background: "var(--hud-live)", boxShadow: "0 4px 14px rgba(255,59,92,0.3)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z" /></svg>
        {compact ? "Best bit" : "Jump to the best bit"}
      </button>
    </div>
  );
}
