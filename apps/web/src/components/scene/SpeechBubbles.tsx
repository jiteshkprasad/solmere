/**
 * Speech bubbles for live conversations + the selected/followed NPC's thought.
 * Rendered as DOM inside the scene overlay; positions come from OverlayProjector.
 */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWorld } from "@/lib/store";
import { registerOverlay, unregisterOverlay } from "./overlay";
import { firstName } from "./content";

const MAX_WORDS = 25;
function clip(text: string): string {
  const w = text.trim().split(/\s+/);
  return w.length <= MAX_WORDS ? text.trim() : w.slice(0, MAX_WORDS).join(" ") + "…";
}

interface Bubble { key: string; npcId: string; text: string; leaving?: boolean }

export default function SpeechBubbles() {
  const conversations = useWorld((s) => s.conversations);
  const selectedId = useWorld((s) => s.ui.selectedNpcId);
  const followId = useWorld((s) => s.ui.followNpcId);

  // the set of bubbles that *should* be visible right now
  const live = useMemo(() => {
    const out: Bubble[] = [];
    const seen = new Set<string>();
    for (const c of Object.values(conversations)) {
      if (c.done) continue;
      const line = c.lines[c.cursor];
      if (!line || seen.has(line.speaker)) continue;
      seen.add(line.speaker);
      out.push({ key: `${c.id}:${c.cursor}`, npcId: line.speaker, text: clip(line.text) });
    }
    return out;
  }, [conversations]);

  // keep old bubbles around for a short fade-out
  const [shown, setShown] = useState<Bubble[]>([]);
  const timers = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    setShown((prev) => {
      const liveKeys = new Set(live.map((b) => b.key));
      const next: Bubble[] = [...live];
      for (const b of prev) {
        if (liveKeys.has(b.key)) continue;
        // a bubble for a speaker that has a new live bubble is replaced outright
        if (live.some((l) => l.npcId === b.npcId)) continue;
        if (!b.leaving) {
          next.push({ ...b, leaving: true });
          const id = window.setTimeout(() => { setShown((s) => s.filter((x) => x.key !== b.key)); timers.current.delete(b.key); }, 320);
          timers.current.set(b.key, id);
        } else next.push(b);
      }
      return next;
    });
  }, [live]);
  useEffect(() => { const t = timers.current; return () => { t.forEach((id) => window.clearTimeout(id)); }; }, []);

  const focusId = selectedId ?? followId;
  const thought = useWorld((s) => (focusId ? s.npcs[focusId]?.thought : undefined));
  const focusTalking = focusId ? shown.some((b) => b.npcId === focusId && !b.leaving) : false;

  return (
    <>
      {shown.map((b) => (
        <div
          key={b.key}
          className={"sc-lbl sc-bubble" + (b.leaving ? " out" : "")}
          ref={(el) => { if (el) registerOverlay("b:" + b.key, { el, kind: "bubble", id: b.key, npcId: b.npcId, yOff: 2.75 }); else unregisterOverlay("b:" + b.key); }}
        >
          <span className="who">{firstName(b.npcId)}</span>
          {b.text}
        </div>
      ))}
      {focusId && thought && !focusTalking && (
        <div
          key={"t:" + focusId}
          className="sc-lbl sc-thought"
          ref={(el) => { if (el) registerOverlay("t:" + focusId, { el, kind: "thought", id: focusId, npcId: focusId, yOff: 2.75 }); else unregisterOverlay("t:" + focusId); }}
        >
          {clip(thought)}
        </div>
      )}
    </>
  );
}
