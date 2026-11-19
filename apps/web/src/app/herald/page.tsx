/** /herald — every edition of the season's Herald, newest last. Static. */
import type { Metadata } from "next";
import Link from "next/link";
import { seasonPapers } from "@/lib/replay/seasonServer";

export const metadata: Metadata = { title: "The Solmere Herald — every edition", description: "Thirty days of a harbour town run by AI, as its newspaper reported them." };

export default function HeraldIndex() {
  const papers = seasonPapers();
  return (
    <main className="min-h-screen w-full px-3 py-5 sm:px-6 sm:py-10" style={{ background: "radial-gradient(120% 80% at 50% 0%, #2a241b, #14110d 70%)" }}>
      <div className="mx-auto max-w-[760px] rounded-[3px] px-4 py-5 sm:px-8 sm:py-7" style={{ background: "#f3ead6", color: "#1d1a15", fontFamily: "var(--font-serif)" }}>
        <div className="flex items-center justify-between font-sans text-[11px] tracking-[0.18em] uppercase">
          <Link href="/" className="hover:underline">← Solmere</Link><span className="opacity-60">Season 1</span>
        </div>
        <h1 className="mt-2 text-center text-[36px] leading-none font-bold sm:text-[54px]" style={{ fontVariant: "small-caps" }}>The Solmere Herald</h1>
        <div className="mt-2 border-y-[3px] border-double py-1 text-center font-sans text-[11px] tracking-[0.2em] uppercase" style={{ borderColor: "rgba(29,26,21,.75)" }}>Every edition</div>
        {papers.length === 0 ? (
          <p className="mt-6 text-center">No season has been exported yet.</p>
        ) : (
          <ol className="mt-3 divide-y" style={{ borderColor: "rgba(29,26,21,.25)" }}>
            {papers.map((p) => (
              <li key={p.day} className="border-[rgba(29,26,21,.25)]">
                <Link href={`/herald/${p.day}`} className="flex items-baseline gap-3 py-2.5 hover:bg-black/[0.04]">
                  <span className="w-12 shrink-0 font-sans text-[11px] tracking-widest uppercase opacity-60">Day {p.day}</span>
                  <span className="text-[16px] leading-snug font-bold sm:text-[18px]">{p.headline}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
