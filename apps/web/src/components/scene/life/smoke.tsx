/**
 * Chimney smoke, kettle/café steam and fountain mist — emitter placement and
 * the "is this building in use right now" schedule. Rendering is Particles.
 */
"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { TownLayout, Placed } from "../buildings/layout";
import { terrainHeight } from "../terrain";
import { hash01 } from "../palette";
import { emitter, type Emitter } from "./particles";
import { lifeState, hourIn } from "./state";

interface ChimneyPt { x: number; y: number; z: number; id: string }

/** chimney tops: from the buildings agent's L.chimneys when present, else derived from specs */
export function chimneyPoints(L: TownLayout): ChimneyPt[] {
  const given = (L as unknown as { chimneys?: Array<{ x: number; y: number; z: number; id?: string; locationId?: string }> }).chimneys;
  if (given && given.length) {
    // ChimneyTop carries no id: attribute each stack to the nearest building so the schedule applies
    return given.map((c, i) => {
      let id = c.id ?? c.locationId ?? "", bd = 1e9;
      if (!id) for (const p of L.buildings as Placed[]) { const d = (p.x - c.x) ** 2 + (p.z - c.z) ** 2; if (d < bd) { bd = d; id = p.loc.id; } }
      return { x: c.x, y: c.y, z: c.z, id: id || "chimney" + i };
    });
  }
  const out: ChimneyPt[] = [];
  for (const p of L.buildings as Placed[]) {
    const s = p.spec;
    if (!s.chimney) continue;
    const lx = s.w * 0.3, ly = s.h + s.roofH * 0.55 + 0.6 + 0.85, lz = 0;
    const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    out.push({ x: p.x + lx * c + lz * sn, y: p.y + ly, z: p.z - lx * sn + lz * c, id: p.loc.id });
  }
  return out;
}

/** 0..1 how hard a chimney is going at sim hour h */
function chimneyActivity(id: string, h: number): number {
  const S = lifeState;
  if (S.heatwave && !/bakery|brewery/.test(id)) return 0;
  switch (id) {
    case "bakery": return hourIn(h, 4, 18) ? 1 : 0;
    case "tavern": return hourIn(h, 16, 1) ? 1 : 0;
    case "brewery": return hourIn(h, 7, 17) ? 1 : 0;
    case "inn": return hourIn(h, 6, 10) || hourIn(h, 17, 23) ? 1 : 0;
  }
  // homes: breakfast + dinner, and some keep a fire going on cold nights
  const salt = hash01(id, 41);
  if (hourIn(h, 6 + salt, 8.5 + salt * 0.5)) return 1;
  if (hourIn(h, 17.5 + salt, 21 + salt)) return 1;
  if (hourIn(h, 21, 24) && salt > 0.55 && S.night > 0.5) return 0.6;
  return 0;
}

export default function Smoke({ L }: { L: TownLayout }) {
  const ems = useMemo(() => {
    const list: { e: Emitter; id: string }[] = [];
    for (const c of chimneyPoints(L)) list.push({ e: emitter("chim:" + c.id, c.x, c.y, c.z, 0, /bakery|tavern|brewery/.test(c.id) ? 14 : 6), id: c.id });
    return list;
  }, [L]);

  // steam + mist emitters (fixed spots)
  const kettle = useMemo(() => emitter("steam:kettle", 150.8, terrainHeight(150, 140) + 1.55, -140, 1, 10, { size: 0.35 }), []);
  const cafe = useMemo(() => {
    // a steam vent beside Café Moreno's front door (front = +z local, rotated by the building yaw)
    const b = L.buildings.find((p) => p.loc.id === "cafe");
    const lx = 1.8, lz = b ? b.spec.d / 2 + 0.5 : 4;
    const c = Math.cos(b?.yaw ?? 0), sn = Math.sin(b?.yaw ?? 0);
    const x = (b?.x ?? 160) + lx * c + lz * sn, z = (b?.z ?? -190) - lx * sn + lz * c;
    return emitter("steam:cafe", x, terrainHeight(x, -z) + 2.6, z, 1, 10, { size: 0.4, life: 2.8 });
  }, [L]);
  const mist = useMemo(() => emitter("mist:fountain", 150, terrainHeight(150, 120) + 2.3, -120, 2, 14, { size: 0.9 }), []);
  // heat-haze dust over the square and the hill fields (heatwave only)
  const dust = useMemo(() => [
    emitter("dust:square", 150, terrainHeight(150, 120) + 2.2, -120, 3, 20, { spread: 22, size: 0.14 }),
    emitter("dust:fields", 235, terrainHeight(235, 40) + 2.2, -40, 3, 20, { spread: 28, size: 0.14 }),
  ], []);

  useFrame(() => {
    const h = lifeState.hour;
    for (const { e, id } of ems) e.target = chimneyActivity(id, h);
    kettle.target = hourIn(h, 6, 19) ? 1 : 0;
    cafe.target = hourIn(h, 7, 21) ? 1 : 0;
    mist.target = lifeState.storm ? 0 : 1;
    const hot = lifeState.heatwave && hourIn(h, 10, 18) ? 1 : 0;
    for (const d of dust) d.target = hot;
  });
  return null;
}
