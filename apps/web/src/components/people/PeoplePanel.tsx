/**
 * "People" panel: the whole cast at a glance. Search by name, job or what they want; filter to people who are in a
 * story. Each person: face, job, what they want, where they are right now, their stories (tap to jump) and Follow.
 * Tapping the card opens their full card (NpcDrawer: memories, relationships, confessionals).
 */
"use client";
import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { useWorld } from "@/lib/store";
import { CAST, type CastPerson } from "@/lib/share";
import { locationName, MOOD_COLOR } from "@/components/hud/lib";
import { PanelFrame } from "@/components/hud/ui";
import { Avatar } from "@/components/hud/Avatar";
import { IS_REPLAY } from "@/lib/replay/mode";
import { useReplay, jumpToMoment, seek, focusMoment, play } from "@/lib/replay/player";
import { jumpTarget, stageMoment } from "@/lib/replay/moments";
import { simClock } from "@/lib/replay/mode";
import { isNarrow } from "@/lib/useNarrow";

type Filter = "all" | "stories";
const closeOnPhone = () => { if (isNarrow()) useWorld.getState().setPanel(null); };

export default function PeoplePanel() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const man = useReplay((s) => s.manifest);
  const followId = useWorld((s) => s.ui.followNpcId);

  // stories per person (replay chapters)
  const stories = useMemo(() => {
    const m = new Map<string, Array<{ ci: number; title: string }>>();
    man?.chapters.forEach((ch, ci) => ch.actors.forEach((a) => { const xs = m.get(a) ?? []; xs.push({ ci, title: ch.title }); m.set(a, xs); }));
    return m;
  }, [man]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CAST.filter((p) => (filter === "all" || (stories.get(p.id)?.length ?? 0) > 0)
      && (!needle || `${p.name} ${p.jobTitle} ${p.job} ${p.want} ${p.household}`.toLowerCase().includes(needle)))
      .sort((a, b) => (stories.get(b.id)?.length ?? 0) - (stories.get(a.id)?.length ?? 0) || a.name.localeCompare(b.name));
  }, [q, filter, stories]);

  const jumpStory = (ci: number) => {
    if (!man) return;
    const ch = man.chapters[ci];
    track("story_jump", { story: ch.id, from: "people" });
    const mi = stageMoment(man, ch, 0);
    if (mi !== null) void jumpToMoment(mi);
    else {
      const st = ch.stages[0];
      const c = simClock(st.s);
      const m = { s: st.s, day: st.day, hour: c.hour, minute: c.minute, kind: "incident", title: ch.title, text: st.text, actors: ch.actors, locationId: null, score: 0 };
      void seek(jumpTarget(man, m)).then(() => { focusMoment(m, null); play(); });
    }
    closeOnPhone();
  };

  return (
    <PanelFrame kicker={`${CAST.length} people · tap anyone to meet them`} title="People"
      right={<div className="flex rounded-md border border-[var(--hud-border)] bg-black/25 p-0.5 text-[11px]">
        {(["all", "stories"] as Filter[]).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={`rounded px-2 py-0.5 ${filter === f ? "bg-white/15 text-white" : "text-slate-400"}`}>{f === "all" ? "Everyone" : "In a story"}</button>
        ))}
      </div>}>
      <div className="sticky top-0 z-10 bg-[var(--hud-glass-strong)] p-2 backdrop-blur">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name, a job, what they want…" aria-label="Search people"
          className="w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-[13px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#a78bfa]" />
      </div>
      <ul className="flex flex-col gap-1.5 px-2 pb-2">
        {list.length === 0 && <li className="px-1 py-3 text-[12px] text-slate-400">Nobody matches that.</li>}
        {list.map((p) => <Person key={p.id} p={p} stories={stories.get(p.id) ?? []} following={followId === p.id} onStory={jumpStory} />)}
      </ul>
    </PanelFrame>
  );
}

function Person({ p, stories, following, onStory }: { p: CastPerson; stories: Array<{ ci: number; title: string }>; following: boolean; onStory: (ci: number) => void }) {
  const state = useWorld((s) => s.npcs[p.id]);
  const open = () => useWorld.getState().selectNpc(p.id);
  const follow = () => {
    const st = useWorld.getState();
    if (following) { st.follow(null); return; }
    st.follow(p.id);
    closeOnPhone();
  };
  const where = state ? (state.action === "sleep" ? "asleep" : state.activity || locationName(state.locationId)) : "";
  return (
    <li className="rounded-lg border border-[var(--hud-border)] bg-white/[0.025]">
      <button type="button" onClick={open} className="flex w-full items-start gap-2.5 p-2 text-left hover:bg-white/[0.04]" aria-label={`Open ${p.name}`}>
        <Avatar id={p.id} name={p.name} mood={state?.mood} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-[13px] font-semibold text-white">{p.name}</span>
            <span className="shrink-0 text-[11px] text-slate-500">{p.age}</span>
          </span>
          <span className="block truncate text-[11.5px] text-slate-300">{p.jobTitle}</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-400"><span className="text-slate-500">Wants: </span>{p.want}</span>
          {where && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: MOOD_COLOR[state?.mood ?? ""] ?? "#64748b" }} />
              <span className="truncate">Now: {where}</span>
            </span>
          )}
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
        <button type="button" onClick={follow} data-active={following ? "true" : undefined} className="hud-btn text-[11px]">{following ? "Following" : "Follow"}</button>
        {IS_REPLAY && stories.map((s) => (
          <button key={s.ci} type="button" onClick={() => onStory(s.ci)} title={`Watch "${s.title}" from the start`}
            className="rounded-full border border-[#a78bfa]/40 bg-[#a78bfa]/10 px-2 py-0.5 text-[11px] text-[#d6ccff] hover:bg-[#a78bfa]/25">
            ▶ {s.title}
          </button>
        ))}
      </div>
    </li>
  );
}
