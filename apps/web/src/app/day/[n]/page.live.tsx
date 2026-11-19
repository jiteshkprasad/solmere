/**
 * /day/[n] — that sim-day's Herald front page, the day's biggest events and its
 * confessionals. Server-rendered so the link previews and works with the 3D
 * scene nowhere in sight. OWNED BY THE STORY/SHARE AGENT.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TOWN_NAME, atlasTile, clip, dayFaces, dayShareTitle, firstName, fmtClock, locationName, moodColor, npcName } from "@/lib/share";
import { atlasIndex, confessionals as fetchConfessionals, currentDay, eventsOnDay, paper as fetchPaper, siteOrigin } from "@/lib/shareServer";
import { Portrait } from "@/components/arrival/Portrait";
import { Flame, OfflineNote, Panel, ShareShell } from "@/components/arrival/ShareUi";

export const dynamic = "force-dynamic";

const parseDay = (n: string): number | null => {
  const d = Number(n);
  return Number.isInteger(d) && d >= 1 && d <= 100000 ? d : null;
};

export async function generateMetadata({ params }: { params: Promise<{ n: string }> }): Promise<Metadata> {
  const { n } = await params;
  const day = parseDay(n);
  if (day === null) return { title: `${TOWN_NAME}` };
  const [p, origin] = await Promise.all([fetchPaper(day), siteOrigin()]);
  const title = dayShareTitle(day, p);
  const description = p?.stories?.[0]?.body
    ? clip(p.stories[0].body, 195)
    : `Day ${day} in ${TOWN_NAME}: 50 people, no script, and whatever they did to each other today.`;
  const image = `${origin}/api/og/day/${day}`;
  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: { title, description, url: `${origin}/day/${day}`, siteName: `${TOWN_NAME} — NPC World`, type: "article", images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function DayPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const day = parseDay(n);
  if (day === null) notFound();

  const [paper, events, confessionals, index, today] = await Promise.all([
    fetchPaper(day), eventsOnDay(day), fetchConfessionals(day), atlasIndex(), currentDay(),
  ]);

  const beats = [...events].sort((a, b) => b.drama - a.drama || b.seq - a.seq).slice(0, 12).sort((a, b) => a.seq - b.seq);
  const faces = dayFaces(events, confessionals, 5);
  const empty = !paper && !events.length && !confessionals.length;

  return (
    <ShareShell crumb={<>Day {day}</>}>
      {empty && (
        <OfflineNote>
          Nothing is on the record for day {day} — either the simulation hasn&rsquo;t reached it yet, or the engine
          isn&rsquo;t reachable from here. The town itself is still there.
        </OfflineNote>
      )}

      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="hud-kicker">{TOWN_NAME} · one day</div>
          <h1 className="text-[32px] leading-none font-semibold tracking-[-0.01em] text-white sm:text-[40px]" style={{ fontFamily: "var(--font-serif)" }}>Day {day}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          {day > 1 && <Link href={`/day/${day - 1}`} className="hud-btn">← day {day - 1}</Link>}
          {(today === null || day < today) && <Link href={`/day/${day + 1}`} className="hud-btn">day {day + 1} →</Link>}
        </div>
      </header>

      {faces.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="hud-kicker">Today it was about</span>
          {faces.map((f) => (
            <Link key={f} href={`/npc/${f}`} className="hud-chip hover:bg-white/10" style={{ color: "#cbd5e1" }}>
              <Portrait id={f} tile={atlasTile(index, f)} size={16} />{npcName(f)}
            </Link>
          ))}
        </div>
      )}

      <div className="grid items-start gap-3 lg:grid-cols-[1.25fr_1fr]">
        {/* the paper */}
        <article className="glass overflow-hidden rounded-xl" style={{ background: "rgba(24,22,18,0.82)" }}>
          {paper ? (
            <div className="font-serif text-[#efe9dc]" style={{ fontFamily: "var(--font-serif)" }}>
              <header className="border-b-2 border-[#efe9dc]/70 px-5 pt-4 pb-2 text-center">
                <div className="text-[24px] leading-none font-bold tracking-[0.12em] uppercase" style={{ fontVariant: "small-caps" }}>{paper.masthead || `The ${TOWN_NAME} Herald`}</div>
                <div className="mt-1.5 flex items-center justify-between border-t border-[#efe9dc]/30 pt-1 font-sans text-[10px] tracking-widest uppercase text-[#cfc7b5]">
                  <span>Day {paper.day}</span><span>{TOWN_NAME}&rsquo;s only newspaper</span><span>1 crown</span>
                </div>
              </header>
              <h2 className="px-5 pt-4 pb-2 text-[26px] leading-[1.1] font-bold text-white sm:text-[30px]">{paper.headline}</h2>
              <div className="space-y-3 px-5 pb-4">
                {paper.stories.map((s, i) => (
                  <section key={i} className={i > 0 ? "border-t border-[#efe9dc]/20 pt-3" : ""}>
                    <h3 className="text-[15px] leading-tight font-bold text-[#f7f2e6]">{s.headline}</h3>
                    <p className="mt-1 text-[13px] leading-[1.55] text-[#e2dccb]">{s.body}</p>
                  </section>
                ))}
              </div>
              {paper.editorial && (
                <div className="mx-5 mb-4 border-l-2 border-[#efe9dc]/50 pl-3">
                  <div className="font-sans text-[9px] tracking-widest uppercase text-[#cfc7b5]">Editorial</div>
                  <p className="text-[12.5px] leading-[1.55] text-[#e2dccb]">{paper.editorial}</p>
                </div>
              )}
              <div className="mx-5 mb-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded border border-[#efe9dc]/30 bg-black/30 p-2.5">
                  <div className="mb-1 font-sans text-[9px] tracking-widest uppercase text-[#cfc7b5]">Market prices</div>
                  <pre className="font-mono text-[11px] leading-[1.45] whitespace-pre-wrap text-[#e2dccb]">{paper.pricesColumn}</pre>
                </div>
                <div className="rounded bg-[#efe9dc]/[0.07] p-2.5">
                  <div className="mb-1 font-sans text-[9px] tracking-widest uppercase text-[#cfc7b5]">Gossip corner</div>
                  <p className="text-[12px] leading-[1.5] italic text-[#efe9dc]">{paper.gossipCorner}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <div className="hud-kicker">The {TOWN_NAME} Herald</div>
              <p className="mx-auto mt-2 max-w-[38ch] text-[13px] leading-relaxed text-slate-400">
                No edition was printed for day {day}. The Herald goes to press at midnight — if the day is still running,
                come back tomorrow.
              </p>
            </div>
          )}
        </article>

        {/* the day in full */}
        <div className="min-w-0 space-y-3">
          <Panel title="The day in full" right={<span className="font-mono text-[10px] text-slate-500">{events.length ? `top ${beats.length} of ${events.length}` : "—"}</span>}>
            {beats.length ? (
              <ol className="space-y-1.5">
                {beats.map((e) => (
                  <li key={e.id} className="flex items-start gap-2">
                    <span className="mt-[3px] w-[34px] shrink-0 font-mono text-[10px] text-slate-500">{fmtClock(e.hour, e.minute)}</span>
                    <span className="mt-px flex shrink-0 items-center -space-x-1.5">
                      {e.actors.slice(0, 2).map((a) => (
                        <Link key={a} href={`/npc/${a}`}><Portrait id={a} tile={atlasTile(index, a)} size={20} /></Link>
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 text-[12px] leading-snug text-slate-200">
                      {e.text}
                      {locationName(e.locationId) && !e.text.includes(locationName(e.locationId)) && (
                        <span className="text-slate-500"> · {locationName(e.locationId)}</span>
                      )}
                    </span>
                    <Flame drama={e.drama} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[12px] text-slate-500">No events recorded for this day.</p>
            )}
          </Panel>

          {confessionals.length > 0 && (
            <Panel title="Confessionals" right={<span className="font-mono text-[10px] text-slate-500">{confessionals.length}</span>}>
              <div className="space-y-3">
                {confessionals.slice(0, 5).map((c, i) => (
                  <figure key={i} className="border-l-2 pl-3" style={{ borderColor: moodColor(c.mood) }}>
                    <blockquote className="text-[12.5px] leading-relaxed text-slate-200" style={{ fontFamily: "var(--font-serif)" }}>“{clip(c.text, 260)}”</blockquote>
                    <figcaption className="mt-1 flex items-center gap-1.5">
                      <Link href={`/npc/${c.npcId}`} className="flex items-center gap-1.5 hover:opacity-80">
                        <Portrait id={c.npcId} tile={atlasTile(index, c.npcId)} size={16} />
                        <span className="text-[11px] text-slate-400">{firstName(c.npcId)}</span>
                      </Link>
                      <span className="font-mono text-[10px] text-slate-600">· {c.mood}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </Panel>
          )}

          <Panel>
            <Link href={`/?day=${day}`} className="text-[12.5px] font-medium text-slate-200 hover:text-white">
              Open day {day} in the live town →
            </Link>
          </Panel>
        </div>
      </div>
    </ShareShell>
  );
}
