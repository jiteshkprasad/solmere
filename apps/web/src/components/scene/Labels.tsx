/**
 * DOM labels for locations, districts and NPC names (positioned by OverlayProjector).
 */
"use client";
import { useEffect, useState } from "react";
import { useWorld } from "@/lib/store";
import { useContent } from "./content";
import { registerOverlay, unregisterOverlay } from "./overlay";
import { specFor } from "./buildings/layout";
import { terrainHeight } from "./terrain";

export function TownLabels() {
  const content = useContent();
  if (!content) return null;
  const { town } = content;
  return (
    <>
      {town.districts.map((d) => (
        <div
          key={d.id}
          className="sc-lbl sc-district"
          ref={(el) => { if (el) registerOverlay("d:" + d.id, { el, kind: "district", id: d.id, pos: [d.center[0], terrainHeight(d.center[0], d.center[1]), -d.center[1]], yOff: 14 }); else unregisterOverlay("d:" + d.id); }}
        >
          {d.name}
        </div>
      ))}
      {town.locations.map((l) => {
        const s = specFor(l);
        const h = s.kind === "lighthouse" ? 19 : s.kind === "building" || s.kind === "market" || s.kind === "farm" ? s.h + s.roofH + 1.2 : 3.5;
        return (
          <div
            key={l.id}
            className="sc-lbl sc-loc"
            ref={(el) => { if (el) registerOverlay("l:" + l.id, { el, kind: "location", id: l.id, pos: [l.pos[0], terrainHeight(l.pos[0], l.pos[1]), -l.pos[1]], yOff: h }); else unregisterOverlay("l:" + l.id); }}
          >
            {l.name}
          </div>
        );
      })}
    </>
  );
}

export function NpcLabels() {
  const [ids, setIds] = useState<string[]>(() => Object.keys(useWorld.getState().npcs).sort());
  useEffect(() => useWorld.subscribe((s, p) => {
    if (s.npcs === p.npcs) return;
    const k = Object.keys(s.npcs);
    setIds((cur) => (k.length === cur.length && k.every((id) => cur.includes(id)) ? cur : k.sort()));
  }), []);
  const selected = useWorld((s) => s.ui.selectedNpcId);
  const followed = useWorld((s) => s.ui.followNpcId);
  return (
    <>
      {ids.map((id) => (
        <NpcLabel key={id} id={id} sel={id === selected || id === followed} />
      ))}
    </>
  );
}

function NpcLabel({ id, sel }: { id: string; sel: boolean }) {
  const name = useWorld((s) => s.npcs[id]?.name ?? id);
  const activity = useWorld((s) => (sel ? s.npcs[id]?.activity : undefined));
  return (
    <div
      className={"sc-lbl sc-npc" + (sel ? " sel" : "")}
      ref={(el) => { if (el) registerOverlay("n:" + id, { el, kind: "npc", id, npcId: id, yOff: 2.3 }); else unregisterOverlay("n:" + id); }}
    >
      {name}
      {sel && activity ? <span style={{ display: "block", fontWeight: 400, opacity: 0.85 }}>{activity}</span> : null}
    </div>
  );
}
