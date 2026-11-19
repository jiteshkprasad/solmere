"use client";
import { useEffect, useMemo, useState } from "react";
import type { Confessional, Memory, RelationshipState } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { api } from "@/lib/engineClient";
import { Avatar } from "./Avatar";
import { Bar, SignedBar, Section, Divider, Pill, Empty } from "./ui";
import { CAST_BY_ID, MOOD_LABEL, moodColor, fmtMoney, hourLabel, locationName, npcName, relColor, cx, fmtClock } from "./lib";

interface NpcDetail { memories: Memory[]; relationships: RelationshipState[]; confessionals: Confessional[]; content: { age?: number; origin?: string; traits?: string[]; jobTitle?: string } | null; fetchedAt: number }
const cache = new Map<string, NpcDetail>();
const REFRESH_MS = 30_000;

function safeContent(c: unknown): NpcDetail["content"] {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  return {
    age: typeof o.age === "number" ? o.age : undefined,
    origin: typeof o.origin === "string" ? o.origin : undefined,
    traits: Array.isArray(o.traits) ? o.traits.filter((t): t is string => typeof t === "string") : undefined,
    jobTitle: typeof o.jobTitle === "string" ? o.jobTitle : undefined,
  };
}

function useNpcDetail(id: string) {
  const [detail, setDetail] = useState<NpcDetail | null>(cache.get(id) ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setDetail(cache.get(id) ?? null); setError(null);
    const load = async () => {
      try {
        const r = await api.npc(id);
        const d: NpcDetail = { memories: r.memories ?? [], relationships: r.relationships ?? [], confessionals: r.confessionals ?? [], content: safeContent(r.content), fetchedAt: Date.now() };
        cache.set(id, d);
        if (alive) { setDetail(d); setError(null); }
      } catch (e) { if (alive) setError(String((e as Error).message ?? e)); }
    };
    const c = cache.get(id);
    if (!c || Date.now() - c.fetchedAt > REFRESH_MS) void load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [id]);
  return { detail, error };
}

const NEEDS: Array<{ k: "food" | "rest" | "social" | "leisure" | "purpose"; label: string }> = [
  { k: "food", label: "Food" }, { k: "rest", label: "Rest" }, { k: "social", label: "Social" }, { k: "leisure", label: "Fun" }, { k: "purpose", label: "Purpose" },
];

export default function NpcDrawer({ id }: { id: string }) {
  const npc = useWorld((s) => s.npcs[id]);
  const followId = useWorld((s) => s.ui.followNpcId);
  const follow = useWorld((s) => s.follow);
  const selectNpc = useWorld((s) => s.selectNpc);
  const snapshotRels = useWorld((s) => s.snapshot?.relationships);
  const storeConf = useWorld((s) => s.confessionals);
  const storylines = useWorld((s) => s.storylines);
  const { detail, error } = useNpcDetail(id);
  const cast = CAST_BY_ID[id];

  const rels = useMemo(() => {
    const src = detail?.relationships?.length ? detail.relationships : (snapshotRels ?? []).filter((r) => r.a === id);
    // the API returns both directions; keep one edge per counterpart, preferring how *this* NPC feels (a === id)
    const best = new Map<string, RelationshipState>();
    for (const r of src) {
      if (r.a !== id && r.b !== id) continue;
      const other = r.a === id ? r.b : r.a;
      const cur = best.get(other);
      if (!cur || (r.a === id && cur.a !== id)) best.set(other, r);
    }
    return [...best.values()].sort((x, y) => Math.abs(y.affinity) - Math.abs(x.affinity)).slice(0, 8);
  }, [detail, snapshotRels, id]);
  const memories = useMemo(() => [...(detail?.memories ?? [])].sort((a, b) => b.day - a.day || b.hour - a.hour).slice(0, 12), [detail]);
  const confessionals = useMemo(() => {
    const src = detail?.confessionals?.length ? detail.confessionals : storeConf.filter((c) => c.npcId === id);
    return [...src].sort((a, b) => b.day - a.day);
  }, [detail, storeConf, id]);
  const myStories = useMemo(() => storylines.filter((s) => s.actors.includes(id)), [storylines, id]);

  const name = npc?.name ?? npcName(id);
  const mood = npc?.mood ?? "neutral";
  const following = followId === id;
  const employerLabel = cast?.employer === "self" ? "Self-employed" : cast?.employer === "town" ? "Town payroll" : cast?.employer ? npcName(cast.employer) : "No employer";

  return (
    <aside className="glass-strong pointer-events-auto flex h-full min-h-0 flex-col rounded-xl fade-in">
      {/* header */}
      <div className="flex shrink-0 items-start gap-3 border-b border-[var(--hud-border)] px-3 py-3">
        <Avatar id={id} name={name} mood={mood} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold text-white">{name}</h2>
            {(detail?.content?.age ?? cast?.age) && <span className="text-[11px] text-slate-400">{detail?.content?.age ?? cast?.age}</span>}
          </div>
          <div className="truncate text-[11px] text-slate-300">{npc?.jobTitle ?? detail?.content?.jobTitle ?? cast?.jobTitle}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Pill color={moodColor(mood)}>{MOOD_LABEL[mood as keyof typeof MOOD_LABEL] ?? mood}</Pill>
            {npc && <Pill>{npc.action}</Pill>}
            {npc && !npc.employed && <Pill color="#f87171">unemployed</Pill>}
            {npc && npc.sickDays > 0 && <Pill color="#a78bfa">sick</Pill>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" onClick={() => follow(following ? null : id)} data-active={following ? "true" : undefined} className="hud-btn text-[11px]">{following ? "Unfollow" : "Follow"}</button>
          <button type="button" onClick={() => selectNpc(null)} className="hud-btn text-[11px]" title="Close (Esc)">Close</button>
        </div>
      </div>

      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto">
        {/* now */}
        <Section title="Right now">
          {npc ? (
            <>
              <div className="text-[12px] text-slate-100">{npc.activity || "—"} <span className="text-slate-500">· {locationName(npc.locationId)}{npc.targetLocationId && npc.targetLocationId !== npc.locationId ? ` → ${locationName(npc.targetLocationId)}` : ""}</span></div>
              {npc.thought && <div className="mt-1 text-[12px] italic leading-snug text-slate-300">“{npc.thought}”</div>}
            </>
          ) : <div className="text-[12px] text-slate-500">No live state yet.</div>}
        </Section>
        <Divider />

        {/* needs + wallet */}
        <Section title="Needs">
          <div className="grid grid-cols-5 gap-2">
            {NEEDS.map((n) => {
              const v = npc?.needs?.[n.k] ?? 0;
              const val = v > 1 ? v / 100 : v;
              return (
                <div key={n.k} className="min-w-0">
                  <div className="mb-0.5 truncate text-[9px] uppercase tracking-wider text-slate-500">{n.label}</div>
                  <Bar value={val} height={5} color={val < 0.25 ? "var(--hud-neg)" : val < 0.5 ? "var(--hud-drama)" : "var(--hud-pos)"} />
                </div>
              );
            })}
          </div>
        </Section>
        <div className="grid grid-cols-2 gap-2 px-3 pb-2.5">
          <div className="rounded-lg border border-[var(--hud-border)] bg-white/[0.03] px-2.5 py-1.5">
            <div className="hud-kicker" style={{ fontSize: 9 }}>Wallet</div>
            <div className="font-mono text-[15px] font-semibold text-white">{fmtMoney(npc?.wallet)}</div>
          </div>
          <div className="rounded-lg border border-[var(--hud-border)] bg-white/[0.03] px-2.5 py-1.5">
            <div className="hud-kicker" style={{ fontSize: 9 }}>Debt</div>
            <div className="font-mono text-[15px] font-semibold" style={{ color: (npc?.debt ?? 0) > 0 ? "var(--hud-neg)" : "#fff" }}>{fmtMoney(npc?.debt)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 pb-2.5 text-[11px]">
          <div><span className="text-slate-500">Employer </span><span className="text-slate-200">{employerLabel}</span></div>
          <div><span className="text-slate-500">Works at </span><span className="text-slate-200">{locationName(npc?.workplace ?? cast?.workplace)}</span></div>
          <div><span className="text-slate-500">Home </span><span className="text-slate-200">{locationName(npc?.home ?? cast?.home)}</span></div>
          <div><span className="text-slate-500">Happiness </span><span className="text-slate-200">{npc ? Math.round(npc.happiness) : "—"}</span> <span className="text-slate-500">· Mayor </span><span className="text-slate-200">{npc ? (npc.mayorOpinion > 0 ? "+" : "") + Math.round(npc.mayorOpinion) : "—"}</span></div>
        </div>
        {(detail?.content?.traits ?? cast?.traits) && (
          <div className="flex flex-wrap gap-1 px-3 pb-2.5">
            {(detail?.content?.traits ?? cast?.traits ?? []).map((t) => <span key={t} className="hud-chip">{t}</span>)}
            {detail?.content?.origin && <span className="w-full text-[11px] text-slate-400">{detail.content.origin}</span>}
          </div>
        )}
        <Divider />

        {/* plan */}
        <Section title="Today's plan">
          {npc && npc.plan.length > 0 ? (
            <ol className="relative ml-1.5 border-l border-[var(--hud-border)]">
              {npc.plan.map((step, i) => {
                const cur = i === npc.planStepIndex;
                const past = i < npc.planStepIndex;
                return (
                  <li key={i} className={cx("relative pl-3 py-1", past && "opacity-50")}>
                    <span className="absolute -left-[4.5px] top-[9px] h-2 w-2 rounded-full" style={{ background: cur ? "var(--hud-live)" : "rgba(148,163,184,0.5)", boxShadow: cur ? "0 0 8px var(--hud-live)" : "none" }} />
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[10px] text-slate-500">{hourLabel(step.startHour)}–{hourLabel(step.endHour)}</span>
                      <span className={cx("text-[11px] font-medium", cur ? "text-white" : "text-slate-300")}>{step.action}</span>
                      <span className="truncate text-[11px] text-slate-500">{locationName(step.location)}</span>
                    </div>
                    <div className={cx("text-[11px] leading-snug", cur ? "text-slate-200" : "text-slate-400")}>{step.intent}{step.with && step.with.length > 0 && <span className="text-slate-500"> · with {step.with.map(npcName).join(", ")}</span>}</div>
                  </li>
                );
              })}
            </ol>
          ) : <div className="text-[12px] text-slate-500">No plan yet.</div>}
        </Section>
        <Divider />

        {/* relationships */}
        <Section title="Relationships" right={<span className="text-[10px] text-slate-500">by strength</span>}>
          {rels.length === 0 ? <div className="text-[12px] text-slate-500">{error ? "Couldn't reach the engine." : "Loading…"}</div> : (
            <ul className="space-y-1">
              {rels.map((r) => {
                const other = r.a === id ? r.b : r.a;
                return (
                  <li key={other + r.type} className="flex items-center gap-2">
                    <Avatar id={other} size={20} ring={false} onClick={() => selectNpc(other)} />
                    <button type="button" onClick={() => selectNpc(other)} className="w-[110px] truncate text-left text-[11px] text-slate-200 hover:text-white">{npcName(other)}</button>
                    <span className="w-[54px] shrink-0 text-[9px] font-semibold uppercase tracking-wider" style={{ color: relColor(r.type) }}>{r.type}</span>
                    <SignedBar value={r.affinity / 100} className="flex-1" />
                    <span className="w-7 text-right font-mono text-[10px] text-slate-400">{r.affinity > 0 ? "+" : ""}{Math.round(r.affinity)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        <Divider />

        {myStories.length > 0 && (
          <>
            <Section title="Storylines">
              <div className="flex flex-wrap gap-1">{myStories.map((s) => <span key={s.id} className="hud-chip" title={s.summary}>{s.title}</span>)}</div>
            </Section>
            <Divider />
          </>
        )}

        {/* memories */}
        <Section title="Recent memories">
          {memories.length === 0 ? <div className="text-[12px] text-slate-500">{detail ? "Nothing remembered yet." : error ? "Couldn't reach the engine." : "Loading…"}</div> : (
            <ul className="space-y-1.5">
              {memories.map((m) => (
                <li key={m.id} className="flex gap-2 text-[11px] leading-snug">
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">D{m.day} {fmtClock(m.hour, 0).slice(0, 2)}h</span>
                  <span className={cx("text-slate-300", m.importance >= 7 && "text-slate-100")}>
                    <span className="mr-1 text-[9px] uppercase tracking-wider text-slate-500">{m.kind}</span>{m.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Divider />

        {/* confessionals */}
        <Section title="Confessionals">
          {confessionals.length === 0 ? <Empty>No confessional yet.</Empty> : (
            <ul className="space-y-2">
              {confessionals.slice(0, 5).map((c, i) => (
                <li key={c.day + "-" + i} className="rounded-lg border border-[var(--hud-border)] bg-black/25 p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[9px] font-bold tracking-widest" style={{ color: "var(--hud-live)" }}>● REC</span>
                    <span className="font-mono text-[10px] text-slate-500">Day {c.day}</span>
                    <Pill color={moodColor(c.mood)}>{c.mood}</Pill>
                  </div>
                  <div className="text-[12px] italic leading-snug text-slate-200">“{c.text}”</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </aside>
  );
}
