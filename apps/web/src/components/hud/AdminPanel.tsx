"use client";
import { useCallback, useEffect, useState } from "react";
import { useWorld } from "@/lib/store";
import { api } from "@/lib/engineClient";
import { PanelFrame, Section, Divider, Pill } from "./ui";
import { CAST, cx, SPEED_1X, SIM_HOUR_REAL_MINUTES, speedMultiplier } from "./lib";
import { pushToast } from "./toastBus";

/** Event deck ids (content/events.json). Hardcoded on purpose: the admin panel must not depend on the deck loading. */
const CARDS: Array<{ id: string; title: string; drama: number }> = [
  { id: "storm", title: "Storm off the point", drama: 7 }, { id: "big_catch", title: "The run comes in", drama: 4 }, { id: "poor_harvest", title: "Blight on the lower field", drama: 6 },
  { id: "bumper_orchard", title: "Orchard glut", drama: 2 }, { id: "ship_visit", title: "The 'Cormorant' docks", drama: 5 }, { id: "inspector", title: "The regional inspector", drama: 8 },
  { id: "festival", title: "Tide Festival", drama: 6 }, { id: "illness", title: "Fever in Salt Lane", drama: 6 }, { id: "grain_price_spike", title: "Regional grain shortage", drama: 6 },
  { id: "cloth_shipment_lost", title: "Lost shipment", drama: 4 }, { id: "lottery", title: "The regional lottery", drama: 8 }, { id: "boat_engine_fails", title: "Engine trouble", drama: 6 },
  { id: "burglary", title: "Break-in on Main Street", drama: 8 }, { id: "chapel_roof", title: "The chapel roof gives", drama: 6 }, { id: "anonymous_donation", title: "Anonymous envelope", drama: 7 },
  { id: "petition", title: "A petition circulates", drama: 7 }, { id: "council_vacancy", title: "Council seat opens", drama: 6 }, { id: "old_letter", title: "A letter from another port", drama: 9 },
  { id: "cooperative_meeting", title: "Fishers' meeting", drama: 7 }, { id: "open_mic", title: "Open mic at the Anchor", drama: 5 }, { id: "heatwave", title: "Heatwave", drama: 3 },
  { id: "tax_notice", title: "Tax day", drama: 3 }, { id: "wedding_rumour", title: "Rumour of a wedding", drama: 6 }, { id: "clinic_grant", title: "Regional health grant", drama: 5 },
  { id: "boat_launch", title: "A boat nobody knew about", drama: 8 },
];

const BASE_SPEED = SPEED_1X;
const SIM_HOUR_REAL_MIN = SIM_HOUR_REAL_MINUTES;
const SPEEDS = [1, 4, 12];

interface LlmStats { calls: number; costUsd: number; failures: number; byKind: Record<string, { calls: number; costUsd: number }> }

export default function AdminPanel() {
  const paused = useWorld((s) => s.time?.paused ?? false);
  const speed = useWorld((s) => s.time?.speed);
  const day = useWorld((s) => s.time?.day);
  const bulkModel = useWorld((s) => s.snapshot?.llm.bulkModel);
  const midModel = useWorld((s) => s.snapshot?.llm.midModel);
  const costTotal = useWorld((s) => s.snapshot?.llm.costTotalUsd);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cardId, setCardId] = useState(CARDS[0].id);
  const [text, setText] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [drama, setDrama] = useState(6);
  const [llm, setLlm] = useState<LlmStats | null>(null);
  const [llmErr, setLlmErr] = useState(false);

  const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: `${label} ✓` }); } catch (e) { setMsg({ ok: false, text: `${label} failed: ${(e as Error).message}` }); }
    finally { setBusy(null); }
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => api.llm().then((r) => { if (alive) { setLlm(r); setLlmErr(false); } }).catch(() => alive && setLlmErr(true));
    load();
    const t = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const currentMult = speed !== undefined ? speedMultiplier(speed) : null;
  const kinds = llm ? Object.entries(llm.byKind).sort((a, b) => b[1].costUsd - a[1].costUsd) : [];

  return (
    <PanelFrame kicker="Control room" title="Admin" right={<Pill color={paused ? "#f87171" : "#34d399"}>{paused ? "paused" : "running"}</Pill>}>
      <Section title="Clock">
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={!!busy} onClick={() => run(paused ? "Resume" : "Pause", () => api.admin(paused ? "resume" : "pause"))} data-active={paused ? "true" : undefined} className="hud-btn min-w-[72px]">{paused ? "▶ Resume" : "❚❚ Pause"}</button>
          <span className="mx-1 text-[10px] text-slate-500">speed</span>
          {SPEEDS.map((m) => (
            <button key={m} type="button" disabled={!!busy} data-active={currentMult === m ? "true" : undefined}
              onClick={() => run(`Speed ${m}×`, () => api.admin("speed", { simMinutesPerRealSecond: BASE_SPEED * m }))} className="hud-btn font-mono">{m}×</button>
          ))}
          <span className="ml-auto font-mono text-[10px] text-slate-500" title="sim minutes per real second">{speed !== undefined ? `${speed} min/s` : "—"}</span>
        </div>
        <div className="mt-1.5 text-[10px] text-slate-500">1× = one sim hour per {SIM_HOUR_REAL_MIN} real minutes · day {day ?? "—"}</div>
      </Section>
      <Divider />

      <Section title="Inject a world event">
        <div className="flex gap-1.5">
          <select value={cardId} onChange={(e) => setCardId(e.target.value)} className="hud-input flex-1">
            {CARDS.map((c) => <option key={c.id} value={c.id}>{c.title} · drama {c.drama}</option>)}
          </select>
          <button type="button" disabled={!!busy} onClick={() => run(`Inject ${cardId}`, () => api.admin("inject", { cardId }).then(() => pushToast({ kicker: "Card played", text: CARDS.find((c) => c.id === cardId)?.title ?? cardId, color: "var(--hud-drama)", ttlMs: 8000 })))} className="hud-btn shrink-0">Play card</button>
        </div>
        <div className="mt-2 rounded-lg border border-[var(--hud-border)] bg-black/20 p-2">
          <div className="hud-kicker mb-1" style={{ fontSize: 9 }}>Free-text event</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="A stranger asks at the inn for Marcus Vale by his old name." className="hud-input resize-none" />
          <div className="mt-1.5 flex items-center gap-1.5">
            <select value="" onChange={(e) => { const v = e.target.value; if (v && !targets.includes(v)) setTargets([...targets, v]); }} className="hud-input flex-1">
              <option value="">+ target NPC (broadcast to town if none)</option>
              {CAST.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="flex items-center gap-1 text-[10px] text-slate-400">drama<input type="number" min={0} max={10} value={drama} onChange={(e) => setDrama(Number(e.target.value))} className="hud-input w-11 px-1 text-center" /></label>
            <button type="button" disabled={!!busy || !text.trim()} onClick={() => run("Inject text", () => api.admin("inject", { text: text.trim(), targets: targets.length ? targets : undefined, drama }).then(() => { pushToast({ kicker: "Event injected", text: text.trim(), color: "var(--hud-drama)", ttlMs: 8000 }); setText(""); setTargets([]); }))} className="hud-btn shrink-0">Inject</button>
          </div>
          {targets.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {targets.map((t) => <button key={t} type="button" onClick={() => setTargets(targets.filter((x) => x !== t))} className="hud-chip hover:bg-white/10" title="remove">{CAST.find((c) => c.id === t)?.name ?? t} ×</button>)}
            </div>
          )}
        </div>
      </Section>
      <Divider />

      <Section title="Persistence">
        <div className="flex items-center gap-2">
          <button type="button" disabled={!!busy} onClick={() => run("Save snapshot", () => api.admin("save"))} className="hud-btn">💾 Save snapshot</button>
          <span className="text-[10px] text-slate-500">writes the world to disk</span>
        </div>
        {msg && <div className={cx("mt-2 rounded px-2 py-1 text-[11px]", msg.ok ? "bg-emerald-500/15 text-emerald-200" : "bg-red-500/15 text-red-200")}>{msg.text}</div>}
      </Section>
      <Divider />

      <Section title="LLM telemetry" right={<span className="text-[10px] text-slate-500">refreshes every 10 s</span>}>
        {!llm ? <div className="text-[11px] text-slate-500">{llmErr ? "Engine unreachable — telemetry unavailable." : "Loading…"}</div> : (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-lg border border-[var(--hud-border)] bg-white/[0.03] px-2 py-1.5"><div className="hud-kicker" style={{ fontSize: 9 }}>Calls</div><div className="font-mono text-[15px] text-white">{llm.calls}</div></div>
              <div className="rounded-lg border border-[var(--hud-border)] bg-white/[0.03] px-2 py-1.5"><div className="hud-kicker" style={{ fontSize: 9 }}>Cost</div><div className="font-mono text-[15px] text-white">${llm.costUsd.toFixed(2)}</div></div>
              <div className="rounded-lg border border-[var(--hud-border)] bg-white/[0.03] px-2 py-1.5"><div className="hud-kicker" style={{ fontSize: 9 }}>Failures</div><div className="font-mono text-[15px]" style={{ color: llm.failures > 0 ? "var(--hud-neg)" : "#fff" }}>{llm.failures}</div></div>
            </div>
            {kinds.length > 0 && (
              <table className="mt-2 w-full border-collapse text-[11px]">
                <thead><tr className="border-b border-[var(--hud-border)] text-[9px] uppercase tracking-wider text-slate-500"><th className="py-1 text-left font-semibold">kind</th><th className="py-1 text-right font-semibold">calls</th><th className="py-1 text-right font-semibold">cost</th><th className="py-1 text-right font-semibold">avg</th></tr></thead>
                <tbody>
                  {kinds.map(([k, v]) => (
                    <tr key={k} className="border-b border-white/[0.04]"><td className="py-0.5 text-slate-200">{k}</td><td className="py-0.5 text-right font-mono text-slate-300">{v.calls}</td><td className="py-0.5 text-right font-mono text-slate-300">${v.costUsd.toFixed(3)}</td><td className="py-0.5 text-right font-mono text-slate-500">{v.calls ? `${((v.costUsd / v.calls) * 100).toFixed(2)}¢` : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-2 text-[10px] text-slate-500">bulk <span className="font-mono text-slate-300">{bulkModel ?? "—"}</span> · mid <span className="font-mono text-slate-300">{midModel ?? "—"}</span>{costTotal !== undefined && <> · lifetime <span className="font-mono text-slate-300">${costTotal.toFixed(2)}</span></>}</div>
          </>
        )}
      </Section>
    </PanelFrame>
  );
}
