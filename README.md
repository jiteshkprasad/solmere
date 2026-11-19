# NPC World — Solmere

50 LLM-driven people in a low-poly port town. Real jobs, a real ledger, elections, feuds, romances, a daily newspaper and reality-show confessionals. What they say, choose and vote
comes from AI; the incidents and the options they choose between are hand-written.

Season 1 (30 recorded days) plays at **https://solmere.jitesh.app**.

## Run it (macOS / Linux)

```bash
# prerequisites: Node 22+, pnpm 10+
pnpm install

# .env at the repo root:
#   OPENROUTER_API_KEY=sk-or-...
cp .env apps/engine/.env          # the engine reads apps/engine/.env
cp .env.example apps/web/.env.local  # web only needs NEXT_PUBLIC_ENGINE_URL (default http://localhost:4000)

pnpm dev            # engine on :4000 + web on :3000
open http://localhost:3000
```

Useful variants:

```bash
pnpm --filter @npcworld/engine start --fresh --speed 4   # restart the town from day 1 at 4× speed
BRAIN=mock pnpm --filter @npcworld/engine headless --days 2 --seed 1   # free, instant text-only run
pnpm --filter @npcworld/engine brain:test                # 11 live LLM calls, ~$0.01, prints samples
pnpm --filter @npcworld/engine bakeoff                   # compare bulk models on the same scenes
pnpm test && pnpm typecheck
```

The engine persists to `apps/engine/data/` (snapshot + jsonl logs) and resumes on restart — that is the always-on story. Delete `data/snapshot.json` or pass `--fresh` to start over.

## Layout

| Path | What |
|---|---|
| `content/` | The world: `town.json` (58 locations), `cast.json` (50 persona sheets), `relationships.json` (196 edges + 20 seeded conflicts), `economy.json`, `events.json` (event deck + policy proposals) |
| `packages/schema/` | Zod types shared by everything, the `Brain` interface, the engine API contract |
| `apps/engine/` | Node/TS simulation: clock, movement, needs, economy, events, politics, relationships, memory, agent loop, SSE/HTTP server, persistence. `src/brain/openrouter` is the LLM brain; `src/brain/mock.ts` is the free deterministic one |
| `apps/web/` | Next.js + React Three Fiber viewer: procedural 3D town, 50 animated characters, speech/thought bubbles, director/follow/overview cameras, HUD with feed, Herald, Economy/Politics/Society dashboards, confessionals, storylines, admin |
| `docs/PLAN.md` | The design and phased plan |
| `scripts/validate-content.ts` | `pnpm validate:content` — referential integrity of the content files |

## Knobs

Engine env (`apps/engine/.env`): `BULK_MODEL` (default `deepseek/deepseek-v4-flash-0731`), `MID_MODEL` (default `openai/gpt-5.6-luna`), `DAILY_BUDGET_USD` (default 3; over budget the sim degrades instead of stopping), `ENGINE_PORT`, `ADMIN_TOKEN`. Clock: `content/town.json` → `clock` (1 sim-hour = 5 real minutes by default). Economy tuning: `content/economy.json`. Drama: `content/events.json` weights, `relationships.json` seeded conflicts.

## Observed cost (13 Sep 2026, first live run)

~480 LLM calls and **≈ $0.10 per simulated day** (bulk on DeepSeek V4 Flash, long-form on GPT-5.6 Luna). Always-on at the default clock (~11 sim-days per real day) ≈ **$1.1/day, ~$35/month**. Hosting is the larger line.

## Deploying always-on

Engine: any small VPS / Railway / Fly box running `pnpm --filter @npcworld/engine start` under a supervisor (pm2 or systemd); it needs only Node and the `.env`. Web: `pnpm --filter @npcworld/web build && start`, or Vercel with `NEXT_PUBLIC_ENGINE_URL` pointing at the engine (put the engine behind HTTPS; SSE works through most proxies). Supabase persistence is not wired yet — state lives in `apps/engine/data/`; see `docs/PLAN.md` §6.

## Credits and licence

- Code: MIT (see `LICENSE`).
- Story content (`content/`), recorded season and portraits: CC BY 4.0. Credit "Jitesh K Prasad, Solmere".
- Voice lines, music and ambience in `apps/web/public/audio/` were generated with ElevenLabs.
- 3D scene, buildings and portraits are drawn in code by this project.

Made by [Jitesh K Prasad](https://jiteshkprasad.com).
