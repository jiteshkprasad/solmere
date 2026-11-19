"use client";
/** Dev-only route: renders the HUD alone on a dark gradient (no 3D scene). Use with NEXT_PUBLIC_MOCK_WORLD=1. */
import Hud from "@/components/hud/Hud";

export default function DevHudPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden text-slate-100" style={{ background: "radial-gradient(1200px 600px at 60% 40%, #1b2a4a 0%, #0b1020 60%, #05070f 100%)" }}>
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div className="pointer-events-none absolute inset-0"><Hud /></div>
    </main>
  );
}
