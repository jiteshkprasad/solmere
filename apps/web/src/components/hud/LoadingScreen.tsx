/**
 * First-load experience. OWNED BY THE PERFORMANCE AGENT.
 *
 * Mounted by app/page.tsx at z-30. A calm dark title card rather than a
 * spinner: the town's name, a status line that says what the scene is actually
 * doing right now, a determinate bar driven by the real milestones in
 * `scene/perf/marks.ts`, a quality picker, and — while you wait — the Herald's
 * latest headline to read.
 *
 * It fades out when the scene reports ready, and it can never hang: a hard
 * 20 s timeout forces the fade regardless of what the scene is doing.
 */
"use client";
import { useEffect, useRef, useState } from "react";
import type { Newspaper } from "@npcworld/schema";
import { api } from "@/lib/engineClient";
import { useWorld } from "@/lib/store";
import { useArrival } from "@/lib/arrivalState";
import { forceReady, useBoot } from "@/components/scene/perf/marks";
import { getQuality, setTier, TIER_NAME, type TierName } from "@/components/scene/env/perf";
import { IS_REPLAY } from "@/lib/replay/mode";

/** Replay: someone who has been here before skips the full title card (just the slim progress line). */
const returning = (): boolean => { try { return IS_REPLAY && localStorage.getItem("solmere.intro.seen.v1") === "1"; } catch { return false; } };

const HARD_TIMEOUT_MS = 20000;
const FADE_MS = 700;

export default function LoadingScreen() {
  const boot = useBoot();
  const arrivalShown = useArrival((s) => s.shown);
  const papers = useWorld((s) => s.papers);
  const [paper, setPaper] = useState<Newspaper | null>(null);
  const [gone, setGone] = useState(false);
  const [tier, setTierState] = useState<TierName>("med");
  const shownAt = useRef(0);
  const [slim, setSlim] = useState(false);
  useEffect(() => { if (returning()) setSlim(true); }, []); // after mount: localStorage is client-only

  // the Herald: ask the engine, fall back to whatever the stream already delivered
  useEffect(() => {
    let alive = true;
    api.paper("latest").then((p) => { if (alive) setPaper(p); }).catch(() => { /* offline / mock — the store fallback covers it */ });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (paper) return;
    const days = Object.keys(papers).map(Number).sort((a, b) => b - a);
    if (days.length) setPaper(papers[days[0]]);
  }, [papers, paper]);

  // ripcord — never block forever
  useEffect(() => {
    const t = window.setTimeout(() => forceReady("loading-screen"), HARD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, []);

  // keep the picker in step with the auto-detected tier
  useEffect(() => {
    const id = window.setInterval(() => setTierState(getQuality().name), 300);
    return () => window.clearInterval(id);
  }, []);

  // fade out once ready (with a short floor so it never flashes)
  useEffect(() => { if (!shownAt.current) shownAt.current = performance.now(); }, []);
  const ready = boot.ready;
  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, 450 - (performance.now() - shownAt.current));
    const t = window.setTimeout(() => setGone(true), wait + FADE_MS);
    return () => window.clearTimeout(t);
  }, [ready]);

  if (gone) return null;
  const pct = Math.round(boot.progress * 100);

  // While the arrival card is up (or once the viewer has dismissed it) the card is
  // the thing to read: the town builds visibly behind it, and loading is a slim
  // line plus a small status pill instead of a full-screen title card.
  if (arrivalShown || slim) {
    return (
      <div aria-busy={!ready} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: ready ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-in-out` }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: "rgba(148,163,184,.12)" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#38bdf8,#a78bfa,#ff3b5c)", transition: "width .45s cubic-bezier(.22,.9,.3,1)" }} />
        </div>
        <div style={{ position: "absolute", left: "50%", bottom: "max(14px, env(safe-area-inset-bottom))", transform: "translateX(-50%)", padding: "4px 11px", borderRadius: 999, background: "rgba(10,15,30,.78)", border: "1px solid rgba(148,163,184,.2)", color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {boot.status} · {pct}%
        </div>
      </div>
    );
  }

  return (
    <div
      aria-busy={!ready}
      style={{
        position: "absolute", inset: 0, pointerEvents: ready ? "none" : "auto",
        opacity: ready ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-in-out`,
        background: "radial-gradient(120% 90% at 50% 0%, #16223f 0%, #0b1020 55%, #070b16 100%)",
        color: "#e2e8f0", display: "grid", placeItems: "center",
        fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
      }}
    >
      {/* horizon line, a quiet nod to the sea the town sits on */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "26%", height: 1, background: "linear-gradient(90deg, transparent, rgba(148,163,184,.22) 25%, rgba(148,163,184,.22) 75%, transparent)" }} />

      <div style={{ width: "min(520px, 86vw)", textAlign: "center", transform: "translateY(-6%)" }}>
        <div style={{ fontSize: 11, letterSpacing: ".38em", color: "#64748b", textTransform: "uppercase" }}>a town that runs itself</div>
        <h1 style={{ margin: "10px 0 0", fontSize: "clamp(34px, 7vw, 56px)", fontWeight: 300, letterSpacing: ".24em", textIndent: ".24em", color: "#f1f5f9" }}>SOLMERE</h1>

        <div style={{ marginTop: 34 }}>
          <div style={{ height: 2, background: "rgba(148,163,184,.16)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#38bdf8,#a78bfa)", transition: "width .45s cubic-bezier(.22,.9,.3,1)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 12, color: "#94a3b8" }}>
            <span>{boot.status}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "#64748b" }}>{pct}%</span>
          </div>
        </div>

        {paper && (
          <div style={{ marginTop: 40, padding: "16px 18px", textAlign: "left", border: "1px solid rgba(148,163,184,.14)", borderRadius: 10, background: "rgba(15,23,42,.45)" }}>
            <div style={{ fontSize: 10, letterSpacing: ".22em", color: "#64748b", textTransform: "uppercase" }}>
              {paper.masthead} · day {paper.day}
            </div>
            <div style={{ marginTop: 7, fontFamily: "var(--font-serif, Georgia, serif)", fontSize: 17, lineHeight: 1.3, color: "#e8eef7" }}>{paper.headline}</div>
            {paper.stories?.[0] && (
              <p style={{ margin: "8px 0 0", fontFamily: "var(--font-serif, Georgia, serif)", fontSize: 13, lineHeight: 1.55, color: "#94a3b8" }}>
                {clip(paper.stories[0].body, 210)}
              </p>
            )}
          </div>
        )}

        <div style={{ marginTop: 30, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 11, color: "#64748b" }}>
          <span style={{ letterSpacing: ".14em", textTransform: "uppercase" }}>quality</span>
          {TIER_NAME.map((t) => (
            <button
              key={t}
              onClick={() => { setTier(t); setTierState(t); }}
              style={{
                padding: "3px 11px", borderRadius: 999, cursor: "pointer", font: "inherit", letterSpacing: ".04em",
                border: `1px solid ${tier === t ? "rgba(56,189,248,.55)" : "rgba(148,163,184,.2)"}`,
                background: tier === t ? "rgba(56,189,248,.14)" : "transparent",
                color: tier === t ? "#bae6fd" : "#94a3b8",
              }}
            >{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function clip(s: string, n: number) { return s.length <= n ? s : `${s.slice(0, s.lastIndexOf(" ", n))}…`; }
