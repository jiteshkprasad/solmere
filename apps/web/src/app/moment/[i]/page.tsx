/**
 * /moment/[i] — the share link for one moment of the season. A static page whose
 * <head> carries the preview (title, text, OG card); in a browser it hands over to
 * the replay at that moment (/?m=i). Fully static for the export.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL, seasonManifest } from "@/lib/replay/seasonServer";
import { KIND_LABEL, kindColor, momentWhen } from "@/lib/replay/moments";
import { npcName } from "@/lib/share";
import Handoff from "./Handoff";

export const dynamicParams = false;

export function generateStaticParams() {
  const m = seasonManifest();
  return m?.moments.length ? m.moments.map((_, i) => ({ i: String(i) })) : [{ i: "0" }];
}

const get = (i: string) => seasonManifest()?.moments[Number(i)] ?? null;

export async function generateMetadata({ params }: { params: Promise<{ i: string }> }): Promise<Metadata> {
  const { i } = await params;
  const m = get(i);
  if (!m) return { title: "Solmere" };
  const title = `${m.title} — Solmere, ${momentWhen(m).toLowerCase()}`;
  const description = m.text;
  const image = `${SITE_URL}/og-replay/m-${i}.png`;
  return {
    metadataBase: new URL(SITE_URL), title, description,
    openGraph: { title, description, type: "article", url: `${SITE_URL}/moment/${i}`, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function MomentPage({ params }: { params: Promise<{ i: string }> }) {
  const { i } = await params;
  const m = get(i);
  if (!m) notFound();
  const to = `/?m=${i}`;
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#0b1020] p-4 text-slate-100">
      <Handoff to={to} />
      <div className="glass-strong w-full max-w-[520px] rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <span className="rounded px-1.5 py-px text-[10px] font-bold tracking-[0.14em] text-white uppercase" style={{ background: kindColor(m.kind) }}>{KIND_LABEL[m.kind] ?? m.kind}</span>
          <span className="font-mono text-[11px] text-slate-400">Solmere · {momentWhen(m)}</span>
        </div>
        <h1 className="mt-2 text-[26px] leading-tight font-semibold text-white" style={{ fontFamily: "var(--font-serif)" }}>{m.title}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-300">{m.text}</p>
        <p className="mt-2 text-[12px] text-slate-500">{m.actors.map((a) => npcName(a)).join(" · ")}</p>
        <Link href={to} className="mt-4 inline-block rounded-lg bg-[var(--hud-live)] px-4 py-2 text-[14px] font-semibold text-white">Watch this moment →</Link>
      </div>
    </main>
  );
}
