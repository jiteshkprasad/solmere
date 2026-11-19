/**
 * Instanced vegetation + shore props: 4 tree species, bushes, hedges, flowers,
 * reeds, grass tufts (wind sway in the vertex shader), rocks, boulders and
 * driftwood. One draw call per species (~12 total).
 */
"use client";
import { useMemo } from "react";
import type { TownContent } from "@npcworld/schema";
import type { TownLayout } from "../buildings/layout";
import { StaticInstances } from "../instances";
import { scatterTown } from "./scatter";
import { windTintMaterial } from "./materials";
import { oakGeometry, pineGeometry, coastalPineGeometry, poplarGeometry, bushGeometry, hedgeGeometry, flowerGeometry, reedGeometry, grassGeometry, rockGeometry, driftwoodGeometry, cropGeometry } from "./flora";

export default function Vegetation({ town, layout }: { town: TownContent; layout: TownLayout }) {
  const S = useMemo(() => scatterTown(town, layout), [town, layout]);
  const G = useMemo(() => ({
    oak: oakGeometry(), pine: pineGeometry(), coastal: coastalPineGeometry(), poplar: poplarGeometry(),
    bush: bushGeometry(), hedge: hedgeGeometry(), flower: flowerGeometry(), reed: reedGeometry(), grass: grassGeometry(),
    rock: rockGeometry(41), boulder: rockGeometry(42), drift: driftwoodGeometry(), crop: cropGeometry(),
  }), []);
  const M = useMemo(() => ({
    tree: windTintMaterial({ flatShading: true, roughness: 0.9, sway: 0.35 }),
    bush: windTintMaterial({ flatShading: true, roughness: 0.95, sway: 0.5 }),
    flower: windTintMaterial({ flatShading: true, roughness: 0.8, sway: 1.4 }),
    reed: windTintMaterial({ flatShading: true, roughness: 0.9, sway: 2.2, side: 2 }),
    grass: windTintMaterial({ flatShading: false, roughness: 0.95, sway: 2.4, side: 2 }),
    rock: windTintMaterial({ flatShading: true, roughness: 0.95, wind: false }),
    crop: windTintMaterial({ flatShading: true, roughness: 0.9, sway: 1.2 }),
  }), []);
  return (
    <group>
      <StaticInstances geometry={G.oak} material={M.tree} items={S.oaks} />
      <StaticInstances geometry={G.pine} material={M.tree} items={S.pines} />
      <StaticInstances geometry={G.coastal} material={M.tree} items={S.coastalPines} />
      <StaticInstances geometry={G.poplar} material={M.tree} items={S.poplars} />
      <StaticInstances geometry={G.bush} material={M.bush} items={S.bushes} />
      <StaticInstances geometry={G.hedge} material={M.bush} items={S.hedges} />
      <StaticInstances geometry={G.flower} material={M.flower} items={S.flowers} castShadow={false} />
      <StaticInstances geometry={G.reed} material={M.reed} items={S.reeds} castShadow={false} />
      <StaticInstances geometry={G.grass} material={M.grass} items={S.grass} castShadow={false} />
      <StaticInstances geometry={G.rock} material={M.rock} items={S.rocks} receiveShadow />
      <StaticInstances geometry={G.boulder} material={M.rock} items={S.boulders} receiveShadow />
      <StaticInstances geometry={G.drift} material={M.rock} items={S.driftwood} />
      <StaticInstances geometry={G.crop} material={M.crop} items={layout.crops} castShadow={false} />
    </group>
  );
}
