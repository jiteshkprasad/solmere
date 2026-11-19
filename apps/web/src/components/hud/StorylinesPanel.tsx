"use client";
import { useEffect, useMemo, useState } from "react";
import type { Storyline, WorldEvent } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { PanelFrame, Empty, Pill, Bar, Flame } from "./ui";
import { Avatar } from "./Avatar";
import { firstName, fmtClock, cx } from "./lib";
import { archiveAbsorb, archiveBackfill, archiveGet, onArchiveProgress } from "./eventArchive";

const STATUS: Record<Storyline["status"], { color: string; label: string }> = {
  brewing: { color: "#94a3b8", label: "brewing" }, active: { color: "#3987e5", label: "active" }, climax: { color: "#ff3b5c", label: "climax" }, resolved: { color: "#199e70", label: "resolved" },
};
const ORDER: Storyline["status"][] = ["climax", "active", "brewing", "resolved"];

const MAX_CHIPS = 8;

function Card({ s, version, onSelect }: { s: Storyline; version: number; onSelect: (id: string) => void }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` bumps when the archive gains events
  const linked = useMemo(() => s.eventIds.map((id) => archiveGet(id)).filter((e): e is WorldEvent => !!e).slice(-5).reverse(), [s.eventIds, version]);
  const actors = s.actors.slice(0, MAX_CHIPS);
  const st = STATUS[s.status];
  const heatColor = s.heat >= 7 ? "var(--hud-live)" : s.heat >= 4 ? "var(--hud-drama)" : "var(--s1)";
  return (
    <article className={cx("rounded-xl border bg-white/[0.02] p-3", s.status === "resolved" && "opacity-70")} style={{ borderColor: s.status === "climax" ? "rgba(255,59,92,0.5)" : "var(--hud-border)" }}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-tight text-white">{s.title}</h3>
        <Pill color={st.color}>{st.label}</Pill>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="hud-kicker" style={{ fontSize: 9 }}>Heat</span>
        <Bar value={s.heat / 10} height={5} color={heatColor} className="flex-1" />
        <span className="font-mono text-[10px] text-slate-400">{s.heat.toFixed(0)}/10</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {actors.map((a) => (
          <button key={a} type="button" onClick={() => onSelect(a)} className="hud-chip hover:bg-white/10" style={{ color: "#e2e8f0" }}><Avatar id={a} size={14} ring={false} />{firstName(a)}</button>
        ))}
        {s.actors.length > MAX_CHIPS && <span className="hud-chip" title={s.actors.slice(MAX_CHIPS).map(firstName).join(", ")}>+{s.actors.length - MAX_CHIPS} more</span>}
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-slate-300">{s.summary}</p>
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500"><span>started day {s.startedDay}</span><span>updated day {s.updatedDay}</span></div>
      {linked.length > 0 && (
        <ol className="mt-2 space-y-1 border-t border-[var(--hud-border)] pt-2">
          {linked.map((e) => (
            <li key={e.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
              <span className="shrink-0 font-mono text-[10px] text-slate-500">D{e.day} {fmtClock(e.hour, e.minute)}</span>
              <span className="min-w-0 flex-1 text-slate-300">{e.text}</span>
              <Flame drama={e.drama} className="mt-0.5" />
            </li>
          ))}
        </ol>
      )}
      {linked.length === 0 && s.eventIds.length > 0 && <div className="mt-2 border-t border-[var(--hud-border)] pt-2 text-[10px] text-slate-500">{s.eventIds.length} linked events · loading history…</div>}
      {linked.length > 0 && s.eventIds.length > linked.length && <div className="mt-1 text-[10px] text-slate-500">{s.eventIds.length} linked events in total</div>}
    </article>
  );
}

export default function StorylinesPanel() {
  const storylines = useWorld((s) => s.storylines);
  const events = useWorld((s) => s.events);
  const selectNpc = useWorld((s) => s.selectNpc);
  const today = useWorld((s) => s.time?.day ?? 1);
  const hour = useWorld((s) => s.time?.hour ?? 0);
  const [version, setVersion] = useState(0);
  useEffect(() => { archiveAbsorb(events); setVersion((v) => v + 1); }, [events]);
  useEffect(() => {
    let alive = true;
    const off = onArchiveProgress(() => alive && setVersion((v) => v + 1));
    archiveBackfill().then(() => alive && setVersion((v) => v + 1));
    return () => { alive = false; off(); };
  }, []);
  const sorted = useMemo(() => [...storylines].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.heat - a.heat), [storylines]);
  const hot = storylines.filter((s) => s.status !== "resolved").length;

  return (
    <PanelFrame kicker="Running arcs" title="Storylines" right={<span className="font-mono text-[10px] text-slate-500">{hot} live · {storylines.length - hot} resolved</span>}>
      {sorted.length === 0 ? (
        <Empty>No storylines extracted yet.<br /><span className="text-slate-600">The story editor runs at midnight. It&rsquo;s day {today}, {String(hour).padStart(2, "0")}:00 — {today === 1 ? "first arcs land after tonight." : "check back after midnight."}</span></Empty>
      ) : (
        <div className="space-y-2.5 p-3">{sorted.map((s) => <Card key={s.id} s={s} version={version} onSelect={selectNpc} />)}</div>
      )}
    </PanelFrame>
  );
}
