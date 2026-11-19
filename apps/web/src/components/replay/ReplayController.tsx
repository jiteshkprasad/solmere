"use client";
import { useEffect } from "react";
import { useBoot } from "@/components/scene/perf/marks";
import { useArrival } from "@/lib/arrivalState";
import { beginScene, useReplay } from "@/lib/replay/player";

/**
 * Starts the replay clock on the opening scene once the town is built and the
 * arrival card is out of the way (or was never shown). Renders nothing.
 */
export default function ReplayController() {
  const ready = useBoot().ready;
  const decided = useArrival((s) => s.decided);
  const open = useArrival((s) => s.open);
  const manifest = useReplay((s) => s.manifest);
  const loading = useReplay((s) => s.loading);
  const started = useReplay((s) => s.started);

  useEffect(() => {
    if (started || !manifest || loading || !decided || open) return;
    // a returning visitor skips the card: give the scene a moment to finish building first
    if (!ready) {
      const t = window.setTimeout(() => beginScene(), 6000);
      return () => window.clearTimeout(t);
    }
    beginScene();
  }, [started, manifest, loading, decided, open, ready]);

  return null;
}
