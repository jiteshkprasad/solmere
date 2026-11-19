/**
 * `?stats=1` dev overlay — CPU frame time, draw calls, triangles, shader
 * programs, the active quality tier, and the startup milestone breakdown.
 *
 * fps is printed but is only meaningful on real hardware; in a software-GL
 * container read **frame time, draw calls and the milestones** instead.
 *
 * OWNED BY THE PERFORMANCE AGENT.
 */
"use client";
import { useEffect, useState } from "react";
import { frameStats, getQuality, setTier, TIER_NAME, type TierName } from "../env/perf";
import { getMarks, useBoot } from "./marks";

const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14 };
const dim = { color: "#7f8ea3" };

export default function Stats() {
  const boot = useBoot();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 400);
    return () => window.clearInterval(t);
  }, []);
  const q = getQuality();
  const m = getMarks();
  const ms = (k: string) => (m[k] === undefined ? "—" : `${m[k]} ms`);

  return (
    <div
      style={{
        position: "absolute", top: 8, left: 8, zIndex: 50, pointerEvents: "auto",
        font: "11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#dbe4f0", background: "rgba(8,12,24,.82)", border: "1px solid rgba(148,163,184,.22)",
        borderRadius: 8, padding: "8px 10px", minWidth: 232, backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ ...row, fontWeight: 700, letterSpacing: ".08em", marginBottom: 4 }}>
        <span>PERF</span><span style={dim}>{q.name} · {q.reason}</span>
      </div>
      <div style={row}><span style={dim}>frame p50 / p95</span><span>{frameStats.p50.toFixed(1)} / {frameStats.p95.toFixed(1)} ms</span></div>
      <div style={row}><span style={dim}>worst (3 s)</span><span>{frameStats.worst.toFixed(0)} ms</span></div>
      <div style={row}><span style={dim}>fps (p50)</span><span>{frameStats.fps.toFixed(1)}</span></div>
      <div style={row}><span style={dim}>draw calls</span><span>{frameStats.calls}</span></div>
      <div style={row}><span style={dim}>triangles</span><span>{(frameStats.triangles / 1000).toFixed(0)} k</span></div>
      <div style={row}><span style={dim}>programs</span><span>{frameStats.programs}</span></div>
      <div style={row}><span style={dim}>dpr · shadow</span><span>{q.dpr.toFixed(2)} · {q.shadowSize}/{q.shadowEvery}f</span></div>

      <div style={{ borderTop: "1px solid rgba(148,163,184,.18)", margin: "6px 0 4px" }} />
      <div style={{ ...row, ...dim, marginBottom: 2 }}><span>STARTUP</span><span>{Math.round(boot.progress * 100)}% · {boot.phase}</span></div>
      <div style={row}><span style={dim}>content</span><span>{ms("content")}</span></div>
      <div style={row}><span style={dim}>gl ready</span><span>{ms("gl")}</span></div>
      <div style={row}><span style={dim}>first frame</span><span>{ms("first-frame")}</span></div>
      <div style={row}><span style={dim}>town painted</span><span>{ms("town-painted")}</span></div>
      <div style={row}><span style={dim}>people</span><span>{boot.people.built}/{boot.people.total} · {ms("phase:polish")}</span></div>
      <div style={row}><span style={dim}>post compiled</span><span>{ms("post-ready")}</span></div>
      <div style={row}><span style={dim}>portraits</span><span>{ms("portraits")}</span></div>

      <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
        {TIER_NAME.map((t) => (
          <button
            key={t}
            onClick={() => setTier(t as TierName)}
            style={{
              flex: 1, padding: "3px 0", borderRadius: 5, cursor: "pointer",
              border: "1px solid rgba(148,163,184,.25)",
              background: q.name === t ? "rgba(96,165,250,.28)" : "transparent",
              color: q.name === t ? "#dbeafe" : "#93a3b8", font: "inherit",
            }}
          >{t}</button>
        ))}
      </div>
    </div>
  );
}
