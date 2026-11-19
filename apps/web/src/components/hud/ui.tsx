"use client";
import type { ReactNode } from "react";
import { cx } from "./lib";

/** Panel frame: header row + scrolling body. Used by every left-rail panel. */
export function PanelFrame({ title, kicker, right, children, className, bodyClassName }: { title: string; kicker?: string; right?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx("glass pointer-events-auto flex h-full min-h-0 flex-col rounded-xl", className)}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--hud-border)] px-3 py-2">
        <div className="min-w-0">
          {kicker && <div className="hud-kicker">{kicker}</div>}
          <h2 className="truncate text-[13px] font-semibold text-white">{title}</h2>
        </div>
        {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
      </header>
      <div className={cx("hud-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Section({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("px-3 py-2.5", className)}>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="hud-kicker">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Divider() { return <div className="mx-3 border-t border-[var(--hud-border)]" />; }

export function Pill({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider", className)}
      style={color ? { color, background: `${color}22`, border: `1px solid ${color}55` } : { color: "var(--hud-muted)", background: "rgba(255,255,255,0.05)", border: "1px solid var(--hud-border)" }}>
      {children}
    </span>
  );
}

/** Horizontal 0..1 bar. */
export function Bar({ value, color = "var(--s1)", height = 4, className, track = "rgba(148,163,184,0.15)" }: { value: number; color?: string; height?: number; className?: string; track?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cx("w-full overflow-hidden rounded-full", className)} style={{ height, background: track }}>
      <div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: color, transition: "width 400ms ease" }} />
    </div>
  );
}

/** Signed bar centred at zero (-1..1). */
export function SignedBar({ value, height = 4, className }: { value: number; height?: number; className?: string }) {
  const v = Math.max(-1, Math.min(1, value));
  const w = Math.abs(v) * 50;
  return (
    <div className={cx("relative w-full overflow-hidden rounded-full", className)} style={{ height, background: "rgba(148,163,184,0.15)" }}>
      <div className="absolute top-0 bottom-0 w-px bg-slate-500/60" style={{ left: "50%" }} />
      <div className="absolute top-0 bottom-0 rounded-full" style={{ left: v < 0 ? `${50 - w}%` : "50%", width: `${w}%`, background: v < 0 ? "var(--hud-neg)" : "var(--hud-pos)" }} />
    </div>
  );
}

export function Empty({ children = "Nothing yet." }: { children?: ReactNode }) {
  return <div className="px-3 py-8 text-center text-[12px] text-slate-500">{children}</div>;
}

export function Delta({ value, suffix = "", digits = 0, invert = false }: { value: number | null | undefined; suffix?: string; digits?: number; invert?: boolean }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className="text-[10px] text-slate-500">—</span>;
  const good = invert ? value <= 0 : value >= 0;
  const zero = Math.abs(value) < Number.EPSILON;
  return (
    <span className="text-[10px] font-medium" style={{ color: zero ? "var(--hud-dim)" : good ? "var(--hud-pos)" : "var(--hud-neg)" }}>
      {zero ? "±0" : `${value > 0 ? "▲" : "▼"} ${Math.abs(value).toFixed(digits)}${suffix}`}
    </span>
  );
}

export function Kpi({ label, value, delta, invert, hint, digits, suffix }: { label: string; value: string; delta?: number | null; invert?: boolean; hint?: string; digits?: number; suffix?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--hud-border)] bg-white/[0.03] px-2.5 py-2" title={hint}>
      <div className="hud-kicker truncate" style={{ fontSize: 9 }}>{label}</div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-mono text-[16px] font-semibold leading-none text-white">{value}</span>
        {delta !== undefined && <span className="whitespace-nowrap"><Delta value={delta} invert={invert} suffix={suffix} digits={digits ?? (Math.abs(delta ?? 0) < 10 ? 1 : 0)} /></span>}
      </div>
    </div>
  );
}

export function IconBtn({ onClick, title, children, active, className }: { onClick?: () => void; title?: string; children: ReactNode; active?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} data-active={active ? "true" : undefined}
      className={cx("hud-btn inline-flex h-6 min-w-6 items-center justify-center px-1.5 text-[11px]", className)}>
      {children}
    </button>
  );
}

/** Tiny SVG flame scaled by drama. */
export function Flame({ drama, className }: { drama: number; className?: string }) {
  const s = 8 + Math.round(Math.max(0, Math.min(10, drama)) * 0.9);
  const hot = drama >= 7;
  const color = drama >= 7 ? "#ff3b5c" : drama >= 4 ? "#fbbf24" : "#64748b";
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" className={cx("shrink-0", className)} aria-label={`drama ${drama}`}>
      <path d="M8 1c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-3s.5 2 2 2c0-3-1-4 1-7z" fill={color} opacity={hot ? 1 : 0.85} />
    </svg>
  );
}
