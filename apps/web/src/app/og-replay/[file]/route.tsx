/**
 * Share cards for the replay, rendered once at build time (static export friendly):
 *   /og-replay/m-<i>.png   a moment of the season
 *   /og-replay/h-<day>.png that day's Herald
 */
import { ImageResponse } from "next/og";
import { seasonManifest, seasonPapers } from "@/lib/replay/seasonServer";
import { KIND_LABEL, kindColor, momentWhen } from "@/lib/replay/moments";
import { clip, firstName, npcName } from "@/lib/share";
import { ogPortrait } from "@/lib/shareServer";
import { INK, MUTED, OG_SIZE, OgFace, OgFooter, OgPill, ogBackground } from "@/components/arrival/ogParts";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  const m = seasonManifest();
  const files = ["home.png", ...(m?.moments ?? []).map((_, i) => `m-${i}.png`), ...seasonPapers().map((p) => `h-${p.day}.png`)];
  return (files.length ? files : ["m-0.png"]).map((file) => ({ file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const mm = file === "home.png" ? ["home.png", "s", "0"] : file.match(/^([mh])-(\d+)\.png$/);
  if (!mm) return new Response("not found", { status: 404 });
  const n = Number(mm[2]);

  let pill = "SOLMERE", pillColor: string | undefined, kicker = "", headline = "Solmere", body = "", faces: string[] = [], right = "season 1";
  if (mm[1] === "s") {
    const m = seasonManifest();
    pill = "SEASON 1"; pillColor = "#a78bfa"; kicker = "30 DAYS · 50 PEOPLE · RUN BY AI"; headline = "A month in Solmere";
    body = "50 people with their own jobs, debts and secrets. Everything they said, chose and voted came from AI. It ends in an election.";
    const cands = ((m?.election as { candidates?: Array<{ npcId?: string } | string> } | null)?.candidates ?? []).map((c) => (typeof c === "string" ? c : c.npcId)).filter((x): x is string => !!x);
    faces = [...new Set([...(m?.chapters[0]?.actors ?? []), ...cands])].slice(0, 3); right = "watch the season";
  } else if (mm[1] === "m") {
    const m = seasonManifest()?.moments[n];
    if (!m) return new Response("not found", { status: 404 });
    pill = (KIND_LABEL[m.kind] ?? m.kind).toUpperCase(); pillColor = kindColor(m.kind);
    kicker = momentWhen(m).toUpperCase(); headline = m.title; body = m.text; faces = m.actors.slice(0, 3); right = "watch the moment";
  } else {
    const p = seasonPapers().find((x) => x.day === n);
    if (!p) return new Response("not found", { status: 404 });
    pill = `DAY ${p.day}`; kicker = "THE SOLMERE HERALD"; headline = p.headline; body = p.stories[0]?.body ?? ""; right = "the front page";
  }
  // the default OG font has no ₡ glyph (and fetching one fails offline): spell the currency out
  const crowns = (t: string) => t.replace(/₡\s?([\d,.]+)/g, "$1 crowns").replace(/₡/g, "");
  headline = crowns(headline); body = crowns(body);
  const head = clip(headline, 110);
  const headSize = head.length > 80 ? 54 : head.length > 48 ? 64 : 78;
  const tiles = await Promise.all(faces.map((f) => ogPortrait(f)));

  return new ImageResponse(
    (
      <div style={{ ...ogBackground, padding: 60 }}>
        <div style={{ display: "flex", width: "100%", height: "100%", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <OgPill color={pillColor}>{pill}</OgPill>
            <div style={{ display: "flex", fontSize: 24, letterSpacing: 5, color: MUTED, fontWeight: 600 }}>{kicker}</div>
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: headSize, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>{head}</div>
          {body && <div style={{ display: "flex", marginTop: 20, fontSize: 30, color: INK, lineHeight: 1.32 }}>{clip(body, faces.length ? 150 : 230)}</div>}
          {faces.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 30 }}>
              {faces.map((f, i) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <OgFace id={f} src={tiles[i]} size={96} name={npcName(f)} />
                  <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: "#fff" }}>{firstName(f)}</div>
                </div>
              ))}
            </div>
          )}
          <OgFooter left="Solmere — a month in a town run by AI" right={right} />
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
