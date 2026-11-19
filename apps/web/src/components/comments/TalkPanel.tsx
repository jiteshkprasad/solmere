/**
 * "Talk" panel (replay mode): comments on the day being watched, or on the moment just jumped to.
 * The day follows playback until the viewer picks another one.
 */
"use client";
import { useEffect, useState } from "react";
import { useReplay } from "@/lib/replay/player";
import { simClock } from "@/lib/replay/mode";
import { commentCounts } from "@/lib/comments";
import { PanelFrame } from "@/components/hud/ui";
import CommentsThread from "./CommentsThread";

export default function TalkPanel() {
  const s = useReplay((st) => st.s);
  const active = useReplay((st) => st.active);
  const man = useReplay((st) => st.manifest);
  const watching = Math.min(30, simClock(s).day);
  const [day, setDay] = useState<number | null>(null);
  const [onMoment, setOnMoment] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => { commentCounts().then(setCounts).catch(() => {}); }, []);
  // a new jump makes "this moment" the natural place to talk
  useEffect(() => { if (active?.momentIdx != null) setOnMoment(true); }, [active?.momentIdx]);

  const momentIdx = active?.momentIdx ?? null;
  const shownDay = day ?? watching;
  const target = onMoment && momentIdx != null ? `moment-${momentIdx}` : `day-${shownDay}`;
  const title = onMoment && momentIdx != null ? active!.title : `Day ${shownDay}`;
  const days = man ? Object.keys(man.dayStarts).map(Number).filter((d) => d >= 1 && d <= 30).sort((a, b) => a - b) : [];

  return (
    <PanelFrame kicker="Talk · the town has had its say, now yours" title={title} bodyClassName="p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px]">
        <label className="flex items-center gap-1.5 text-slate-300">
          <span>Day</span>
          <select value={shownDay} onChange={(e) => { setDay(Number(e.target.value)); setOnMoment(false); }}
            className="rounded-md border border-white/15 bg-black/40 px-1.5 py-1 text-slate-100">
            {days.map((d) => <option key={d} value={d}>{d}{counts[`day-${d}`] ? ` · ${counts[`day-${d}`]} 💬` : ""}{d === watching ? " (now)" : ""}</option>)}
          </select>
        </label>
        {day !== null && day !== watching && (
          <button type="button" onClick={() => { setDay(null); setOnMoment(false); }} className="rounded-md px-2 py-1 text-slate-300 underline">Follow playback</button>
        )}
        {momentIdx != null && (
          <button type="button" onClick={() => setOnMoment((v) => !v)} aria-pressed={onMoment}
            className={`rounded-md border px-2 py-1 ${onMoment ? "border-[#a78bfa] bg-[#a78bfa]/20 text-white" : "border-white/15 text-slate-300"}`}>
            This moment{counts[`moment-${momentIdx}`] ? ` · ${counts[`moment-${momentIdx}`]}` : ""}
          </button>
        )}
      </div>
      <CommentsThread key={target} target={target} />
    </PanelFrame>
  );
}
