"use client";
import { useEffect, useRef, useState } from "react";
import type { WorldEvent } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { AvatarStack } from "./Avatar";
import { Flame } from "./ui";
import { fmtClock, EVENT_GROUP, EVENT_TINT } from "./lib";
import { onToast, type HudToast } from "./toastBus";

const TOAST_MS = 6000;
const MIN_DRAMA = 7;

/** High-drama events (≥7) pop in the top-right for 6 s. */
export default function Toasts() {
  const events = useWorld((s) => s.events);
  const selectNpc = useWorld((s) => s.selectNpc);
  const lastSeq = useRef<number | null>(null);
  const [toasts, setToasts] = useState<WorldEvent[]>([]);
  const [uiToasts, setUiToasts] = useState<HudToast[]>([]);

  useEffect(() => onToast((t) => {
    setUiToasts((u) => [...u, t].slice(-3));
    setTimeout(() => setUiToasts((u) => u.filter((x) => x.id !== t.id)), t.ttlMs ?? TOAST_MS);
  }), []);

  useEffect(() => {
    if (events.length === 0) return;
    const maxSeq = events[events.length - 1].seq;
    if (lastSeq.current === null) { lastSeq.current = maxSeq; return; } // don't replay history on mount
    const fresh = events.filter((e) => e.seq > (lastSeq.current as number) && e.drama >= MIN_DRAMA);
    lastSeq.current = maxSeq;
    if (fresh.length === 0) return;
    setToasts((t) => [...t, ...fresh].slice(-4));
    for (const e of fresh) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== e.id)), TOAST_MS);
  }, [events]);

  if (toasts.length === 0 && uiToasts.length === 0) return null;
  return (
    <div className="pointer-events-none flex w-[340px] max-w-full flex-col gap-2">
      {uiToasts.map((t) => (
        <div key={t.id} className="glass-strong toast-in pointer-events-auto flex items-start gap-2.5 rounded-xl px-3 py-2" style={{ borderLeft: `3px solid ${t.color ?? "var(--hud-pos)"}` }}>
          <div className="min-w-0 flex-1">
            <div className="hud-kicker" style={{ color: t.color ?? "var(--hud-pos)" }}>{t.kicker}</div>
            <div className="text-[12px] leading-snug text-slate-100">{t.text}</div>
          </div>
        </div>
      ))}
      {toasts.map((e) => (
        <button key={e.id} type="button" onClick={() => e.actors[0] && selectNpc(e.actors[0])}
          className="glass-strong toast-in pointer-events-auto flex items-start gap-2.5 rounded-xl px-3 py-2 text-left"
          style={{ borderLeft: `3px solid ${EVENT_TINT[EVENT_GROUP[e.type]]}` }}>
          <Flame drama={e.drama} className="mt-1" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="hud-kicker" style={{ color: "var(--hud-live)" }}>Breaking</span>
              <span className="font-mono text-[10px] text-slate-500">D{e.day} {fmtClock(e.hour, e.minute)}</span>
            </div>
            <div className="text-[12px] leading-snug text-slate-100">{e.text}</div>
          </div>
          {e.actors.length > 0 && <AvatarStack ids={e.actors} size={22} />}
        </button>
      ))}
    </div>
  );
}
