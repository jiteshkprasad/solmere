# Environment + lighting — notes for the other agents

Owner: environment/lighting agent. Files: `scene/Town.tsx`, `scene/terrain.ts`, `scene/Atmosphere.tsx`,
`scene/palette.ts`, `scene/Scene.tsx`, `scene/env/**`.

## Terrain model (`terrain.ts`)

Everything is a pure function of metre coordinates `(mx, my)` from town.json; world `x = mx`, `z = -my`,
`y = terrainHeight(mx, my)`. Geography:

- **Sea** lies west of `mx ≈ 0` (`westLine(my)`) and north of `my ≈ 303` (`northLine(mx)`). `coastDist(mx,my)`
  is the signed distance to the coastline (positive on land). `WATER_Y = -0.45`.
- **Shore zones** (`shoreZones`): a sandy bay/beach along the north coast for `mx 18–92` (gentle sand slope,
  sand ripples, water line ~`my 300`), harbour **quays** on the west coast for `my 228–294` (flat, 1.1–1.4 m,
  a 14 m inlet brings the water to `mx ≈ 11` at `my ≈ 277` next to the docks), low **cliffs** (2–4.4 m)
  everywhere else, and the rocky **lighthouse point** (`pointWeight`, ~6.5–7.5 m plateau around (8,302),
  with a reef in the water).
- **Land levels**: harbour 1.2–1.7 m, beach ≈ 0, Main Street 2.7–3.4 m, square/town hall 3.7–4.1 m
  (the whole street grid varies < 1.5 m). The **farm hill** (`hillWeight`, centred (245,22), σ 58) lifts the
  farms to 13–15 m (orchard/cottage ~15 m, Reyes room ~8 m). Backdrop ridges (16–22 m) sit beyond the map
  edge to the south and east, then the land drops back into the sea far away.
- Undulation: 4-octave fbm (`env/noise.ts`), damped in town (`townWeight`), stronger on the hills; ridged
  noise adds rocky outcrops on the hill crest and ridges.
- `POND` (Tide Park, centre (100,68), r 6.5) is a 1 m dip; `POND_Y` is its water surface.
- Helpers: `terrainSlope`, `townWeight`, `pointWeight`, `westLine`, `northLine`, `toWorld`, `worldToMetres`.
- Roads: `ROAD_SPECS` (polyline + `kind: cobble|tarmac|dirt` + width), `ROADS` (polylines only, unchanged
  shape), `roadDist`, `roadDistKind`, `sampleRoad`. Cobbled: Main Street, square links, Workshop Row, Salt
  Lane, Gull Lane, chapel/south lanes; tarmac: harbour road, shore road, docks; dirt: hill track, orchard
  spur, lighthouse path, school→park.
- Kept for API stability: `buildGroundGeometry`, `buildPatchGeometry` (now with uvs), `buildRoadGeometry`
  (now `(width, yOff, roads?, offset?, widthOverride?)`, uv.x across / uv.y along).

Everything that sits on the ground should sample `terrainHeight`. Cliff faces are 4.5 m wide ramps at the
coast, so keep props ≥ 5 m from `coastDist = 0` unless they are meant to be on the beach/quay.

## Vegetation (`env/scatter.ts`, `env/flora.ts`, `env/Vegetation.tsx`)

The environment generates its own plants (layout.ts's `trunks/conifers/broadleaf` lists are **not**
rendered any more; `L.fields` and `L.crops` still are — fields as furrowed patches, crops as a small
3-cone plant). Exclusions: building footprints from `layoutTown().buildings` (spec w/d/yaw + margin),
`L.fields`, roads (`roadDist`), the plaza (`PLAZA` in `env/Roads.tsx`: 46×56 m at (150,121)), the pond,
the docks area, and a "gathering" radius around every location so the director's orbit stays clear.

Species (one InstancedMesh each): oak, pine, coastal wind-bent pine (leans inland), poplar, bush, hedge,
flower cluster (5 colours via instance colour), reed, grass tuft, rock, boulder, driftwood, crop.
Instance colours multiply only vertices flagged `aTint` (canopies), trunks keep their colour. Wind sway is
a vertex-shader patch (`env/materials.ts: windTintMaterial`) driven by `envUniforms.uTime/uWind`; the
storm sets `uWind ≈ 2.6`.

## Sky / lighting (`palette.ts`, `Atmosphere.tsx`, `env/SkyDome.tsx`, `env/Clouds.tsx`)

`sky` (module-level, updated every frame by `<Atmosphere/>`) keeps its old fields (`top, horizon, sun,
ambC, hemiSky, hemiGround, sunI, amb, fogFar, night, sunDir, moon, hour`) and adds:

- `mid` (mid-sky colour), `exposure` (renderer tone-mapping exposure), `sat` (post grade),
- `storm` 0..1 — eased from the world's `activeWorldEvents` (card id `storm` or title /storm/i). Use it for
  wet surfaces, wind, boats staying in, etc. Puddles on the roads appear with it.
- `moonPhase` 0..1 (0.5 = full; derived from `time.day`), `sunElev` (sin of the sun altitude, negative
  at night).

Keyframes: night (0–4.7), pre-dawn blue hour 5.5, pink/orange dawn 6.3, morning 7.6, noon 12, afternoon
16.5, golden hour 18.2, purple dusk 19.1, blue hour 20.1, night from 21.6. Sun rises east (+x) at
`SUNRISE = 5.6`, sets west at `SUNSET = 19.0` (exported from palette.ts), arcs through +z; the moon rises
in the east after sunset and crosses the sky over the night.

Lights: one shadow-casting directional (sun or moon, 4096 PCFSoft map — `?shadow=2048` for slow
software GL), hemisphere + ambient tinted from the keyframes. The shadow camera follows the point the
camera looks at (ray → ground) and tightens from ±215 m (overview) to ±45 m (street level). Fog is linear,
colour = horizon; thicker at dawn and during a storm. Sky dome shader: 3-stop gradient, sun aureole,
low-sun horizon band, faint Milky Way band at night; 3000 stars (half along the band); sun disc + additive
glow billboard; moon billboard with phase + maria; two cloud decks (fair-weather at y 245–300, a storm
deck that scales in at y 170–250).

## Post-processing (`env/Effects.tsx`, `env/perf.ts`)

EffectComposer (postprocessing 6 / @react-three/postprocessing 3): N8AO (half-res, "performance") →
Bloom (threshold 0.82, intensity 0.32 day → 0.77 night, mipmap blur) → DepthOfField (only in follow /
director mode; bokeh fades out when the subject is > 75 m away) → HueSaturation + BrightnessContrast
(shift with `sky.sat`, night, storm) → Vignette → ToneMapping (ACES, uses `gl.toneMappingExposure` =
`sky.exposure`) → SMAA. MSAA is off (`antialias: false`), dpr `[1, 1.75]`.

Quality tiers (`useQuality()`): 2 = everything, 1 = no AO/DoF, 0 = grade + tone map + SMAA only. The tier
drops when WebGL2 or float render targets are missing, or when the fps average stays < 40 for 3 s.
`?q=0|1|2` forces a tier.

For the DoF focus, `Town.tsx` installs `dofFocus.provider` (env/focus.ts) using `npcRender` + the
director focus; env/ itself does not import the NPC runtime.

## Dev hooks / measuring

- `window.__envInfo()` → `{ frame: {calls, triangles}, environmentOnly: {calls, triangles}, groundTriangles,
  quality, fps, hour, storm }` — renders one plain frame (shadow pass included) with, then without,
  buildings + life.
- `/dev-scene?hour=<h>&shadow=2048&q=1` — smaller shadow map / lower post tier for software-GL screenshots.

## Numbers (measured with `__envInfo`, 1280×800, mock world, tier 2)

- Whole frame (buildings + life + NPCs + environment, shadow pass included): **237 draw calls, ~0.99 M triangles**.
- Environment only (buildings + life hidden; NPCs + sky still in): **70 draw calls incl. the shadow pass
  (~35 without it), ~0.52 M triangles** — ground 77.6 k tris (single mesh), water 1 mesh, roads 5 meshes,
  fields 4, vegetation 13 InstancedMeshes (~2 500 instances: 300 trees + 260 backdrop trees, ~250 bushes,
  ~420 flower clusters, ~330 reeds, ~900 grass tufts, ~200 rocks, 70 boulders, 14 driftwood, crops),
  sky dome + stars + sun + glow + moon + clouds = 6.
- Post stack: composer with 7 effects merged into 3–4 passes (N8AO is its own pass).
- fps could not be measured on this box (software GL, shared with three other agents' renders: 1–2 fps);
  the fps monitor is what protects an integrated GPU (drops AO + DoF after 3 s under 40 fps, then bloom).

## Known limits / ideas

- No god rays (GodRays needs `autoClear={false}` + an extra occlusion pass; skipped for perf).
- The water has no reflections of buildings/boats (sky-only fresnel + glints).
- Cloud shadows are off; the storm deck simply darkens the light.
