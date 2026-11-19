"use client";
import { useState } from "react";
import { useReplay, jumpToMoment, seek, focusMoment, play } from "@/lib/replay/player";
import { bestOrder, kindColor, KIND_LABEL, momentWhen, stageMoment, jumpTarget } from "@/lib/replay/moments";
import { simClock } from "@/lib/replay/mode";
import { isNarrow } from "@/lib/useNarrow";
import { useWorld } from "@/lib/store";
import { PanelFrame, Empty } from "@/components/hud/ui";
import { AvatarStack } from "@/components/hud/Avatar";

type Tab = "arcs" | "best" | "days";

/** On a phone, close the sheet after a jump so the town is visible. */
const afterJump = () => { if (isNarrow()) useWorld.getState().setPanel(null); };

/**
 * The season at a glance: story arcs (tap a stage to jump), the best moments, and
 * every day with its Herald. Lives in the rail as "Season" in replay mode.
 */
export default function SeasonPanel() {
  const man = useReplay((s) => s.manifest);
  const s = useReplay((s) => s.s);
  const [tab, setTab] = useState<Tab>("arcs");
  if (!man) return <PanelFrame kicker="Replay" title="Season"><Empty>Loading the season…</Empty></PanelFrame>;
  const today = simClock(s).day;
  const days = Object.keys(man.dayStarts).map(Number).filter((d) => d <= 30).sort((a, b) => a - b);
  const paperDays = new Set(man.papers.map((p) => p.day));

  return (
    <PanelFrame kicker="Replay · 30 days" title={man.title}
      right={<div className="flex rounded-md border border-[var(--hud-border)] bg-black/25 p-0.5 text-[11px]">
        {(["arcs", "best", "days"] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
            className={`rounded px-2 py-0.5 ${tab === t ? "bg-white/15 text-white" : "text-slate-400"}`}>
            {t === "arcs" ? "Stories" : t === "best" ? "Best" : "Days"}
          </button>
        ))}
      </div>}>
      {tab === "arcs" && (
        <ol className="space-y-2 p-2.5">
          {man.chapters.map((ch) => (
            <li key={ch.id} className="rounded-lg border border-[var(--hud-border)] bg-white/[0.025] p-2.5">
              <div className="flex items-center gap-2">
                <AvatarStack ids={ch.actors} size={20} max={3} />
                <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{ch.title}</h3>
                <span className="font-mono text-[10px] text-slate-500">day {ch.stages[0]?.day}{ch.stages.length > 1 ? `–${ch.stages[ch.stages.length - 1].day}` : ""}</span>
              </div>
              <ol className="mt-1.5 space-y-1">
                {ch.stages.map((st, k) => (
                  <li key={k}>
                    <button type="button" className="group flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-white/[0.06]"
                      onClick={() => {
                        const mi = stageMoment(man, ch, k);
                        if (mi !== null) void jumpToMoment(mi);
                        else {
                          const m = { s: st.s, day: st.day, hour: simClock(st.s).hour, minute: simClock(st.s).minute, kind: st.stage === "decision" ? "decision" : "incident", title: ch.title, text: st.text, actors: ch.actors, locationId: null, score: 0 };
                          void seek(jumpTarget(man, m)).then(() => { focusMoment(m, null); play(); });
                        }
                        afterJump();
                      }}>
                      <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ background: kindColor(st.stage === "decision" ? "decision" : "incident") }} />
                      <span className="min-w-0 flex-1">
                        <span className="hud-kicker" style={{ fontSize: 9 }}>{st.stage === "incident" ? "It starts" : st.stage} · day {st.day}</span>
                        <span className="block text-[12px] leading-snug text-slate-300 group-hover:text-white">{st.text}</span>
                      </span>
                      <span className="mt-1 shrink-0 text-[11px] text-slate-500 group-hover:text-white">▶</span>
                    </button>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}

      {tab === "best" && (
        <ol className="divide-y divide-[var(--hud-border)]">
          {bestOrder(man).map((i) => {
            const m = man.moments[i];
            return (
              <li key={i}>
                <button type="button" onClick={() => { void jumpToMoment(i); afterJump(); }} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-white/[0.05]">
                  <span className="mt-0.5 shrink-0 rounded px-1 py-px text-[8.5px] font-bold tracking-[0.12em] text-white uppercase" style={{ background: kindColor(m.kind) }}>{KIND_LABEL[m.kind] ?? m.kind}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] leading-tight font-semibold text-white">{m.title}</span>
                    <span className="block text-[11.5px] leading-snug text-slate-400">{m.text}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">{momentWhen(m).replace(" · ", " ")}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {tab === "days" && (
        <div className="grid grid-cols-5 gap-1.5 p-2.5">
          {days.map((d) => (
            <div key={d} className={`flex flex-col items-stretch overflow-hidden rounded-md border ${d === today ? "border-[var(--hud-live)]" : "border-[var(--hud-border)]"}`}>
              <button type="button" onClick={() => { void seek((d - 1) * 1440 + 7 * 60 + 30).then(play); afterJump(); }}
                className="py-1.5 text-center font-mono text-[12px] text-slate-100 hover:bg-white/10" title={`Watch day ${d} from 07:30`}>
                {d}
              </button>
              {paperDays.has(d) && (
                <a href={`/herald/${d}`} className="border-t border-[var(--hud-border)] py-0.5 text-center text-[9px] tracking-wide text-[#e9dfc6] uppercase hover:bg-white/10" title={`The Herald, day ${d}`}>Herald</a>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelFrame>
  );
}
