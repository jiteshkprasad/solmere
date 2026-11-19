/** Tiny pub/sub for HUD-originated toasts (admin actions etc.). Event-driven toasts come from the store. */
export interface HudToast { id: string; kicker: string; text: string; color?: string; ttlMs?: number }
type Listener = (t: HudToast) => void;
const listeners = new Set<Listener>();
let n = 0;
export function pushToast(t: Omit<HudToast, "id">) { const toast = { ...t, id: `ui_${Date.now()}_${n++}` }; for (const l of listeners) l(toast); }
export function onToast(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }
