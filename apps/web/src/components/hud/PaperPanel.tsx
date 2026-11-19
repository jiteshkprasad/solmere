"use client";
import { useEffect, useMemo, useState } from "react";
import type { Newspaper } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { api } from "@/lib/engineClient";
import { PanelFrame, Empty, IconBtn } from "./ui";
import { IS_REPLAY } from "@/lib/replay/mode";

const fetched = new Map<number, Newspaper | null>();

export default function PaperPanel() {
  const papers = useWorld((s) => s.papers);
  const today = useWorld((s) => s.time?.day ?? 1);
  const hour = useWorld((s) => s.time?.hour ?? 0);
  const latestDay = useMemo(() => { const ks = Object.keys(papers).map(Number); return ks.length ? Math.max(...ks) : null; }, [papers]);
  const [day, setDay] = useState<number | null>(null);
  const [remote, setRemote] = useState<Newspaper | null>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);

  const shownDay = day ?? latestDay;
  const paper = shownDay !== null ? (papers[shownDay] ?? remote) : null;

  useEffect(() => {
    if (shownDay === null || papers[shownDay]) { setRemote(null); setMissing(false); return; }
    const c = fetched.get(shownDay);
    if (c !== undefined) { setRemote(c); setMissing(c === null); return; }
    let alive = true; setLoading(true); setMissing(false);
    api.paper(shownDay).then((p) => { fetched.set(shownDay, p); if (alive) { setRemote(p); setMissing(false); } })
      .catch(() => { fetched.set(shownDay, null); if (alive) { setRemote(null); setMissing(true); } })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [shownDay, papers]);

  const canNext = shownDay !== null && shownDay < Math.max(today, latestDay ?? 0);
  const canPrev = shownDay !== null && shownDay > 1;

  return (
    <PanelFrame kicker="The daily" title="The Solmere Herald" className="!bg-[rgba(24,22,18,0.82)]"
      right={<>
        <IconBtn title="Previous day" onClick={() => canPrev && setDay((shownDay ?? 1) - 1)}>←</IconBtn>
        <span className="min-w-[48px] text-center font-mono text-[11px] text-slate-300">{shownDay !== null ? `Day ${shownDay}` : "—"}</span>
        <IconBtn title="Next day" onClick={() => canNext && setDay((shownDay ?? 1) + 1)}>→</IconBtn>
        {day !== null && latestDay !== null && day !== latestDay && <IconBtn title="Latest" onClick={() => setDay(null)}>latest</IconBtn>}
      </>}>
      {!paper ? (
        <Empty>{loading ? "Fetching the paper…" : missing ? (shownDay !== null && shownDay >= today ? <>No edition for day {shownDay} yet.<br /><span className="text-slate-600">The Herald prints at midnight.</span></> : `No edition on day ${shownDay}.`) : <>The first edition prints at midnight.<br /><span className="text-slate-600">It&rsquo;s day {today}, {String(hour).padStart(2, "0")}:00.</span></>}</Empty>
      ) : (
        <article className="font-serif text-[#efe9dc]" style={{ fontFamily: "var(--font-serif)" }}>
          <header className="border-b-2 border-[#efe9dc]/70 px-4 pt-3 pb-2 text-center">
            <div className="text-[22px] font-bold uppercase tracking-[0.12em] leading-none" style={{ fontVariant: "small-caps" }}>{paper.masthead || "The Solmere Herald"}</div>
            <div className="mt-1 flex items-center justify-between border-t border-[#efe9dc]/30 pt-1 font-sans text-[10px] uppercase tracking-widest text-[#cfc7b5]">
              <span>Day {paper.day}</span><span>Solmere&rsquo;s only newspaper</span><span>1 crown</span>
            </div>
          </header>
          <h1 className="px-4 pt-3 pb-2 text-[24px] font-bold leading-[1.1] text-white">{paper.headline}</h1>
          <div className="space-y-3 px-4 pb-3">
            {paper.stories.map((s, i) => (
              <section key={i} className={i > 0 ? "border-t border-[#efe9dc]/20 pt-3" : ""}>
                <h3 className="text-[14px] font-bold leading-tight text-[#f7f2e6]">{s.headline}</h3>
                <p className="mt-1 text-[12.5px] leading-[1.5] text-[#e2dccb]" style={i === 0 ? { columnCount: 1 } : undefined}>{s.body}</p>
              </section>
            ))}
          </div>
          {paper.editorial && (
            <div className="mx-4 mb-3 border-l-2 border-[#efe9dc]/50 pl-3">
              <div className="font-sans text-[9px] uppercase tracking-widest text-[#cfc7b5]">Editorial</div>
              <p className="text-[12px] leading-[1.5] text-[#e2dccb]">{paper.editorial}</p>
            </div>
          )}
          <div className="mx-4 mb-3 rounded border border-[#efe9dc]/30 bg-black/30 p-2">
            <div className="mb-1 font-sans text-[9px] uppercase tracking-widest text-[#cfc7b5]">Market prices</div>
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[1.45] text-[#e2dccb]">{paper.pricesColumn}</pre>
          </div>
          <div className="mx-4 mb-4 rounded bg-[#efe9dc]/[0.06] p-2.5">
            <div className="mb-1 font-sans text-[9px] uppercase tracking-widest text-[#cfc7b5]">Gossip corner</div>
            <p className="text-[12px] italic leading-[1.5] text-[#efe9dc]">{paper.gossipCorner}</p>
          </div>
          {IS_REPLAY && (
            <a href={`/herald/${paper.day}`} className="hud-btn mx-4 mb-4 block text-center font-sans">Open the full front page →</a>
          )}
        </article>
      )}
    </PanelFrame>
  );
}
