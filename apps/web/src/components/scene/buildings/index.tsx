/**
 * BUILDINGS & PLACES — every location's structure, signage and attached static props,
 * plus night-reactive windows/lanterns and street lamps. Mounted by Town.tsx as <Buildings town={town} />.
 *
 * Rendering strategy (see NOTES-buildings.md):
 *  - one merged vertex-coloured geometry per location (built by buildings/kinds/**) → one mesh each,
 *    all sharing ONE material with a per-vertex `glow` attribute that lights up at night;
 *  - repeated props (barrels, chairs, bollards, lamp posts…) as one InstancedMesh per kind, same material;
 *  - every sign in town painted into one canvas atlas → one textured mesh;
 *  - a handful of animated extras: fountain spray, lighthouse beam, bobbing moored boats;
 *  - ≤ 8 point lights (6 street lamps + 2 door lanterns), everything else emissive.
 */
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { TownContent } from "@npcworld/schema";
import { layoutTown, type Placed, type TownLayout, type Xf } from "./layout";
import { WATER_Y } from "../terrain";
import { hoverState } from "../overlay";
import { sky } from "../palette";
import { StaticInstances } from "../instances";
import { townMaterial, signMaterial, updateNight } from "./materials";
import { propGeometry, type PropKind } from "./props";
import { SignAtlas, buildSignGeometry } from "./signs";
import { boatGeometry } from "./kinds/harbour";

export { layoutTown } from "./layout";
export type { Placed, Xf, TownLayout } from "./layout";

/* ------------------------------ cheap hover raycast ----------------------------- */

const _inv = new THREE.Matrix4(), _ray = new THREE.Ray(), _pt = new THREE.Vector3();
/** raycast against the mesh's local bounding box only (buildings are convex-ish; keeps pointer events cheap) */
function boxRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
  const g = this.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  _inv.copy(this.matrixWorld).invert();
  _ray.copy(raycaster.ray).applyMatrix4(_inv);
  if (_ray.intersectBox(g.boundingBox!, _pt)) {
    _pt.applyMatrix4(this.matrixWorld);
    const d = raycaster.ray.origin.distanceTo(_pt);
    if (d >= raycaster.near && d <= raycaster.far) intersects.push({ distance: d, point: _pt.clone(), object: this });
  }
}

/* ---------------------------------- buildings --------------------------------- */

function LocationMesh({ p, geometry }: { p: Placed; geometry: THREE.BufferGeometry }) {
  const { loc } = p;
  const over = (e: { stopPropagation: () => void }) => { e.stopPropagation(); hoverState.locationId = loc.id; document.body.style.cursor = "pointer"; };
  const out = () => { if (hoverState.locationId === loc.id) hoverState.locationId = null; document.body.style.cursor = "auto"; };
  return (
    <mesh geometry={geometry} material={townMaterial()} position={[p.x, p.y, p.z]} rotation={[0, p.yaw, 0]} castShadow receiveShadow raycast={boxRaycast} onPointerOver={over} onPointerOut={out} />
  );
}

/* ----------------------------------- signs ------------------------------------ */

function Signs({ L }: { L: TownLayout }) {
  const built = useMemo(() => {
    const atlas = new SignAtlas(2048);
    const geo = buildSignGeometry(L.signs, atlas);
    return { atlas, geo, mat: signMaterial(atlas.tex) };
  }, [L]);
  return <mesh geometry={built.geo} material={built.mat} castShadow={false} receiveShadow={false} />;
}

/* --------------------------------- lamps & lights -------------------------------- */

function Lights({ L }: { L: TownLayout }) {
  const lights = useRef<THREE.PointLight[]>([]);
  useFrame(() => { for (const l of lights.current) if (l) l.intensity = sky.night * l.userData.power; });
  // 6 street-lamp lights at the busiest spots + 2 door lanterns (tavern, inn)
  const spots: { p: [number, number, number]; color: string; power: number }[] = [
    { p: [150, 4.5, -180], color: "#ffd27a", power: 90 }, { p: [112, 4.5, -180], color: "#ffd27a", power: 80 }, { p: [190, 4.5, -180], color: "#ffd27a", power: 80 },
    { p: [150, 4.5, -122], color: "#ffd27a", power: 90 }, { p: [44, 4.5, -248], color: "#ffd27a", power: 80 }, { p: [206, 4.5, -228], color: "#ffd27a", power: 70 },
  ];
  const lanterns = L.lanternLights.filter((l) => Math.hypot(l.x - 180, l.z + 185) < 6 || Math.hypot(l.x - 174, l.z + 130) < 6).slice(0, 2);
  for (const l of lanterns) spots.push({ p: [l.x, l.y, l.z], color: l.color, power: 40 });
  return (
    <>
      {spots.slice(0, 8).map((s, i) => <pointLight key={i} ref={(el) => { if (el) { lights.current[i] = el; el.userData.power = s.power; } }} position={s.p} color={s.color} intensity={0} distance={s.power > 60 ? 36 : 22} decay={2} />)}
    </>
  );
}

/* ------------------------------ animated extras ------------------------------- */

function FountainSpray({ L }: { L: TownLayout }) {
  const ref = useRef<THREE.Group>(null);
  const sq = L.buildings.find((b) => b.loc.id === "town_square");
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e8f6ff", emissive: "#8fd0ff", emissiveIntensity: 0.25, roughness: 0.1, transparent: true, opacity: 0.75 }), []);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.5, 0), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.children.forEach((c, i) => { c.position.y = 5.7 + Math.abs(Math.sin(t * 2.2 + i * 1.3)) * 0.9; const s = 0.5 + 0.35 * Math.sin(t * 3 + i); c.scale.set(s, 1.6 * s, s); });
  });
  if (!sq) return null;
  return (
    <group ref={ref} position={[sq.x, sq.y, sq.z]}>
      {[0, 1, 2].map((i) => <mesh key={i} geometry={geo} material={mat} position={[Math.cos(i * 2.1) * 0.35, 5.7, Math.sin(i * 2.1) * 0.35]} />)}
    </group>
  );
}

function LighthouseBeam({ L }: { L: TownLayout }) {
  const beam = useRef<THREE.Group>(null);
  const lh = L.buildings.find((b) => b.loc.id === "lighthouse");
  const beamMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff2b0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), []);
  const cone = useMemo(() => new THREE.ConeGeometry(9, 110, 20, 1, true), []);
  useFrame((_, dt) => {
    if (!beam.current) return;
    beam.current.rotation.y += dt * 0.7;
    beamMat.opacity = sky.night * 0.09;
  });
  if (!lh) return null;
  return (
    <group ref={beam} position={[lh.x, lh.y + 16.9, lh.z]}>
      <mesh geometry={cone} material={beamMat} rotation={[0, 0, Math.PI / 2]} position={[55, 0, 0]} />
      <mesh geometry={cone} material={beamMat} rotation={[0, 0, -Math.PI / 2]} position={[-55, 0, 0]} />
    </group>
  );
}

/** Not mounted: the life layer renders/bobs L.mooredBoats itself. Kept as a fallback (mount it if that layer is absent). */
export function MooredBoats({ L }: { L: TownLayout }) {
  const refs = useRef<THREE.Group[]>([]);
  const geos = useMemo(() => ({ trawler: boatGeometry("trawler").build(), skiff: boatGeometry("skiff").build(), sloop: boatGeometry("sloop").build() }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((g, i) => { if (!g) return; g.position.y = WATER_Y + 0.15 + Math.sin(t * 1.1 + i * 1.7) * 0.1; g.rotation.z = Math.sin(t * 0.9 + i) * 0.035; g.rotation.x = Math.sin(t * 0.7 + i * 2.1) * 0.02; });
  });
  return (
    <>
      {L.mooredBoats.map((b, i) => (
        <group key={i} ref={(el) => { if (el) refs.current[i] = el; }} position={[b.x, WATER_Y + 0.15, b.z]} rotation={[0, b.ry, 0]}>
          <mesh geometry={geos[b.kind]} material={townMaterial()} castShadow receiveShadow />
          {/* mooring rope to the pier */}
        </group>
      ))}
    </>
  );
}

/* --------------------------------- render info --------------------------------- */

function RenderInfo({ group }: { group: React.RefObject<THREE.Group | null> }) {
  const gl = useThree((s) => s.gl);
  const last = useRef({ calls: 0, triangles: 0 });
  useEffect(() => { gl.info.autoReset = false; return () => { gl.info.autoReset = true; }; }, [gl]);
  // runs before the frame's render: what accumulated since the previous reset is one full frame (all passes)
  useFrame(() => { last.current = { calls: gl.info.render.calls, triangles: gl.info.render.triangles }; gl.info.reset(); });
  useEffect(() => {
    const w = window as unknown as { __bldInfo?: () => unknown };
    w.__bldInfo = () => {
      let meshes = 0, instanced = 0, tris = 0;
      group.current?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.visible) return;
        const g = m.geometry, n = g.index ? g.index.count / 3 : g.getAttribute("position").count / 3;
        if ((m as THREE.InstancedMesh).isInstancedMesh) { instanced++; tris += n * (m as THREE.InstancedMesh).count; } else { meshes++; tris += n; }
      });
      return { frameCalls: last.current.calls, frameTriangles: last.current.triangles, buildingMeshes: meshes, propInstancedMeshes: instanced, buildingDrawCalls: meshes + instanced, buildingTriangles: Math.round(tris), geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length };
    };
    return () => { delete w.__bldInfo; };
  }, [gl, group]);
  return null;
}

/* ------------------------------------ root ------------------------------------- */

export default function Buildings({ town }: { town: TownContent }) {
  const L: TownLayout = useMemo(() => layoutTown(town), [town]);
  const geos = useMemo(() => {
    const m = new Map<string, THREE.BufferGeometry>();
    for (const [id, gb] of L.built) m.set(id, gb.build());
    return m;
  }, [L]);
  const props = useMemo(() => {
    const out: { kind: PropKind; items: Xf[]; shadow: boolean }[] = [];
    for (const [k, items] of Object.entries(L.props) as [PropKind, Xf[]][]) if (items?.length) out.push({ kind: k, items, shadow: k !== "kerb" && k !== "cleat" && k !== "flowerClump" && k !== "reeds" });
    out.push({ kind: "bench", items: L.benches, shadow: true });
    out.push({ kind: "lampPost", items: L.lampPosts, shadow: true });
    return out;
  }, [L]);
  useFrame(() => updateNight(sky.night));
  const root = useRef<THREE.Group>(null);
  return (
    <group ref={root}>
      {L.buildings.map((p) => { const g = geos.get(p.loc.id); return g ? <LocationMesh key={p.loc.id} p={p} geometry={g} /> : null; })}
      {props.map((pr) => <StaticInstances key={pr.kind} geometry={propGeometry(pr.kind)} material={townMaterial()} items={pr.items} castShadow={pr.shadow} receiveShadow />)}
      <Signs L={L} />
      <Lights L={L} />
      <FountainSpray L={L} />
      <LighthouseBeam L={L} />
      <RenderInfo group={root} />
    </group>
  );
}
