/**
 * Visitor analytics for the replay site (Google Analytics 4 property "jitesh.app", stream G-YZDY7659DT, plus Cloudflare
 * Web Analytics). The tags are only in the static replay export (app/layout.tsx); elsewhere track() does nothing.
 * Events carry no personal data: only what was tapped (panel, moment index, person id from the public cast).
 */
type Params = Record<string, string | number | boolean | undefined>;
declare global { interface Window { gtag?: (...a: unknown[]) => void } }

export function track(name: string, params: Params = {}) {
  try { if (typeof window !== "undefined" && window.gtag) window.gtag("event", name, params); } catch { /* never break the app */ }
}
