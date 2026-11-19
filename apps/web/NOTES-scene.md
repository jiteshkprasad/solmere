# Scene notes — `apps/web/src/components/scene/**` + `lib/director.ts`

Everything is procedural (no downloaded assets), so it runs offline.

## Dependency change (important)

`@react-three/fiber` **8 → 9** and `@react-three/drei` **9 → 10**. Fiber 8 crashes on React 19
(`Cannot read properties of undefined (reading 'ReactCurrentOwner')`), so the scene could not
render at all with the originally pinned versions. Fiber 9 also ships its own `React.JSX`
typings, so no local `declare module "react"` shim is needed.

## Component structure

```
Scene.tsx            full-viewport <Canvas> (shadows="soft", dpr [1,1.5], ACES tone mapping)
├─ Atmosphere.tsx    sky dome shader, sun/moon disc, directional sun (shadow camera covers the
│                    300×300 map), ambient + hemisphere, fog, stars, drifting instanced clouds.
│                    Runs palette.updateSky(simHour()) once per frame → module-level `sky` state.
├─ Town.tsx          terrain (vertex-coloured heightfield), animated water, merged road ribbon,
│                    terrain-following patches (plaza / beach / fields), one <Building> per
│                    location (shared unit geometries scaled per mesh), instanced windows, doors,
│                    trees (trunk + conifer + broadleaf), crops, benches, fences, lamps.
│                    Special kinds: docks (quay + pier + 2 bobbing boats), lighthouse (beam
│                    rotates at night), square (fountain), park (pond), beach (parasols, boat).
├─ Npc.tsx           <NpcLayer>: 11 InstancedMeshes (eyes, head, torso, 2 arms, 2 legs, hat,
│                    apron/sash/coat, mood ring, follow/select marker) shared by all NPCs.
│                    Click → selectNpc, double-click → follow (instanceId → npc id).
├─ CameraRig.tsx     OrbitControls + the three modes, keys 1/2/3/Escape, window.__scene.flyTo
└─ overlay.tsx       DOM label layer + <OverlayProjector/> (one useFrame projects every label)
   ├─ Labels.tsx     district labels (zoomed out), location labels (near / hover), NPC names
   └─ SpeechBubbles.tsx  conversation line at `cursor` above the speaker; thought bubble for
                         the selected/followed NPC; 25-word clip; pop-in / fade-out.
Support: content.ts (town/cast holder + name helpers + simHour), terrain.ts (height/colour/
roads), buildings.ts (per-location specs + layoutTown() + footprints), palette.ts (sky keyframes,
job looks, hashing), geo.ts (unit geometries + material cache), npcRuntime.ts (tweens),
DevMock.ts (offline world).
```

Coordinates: `x = pos[0]`, `z = -pos[1]`, `y = terrainHeight(pos)` (metres 1:1). North (the sea)
is away from the default camera. Buildings face their district centre, snapped to 45°.

Labels use a custom DOM projector instead of drei `<Html>`: ~130 labels/bubbles with one
projection pass per frame is much cheaper than 130 independent `<Html>` instances, and it gives
full control of distance fading and z-order.

## How positions are tweened (npcRuntime.ts)

- The store is the only source of truth; the runtime keeps a `Map<id, NpcRender>` outside React.
- `NpcLayer` subscribes with `useWorld.subscribe`; React only re-renders when the *set* of ids
  changes. On every tick `syncRuntime()` sets a new tween target per NPC.
- The tween goes from the **currently rendered** position to the new `pos`, over the measured
  interval between ticks (clamped 0.6–1.6 s), linear inside a tick so walking speed is constant.
  Nothing teleports (except first sight).
- Heading turns toward the walk direction (or the conversation partner). The walk cycle phase
  only advances while moving, so feet never slide when idle.
- Display rule: an NPC that is *not walking* and whose engine position lies inside a building
  footprint is shown just outside that building's front door (deterministic per-NPC spread), so
  people stand in front of shops instead of inside walls. Walkers pass through walls (no navmesh
  yet — see wishlist).
- `sleep` at home → hidden; `sleep` elsewhere → lying down.

## Director scoring (lib/director.ts) — every 3 s

| candidate | score |
|---|---|
| active conversation | `drama` +2 if a participant pair is romantic/rival/enemy (snapshot.relationships) or a participant is in an unresolved storyline whose title/summary matches /romance|rival|feud|enemy|affair|…/, +3 if an event with drama ≥ 7 seen in the last 30 s involves a participant, +2 if ≥ 4 NPCs are at that location |
| recent event (seen < 20 s ago, drama ≥ 6) | `drama` (+5 for speech / election_declared / election_result / vote / festival). Held 20 s. |
| crowd (≥ 4 awake NPCs at one location) | 2 + 0.5 per extra person, +1 if someone there is talking, +5 if a festival card is active (square) |
| speech (npc.action === "speech") | +5 on top of the crowd score |
| fallback wanderer | 1 — a walking/working NPC, rotating every 15 s, so there is always a shot |

The top candidate is held for ≥ 12 s (events 20 s) unless a candidate with score ≥ 8 appears or
the held scene ends. Only when `ui.cameraMode === "director"` does it write
`setUi({ directorFocus: { npcIds, locationId, reason }, followNpcId: primary })`; `reason` is a
banner line like "Chen and Tunde, at the Docks — prices again". Events carry no wall-clock, so
the director stamps each `seq` with the time it first saw it (pre-existing events on startup are
treated as old except the last 5).

`directorFocus` is computed in **every** camera mode (the HUD banner stays current); only in
director mode does the director also set `followNpcId`, and only then does CameraRig move.
`directorState.key` (exported) is the scene identity — stable while a crowd's membership churns —
and CameraRig keys its cuts on it, so participant/reason refreshes never cause a cut.

Director shots (CameraRig): orbit radius ≈ 19/23/34 m for 1/2/4+ people (scaled with
`NPC_SCALE`), slow push-in over 10 s. Robustness rules, all applied every frame:
- focus = centroid of the *visible* subjects, sampled at terrain height; if the subjects have
  drifted > 18 m apart the primary (first) subject is used, so the camera never frames an empty
  field between two people who walked off; target = focus + eye height.
- `resolveCamera()`: camera never below terrain + 2 m and never inside a building's box — pushed
  out along the view vector, lifted over the roof as a last resort.
- line of sight: if the subject→camera segment passes through a building, the orbit swings to the
  nearest clear angle (±30° steps).
- cuts: a new scene < 10 m away, or arriving < 4 s after the last cut, is glided to (no fade);
  otherwise a fade-to-black cut. The fade is frame-driven (`overlay.updateFade`: opacity is a pure
  function of time since `fadeCut()`), so it cannot get stuck opaque if the focus changes mid-fade.
- a soft point "key light" sits over the subject at night so faces read against unlit walls.
With no focus it slowly orbits the whole town from high up.

## Camera modes

- **overview** — OrbitControls (min 10 m, max 420 m, polar 7°–83°, target clamped to the map,
  camera clamped above terrain). Entering it flies back to the establishing shot.
- **follow** — flies to a chase position behind the NPC, then moves the camera with the target
  each frame so the user's own orbit/zoom around them is preserved.
- **director** — controls disabled; see above.
- Keys: `1/2/3` switch modes (`2` follows the followed → selected → a random NPC), `Escape` →
  overview. `window.__scene.flyTo(pos, target)` is a dev hook used by the screenshot script.

## Performance notes

- Draw calls: all 50 NPCs = 11 instanced draws; trees/crops/windows/doors/lamps/benches/fences
  are `InstancedMesh` with matrices set once; buildings are ~2–4 meshes each from 6 shared unit
  geometries and a material cache keyed by colour (~200 draws total). Roads are one merged mesh.
- No per-frame allocations in useFrame paths (scratch Matrix4/Vector3/Color at module level).
- Water animates 5k vertices on the CPU (flat shading, no normal recompute); the ground is a
  static 23k-vertex heightfield with baked vertex colours.
- Shadows: one 2048² PCF-soft map from the sun; NPC arms/hats/windows don't cast.
- `dpr={[1, 1.5]}`; labels are throttled by distance and hidden when off-screen.
- Figures are `NPC_SCALE = 1.8` (stylised, so people read from the overview); label/bubble
  offsets scale with it. Overview camera: (150, 122, 66) → (150, 0, −156).
- The DOM overlay sits inside the scene wrapper's stacking context with `z-index: 1`, and label
  z-indexes are 1–9 (depth buckets), so nothing in it can outrank the HUD (`z-10`).
- Clouds live at y 240–290, far above the highest terrain (~14 m) and the overview camera.
- NPC instanced meshes have a fixed town-sized `boundingSphere` (InstancedMesh caches it for
  raycasting; instances move).

## Dev preview

`NEXT_PUBLIC_MOCK_WORLD=1 pnpm dev` then open `/dev-scene` (scene only) or `/` (with HUD).
`?hour=<0-23>` (or `NEXT_PUBLIC_MOCK_HOUR`) sets the starting hour. The mock ticks once a second:
50 NPCs walk between random locations (home at night), 2–3 fake conversations with advancing
cursors, dramatic events every ~20 s, 2 sim-minutes per real second. It advances whatever
`time` is in the store so it coexists with the HUD's own DevMock ticker (both run on `/`; the
HUD mock keeps `npcs` when ours is already there).

Screenshots (Playwright, 1280×800, swiftshader): mock world — `screenshots/overview.png`,
`follow.png`, `director.png`, `selected.png`, `harbour.png`, `night.png`, `night-harbour.png`;
live engine + HUD — `live-overview.png`, `live-follow.png`, `live-director.png`, `live-director2.png`.
Dev hooks: `window.__scene.flyTo(pos, target)` and `window.__sceneDebug()` (camera/focus/fade dump).

## Store changes I'd like (not made — store.ts is not mine)

1. `ui.hoverLocationId` / `ui.selectedLocationId` + `selectLocation(id)`: buildings are hoverable
   and clickable in the scene, but there is nowhere to put a location selection for a HUD card
   (today hover lives in a scene-internal `hoverState`).
2. A wall-clock `receivedMs` on `WorldEvent` (or the store stamping events in `applyFrame`), so
   the director's "recent events" window doesn't rely on its own first-seen map.
3. `SimTime.speed` is used to interpolate the clock between ticks (`content.simHour()`); if the
   engine ever sends `speed` in different units, only that helper needs changing.
4. Optional: `ui.directorFocus.key` so the HUD can dedupe banners the same way CameraRig does.

## Wishlist / next

- Navmesh / road-following paths so walkers don't cut through buildings (engine or viewer).
- Weather particles and a seasonal palette (hooks exist in `palette.updateSky`).
- LOD: hide NPC eyes/hats beyond ~120 m (cheap win if draw time matters on very weak GPUs).
