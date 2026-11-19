/**
 * A face, without the 3D scene. Cuts the NPC's tile straight out of the
 * build-time sprite atlas with background-position, so permalink pages render
 * portraits server-side with one cached image request and no JS.
 * Falls back to initials on the same hashed gradient the HUD Avatar uses.
 *
 * Server-safe (no hooks). OWNED BY THE STORY/SHARE AGENT.
 */
import { hashGradient, initials, npcName, type TileRect } from "@/lib/share";

export function Portrait({ id, tile, size = 64, name, className, rounded = "50%", ring }: {
  id: string;
  tile: TileRect | null;
  size?: number;
  name?: string;
  className?: string;
  rounded?: string;
  ring?: string;
}) {
  const n = name ?? npcName(id);
  const scale = tile ? size / tile.size : 1;
  return (
    <span
      className={className}
      title={n}
      aria-label={n}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size, height: size, flexShrink: 0, borderRadius: rounded, overflow: "hidden",
        background: hashGradient(id),
        color: "#fff", fontWeight: 600, fontSize: Math.max(9, Math.round(size * 0.36)), letterSpacing: "0.02em",
        boxShadow: ring ? `0 0 0 2px rgba(11,16,32,0.9), 0 0 0 ${Math.max(2, Math.round(size * 0.05))}px ${ring}` : "0 0 0 1px rgba(0,0,0,0.35)",
        ...(tile
          ? {
              backgroundImage: `url(${tile.url})`,
              backgroundSize: `${tile.sheetW * scale}px ${tile.sheetH * scale}px`,
              backgroundPosition: `-${tile.x * scale}px -${tile.y * scale}px`,
              backgroundRepeat: "no-repeat",
            }
          : null),
      }}
    >
      {tile ? null : initials(n)}
    </span>
  );
}

/** Overlapping row of faces. */
export function PortraitRow({ ids, tiles, size = 26, max = 4 }: { ids: string[]; tiles: Record<string, TileRect | null>; size?: number; max?: number }) {
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {shown.map((id, i) => (
        <Portrait key={id} id={id} tile={tiles[id] ?? null} size={size} className={i > 0 ? "-ml-2" : undefined} />
      ))}
      {extra > 0 && (
        <span className="-ml-2 inline-flex items-center justify-center rounded-full bg-slate-700 text-[10px] font-medium text-slate-200 ring-1 ring-black/40"
          style={{ width: size, height: size }}>+{extra}</span>
      )}
    </span>
  );
}
