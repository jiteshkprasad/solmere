/**
 * Building blocks shared by the two OG image routes. Rendered by satori
 * (`next/og`), not by React DOM — so: flex everywhere, no CSS classes, no
 * shorthand it doesn't understand. OWNED BY THE STORY/SHARE AGENT.
 */
import type { ReactElement } from "react";
import { hashHue, initials, npcName } from "@/lib/share";

export const OG_SIZE = { width: 1200, height: 630 };
export const INK = "#e2e8f0";
export const MUTED = "#94a3b8";
export const DIM = "#64748b";
export const LIVE = "#ff3b5c";

/** The page-wide backdrop: deep navy with a warm corner light. */
export const ogBackground = {
  display: "flex",
  width: "100%",
  height: "100%",
  backgroundColor: "#0b1020",
  backgroundImage: "linear-gradient(135deg, #131c3a 0%, #0b1020 45%, #090d1c 100%)",
  color: INK,
  fontFamily: "sans-serif",
} as const;

/** A face: the pre-cut PNG tile, or initials on the same hashed colour the app uses. */
export function OgFace({ id, src, size, radius, name }: { id: string; src: string | null; size: number; radius?: number; name?: string }): ReactElement {
  const r = radius ?? Math.round(size / 2);
  const hue = hashHue(id);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} width={size} height={size} alt=""
        style={{ width: size, height: size, borderRadius: r, objectFit: "cover", border: "3px solid rgba(226,232,240,0.16)" }} />
    );
  }
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: r,
      backgroundImage: `linear-gradient(135deg, hsl(${hue} 55% 46%), hsl(${(hue + 30) % 360} 55% 34%))`,
      border: "3px solid rgba(226,232,240,0.16)",
      color: "#fff", fontSize: Math.round(size * 0.34), fontWeight: 700,
    }}>
      {initials(name ?? npcName(id))}
    </div>
  );
}

/** The small red LIVE / kicker pill. */
export function OgPill({ children, color = LIVE }: { children: string; color?: string }): ReactElement {
  return (
    <div style={{
      display: "flex", alignItems: "center", padding: "6px 14px", borderRadius: 8,
      backgroundColor: color, color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: 3,
    }}>{children}</div>
  );
}

/** Bottom strip: what this place is, in one line. */
export function OgFooter({ left, right }: { left: string; right: string }): ReactElement {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderTop: "1px solid rgba(148,163,184,0.22)", paddingTop: 20, marginTop: "auto",
      fontSize: 22, color: DIM,
    }}>
      <div style={{ display: "flex" }}>{left}</div>
      <div style={{ display: "flex" }}>{right}</div>
    </div>
  );
}
