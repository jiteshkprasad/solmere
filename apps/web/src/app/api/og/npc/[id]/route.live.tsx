/**
 * 1200×630 share card for one resident: their face, their name and job, and one
 * line of live drama. Falls back to initials on a hashed colour when the
 * portrait tiles haven't been generated, and to the seeded conflict text when
 * the engine is down. OWNED BY THE STORY/SHARE AGENT.
 */
import { ImageResponse } from "next/og";
import { CAST_BY_ID, TOWN_NAME, clip, dramaLine, npcName } from "@/lib/share";
import { currentDay, npcDossier, ogPortrait, storylines as fetchStorylines } from "@/lib/shareServer";
import { INK, LIVE, MUTED, OG_SIZE, OgFace, OgFooter, OgPill, ogBackground } from "@/components/arrival/ogParts";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cast = CAST_BY_ID[id];
  const name = npcName(id);

  const [src, arcs, dossier, day] = await Promise.all([
    ogPortrait(id),
    fetchStorylines().catch(() => []),
    npcDossier(id).catch(() => ({ online: false, state: null, memories: [], relationships: [], confessionals: [] })),
    currentDay().catch(() => null),
  ]);

  const line = clip(dramaLine(id, { storylines: arcs, npcs: dossier.state ? { [id]: dossier.state } : {} }), 160);
  const job = cast?.jobTitle ?? dossier.state?.jobTitle ?? "";
  const nameSize = name.length > 22 ? 62 : name.length > 16 ? 72 : 82;

  return new ImageResponse(
    (
      <div style={{ ...ogBackground, padding: 64 }}>
        <div style={{ display: "flex", width: "100%", height: "100%", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <OgPill>{day ? `DAY ${day}` : "LIVE"}</OgPill>
            <div style={{ display: "flex", fontSize: 24, letterSpacing: 6, color: MUTED, fontWeight: 600 }}>
              {TOWN_NAME.toUpperCase()}
            </div>
          </div>

          <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 48, marginTop: 24 }}>
            <OgFace id={id} src={src} size={320} radius={28} name={name} />
            <div style={{ display: "flex", flexDirection: "column", width: 660 }}>
              <div style={{ display: "flex", fontSize: nameSize, fontWeight: 700, color: "#fff", lineHeight: 1.05 }}>{name}</div>
              {job && <div style={{ display: "flex", marginTop: 10, fontSize: 30, color: MUTED }}>{job}</div>}
              {line && (
                <div style={{
                  display: "flex", marginTop: 26, paddingLeft: 20, fontSize: 29, lineHeight: 1.35, color: INK,
                  borderLeft: `4px solid ${LIVE}`,
                }}>{line}</div>
              )}
            </div>
          </div>

          <OgFooter
            left={`${TOWN_NAME} — 50 people, run by AI`}
            right={cast ? `${cast.age} · ${cast.job}` : ""}
          />
        </div>
      </div>
    ),
    { ...OG_SIZE, headers: { "cache-control": "public, max-age=60, stale-while-revalidate=600" } },
  );
}

export const dynamic = "force-dynamic";
