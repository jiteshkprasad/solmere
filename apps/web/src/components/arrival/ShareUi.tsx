/**
 * Server-safe presentational bits for the permalink pages (`/npc/[id]`,
 * `/day/[n]`). Deliberately no "use client" and no store: these pages render on
 * the server so a pasted link works with JS disabled and the 3D scene never
 * enters the bundle. OWNED BY THE STORY/SHARE AGENT.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { TOWN_NAME, cx } from "@/lib/share";

export function ShareShell({ children, crumb }: { children: ReactNode; crumb?: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#0b1020] text-slate-100"
      style={{ backgroundImage: "radial-gradient(90% 60% at 50% -10%, rgba(57,135,229,0.13), transparent 65%), radial-gradient(60% 40% at 85% 0%, rgba(255,59,92,0.08), transparent 60%)" }}>
      <div className="mx-auto w-full max-w-[1020px] px-4 py-5 sm:px-6 sm:py-8">
        <nav className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href="/" className="hud-kicker hover:text-slate-200" style={{ letterSpacing: "0.22em" }}>{TOWN_NAME}</Link>
          {crumb && <span className="text-[11px] text-slate-600">/</span>}
          {crumb && <span className="text-[11px] text-slate-400">{crumb}</span>}
          <Link href="/" className="hud-btn ml-auto">Watch the town live →</Link>
        </nav>
        {children}
        <footer className="mt-8 border-t border-[var(--hud-border)] pt-4 text-[11px] leading-relaxed text-slate-500">
          {TOWN_NAME} is a living town of 50 people. Nothing is scripted — every plan, argument and reconciliation is a
          decision made by a language model. <Link href="/?intro=1" className="text-slate-400 underline decoration-slate-700 underline-offset-2 hover:text-slate-200">Start from the beginning →</Link>
        </footer>
      </div>
    </div>
  );
}

export function Panel({ title, right, children, className, bodyClassName }: { title?: string; right?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx("glass overflow-hidden rounded-xl", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-[var(--hud-border)] px-3.5 py-2">
          <h2 className="hud-kicker">{title}</h2>
          {right}
        </header>
      )}
      <div className={cx("px-3.5 py-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Chip({ children, color, title }: { children: ReactNode; color?: string; title?: string }) {
  return (
    <span className="hud-chip" title={title} style={color ? { color, borderColor: `${color}55`, background: `${color}18` } : undefined}>{children}</span>
  );
}

/** −1..1 affinity bar centred on zero. */
export function SignedBar({ value, height = 5 }: { value: number; height?: number }) {
  const v = Math.max(-1, Math.min(1, value));
  const w = Math.abs(v) * 50;
  return (
    <div className="relative w-full overflow-hidden rounded-full" style={{ height, background: "rgba(148,163,184,0.15)" }}>
      <div className="absolute inset-y-0 w-px bg-slate-500/60" style={{ left: "50%" }} />
      <div className="absolute inset-y-0 rounded-full" style={{ left: v < 0 ? `${50 - w}%` : "50%", width: `${w}%`, background: v < 0 ? "var(--hud-neg)" : "var(--hud-pos)" }} />
    </div>
  );
}

export function OfflineNote({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12px] leading-snug"
      style={{ borderColor: "rgba(251,191,36,0.28)", background: "rgba(251,191,36,0.07)", color: "#fcd34d" }}>
      <span className="mt-px shrink-0 text-[13px]">◌</span>
      <span>{children}</span>
    </div>
  );
}

/** Small drama flame, mirroring the HUD's. */
export function Flame({ drama }: { drama: number }) {
  const s = 8 + Math.round(Math.max(0, Math.min(10, drama)) * 0.9);
  const color = drama >= 7 ? "#ff3b5c" : drama >= 4 ? "#fbbf24" : "#64748b";
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" className="shrink-0" aria-label={`drama ${drama}`}>
      <path d="M8 1c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-3s.5 2 2 2c0-3-1-4 1-7z" fill={color} />
    </svg>
  );
}
