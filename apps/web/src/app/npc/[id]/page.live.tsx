/**
 * /npc/[id] — a shareable character page. Server-rendered, so a pasted link is
 * a real page (no 3D scene in the bundle) and works when the engine is down:
 * the cast, relationships and dramas come from content/*.json, the live state
 * from the engine when it answers. OWNED BY THE STORY/SHARE AGENT.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Storyline } from "@npcworld/schema";
import {
  CAST, CAST_BY_ID, SEEDED_CONFLICTS, TOWN_NAME, atlasTile, clip, dramaLine, firstName, fmtClock, fmtMoney,
  locationName, moodColor, npcName, npcShareDescription, npcShareTitle, relColor, topRelationships,
} from "@/lib/share";
import { atlasIndex, currentDay, npcDossier, siteOrigin, storylines as fetchStorylines } from "@/lib/shareServer";
import { Portrait } from "@/components/arrival/Portrait";
import { Chip, Flame, OfflineNote, Panel, ShareShell, SignedBar } from "@/components/arrival/ShareUi";

export const dynamic = "force-dynamic";

export function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!CAST_BY_ID[id]) return { title: `Unknown resident — ${TOWN_NAME}` };
  const [arcs, origin] = await Promise.all([fetchStorylines(), siteOrigin()]);
  const line = dramaLine(id, { storylines: arcs });
  const title = npcShareTitle(id);
  const description = npcShareDescription(id, line);
  const image = `${origin}/api/og/npc/${id}`;
  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: { title, description, url: `${origin}/npc/${id}`, siteName: `${TOWN_NAME} — NPC World`, type: "profile", images: [{ url: image, width: 1200, height: 630, alt: npcName(id) }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

const WEALTH: Record<string, string> = {
  wealthy: "wealthy", comfortable: "comfortable", getting_by: "getting by", tight: "money's tight", broke: "broke",
};

function StatusDot({ mood }: { mood?: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: moodColor(mood) }} />;
}

export default async function NpcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cast = CAST_BY_ID[id];
  if (!cast) notFound();

  const [dossier, arcs, index, day] = await Promise.all([npcDossier(id), fetchStorylines(), atlasIndex(), currentDay()]);
  const tile = atlasTile(index, id);
  const state = dossier.state;
  const offline = !dossier.online;

  const rels = topRelationships(id, dossier.relationships, 8);
  const memories = [...dossier.memories].sort((a, b) => b.day - a.day || b.hour - a.hour).slice(0, 6);
  const confessionals = [...dossier.confessionals].sort((a, b) => b.day - a.day).slice(0, 2);
  const mine: Storyline[] = arcs.filter((s) => s.actors.includes(id)).sort((a, b) => b.heat - a.heat);
  const seeded = SEEDED_CONFLICTS.filter((c) => c.actors.includes(id));

  return (
    <ShareShell crumb={<>Resident{day !== null ? ` · day ${day}` : ""}</>}>
      {offline && (
        <OfflineNote>
          The simulation isn&rsquo;t reachable right now, so this is who {firstName(id)} <em>is</em> rather than what
          they&rsquo;re doing. Their relationships and the dramas they&rsquo;re tangled in are the ones the town started with.
        </OfflineNote>
      )}

      {/* hero */}
      <header className="glass flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5">
        <Portrait id={id} tile={tile} size={132} rounded="18px" className="shadow-lg" />
        <div className="min-w-0 flex-1">
          <div className="hud-kicker">{cast.jobTitle}</div>
          <h1 className="mt-0.5 text-[30px] leading-none font-semibold tracking-[-0.01em] text-white sm:text-[36px]" style={{ fontFamily: "var(--font-serif)" }}>{cast.name}</h1>
          <p className="mt-2 max-w-[58ch] text-[12.5px] leading-relaxed text-slate-400">{/[.!?]$/.test(cast.origin) ? cast.origin : `${cast.origin}.`}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip>{cast.age} years old</Chip>
            <Chip>{cast.job}</Chip>
            <Chip title="wealth class at the start of the simulation">{WEALTH[cast.wealthClass] ?? cast.wealthClass}</Chip>
            {cast.traits.map((t) => <Chip key={t} color="#3987e5">{t}</Chip>)}
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <Link href={`/?follow=${id}`}
              className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110"
              style={{ background: "var(--hud-live)", boxShadow: "0 6px 20px rgba(255,59,92,0.22)" }}>
              Watch them live →
            </Link>
            {state?.wallet !== undefined && (
              <span className="hud-chip" title="wallet">purse {fmtMoney(state.wallet)}{state.debt ? ` · ${fmtMoney(state.debt)} owed` : ""}</span>
            )}
          </div>
        </div>
      </header>

      {/* right now */}
      {state && (
        <div className="glass mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] text-white">
            <StatusDot mood={state.mood} />
            <span className="font-medium">{clip(state.activity || state.action, 90)}</span>
            {state.locationId && <span className="text-slate-400">· {locationName(state.locationId)}</span>}
          </span>
          <span className="hud-chip" style={{ color: moodColor(state.mood) }}>{state.mood}</span>
          {typeof state.happiness === "number" && <span className="font-mono text-[11px] text-slate-500">happiness {Math.round(state.happiness)}/100</span>}
          {state.thought && <p className="w-full text-[12.5px] leading-snug text-slate-300 italic">“{clip(state.thought, 180)}”</p>}
        </div>
      )}

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[1.35fr_1fr]">
        <div className="min-w-0 space-y-3">
          <Panel title="What drives them">
            <dl className="space-y-2.5">
              <div>
                <dt className="hud-kicker" style={{ fontSize: 9 }}>Wants</dt>
                <dd className="text-[13px] leading-snug text-slate-200">{cast.want}</dd>
              </div>
              <div>
                <dt className="hud-kicker" style={{ fontSize: 9 }}>Fears</dt>
                <dd className="text-[13px] leading-snug text-slate-200">{cast.fear}</dd>
              </div>
              {cast.opinions.length > 0 && (
                <div>
                  <dt className="hud-kicker" style={{ fontSize: 9 }}>Says out loud</dt>
                  <dd className="space-y-1">
                    {cast.opinions.map((o) => <p key={o} className="text-[12.5px] leading-snug text-slate-300">“{o}”</p>)}
                  </dd>
                </div>
              )}
            </dl>
          </Panel>

          <Panel title={mine.length ? "Storylines they're in" : "Dramas they were dealt"} right={<span className="font-mono text-[10px] text-slate-500">{(mine.length || seeded.length) || 0}</span>}>
            {mine.length ? (
              <ul className="space-y-2.5">
                {mine.map((s) => (
                  <li key={s.id}>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-semibold text-white">{s.title}</h3>
                      <Chip color={s.status === "climax" ? "#ff3b5c" : s.status === "active" ? "#3987e5" : s.status === "resolved" ? "#199e70" : "#94a3b8"}>{s.status}</Chip>
                      <span className="ml-auto font-mono text-[10px] text-slate-500">heat {Math.round(s.heat)}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-slate-400">{s.summary}</p>
                    <p className="mt-1 flex flex-wrap gap-1">
                      {s.actors.filter((a) => a !== id).slice(0, 5).map((a) => (
                        <Link key={a} href={`/npc/${a}`} className="hud-chip hover:bg-white/10" style={{ color: "#cbd5e1" }}>{firstName(a)}</Link>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            ) : seeded.length ? (
              <ul className="space-y-2.5">
                {seeded.map((c) => (
                  <li key={c.id}>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-semibold text-white">{c.title}</h3>
                      <Chip>{c.domain}</Chip>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-slate-400">{c.fuse}</p>
                    <p className="mt-1 flex flex-wrap gap-1">
                      {c.actors.filter((a) => a !== id).map((a) => (
                        <Link key={a} href={`/npc/${a}`} className="hud-chip hover:bg-white/10" style={{ color: "#cbd5e1" }}>{firstName(a)}</Link>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-slate-500">No storyline has caught them yet. Give it a day.</p>
            )}
          </Panel>

          {memories.length > 0 && (
            <Panel title="What they remember">
              <ul className="space-y-1.5">
                {memories.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 text-[12px] leading-snug">
                    <span className="mt-px w-[52px] shrink-0 font-mono text-[10px] text-slate-500">D{m.day} {fmtClock(m.hour, 0)}</span>
                    <span className="min-w-0 flex-1 text-slate-300">{m.text}</span>
                    <Flame drama={m.importance} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <Panel title="Who they have to live with" right={<span className="font-mono text-[10px] text-slate-500">{rels.length}</span>}>
            {rels.length ? (
              <ul className="space-y-2.5">
                {rels.map((r) => (
                  <li key={r.other}>
                    <div className="flex items-center gap-2">
                      <Link href={`/npc/${r.other}`} className="flex min-w-0 items-center gap-2 hover:opacity-80">
                        <Portrait id={r.other} tile={atlasTile(index, r.other)} size={24} />
                        <span className="truncate text-[12.5px] text-slate-200">{npcName(r.other)}</span>
                      </Link>
                      <span className="ml-auto shrink-0 font-mono text-[10px]" style={{ color: r.affinity < 0 ? "var(--hud-neg)" : "var(--hud-pos)" }}>
                        {r.affinity > 0 ? "+" : ""}{Math.round(r.affinity)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="w-[58px] shrink-0 text-[10px] uppercase tracking-wider" style={{ color: relColor(r.type) }}>{r.type}</span>
                      <SignedBar value={r.affinity / 100} />
                    </div>
                    {r.note && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{r.note}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-slate-500">Nobody close enough to record. That is its own kind of story.</p>
            )}
          </Panel>

          {confessionals.length > 0 && (
            <Panel title="In the confessional chair">
              <div className="space-y-3">
                {confessionals.map((c, i) => (
                  <blockquote key={i} className="border-l-2 pl-3" style={{ borderColor: moodColor(c.mood) }}>
                    <p className="text-[13px] leading-relaxed text-slate-200" style={{ fontFamily: "var(--font-serif)" }}>“{c.text}”</p>
                    <footer className="mt-1 font-mono text-[10px] text-slate-500">day {c.day} · {c.mood}</footer>
                  </blockquote>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Elsewhere in town">
            <div className="flex flex-wrap gap-1.5">
              {CAST.filter((c) => c.id !== id && c.household === cast.household).map((c) => (
                <Link key={c.id} href={`/npc/${c.id}`} className="hud-chip hover:bg-white/10" style={{ color: "#cbd5e1" }}>
                  <Portrait id={c.id} tile={atlasTile(index, c.id)} size={14} />{firstName(c.id)}
                </Link>
              ))}
              <Link href={`/?panel=society`} className="hud-chip hover:bg-white/10">the whole cast →</Link>
            </div>
          </Panel>
        </div>
      </div>
    </ShareShell>
  );
}
