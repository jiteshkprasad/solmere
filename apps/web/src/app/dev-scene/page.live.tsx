"use client";
/** Dev-only route: the 3D scene without the HUD (run with NEXT_PUBLIC_MOCK_WORLD=1). */
import dynamic from "next/dynamic";
const Scene = dynamic(() => import("@/components/scene/Scene"), { ssr: false });
export default function DevScenePage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b1020]">
      <div className="absolute inset-0"><Scene /></div>
    </main>
  );
}
