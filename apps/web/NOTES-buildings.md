# Buildings & places notes — `apps/web/src/components/scene/buildings/**`

Everything under `buildings/` is procedural (no assets). All 58 locations in `content/town.json` are built by a
kit into ONE merged, vertex-coloured, flat-shaded geometry per location; repeated props are instanced; every
sign is painted into one canvas atlas. One material draws all of it (plus one for the sign atlas).

## Files

| File | What it does |
|---|---|
| `kit.ts` | `GB` geometry builder (positions / flat normals / vertex colour / `glow` attribute, transform stack, auto-oriented convex polyhedra, chamfered `box`, `cyl`, `sphere`, `poly`) + architectural elements: `walls` (bevelled box with stone plinth, optional timber frame, stone quoins, clapboard strips, random stone blocks, storey band, and a real **door opening with a room behind it**), roofs (`roofGable` Λ-band with thickness, fascia/bargeboards, tile rows, ridge cap, thatch, corrugated; `roofHip` (+pyramid) with hip caps; `roofMansard`; `roofShed`; `roofFlat` with parapet & coping), `gableEnds`, `dormer`, `chimney` (cap + pots, returns the top), `windowEl` (frame, recessed pane, mullions, sill, shutters, flower box), `lancetWindow` (stained glass, 4 glow colours), `doorEl` (frame, panelled leaf or swung-open leaf, knob, fanlight, step), `steps`, `porch`, `balcony`, `awning` (striped, scalloped), `lantern`, `drainpipe`, `column`, `pediment`, `picketRun`, `stoneWallRun`, `hedgeRun`, `path`, `flagpole`, `benchEl`, `barrel`, `crate`. |
| `materials.ts` | `townMaterial()` — the single `MeshStandardMaterial` (vertexColors, flatShading) with an `onBeforeCompile` patch: `attribute vec3 glow` → `totalEmissiveRadiance += glow * (0.05 + 1.45 * uNight)`. `updateNight(sky.night)` is called every frame by `<Buildings/>`. `signMaterial(tex)` — atlas map + emissive map (signs stay readable at night). |
| `signs.ts` | `SignAtlas` (2048² canvas, shelf-packed, 128 px/m): `board` (wood grain + gold border + pictogram + name), `hanging`, `modern`, `chalk` (menu boards), `tolet`, `notice` (pinned papers), `clock`, `post`, `warning`. Pictograms drawn with canvas paths: anchor, scissors, loaf, crest, key, fish, wrench, keg, cup, tea, needle, cross, letter, house, hammer, apple, book, bell, boat, star. `buildSignGeometry()` → one mesh of textured quads (two quads for hanging/free-standing signs so text reads on both sides). Weathering = speckles + darkened bottom gradient. |
| `props.ts` | 45 instanced prop kinds (`PropKind`), each built with the kit at the origin: lampPost (with glowing lantern), bollards (iron/stone/wood), barrel, keg, crate, hayBale, headstone, bin, planter, chair, table, umbrella, railPanel, picketPanel, lobsterPot, bike, bench, kerb, oilDrum, tyre, sawhorse, pallet, sack, bucket, basket, ladder, reeds, shrub, bikeRack, trafficCone, pew, breadRack, stoneCross, logPile, milkChurn, cleat, ropeCoil, netFrame, stool, flowerClump, trough, parasol, windowBox. One `InstancedMesh` per kind. |
| `layout.ts` | `BuildingSpec` table per location (sizes, colours, roof, archetype, explicit yaw, render offset `off` for locations that sit on a road), `layoutTown(town)` (memoised per town object — Town.tsx and `<Buildings/>` share one layout), the builder `Ctx` (local→world helpers, `prop/sign/chimneyTop/laundry/flag/window/door/bench/tree/crop/lamp/boat` recorders), footprints for camera/NPC collision, kerbs along the main roads, lamps, scatter trees. |
| `kinds/common.ts` | `stdBuilding(ctx, opts)` — the parametrised standard building (walls, roof, windows with hashed warm/cool/dark glow, door + step + flagstone path, chimneys, dormers, name board with two little gooseneck lamps, hanging sign on a bracket, wall lanterns, awning, drainpipes, room behind an open door). Also `shed`, `laundry` (poles + line; exported), `vegPatch` (crops go to `L.crops`), `flowerBed`, `externalStair`. |
| `kinds/shops.ts` | bakery, general store, café + flat above, tavern + Costa's room, barber, tailor, brewery, carpentry, garage, inn, tea stall, bank, Vale Property. |
| `kinds/civic.ts` | town hall, clinic, school, chapel (+graveyard), post office, harbourmaster's office, fish market. |
| `kinds/homes.ts` | `house()` with archetypes cottage (thatch) / timber-frame / stone / clapboard / harbour (tall, narrow, gable to street, hoist beam) / villa / farmhouse / cabin, plus `rental()` for the Vale rooms; `garden()` (hedge / picket / stone-wall boundary with a gate, path, flower beds, veg patch, shed, laundry, bins, bike, log pile, shrubs). |
| `kinds/harbour.ts` | docks (quay, pier, crane, fuel pump, nets, pots, hut, signs, moored boats), `boatGeometry()` (trawler / old skiff / sloop hulls), lighthouse, the Old Net Loft studio, the beach. |
| `kinds/farm.ts` | the two barns with yards (tractor / hay cart, bales, troughs, chicken coop, sheep pen, well, pump, dovecote), the disputed boundary (irrigation channel with banks, plank bridge, sluice, boundary stone, rival signs, broken fence), the orchard store (press, wheelbarrow, ladders, baskets, apples on the trees). |
| `kinds/open.ts` | town square (cobbles following the terrain, tiered fountain, memorial column, notice board, phone box, planters, benches, bike rack, well head, flower beds) and Tide Park (dresses the environment layer's pond at `POND`: rim stones, lily pads, jetty, benches; bandstand, winding path, bird bath, shrubs, sign). |
| `index.tsx` | `<Buildings town/>`: one mesh per location (hover via a cheap bounding-box `raycast` override → `hoverState.locationId`), instanced props, sign mesh, 8 point lights (6 street + tavern & inn lanterns; everything else is emissive), fountain spray, lighthouse beam, `window.__bldInfo()` (draw calls / triangles). `MooredBoats` is exported but not mounted — the life layer renders `L.mooredBoats`. |

## Per-location list (what was built)

- **Harbour** — Fish Market: open-sided hall on timber posts, tiled roof with clerestory, striped side awnings, four ice counters with fish, hanging scales, buckets, crates, barrel, chalk price board, net frame, name board. Harbourmaster: clapboard office, hip roof, roof lookout with railing, signal mast + flags (exported flag pole), life ring, tide board, bench, bollard, rope. Docks (turned to face the harbour cove; the pier runs west): stone quay with cobbles, fenders, iron ladder, 46 m plank pier on pilings with bollards & cleats, hand crane with crate on the hook, fuel pump, oil drums, net frames, lobster pots, crates, rope coils, tarred harbour hut with notice board, "DEEP WATER" sign, pier lamp, four moored-boat slots exported in `L.mooredBoats` (hull builders for a trawler with lit wheelhouse, an old patched skiff and a sloop live in `boatGeometry()`; the life layer draws them).
- **Main Street** (all face the road) — Okafor's Bakery: cream walls, terracotta tiled gable, chimney with pots, dormer, big bread-display window, striped awning, name board + hanging loaf sign, bread racks, delivery bike, flour sacks, bench, lantern. Rao General Store: two-storey sage clapboard, hip roof, full-width porch with deck, name board standing on the porch roof, display windows, crates/sacks/basket/barrel, chalkboard, bike rack. Café Moreno: pink two-storey with mansard roof, dormer-less but shuttered upper windows with flower boxes, burgundy striped awning, cup sign, five tables with chairs & umbrellas, planters, two strings of fairy lights on posts. Flat above Café: rear annex with first-floor door, landing, outside stair, window box, bike, bin, chimney. The Drowned Anchor: big dark timber-framed tavern, slate roof, two chimneys, two dormers, open double door revealing a lit bar with lamps, hanging anchor sign, name board, two lanterns (one point light), barrels, kegs, stools, an upturned-barrel table with tankards, ship's wheel on the gable, lobster pots. Costa's room: rear annex with outside stair, kegs, crate. Sal's Barbershop: pale blue, red hip roof, red/white awning, barber pole (striped rings, glows at night), scissors sign, bench, planter. Achebe Tailoring: mustard stepped-gable (Dutch) house with quoins, bay window with a dressmaker's dummy, purple awning, needle sign, window boxes.
- **Workshop Row** — Kowalski Brewery: ochre walls with quoins, big open doors onto copper kettles, silo with ladder & cap, loading dock with kegs and pallets, hop bines, keg sign, lantern (point light). Brand Carpentry: timber-framed workshop, corrugated roof, open bay with workbench and tool board, three timber stacks, sawhorses with a plank, log piles, sawdust patch, hammer sign. Demir Garage: grey flat-roofed workshop with roller-door track, open bay with engine hoist, workbench and tool board, van on blocks with wheels off, tyre stack, oil drums, outboard engine on a stand, oil stain, fuel pump, traffic cones, wrench sign.
- **Town Square** — Town Hall: two-storey stone with quoins, four-column portico with pediment, terrace and steps with railings, cupola with clock faces on two sides, two chimneys, flagpole (exported), notice board, benches, planters, "Town Hall" crest board. Ashdown & Co. Bank: grey stone, parapet, four-column portico with pediment and crest medallion, raised platform with broad steps and iron railings, open door onto a vault door with spoked wheel and counter, crest sign, lanterns, stone bollards. Solmere Clinic: white, flat roof with parapet, red cross on the parapet, glowing red-cross lamp, ramp with handrails, entrance canopy, bench, oxygen bottles. Post Office: blue trim, red pillar box, letter slot, postman's bike, parcel crates. Vale Property: charcoal box with big glass front (cool glow), property cards in the window, gold "VALE PROPERTY" board, TO LET board on a post, clipped shrubs on gravel. The Fontaine Inn: cream two-storey with burgundy hip roof, first-floor balcony with railing, four flower boxes and a hanging lantern, name board on the balcony, "ROOMS" hanging sign, porch canopy, two chimneys, lanterns (point light), benches, planters. Meena's Stall: painted tea cart on two big wheels with shafts, scalloped yellow/orange canopy, kettle on a burner, cups, glass stack, biscuit tin, marigold garland, chalk menu, stool, crates. Town Square itself: cobbled paving with ring pattern, three-tier octagonal fountain (segmented basin so the water shows) with animated spray, war memorial column with wreath, notice board, red phone box (lit at night), planters, seven benches, bike rack, bins, well head, flower beds.
- **Gull Lane** — Schoolhouse: clapboard with a bell in a belfry on the ridge, playground (swing, seesaw, hopscotch) inside a picket fence, flagpole (exported), bike rack, book sign. Chapel of the Tides: stone nave with quoins and buttresses, lancet stained-glass windows (glow in four colours), rose window, tower with belfry openings, bell, spire and cross, clock, open doors onto pews and an altar with candles, lanterns, graveyard with low stone wall, gate, 12 headstones, stone cross and a yew. Tide Park: the environment pond dressed with rim stones, lily pads and a jetty, four benches round it, an octagonal bandstand with railings and a music stand, winding flagstone path, bird bath, shrubs, park sign. Rectory: stone cottage. Homes: Okafor (thatched cottage), Rao (clapboard), Halvorsen (timber-frame), Vale (villa with columns and terrace), Ashdown (stone, hip roof), Achebe (stone), Volkov (clapboard) — each with its own garden (boundary, gate, path, beds, veg patch, shed, laundry, bins, bike).
- **Salt Lane / rentals** — Moreno (stone, 2 storeys), Kowalski (timber-frame), Romano (timber-frame), Demir & Brand (clapboard), Finch (thatched cottage); rentals owned by Marcus Vale (Kimura–Moreno flat, Rahman flat, Pillai / Whitlock / Ferreira / Diallo / Tanaka rooms, Reyes cabin): dull render with peeling patches, flat or shed roofs, outside stairs and mean landings, bins, a broken crate, tyre, bike, scrappy laundry, some with a "VALE PROPERTY — ROOMS" board.
- **Hill Farms** — Lindqvist barn (red, battened boards, corrugated roof, cupola, open doors with hay, loft door with hoist, lean-to, milk churns, ladder) with tractor, hay bales, trough, chicken coop with hens in a run, water pump, farm sign, laundry; Haddad barn (ochre) with hay cart, sheep pen with sheep, well, dovecote, herb pots, farm sign, laundry; the disputed boundary between them (irrigation channel with banks, plank bridge, sluice gate, boundary stone, "LINDQVIST LAND" and "PRIVATE — HADDAD FARM — KEEP OUT" signs facing each other, broken fence); McBride orchard store (apple crates, baskets, ladders, cider press, wheelbarrow, apples on the trees, ladders & baskets under trees) and the Lindqvist/Haddad farmhouses (porches) and McBride's thatched cottage.
- **Shore** — The Old Net Loft: weathered grey clapboard on a stone plinth, north-light studio window and skylight, hoist beam, open door onto a lit interior, deck on stilts over the shore with railing, two easels with canvases, paint pots, stool, stacked canvases, steps to the sand, gravel yard with bike. Beach: four striped parasols with towels, lifeguard chair with flag and life ring, two upturned boats, driftwood, rocks, bucket & spade, striped beach hut, benches. Lighthouse: rock base, tapered red/white banded tower with door and windows, railed gallery, glazed lantern room (glows), dome with vent and weathervane, keeper's shed with chimney, coal bunker, flag mast, picket fence, path, rotating beam at night.
- **Streets**: kerb stones along Main Street, the square roads, Workshop Row, the harbour road, Salt Lane and Gull Lane; 22 street lamps (instanced, glowing lanterns; 6 carry point lights).

## Layout fields added to `TownLayout` (all additive; existing fields kept)

- `built: Map<id, GB>` — per-location geometry builders (local frame; the mesh is placed at `Placed.x/y/z/yaw`).
- `props: Partial<Record<PropKind, Xf[]>>` — instanced props in world space.
- `signs: SignPlacement[]` — every sign (world space).
- `chimneys: {x,y,z}[]` — top of every chimney (37) — **smoke goes here** (life agent).
- `laundryLines: {x,y,z,ry,len}[]` — centre of the line, heading, length (26 lines; the line itself and the poles are drawn, cloth is not — animate pegs/cloth here).
- `flagPoles: {x,y,z,h}[]` — base + height (town hall, school, harbourmaster mast, lighthouse); a static flag plate is drawn at the top — replace/animate freely.
- `mooredBoats: {x,y,z,ry,kind}[]` — `<Buildings/>` already bobs them; take over by removing `<MooredBoats/>` in `index.tsx` if boats should leave the pier.
- `lanternLights: {x,y,z,color}[]` — candidate spots for door-lantern point lights (only 2 are used).
- `BuildingSpec.off` — render offset (m) for locations whose `pos` sits on a road (school, chapel, inn, town hall, bank, Moreno/Finch/Okafor/Achebe/Halvorsen/Chen/Brand houses, carpentry, fish market, harbour office, studio, Haddad barn). `Placed.x/z` and the footprints use the offset position; `loc.pos` is untouched.
- `BuildingSpec.arch`, `.front` — house archetype and gathering distance in front of the door.

Windows/doors/benches/fences/lampPosts/lampGlobes/trunks/conifers/broadleaf/crops/fields are still filled as before
(windows and doors are now rendered inside the merged geometry; `L.benches` and `L.lampPosts` drive the bench and
lamp-post instances; `L.fences` = post positions at the farm fence panels).

## Night

`glow` vertex colours: windows hashed per building (≈55% warm `#ffb768`, some dim amber, ~10% cool blue, the
rest dark; the `lit` option per building sets the lit fraction — bank 35%, tavern 95%), shop-sign gooseneck lamps,
wall lanterns, street-lamp lanterns, the barber pole, the clinic's red-cross lamp, the phone box, chapel stained
glass and rose window, the lighthouse lantern room, café fairy lights, fountain water. The sign atlas is also an
emissive map (0.55 × night). Point lights: 6 street lamps + tavern + inn = 8.

## Performance (measured, `window.__bldInfo()` on /dev-scene, 1280×800)

- Buildings + props: **106 draw calls** (64 meshes: 58 locations + signs + fountain spray + beam, and 42 instanced
  prop kinds), **≈346k triangles** (58 location meshes ≈250k, 1189 prop instances across 40 kinds ≈80k, 48 signs,
  4 boats). Two materials (town + sign atlas), one 2048² canvas texture.
- Whole frame with everyone's layers and the shadow pass: 165–256 draw calls / 0.76–1.04M triangles depending on
  the view (the overview is the heaviest).
- Point lights: 8 (6 street lamps + tavern door + inn door), all at intensity 0 by day.
- `layoutTown()` builds every geometry in ≈0.7–1 s on the main thread at startup (memoised per town object, so
  Town.tsx and <Buildings/> share it).

## Coordination notes for the other agents

- **Life**: `L.mooredBoats` is exported but **not rendered here** (you render/bob them); the pier now runs
  **west** from the quay at (20,275) into the harbour cove — deck y ≈ 0.75, from world (12, −277…−279) to the pier
  end at (−34, −278); mooring slots for boats under way should be near that end, not at (22, −336). Flag poles carry
  no static flag any more (`L.flagPoles`). Chimney tops in `L.chimneys` (37). Laundry lines in `L.laundryLines`
  (26; poles + a bare line are drawn, cloth is yours). Lantern spots in `L.lanternLights`.
- **Environment**: the park dresses your pond (`POND`/`POND_Y` are imported): rim stones, lily pads, jetty on the
  east bank, benches; no second pond. Farm fields are explicit now (`L.fields`: Lindqvist south of the hill track
  and a hay meadow west of the channel, Haddad north-east of the track and east of the barn) — the disputed
  irrigation channel runs north–south at mx ≈ 236, my 54–79, as a raised stone leat so it sits on your terrain.
  Kerbs are instanced along the main roads at 2.6 m from the centre-line.
- **Scene/labels**: 19 locations render with an offset from `loc.pos` (they sat on roads): `Placed.x/z` is the
  rendered centre; `Labels.tsx` still uses `loc.pos`, so those labels float a few metres off the building
  (fish market, harbour office, chapel, school, inn, town hall, bank, carpentry, studio, Haddad barn and some homes).
  Using `layoutTown(town).buildings[i].x/z` for the label anchor would fix it.
- The square's cobbles sit 9 cm above ground inside the plaza; the plaza's own paving covers most of them.

## Verify

`cd apps/web && NEXT_PUBLIC_MOCK_WORLD=1 npx next dev -p 3012`, then a Playwright script that calls
`window.__scene.flyTo([cx,cy,cz],[tx,ty,tz],0.1)` and `window.__bldInfo()` — the reviewed shots are in
`apps/web/screenshots/buildings-{main,square,hallfront,store,tavern,harbour,docks,cove,gull,park,chapel,salt,farms,farms2,shore,overview}.png`
(hour 14) and `buildings-night-{main,square,harbour,overview}.png` (hour 21).
