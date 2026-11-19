# @npcworld/engine — the Solmere simulation engine

One long-running Node process that runs the town: clock, needs, walking, economy,
events, politics, relationships, memory, and the agent loop that asks a `Brain`
(LLM or mock) what each of the 50 NPCs does next. It serves the state over HTTP +
SSE for the web viewer and persists everything to `data/` so the story survives
restarts.

## Run

```bash
# from the repo root (deps are already installed for the workspace)
cd apps/engine

pnpm typecheck                     # tsc --noEmit
pnpm test                          # vitest (all with MockBrain, ~40 s)

# a headless town day in the terminal, no LLM, deterministic:
BRAIN=mock pnpm headless --days 2 --seed 1          # ~2 s

# always-on server (real-time: 1 sim-hour = 5 real minutes)
pnpm dev                           # tsx watch src/main.ts
pnpm start                         # tsx src/main.ts
```

CLI flags (`src/main.ts`):

| Flag | Meaning |
|---|---|
| `--headless` | run N sim-days as fast as possible, print the log and cost, exit |
| `--days N` | number of sim-days for headless mode (default 1) |
| `--speed S` | headless: sim-minutes per tick (default 1). Server: initial sim-minutes per real second (default 0.2) |
| `--seed N` | deterministic RNG (`seedrandom`). Default: `Date.now()` |
| `--fresh` | ignore `data/snapshot.json` and start from content |
| `--quiet` | suppress the readable log |

Env (loaded from `apps/engine/.env` via dotenv; see `/.env.example`):

| Var | Default | Use |
|---|---|---|
| `BRAIN` | — | `mock` forces the MockBrain. Otherwise OpenRouter is used when `OPENROUTER_API_KEY` is set |
| `OPENROUTER_API_KEY`, `BULK_MODEL`, `MID_MODEL` | — | see `src/brain/openrouter/README.md` |
| `DAILY_BUDGET_USD` | `3` | when today's LLM spend exceeds it the sim *degrades* (no random chats, no confessionals) instead of stopping |
| `ENGINE_PORT` | `4000` | HTTP port |
| `ADMIN_TOKEN` | none (admin API refuses all calls until set) | required in the `x-admin-token` header for `/api/admin/*` |
| `DATA_DIR` | `apps/engine/data` | where snapshot + jsonl files live |
| `CONTENT_DIR` | `/content` | content json files |
| `TREASURY_DAILY_GRANT` | `≈277` (45% of public payroll) | daily harbour dues / regional transfer into the treasury (economy stabiliser) |
| `HEADLESS_SAVE` | — | `1` writes a snapshot at the end of a headless run |

## Time

* 1 sim-hour = `town.clock.simHourRealMinutes` (5) real minutes → a tick every real
  second advances 0.2 sim-minutes (12 sim-seconds).
* 23:00–06:00 is fast-forwarded in ~`sleepBlockRealMinutes` (5) real minutes.
* Any speed above 2 sim-min/tick is sub-stepped in 2-minute slices so movement,
  needs and conversations never skip; admin speed is capped at 120 sim-min/s.
* The world starts at day 1, 05:59, so the 06:00 hooks fire on the first tick.

## HTTP API (see `EngineApi` in `packages/schema`)

| Route | Returns |
|---|---|
| `GET /healthz` | `{ ok, day, uptimeSec, llmOk }` |
| `GET /api/state` | `WorldSnapshot` |
| `GET /api/content` | `{ town, cast }` — cast with `secret` stripped |
| `GET /api/stream` | SSE. First frame `snapshot`, then `tick` every real second (positions/actions of all NPCs), `events` batched per second, `conversation` on start/advance/end, `metrics`/`election`/`paper`/`confessional`/`storylines`/`npc`/`business` on change. The SSE `event:` name equals `frame.kind`. |
| `GET /api/events?since=<seq>&limit=200` | `WorldEvent[]` (in-memory buffer of the last 25k events) |
| `GET /api/npcs/:id` | `{ state, content (no secret), memories (last 30), relationships (both directions), confessionals (last 14) }` |
| `GET /api/paper/latest`, `GET /api/paper/:day` | `Newspaper` or 404 |
| `GET /api/confessionals/:day` | `Confessional[]` |
| `GET /api/conversations?day=<n>` | `Conversation[]` (finished + active for that day) |
| `GET /api/metrics` | `Metrics[]` history (one per sim-day) |
| `GET /api/election` | `ElectionState` |
| `GET /api/storylines` | `Storyline[]` |
| `GET /api/llm` | `{ calls, costUsd, failures, callsToday, costTodayUsd, degraded, byKind, last50 }` |
| `POST /api/admin/pause`, `/resume` | admin |
| `POST /api/admin/speed { simMinutesPerRealSecond }` | admin, (0, 120] |
| `POST /api/admin/inject { cardId }` or `{ text, targets?, drama? }` | fire a deck card, or a free-text world event |
| `POST /api/admin/save` | write `data/snapshot.json` now |

CORS allows all origins.

## Data files (`DATA_DIR`, gitignored)

| File | Written | Content |
|---|---|---|
| `snapshot.json` | 23:59 every sim-day, `POST /api/admin/save`, SIGTERM/SIGINT | full `WorldSnapshot` + per-NPC runtime + all memories + papers + confessionals + recent events + flags/effects. On boot the engine resumes from it unless `--fresh` |
| `events.jsonl` | appended at each save | every `WorldEvent` |
| `memories.jsonl` | appended at each save | every `Memory` (the in-memory stream keeps the last 400 per NPC) |
| `papers.jsonl` | appended | every `Newspaper` |
| `confessionals.jsonl` | appended | every `Confessional` |

## Layout

```
src/main.ts                 CLI + boot (env, content, world, brain, server, loop, persistence hooks)
src/brain/index.ts          createBrain(): MockBrain or OpenRouter
src/brain/mock.ts           MockBrain (deterministic, free) — also the fallback when the LLM throws
src/brain/openrouter/       the LLM brain (owned by the brain agent)
src/server/index.ts         hono app + SSE + admin, 1 Hz tick broadcaster
src/core/
  content.ts   load + zod-validate /content; publicCast()
  types.ts     World (engine-internal state) and NpcRuntime
  world.ts     createWorld(): initial state from content
  clock.ts     sim time, speeds, minute-crossing detection
  scheduler.ts tick(): clock → hooks → movement → needs → agents → conversations; snapshot(); runHeadless()
  agent.ts     per-NPC loop: wake/plan, step execution, react triggers, bedtime
  daily.ts     06:00 morning (deck, paper), weekly business decisions, 23:30 storylines, 23:59 nightly, new day
  conversations.ts  co-location matching, converse() calls, line cursor, outcomes
  movement.ts  1.4 m/s walking with district-centre waypoints
  needs.ts     decay/restore/critical
  economy.ts   production, conversion, restocking, walk-in demand, purchases, wages, incomes, draws, perishing
  finance.ts   rent, loans, taxes
  ledger.ts    money transfers + transaction events
  events.ts    deck draw + every effect in events.json + policies
  politics.ts  elections (declare/speech/vote), weekly policy proposals, council votes, approval
  relationships.ts  affinity graph + derived romance/friendship/feud/breakup + gossip
  memory.ts    memory stream + recency×importance×overlap retrieval
  context.ts   BrainContext builder
  brainRunner.ts  8-wide limiter, never-throw wrapper, telemetry, budget degrade
  metrics.ts   gdp/cpi/unemployment/gini/happiness/cohesion/lonely
  director.ts  drama per event type
  persistence.ts  save/restore
test/         vitest: content+init, 2-day headless, rent cycle, 31-day election, HTTP smoke
```

See `NOTES-core.md` for design decisions, tuning constants and known gaps.
