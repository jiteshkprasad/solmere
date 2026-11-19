"use client";
import { useEffect, useState } from "react";
import { useWorld, type CameraMode } from "@/lib/store";
import SoundControl from "./SoundControl";
import { api } from "@/lib/engineClient";
import { TOWN_NAME, fmtClock, cx, speedMultiplier } from "./lib";
import { IS_REPLAY } from "@/lib/replay/mode";

function DayNightIcon({ hour }: { hour: number }) {
  const day = hour >= 6 && hour < 20;
  return day ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" fill="#fbbf24" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#93c5fd"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
  );
}

interface LlmMeter { calls: number; costUsd: number; failures: number; callsToday?: number; costTodayUsd?: number; degraded?: boolean }
const LLM_POLL_MS = 15_000;

/** Polls GET /api/llm; the snapshot's llm block is only a boot-time value. */
function useLlmMeter(): LlmMeter | null {
  const [m, setM] = useState<LlmMeter | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.llm().then((r) => {
      if (!alive) return;
      const x = r as LlmMeter & Record<string, unknown>;
      setM({
        calls: x.calls, costUsd: x.costUsd, failures: x.failures,
        callsToday: typeof x.callsToday === "number" ? x.callsToday : undefined,
        costTodayUsd: typeof x.costTodayUsd === "number" ? x.costTodayUsd : undefined,
        degraded: typeof x.degraded === "boolean" ? x.degraded : undefined,
      });
    }).catch(() => {});
    load();
    const t = setInterval(load, LLM_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return m;
}

const MODES: Array<{ id: CameraMode; label: string; short: string; icon: string }> = [
  { id: "director", label: "Director", short: "DIR", icon: "M4 8h16v11H4zM4 8l3-4h3l-3 4M10 8l3-4h3l-3 4M16 8l3-4" },
  { id: "follow", label: "Follow", short: "FL", icon: "M12 7.5m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M6 20c0-3.5 2.7-6 6-6s6 2.5 6 6" },
  { id: "overview", label: "Explore", short: "EXP", icon: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" },
];

/**
 * Switch camera mode. Follow with nobody to follow used to do nothing (the camera
 * stayed high above the town); now it picks the selected person, else the
 * director's subject, else someone awake.
 */
export function chooseCameraMode(m: CameraMode) {
  const st = useWorld.getState();
  if (m !== "follow") { st.setCameraMode(m); return; }
  const awake = Object.values(st.npcs).filter((n) => n.action !== "sleep");
  const id = st.ui.followNpcId ?? st.ui.selectedNpcId ?? st.ui.directorFocus?.npcIds[0]
    ?? (awake.length ? awake[Math.floor(Math.random() * awake.length)].id : null);
  if (id) st.follow(id); else st.setCameraMode("follow");
}

function ModeIcon({ d }: { d: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

/** Phone top bar: fits 375 px — live dot, town, compact clock, sound icon, three camera icons. */
function CompactTopBar() {
  const day = useWorld((s) => s.time?.day);
  const hour = useWorld((s) => s.time?.hour);
  const minute = useWorld((s) => s.time?.minute);
  const paused = useWorld((s) => s.time?.paused);
  const connected = useWorld((s) => s.ui.connected);
  const cameraMode = useWorld((s) => s.ui.cameraMode);
  const town = useWorld((s) => s.snapshot?.town) ?? TOWN_NAME;
  const live = connected && !paused;
  return (
    <header className="glass-strong pointer-events-auto flex h-11 w-full min-w-0 items-center gap-2 rounded-xl pr-1 pl-2.5">
      <span className="flex min-w-0 items-center gap-1.5" title={paused ? "paused" : connected ? "live" : "offline"}>
        <span className={cx("h-2 w-2 shrink-0 rounded-full", live && "live-dot")} style={{ background: live ? "var(--hud-live)" : "#64748b", boxShadow: live ? "0 0 8px var(--hud-live)" : "none" }} />
        <span className="truncate text-[14px] font-semibold tracking-wide text-white">{town}</span>
        {IS_REPLAY && <span className="shrink-0 rounded bg-[#a78bfa]/80 px-1 text-[9px] font-bold tracking-[0.12em] text-white">S1</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1 rounded-md bg-black/25 px-1.5 py-0.5 font-mono text-[11.5px] text-slate-100">
        <DayNightIcon hour={hour ?? 12} />
        <span className="text-slate-400">D{day ?? "–"}</span>
        <span>{hour !== undefined && minute !== undefined ? fmtClock(hour, minute) : "--:--"}</span>
      </span>
      <span className="flex-1" />
      <SoundControl compact />
      <div className="flex shrink-0 items-center rounded-lg border border-[var(--hud-border)] bg-black/25 p-0.5" role="group" aria-label="Camera">
        {MODES.map((m) => (
          <button key={m.id} type="button" onClick={() => chooseCameraMode(m.id)} title={m.label} aria-label={m.label} aria-pressed={cameraMode === m.id}
            className={cx("flex h-8 w-8 items-center justify-center rounded-md transition-colors", cameraMode === m.id ? "bg-white/15 text-white" : "text-slate-400")}>
            <ModeIcon d={m.icon} />
          </button>
        ))}
      </div>
    </header>
  );
}

export default function TopBar({ compact = false }: { compact?: boolean }) {
  return compact ? <CompactTopBar /> : <FullTopBar />;
}

function FullTopBar() {
  const day = useWorld((s) => s.time?.day);
  const hour = useWorld((s) => s.time?.hour);
  const minute = useWorld((s) => s.time?.minute);
  const paused = useWorld((s) => s.time?.paused);
  const sleeping = useWorld((s) => s.time?.sleeping);
  const speed = useWorld((s) => s.time?.speed);
  const connected = useWorld((s) => s.ui.connected);
  const cameraMode = useWorld((s) => s.ui.cameraMode);
  const activeWorldEvents = useWorld((s) => s.snapshot?.activeWorldEvents);
  const snapCalls = useWorld((s) => s.snapshot?.llm.callsToday);
  const snapCost = useWorld((s) => s.snapshot?.llm.costTodayUsd);
  const snapTotal = useWorld((s) => s.snapshot?.llm.costTotalUsd);
  const failRate = useWorld((s) => s.snapshot?.llm.failRate);
  const town = useWorld((s) => s.snapshot?.town) ?? TOWN_NAME;
  const llm = useLlmMeter();
  const callsToday = llm?.callsToday ?? snapCalls;
  const costToday = llm?.costTodayUsd ?? snapCost;
  const costTotal = llm?.costUsd ?? snapTotal;

  return (
    <header className="glass-strong pointer-events-auto flex h-11 items-center gap-3 rounded-xl px-3">
      {/* brand + live */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--hud-live)] px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-white">
          <span className={cx("h-1.5 w-1.5 rounded-full bg-white", connected && !paused && "live-dot")} />
          {IS_REPLAY ? "SEASON 1 REPLAY" : paused ? "PAUSED" : "LIVE"}
        </span>
        <span className="text-[14px] font-semibold tracking-wide text-white">{town}</span>
        <span className="hidden text-[11px] text-slate-400 md:inline">· 50 people, run by AI</span>
      </div>

      {/* clock */}
      <div className="flex items-center gap-2 rounded-md border border-[var(--hud-border)] bg-black/25 px-2 py-0.5 font-mono text-[12px] text-slate-100">
        <DayNightIcon hour={hour ?? 12} />
        <span>Day {day ?? "—"}</span>
        <span className="text-slate-500">·</span>
        <span>{hour !== undefined && minute !== undefined ? fmtClock(hour, minute) : "--:--"}</span>
        {sleeping && <span className="text-[10px] text-slate-400" title="Night is fast-forwarded">zz</span>}
        {speed !== undefined && !IS_REPLAY && <span className="text-[10px] text-slate-500" title={`${speed} sim minutes per real second`}>{speedMultiplier(speed)}×</span>}
      </div>

      {/* world events */}
      <div className="hud-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {activeWorldEvents && activeWorldEvents.length > 0 ? activeWorldEvents.map((w) => (
          <span key={w.cardId} className="hud-chip" style={{ borderColor: "rgba(25,158,112,0.5)", color: "#a7f3d0" }} title={`until day ${w.endsDay}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{w.title}
          </span>
        )) : <span className="hud-chip opacity-60">calm seas</span>}
      </div>

      {/* llm meter (not meaningful in a replay) */}
      <div className={cx("hidden items-center gap-1.5 text-[11px] text-slate-400", !IS_REPLAY && "sm:flex")} title={`LLM calls today / cost today · total $${(costTotal ?? 0).toFixed(2)}${llm ? ` · ${llm.calls} calls, ${llm.failures} failed` : ""}${failRate !== undefined ? ` · fail rate ${(failRate * 100).toFixed(0)}%` : ""}${llm?.degraded ? " · DEGRADED" : ""}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zM9 21h6" /></svg>
        <span className="font-mono text-slate-200">{callsToday ?? "—"}</span>
        <span className="text-slate-600">/</span>
        <span className="font-mono text-slate-200">${(costToday ?? 0).toFixed(2)}</span>
        {llm?.degraded && <span className="rounded bg-red-500/20 px-1 text-[9px] font-semibold text-red-300">degraded</span>}
      </div>

      {/* connection */}
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400" title={connected ? "connected to engine" : "not connected"}>
        <span className="h-2 w-2 rounded-full" style={{ background: connected ? "var(--hud-pos)" : "var(--hud-neg)", boxShadow: connected ? "0 0 6px var(--hud-pos)" : "none" }} />
        <span className="hidden lg:inline">{connected ? "online" : "offline"}</span>
      </span>

      {/* sound */}
      <SoundControl />

      {/* camera mode */}
      <div className="flex items-center rounded-md border border-[var(--hud-border)] bg-black/25 p-0.5">
        {MODES.map((m) => (
          <button key={m.id} type="button" onClick={() => chooseCameraMode(m.id)}
            className={cx("rounded px-2 py-0.5 text-[11px] font-medium transition-colors", cameraMode === m.id ? "bg-white/15 text-white" : "text-slate-400 hover:text-slate-200")}>
            <span className="hidden lg:inline">{m.label}</span><span className="lg:hidden">{m.short}</span>
          </button>
        ))}
      </div>
    </header>
  );
}
