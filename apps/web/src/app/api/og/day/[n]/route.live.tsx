/**
 * 1200×630 share card for one sim-day: the Herald's headline and the faces of
 * the three people it was about. OWNED BY THE STORY/SHARE AGENT.
 */
import { ImageResponse } from "next/og";
import { SEEDED_CONFLICTS, TOWN_NAME, clip, dayFaces, firstName, npcName } from "@/lib/share";
import { confessionals as fetchConfessionals, eventsOnDay, ogPortrait, paper as fetchPaper } from "@/lib/shareServer";
import { INK, MUTED, OG_SIZE, OgFace, OgFooter, OgPill, ogBackground } from "@/components/arrival/ogParts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const day = Number(n);
  const valid = Number.isInteger(day) && day >= 1;

  const [paper, events, confs] = valid
    ? await Promise.all([
        fetchPaper(day).catch(() => null),
        eventsOnDay(day).catch(() => []),
        fetchConfessionals(day).catch(() => []),
      ])
    : [null, [], []];

  // with no record for this day at all, the card still has to show people with problems
  const fallback = SEEDED_CONFLICTS[(Math.max(1, day) - 1) % Math.max(1, SEEDED_CONFLICTS.length)];
  const live = dayFaces(events, confs, 3);
  const faces = live.length ? live : (fallback?.actors ?? []).slice(0, 3);
  const bare = live.length === 0 && !paper;
  const headline = paper?.headline
    ? clip(paper.headline, 118)
    : valid
      ? `Day ${day} in ${TOWN_NAME}`
      : TOWN_NAME;
  const kicker = paper?.stories?.[0]?.headline
    ? clip(paper.stories[0].headline, 90)
    : bare && fallback ? clip(fallback.fuse, 120) : "";
  const headSize = headline.length > 90 ? 54 : headline.length > 58 ? 64 : 76;

  const tiles = await Promise.all(faces.map((f) => ogPortrait(f)));

  return new ImageResponse(
    (
      <div style={{ ...ogBackground, padding: 60 }}>
        <div style={{ display: "flex", width: "100%", height: "100%", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <OgPill>{valid ? `DAY ${day}` : "SOLMERE"}</OgPill>
            <div style={{ display: "flex", fontSize: 24, letterSpacing: 6, color: MUTED, fontWeight: 600 }}>
              THE {TOWN_NAME.toUpperCase()} HERALD
            </div>
          </div>

          <div style={{
            display: "flex", marginTop: 30, paddingBottom: 26,
            borderBottom: "1px solid rgba(148,163,184,0.22)",
          }}>
            <div style={{ display: "flex", fontSize: headSize, fontWeight: 700, color: "#fff", lineHeight: 1.12 }}>
              {headline}
            </div>
          </div>

          {kicker && (
            <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: INK, lineHeight: 1.3 }}>{kicker}</div>
          )}

          {faces.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 34 }}>
              {faces.map((f, i) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <OgFace id={f} src={tiles[i]} size={116} name={npcName(f)} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: "#fff" }}>{firstName(f)}</div>
                    <div style={{ display: "flex", fontSize: 20, color: MUTED }}>{i === 0 ? "at the centre" : "caught up in it"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <OgFooter
            left={`${TOWN_NAME} — 50 people, run by AI`}
            right={events.length ? `${events.length} things happened` : bare && fallback ? fallback.title : "one day in a living town"}
          />
        </div>
      </div>
    ),
    { ...OG_SIZE, headers: { "cache-control": "public, max-age=60, stale-while-revalidate=600" } },
  );
}
