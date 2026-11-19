# Arrival & shareability — notes for the other agents

Everything below was built by the story/share agent. It is self-contained: nothing
in `app/page.tsx`, `app/layout.tsx`, `components/hud/Hud.tsx`, `components/scene/**`,
`lib/store.ts` or `lib/engineClient.ts` was changed. One shared file *was* touched —
see **next.config.ts** at the bottom.

---

## What was built

### 1. `components/hud/ArrivalCard.tsx` — "Previously in Solmere"
The first-run card, mounted by `app/page.tsx` at z-20. Answers *what is this place /
who do I care about / what is happening* in about ten seconds:

- kicker: LIVE|OFFLINE · town · `Day n · HH:MM` (says "the town is asleep" during the
  sleep block, so landing at 3 a.m. reads as a state rather than a bug)
- the framing line: 50 people, nothing scripted, every decision made by a language model
- a strip of 16 cast faces as texture
- the latest Herald headline + gossip corner (falls back to "the first edition prints at
  midnight" copy)
- three storylines: live arcs by heat, **topped up with seeded conflicts** (labelled
  `fuse lit`) so an hour-old world still shows three real dramas instead of one card
- a "right now" block: the director's current focus, else the newest high-drama event,
  else the shortest-fuse seeded conflict
- **Watch** (dismiss into director mode) and **Show me someone** (dismiss + select/follow
  the most interesting NPC — see `mostInterestingNpc()`), plus **Catch me up**

Visibility: shown once per browser (`localStorage["solmere.intro.seen.v1"]`, every access
wrapped in try/catch), forced back with `?intro=1`, and **skipped entirely when the URL is
a deep link** (`?follow=`/`?panel=`/`?day=`) so shared links don't hit a wall. Escape
dismisses.

### 2. Catch-up recap — `components/arrival/CatchUp.tsx`
Last 2–3 sim-days as a timeline: storyline status chips, day headers with that day's
Herald headline, and the highest-drama beats with faces (read forwards inside each day,
newest day first). The store only keeps 500 events, so on open it pages
`GET /api/events?since=0&limit=1000` once and merges by id; with no engine it uses
whatever the store has, and with nothing at all it shows the seeded dramas. Days with no
events are hidden (a three-hour-old world has no "day 2").

### 3. Permalinks (server-rendered, no 3D scene in the bundle)
- `app/npc/[id]/page.tsx` — portrait, name, job, age, origin, traits, live activity/mood/
  thought/wallet, relationships with signed bars, storylines (or the seeded dramas they
  were dealt), confessionals, recent memories, household links, **Watch them live →
  `/?follow=<id>`**.
- `app/day/[n]/page.tsx` — that day's Herald front page, "the day in full" (top 12 events
  by drama), the day's confessionals, prev/next day, **Open day n in the live town →
  `/?day=n`**.

Both `force-dynamic`, both degrade to `content/*.json` with an explicit amber "the world
is offline" note. `cast.json`'s `secret` field is **stripped** in `lib/share.ts` — these
are public pages.

### 4. OG images — `app/api/og/{npc/[id],day/[n]}/route.tsx`
1200×630 via `next/og`, node runtime. `generateMetadata` on both permalink routes wires
title, description, `og:image` and `twitter:card` (summary_large_image), with
`metadataBase` derived from `NEXT_PUBLIC_SITE_URL` or the request's host headers.

### 5. Deep links — `components/arrival/DeepLinks.tsx`
Mounted from inside ArrivalCard (the only `/` component this agent owns).
`?follow=<id>` (retries for ~10 s until the snapshot lands), `?panel=<name>`, `?day=<n>`.

---

## Things other agents may want to mount / finish

1. **"Catch me up" in the HUD.** `components/hud/ArrivalCard.tsx` re-exports
   `CatchUpButton` (self-contained: button + its own overlay) and `CatchUpOverlay`
   (controlled). Dropping `<CatchUpButton />` into `TopBar.tsx` or `LeftRail.tsx` is all
   that's needed — it is `pointer-events-auto` already. Import from
   `@/components/arrival/CatchUp` or from `./ArrivalCard`.
2. **`?day=<n>` only opens the Herald panel.** There is no sim-day field in the store's
   `ui` slice, so `DeepLinks` sets `panel: "paper"` and dispatches a
   `window` CustomEvent `"solmere:show-day"` with `{ detail: { day } }`
   (exported as `DAY_EVENT`). If `PaperPanel` listens for it and calls its own
   `setDay`, the deep link becomes exact. Alternatively add `ui.paperDay` to the store
   and I'll use it.
3. **LoadingScreen sits above the ArrivalCard.** `page.tsx` mounts LoadingScreen at z-30
   and ArrivalCard at z-20, and LoadingScreen keeps `pointerEvents: "auto"` until the
   scene reports ready (up to the 20 s ripcord). While it is up, the arrival card is
   visible-but-unclickable if the fade has started. Either z-order the arrival card above
   it, or have LoadingScreen drop pointer events as soon as it starts fading. Not changed
   here because both files belong to others.
4. **Character/day links from the HUD.** `NpcDrawer` could link to `/npc/<id>` and
   `PaperPanel` to `/day/<n>` for a "copy shareable link" affordance. Not added — those
   files aren't mine.

---

## Data fallbacks (what happens when the engine is down)

| Surface | Engine up | Engine down |
|---|---|---|
| ArrivalCard storylines | live arcs by heat + seeded top-up | 3 seeded conflicts from `relationships.json` |
| ArrivalCard Herald | newest paper in the store | "the first edition prints at midnight" copy |
| ArrivalCard "right now" | director focus / hottest event | shortest-fuse seeded conflict |
| "Show me someone" | storyline + event drama scoring | strongest static affinity + seeded actors |
| Recap | store events + `/api/events` page | store events, else the seeded dramas |
| `/npc/[id]` | `/api/npcs/:id` + `/api/storylines` | `content/cast.json` + `relationships.json`, with an offline note |
| `/day/[n]` | `/api/paper/:d`, `/api/confessionals/:d`, paged `/api/events` | "no edition printed" + offline note |
| OG cards | live drama line | the seeded `fuse` line, else the character's `want` |
| Portraits | `/portraits/atlas.webp` tile (CSS sprite, server-rendered) | initials on a hashed gradient |

Nothing throws: every engine call in `lib/shareServer.ts` has a 2.5 s timeout and returns
`null`/`[]`.

### Dev mock
`lib/shareMock.ts` is a deterministic stand-in used **only** when
`NEXT_PUBLIC_MOCK_WORLD=1` (same flag the scene/HUD dev mocks use) and only after a real
engine call has failed. It is lazily imported, so it never enters a normal build. It
exists so the permalink pages and OG cards can be developed and screenshotted without a
running simulation. Real names/jobs/dramas from `content/`; invented numbers.

---

## New files

```
src/lib/share.ts                          isomorphic helpers (cast, names, colours, story picking)
src/lib/shareServer.ts                    server-only: engine fetches, atlas/portrait fs reads, origin
src/lib/shareMock.ts                      NEXT_PUBLIC_MOCK_WORLD=1 stand-in
src/components/arrival/DeepLinks.tsx      ?follow / ?panel / ?day
src/components/arrival/CatchUp.tsx        recap body, overlay, CatchUpButton
src/components/arrival/Portrait.tsx       server-safe atlas sprite face
src/components/arrival/ShareUi.tsx        server-safe panels/chips/bars for permalinks
src/components/arrival/ogParts.tsx        satori-safe building blocks for the OG routes
src/app/npc/[id]/page.tsx
src/app/day/[n]/page.tsx
src/app/api/og/npc/[id]/route.tsx
src/app/api/og/day/[n]/route.tsx
scripts/gen-og-portraits.mjs              atlas.webp → public/og/portraits/<id>.png
public/og/portraits/*.png                 49 × 256px PNG faces (688 KB total)
```

### Why `scripts/gen-og-portraits.mjs` exists
`next/og` (satori + resvg) decodes PNG/JPEG but **not WebP**, and cannot slice a sprite
sheet by offset, so the OG routes need one small PNG per face. Run it after
`scripts/gen-portraits.mjs`:

```
node apps/web/scripts/gen-og-portraits.mjs
```

It resolves `sharp` from wherever it is installed (it is not a declared dependency of the
web app) and is entirely optional — without it the OG cards fall back to initials on a
hashed colour. If the atlas is regenerated with a different cast, re-run it.

---

## ⚠️ One shared file changed: `next.config.ts`

Next checks **dynamic** app routes *after* `afterFiles` rewrites, so the existing
`/api/:path*` → engine proxy was swallowing `/api/og/npc/[id]` and `/api/og/day/[n]`
(they 502'd against the engine). One line was added *above* the proxy rewrite:

```ts
{ source: "/api/og/:path*", destination: "/api/og/:path*" },
```

A self-rewrite, which stops the proxy rule from matching. The engine has no `/api/og`
endpoint, so nothing else is affected. If you'd rather not carry it, the alternative is
moving the OG routes to `/og/...` (outside the proxied prefix) — say the word.

---

## Verified

- `npx tsc --noEmit` clean for the whole app; eslint clean on the files above.
- Screenshots in `apps/web/screenshots/arrival-*.png`: the arrival card, the recap,
  `/npc/mira_okafor`, `/npc/marcus_vale`, `/day/3`, and both OG cards.
- Run with `NEXT_PUBLIC_MOCK_WORLD=1 npx next dev -p 3024` (engine down).
