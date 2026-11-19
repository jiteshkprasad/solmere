"use client";
import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { Metrics } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { PanelFrame, Section, Divider, Kpi, Empty } from "./ui";
import { Avatar } from "./Avatar";
import { fmtMoney, fmtPct, fmtNum, locationName, npcName, GOODS, CURRENCY, cx } from "./lib";

function MetricChart({ data, k, color, fmt, title }: { data: Metrics[]; k: keyof Metrics; color: string; fmt: (v: number) => string; title: string }) {
  const rows = useMemo(() => data.map((m) => ({ day: m.day, v: Number(m[k]) })), [data, k]);
  return (
    <div className="rounded-lg border border-[var(--hud-border)] bg-white/[0.03] p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="hud-kicker" style={{ fontSize: 9 }}>{title}</span>
        <span className="font-mono text-[11px] text-slate-200">{rows.length ? fmt(rows[rows.length - 1].v) : "—"}</span>
      </div>
      <div className="h-[72px] w-full">
        {rows.length < 2 ? <div className="pt-6 text-center text-[10px] text-slate-500">need 2+ days</div> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} interval="preserveStartEnd" tickFormatter={(d) => `D${d}`} />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip formatter={(v: number) => [fmt(v), title]} labelFormatter={(d) => `Day ${d}`} cursor={{ stroke: "rgba(148,163,184,0.3)" }} />
              <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Sparkline({ values, width = 64, height = 18 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline points={pts} fill="none" stroke={up ? "var(--hud-neg)" : "var(--hud-pos)"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

type SortKey = "name" | "account" | "revenueToday" | "costsToday" | "pnl7";

export default function EconomyPanel() {
  const metrics = useWorld((s) => s.metrics);
  const history = useWorld((s) => s.metricsHistory);
  const businesses = useWorld((s) => s.businesses);
  const loans = useWorld((s) => s.snapshot?.loans);
  const selectNpc = useWorld((s) => s.selectNpc);
  const [sort, setSort] = useState<SortKey>("pnl7");
  const [asc, setAsc] = useState(false);

  const cur = metrics ?? history[history.length - 1] ?? null;
  const prev = useMemo(() => (cur ? [...history].reverse().find((m) => m.day < cur.day) ?? null : null), [history, cur]);
  const d = (k: keyof Metrics, mul = 1) => (cur && prev ? (Number(cur[k]) - Number(prev[k])) * mul : null);

  const goods = useMemo(() => {
    if (!cur) return [];
    return Object.keys(cur.priceIndex).map((g) => ({
      id: g, label: GOODS[g]?.label ?? g, price: cur.priceIndex[g], base: GOODS[g]?.basePrice,
      series: history.map((m) => m.priceIndex[g]).filter((v): v is number => typeof v === "number"),
    })).sort((a, b) => (b.base ?? 0) - (a.base ?? 0));
  }, [cur, history]);

  const league = useMemo(() => {
    const rows = Object.values(businesses).map((b) => {
      const last7 = b.pnlHistory.slice(-7);
      const pnl7 = last7.reduce((s, x) => s + x.revenue - x.costs, 0);
      return { id: b.locationId, name: locationName(b.locationId), owner: b.owner, account: b.account, revenueToday: b.revenueToday, costsToday: b.costsToday, pnl7, open: b.open, employees: b.employees.length };
    });
    rows.sort((a, b) => {
      const va = a[sort], vb = b[sort];
      const c = typeof va === "string" ? String(va).localeCompare(String(vb)) : Number(va) - Number(vb);
      return asc ? c : -c;
    });
    return rows;
  }, [businesses, sort, asc]);

  const th = (k: SortKey, label: string, right = true) => (
    <th className={cx("cursor-pointer select-none px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300", right && "text-right")}
      onClick={() => { if (sort === k) setAsc(!asc); else { setSort(k); setAsc(k === "name"); } }}>
      {label}{sort === k && <span className="ml-0.5">{asc ? "▲" : "▼"}</span>}
    </th>
  );

  if (!cur) return <PanelFrame kicker="Dashboard" title="Economy"><Empty>No metrics yet.</Empty></PanelFrame>;

  return (
    <PanelFrame kicker="Dashboard" title="Economy" right={<span className="font-mono text-[10px] text-slate-500">day {cur.day}</span>}>
      <div className="grid grid-cols-2 gap-1.5 px-3 pt-3 pb-1 xl:grid-cols-3">
        <Kpi label="GDP today" value={fmtMoney(cur.gdpToday)} delta={d("gdpToday")} hint="value of all transactions today" />
        <Kpi label="CPI" value={fmtNum(cur.cpi, 2)} delta={d("cpi")} digits={2} invert hint="1.00 = starting basket" />
        <Kpi label="Unemployed" value={fmtPct(cur.unemployment)} delta={d("unemployment", 100)} suffix="pt" invert />
        <Kpi label="Treasury" value={fmtMoney(cur.treasury)} delta={d("treasury")} />
        <Kpi label="Gini" value={fmtNum(cur.gini, 2)} delta={d("gini")} digits={2} invert hint="0 = equal, 1 = one person has it all" />
        <Kpi label="Happiness" value={fmtNum(cur.happiness, 0)} delta={d("happiness")} />
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-3 py-2">
        <MetricChart data={history} k="gdpToday" color="var(--s1)" fmt={(v) => fmtMoney(v)} title="GDP / day" />
        <MetricChart data={history} k="cpi" color="var(--s2)" fmt={(v) => v.toFixed(2)} title="CPI" />
        <MetricChart data={history} k="treasury" color="var(--s3)" fmt={(v) => fmtMoney(v)} title="Treasury" />
        <MetricChart data={history} k="unemployment" color="var(--s5)" fmt={(v) => fmtPct(v)} title="Unemployment" />
      </div>
      <div className="grid grid-cols-3 gap-1.5 px-3 pb-2 text-[10px]">
        <div className="rounded border border-[var(--hud-border)] px-2 py-1"><span className="text-slate-500">Loans out </span><span className="font-mono text-slate-200">{fmtMoney(cur.loansOutstanding)}</span></div>
        <div className="rounded border border-[var(--hud-border)] px-2 py-1"><span className="text-slate-500">Missed rent </span><span className="font-mono text-slate-200">{cur.missedRent}</span></div>
        <div className="rounded border border-[var(--hud-border)] px-2 py-1"><span className="text-slate-500">Missed wages </span><span className="font-mono text-slate-200">{cur.missedWages}</span></div>
      </div>
      <Divider />

      <Section title="Prices" right={<span className="text-[10px] text-slate-500">{CURRENCY} · vs base</span>}>
        {goods.length === 0 ? <div className="text-[11px] text-slate-500">No price data.</div> : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {goods.map((g) => {
              const chg = g.base ? (g.price - g.base) / g.base : 0;
              return (
                <div key={g.id} className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-[62px] truncate text-slate-300" title={g.label}>{g.label}</span>
                  <Sparkline values={g.series} width={44} />
                  <span className="ml-auto font-mono text-slate-100">{fmtMoney(g.price, g.price < 10 ? 1 : 0)}</span>
                  <span className="w-8 text-right font-mono text-[9px]" style={{ color: Math.abs(chg) < 0.02 ? "var(--hud-dim)" : chg > 0 ? "var(--hud-neg)" : "var(--hud-pos)" }}>{chg > 0 ? "+" : ""}{Math.round(chg * 100)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
      <Divider />

      <Section title="Business league" right={<span className="text-[10px] text-slate-500">{league.length} firms · click a column to sort</span>}>
        {league.length === 0 ? <div className="text-[11px] text-slate-500">No businesses reported.</div> : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-[var(--hud-border)]">{th("name", "Business", false)}{th("account", "Account")}{th("revenueToday", "Rev")}{th("costsToday", "Cost")}{th("pnl7", "P&L 7d")}</tr></thead>
              <tbody>
                {league.map((b) => (
                  <tr key={b.id} className="hud-row-hover border-b border-white/[0.04] text-[11px]">
                    <td className="px-1.5 py-1">
                      <div className="flex items-center gap-1.5">
                        <Avatar id={b.owner} size={16} ring={false} onClick={() => selectNpc(b.owner)} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 truncate text-slate-200">{b.name}{!b.open && <span className="text-[9px] text-slate-500">closed</span>}</div>
                          <div className="truncate text-[9px] text-slate-500">{npcName(b.owner)} · {b.employees} staff</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-1.5 py-1 text-right font-mono" style={{ color: b.account < 0 ? "var(--hud-neg)" : "#e2e8f0" }}>{fmtMoney(b.account)}</td>
                    <td className="px-1.5 py-1 text-right font-mono text-slate-300">{fmtMoney(b.revenueToday)}</td>
                    <td className="px-1.5 py-1 text-right font-mono text-slate-300">{fmtMoney(b.costsToday)}</td>
                    <td className="px-1.5 py-1 text-right font-mono font-semibold" style={{ color: b.pnl7 < 0 ? "var(--hud-neg)" : "var(--hud-pos)" }}>{fmtMoney(b.pnl7)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Divider />

      <Section title="Loans outstanding" right={<span className="text-[10px] text-slate-500">{loans?.length ?? 0} · Ashdown & Co.</span>}>
        {!loans || loans.length === 0 ? <div className="text-[11px] text-slate-500">Nobody owes the bank. Yet.</div> : (
          <ul className="space-y-1">
            {[...loans].sort((a, b) => b.balance - a.balance).map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-[11px]">
                <Avatar id={l.borrower} size={18} ring={false} onClick={() => selectNpc(l.borrower)} />
                <button type="button" className="w-[120px] truncate text-left text-slate-200 hover:text-white" onClick={() => selectNpc(l.borrower)}>{npcName(l.borrower)}</button>
                <span className="font-mono text-slate-100">{fmtMoney(l.balance)}</span>
                <span className="text-[10px] text-slate-500">of {fmtMoney(l.principal)} · {(l.weeklyRate * 100).toFixed(1)}%/wk</span>
                {l.missedPayments > 0 && <span className="ml-auto rounded bg-red-500/20 px-1 text-[9px] font-semibold text-red-300">{l.missedPayments} missed</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PanelFrame>
  );
}
