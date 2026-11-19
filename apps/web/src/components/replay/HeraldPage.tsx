/**
 * The Solmere Herald as a printed front page (server component, no store, no 3D).
 * Used by /herald/[day]. Phone first: one column under 640 px, a lead + sidebar
 * grid above it.
 */
import Link from "next/link";
import CommentsThread from "@/components/comments/CommentsThread";
import type { Newspaper } from "@npcworld/schema";

const INK = "#1d1a15";
const PAPER = "#f3ead6";
const RULE = "rgba(29,26,21,0.75)";

/** "bread 3 · fish 6 · grain 15.1666 · rent 48" → [["bread","3"], …] with tidy numbers */
function prices(col: string): Array<[string, string]> {
  return col.split("·").map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = x.match(/^(.*?)\s+(-?\d+(?:\.\d+)?)$/);
    if (!m) return [x, ""] as [string, string];
    const n = Number(m[2]);
    return [m[1], Number.isInteger(n) ? String(n) : n.toFixed(1)] as [string, string];
  });
}

export function watchHref(day: number) { return `/?t=${(day - 1) * 1440 + 7 * 60 + 30}`; }

export default function HeraldPage({ paper, prev, next }: { paper: Newspaper; prev: number | null; next: number | null }) {
  const [lead, ...rest] = paper.stories;
  const priceRows = prices(paper.pricesColumn ?? "");
  return (
    <main className="min-h-screen w-full px-2 py-3 sm:px-6 sm:py-8" style={{ background: "radial-gradient(120% 80% at 50% 0%, #2a241b, #14110d 70%)" }}>
      <nav className="mx-auto mb-3 flex max-w-[1000px] flex-wrap items-center gap-2 px-1 text-[12px] text-[#d9cfb8]">
        <Link href="/" className="tracking-[0.2em] uppercase hover:text-white">Solmere</Link>
        <span className="opacity-40">/</span>
        <Link href="/herald" className="hover:text-white">The Herald</Link>
        <span className="opacity-40">/</span>
        <span>Day {paper.day}</span>
        <span className="flex-1" />
        <Link href="/privacy" className="opacity-60 hover:text-white">Privacy</Link>
        <Link href={watchHref(paper.day)} className="rounded-md bg-[#ff3b5c] px-2.5 py-1 font-semibold text-white hover:brightness-110">Watch day {paper.day} in town →</Link>
      </nav>

      <article className="mx-auto max-w-[1000px] rounded-[3px] px-4 pt-4 pb-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:px-9 sm:pt-7"
        style={{ background: PAPER, color: INK, fontFamily: "var(--font-serif)", backgroundImage: "radial-gradient(140% 100% at 50% 0%, rgba(255,255,255,0.35), transparent 60%)" }}>
        {/* masthead */}
        <header className="text-center">
          <div className="flex items-center justify-between font-sans text-[9.5px] tracking-[0.18em] uppercase opacity-70 sm:text-[10.5px]">
            <span>Vol. I · No. {paper.day}</span><span className="hidden sm:inline">Solmere&rsquo;s only newspaper</span><span>One crown</span>
          </div>
          <h1 className="mt-1.5 text-[34px] leading-none font-bold tracking-[0.04em] sm:text-[64px]" style={{ fontVariant: "small-caps" }}>
            {paper.masthead || "The Solmere Herald"}
          </h1>
          <div className="mt-2 border-y-[3px] border-double py-1 font-sans text-[10px] tracking-[0.2em] uppercase sm:text-[11px]" style={{ borderColor: RULE }}>
            Day {paper.day} of the season · printed at midnight
          </div>
        </header>

        <h2 className="mt-4 text-center text-[27px] leading-[1.08] font-bold sm:mt-6 sm:text-[46px]">{paper.headline}</h2>

        <div className="mt-4 grid gap-5 sm:mt-6 md:grid-cols-[1fr_280px] md:gap-7">
          <div className="min-w-0">
            {lead && (
              <section>
                {lead.headline !== paper.headline && <h3 className="text-[20px] leading-tight font-bold sm:text-[24px]">{lead.headline}</h3>}
                <p className="mt-2 text-[15.5px] leading-[1.6] text-justify hyphens-auto first-letter:float-left first-letter:mt-1 first-letter:mr-2 first-letter:text-[52px] first-letter:leading-[0.8] first-letter:font-bold">
                  {lead.body}
                </p>
              </section>
            )}
            {rest.length > 0 && (
              <div className="mt-5 gap-6 border-t pt-4 sm:columns-2" style={{ borderColor: RULE, columnRule: `1px solid rgba(29,26,21,0.25)` }}>
                {rest.map((s, i) => (
                  <section key={i} className="mb-5 break-inside-avoid">
                    <h4 className="text-[17px] leading-tight font-bold">{s.headline}</h4>
                    <p className="mt-1.5 text-[14px] leading-[1.55] text-justify hyphens-auto">{s.body}</p>
                  </section>
                ))}
              </div>
            )}
          </div>

          <aside className="min-w-0 space-y-4 md:border-l md:pl-6" style={{ borderColor: "rgba(29,26,21,0.3)" }}>
            {paper.editorial && (
              <section>
                <div className="border-b pb-1 font-sans text-[10px] font-bold tracking-[0.22em] uppercase" style={{ borderColor: RULE }}>Editorial</div>
                <p className="mt-2 text-[14px] leading-[1.55] italic">{paper.editorial}</p>
              </section>
            )}
            {paper.gossipCorner && (
              <section className="rounded-[2px] p-3" style={{ background: "rgba(29,26,21,0.07)" }}>
                <div className="font-sans text-[10px] font-bold tracking-[0.22em] uppercase">Gossip corner</div>
                <p className="mt-1.5 text-[14px] leading-[1.5]">{paper.gossipCorner}</p>
              </section>
            )}
            {priceRows.length > 0 && (
              <section>
                <div className="border-b pb-1 font-sans text-[10px] font-bold tracking-[0.22em] uppercase" style={{ borderColor: RULE }}>Market prices · ₡</div>
                <table className="mt-1 w-full font-mono text-[12.5px]">
                  <tbody>
                    {priceRows.map(([k, v]) => (
                      <tr key={k} className="border-b border-dotted" style={{ borderColor: "rgba(29,26,21,0.3)" }}>
                        <td className="py-1 capitalize">{k}</td><td className="py-1 text-right">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </aside>
        </div>

        <footer className="mt-6 flex items-center justify-between border-t-[3px] border-double pt-2 font-sans text-[12px]" style={{ borderColor: RULE }}>
          {prev ? <Link href={`/herald/${prev}`} className="underline-offset-2 hover:underline">← Day {prev}</Link> : <span />}
          <Link href="/herald" className="opacity-70 hover:underline">All editions</Link>
          {next ? <Link href={`/herald/${next}`} className="underline-offset-2 hover:underline">Day {next} →</Link> : <span />}
        </footer>
      </article>

      <div className="mx-auto mt-4 max-w-[1000px] rounded-[3px] px-4 py-4 sm:px-9" style={{ background: PAPER }}>
        <CommentsThread target={`day-${paper.day}`} title={`Letters to the editor: what do you make of day ${paper.day}?`} tone="paper" />
      </div>
    </main>
  );
}
