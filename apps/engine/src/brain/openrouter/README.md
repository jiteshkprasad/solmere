# OpenRouter brain

The LLM "brain" for NPC World: an implementation of the `Brain` interface from
`@npcworld/schema` that talks to OpenRouter's OpenAI-compatible endpoint with
strict JSON-schema outputs. The engine core only ever sees the `Brain`
contract; everything in this folder is swappable.

```
openrouter/
  index.ts        createOpenRouterBrain({ apiKey, bulkModel, midModel, dailyBudgetUsd }) -> Brain
  client.ts       OpenRouterClient.chat(): fetch + strict JSON + validation/repair + retries + telemetry
  prompts/        one file per Brain method (system prompt + user prompt + wire schema + mapper)
  fixtures.ts     builds realistic BrainContext etc. straight from /content (no src/core dependency)
  selftest.ts     pnpm brain:test  — every method once, live, prints results and cost
  bakeoff.ts      pnpm bakeoff     — converse() on 3 fixture pairs × N candidate bulk models
```

## Model tiering

| Tier | Model | Calls | Temp | Why |
|---|---|---|---|---|
| bulk | `deepseek/deepseek-v4-flash-0731` | plan, react, converse, confessional | 0.7 / 0.7 / 0.9 / 0.9 | ~$0.0001 per call, 1–5 s, strong role-play; `provider.sort=price` |
| mid | `openai/gpt-5.6-luna` | reflect, businessDecision, politics, speech, vote, writePaper, updateStorylines | 0.7 (paper 0.8) | text viewers read at length; noticeably better arithmetic and restraint |

Reasoning is **disabled** (`reasoning: { enabled: false }`) on bulk calls. This
matters: with `effort: "low"` DeepSeek V4 Flash still burns ~1,000 thinking
tokens per call, hits `max_tokens` before emitting any JSON, and takes 20 s. With
thinking off it answers in 1–5 s with 0 reasoning tokens. Providers that refuse
to disable reasoning (GLM 5.3 Flash: "Reasoning is mandatory") are detected
from the 400 and re-sent with `effort: "low"`, remembered per model. Mid calls use
`effort: "low", exclude: true` (Luna spends 50–250 reasoning tokens, fine).

### Bake-off (converse, 3 pairs, 13 Sep 2026)

| Model | ok | avg latency | 3 convos | Notes |
|---|---|---|---|---|
| deepseek/deepseek-v4-flash-0731 | 3/3 | 4.4 s | $0.00055 | Distinct voices, references memories and sums, ends unresolved when it should. **Chosen.** |
| z-ai/glm-5.3-flash | 3/3 (after reasoning fallback) | 42 s | $0.0016 | Best style adherence (Priya interrupting-then-apologising) but far too slow; one call hit the 45 s timeout |
| xiaomi/mimo-v2.5 | 3/3 | 18.7 s | $0.0013 | Good, slightly on-the-nose; 4× slower and 2.5× the cost of DeepSeek |

## Prompt design

Every prompt is `system` + `user`, rendered deterministically (same input, same
bytes) so OpenRouter prefix caching can kick in on the persona block.

**System prompt** (static per NPC per method):
1. Persona — name, age, job title, origin, home/workplace/household, wealth class,
   traits, want, fear, *secret* (marked "known only to you; you may act on it but
   never state it plainly unless it's dramatically inevitable"), the two
   opinions, *speaking style* (marked "speak ONLY in this style"), rhythm.
2. `WORLD_FACTS` — Solmere, the crown, wages/rent/loans cadence, shop hours,
   sleep block, mayor+council, 30-day election, the Herald, "nothing is scripted".
3. `CHARACTER_RULES` — stay in character, no assistant-speak/meta, present tense,
   thoughts under 30 words, be concrete (names, sums, memories), drama must be
   earned, disagreements may stay unresolved, adults only / no sexual content /
   no slurs, JSON only.
4. Method-specific TASK block with the semantics of each field.
5. Output JSON shape + one to three examples. **Examples use two made-up people
   who do not live in Solmere (Hattie Ryn, Pell Dorran)** and say so; the first
   version used Mira/Devendra and the bulk model copied lines verbatim.

**User prompt** (live): time and time-of-day, where I am and who is present,
needs as words ("very hungry, tired, a bit lonely"), wallet/debt/job, current
activity and thought, relationships, retrieved memories, last reflection, town
news (mayor, election countdown, headlines, prices, active events), and for
plan/react the list of place ids. `converse` renders both/all three personas as
cards in the system prompt and a compact live block per speaker in the user
prompt, then the pretext.

### Wire schemas vs contract types

OpenAI-style strict mode rejects optional properties and `additionalProperties`
records, and DeepSeek emits garbage (duplicate keys) on optional fields. So each
prompt file defines a strict-friendly **wire** zod schema and a `map()` to the
contract type:

- optional → nullable (`immediate: {...} | null`, `gossipLearned: string | null`)
- records → arrays of pairs (`prices: [{good, price}]`, `affinityDelta: [{npcId, delta}]`)
- ids → enums built from the context: plan/react `location` is `z.enum(placeIds)`,
  converse `speaker`/`npcId` are the participant ids, vote `candidate` is the
  candidate ids, paper `sourceEventIds` are the supplied event ids, politics
  `propose` is the proposal ids. The model physically cannot invent a place.
- `min/max` on numbers and `minItems/maxItems` on arrays are kept (both providers
  accept them) and also clamped in `map()`.

`client.toStrictJsonSchema()` runs `zod-to-json-schema` with `$refStrategy: "none"`
and then forces `required = all keys` + `additionalProperties: false` on every
object.

## Client behaviour

- Headers: `Authorization`, `HTTP-Referer: https://npcworld.local`, `X-Title: NPC World`.
- `response_format: json_schema (strict)`; if a provider 400s on the schema the
  model is switched to `json_object` + schema-in-prompt for the rest of the process.
- Parse (code fences / trailing prose stripped) → zod validate. On failure,
  **one repair retry** with the validation error and the offending output
  appended to the user prompt (max_tokens ×1.6 if the output was truncated).
  Second failure throws `BrainError { code: invalid_json | schema | empty }`.
- 429 / 5xx / network / timeout (45 s): 2 retries, backoff 0.5 s then 1.5 s (+jitter).
  4xx other than 429 throws immediately (`code: http`).
- Concurrency gate of 8 in-flight requests.
- Telemetry: ring of the last 200 `CallRecord`s, cumulative `{calls, costUsd,
  failures, byKind}` plus today's cost, and one JSON line per call appended to
  `apps/engine/data/llm_calls.jsonl` (`usage.cost` from OpenRouter is the source of
  truth for USD). `brain.stats()` is the contract shape; `brain.telemetry()` has
  the rest (`last50`, `byKind`, `costTodayUsd`, `budgetExceeded`).
- Daily budget: once today's spend (local midnight reset) exceeds
  `dailyBudgetUsd`, a warning is logged once, bulk calls continue, and mid-model
  calls are re-pointed at the bulk model (`requestedModel` vs `model` in the log).

## Observed cost and latency per call type

Live self-test, 13 Sep 2026 (`pnpm brain:test`, 11 calls, 0 failures, **$0.0066
total, 15.7 s wall** with the independent calls in parallel):

| kind | model | in tok | out tok | latency | cost |
|---|---|---|---|---|---|
| react | bulk | 2,700 | 60 | 1.1 s | $0.00010 |
| plan | bulk | 2,430 | 450 | 2.9 s | $0.00011 |
| converse | bulk | 3,030 | 680 | 4.5 s | $0.00011 |
| confessional | bulk | 1,670 | 120 | 1.8 s | $0.00005 |
| reflect | mid | 1,720 | 360 | 6.5 s | $0.00086 |
| business | mid | 1,730 | 340 | 6.1 s | $0.00084 |
| politics | mid | 1,530 | 90 | 1.3 s | $0.00049 |
| speech | mid | 1,330 | 250 | 4.2 s | $0.00064 |
| vote | mid | 1,470 | 260 | 4.5 s | $0.00068 |
| paper | mid | 1,770 | 930 | 8.8 s | $0.00155 |
| storylines | mid | 1,150 | 760 | 9.7 s | $0.00120 |

Back-of-envelope for a sim-day (PLAN §4.2: 50 plans, ~75 reacts, ~75 converses,
50 confessionals, 50 reflects, ~2 business, 1 paper, 1 storylines): bulk ≈ $0.025,
mid ≈ $0.05 → **~$0.08 per sim-day, ~$0.9 per real day** at 11 sim-days/day.
Well inside the default `DAILY_BUDGET_USD=3`.

## Knobs

| Where | Knob | Default |
|---|---|---|
| env | `BULK_MODEL`, `MID_MODEL`, `DAILY_BUDGET_USD`, `OPENROUTER_API_KEY` | deepseek-v4-flash-0731 / gpt-5.6-luna / 3 |
| `index.ts` `TEMPERATURE` | per-kind temperature | see table above |
| each `prompts/*.ts` | `maxTokens` per method, memory/relationship caps passed to `renderLiveContext` | plan 1200, converse 1400, paper 1800, storylines 2000 … |
| `prompts/common.ts` | `WORLD_FACTS`, `CHARACTER_RULES`, need-word thresholds, `EXAMPLE_NOTE` | |
| `client.ts` `ClientOptions` | `timeoutMs` 45 000, `maxConcurrency` 8, `logPath` (null disables), `fetchImpl`/`sleep`/`log` for tests, `budgetFallbackModel`, `budgetExemptModels` | |
| `ChatRequest.reasoning` | `"off"` (default), `"minimal"`, `"default"` | bulk off, mid minimal |
| `bakeoff.ts` | `BAKEOFF_MODELS="a,b,c"` | deepseek-v4-flash-0731, glm-5.3-flash, mimo-v2.5 |

## Scripts

```
cd apps/engine
pnpm brain:test          # live, ~16 s, < $0.01
pnpm bakeoff             # live, ~2 min (GLM is slow), < $0.01
pnpm vitest run test/brain-openrouter.test.ts   # offline, mocked fetch
```

## Known gaps

- `embed()` returns `[]` for every text: no embedding model on this account, the
  core uses lexical retrieval.
- Conversations with 3 participants are supported by the schema and prompt but
  have only been exercised with 2 in the self-test.
- The wire schema keeps `min/max` constraints; a provider that rejects them will
  fall into the `json_object` path automatically (untested in the wild — both
  current providers accept them).
- `speaker` alternation is asked for, not enforced; the bulk model has respected
  it in every sample so far.
- No per-NPC model override yet (PLAN §4.2 mentions re-pointing any NPC at
  another model); it is a one-line change in `run()` if wanted.
