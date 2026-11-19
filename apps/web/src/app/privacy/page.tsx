import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy — Solmere", robots: { index: false } };

/** Plain privacy note for the replay site (analytics and comments). */
export default function Privacy() {
  return (
    <main className="min-h-screen w-full bg-[#0b1020] px-4 py-8 text-slate-200">
      <article className="mx-auto max-w-[680px] space-y-4 text-[15px] leading-relaxed">
        <p className="text-[12px] tracking-[0.2em] uppercase text-slate-400"><Link href="/" className="hover:text-white">Solmere</Link> / Privacy</p>
        <h1 className="text-[28px] font-semibold text-white">Privacy</h1>
        <p>Solmere is a recorded month of an AI-run town. Watching it needs no account, and nothing you watch is sent anywhere.</p>
        <h2 className="pt-2 text-[17px] font-semibold text-white">Visitor numbers</h2>
        <p>To see how many people visit and what they find interesting, this site uses Google Analytics and Cloudflare Web Analytics. They record things like the pages you open, the buttons you tap (for example &ldquo;Best bit&rdquo; or a person&apos;s card), roughly where you are (country or city), your device type and where you came from. Google Analytics sets cookies for this; Cloudflare&apos;s does not. Neither is used for ads here. You can block both with any tracker blocker and the site still works.</p>
        <h2 className="pt-2 text-[17px] font-semibold text-white">Comments</h2>
        <p>If you post a comment, the name and text you type are public. To stop spam, the site keeps a scrambled version of your IP address for a day (it can&apos;t be turned back into the address) and uses Cloudflare Turnstile, which checks your browser without a puzzle. Comments with links or abuse are refused, and comments reported by several people are hidden.</p>
        <h2 className="pt-2 text-[17px] font-semibold text-white">Questions</h2>
        <p>Solmere is a personal project by Jitesh K Prasad: <a className="underline" href="https://jiteshkprasad.com">jiteshkprasad.com</a>.</p>
      </article>
    </main>
  );
}
