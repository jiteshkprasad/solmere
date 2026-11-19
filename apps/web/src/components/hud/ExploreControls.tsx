/**
 * Explore pad: turn, tilt, zoom and "whole town" buttons, plus a one-time hint saying how to move
 * with fingers or a mouse. Shown in Explore (overview) mode; a single "Explore" button otherwise.
 */
"use client";
import { useEffect, useState } from "react";
import { useWorld } from "@/lib/store";
import { cameraApi } from "@/lib/cameraApi";

const HINT_KEY = "solmere.exploreHint";
const TURN = Math.PI / 6, TILT = 0.22;

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

function Btn({ label, d, onClick }: { label: string; d: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-white/10 active:bg-white/20">
      <Icon d={d} />
    </button>
  );
}

export default function ExploreControls({ compact = false }: { compact?: boolean }) {
  const mode = useWorld((s) => s.ui.cameraMode);
  const [hint, setHint] = useState(false);
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  useEffect(() => {
    if (mode !== "overview") return;
    let seen = false;
    try { seen = localStorage.getItem(HINT_KEY) === "1"; } catch { /* private mode */ }
    if (seen) return;
    setHint(true);
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* ignore */ }
    const t = window.setTimeout(() => setHint(false), 6500);
    return () => window.clearTimeout(t);
  }, [mode]);

  const api = cameraApi();
  if (mode !== "overview") {
    return (
      <button type="button" onClick={() => api.zoom?.(1)} title="Explore the town yourself"
        className="glass-strong pointer-events-auto flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-slate-100">
        <Icon d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" size={14} />
        Explore
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {hint && (
        <div className="glass-strong pointer-events-none max-w-[240px] rounded-xl px-3 py-2 text-[12px] leading-snug text-slate-100">
          {touch
            ? <>Drag to move. Pinch to zoom where your fingers are. Two fingers up or down to tilt, sideways to turn.</>
            : <>Drag to move. Scroll to zoom where you point. Right-drag or shift-drag to turn and tilt. Keys: WASD, Q/E.</>}
        </div>
      )}
      <div className="glass-strong pointer-events-auto flex flex-col items-center gap-0.5 rounded-xl p-1" role="group" aria-label="Explore camera">
        <Btn label="Zoom in" d="M12 5v14M5 12h14" onClick={() => api.zoom?.(0.6)} />
        <Btn label="Zoom out" d="M5 12h14" onClick={() => api.zoom?.(1 / 0.6)} />
        {!compact && <span className="my-0.5 h-px w-6 bg-white/10" />}
        <Btn label="Turn left" d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" onClick={() => api.rotate?.(-TURN)} />
        <Btn label="Turn right" d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" onClick={() => api.rotate?.(TURN)} />
        <Btn label="Look from higher" d="M6 15l6-6 6 6" onClick={() => api.tilt?.(-TILT)} />
        <Btn label="Look from lower" d="M6 9l6 6 6-6" onClick={() => api.tilt?.(TILT)} />
        <span className="my-0.5 h-px w-6 bg-white/10" />
        <Btn label="Whole town" d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" onClick={() => api.home?.()} />
      </div>
    </div>
  );
}
