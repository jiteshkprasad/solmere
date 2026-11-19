"use client";
import { useReplay, nextBestBit } from "@/lib/replay/player";
import { openingMoment, momentWhen } from "@/lib/replay/moments";
import { Avatar } from "@/components/hud/Avatar";
import { clip, npcName } from "@/lib/share";

/**
 * Replay-mode arrival card: the season's real drama, read from the manifest, shown
 * while the town builds behind it. "Watch" starts the clock on the opening scene;
 * "Best bit" jumps straight to the top moment.
 */
function race(man: { election: { lastResult?: { tally: Record<string, number> } | null } | null }): string {
  const ids = Object.keys(man.election?.lastResult?.tally ?? {});
  return ids.length === 2 ? ` between ${npcName(ids[0])} and ${npcName(ids[1])}` : "";
}

export default function ReplayArrival({ onClose }: { onClose: (pick?: string) => void }) {
  const man = useReplay((s) => s.manifest);
  const opening = man ? man.moments[openingMoment(man)] : null;
  const arcs = man ? man.chapters.slice(0, 3) : [];

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center overflow-y-auto p-3 hud-scroll sm:p-4"
      style={{ background: "radial-gradient(130% 100% at 50% 30%, rgba(3,7,18,0.28), rgba(3,7,18,0.82))", backdropFilter: "blur(1.5px)" }}>
      <section className="glass-strong banner-in relative my-auto w-full max-w-[720px] overflow-hidden rounded-2xl" style={{ borderColor: "var(--hud-border-strong)" }}>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32" style={{ background: "radial-gradient(90% 100% at 50% 0%, rgba(167,139,250,0.16), transparent 70%)" }} />
        <div className="relative px-4 pt-4 pb-4 sm:px-7 sm:pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[#a78bfa]/90 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.18em] text-white">SEASON 1</span>
            <span className="hud-kicker" style={{ letterSpacing: "0.2em" }}>30 days · 50 people · run by AI</span>
          </div>
          <h1 className="mt-2.5 text-[27px] leading-[1.05] font-semibold tracking-[-0.01em] text-white sm:text-[36px]" style={{ fontFamily: "var(--font-serif)" }}>
            A month in Solmere
          </h1>
          <p className="mt-2 max-w-[60ch] text-[13.5px] leading-[1.5] text-slate-300">
            A harbour town of 50 people with their own jobs, debts and secrets. Everything they said, chose and voted came from AI.
            {" "}It ends in an election.
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Counts visits to see what people enjoy. <a href="/privacy" className="pointer-events-auto underline hover:text-slate-300">Privacy</a></p>

          {opening && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-[var(--hud-border)] bg-white/[0.03] px-3 py-2.5">
              <span className="mt-px flex shrink-0 -space-x-1.5">
                {opening.actors.slice(0, 2).map((id) => <Avatar key={id} id={id} size={28} />)}
              </span>
              <div className="min-w-0">
                <div className="hud-kicker" style={{ color: "#c4b5fd" }}>Where we start · {momentWhen(opening)}</div>
                <p className="text-[13.5px] leading-snug text-slate-100" style={{ fontFamily: "var(--font-serif)" }}>{opening.text}</p>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" autoFocus onClick={() => onClose()}
              className="flex-1 rounded-lg px-5 py-2.5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 sm:flex-none"
              style={{ background: "var(--hud-live)", boxShadow: "0 6px 20px rgba(255,59,92,0.3)" }}>
              Watch it unfold
            </button>
            <button type="button" onClick={() => { useReplay.setState({ started: true }); onClose(); nextBestBit(); }}
              className="flex-1 rounded-lg border border-[var(--hud-border-strong)] bg-white/[0.05] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-white/[0.11] sm:flex-none">
              Jump to the best bit
            </button>
          </div>

          {arcs.length > 0 && (
            <div className="mt-4 border-t border-[var(--hud-border)] pt-3">
              <div className="hud-kicker">Also this month</div>
              <ul className="mt-1.5 space-y-1.5">
                {arcs.slice(opening ? 1 : 0).map((ch) => (
                  <li key={ch.id} className="flex items-start gap-2 text-[12px] leading-snug">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#a78bfa]" />
                    <span className="text-slate-400"><span className="font-semibold text-slate-200">{ch.title}.</span> {clip(ch.stages[0]?.text ?? "", 130)}</span>
                  </li>
                ))}
                {man && <li className="pl-3.5 text-[11.5px] text-slate-500">…and {man.chapters.length - 3} more stories, then a vote for mayor{race(man)}.</li>}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
