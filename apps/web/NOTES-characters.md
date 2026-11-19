# Character notes — `components/scene/characters/**`, `Npc.tsx`, `npcRuntime.ts`, `lib/portraits.ts`, `hud/Avatar.tsx`

Every one of the 50 townsfolk is a unique, procedurally built, skinned low-poly figure generated from
`content/appearance.json` (+ `cast.json` for job/age/gender/traits). No downloaded assets; everything is
primitives + small custom BufferGeometries, vertex-coloured, flat-shaded, **one draw call per character**.

Dev line-up: `NEXT_PUBLIC_MOCK_WORLD=1 pnpm dev` → `/dev-cast` (10×5 grid with names),
`/dev-cast?view=close&from=8` (8 close-ups with the `signature` line from appearance.json),
`?pose=walk|talk|work|eat|drink|sleep|worship|speech|sick|leisure|shop|create` forces an animation state,
`?t=<s>` freezes the clock (for screenshots), `?spin=1` turns everyone 135° (check backs/props).

## Files

| File | What |
|---|---|
| `characters/appearance.ts` | Typed view of `appearance.json` (`Appearance`, `Outfit`, `Hair`…), palette lookups, `appearanceOf(id)` (falls back to a plain townsperson for unknown ids), `castOf(id)`. |
| `characters/geometry.ts` | Low-poly toolkit: `loft(rings)` (octagonal lofts — torsos, limbs, heads, hats, skirts), `bbox` (bevelled box), `sphere/ico/cyl/cone/torus/lathe/extrude/tube/wedge`, and the `Assembler` that paints each facet (flat colour or per-facet `ColorFn` for plaid, tartan, paint/oil stains, greying temples, patches…), tags it with a bone (`skinIndex/skinWeight`, rigid 1-bone binding) and merges everything into one non-indexed geometry. |
| `characters/rig.ts` | Skeleton layout: `J` joint indices (17 bones: hips→spine→chest→neck→head, 2×(upperArm→forearm→hand), 2×(thigh→shin→foot)), `computeDims()` (proportions from height/build/age/gender), `jointRest()`, `makeBones()`. |
| `characters/builder.ts` | `buildCharacter(id, appearance, cast) → CharacterRig { mesh: SkinnedMesh, bones, dims, gait, job, work, headTop }`. Renders every visually meaningful field: skin/hair palette keys, 19 hair styles (+ flags: greying, greyStreak, tips, dye, wild, big, loose, long, high/low, lowBun, tight, tiedBack, single braid + jasmine, upTwist, topTwists, undercut, pompadour, sideParting, thinning, wisps, sharp, thick, sunBleached, messy/unkempt), 7 facial-hair kinds, glasses (round/rectangular/thin/reading/chain/small), hats (sou'wester, captain, postal, flat cap, bowler, fedora, straw, wide-brim, tam, beanie, knit, constable), garments (shirt/tee/tunic, vest/waistcoat, cardigan/sweater/hoodie, jacket/denim/army/leather, blazer/suit with lapels + tie/bow tie/pocket square/watch chain, coat/long coat/wax jacket/oilskin/lab coat/naval coat with epaulettes + brass buttons, uniform/postal trim/belt/badge, dress + pattern, sari + gold border + drape, habit + collar + veil, kilt + tartan, overalls (bib + straps), coveralls + oil stains, scrubs), aprons (cloth bib, café/store/barber waist, leather, rubber, tool belt, pocket comb), accessories (scarf, shawl, bandana neck/head, sash, brooch, lanyard + card, stethoscope, measuring tape, towel, headphones, necklace/pendant, keys, rag, earrings hoops/gold/many, bangles, rings, watch, pin cushion, nose pin, pencil/pen behind ear, goggles, sunglasses on head), bags (backpack, tote, duffel, post bag, guitar on back, rope coil, ledger/books under arm, plank/crate on shoulder), shoes (boots, wellies, sneakers, polished), body paint (ruddy cheeks, weathered skin, tattoos on bare forearms, flour, sawdust, patches, holes, worn) and hand props per id (rolling pin, notebook, bread basket, hand-scale, phone, folder, folio, cane ×3, torch, clipboards, coffee pot, cup, tankard, hydrometer, hammer, wrench, walking stick, pitchfork, hoe, apple, bucket, telescope, lantern, broom, palette + brush, kettle, newspaper, harmonica, prayer beads, seed bag). |
| `characters/animation.ts` | Procedural pose system (see below). |
| `characters/portraits.ts` | `PortraitRenderer` — offscreen head-and-shoulders renders → `lib/portraits.ts`. |
| `characters/index.ts` | `getCharacter(id)` cache (a rig is built once per page life). |
| `Npc.tsx` | `<NpcLayer/>`: rigs built a few per frame (6 ms budget) on mount, per-frame transform + animation, mood ring + select/follow marker (2 InstancedMeshes), click/double-click picking on the skinned meshes, portrait queue (one per frame after t > 1.5 s). |
| `npcRuntime.ts` | Unchanged API; two new fields on `NpcRender`: `speed` (world m/s, smoothed) and `headTop` (world height of the top of hat/hair above `y`, filled by the character layer). |
| `lib/portraits.ts` | `getPortrait(id)`, `usePortrait(id)` (hook), `onPortraitsReady(cb)`, `portraitCount()`, `portraitsComplete()`. |
| `hud/Avatar.tsx` | Uses the portrait when available, initials otherwise (unchanged props). |

## Rig structure

Character space is metres, feet at y = 0, facing +z, left = −x; `Npc.tsx` scales the mesh by `NPC_SCALE` (1.8)
and rotates it by `heading` exactly as before. Figure height = `appearance.height × 1.1` (×0.985 senior, ×0.965 elder)
so people keep the size the camera rig / label offsets were tuned for (1.76–2.1 units → 3.2–3.8 m in world).
Proportions: hips 0.46 H, torso 0.29 H, head 0.20 H (chunky, big-headed); shoulder/hip/torso width and depth
from `build` (slight 0.9 · wiry 0.86 · average 1 · sturdy 1.12 · heavy 1.3) and gender.

Bones (rigid binding, one bone per facet):

```
hips ─ spine ─ chest ─ neck ─ head            (lower torso→spine, upper torso→chest, everything on the head→head)
      │        ├─ uArmL ─ fArmL ─ handL      (sleeve/skin, rolled cuff, hand/gloves, bangles, hand props)
      │        └─ uArmR ─ fArmR ─ handR
      ├─ thighL ─ shinL ─ footL              (trousers, wellie shafts, boots/shoes)
      └─ thighR ─ shinR ─ footR
skirts / kilts / coat tails / aprons' lower half / bags at the hip → hips
```

The mesh's `boundingSphere` is set once (centre 0.5 H, radius 0.85 H) so frustum culling and raycasting never
recompute it; raycasting uses three's skinned `SkinnedMesh.raycast` (sphere test first, so only the character
under the cursor pays for per-vertex bone transforms).

Geometry budget: ~1.6–2.2 k triangles per character (≈95 k for the whole cast), ~5–8 k vertices (non-indexed).
Build cost ≈ 8–20 ms per rig on a laptop CPU (first one pays JIT); `Npc.tsx` builds within a 6 ms/frame budget.

## Draw calls / cost (measured with `window.__npcStats()` on `/dev-npcs`, mock world, all 50 in view)

- 50 characters = **50 draw calls** in the main pass (1 skinned mesh each, one shared
  `MeshStandardMaterial({ vertexColors, flatShading })`) + up to 50 in the sun's shadow pass (`castShadow`),
  frustum-culled per character (an overhead camera over the square sees 23–33 calls including the ground).
- Triangles: 57–74 k for the crowd (≈1.5–2.2 k per character).
- Mood ring + selection marker: 2 instanced draws. (Old layer: 11 instanced draws for identical bodies.)
- Per-frame CPU for tweening + posing all 50 (`animMs`): **0.47–0.54 ms** measured in headless Chromium on a
  heavily loaded 2-core box, so comfortably < 1 ms on a laptop. No allocations in the frame path (pose buffers
  are `Float32Array`s, scratch vectors are module-level). Rig building on mount: 6 ms/frame budget (≈8–20 ms per
  rig ⇒ the crowd appears over ~50 frames instead of a 0.5–1 s hitch).
- Portraits: all 50 were rendered within the first ~15 s (one per frame after t > 1.5 s).
- Characters further than 220 m (Manhattan) from the camera keep their last pose (no animation cost).
- fps: the verification box only has SwiftShader (software GL), where the whole town renders at 0.2–2 fps
  regardless of the crowd; the NPC layer alone at 640×400 ran at 4–7 fps there. GPU cost on a real iGPU is
  ~100 skinned draws / ~75 k triangles — well inside a 60 fps budget; the CPU side is the 0.5 ms above.

Dev hook: `window.__npcStats()` → `{ characters, visible, calls, triangles, frameMs, animMs, geometries, portraits }`
(`calls`/`triangles` are the whole previous frame, all layers). `?noportraits` disables portrait rendering.
`/dev-npcs?hour=14` (`&cam=near`, `&x=&z=`) mounts only the NPC layer + labels + bubbles on the terrain heightfield
with the mock world — the fastest way to look at the crowd moving without the town.

## Animation states (`characters/animation.ts`)

A pose is a flat `Float32Array` of 17 joint eulers + a hips translation offset. Every state is a pure function of
time / walk phase / gait; the `AnimInstance` cross-fades the previous pose into the new state over **0.3 s**.

| state | from | what you see |
|---|---|---|
| walk | `moving` | leg swing + knee bend + foot compensation, opposite arm swing, bob, lean, hip roll + shoulder counter-rotation; stride amplitude from actual velocity (`NpcRender.speed`); held props/canes/shoulder loads don't swing |
| idle | default / `idle`, `vote`, `confess` | breathing, weight shift, look-around (slow wandering noise), restless fidget, cane tap |
| talk | in a conversation | speaker: nods + a gesturing hand (alternates by `Conversation.cursor` speaker), listener: head tilt + occasional nods, arms crossed for some |
| work / create | `work`, `create` | per job (`WORK_BY_JOB` in builder.ts): knead, hammer (wind-up + strike), saw, fish (rope pull), haul, sweep, write/type, pour (tilting hand), carry (crate/plank on shoulder), dig/hoe, paint (brush strokes + palette), strum, examine (leaning over patient), cut (scissor snips), weigh (scale held out), sew, stir, wrench (crouched), telescope (to the eye), patrol (hands behind back), lantern, sort, gesture, teach (pointing) |
| eat / drink | `eat`, `drink` | seated on an implied bench (hips lowered, thighs forward), hand-to-mouth cycle (right for eating, left for drinking) |
| shop | `shop` | idle, looking down, occasional pointing |
| leisure | `leisure` | weight on one leg + arms crossed / hands in pockets / hand on hip (by seed) |
| worship | `worship` | bowed head, hands together |
| speech | `speech` | arms wide, chest up, scanning the crowd |
| sick | `sick` | hunched, arms wrapped, slow sway; walking is slower + shorter |
| sleep | `sleep` (away from home) | lying on the back on the ground (hidden when at home, as before) |

Gait personality (`Gait` on the rig) comes from age (elders stoop, slower, less bounce; young bounce more),
build (heavy = hip sway, slower cadence) and cast traits (proud/formal/disciplined → chest up; tired/melancholy/
grieving → shoulders down; restless/anxious → fidgets; cheerful → bounce; serene/patient → slower), plus per-id
hold flags (which forearm is raised holding a prop, cane in the right hand, load on the shoulder).

## Portrait pipeline

`PortraitRenderer` (created by `NpcLayer` once all rigs exist; steps once per frame after t > 1.5 s):
build a fresh rig for the id, pose it (`posePortrait` = idle at t=0, looking straight), rotate −0.55 rad for a
3/4 view, render into a 192² `WebGLRenderTarget` with its own key/fill/rim/hemisphere lights and a flat backdrop
tinted by the id hash, `readRenderTargetPixels`, sRGB-encode (render targets skip the renderer's output encoding)
and flip into a 2D canvas → PNG data URL → `setPortrait(id, url)`. ~50 frames after the scene settles all
portraits exist; `markPortraitsComplete()` fires the `onPortraitsReady` listeners.

HUD: `<Avatar>` calls `usePortrait(id)` and shows the image instead of initials. `getPortrait(id)` is available for
anything that wants the raw data URL (confessional cards use `<Avatar>` already). On `/dev-hud` (no scene) the
avatars stay initials.

## Screenshots (`apps/web/screenshots/`)

`cast-grid.png` (all 50, front, named), `cast-grid-back.png` (turned 135°: backpacks, guitar, braids, bags),
`cast-closeup-{0,8,16,24,32,40,48}.png` (8 heads per page with the `signature` line), `characters-walk.png`,
`characters-talk.png`, `characters-work-row2.png`, `characters-work-row4.png`, `characters-eat.png`,
`characters-sleep.png`, `characters-speech.png`, `characters-sick.png`, `characters-leisure.png` (one row of 10 in
the forced state), `characters-scene14-near.png` + `-b.png` (mock world on `/dev-npcs`, two frames 0.5 s apart —
Grace and Teodor mid-stride), `characters-scene14-overview.png`, `characters-town14.png` (the full `/dev-scene`,
director camera; the town agents' depth-of-field blurs it).

## For the other agents / HUD

- **Labels / bubbles** (`overlay.tsx`, not mine): `NpcRender.headTop` now holds the exact world height of the top of
  each person's hat/hair above `r.y`. Today the overlay uses a fixed `yOff × NPC_SCALE`; switching to
  `r.headTop + margin` would put names at the same distance above every head (tall hats vs. short people).
- **Camera** (`CameraRig.tsx`): eye height `1.2 × NPC_SCALE` still lands on the chest/neck; head centre is
  ≈ `0.95 × NPC_SCALE`… `1.05 × NPC_SCALE` above the feet for the new proportions.
- **Life / benches**: eat/drink poses sit on an implied bench 0.19 H below standing hip height; if benches get
  seat positions the layer could snap sitters to them (nothing in the store carries a seat today).
- **Lighting**: characters use a single `MeshStandardMaterial` (roughness 0.82, no metalness); they respond to
  the sun/hemisphere like buildings. They cast shadows but don't receive them (self-shadow acne on small flat
  facets).
- `characters/appearance.ts` imports `content/appearance.json` and `content/cast.json` statically (like DevMock).
  The live engine's cast is only used for ids; if the engine ever renames an NPC, `appearanceOf` falls back to
  a plain townsperson so nothing crashes.
