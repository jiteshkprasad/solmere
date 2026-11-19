"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { connectEngine } from "@/lib/engineClient";
import Hud from "@/components/hud/Hud";
import LoadingScreen from "@/components/hud/LoadingScreen";
import ArrivalCard from "@/components/hud/ArrivalCard";

const Scene = dynamic(() => import("@/components/scene/Scene"), { ssr: false });

export default function Page() {
  useEffect(() => { connectEngine(); }, []);
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b1020] text-slate-100">
      <div className="absolute inset-0 z-0"><Scene /></div>
      <div className="pointer-events-none absolute inset-0 z-10"><Hud /></div>
      <div className="pointer-events-none absolute inset-0 z-20"><ArrivalCard /></div>
      <div className="pointer-events-none absolute inset-0 z-30"><LoadingScreen /></div>
    </main>
  );
}
