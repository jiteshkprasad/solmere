/**
 * Deep links into the live view. Mounted from ArrivalCard (the only file on the
 * `/` page this agent owns), so a pasted link lands you somewhere specific:
 *
 *   /?follow=<npcId>   follow-cam + character card on that person
 *   /?panel=paper      open a HUD panel (feed|paper|economy|politics|society|
 *                      confessionals|storylines)
 *   /?day=<n>          open the Herald and ask it for that day
 *   /?intro=1          force the arrival card back (handled in ArrivalCard)
 *
 * OWNED BY THE STORY/SHARE AGENT.
 */
"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useWorld, type Panel } from "@/lib/store";
import { CAST_BY_ID } from "@/lib/share";

const PANELS: Panel[] = ["feed", "paper", "economy", "politics", "society", "confessionals", "storylines"];

/** Event other panels can listen for to jump to a sim day (see NOTES-arrival.md). */
export const DAY_EVENT = "solmere:show-day";

export function hasDeepLink(params: URLSearchParams | null): boolean {
  if (!params) return false;
  return !!(params.get("follow") || params.get("panel") || params.get("day"));
}

export default function DeepLinks() {
  const params = useSearchParams();
  const follow = params.get("follow");
  const panel = params.get("panel");
  const day = params.get("day");

  useEffect(() => {
    const s = useWorld.getState();
    if (panel && (PANELS as string[]).includes(panel)) s.setPanel(panel as Panel);
    if (day && Number.isFinite(Number(day))) {
      s.setPanel("paper");
      try { window.dispatchEvent(new CustomEvent(DAY_EVENT, { detail: { day: Number(day) } })); } catch { /* no-op */ }
    }
  }, [panel, day]);

  // the NPC may not exist in the store until the first snapshot lands, so retry briefly
  useEffect(() => {
    if (!follow) return;
    let tries = 0;
    const apply = () => {
      const s = useWorld.getState();
      const known = !!s.npcs[follow] || !!CAST_BY_ID[follow];
      if (!known && tries++ < 40) return false;
      s.follow(follow);
      s.selectNpc(follow);
      return true;
    };
    if (apply()) return;
    const t = setInterval(() => { if (apply()) clearInterval(t); }, 250);
    return () => clearInterval(t);
  }, [follow]);

  return null;
}
