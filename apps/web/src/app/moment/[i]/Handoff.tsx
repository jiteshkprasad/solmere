"use client";
import { useEffect } from "react";

/** Replace this preview page with the replay at the moment (keeps Back sensible). */
export default function Handoff({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return null;
}
