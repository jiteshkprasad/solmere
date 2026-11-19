"use client";
import { memo } from "react";
import { hashHue, initials, moodColor, npcName, cx } from "./lib";
import { usePortrait } from "@/lib/portraits";

export interface AvatarProps {
  id: string;
  name?: string;
  mood?: string;
  size?: number; // px
  className?: string;
  title?: string;
  onClick?: () => void;
  ring?: boolean; // mood ring
}

/**
 * NPC avatar: the character's rendered portrait (from lib/portraits, produced by
 * the 3D scene once its rigs exist) on a hash-coloured circle; initials until
 * the portrait arrives (or when the scene isn't mounted). Optional mood ring.
 */
export const Avatar = memo(function Avatar({ id, name, mood, size = 22, className, title, onClick, ring = true }: AvatarProps) {
  const n = name ?? npcName(id);
  const hue = hashHue(id);
  const portrait = usePortrait(id);
  const fontSize = Math.max(8, Math.round(size * 0.4));
  return (
    <span
      role={onClick ? "button" : undefined}
      onClick={onClick}
      title={title ?? n}
      className={cx("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white", onClick && "cursor-pointer hover:brightness-125", className)}
      style={{
        width: size, height: size, fontSize, lineHeight: 1,
        background: `linear-gradient(135deg, hsl(${hue} 55% 46%), hsl(${(hue + 30) % 360} 55% 34%))`,
        boxShadow: ring && mood ? `0 0 0 2px rgba(11,16,32,0.9), 0 0 0 ${Math.max(2, Math.round(size * 0.09))}px ${moodColor(mood)}` : "0 0 0 1px rgba(0,0,0,0.35)",
        letterSpacing: "0.02em",
      }}
    >
      {portrait ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={portrait} alt={n} width={size} height={size} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        initials(n)
      )}
    </span>
  );
});

/** A row of overlapping avatars for actor lists. */
export function AvatarStack({ ids, size = 20, max = 3, onClick }: { ids: string[]; size?: number; max?: number; onClick?: (id: string) => void }) {
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((id, i) => (
        <Avatar key={id} id={id} size={size} ring={false} onClick={onClick ? () => onClick(id) : undefined} className={i > 0 ? "-ml-1.5" : ""} />
      ))}
      {extra > 0 && <span className="-ml-1 inline-flex items-center justify-center rounded-full bg-slate-700 text-[9px] text-slate-200" style={{ width: size, height: size }}>+{extra}</span>}
    </span>
  );
}
