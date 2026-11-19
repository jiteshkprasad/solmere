# Engine core — design notes, decisions, known gaps

For the OpenRouter-brain agent and the web agents. The contract is
`packages/schema/src/index.ts`; nothing here changes it.

## What the brain sees (BrainContext conventions)

* **Ids inside display strings.** The schema's `here.present`, `relationships`
  and `world.mayor` are plain strings, but brains must answer with npc ids
  (`with`, `immediate.target`, `affinityDelta` keys, `vote.candidate`). So every
  person is rendered as `Name [id]`: `"Devendra Rao [devendra_rao] (fish trader) — rival, -55: has a year of price logs"`,
  `present: ["Mira Okafor [mira_okafor]"]`, `mayor: "Ingrid Halvorsen [ingrid_halvorsen]"`.
* **Opening hours ride on place names.** `places[].name` is
  `"Okafor's Bakery (open 6–18)"` for anything with hours (24h places are bare).
  The schema has no hours field; both MockBrain and the LLM need them to plan.
* `memories` are pre-rendered: `"Day 3 14:00 (Talked) — text"`. Retrieval is
  recency × importance × lexical overlap with a query built from the trigger,
  current step intent and who is present. `brain.embed` is never called.
* `trigger` for `react()` can join several triggers with ` || `.
  Triggers you will see: `EVENT: <title> — <text>`, `Your wage of ₡40 was NOT paid today by …`,
  `You missed this week's rent …`, `You have been EVICTED …`, `You have been FIRED …`,
  `Your food need is critical (12/100).`, `You finished "<intent>". Meanwhile: …`,
  `Election result: …`, `<place> is closed today (<event>).`
* `plan()` is called once at wake-up (wake hour parsed from the sheet's `rhythm`:
  "up at 4", "late riser", "sleeps 6–13"; default 6–7). Plan steps outside the
  current day are fine — hours before the next wake-up simply never execute.
  `startHour/endHour` are floats internally (gatherings inject e.g. 18–20).
* `Reaction.decision`: `continue` keeps the plan; `replan` replaces steps whose
  `endHour > now` with `newSteps`; `interrupt` + `immediate` injects a one-hour
  step (`talk` with a co-located `target` starts a conversation immediately).
* `ConverseOutput.eventType` of `argument|gossip|romance|breakup|friendship|feud`
  becomes the event type; anything else logs as `conversation`. Romance /
  friendship / feud / breakup events are *also* derived automatically from
  affinity thresholds (+70 with a romantic edge, +50, −50, romantic/spouse < 20).
* `Reflection.storylineTags` are stored on the reflection event's `data` but are
  not otherwise used (storylines come from `updateStorylines`).
* `writePaper` gets yesterday's events with `importance >= 3 || drama >= 5`,
  sorted by drama, max 60. The result is zod-validated; on failure the mock paper
  is used. `updateStorylines` output is validated per item and capped at 12.

## The loop (per tick)

`scheduler.tick(dt)` → advance clock → for every whole minute crossed: `newDay`
(00:00), `onHour`, `morning` (06:00), `updateStorylines` (23:30), `nightly`
(23:59), `matchConversations` → movement → needs + `driveNpc` for all →
conversation cursors. Headless mode `await`s every in-flight brain task after
each tick, so a seeded MockBrain run is fully deterministic (test:
`headless.test.ts`). In real-time mode brain calls resolve whenever they resolve;
an NPC with a call in flight keeps doing what it was doing (`rt.busy`).

Per-NPC state that is not in the schema lives in `NpcRuntime` (`types.ts`):
wake/bed hours, tenancy arrears, personal stock (a fisher's crates), react
budget, pending triggers, injected steps, etc. It is persisted in the snapshot.

Rate limits that keep LLM cost sane (all in code, easy to tune):

| What | Rule |
|---|---|
| plan | 1 per NPC per day at wake-up |
| react | max 6 per NPC per day, ≥ 20 sim-min apart; triggers queue and are joined |
| converse | ≤ 1 per NPC per sim-hour; each NPC rolls once per hour when co-located ≥ 1 min: named in plan `with` 90%, `|affinity| ≥ 20` 25%, else 5% (skipped when degraded); 50% chance of a third participant with `|affinity| ≥ 40`. MockBrain runs give ≈ 3–4 conversations per NPC per day |
| reflect + confessional | 1 each per NPC per day at bedtime (confessional skipped when degraded) |
| business | every 7 days at 07:00 per owner |
| paper | 06:00 from day 2 |
| storylines | 23:30 |
| politics | see below |
| concurrency | 8 brain calls in flight (`brainRunner.ts`) |

Every brain call is wrapped: on throw it logs and falls back to the MockBrain's
answer for the same input (plan/reflect/paper/business…) or a neutral default
(react → continue). The sim never stops because of the LLM.

## Economy (what the code executes)

* Businesses = keys of `economy.startingBusinessAccounts` (17). Docks are
  town-owned: a fisher's catch accrues to their personal stock (Leo's to Chen);
  the Fish Market buys up to 9 crates/day at 0.9 × base; leftovers export at the
  outside floor (0.6 × base) at 23:59.
* Production per worker-hour while `action === "work"` at a producing workplace:
  fish_raw 0.5, grain 0.8, fruit 0.7 (× event `produceMultiplier`).
* Conversion (`from` chains), units of output per unit input: fish 5, bread 12,
  pastry 5, beer_wholesale 2, beer 12, clothes 2, goods 8, furniture 1. Happens
  hourly while open and staffed, up to a stock of 10.
* Restocking hourly while open: for each `buys` good under 4 units, buy up to 8
  from the cheapest local seller with a margin (seller price < 90% of own sell
  price), else from the outside market: imports at base × event multiplier,
  non-imports at 1.8 × base, capped by `dailyImportCap` (× `outsideMarketCapMultiplier`).
* Services (meal, coffee, tea, snack, haircut, repair, lodging, treatment) are
  made to order; meals/snacks consume 0.25 of a bought input, otherwise 30% of the
  price goes to the outside market as ingredient cost.
* Walk-in demand: every open business sells `0.5 × sqrt(12/price) × demandMultiplier`
  expected units/hour to off-screen customers (sailors, visitors). Counted in GDP.
  This is what keeps the barber, garage and tailor alive; tune `WALK_IN_PER_HOUR`.
* NPC purchases happen when a plan step starts at a business: `eat` buys the
  first of meal/snack/bread/pastry/fish/fruit sold there; `drink` beer/coffee/tea;
  `shop` the cheapest affordable good (≤ wallet/4); `leisure` at a business buys a
  drink. `eat` at home buys one unit of bread/fish/fruit/grain from a local
  seller (groceries) so home cooking still moves stock. Can't afford → importance-5
  memory (surfaces in the next react/reflection).
* Wages: paid once at the end of the first step after work (or 23:59) from the
  employer account: business, another NPC's wallet (Leo ← Chen) or the treasury.
  Missed → `wage_missed` event + react trigger. Rates from `economy.wages`,
  default 35 (Per Lindqvist's "farmer" isn't listed).
* Owners draw 60% of the day's profit (never below 100 in the account; a
  subsistence 30 when broke). Households cross-subsidise at 23:59 (a member under
  15 crowns gets 30 from a household member over 200) and owners top up a shop
  account under 60 from a wallet over 120.
* Non-wage incomes at 23:59: retirees get a 22/day town pension, students an 8/day
  allowance from the richest household member, the jobless 0–16 of odd-job money,
  the journalist 40 per edition, buskers (musician/painter working in public) 1
  crown tips. Without these, half the cast is at zero by day 20.
* Rent: day % 7 == 0 at 08:00, to the home's owner when they don't live there and
  aren't household (Marcus for 11 rentals, Jonah for Rafa's room, Rosa for Priya's
  flat, Bea for Sunny at the inn). Tier by id prefix: room_ 45, flat_/studio 70,
  otherwise house 110, × `rentMultiplier` (rent_cap policy). Arrears roll over;
  3 misses → eviction to the inn; evicted from the inn → the beach.
  Tomas starts 2 weeks behind (arrears 90).
* Loans: weekly payment = 2% interest + 1/40 principal, from the owner's business
  account if it can, else wallet. Missed → +1; at 3 → `loan_default` once, then the
  bank writes it off silently and refuses new credit. Seeded: Mira 4000 (2 missed),
  Fatima 1500 (1 missed). `BusinessDecision.takeLoan` caps at 5× (wallet+account)
  and 25% of the bank.
* Taxes via the `tax_notice` card (every 10 days, doesn't consume a random slot):
  `taxRate` × last 10 days of business revenue + `taxRate` × wallet above 150.
  Public payroll is 615/day, so the treasury also receives a daily
  `TREASURY_DAILY_GRANT` (default 45% of payroll, "harbour dues"). With that the
  treasury hovers 7–12k over 31 mock days instead of hitting zero on day 19.
* Metrics at 23:59: gdp (all trades incl. walk-ins), cpi (basket / base basket),
  unemployment (non-student, non-retiree without employer), gini over wallets,
  happiness mean, loans outstanding, missed rent/wages today, priceIndex (mean
  price per good over sellers), cohesion (= positive directed edges / (50 × 8),
  capped at 1), lonely (no positive edge in either direction).

## Events

`drawDailyEvents` at 06:00: scheduled cards (`everyNDays`) fire on their day; the
rest fire with p = weight/100, max 2/day; `once` cards are removed; `requiresFlag`,
`requiresDay` honoured; a card can't refire while its effect is active. Broadcast
audience = everyone (`town`) or NPCs whose current/work/home location or district
is listed; they get an event memory; `targets` get importance 8 and a react.
Implemented effects: produceMultiplier, demandMultiplier, closeLocations,
durationDays, moodDelta (→ happiness), treasuryCost (→ outside, or to the
`contract` business), scheduleFestivalInDays (festival day + 18:00 gathering),
randomSick, randomWindfall, randomBusinessLoss, npcCost, flag/clearFlag,
policyProposal (→ proposed policy by "petition"), gathering (`npcs: [...]|"any"`,
injects a 2-hour leisure step at that hour), gossipSeed (4 random NPCs), collectTax,
outsideMarketPriceMultiplier, outsideMarketCapMultiplier, importBlocked,
treasuryLike (→ `w.funds[target]`). Policy effects: rentMultiplier, taxRate,
clinicFunding (→ funds.clinic), addSells (cafe gets beer + buys beer_wholesale),
contract, allowDirectFishSales (flag only), scheduleFestivalInDays.
`demandMultiplier.clinic` is a no-op (the clinic has no business account).

## Politics

Election every 30 days. Day −10 09:00: `politics()` asked of mayor, council and
the 6 most "ambitious" (want/opinions mention mayor/council/prices/rent, or low
mayorOpinion) → incumbent + up to 4 challengers (incumbent runs unopposed if
nobody declares). Day −5 12:00: everyone awake is gathered in the square,
`speech()` per candidate, everyone present stores the speech (importance 6).
Election day 10:00: everyone gathered at town hall, `vote()` per NPC, tally,
`election_result` (drama 9), new mayor + council (losing candidates by votes, then
old council, then highest mayorOpinion). A new mayor gets job `mayor`/town
payroll; the old one becomes `former_mayor`, unemployed (also re-applied on resume).
Between elections: day % 7 == 3 at 10:00 the mayor may `propose` a policy id; the
council votes the next day at 10:00 (majority of 5), passed effects apply. Only one
open policy at a time. `approval` = mean mayorOpinion recorded at 23:59.

## MockBrain

`src/brain/mock.ts` — deterministic (hash of npc id + day), instant, $0. Plans
from rhythm + workplace hours + home; lunch at chai_stall/cafe/inn (or own food
business), evening at the place the rhythm mentions, sleep step at bed time;
`with` = one friend with affinity ≥ 40. Conversations are 3–5 templated lines
tuned by the pair's affinity (hostile pairs argue: drama 6–8, eventType
`argument`). Reflections score the day from memories; mayorOpinion drifts down
after missed rent/wages/tax. Votes: self, else the incumbent when mayorOpinion ≥ 0,
else the best-liked challenger. Every method has a `…Sync` twin used as the LLM
fallback.

## Known gaps / things to tune

* Content is mutated in memory for job changes (hire/fire/mayor): `content.npcs[id].employer/workplace`.
  The snapshot stores `employers` and business `sells/buys` overrides and reapplies them on resume.
* Direct fish sales (Rosa ← Tunde), the fishers' cooperative, the harbour-wall
  contract work, clinic funding and `funds` are flags/numbers only — nothing
  consumes them yet. The LLM can still *talk* about them.
* `BusinessDecision.hire` only works for NPCs with `employed === false`; the hired
  NPC keeps their old `job` string (wage defaults to 35 unless `wageOverrides`).
* No pathfinding: straight lines with a district-centre waypoint on long trips.
  Positions are metres on the 300×300 grid; the viewer should tween between
  ticks using `time.speed`.
* Sick NPCs stay home (`action: "sick"`) and skip plans; nobody visits the clinic.
* Conversation lines advance one per 6 sim-seconds; in headless mode a whole
  conversation resolves within a tick.
* The event buffer keeps the last 25k events in memory (≈ 50 sim-days); older
  ones are only in `events.jsonl`.
* Approval/happiness only move through reflections (and moodDelta effects), so
  with the MockBrain approval drifts slowly upward; the LLM decides for real.
* Economy balance after 31 mock days (seed 3/11): bakery ≈ break-even (as
  designed, the loan is the plot), fish market slightly negative, cafe/inn/farms
  profitable, treasury 7–12k, a handful of NPCs (Moe, Sunny, Jay, students) near
  zero. Knobs: `WALK_IN_PER_HOUR`, `PRODUCE_RATE`, `YIELD`, `PENSION_PER_DAY`,
  `TREASURY_DAILY_GRANT`, loan principal fraction (1/40).
* Schema gaps recorded above: no hours on `places`, no ids in `present`/`relationships`/`mayor`
  (worked around with `[id]` tags), no "acquaintance"/"stranger" relationship type
  (new positive edges are `friend`, negative `rival`), no `bankrupt`/`homeless`
  event types (evictions to the beach and dead shops are described in `eviction`/`system` text).
