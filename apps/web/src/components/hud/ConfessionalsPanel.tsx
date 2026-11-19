"use client";
import { useEffect, useMemo, useState } from "react";
import type { Confessional } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { api } from "@/lib/engineClient";
import { PanelFrame, Empty, IconBtn, Pill } from "./ui";
import { Avatar } from "./Avatar";
import { npcName, CAST_BY_ID, MOOD_LABEL, moodColor, CAST } from "./lib";

const fetched = new Map<number, Confessional[]>();

function Card({ c, onSelect }: { c: Confessional; onSelect: (id: string) => void }) {
  const cast = CAST_BY_ID[c.npcId];
  return (
    <article className="fade-in overflow-hidden rounded-xl border border-[var(--hud-border)] bg-black/30">
      <div className="relative flex items-center gap-3 px-3 pt-3 pb-2" style={{ background: `linear-gradient(90deg, ${moodColor(c.mood)}22, transparent 70%)` }}>
        <span className="absolute top-2 right-3 flex items-center gap-1 text-[9px] font-bold tracking-widest" style={{ color: "var(--hud-live)" }}><span className="h-1.5 w-1.5 rounded-full bg-[var(--hud-live)] live-dot" />REC</span>
        <Avatar id={c.npcId} mood={c.mood} size={44} onClick={() => onSelect(c.npcId)} />
        <div className="min-w-0">
          <button type="button" onClick={() => onSelect(c.npcId)} className="truncate text-left text-[13px] font-semibold text-white hover:underline">{npcName(c.npcId)}</button>
          <div className="truncate text-[10px] text-slate-400">{cast?.jobTitle}</div>
          <div className="mt-1 flex items-center gap-1.5"><span className="font-mono text-[10px] text-slate-500">Day {c.day}</span><Pill color={moodColor(c.mood)}>{MOOD_LABEL[c.mood] ?? c.mood}</Pill></div>
        </div>
      </div>
      <div className="px-3 pb-3">
        <div className="relative rounded-lg bg-white/[0.04] px-3 py-2">
          <div className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 bg-white/[0.04]" />
          <p className="text-[12.5px] leading-[1.55] text-slate-100" style={{ fontFamily: "var(--font-serif)" }}>“{c.text}”</p>
        </div>
      </div>
    </article>
  );
}

export default function ConfessionalsPanel() {
  const storeConf = useWorld((s) => s.confessionals);
  const today = useWorld((s) => s.time?.day ?? 1);
  const hour = useWorld((s) => s.time?.hour ?? 0);
  const selectNpc = useWorld((s) => s.selectNpc);
  const [day, setDay] = useState<number | null>(null); // null = all recent
  const [who, setWho] = useState<string>("");
  const [remote, setRemote] = useState<Confessional[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [backfill, setBackfill] = useState<Confessional[]>([]);

  // The snapshot carries no confessionals, so a viewer who connects mid-day sees none until bedtime.
  // Backfill the last two days from the API once per sim day.
  useEffect(() => {
    let alive = true;
    const days = [today, today - 1].filter((d) => d >= 1);
    Promise.all(days.map((d) => api.confessionals(d).then((r) => { fetched.set(d, r); return r; }).catch(() => [] as Confessional[])))
      .then((rs) => { if (alive) setBackfill(rs.flat()); });
    return () => { alive = false; };
  }, [today]);

  useEffect(() => {
    if (day === null) { setRemote(null); return; }
    const c = fetched.get(day);
    if (c) { setRemote(c); return; }
    let alive = true; setLoading(true);
    api.confessionals(day).then((r) => { fetched.set(day, r); if (alive) setRemote(r); }).catch(() => alive && setRemote([])).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [day]);

  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: Confessional[] = [];
    for (const c of [...storeConf].reverse().concat(backfill)) { const k = `${c.npcId}|${c.day}|${c.text.slice(0, 40)}`; if (!seen.has(k)) { seen.add(k); out.push(c); } }
    return out;
  }, [storeConf, backfill]);

  const list = useMemo(() => {
    let src: Confessional[] = day === null ? all : (all.some((c) => c.day === day) ? all.filter((c) => c.day === day) : (remote ?? []));
    if (who) src = src.filter((c) => c.npcId === who);
    return [...src].sort((a, b) => b.day - a.day);
  }, [all, remote, day, who]);

  const speakers = useMemo(() => { const ids = new Set(all.map((c) => c.npcId)); return CAST.filter((c) => ids.has(c.id)); }, [all]);

  return (
    <PanelFrame kicker="Confessional cam" title="In their own words"
      right={<>
        <IconBtn title="Previous day" onClick={() => setDay((day ?? today) - 1 >= 1 ? (day ?? today) - 1 : 1)}>←</IconBtn>
        <button type="button" onClick={() => setDay(null)} className="min-w-[52px] text-center font-mono text-[11px] text-slate-300 hover:text-white" title="Show recent">{day === null ? "recent" : `Day ${day}`}</button>
        <IconBtn title="Next day" onClick={() => day !== null && day < today && setDay(day + 1)}>→</IconBtn>
      </>}>
      <div className="sticky top-0 z-10 border-b border-[var(--hud-border)] bg-[rgba(10,15,30,0.85)] px-3 py-1.5 backdrop-blur">
        <select value={who} onChange={(e) => setWho(e.target.value)} className="hud-input">
          <option value="">Everyone{all.length ? ` (${all.length})` : ""}</option>
          {(speakers.length ? speakers : CAST).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {list.length === 0 ? (
        <Empty>
          {loading ? "Rolling tape…" : who ? `${npcName(who)} hasn't sat in the chair${day !== null ? ` on day ${day}` : ""}.` : day !== null && day < today ? `No confessionals recorded on day ${day}.`
            : <>Nobody has sat in the chair yet.<br /><span className="text-slate-600">Confessionals are recorded at bedtime (23:00). It&rsquo;s day {today}, {String(hour).padStart(2, "0")}:00 — {hour < 23 ? `${23 - hour}h to go.` : "rolling now."}</span></>}
        </Empty>
      ) : (
        <div className="space-y-2.5 p-3">{list.map((c, i) => <Card key={`${c.npcId}-${c.day}-${i}`} c={c} onSelect={selectNpc} />)}</div>
      )}
    </PanelFrame>
  );
}
