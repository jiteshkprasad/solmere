"use client";
import { create } from "zustand";

/**
 * Whether the arrival card is up. The loading screen reads it: while the card is
 * showing (or once the viewer has dismissed it) the full-screen title card steps
 * aside for a slim progress line, so a first-time visitor reads something alive
 * while the town builds behind it instead of watching a bare progress bar.
 *
 * On globalThis for the same two-chunk reason as lib/viewInset.ts.
 */
type ArrivalStore = { open: boolean; shown: boolean; decided: boolean; setOpen: (o: boolean) => void };
function make() {
  return create<ArrivalStore>((set, get) => ({
    open: false,
    shown: false,
    /** the card has decided whether to show at all (replay waits for this before starting the clock) */
    decided: false,
    setOpen: (o) => set({ open: o, shown: get().shown || o, decided: true }),
  }));
}
const KEY = "__solmereArrival";
type G = typeof globalThis & { [KEY]?: ReturnType<typeof make> };
const g = globalThis as G;
export const useArrival = g[KEY] ?? (g[KEY] = make());
