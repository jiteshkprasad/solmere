"use client";
import { useEffect, useState } from "react";
import { useReplay, dismissActive, nextBestBit } from "@/lib/replay/player";
import { KIND_LABEL, kindColor } from "@/lib/replay/moments";
import { useWorld } from "@/lib/store";
import { Avatar } from "@/components/hud/Avatar";
import { shareMoment } from "./share";

/**
 * The card for the moment the viewer just jumped to: what happened, who, when,
 * plus share and "next best bit". Fades after ~30 s of wall time.
 */
export default function MomentBanner({ compact = false }: { compact?: boolean }) {
  const active = useReplay((s) => s.active);
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  useEffect(() => { setStatus(null); }, [active]);

  if (!active || now > active.untilWall) return null;
  const color = kindColor(active.kind);
  const onShare = async () => {
    if (active.momentIdx === null) return;
    const r = await shareMoment(active.momentIdx, active.title, active.text);
    setStatus(r === "copied" ? "Link copied" : r === "shared" ? "Shared" : "Couldn't copy");
  };

  return (
    <div className="banner-in glass-strong pointer-events-auto w-full max-w-[560px] overflow-hidden rounded-xl" style={{ borderColor: `${color}66` }}>
      <div className="flex items-start gap-2.5 px-3 py-2">
        <div className="mt-0.5 flex shrink-0 -space-x-1.5">
          {active.actors.slice(0, compact ? 2 : 3).map((id) => (
            <Avatar key={id} id={id} size={compact ? 26 : 30} onClick={() => useWorld.getState().selectNpc(id)} />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded px-1.5 py-px text-[9px] font-bold tracking-[0.14em] text-white uppercase" style={{ background: color }}>{KIND_LABEL[active.kind] ?? active.kind}</span>
            <span className="truncate font-mono text-[10.5px] text-slate-400">{active.when}</span>
          </div>
          <div className="mt-0.5 text-[13.5px] leading-tight font-semibold text-white" style={{ fontFamily: "var(--font-serif)" }}>{active.title}</div>
          <p className={`mt-0.5 text-[12px] leading-snug text-slate-300 ${compact ? "line-clamp-2" : "line-clamp-3"}`}>{active.text}</p>
        </div>
        <button type="button" onClick={dismissActive} aria-label="Close" className="-mt-0.5 -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-white">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="flex items-center gap-1.5 border-t border-[var(--hud-border)] px-3 py-1.5">
        {active.momentIdx !== null && (
          <button type="button" onClick={onShare} className="hud-btn !py-0.5 !text-[11px]">
            {status ?? "Share this moment"}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={nextBestBit} className="hud-btn !py-0.5 !text-[11px]">Next best bit →</button>
      </div>
    </div>
  );
}
