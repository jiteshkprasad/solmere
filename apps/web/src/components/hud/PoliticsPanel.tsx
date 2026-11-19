"use client";
import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { useWorld } from "@/lib/store";
import { PanelFrame, Section, Divider, Pill, Empty, Bar } from "./ui";
import { Avatar } from "./Avatar";
import { npcName, shortName, cx, CAST_BY_ID } from "./lib";

const PHASE_COLOR: Record<string, string> = { quiet: "#94a3b8", declared: "#3987e5", campaign: "#c98500", voting: "#ff3b5c", counted: "#199e70" };

export default function PoliticsPanel() {
  const election = useWorld((s) => s.election);
  const policies = useWorld((s) => s.snapshot?.policies);
  const day = useWorld((s) => s.time?.day ?? 1);
  const selectNpc = useWorld((s) => s.selectNpc);
  const [openSpeech, setOpenSpeech] = useState<string | null>(null);

  const approvalRows = useMemo(() => (election?.approvalHistory ?? []).map((a) => ({ day: a.day, v: a.approval })), [election]);
  const tally = useMemo(() => {
    if (!election?.lastResult) return [];
    const t = Object.entries(election.lastResult.tally).sort((a, b) => b[1] - a[1]);
    const total = t.reduce((s, [, v]) => s + v, 0) || 1;
    return t.map(([id, v]) => ({ id, v, share: v / total }));
  }, [election]);
  const sortedPolicies = useMemo(() => [...(policies ?? [])].sort((a, b) => b.proposedDay - a.proposedDay), [policies]);

  if (!election) return <PanelFrame kicker="Dashboard" title="Politics"><Empty>No election state yet.</Empty></PanelFrame>;

  const daysLeft = election.nextElectionDay - day;
  const approvalColor = election.approval >= 20 ? "var(--hud-pos)" : election.approval <= -20 ? "var(--hud-neg)" : "var(--hud-drama)";

  return (
    <PanelFrame kicker="Dashboard" title="Politics" right={<Pill color={PHASE_COLOR[election.phase]}>{election.phase}</Pill>}>
      {/* mayor card */}
      <div className="m-3 rounded-xl border border-[var(--hud-border)] bg-white/[0.03] p-3">
        <div className="flex items-center gap-3">
          <Avatar id={election.mayor} size={44} onClick={() => selectNpc(election.mayor)} />
          <div className="min-w-0 flex-1">
            <div className="hud-kicker">Mayor of Solmere</div>
            <button type="button" onClick={() => selectNpc(election.mayor)} className="truncate text-left text-[15px] font-semibold text-white hover:underline">{npcName(election.mayor)}</button>
            <div className="text-[11px] text-slate-400">{election.lastResult ? `elected day ${election.lastResult.day}` : "incumbent"}{CAST_BY_ID[election.mayor]?.age ? ` · ${CAST_BY_ID[election.mayor].age}` : ""} · council of {election.council.length}</div>
          </div>
          <div className="text-right">
            <div className="hud-kicker" style={{ fontSize: 9 }}>Approval</div>
            <div className="font-mono text-[28px] font-bold leading-none" style={{ color: approvalColor }}>{election.approval > 0 ? "+" : ""}{Math.round(election.approval)}</div>
          </div>
        </div>
        <div className="mt-2 h-[80px] w-full">
          {approvalRows.length < 2 ? <div className="pt-7 text-center text-[10px] text-slate-500">approval history builds nightly</div> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={approvalRows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} interval="preserveStartEnd" tickFormatter={(d) => `D${d}`} />
                <YAxis hide domain={["auto", "auto"]} />
                <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" />
                <Tooltip formatter={(v: number) => [`${v > 0 ? "+" : ""}${Math.round(v)}`, "approval"]} labelFormatter={(d) => `Day ${d}`} cursor={{ stroke: "rgba(148,163,184,0.3)" }} />
                <Line type="monotone" dataKey="v" stroke="var(--s1)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-black/25 px-2.5 py-1.5">
          <span className="text-[11px] text-slate-400">Next election</span>
          <span className="font-mono text-[12px] text-white">{daysLeft > 0 ? `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : daysLeft === 0 ? "today" : `day ${election.nextElectionDay}`}</span>
        </div>
      </div>
      <Divider />

      {/* candidates */}
      <Section title="Candidates" right={<span className="text-[10px] text-slate-500">{election.candidates.length} declared</span>}>
        {election.candidates.length === 0 ? <div className="text-[11px] text-slate-500">Nobody has declared. Yet.</div> : (
          <ul className="space-y-2">
            {election.candidates.map((c) => {
              const speeches = election.speeches.filter((s) => s.npcId === c.npcId).sort((a, b) => b.day - a.day);
              return (
                <li key={c.npcId} className="rounded-lg border border-[var(--hud-border)] bg-white/[0.02] p-2">
                  <div className="flex items-center gap-2">
                    <Avatar id={c.npcId} size={26} onClick={() => selectNpc(c.npcId)} />
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => selectNpc(c.npcId)} className="truncate text-left text-[12px] font-semibold text-white hover:underline">{npcName(c.npcId)}</button>
                      <div className="truncate text-[10px] text-slate-500">{CAST_BY_ID[c.npcId]?.jobTitle} · declared day {c.declaredDay}{c.npcId === election.mayor && " · incumbent"}</div>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-slate-300">{c.platform}</p>
                  {speeches.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {speeches.map((s) => {
                        const key = `${s.npcId}-${s.day}`;
                        const open = openSpeech === key;
                        return (
                          <div key={key} className="rounded bg-black/25 px-2 py-1">
                            <button type="button" onClick={() => setOpenSpeech(open ? null : key)} className="flex w-full items-center justify-between text-[10px] text-slate-400 hover:text-slate-200">
                              <span>♪ Speech, day {s.day}</span><span>{open ? "▲" : "▼"}</span>
                            </button>
                            <p className={cx("text-[11.5px] italic leading-snug text-slate-200", open ? "mt-1" : "mt-0.5 line-clamp-2")}>“{s.text}”</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Divider />

      {/* last result */}
      <Section title="Last result" right={election.lastResult && <span className="text-[10px] text-slate-500">day {election.lastResult.day}</span>}>
        {tally.length === 0 ? <div className="text-[11px] text-slate-500">No election has been held yet.</div> : (
          <ul className="space-y-1.5">
            {tally.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[11px]">
                <Avatar id={t.id} size={18} ring={false} onClick={() => selectNpc(t.id)} />
                <span className="w-[96px] truncate text-slate-200">{shortName(t.id)}{t.id === election.lastResult?.winner && <span className="ml-1 text-[9px] text-amber-300">★</span>}</span>
                <Bar value={t.share} height={8} color={t.id === election.lastResult?.winner ? "var(--s4)" : "var(--s1)"} className="flex-1" />
                <span className="w-7 text-right font-mono text-slate-300">{t.v}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Divider />

      {/* council */}
      <Section title="Council">
        <div className="flex flex-wrap gap-1.5">
          {election.council.map((id) => (
            <button key={id} type="button" onClick={() => selectNpc(id)} className="hud-chip hover:bg-white/10" style={{ color: "#e2e8f0" }}>
              <Avatar id={id} size={14} ring={false} />{shortName(id)}
            </button>
          ))}
        </div>
      </Section>
      <Divider />

      {/* policies */}
      <Section title="Policy log" right={<span className="text-[10px] text-slate-500">{sortedPolicies.length} motions</span>}>
        {sortedPolicies.length === 0 ? <div className="text-[11px] text-slate-500">No motions yet.</div> : (
          <ul className="space-y-1.5">
            {sortedPolicies.map((p) => {
              const color = p.status === "passed" ? "var(--hud-pos)" : p.status === "rejected" ? "var(--hud-neg)" : "var(--hud-drama)";
              return (
                <li key={p.id} className="rounded-lg border border-[var(--hud-border)] bg-white/[0.02] px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-slate-100">{p.title}</span>
                    <Pill color={color}>{p.status}</Pill>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                    <span>by {shortName(p.proposedBy)} · day {p.proposedDay}</span>
                    <span className="ml-auto flex items-center gap-1" title="council votes">
                      {election.council.map((m) => {
                        const v = p.votes[m];
                        return <span key={m} title={`${npcName(m)}: ${v === undefined ? "no vote" : v ? "for" : "against"}`} className="h-2.5 w-2.5 rounded-full" style={{ background: v === undefined ? "rgba(148,163,184,0.25)" : v ? "var(--hud-pos)" : "var(--hud-neg)" }} />;
                      })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </PanelFrame>
  );
}
