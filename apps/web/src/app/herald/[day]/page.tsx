/**
 * /herald/[day] — one day's Herald as a front page, from the exported season's
 * papers.json. Fully static (generateStaticParams), so it works in the static export.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HeraldPage from "@/components/replay/HeraldPage";
import { SITE_URL, seasonPapers } from "@/lib/replay/seasonServer";

export const dynamicParams = false;

export function generateStaticParams() {
  const ps = seasonPapers();
  // Next needs at least one param for a static export; "0" renders a 404
  return ps.length ? ps.map((p) => ({ day: String(p.day) })) : [{ day: "0" }];
}

export async function generateMetadata({ params }: { params: Promise<{ day: string }> }): Promise<Metadata> {
  const { day } = await params;
  const p = seasonPapers().find((x) => x.day === Number(day));
  if (!p) return { title: "The Solmere Herald" };
  const title = `${p.headline} — The Solmere Herald, day ${p.day}`;
  const description = p.stories[0]?.body.slice(0, 190) ?? "";
  const image = `${SITE_URL}/og-replay/h-${p.day}.png`;
  return {
    metadataBase: new URL(SITE_URL), title, description,
    openGraph: { title, description, type: "article", url: `${SITE_URL}/herald/${p.day}`, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function Page({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  const papers = seasonPapers();
  const i = papers.findIndex((x) => x.day === Number(day));
  if (i < 0) notFound();
  return <HeraldPage paper={papers[i]} prev={papers[i - 1]?.day ?? null} next={papers[i + 1]?.day ?? null} />;
}
