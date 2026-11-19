# Life notes — `apps/web/src/components/scene/life/**`

Ambient life + VFX: everything that moves or lives in Solmere that is not a person or a
building. Mounted by `Town.tsx` as `<Life town={town} />`. Owned files: `life/**` only.

## Files

| file | what |
|---|---|
| `index.tsx` | composition root. `<LifeClock/>` (useFrame priority −1) refreshes `lifeState` before every other system; dev hook `window.__life` (see below). |
| `state.ts` | `lifeState` — the one shared, allocation-free record every system reads inside its own `useFrame`: sim hour/day, night, wall-clock `t`, wind (`windDir`, `wind`, `gust`), `wetness`, `lightning`, the active event flags, camera position / look / ground focus, tide. Helpers `nearCamera`, `nearestNpc`, `npcWithin`, `hourIn`, `ramp`. |
| `util.ts` | `buildGeo(parts)` → one merged, flat-shaded, vertex-coloured geometry per creature/boat (`vcMat()` is the single shared material); `windMaterial(mode)` — MeshStandardMaterial with an `onBeforeCompile` vertex injector (0 flag, 1 hanging cloth, 2 bird wings, 3 four-legged gait; per-instance `aPhase = (phase, amplitude)`); `useCull(ref, x, z, r)` — distance check against the camera every 0.5 s toggling `visible`; instancing helpers. |
| `particles.tsx` | ONE instanced soft-quad ShaderMaterial for smoke / steam / mist / dust / fire (≤ 300 quads, `MAX_PARTICLES`). Fully GPU-driven: position/size/alpha are functions of `uTime`, the emitter position and a seed; the CPU only writes buffers when an emitter fades on/off (every 0.5 s) or moves (the ship funnel). `emitter(id, x, y, z, kind, count)` registers a slice; set `.target` 0..1. |
| `smoke.tsx` | emitter placement + schedules: chimneys (from `L.chimneys`, attributed to the nearest building; else derived from `spec.chimney`), Meena's kettle, the café vent, fountain mist, heat-haze dust. |
| `sea.tsx` | fishing boats, moored boats, the Cormorant, wake foam, fish jumping at dawn, the boat_launch rowboat. Exports `boatPositions` (read by the gulls) and `shipState`. |
| `birds.tsx` | one instanced bird mesh (wing flap in the shader) for gulls, sparrows, the dusk skein, bats and crows; `<Owl/>` on the chapel tower. |
| `cloth.tsx` | flags (streaming downwind, drooping in calm air) + washing lines with shirts/sheets. |
| `animals.tsx` | cat, dog, chickens (+ coop), cows, sheep, horse & cart, ducks, crabs, butterflies, fireflies (Points shader), lamp moths. |
| `weather.tsx` | rain (GPU streaks in a box that follows the camera/focus), ground splashes, lightning light, lighthouse foghorn pulse, clinic lamp, tavern lantern, pier crates, heat-haze band. |
| `festival.tsx` | bunting + Main Street lanterns (LineSegments strings + instanced pennants/lanterns), stage with a banner, confetti, fireworks (Points shader, 5 bursts × 110), beach bonfire (fire + smoke emitters + flickering light). |
| `beats.tsx` | chapel bell swing + ring wave, leaves across the square, a paper sheet on gusts. |

## How each system ties to the sim

Time comes from `content.simHour()` (fractional, interpolated) → `lifeState.hour`; events from
`snapshot.activeWorldEvents[].cardId` → `lifeState.events` + boolean flags (rebuilt only when the
array identity changes). Wall-clock `t` drives animation; sim hour drives *schedules*.

| system | schedule / trigger |
|---|---|
| fishing boats (3) | moored in the **first three `L.mooredBoats` slots alongside the pier** (the rest of that array stays as scenery). Depart 05:00 / 05:42 / 06:24, 1.1 sim-h out via the pier head (−34, −277) → (−46, −284) → (−62, −318) to three grounds west of the point, fish (slow drift) until 13:12 / 14:00 / 14:42, 1.1 sim-h back. Position is `idealPos(hour)` chased at ≤ 7 m/s so a clock jump (sleep block, `?hour=`) never teleports. **storm → moored** (they head home at once if caught out). Wake foam spawns astern while speed > 0.25 m/s. Moored boats bob (×2.2 in a storm). |
| Cormorant | sails in along `SHIP_IN` from the south-west when `ship_visit` becomes active (~75 s real time, eased), berths **across the head of the pier at (−46, −277)**, bow to +z; the gangway (−38.6, −277) bridges the 7 m from the pier head up to her deck; funnel smoke heavy under way / a wisp when berthed; leaves along `SHIP_OUT` when the card ends. |
| gulls | 14 by day (24 on `big_catch`, 7 in a `heatwave`, 10 higher + faster in a `storm`, 0 at night); behaviours: circle the harbour mouth (−6, −288), escort a boat that is at sea, perch on the pier pilings (z = −277 ± 2.3, x = +10 … −35) or the lighthouse gallery (no flap, face into the wind); glide phases. |
| sparrows | 8 on the square 07–dusk, hop about; an NPC within 3.2 m → they burst up to a lamp/tree perch and return 6–14 s later. |
| dusk skein | 11 birds in a V, 17:54–19:36, cross east→west at 58 m (70 s crossing, 40 s gap). |
| bats | 8 around the lighthouse lamp, 20:18–05:00 (night > 0.5). |
| crows | 12 on the lower Lindqvist field while `poor_harvest`, pecking + short hops. |
| owl | chapel tower, night > 0.7; every 21 s a "call" bob with brighter eyes; head turns every 7 s. |
| chimneys | bakery 04–18, tavern 16–01, brewery 07–17, inn 06–10 & 17–23; homes: breakfast (≈06:00–08:30) and dinner (≈17:30–21:00) windows jittered per house, ~45 % keep a fire on late on cold nights; all homes off in a heatwave. Smoke bends with `windDir * wind`. |
| steam / mist | kettle 06–19, café 07–21, fountain mist always (off in a storm); heat-haze dust over the square and fields 10–18 on `heatwave`. |
| flags | always; direction = `windDir`, wave speed ∝ `wind`, droop when wind < 0.9. Pier-end pennant added. |
| laundry | 07:30–19:30, hidden in a storm. |
| cat | patrols the Main Street pavement (x 112–208, z ≈ −184), sits 4–16 s; 13:00–16:30 (or storm) curls up on the bakery step — the bakery is at (120, −190) yaw 0, 11 × 9, so the step is (121.4, −184.9). |
| dog | heels the nearer of `tunde_okafor` / `per_lindqvist` (re-picked every 2 s, from `npcRender`), sits facing them when they stop; lies by the quay when neither is visible. |
| chickens / cows / sheep | wander-then-graze inside rectangles (coop yard around (197, −44); cows 170–190 × 30–46; sheep 279–296 × 40–58), gait shader while moving. |
| horse & cart | on the orchard spur road (231, −48) while `bumper_orchard`. |
| ducks | 3 floating on the park pond — the env layer carves it at `POND` (100, 68) with its surface at `POND_Y`, and the ducks read both from `../terrain` rather than guessing. |
| crabs | 6 on the beach waterline when `tide < 0.45` (low ≈ 10:00–16:00), sideways skitters. |
| butterflies | 16 over the park / orchard / square, 07:30–18:48 ramped; 55 % normally, 100 % in a heatwave, none in a storm. |
| fireflies | 90 points in the park + orchard, 20:00–04:30 and night > 0.55. |
| moths | 3 per lamp at the 6 lamps nearest the square, night; + the tavern lantern on `open_mic`. |
| rain | `storm`: 3600 GPU streaks in a 90 m box centred between the camera and its ground focus, lean/drift with the wind; opacity fades in over ~2.5 s. 160 splash rings around the focus point. |
| lightning | every 10–20 s in a storm, a double-strike flicker (0.36 s). Three things fire together: `lifeState.lightning` 0..1 (for anyone else who wants it), a point light (320 k cd, decay 2) out over the sea, a `hemisphereLight` spike so the town catches the flash, and an additive **upper-hemisphere dome** pinned to the camera so the sky itself goes white. The env layer does not read `lifeState.lightning`, so the sky flash is done here. |
| wetness | `lifeState.wetness` ramps 0→1 over 20 s of storm, dries over 3 min. |
| foghorn | in a storm the lighthouse lamp pulses (additive sphere) every 8 s. |
| illness | clinic lamp blinks red. `big_catch` 12 full fish crates on the inshore half of the pier deck (x 8.5 → 1.8, z −277 ± 1.15); `ship_visit` 12 cargo crates landed by the berth at the pier head (x −21 → −36) + gangway. `open_mic` warm flickering lantern by the tavern door 18:30–01:30. `heatwave` shimmering haze band over the hill fields 10–18. |
| festival | bunting on the square, lanterns on Main Street (emissive ∝ night, swinging), stage + banner at (131, −114.5) on the square paving — **not** on the centre line, where the town hall's front wall (z ≈ −111) and the fountain (z −115…−125) would swallow it — confetti 20:00–21:12, fireworks 21:00–22:00 over the harbour with a coloured flash light, beach bonfire 18:30–02:00. Everything on the square is placed at the square's paved deck height (`L.buildings[town_square].y`), not raw `terrainHeight`. |
| bell | 06:00 / 12:00 / 18:00 → 13 s swing (envelope) + expanding additive ring wave every 1.05 s. `bellState.ringing` exported. |
| leaves / paper | 44 leaves on the square move when `wind*0.9 + gust*4.5` beats their inertia, skip along the ground, recycle upwind; a paper sheet takes off from the camera's focus when `gust > 0.75`, flies ~7 s. |
| fish | 05:12–07:36, 6 fish arc out of the harbour water with splash foam. |
| boat_launch | rowboat at (74, −305) when the card is active or from day 12. |

## Contracts with the other agents

- Reads `TownLayout` defensively: `L.chimneys: {x,y,z}[]` (attributed to the nearest building for
  the schedule), `L.laundryLines: {x,y,z,ry,len}[]`, `L.flagPoles: {x,y,z,h}[]` (base + height),
  `L.mooredBoats: {x,y,z,ry,kind}[]` (rendered here as bobbing hull+fittings instances, tinted by
  kind). When an array is missing/empty the life layer derives its own (chimneys from
  `spec.chimney`, flags from `spec.flag`, six hard-coded laundry lines). `lampGlobes`/`lampPosts`
  are used for the moths.
- **Buildings agent:** the pier geometry in `kinds/harbour.ts` is load-bearing for this layer. The
  docks location sits at (20, −275) yawed π/2, so **world x = 20 + localZ, world z = −275 − localX**:
  the deck runs along **z = −277 from x = +12 (quay) out to x = −34 (pier head)**, pilings at
  z = −277 ± 2.3 with tops at y ≈ 0.95, deck top at y ≈ 0.71. Gull perches, the `big_catch` and
  `ship_visit` crates, the Cormorant berth and her gangway are all derived from those numbers — if
  the pier moves, tell this layer. The **first three `L.mooredBoats` slots are taken by the working
  fishing boats** (so those berths stand empty while the fleet is at sea); slots 4+ are rendered
  here as static bobbing scenery. The Cormorant lies across the pier head at (−46, −277), clear of
  every `mooredBoats` slot. The two hard-coded boats in `Docks` and the static flag box in
  `Building` would overlap the animated ones — please keep them unmounted.
- **Env agent:** `lifeState.wetness` (0..1) for a wet-ground sheen, `lifeState.lightning` (0..1) for
  a sky flash, `lifeState.storm/heatwave/...` flags and `lifeState.windDir/wind/gust` if the
  clouds/flora want to agree with the smoke and flags. Import from `components/scene/life/state`.
- `npcRuntime.npcRender` is read (never written) for the dog and the sparrows.

## Budget — measured

`gl.info.render.calls` swings by ~100 from frame to frame because `Scene.tsx` rebuilds the shadow
map only every Nth frame, so a single-frame delta is noise. `window.__life.lifeCalls(n)` samples a
run of `n` frames with the life group shown and another with it hidden, and compares the cheapest
frame of each (the colour pass) and the dearest (the frame that also rebuilt the shadow map):

| scene | life colour pass | life incl. shadow pass | visible life drawables |
|---|---|---|---|
| town square, 22:00, no events | **+20** | **+34** | 24 |
| harbour, 15:00, `storm` (rain + splashes + lightning) | **+16** | **+20** | 20 |

Budget is ≤ 100, so there is a lot of headroom. `window.__life.meshes().count` (the drawables in
the life group that are actually visible) runs 15–32 across every shot taken: 15 on the hill farms,
19–24 around town, 26 with `festival` dressing, 31–32 with fireworks/confetti as well. Instance
counts: rain 3600 (cap 4000), particle quads 560 with 356 allocated, birds 63, foam 96, splashes
160, confetti 220, fireworks 550 points, fireflies 90 — every one of those is a single draw call.

Nothing in `useFrame` allocates: module-level `dummy`/`tmpC`/`tmpV` scratch objects, instance
buffers written in place, `useCull` toggling `visible` on a 0.5 s interval rather than per frame,
and event-only sets staying `visible = false` until their card is active.


## Dev hook

`window.__life`, non-production only (`process.env.NODE_ENV === "production"` returns early):

| call | what |
|---|---|
| `state` | the live `lifeState` record |
| `layout` | the `TownLayout` this layer was built from |
| `setEvents(["storm","festival"])` | writes `snapshot.activeWorldEvents` |
| `setHour(21.5)` | jumps sim time (boats chase rather than teleport) |
| `lifeCalls(frames = 40)` | sampled draw-call cost — see **Budget** above |
| `breakdown()` | same sampling, hiding one child of `<group name="life">` at a time |
| `meshes()` | every drawable in the life group that is visible right now |
| `particles()` | quad-pool usage and the per-emitter activity |
| `scare(x, z, ms)` | drops a phantom pedestrian into `npcRender` so the sparrow-scatter rule can be screenshotted, then removes it |
| `flash(holdSeconds)` | fires a lightning strike now; `holdSeconds > 0` pins it at full brightness long enough to screenshot (swiftshader needs ~10 s per frame grab) |

Screenshot recipe: `NEXT_PUBLIC_MOCK_WORLD=1 next dev`, then `/dev-scene?hour=N` +
`__scene.flyTo([x,y,z],[tx,ty,tz])` + `__life.setEvents([...])`. Two frames ~0.6 s apart prove
motion. Shots live in `apps/web/screenshots/life2-*.png`.

## Verified

Every system below was screenshotted on a running scene (`screenshots/life2-*.png`):

| # | shot | what it shows |
|---|---|---|
| 1 | `20-pier-17-moored`, `21-pier-06-leaving`, `12-harbour-14-return`, `22-pier-storm` | fleet at the pier at 17:00; blue + green boats gone and yellow still alongside at 06:18; blue one back with a wake at 14:10; all three pinned to the pier through a storm |
| 2 | `23-ship-visit` | the Cormorant berthed across the pier head with her gangway down |
| 3 | `11-harbour-08-atsea`, `66-big-catch` | gulls circling the harbour and following the boats; `50/51-sparrow-scatter-before/after` — sparrows on the paving, then airborne when `scare()` puts a pedestrian on them |
| 4 | `31-mainstreet-cat`, `52-cat-bakery`, `41-square-sparrows` | bakery chimney smoking at 14:00, fountain mist on the square |
| 5 | `62-festival-day`, `42-laundry-close`, `35-laundry-storm` | bunting across the square; washing on the lines; lines bare in a storm |
| 6 | `52-cat-bakery`, `43-cows`, `32-farms`, `55-pond-ducks`, `61-night-park-fireflies` | cat asleep on the bakery step, cows grazing the hill field, sheep + coop, ducks on the pond, fireflies in Tide Park at 22:20 |
| 7 | `67-storm-lightning` vs `68-storm-flash`, `65-heatwave`, `62-festival-day`, `63-festival-confetti`, `64-festival-fireworks-b`, `66/66b-big-catch` | rain and a held lightning flash; heat haze; bunting + stage; confetti; a firework bursting over the sea; extra gulls and full fish crates on the pier |
| 8 | — | `lifeCalls()` numbers in **Budget** above |
