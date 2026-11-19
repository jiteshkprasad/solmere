"use client";
import { track } from "@/lib/analytics";

/** Share (or copy) the permalink of a manifest moment. Returns a short status for a toast. */
export async function shareMoment(i: number, title: string, text: string): Promise<"shared" | "copied" | "failed"> {
  track("share_moment", { moment: i });
  const url = `${window.location.origin}/moment/${i}`;
  try {
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: `${title} — Solmere`, text, url });
      return "shared";
    }
  } catch { /* cancelled: fall through to copy */ }
  try { await navigator.clipboard.writeText(url); return "copied"; } catch { return "failed"; }
}
