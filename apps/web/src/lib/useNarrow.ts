"use client";
import { useSyncExternalStore } from "react";

/** Phone layout breakpoint (Tailwind `md` is 768 px). */
export const NARROW_QUERY = "(max-width: 767px)";

function subscribe(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function snapshot() { return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(NARROW_QUERY).matches; }

/** true on phone-width screens; false during SSR. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

export function isNarrow(): boolean { return snapshot(); }
