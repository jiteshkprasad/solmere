"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { enable, disable, getSettings, setSettings, subscribeSettings, getStatus, subscribeStatus } from "@/lib/audio/engine";

/** Speaker button + mix popover. The first click is the user gesture that unlocks Web Audio. */
export default function SoundControl({ compact = false }: { compact?: boolean }) {
  const s = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const status = useSyncExternalStore(subscribeStatus, getStatus, getStatus);
  const [open, setOpen] = useState(false);
  const [hasAudio, setHasAudio] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/audio/manifest.json", { method: "HEAD" }).then((r) => setHasAudio(r.ok)).catch(() => setHasAudio(false));
  }, []);

  // If the viewer enabled sound previously, resume on their first interaction with the page.
  useEffect(() => {
    if (!s.enabled) return;
    const resume = () => { void enable(); };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => { window.removeEventListener("pointerdown", resume); window.removeEventListener("keydown", resume); };
  }, [s.enabled]);

  const on = s.enabled && status === "running";
  const toggle = async () => { if (on) await disable(); else await enable(); };

  const Slider = ({ label, k }: { label: string; k: "master" | "music" | "ambience" | "murmur" }) => (
    <label className="flex items-center gap-2 text-[11px] text-slate-300">
      <span className="w-16">{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={s[k]} onChange={(e) => setSettings({ [k]: Number(e.target.value) })} className="h-1 w-24 accent-[#ff3b5c]" />
    </label>
  );

  return (
    <div className="pointer-events-auto relative">
      <button
        onClick={() => { void toggle(); if (!on) setOpen(true); }}
        onContextMenu={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        title={hasAudio === false ? "No audio generated yet — run pnpm gen:audio" : on ? "Sound on (right-click for mix)" : "Turn sound on"}
        aria-label={on ? "Sound on" : "Turn sound on"}
        className={"flex items-center gap-1 rounded font-medium transition-colors " + (compact ? "h-8 w-8 justify-center text-[14px] " : "px-2 py-0.5 text-[11px] ") + (on ? "bg-white/15 text-white" : "text-slate-400 hover:text-slate-200")}>
        <span aria-hidden>{on ? "🔊" : "🔈"}</span>
        {!compact && <span>{on ? "Sound" : "Sound off"}</span>}
        {!compact && hasAudio === false &&<span className="ml-1 rounded bg-amber-500/20 px-1 text-[9px] text-amber-300">no assets</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-56 rounded-lg border border-white/10 bg-[#0f1424]/95 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>Mix</span>
            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300">✕</button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Slider label="Master" k="master" />
            <Slider label="Music" k="music" />
            <Slider label="Ambience" k="ambience" />
            <Slider label="Voices" k="murmur" />
          </div>
          <p className="mt-2 text-[10px] leading-snug text-slate-500">Music follows where the camera looks and the time of day; sounds are placed at their sources.</p>
        </div>
      )}
    </div>
  );
}
