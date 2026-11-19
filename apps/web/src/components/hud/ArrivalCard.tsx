/**
 * "Previously in Solmere" — the card a first-time viewer sees so they arrive
 * into a story rather than a void. OWNED BY THE STORY/SHARE AGENT.
 * Mounted by app/page.tsx.
 *
 * Shows once per browser (localStorage), forced back with `?intro=1`, skipped
 * when the URL is a deep link (`?follow=`, `?panel=`, `?day=`). Everything is
 * assembled from live store data with a static fallback from content/*.json, so
 * it reads the same whether the engine has 400 days of history or none.
 *
 * Layout (visual pass, Nov 2026): headline, one sentence, the "right now" line
 * and the Watch / Show me someone buttons come first, so on a 375×812 phone the
 * Watch button is on screen without scrolling. The Herald and the three dramas
 * sit in a collapsible "What's brewing" section — open on desktop, closed on a
 * phone. While the card is up, the loading screen shrinks to a slim progress
 * line (lib/arrivalState.ts), so this card is what a visitor reads while the
 * town builds behind it.
 *
 * It also mounts <DeepLinks/>, which is how `/?follow=<id>` works — this is the
 * only component on the `/` page this agent owns. See apps/web/NOTES-arrival.md.
 */
"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWorld } from "@/lib/store";
import { useArrival } from "@/lib/arrivalState";
import { isNarrow, useNarrow } from "@/lib/useNarrow";
import { Avatar } from "./Avatar";
import DeepLinks, { hasDeepLink } from "@/components/arrival/DeepLinks";
import { CatchUpOverlay, CatchUpButton } from "@/components/arrival/CatchUp";
import ReplayArrival from "@/components/replay/ReplayArrival";
import { IS_REPLAY } from "@/lib/replay/mode";
import {
  CAST, CAST_BY_ID, TOWN_NAME, arrivalStorylines, clip, dramaLine, firstName, fmtClock,
  hottestEvent, locationName, mostInterestingNpc, npcName,
} from "@/lib/share";

const SEEN_KEY = "solmere.intro.seen.v1";
const seen = (): boolean => { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ } };

const STATUS_COLOR: Record<string, string> = { brewing: "#94a3b8", active: "#3987e5", climax: "var(--hud-live)", resolved: "#199e70" };
const STRIP = CAST.filter((_, i) => i % 3 === 0).slice(0, 16).map((c) => c.id);

/* ------------------------------------------------------------------ */

function Kicker({ day, hour, minute, sleeping, connected }: { day: number | null; hour: number; minute: number; sleeping: boolean; connected: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-[0.18em] text-white"
        style={{ background: connected ? "rgba(255,59,92,0.92)" : "rgba(100,116,139,0.5)" }}>
        <span className={`h-1.5 w-1.5 rounded-full bg-white ${connected ? "live-dot" : ""}`} />
        {connected ? "LIVE" : "OFFLINE"}
      </span>
      <span className="hud-kicker" style={{ letterSpacing: "0.2em" }}>{TOWN_NAME}</span>
      <span className="font-mono text-[11px] text-slate-400">
        {day === null ? "waiting for the world…" : `Day ${day} · ${fmtClock(hour, minute)}`}
        {sleeping && <span className="text-slate-500"> · the town is asleep</span>}
      </span>
    </div>
  );
}

function StoryCard({ title, summary, actors, status, heat, onPick, showHeat = true }: {
  title: string; summary: string; actors: string[]; status: string; heat: number; onPick: (id: string) => void; showHeat?: boolean;
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border bg-white/[0.025] p-3"
      style={{ borderColor: status === "climax" ? "rgba(255,59,92,0.45)" : "var(--hud-border)" }}>
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] ?? "#94a3b8" }} />
        <span className="hud-kicker truncate" style={{ fontSize: 9 }}>{status}</span>
        {showHeat && <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">heat {Math.round(heat)}</span>}
      </div>
      <h3 className="mt-1 text-[13.5px] font-semibold leading-tight text-white">{title}</h3>
      <p className="mt-1 flex-1 text-[11.5px] leading-[1.45] text-slate-400">{clip(summary, 155)}</p>
      <div className="mt-2 flex items-center -space-x-1.5">
        {actors.slice(0, 4).map((a) => <Avatar key={a} id={a} size={22} ring={false} onClick={() => onPick(a)} title={npcName(a)} />)}
        {actors.length > 4 && <span className="!ml-1 font-mono text-[10px] text-slate-500">+{actors.length - 4}</span>}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */

function Card({ onClose }: { onClose: (pick?: string) => void }) {
  const time = useWorld((s) => s.time);
  const connected = useWorld((s) => s.ui.connected);
  const papers = useWorld((s) => s.papers);
  const storylines = useWorld((s) => s.storylines);
  const events = useWorld((s) => s.events);
  const npcs = useWorld((s) => s.npcs);
  const focus = useWorld((s) => s.ui.directorFocus);
  const narrow = useNarrow();
  const [recap, setRecap] = useState(false);
  // "What's brewing" is open on desktop, folded on a phone (so Watch stays above the fold)
  const [more, setMore] = useState<boolean>(() => !isNarrow());

  const day = time?.day ?? null;
  const { items: arcs, live: liveArcs, seededIds } = arrivalStorylines(storylines, day ?? 1, 3);

  const paper = useMemo(() => {
    const days = Object.keys(papers).map(Number).sort((a, b) => b - a);
    return days.length ? papers[days[0]] : null;
  }, [papers]);

  const pick = useMemo(() => mostInterestingNpc({ storylines, events, npcs }), [storylines, events, npcs]);
  const pickLine = useMemo(() => dramaLine(pick, { storylines, events, npcs }), [pick, storylines, events, npcs]);

  const now = useMemo(() => {
    if (focus?.npcIds?.length) {
      const where = focus.locationId ? ` at ${locationName(focus.locationId)}` : "";
      const names = focus.npcIds.map(firstName);
      const list = names.length > 3 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} others` : names.length === 3 ? `${names[0]}, ${names[1]} and ${names[2]}` : names.join(" and ");
      const who = `${list}${where}`;
      return { ids: focus.npcIds.slice(0, 3), label: "Right now", text: who, sub: focus.reason ?? "" };
    }
    const e = hottestEvent(events);
    if (e) return { ids: e.actors.slice(0, 3), label: `Day ${e.day}, ${fmtClock(e.hour, e.minute)}`, text: e.text, sub: "" };
    const a = arcs[0];
    if (a) return { ids: a.actors.slice(0, 3), label: "Shortest fuse", text: `${a.title}: ${a.summary}`, sub: "" };
    return null;
  }, [focus, events, arcs]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center overflow-y-auto p-3 hud-scroll sm:p-4"
      style={{ background: "radial-gradient(130% 100% at 50% 30%, rgba(3,7,18,0.28), rgba(3,7,18,0.82))", backdropFilter: "blur(1.5px)" }}>
      <section className="glass-strong banner-in relative my-auto w-full max-w-[820px] overflow-hidden rounded-2xl"
        style={{ borderColor: "var(--hud-border-strong)" }}>
        {/* top light */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32"
          style={{ background: "radial-gradient(90% 100% at 50% 0%, rgba(255,59,92,0.14), transparent 70%)" }} />

        <div className="relative px-4 pt-4 pb-3 sm:px-7 sm:pt-6">
          <Kicker day={day} hour={time?.hour ?? 0} minute={time?.minute ?? 0} sleeping={!!time?.sleeping} connected={connected} />

          <h1 className="mt-2.5 text-[27px] leading-[1.05] font-semibold tracking-[-0.01em] text-white sm:mt-3 sm:text-[38px]"
            style={{ fontFamily: "var(--font-serif)" }}>
            Previously in {TOWN_NAME}
          </h1>
          <p className="mt-2 max-w-[62ch] text-[13.5px] leading-[1.5] text-slate-300">
            <strong className="font-semibold text-white">50 people</strong> with jobs, rent, grudges and crushes. Nothing is
            scripted: every choice is made by an AI that remembers yesterday. You are watching.
          </p>

          {/* the cast, as texture (desktop only — on a phone the space goes to the buttons) */}
          <div aria-hidden className="mt-3 hidden items-center -space-x-2 overflow-hidden sm:flex"
            style={{ maskImage: "linear-gradient(to right, #000 60%, transparent)", WebkitMaskImage: "linear-gradient(to right, #000 60%, transparent)" }}>
            {STRIP.map((id) => <Avatar key={id} id={id} size={26} ring={false} />)}
          </div>

          {/* right now */}
          {now && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-[var(--hud-border)] bg-white/[0.03] px-3 py-2">
              <span className="mt-px flex shrink-0 items-center -space-x-1.5">
                {now.ids.slice(0, narrow ? 2 : 3).map((id) => <Avatar key={id} id={id} size={24} mood={npcs[id]?.mood} onClick={() => onClose(id)} />)}
              </span>
              <div className="min-w-0">
                <div className="hud-kicker" style={{ color: "var(--hud-live)" }}>{now.label}</div>
                <p className="text-[12.5px] leading-snug text-slate-200">{clip(now.text, narrow ? 110 : 180)}</p>
                {now.sub && <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400">— {clip(now.sub, narrow ? 80 : 150)}</p>}
              </div>
            </div>
          )}

          {/* actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onClose()} autoFocus
              className="flex-1 rounded-lg px-5 py-2.5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 sm:flex-none"
              style={{ background: "var(--hud-live)", boxShadow: "0 6px 20px rgba(255,59,92,0.3)" }}>
              Watch the town
            </button>
            <button type="button" onClick={() => onClose(pick)}
              className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--hud-border-strong)] bg-white/[0.05] py-1.5 pr-3 pl-1.5 text-left transition-colors hover:bg-white/[0.11] sm:flex-none">
              <Avatar id={pick} size={30} mood={npcs[pick]?.mood} />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold leading-tight text-white">Follow someone</span>
                <span className="block max-w-[240px] truncate text-[11px] leading-tight text-slate-400">
                  {npcName(pick)}{CAST_BY_ID[pick] ? ` · ${CAST_BY_ID[pick].job}` : ""}
                </span>
              </span>
            </button>
            {pickLine && <p className="hidden w-full text-[11px] leading-snug text-slate-500 sm:block">{npcName(pick)} — {clip(pickLine, 160)}</p>}
          </div>
        </div>

        {/* what's brewing: Herald + three dramas, collapsible */}
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more}
          className="flex w-full items-center justify-between gap-2 border-t border-[var(--hud-border)] px-4 py-2.5 text-left hover:bg-white/[0.03] sm:px-7">
          <span className="hud-kicker">{liveArcs ? "What's running" : "What's brewing"}</span>
          <span className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
            {liveArcs ? `${liveArcs} live` : `${arcs.length} dramas`}{paper ? " · the Herald" : ""}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: more ? "rotate(180deg)" : undefined, transition: "transform .2s" }}><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </button>
        {more && (
          <div className="fade-in pb-4">
            <div className="border-y border-[var(--hud-border)] bg-black/25 px-4 py-3 sm:px-7">
              <div className="hud-kicker">{paper ? `The Solmere Herald · day ${paper.day}` : "The Solmere Herald"}</div>
              <p className="mt-1 text-[16px] leading-[1.25] text-[#efe9dc] sm:text-[19px]" style={{ fontFamily: "var(--font-serif)" }}>
                {paper?.headline
                  ? `“${clip(paper.headline, 120)}”`
                  : <span className="text-slate-400">The first edition prints at midnight. Until then the only record is what people say to each other.</span>}
              </p>
              {paper?.gossipCorner && <p className="mt-1.5 text-[11.5px] leading-snug text-slate-400"><span className="text-slate-500">Gossip corner — </span>{clip(paper.gossipCorner, 190)}</p>}
            </div>
            <div className="px-4 pt-3 sm:px-7">
              <div className="flex items-baseline justify-between gap-2">
                <div className="hud-kicker">{liveArcs ? "Running right now" : "Wound up and waiting"}</div>
                <span className="font-mono text-[10px] text-slate-500">
                  {liveArcs ? `${liveArcs} live` : "20 seeded dramas"}{seededIds.size ? ` · ${seededIds.size} still fusing` : ""}
                </span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {arcs.map((s) => (
                  <StoryCard key={s.id} title={s.title} summary={s.summary} actors={s.actors} status={seededIds.has(s.id) ? "fuse lit" : s.status} heat={s.heat} onPick={(id) => onClose(id)} showHeat={!seededIds.has(s.id)} />
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={() => setRecap(true)} className="hud-btn">Catch me up</button>
              </div>
            </div>
          </div>
        )}
      </section>

      <CatchUpOverlay open={recap} onClose={() => setRecap(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ArrivalCardInner() {
  const params = useSearchParams();
  const forced = params.get("intro") === "1";
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const setArrivalOpen = useArrival((s) => s.setOpen);

  useEffect(() => {
    // replay: a moment link (?m=) or a time link (?t=) goes straight to the scene
    const deep = hasDeepLink(params) || (IS_REPLAY && (params.has("m") || params.has("t")));
    setOpen(forced || (!deep && !seen()));
    setReady(true);
  }, [forced, params]);
  useEffect(() => { if (ready) setArrivalOpen(open); }, [ready, open, setArrivalOpen]);

  const close = useCallback((pickId?: string) => {
    markSeen();
    setOpen(false);
    const s = useWorld.getState();
    if (IS_REPLAY && !pickId) return; // the replay controller starts the opening scene
    if (pickId) {
      // on a phone the NPC card is a bottom sheet that would hide the town: just follow them
      if (!isNarrow()) s.selectNpc(pickId);
      s.follow(pickId);
    } else s.setCameraMode("director");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <DeepLinks />
      {ready && open && (IS_REPLAY ? <ReplayArrival onClose={close} /> : <Card onClose={close} />)}
    </>
  );
}

export default function ArrivalCard() {
  return (
    <Suspense fallback={null}>
      <ArrivalCardInner />
    </Suspense>
  );
}

/** Re-exported so the HUD can mount the recap trigger without importing from /arrival. */
export { CatchUpButton, CatchUpOverlay };
