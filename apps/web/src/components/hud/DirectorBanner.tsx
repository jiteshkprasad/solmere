"use client";
import { useEffect, useRef, useState } from "react";
import { useWorld } from "@/lib/store";
import { Avatar } from "./Avatar";
import { firstName, atLocation } from "./lib";

const STALE_MS = 5 * 60_000;

/** Wall-clock age of the current focus key; re-renders every 15 s so the "· 2m" chip stays honest. */
function useFocusAge(key: string | null): number | null {
  const since = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });
  if (key !== since.current.key) since.current = { key, at: Date.now() };
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 15_000); return () => clearInterval(t); }, []);
  return key === null ? null : Date.now() - since.current.at;
}
function fmtAge(ms: number): string { const s = Math.floor(ms / 1000); return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; }

function joinNames(ids: string[]): string {
  const names = ids.map(firstName);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length > 3) return `${names.slice(0, 3).join(", ")} and ${names.length - 3} others`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "NOW WATCHING — Chen and Tunde, at the docks — prices again" */
export default function DirectorBanner() {
  const focus = useWorld((s) => s.ui.directorFocus);
  const mode = useWorld((s) => s.ui.cameraMode);
  const followId = useWorld((s) => s.ui.followNpcId);
  const followActivity = useWorld((s) => (s.ui.followNpcId ? s.npcs[s.ui.followNpcId]?.activity : undefined));
  const followMood = useWorld((s) => (s.ui.followNpcId ? s.npcs[s.ui.followNpcId]?.mood : undefined));
  const selectNpc = useWorld((s) => s.selectNpc);

  const following = mode === "follow" && !!followId;
  const focusKey = following ? `follow:${followId}` : focus ? `${focus.npcIds.join(",")}|${focus.locationId}|${focus.reason}` : null;
  const age = useFocusAge(focusKey);

  let ids: string[] = [];
  let where = "";
  let reason = "";
  let label = "NOW WATCHING";
  if (following) {
    ids = [followId as string]; reason = followActivity ?? ""; label = "FOLLOWING";
  } else if (focus) {
    ids = focus.npcIds; where = atLocation(focus.locationId); reason = focus.reason;
  } else return null;
  // a director focus that hasn't changed in 5 real minutes is stale: hide rather than mislead
  if (!following && age !== null && age > STALE_MS) return null;

  return (
    <div key={focusKey} className="glass-strong banner-in pointer-events-auto hidden max-w-[560px] items-center @[240px]:flex gap-3 rounded-xl py-2 pr-3 pl-3 @[300px]:pr-4">
      <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--hud-live)]/90 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.18em] text-white">
        <span className="h-1.5 w-1.5 rounded-full bg-white live-dot" />{label}
      </span>
      <span className="flex shrink-0 items-center -space-x-1.5">
        {ids.slice(0, 3).map((id) => <Avatar key={id} id={id} size={26} mood={id === followId ? followMood : undefined} onClick={() => selectNpc(id)} />)}
      </span>
      <div className="hidden min-w-0 leading-tight @[300px]:block">
        <div className="truncate text-[13px] font-semibold text-white">
          {joinNames(ids)}{where && <span className="font-normal text-slate-300">, {where}</span>}
        </div>
        {reason && <div className="truncate text-[11px] text-slate-400">— {reason}</div>}
      </div>
      {!following && age !== null && age >= 60_000 && (
        <span className="shrink-0 self-start font-mono text-[10px] text-slate-500" title="time since the director last changed focus">· {fmtAge(age)}</span>
      )}
    </div>
  );
}
