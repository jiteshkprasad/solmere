# NPC World — Build Plan

*A watchable 3D low-poly town where 50 LLM-driven NPCs work, trade, gossip, fall in love, run for mayor, and make the news.*

Status: v1.2, 13 Sep 2026 — **Phases 0–5 built and running** (see README.md; live cost ≈ $0.10/sim-day). Remaining: Supabase persistence adapter, public deploy, clip export. Decisions locked: watchable web app (not a game), 3D low-poly, fully LLM-driven agents, TypeScript + Supabase, **always-on**, a **mixed town** with many kinds of people, high drama ("like a reality show, except it's real"), and **cheap OpenRouter models** for the bulk of calls.

---

## 1. The one-paragraph pitch

You open a browser tab and see a small coastal town at 7 a.m. Mira Okafor unlocks the bakery, Devendra Rao is already arguing with the fish market about prices, two students are late for the schoolhouse, and the newspaper on the sidebar says the mayor's approval fell 9 points after the rent vote. You can orbit the town, click any person to see what they are thinking, follow the drama the auto-director thinks is most interesting, or open the Economy / Politics / Society dashboards and watch the numbers move because of things people actually did. Nothing is scripted. Every decision an NPC makes is an LLM decision, grounded in that NPC's memories, wallet, relationships, and personality. The code only handles physics and bookkeeping: walking, animating, and keeping the ledger honest.

## 2. Core design principle: "LLM decides *what and why*, code executes *how*"

"Fully LLM-driven" is the right call for character depth, but 50 agents polled every tick would cost real money and feel sluggish. The split that keeps agency fully in the LLM while keeping the bill sane:

| Layer | Owner | Examples |
|---|---|---|
| Intent & judgement | LLM | Daily plan, what to say, whether to raise prices, who to vote for, whether to quit a job, how to feel about what just happened |
| Execution & physics | Code | Pathfinding to the bakery, playing the "work" animation, moving 12 crowns from A to B, advancing the clock |
| World rules | Code (parameterised) | Rent is due on the 1st, shops close at 8 p.m., election every 30 days, a loaf costs whatever the baker set |

Under this split there is no rule-based *decision-making* anywhere — NPCs never act from a behaviour tree — but the LLM is only called when there is something to decide.

## 3. The town and the cast

Working name: **Solmere** (a port town — cosmopolitan enough that a mixed-name cast is natural). The setting is a config file; an Indian hill-town or Konkan-coast variant would differentiate sharply from the Western-default sims (Smallville, AI Town) and is worth considering for a public launch.

### 3.1 Map (one 3D scene, ~300 m × 300 m)

Harbour & fish market · Main street (bakery, general store, café, tavern, barber, tailor) · Town hall & square · Schoolhouse · Clinic · Bank · Temple/chapel · Workshop row (carpenter, mechanic) · Farm plots & orchard on the hill · Two residential lanes (~20 houses, some shared) · Inn · Park/beach for leisure.

Every building is a "location" with opening hours, capacity, an owner, and an inventory. That is what makes the economy legible: goods physically exist somewhere.

### 3.2 The 50 NPCs (economy-first casting)

Every job exists because something in the loop needs it. Households are deliberately tangled so relationships have stakes from day one.

| Sector | Roles (count) | Why they matter to the sim |
|---|---|---|
| Primary production | Farmers (3), fishers (2), orchard keeper (1) | Source of all raw food; weather and harvest shocks start here |
| Manufacturing | Baker (2), brewer (1), carpenter (1), tailor (1), mechanic (1) | Turn raw goods into priced products; set prices weekly |
| Commerce | General store owner + clerk (2), fish-market trader (1), café owner + barista (2), tavern keeper (1), innkeeper (1), barber (1) | Where most daily transactions and gossip happen |
| Public sector | Mayor (1), town clerk (1), constable (1), harbourmaster (1), teachers (2), doctor (1), nurse (1), postman (1) | Paid from the treasury; politics has a payroll to fight over |
| Finance & property | Banker (1), landlord/realtor (1) | Loans, rent, defaults, the "villain" pressure valve |
| Culture & information | Journalist (1), temple keeper (1), musician (1), painter (1) | The journalist writes the daily paper; culture NPCs generate soft drama |
| Dependants & free agents | Students 18–20 (3), retirees (3), unemployed/drifter (2), tavern regular (1), fisher's apprentice (1), farmhand (1), carpenter's apprentice (1), stall vendor (1), market porter (1), night watchman (1) | Slack in the labour market; unemployment and hiring become real |

Total: 50. No children (keeps content and moderation simple; students are young adults).

### 3.3 Character sheet (what the LLM sees as "self")

Each NPC has a ~400-token persona: name, age, job, household, three core traits, a want (ambition), a fear, a secret, two strong opinions, a speaking style (this is what stops 50 NPCs sounding like one model), and starting relationships with affinity scores (−100 to +100) tagged family / friend / rival / romantic / colleague. Sheets are LLM-generated once from a seed table, then hand-edited so that at least 10 relationships are load-bearing conflicts: a landlord who is the mayor's brother-in-law, a baker who owes the bank, a journalist dating the constable, two fishers competing for the same buyer, a retiree who thinks the doctor is a fraud.

## 4. Simulation architecture

### 4.1 Time

Sim-hour = 5 real minutes ⇒ sim-day = 2 real hours (waking hours). Sleeping hours (23:00–06:00) are compressed to ~5 real minutes so viewers never watch an empty town. So 1 real day ≈ 11 sim-days, and a full 30-day political cycle plays out in under three real days.

### 4.2 The agent loop (per NPC)

| Trigger | LLM call | Output | Frequency |
|---|---|---|---|
| Wake-up | **Plan** — persona + last reflection + needs + wallet + obligations + top 15 retrieved memories | Hour-by-hour plan with intents ("work till 1, lunch at café, ask Priya about the loan") | 1 / sim-day |
| Plan step completes or an interrupt arrives (someone speaks to me, fired, price shock, event) | **React / re-plan** | Next action, or "continue" | ~1.5 / sim-day average |
| Two NPCs co-located with sufficient affinity or plan overlap | **Converse** — one call generates the whole 4–8 line exchange for both speakers, plus a memory for each and an affinity delta | Rendered line by line as bubbles | ~3 conversations / NPC / sim-day, shared ⇒ 1.5 calls each |
| Bedtime | **Reflect** — summarise day, update opinions (mayor, prices, people), update goals, tag storylines | Long-term memory entries | 1 / sim-day |
| Weekly (owners only) | **Business decision** — P&L, stock, competitor prices → new prices, hire/fire, take loan | Ledger changes | 12 owners / sim-week |
| Daily (journalist) | **Write the paper** from the event log | The *Solmere Herald* front page | 1 / sim-day |
| Election cycle | **Declare / speech / vote** | See §4.4 | Every 30 sim-days |

≈ 250–280 LLM calls per sim-day for the whole town. Memory is a Generative-Agents-style stream (Supabase + pgvector) retrieved by recency × importance × relevance; reflections get high importance so personalities drift coherently rather than resetting.

Model tiering via OpenRouter (see §7 for prices): a cheap role-play-strong model (DeepSeek V4 Flash class) for plan / react / converse; a mid model (GLM 5.3 or Gemini Flash class) for reflect, business decisions, politics and the newspaper, where quality is what viewers read. All calls go through one `llm()` wrapper with the model slug in config, so any NPC or call type can be re-pointed at a different model without code changes, and OpenRouter's provider routing gives fallbacks for free. Because the bulk model costs cents, the plan budgets for *more* calls than strictly necessary — extra conversations and a "confessional" per NPC per day — rather than fewer.

### 4.3 Economy engine (code, LLM-driven inputs)

- Single currency ("crowns"). Every NPC has a wallet; every business has an account and inventory; the town has a treasury.
- Goods graph: fish/grain/fruit → bread/beer/meals/clothes → sold to NPCs. Owners set prices; NPCs decide *whether* to buy (LLM, given their wallet and opinions); code executes the transaction and moves stock.
- Wages paid daily from the employer's account; if the account is empty, wages are missed — that is an event and the employee's next reflection will react.
- Rent due every 7 sim-days to the landlord; bank offers loans at an interest rate the banker sets; defaults trigger eviction events.
- Taxes: flat rate set by mayor/council; treasury pays public payroll and festival budgets.
- Shocks: weather (storm halves the catch), harvest, a visiting ship (demand spike), illness.
- Published metrics: GDP (daily transaction volume), CPI (fixed basket), unemployment, treasury balance, wealth Gini, business league table, price history per good.

Guardrail: one "off-screen" export/import market with soft price bounds so the economy cannot deflate into total collapse in week one while tuning. Tighten as it stabilises.

### 4.4 Politics

Election every 30 sim-days. Any NPC may declare (LLM, given their ambition and grievances). Candidates give one town-square speech (LLM, mid model) that every present NPC stores as a memory. Each NPC votes by LLM using its own memories of the candidates' actions — not a popularity formula. Between elections the mayor proposes policies (tax rate, rent cap, market fees, festival spending, curfew after a crime event); a 5-person council votes. Approval rating = aggregate of the "mayor opinion" field each NPC updates at reflection time, so it moves for real reasons. The journalist can break scandals from the event log (missed payroll, a loan to the mayor's relative), which is how politics becomes drama instead of a chart.

### 4.5 Sociology

Relationship graph: 50 nodes, weighted edges updated by every conversation's affinity delta and by witnessed events. Derived views: community detection (cliques), centrality ("most connected person"), romance/breakup/marriage events, feuds, gossip propagation (memories that reference a third party spread through conversations and can mutate). Published metrics: town happiness index (from reflections), social cohesion, loneliness (NPCs with no positive edge), club/faction membership, weekly "who's rising / who's isolated".

## 5. The viewer — why it is fun to watch

### 5.1 3D scene

Three.js via React Three Fiber. Assets: Kenney's CC0 low-poly kits for buildings/props and Quaternius CC0 animated characters (idle, walk, work, talk, sit) — zero art budget, consistent style, swappable later. Navigation via a baked nav mesh (`three-pathfinding`). Day/night lighting tied to sim time, weather particles, seasonal palette shifts. Portraits: 50 consistent stylised faces generated once (Comfy Cloud / TopView) and reused everywhere the NPC appears.

### 5.2 Camera modes

1. **Overview** — orbit the town, click anything.
2. **Follow** — lock onto an NPC; their current thought and plan step show as a subtitle.
3. **Director** — the default when idle. A scoring function ranks live scenes by drama (conversation between rivals, a transaction failing, an election speech, a storm at the harbour, a first date) and cuts between them with cinematic camera moves, like a nature documentary. This is the feature that makes the tab worth leaving open.

### 5.3 Interface panels

- **Live feed** — every notable event as a one-liner with timestamp and NPC avatars ("Tomas missed rent · Herald prints scandal · Aria and Ben: first argument").
- **NPC card** — portrait, mood, wallet, job, current thought, today's plan, top relationships, recent memories, storylines they are part of.
- **The Solmere Herald** — the journalist's daily paper: headline, three stories, prices column, gossip corner. Written from real events, so it doubles as a recap for returning viewers.
- **Economy dashboard** — GDP, CPI, unemployment, treasury, Gini, price sparklines per good, business league table with P&L.
- **Politics dashboard** — mayor approval line, days to election, declared candidates, council vote log, policy history with "what changed after".
- **Society dashboard** — force-directed relationship graph (edges coloured by type), clique map, happiness/loneliness, romance and feud tracker.
- **Storylines** — LLM-extracted running arcs ("The bakery loan", "Who will challenge Mayor Halvorsen?") with a timeline of the events in each.
- **Confessional cam** — the reality-show device. Each NPC's nightly reflection is also rendered as a first-person talking-head clip (portrait, name card, their own words about the day: who annoyed them, what they're planning, what they won't say to anyone's face). Viewers can browse the day's confessionals like episodes. This is where the "it's a reality show, except it's real" framing lands.
- **Daily recap** — 60-second summary card at each sim-midnight, ready to become a short video later; weekly "episode" recap stitched from the seven dailies.

### 5.4 Drama levers (world config, not scripts)

Scarcity (one doctor, one bank), ambition mismatches (a clerk who wants to be mayor), secrets planted in personas, weekly random events from a curated deck (ship arrives, storm, festival, inspection, a stranger), and elections on a clock. Later: a viewer "nudge" button that injects an event (drought, lottery win) — gated so it stays a spectator product, not a god game.

## 6. Tech stack

| Concern | Choice | Note |
|---|---|---|
| Web app | Next.js (App Router), TypeScript, React Three Fiber, drei, Zustand, Tailwind | Deploy on Vercel |
| Sim engine | Node/TS worker, long-running, one process | Vercel cannot host it; run on Railway, Fly.io, or a small VPS |
| Database | Supabase Postgres + pgvector + Realtime | Engine writes state; browser subscribes to a `world_state` channel |
| LLM | OpenRouter (single API key, OpenAI-compatible endpoint); cheap RP model for routine calls, mid model for reflections/politics/paper; structured JSON outputs with zod validation and one retry on bad JSON | Every call logged with model, tokens and cost; key lives in `OPENROUTER_API_KEY` on the engine host only, never in the web app |
| Assets | Kenney (CC0), Quaternius (CC0), Mixamo for extra animations if needed | Keep one style |
| Observability | Cost per sim-day, calls per NPC, failed-JSON rate, economy health dashboards in the admin view | Essential in week 1, not week 7 |

Repo layout: `apps/web` (viewer), `apps/engine` (sim), `packages/schema` (zod types shared by both), `packages/prompts` (versioned prompt templates), `content/` (town config, cast seeds, event deck), `supabase/` (migrations).

Core tables: `npcs`, `personas`, `memories` (vector), `relationships`, `locations`, `businesses`, `inventory`, `ledger`, `policies`, `elections`, `votes`, `events`, `conversations`, `newspapers`, `storylines`, `llm_calls`.

## 7. Cost model — always-on on OpenRouter

OpenRouter's role-play traffic is dominated by DeepSeek's Flash models, and their prices are two orders of magnitude below frontier models. Prices seen on 13 Sep 2026 (they move; re-check before launch):

| Model (OpenRouter) | Input / output per 1M tokens | Context | Role in this sim |
|---|---|---|---|
| DeepSeek V4 Flash 0731 | ~$0.03–0.05 / ~$0.07–0.16 (varies by provider) | 1.3M | Bulk model: plan, react, converse, confessional. Most-used RP model on OpenRouter |
| DeepSeek V4 Flash 0423 | ~$0.05–0.07 / ~$0.13 | 1M | Alternative bulk model; #1 by traffic share among RP users |
| Z.ai GLM 5.3 Flash | $0.075 / $0.25 | 1.3M | Second bulk option; promo pricing may have lapsed |
| Xiaomi MiMo-V2.5 | $0.12 / $0.24 | 1M | Alternative mid-cheap option |
| GPT-5.6 Luna | $0.20 / $1.20 | 1M | Candidate mid model for reflections, newspaper, speeches |
| DeepSeek V4 Pro 0813 | ~$0.58 blended | — | Candidate mid model |
| Z.ai GLM 5.3 / Gemini 3.8 Flash | ~$0.87 / $3.36 · $0.75 / $3.75 | 1.3M / 1M | Only if the mid tier needs more quality |

Same call budget as before (~270 calls per sim-day, ~3k in / ~400 out each):

| Configuration | Cost per sim-day | Always-on (~11 sim-days/real day) monthly |
|---|---|---|
| Everything on DeepSeek V4 Flash | ~$0.05 | ~$15 |
| 70% Flash + 30% mid model (GPT-5.6 Luna class) | ~$0.15 | ~$50 |
| Double the call budget for extra drama (more conversations, confessionals, gossip) | ~$0.30 | ~$100 |

So the LLM bill is $15–100/month always-on. Hosting is now the bigger line: Supabase Pro (~$25), a small VPS or Railway box for the engine (~$10–20), Vercel (free to $20). Budget **$50–150/month all-in**.

What this changes in the design: cost stops being the constraint, latency and coherence become the constraints. Cheap models are fast but drift more, so the persona sheet, the zod schema on every output, the one-retry-on-bad-JSON rule, and the nightly reflection (which re-anchors the character) matter more than they would with a frontier model. Keep the mid model for anything a viewer reads at length (the paper, speeches, confessionals) and be willing to test two or three bulk models against the same seeded sim-day in Phase 1 — the `llm_calls` table plus a fixed random seed makes that a one-line config change.

Rankings and price sources: [OpenRouter roleplay collection](https://openrouter.ai/collections/roleplay), [OpenRouter roleplay rankings](https://openrouter.ai/rankings?category=roleplay), [modelgrep best roleplay models, Sept 2026](https://modelgrep.com/best/roleplay), [aireiter OpenRouter roleplay guide, 2 Sep 2026](https://aireiter.com/blog/openrouter-best-roleplay-model).

## 8. Phased build (7 weeks, Claude Code-friendly)

Each phase ends with something you can look at. Headless first — if the town is boring in a text log, 3D will not save it.

| Phase | Duration | Deliverable | Done when |
|---|---|---|---|
| 0 · Seed | 3–4 days | Town config, 50 persona sheets, relationship seed graph, event deck, DB schema | You can read all 50 bios and want to know what happens to at least 10 of them |
| 1 · Headless engine | 2 weeks | Clock, needs, jobs, wallets, ledger, memory stream, plan/react/converse/reflect loop, journalist; text log + cost meter | 3 sim-days run unattended; the log has a storyline you did not plant; cost per sim-day is known |
| 2 · 3D viewer | 2 weeks | Town scene, animated NPCs walking real paths, speech bubbles, follow cam, day/night, live feed, NPC card, Herald panel | You can leave it open for 20 minutes and see something happen |
| 3 · Economy & dashboards | 1 week | Owner pricing decisions, bank, rent, shocks; Economy dashboard with history | A price change in the sim shows up on the chart and in someone's complaint |
| 4 · Politics & society | 1 week | Elections, council, policies, approval; relationship graph, cliques, happiness, storylines panel | The first election is decided by things that happened, and the graph explains why |
| 5 · Director & polish | 1 week | Auto-director, daily recap, admin/cost view, public deploy | A stranger watches for 5 minutes without instructions and asks "wait, what happened to the baker?" |

Later: viewer nudges, clip/short export from the recap (feeds a social pipeline), multiple towns with trade, seasons, an "Indian town" content pack.

## 9. Risks and how the plan handles them

- **Everyone sounds like the same model.** Persona speaking-style rules, few-shot lines per NPC, sampling temperature per trait, and a nightly "voice drift" check in reflections.
- **Economy collapses or explodes in week one.** Off-screen market with soft bounds, admin sliders, and a replayable seed so tuning is reproducible.
- **Cost surprises.** `llm_calls` table with cost per call from day one; hard daily budget cap that drops fidelity (fewer conversations, longer plan horizons) instead of stopping. With OpenRouter Flash-class models the cap is a safety net, not a daily concern.
- **Cheap-model drift.** Characters flatten or break persona after a few days. Mitigations: nightly reflection re-anchors voice, schema-validated outputs, the mid model owns long-form text, and Phase 1 includes a bake-off of 2–3 bulk models on the same seeded day.
- **Always-on reliability.** The engine must survive provider outages and its own crashes: OpenRouter fallback routing, idempotent ticks (state is in Postgres, not memory), a supervisor that restarts the worker, and an uptime ping on the admin page.
- **3D swallows the schedule.** CC0 kits, one style, nav mesh baked once; no custom modelling until Phase 5.
- **Nothing happens.** Director scoring and the event deck guarantee a beat every few minutes; storylines panel gives newcomers a hook.
- **Content risk.** Adults only, a small blocklist in the converse prompt, the journalist's paper reviewed by a moderation pass before display.

## 10. Decisions log and what is still open

Decided (13 Sep 2026): always-on; mixed town with a deliberately varied cast (backgrounds, ages, temperaments, incomes — the variety is the drama fuel); reality-show energy but nothing scripted; OpenRouter cheap models for the bulk, mid model for long-form; confessional cam is a core feature, not a nice-to-have.

Still open:

1. Town name (working name Solmere).
2. Whether viewers are anonymous spectators only, or can log in and "sponsor" / follow an NPC (a natural monetisation hook later).
3. Which mid model owns the newspaper and confessionals — decided by the Phase 1 bake-off, not upfront.

Phase 0 starts with the cast bible: 50 sheets, seeded conflicts, and the event deck. The OpenRouter key is only needed once Phase 1's engine makes its first call; it goes into `OPENROUTER_API_KEY` on the engine host, never into chat or the repo.
