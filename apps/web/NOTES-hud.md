# HUD notes (`apps/web/src/components/hud`)

Broadcast-style overlay for the Solmere viewer. Everything lives under `components/hud/**` plus `app/globals.css`
(design tokens, `.glass`, `.hud-*` primitives, recharts skin). One dev-only route was added: `app/dev-hud/page.tsx`
renders `<Hud/>` alone on a dark gradient — use it with `NEXT_PUBLIC_MOCK_WORLD=1 pnpm dev` and open `/dev-hud`.

## Components

| File | What it does |
|---|---|
| `Hud.tsx` | Layout shell: TopBar / LeftRail / active panel (300 → 340 → 400 px at md/xl) / scene column (toasts top-right, director banner bottom-left, `@container` so both degrade in narrow columns) / NpcDrawer (300 → 340 → 380 px). Loads `DevMock` behind `NEXT_PUBLIC_MOCK_WORLD=1`. `Esc` closes the drawer. Remembers the last non-`"npc"` panel so the left panel stays visible while `store.selectNpc` sets `panel="npc"`. |
| `TopBar.tsx` | LIVE/PAUSED badge, town, sim clock with day/night icon + speed + sleeping "zz", active world-event chips, LLM meter (calls today / $ today), connection dot, camera-mode toggle (labels collapse to OV/FL/DIR below `lg`). |
| `LeftRail.tsx` | Icon tabs driving `ui.panel` (click the active tab to collapse the panel). Labels hidden below `lg`. |
| `DirectorBanner.tsx` | "NOW WATCHING — Chen and Tunde, at the docks — prices again" from `ui.directorFocus`; switches to "FOLLOWING — <name> — <activity>" in follow mode. Hidden when the scene column is < 240 px, text hidden < 300 px. |
| `Toasts.tsx` | Events with `drama ≥ 7` that arrive after mount pop for 6 s (max 4 stacked); click → `selectNpc(actors[0])`. |
| `Avatar.tsx` | `<Avatar id name? mood? size? onClick?/>` — initials on a hash-coloured gradient circle, optional mood ring. `<AvatarStack ids/>` for actor lists. |
| `ui.tsx` | `PanelFrame`, `Section`, `Divider`, `Pill`, `Bar`, `SignedBar`, `Kpi`, `Delta`, `IconBtn`, `Flame` (drama-scaled), `Empty`. |
| `lib.ts` | Static lookups from `/content/*.json` (cast names/jobs, location names, currency, goods), mood/relationship/event-group colour maps, `npcName/firstName/shortName/initials`, formatting. No store subscriptions (uses `getState()` only as a name fallback). |
| `FeedPanel.tsx` | Newest-first, capped at 200 rows, filters All / Drama ≥5 / Economy / Politics / Society (`EVENT_GROUP` map in lib). Live conversation lines (`conversations` with `done=false`, line at `cursor`) shown in a quieter italic block above the rows. |
| `NpcDrawer.tsx` | Fetches `api.npc(id)` (module cache per id, refetch every 30 s while open). Renders live `NpcState` (activity, thought, needs bars, wallet/debt, employer/home/workplace, plan timeline with current step), top-8 relationships by \|affinity\| (falls back to `snapshot.relationships`), last 12 memories, confessionals (falls back to store), storyline chips, Follow/Close. `content` is treated as `unknown` and only `age/origin/traits/jobTitle` are read — `secret` is never rendered. |
| `PaperPanel.tsx` | Serif newspaper: masthead, headline, stories, editorial, monospace prices, italic gossip. ← → day picker via `api.paper(day)` (404 cached as "no edition"); latest from `papers` by default. |
| `EconomyPanel.tsx` | KPI tiles with Δ vs previous day in `metricsHistory`; recharts line charts (GDP, CPI, treasury, unemployment); per-good sparklines from `priceIndex` history with % vs base price; sortable business league (account, revenue/costs today, 7-day P&L from `pnlHistory`); loans list from `snapshot.loans`. |
| `PoliticsPanel.tsx` | Mayor card with approval number + line chart (`approvalHistory`), countdown, phase pill, candidates with platform + expandable speeches, last-result tally bars, council chips, policy log with per-council-member vote dots (from `snapshot.policies`). |
| `SocietyPanel.tsx` + `RelationshipGraph.tsx` | d3-force on a `<canvas>` (DPR-aware). Nodes coloured by mood; edges coloured by type (romantic/spouse pink, family gold, friend/mentor green, rival/enemy red, business/colleague grey, tenant purple), width/alpha by \|affinity\|; hover → tooltip + neighbourhood highlight; click → `selectNpc`. Directed a→b / b→a edges are merged. Below: mood strip, happiness/cohesion/lonely tiles, lonely chips, romance & feud tracker from `romance/breakup/feud/friendship` events. |
| `ConfessionalsPanel.tsx` | Talking-head cards (big avatar with mood ring, REC badge, serif quote). Filter by NPC; "recent" (store) or a specific day via `api.confessionals(day)` (cached). |
| `StorylinesPanel.tsx` | Cards sorted climax → active → brewing → resolved, heat bar, status pill, actor chips, summary, last 5 linked events looked up in `events`. |
| `AdminPanel.tsx` | Pause/resume, speed presets 1×/4×/12× (1× = `60 / (simHourRealMinutes·60)` sim-min per real second, read from `town.json`), inject by card id (ids hardcoded from `content/events.json`) or free text with targets + drama, save snapshot, LLM telemetry from `api.llm()` every 10 s (calls / cost / failures / byKind table). |
| `toastBus.ts` | `pushToast({kicker,text,color?,ttlMs?})` / `onToast` — HUD-originated toasts (admin inject) rendered by `Toasts` next to event toasts. |
| `eventArchive.ts` | Client-side archive of every `WorldEvent` seen. The store keeps only 500, but storylines link ids from any day; `archiveBackfill()` pages `GET /api/events` (1000/page, ≤20 pages) once, `onArchiveProgress` lets panels fill in per page. |
| `DevMock.ts` | `installDevMock()` — day-12 snapshot: 50 NPCs from `cast.json` (positions from `town.json`), 14 businesses, relationships from `relationships.json`, 40 events, 2 live conversations, 5 days of metrics, election state, 4 policies, 5 loans, 4 storylines, 2 papers, 6 confessionals, LLM stats. Patches `api.npc/paper/confessionals/llm/admin` in place so on-demand fetches work offline, and runs a 1.5 s ticker (clock, moods, a new event every ~6 s, conversation cursors, toasts). Does **not** overwrite `npcs` if already populated; only fills `ui.directorFocus` when null. |

## Live-engine integration notes (verified against the real engine, screenshots in `screenshots/live/`)

- **TopBar LLM meter** polls `GET /api/llm` every 15 s (`callsToday` / `costTodayUsd`, read defensively since they are extra fields; tooltip carries total $ / calls / failures; a `degraded` flag shows a red chip). The snapshot's `llm` block is only the fallback before the first poll.
- **Director banner** shows `· 2m` (age of the current focus, refreshed every 15 s, shown from 60 s) and hides when a director focus is older than 5 real minutes. Names capped at three ("Mira, Arjun, Priya and 11 others").
- **Confessionals**: the snapshot carries none, so a viewer connecting mid-day saw an empty panel until bedtime. The panel now backfills today + yesterday from `GET /api/confessionals/:day` and merges with SSE `confessional` frames. Empty states quote the sim clock ("It's day 6, 14:00 — 9h to go").
- **Storylines**: linked events are looked up in the event archive (see above), actor chips capped at 8 (+N more). Empty state quotes the sim clock.
- **Paper**: "No edition for day N yet — the Herald prints at midnight" when the picked day is today or later.
- **NPC drawer**: `GET /api/npcs/:id` returns both edge directions; relationships are deduped per counterpart preferring `a === id`.
- **Admin**: pause / resume / speed (1× = 0.2, 4× = 0.8, 12× = 2.4 sim-min/s) / card inject / free-text inject all verified with `x-admin-token: change-me`; a successful inject pushes a toast. Top bar now shows the speed as a multiplier (`4×`), not raw sim-min/s.

## Selectors

Every component subscribes with narrow selectors. Things that change every tick (`time`, `npcs`) are read either as
primitives (`s.time?.hour`, `s.npcs[id]?.mood`) or as derived strings (`RelationshipGraph`'s `moodKey`, `SocietyPanel`'s
`moodCounts`) so re-renders only happen when the displayed value changes. `NpcDrawer` subscribes to `s.npcs[id]` for the
one open NPC. `events`, `conversations`, `metricsHistory`, `election`, `storylines`, `confessionals`, `papers`,
`businesses` are subscribed by reference (they only change when their frame arrives).

`snapshot.*` is used for data the store doesn't keep separately: `relationships`, `loans`, `policies`, `activeWorldEvents`, `llm`, `town`.

## Store changes I'd like (not made — store.ts is not mine)

1. **`selectNpc` should not set `panel = "npc"`.** The drawer opens whenever `selectedNpcId` is set; forcing the
   panel to `"npc"` hides whichever panel the viewer was reading. Hud.tsx works around it by remembering the last real
   panel. Suggested: `selectNpc: (id) => set({ ui: { ...get().ui, selectedNpcId: id } })` and drop `"npc"` from `Panel`.
2. **Keep `relationships`, `loans`, `policies`, `activeWorldEvents` and `llm` as top-level store fields** updated by
   frames, instead of only inside `snapshot`. Today they go stale between snapshots (the `metrics`/`election` frames
   don't carry loans/policies; there is no `relationships` frame at all). The society graph and the NPC drawer's
   relationship list would benefit from a `relationships` frame (or an `api.relationships()` endpoint).
3. **`confessional`/`paper` frames are fine; a `"llm"` frame** (calls/cost today) would let the top-bar meter tick
   without a snapshot reload.
4. **Snapshot should carry recent confessionals (or the engine should replay today's on connect)** — see the backfill above; the same applies to the last ~200 events so a fresh viewer's feed isn't empty.
5. Optional: `ui.toastSeq` (last seq the viewer has seen) so toasts survive a remount without replaying history — right
   now `Toasts` keeps that in a ref.

## Verification

- `cd apps/web && npx tsc --noEmit | grep -v components/scene` → clean; `npx eslint src/components/hud src/app/dev-hud` → clean.
- Screenshots (Playwright, Chromium, mock data) in `apps/web/screenshots/`: `hud-{feed,paper,economy,politics,society,confessionals,storylines,admin,toast}.png` at 1280×800 (feed one includes the NPC drawer), the same with `-900` suffix at 900×700, plus `hud-economy-bottom-drawer.png`, `hud-drawer-bottom.png`, `hud-society-hover.png`, `hud-admin-paused.png`.

## Visual pass, Nov 2026 (phone-first layout, readable people, mood)

- **Phone (< 768 px, `lib/useNarrow.ts`)**: `Hud.tsx` renders a separate layout. The town is full-screen;
  `TopBar compact` (live dot, town, `☀ D3 10:41`, sound icon, three camera icons) fits 375 px; at the bottom
  `NowStrip.tsx` (one line: who, where, why; tap → director cut, or the followed person's card) above
  `LeftRail horizontal` (tab row). A tab or an NPC opens as a 56vh bottom sheet with a "Show the town" handle.
  Panels start closed on a phone (the store default `panel: "feed"` is reset once unless `?panel=` is in the URL).
  Toasts and the director banner are desktop-only; the strip replaces them.
- **Panels no longer hide the shot**: both layouts write what they cover to `lib/viewInset.ts` (globalThis, like
  perf/marks). `CameraRig` eases a projection offset (`camera.setViewOffset`) so the look-at point sits in the
  middle of the visible area — right of the feed on desktop, above the bottom dock/sheet on a phone. Labels use
  `camera.project`, so they follow automatically.
- **Arrival**: `ArrivalCard` puts headline, one sentence, "Right now" and the Watch / Follow someone buttons first;
  the Herald + three dramas are a collapsible "What's brewing" (open on desktop, closed on a phone). It reports
  `lib/arrivalState.ts`; while it is (or was) up, `LoadingScreen` shrinks to a 3 px top bar + status pill, so the
  town visibly builds behind the card. Returning visitors still get the full loading card.
- **Camera** (`scene/CameraRig.tsx`): portrait screens widen the vertical fov (42° → up to 62°). Director shots
  are conversational (10 / 12.5 / 14.5 / 18 / 23 m for 1 / 2 / 3 / 4+ / 8+ people, was 19–34 m), push-in 12 %.
  Follow sits 7.5 m behind-and-aside, searches ±30° steps for a clear line of sight, and picks someone when
  there is no target (`TopBar.chooseCameraMode`). The night key light now also lights the followed person.
- **People** (`scene/Npc.tsx`): a distance size boost (1× within 45 m, +1 per 150 m, max 1.65×; stored in
  `NpcRender.boost`, included in `headTop`) so people read from the overview without being giants up close.
- **Labels** (`scene/overlay.tsx`): names only for the selected/followed/hovered person, the first 4 of the
  director's group (fade by ~110 m) and anyone within ~20–34 m; a speaker shows their bubble instead of a name.
  A greedy placement pass (priority, then distance) fades out anything that would overlap a placed label; opacity
  eases. Labels sit on `headTop`. Bubbles are 13.5 px on a phone and don't shrink below 0.92×. District names
  only when the camera is high (> 70 m).
- **Mood** (`scene/palette.ts`, `Atmosphere.tsx`, `env/terrainGeometry.ts`): new 9.4 h key; deeper day zenith and a
  bluer horizon (was a grey-white band), warmer morning/afternoon/golden hour; fog leans to the mid-sky colour;
  more hemisphere fill by day (softer shadow sides). Meadows get golden, clover and wildflower-tinted patches.
  No new post effects, so the low tier is unchanged.
