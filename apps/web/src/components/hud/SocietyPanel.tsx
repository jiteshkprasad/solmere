"use client";
import { useMemo } from "react";
import type { WorldEvent } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { PanelFrame, Section, Divider, Kpi, Flame } from "./ui";
import { Avatar, AvatarStack } from "./Avatar";
import RelationshipGraph from "./RelationshipGraph";
import { fmtNum, fmtPct, shortName, fmtClock, relColor, MOOD_COLOR, MOOD_LABEL } from "./lib";

const LEGEND: Array<[string, string]> = [["romantic", "Romance"], ["family", "Family"], ["friend", "Friends"], ["rival", "Rival / enemy"], ["business", "Business"], ["tenant", "Tenant"]];
const TRACKED: WorldEvent["type"][] = ["romance", "breakup", "feud", "friendship"];
const TRACK_LABEL: Record<string, { label: string; color: string }> = {
  romance: { label: "Romance", color: "#f472b6" }, breakup: { label: "Breakup", color: "#a78bfa" }, feud: { label: "Feud", color: "#f87171" }, friendship: { label: "Friendship", color: "#34d399" },
};

export default function SocietyPanel() {
  const metrics = useWorld((s) => s.metrics);
  const history = useWorld((s) => s.metricsHistory);
  const events = useWorld((s) => s.events);
  const selectNpc = useWorld((s) => s.selectNpc);
  const moodCounts = useWorld((s) => { const c: Record<string, number> = {}; for (const id in s.npcs) c[s.npcs[id].mood] = (c[s.npcs[id].mood] ?? 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m}:${n}`).join(","); });

  const cur = metrics ?? history[history.length - 1] ?? null;
  const prev = useMemo(() => (cur ? [...history].reverse().find((m) => m.day < cur.day) ?? null : null), [history, cur]);
  const tracker = useMemo(() => { const out: WorldEvent[] = []; for (let i = events.length - 1; i >= 0 && out.length < 10; i--) if (TRACKED.includes(events[i].type)) out.push(events[i]); return out; }, [events]);
  const moods = useMemo(() => (moodCounts ? moodCounts.split(",").map((x) => { const [m, n] = x.split(":"); return { m, n: Number(n) }; }) : []), [moodCounts]);
  const total = moods.reduce((s, x) => s + x.n, 0) || 1;

  return (
    <PanelFrame kicker="Dashboard" title="Society" right={<span className="text-[10px] text-slate-500">hover a node · click to open</span>}>
      <div className="mx-3 mt-3 overflow-hidden rounded-xl border border-[var(--hud-border)] bg-black/30">
        <RelationshipGraph height={290} />
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--hud-border)] px-2.5 py-1.5">
          {LEGEND.map(([t, l]) => <span key={t} className="flex items-center gap-1 text-[10px] text-slate-400"><span className="h-0.5 w-3 rounded" style={{ background: relColor(t) }} />{l}</span>)}
          <span className="ml-auto text-[10px] text-slate-500">node colour = mood</span>
        </div>
      </div>

      {/* mood strip */}
      <div className="px-3 pt-2">
        <div className="flex h-2 w-full overflow-hidden rounded-full">
          {moods.map((x) => <div key={x.m} title={`${MOOD_LABEL[x.m as keyof typeof MOOD_LABEL] ?? x.m}: ${x.n}`} style={{ width: `${(x.n / total) * 100}%`, background: MOOD_COLOR[x.m as keyof typeof MOOD_COLOR] ?? "#94a3b8" }} />)}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-slate-400">
          {moods.slice(0, 5).map((x) => <span key={x.m}><span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: MOOD_COLOR[x.m as keyof typeof MOOD_COLOR] ?? "#94a3b8" }} />{x.m} {x.n}</span>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 px-3 pt-2.5 pb-1 xl:grid-cols-3">
        <Kpi label="Happiness" value={cur ? fmtNum(cur.happiness, 0) : "—"} delta={cur && prev ? cur.happiness - prev.happiness : undefined} />
        <Kpi label="Cohesion" value={cur ? fmtPct(cur.cohesion) : "—"} delta={cur && prev ? (cur.cohesion - prev.cohesion) * 100 : undefined} suffix="pt" hint="share of positive ties" />
        <Kpi label="Lonely" value={cur ? String(cur.lonely.length) : "—"} delta={cur && prev ? cur.lonely.length - prev.lonely.length : undefined} digits={0} invert hint="nobody they're on good terms with" />
      </div>
      <Divider />

      <Section title="Lonely" right={<span className="text-[10px] text-slate-500">no positive tie</span>}>
        {!cur || cur.lonely.length === 0 ? <div className="text-[11px] text-slate-500">Everyone has someone. For now.</div> : (
          <div className="flex flex-wrap gap-1.5">
            {cur.lonely.map((id) => (
              <button key={id} type="button" onClick={() => selectNpc(id)} className="hud-chip hover:bg-white/10" style={{ color: "#e2e8f0" }}><Avatar id={id} size={14} ring={false} />{shortName(id)}</button>
            ))}
          </div>
        )}
      </Section>
      <Divider />

      <Section title="Romance & feud tracker">
        {tracker.length === 0 ? <div className="text-[11px] text-slate-500">No hearts broken, no lines crossed. Yet.</div> : (
          <ul className="space-y-1.5">
            {tracker.map((e) => {
              const t = TRACK_LABEL[e.type];
              return (
                <li key={e.id} className="flex items-start gap-2 rounded-lg border border-[var(--hud-border)] bg-white/[0.02] px-2 py-1.5" style={{ borderLeft: `2px solid ${t.color}` }}>
                  <AvatarStack ids={e.actors} size={20} onClick={selectNpc} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px]"><span className="font-semibold uppercase tracking-wider" style={{ color: t.color }}>{t.label}</span><span className="font-mono text-slate-500">D{e.day} {fmtClock(e.hour, e.minute)}</span></div>
                    <div className="text-[11.5px] leading-snug text-slate-200">{e.text}</div>
                  </div>
                  <Flame drama={e.drama} className="mt-1" />
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </PanelFrame>
  );
}
