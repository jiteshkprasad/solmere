# Performance + first load — notes for the other agents

Owner: performance agent. Files: `scene/Scene.tsx`, `scene/env/Effects.tsx`, `scene/env/perf.ts`,
`scene/perf/**`, `scene/characters/portraits.ts`, `lib/portraits.ts`, `hud/LoadingScreen.tsx`,
`scene/overlay.tsx`, `scripts/gen-portraits.mjs`.

The two complaints were **"30–40 s before anything appears"** and **"visible jitter"**. The startup stall is
fixed structurally (staged mount + a build-time portrait atlas); the render-side jitter is addressed by
tiered shadows/dpr, a progressively compiled post stack, and killing the per-frame GPU stall that the
runtime portrait renderer caused. The simulation-side jitter (1 Hz position ticks) is another agent's.

---

## 1. How to measure

### `?stats=1`
A corner overlay (`scene/perf/Stats.tsx`) with **CPU frame time p50/p95**, worst frame in the last ~3 s,
draw calls, triangles, live shader-program count, the active tier (+ why it was chosen), dpr, shadow map
size / cadence, and the **startup milestone breakdown** (content · gl · first frame · town painted ·
people · post compiled · portraits). It also carries a low/med/high switch.

**fps is not trustworthy in the verification container** (SwiftShader software GL, and this box was running
four other agents' dev servers at load average 10–40 on 2 cores). What *is* meaningful and is what I
recorded: **wall-clock milestones, draw calls, triangles, and the shape of the startup sequence**.

How unusable software GL is here, for calibration: with the **post stack mounted** at 1280×800 one frame
measured **24 000 ms** (`frameMs` from `__npcStats`), versus ~1–3 s without it. That is why the settled
screenshots below were taken at `low` (the tier the probe picks here anyway) — at `med`/`high` the
composer simply has not presented a frame yet when the shutter goes.

### Console / script hooks
- `window.__perfMarks()` → every milestone in ms since page start, plus phase/progress/people.
- `window.__envInfo()` (environment agent's) → draw calls + triangles, whole frame and environment-only.
  Careful: it renders two extra full frames, which costs ~10 s on software GL.
- `?boot=eager` mounts town + people + post + audio in one commit — i.e. roughly the **old** behaviour, so
  the staged path can be measured against it on the same build.
- `?portraits=render` makes `lib/portraits.ts` ignore the atlas and use the runtime renderer (this is how
  the atlas itself is built).
- `?q=low|med|high` forces a tier (`?q=0|1|2` still works).

---

## 2. Before / after

Mock world, 1280×800, Chromium + SwiftShader, `next dev`, `?q=med` on both runs so the GPU cost is equal.
Milestones are ms since page start.

| milestone | before (`?boot=eager&portraits=render`) | after (staged + atlas) |
|---|---|---|
| portraits available | never within the run (25/50 after 50 s) | **1 427** (atlas fetched + decoded) |
| scene module evaluated | 5 233 | 2 165 |
| WebGL context | 5 555 | 2 343 |
| **first painted frame** | 5 597 | **2 386** |
| town painted | 6 547 | 10 801 † |
| post stack mounted | 14 106 | 17 230 |
| **post stack fully compiled** | **27 966** | 63 514 † |

† These two are *worse in this container only*, and the reason is a measurement artefact worth
understanding: on SwiftShader one frame of this scene takes **3–4 s**. The staged schedule deliberately
spends frames (paint sky → mount town → paint → mount people → …), so every stage boundary costs seconds
here and ~16 ms on a real GPU. The eager path pays the same total work inside one commit instead.

The numbers that transfer to real hardware are the ones that are *not* frame-quantised:

- **first paint 5.6 s → 2.4 s** — and it is no longer a black rectangle: the loading screen is up from
  ~1.2 s with a real progress bar.
- **portraits: 50 offscreen renders → one 162 kB image.** This is the big one, see §3.
- The `/` route's first-load JS is **281 kB**; town, characters, post-processing and audio are now four
  separate chunks that are prefetched in the background instead of blocking the first paint.
- Draw calls / triangles are unchanged where quality is unchanged (the whole frame measured
  **119 calls / 631 k tris** at `med` with 25 people up, versus the environment agent's 237 calls /
  0.99 M tris at `high` with the full cast — the difference is tier and crowd size, not regression).

### A cleaner "after" run
Same build, `/dev-scene?q=high&shadow=1024` at **700×440** (small enough that software GL keeps up), mock
world, box otherwise idle. This is the sequence working end to end, at the *most expensive* tier:

| milestone | ms |
|---|---|
| scene module evaluated | 1 213 |
| WebGL context | 1 390 |
| **first painted frame** | **1 423** |
| **town painted** | **3 684** |
| all 50 rigs built | 13 067 (`?q=high`, software GL; rig build is CPU-bound and this box has 2 shared cores) |
| post stack mounted | 14 063 |
| post stack fully compiled | 25 654 |
| portraits | 50/50, all from the atlas |

Against the brief's targets (town < 3 s, people right after, everything < 8 s): **town painted at 3.7 s on a
software renderer** is already close, and the two slow rows (rig building, shader compile) are pure CPU/GPU
throughput, i.e. exactly what a real M-series machine has ~50–100× more of. Screenshot:
`screenshots/perf-high.png` — AO, bloom, DoF bokeh and the grade all present, no visual regression.

### Where the 30–40 s actually went
1. **50 portraits rendered at runtime, one per frame, each with a `readRenderTargetPixels` readback.**
   Every readback is a full GPU pipeline stall (Chromium even logs `GPU stall due to ReadPixels`), plus a
   192² `ImageData` + `toDataURL` per portrait. On an M-series Air that is ~50 consecutive frames with a
   sync point in them — this is the single largest contributor to *both* the stall and the jitter.
2. **Everything mounted in one React commit**: `layoutTown()` + 58 merged building geometries + the 2048²
   sign atlas canvas + vegetation scatter + 50 skinned rigs + the post-processing shader compile all
   landed before the first frame could paint.
3. **The whole scene was in the page's main chunk**, so nothing could paint until all of it had been
   downloaded, parsed and evaluated.
4. **A 4096² PCFSoft shadow map re-rendered every frame**, on an integrated GPU, under a full post stack
   (AO half-res + bloom mip chain + DoF + SMAA).

---

## 3. The portrait atlas (`scripts/gen-portraits.mjs`)

    NEXT_PUBLIC_MOCK_WORLD=1 pnpm --filter @npcworld/web dev      # terminal 1
    node scripts/gen-portraits.mjs --url http://localhost:3000    # terminal 2

Output: `apps/web/public/portraits/atlas.webp` (7×7 grid of 192² tiles, **162 kB**) and
`index.json` (`{version,size,cols,rows,ids}`). The script drives the app's *own* renderer headlessly on
`/dev-npcs?portraits=render` (the cheapest route that mounts the character layer), pulls the tiles out,
and packs them on a blank page — so it needs no image library, and portraits can never drift from the
rig code.

Runtime: `lib/portraits.ts` fetches the index + image once (~1.4 s here, cached afterwards) and cuts each
tile out lazily the first time a card asks for that face (~1 ms, cached). If either file is missing it
logs `[portraits] no atlas (…)` and the old runtime renderer takes over unchanged, so deleting the two
files is a safe rollback. If the atlas is *incomplete* the runtime renderer fills only the gaps.

Regenerate it whenever `content/appearance.json`, `cast.json` or `characters/builder.ts` change —
otherwise faces go stale. It is not wired into `next build` on purpose (it needs a running dev server and
a browser).

---

## 4. Staged startup (`Scene.tsx`)

```
frame 0   Canvas + Atmosphere + CameraRig + OverlayProjector   → sky paints
frame 1   <Town/>      (buildings + life)                       lazy chunk
+1 frame  <NpcLayer/>  (50 rigs stream in on Npc.tsx's budget)  lazy chunk
crowd up  <Effects/>   compiled in 3 steps, 250 ms apart        lazy chunk
+1.5 s    <AudioLayer/>                                         lazy chunk
```

All four chunks are `import()`-prefetched from a `setTimeout(0)` in `Scene`'s mount effect, so the network
work overlaps the CPU work. `BootDirector` (the one always-mounted `useFrame`) owns the schedule, the
frame-time histogram, the renderer counters and the shadow cadence. A 9 s ripcord mounts any stage that
hasn't been reached, and `<LoadingScreen/>` has its own independent 20 s hard timeout, so neither can hang.

Milestones go to `scene/perf/marks.ts`. Both that store and `env/perf.ts`'s quality store live on
`globalThis` — Next's client graph can hand the same `"use client"` module to two chunks (the page and the
lazily imported scene), and two copies left the loading screen watching a boot happening in the other copy.
**If you add module-level mutable state that both the HUD and the scene read, do the same.**

---

## 5. Quality tiers (`env/perf.ts`)

| tier | post | dpr | shadows | chosen when |
|---|---|---|---|---|
| `high` | N8AO + bloom + DoF + grade + SMAA | ≤ 1.75 | 4096, every frame | discrete GPU |
| `med` | bloom + grade + SMAA | ≤ 1.4 | 2048, every 2nd frame | integrated GPU (incl. Apple M-series), ≤ 4 cores, no float targets |
| `low` | bloom + grade | 1 | 1024, every 3rd frame | phone-sized viewport, software renderer, no WebGL2 |

Probe: unmasked `WEBGL_debug_renderer_info` string + `hardwareConcurrency` + viewport. Then the measured
**CPU frame time p50** corrects it: > 26 ms sustained for ~8 s drops a tier; < 11 ms sustained for ~20 s
raises one, once, never above the probed ceiling. `?q=` or the picker pins the tier and turns the
auto-correction off; the choice is remembered in `sessionStorage`.

A MacBook Air reports `ANGLE (Apple, ANGLE Metal Renderer: Apple M…)` → **med by default**, which is the
intended target: bloom + grade + SMAA, dpr ≤ 1.4, a 2048 shadow map refreshed every other frame.

Shadow-map size is applied by finding the shadow-casting directional light and resizing its map (the light
itself belongs to `Atmosphere.tsx`; `?shadow=` still wins). Cadence uses
`gl.shadowMap.autoUpdate = false` + `needsUpdate` — the town is static, only the 50 walkers move, and their
shadows read fine at 30 Hz / 20 Hz.

---

## 6. Frame-loop work done here

- **Post-processing is no longer compiled in one hit.** `Effects.tsx` mounts grade + tone mapping first,
  then SMAA, then bloom, then AO/DoF, 250 ms apart. Three small compiles instead of one long stall, and
  only at startup.
- **Shadow map**: size + cadence per tier (above), instead of 4096 every frame at every tier.
- **dpr** comes from the tier and is re-applied when the tier changes, instead of a fixed `[1, 1.75]`.
- **`BootDirector`'s `useFrame` is allocation-free after startup** — the rig-progress scan (`Object.keys`)
  runs every 5th frame and stops entirely once the crowd is complete.
- **`overlay.tsx`** (nobody owned it; say so if you want it back): the projector wrote
  `style.opacity` and `style.zIndex` for every visible label every frame. Both are now diffed against the
  last written value and z-index strings are pre-made, which removes ~2 string allocations and 2 style
  invalidations per label per frame (~130 labels). The `transform` write stays — it genuinely changes.
- **Portrait encoding** reuses one `ImageData` instead of allocating a 147 kB buffer per portrait (only
  matters on the fallback path now).

## 7. For the other agents

- **`Npc.tsx` (characters agent)** — two things I could not do from outside:
  1. the rig build budget is `6 ms/frame`; **4 ms** would be kinder to a 60 fps budget on an Air, since the
     rest of the frame already costs something. The brief asked me for ≤ 4 ms; it's your line to change.
  2. while the queue drains, every frame does `setChars((c) => [...c, ...built].sort(...))` — a new array,
     a sort, and a React re-render of up to 50 `<primitive>` children **per frame** for ~50 frames. Batching
     that to every 4th frame (or appending without re-sorting, since the queue is already ordered) would
     take a visible chunk out of the first second.
  3. `PortraitRenderer` now retires immediately when the atlas covers everyone, so the `pr.step(gl)` call in
     your `useFrame` is free; please keep calling it — it is what fills gaps if the atlas is stale.
- **Engine / `npcRuntime.ts` agent** — nothing here depends on your tween timing; the render side no longer
  adds its own hitches on top, so whatever is left after your fix should be visible cleanly.
- **Life / audio agents** — `<AudioLayer/>` and `<Life/>` (inside `<Town/>`) are now lazily mounted after
  the first paint. Don't assume they exist on frame 0.
- **HUD agent** — `usePortrait(id)` / `getPortrait(id)` are unchanged in shape, but a portrait can now
  appear on the *first* render instead of ~15 s in. `portraitsComplete()` goes true as soon as the atlas
  lands. `<LoadingScreen/>` sits at z-30 and is `pointer-events: none` once ready, so it never traps clicks.

## 8. Screenshots (`apps/web/screenshots/`)

| file | what |
|---|---|
| `perf-loading-1s.png` | the loading screen ~2.5 s in — title card, status line, determinate bar, the Herald's latest headline, quality picker |
| `perf-scene-3s.png` | `/?q=low` at 3 s — still the loading screen here, because `next dev` on this box needs ~5–20 s just to compile and ship the page chunk (a production build removes that entirely) |
| `perf-scene-8s.png` | `/?q=low&stats=1` once the town is up (shutter at 22 s for the reason above) — note the HUD avatars are already real faces, straight from the atlas |
| `perf-scene-low.png` | `/?q=low` settled — the town, plus HUD avatars served from the atlas |
| `perf-high.png` | `/dev-scene?q=high` with the full post stack compiled (AO + bloom + DoF + grade), 700×440 |

## 9. Known limits / next

- A second dev server running in `apps/web` shares `.next` and will fight a build; `next.config.ts` now
  honours `NEXT_DIST_DIR` so a measurement build can use its own directory.
- The atlas is 49/50 faces on the first generation run if a rig build hiccups; the runtime renderer fills
  the gap at runtime, and re-running the script picks it up. Worth a `--strict` flag later.
- `layoutTown()` + the building geometry build is still one synchronous block (~1–3 s on this box, far less
  on a laptop). Splitting it per-district across frames is the next real win, but it lives in the buildings
  agent's files.
- No GPU timer queries — `EXT_disjoint_timer_query_webgl2` would give real GPU frame cost instead of CPU
  frame time. Worth adding when someone has a real GPU to test on.
