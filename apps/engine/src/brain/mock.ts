import type {
  Brain, BrainContext, BusinessDecision, BusinessState, Confessional, ConverseInput, ConverseOutput, DayPlan, ElectionState,
  Mood, Newspaper, PlanStep, Policy, PoliticsDecision, Reaction, Reflection, Storyline, VoteDecision, WorldEvent,
} from "@npcworld/schema";
import { parseRhythm } from "../core/rhythm.js";
import { hashStr } from "../core/rng.js";
import { firstName } from "../core/names.js";

/**
 * MockBrain: deterministic, instant, free. Produces plausible plans from the NPC's rhythm,
 * workplace and home, short templated conversations, templated reflections and a templated
 * newspaper. Used by tests and as the fallback when the real brain throws.
 */
export class MockBrain implements Brain {
  private calls = 0;

  async plan(ctx: BrainContext): Promise<DayPlan> {
    return this.planSync(ctx);
  }
  async react(ctx: BrainContext): Promise<Reaction> {
    return this.reactSync(ctx);
  }
  async converse(input: ConverseInput): Promise<ConverseOutput> {
    return this.converseSync(input);
  }
  async reflect(ctx: BrainContext): Promise<Reflection> {
    return this.reflectSync(ctx);
  }
  async confessional(ctx: BrainContext, reflection: Reflection): Promise<Confessional> {
    return this.confessionalSync(ctx, reflection);
  }
  async businessDecision(ctx: BrainContext, business: BusinessState, competitors: Record<string, number>): Promise<BusinessDecision> {
    return this.businessDecisionSync(ctx, business, competitors);
  }
  async politics(ctx: BrainContext, election: ElectionState, openPolicy: Policy | null, proposals: Record<string, string>): Promise<PoliticsDecision> {
    return this.politicsSync(ctx, election, openPolicy, proposals);
  }
  async speech(ctx: BrainContext, platform: string): Promise<string> {
    this.calls++;
    const s = ctx.self;
    return `Friends, neighbours. ${platform} I have lived among you as ${s.jobTitle.toLowerCase()} and I know what this town needs: fair prices, honest books, and a harbour that holds. Give me your vote and I will give you my word.`;
  }
  async vote(ctx: BrainContext, candidates: Array<{ npcId: string; name: string; platform: string; speech: string }>): Promise<VoteDecision> {
    return this.voteSync(ctx, candidates);
  }
  async writePaper(day: number, events: WorldEvent[], prices: Record<string, number>, journalist: BrainContext): Promise<Newspaper> {
    return this.writePaperSync(day, events, prices, journalist);
  }
  async updateStorylines(existing: Storyline[], recentEvents: WorldEvent[], day: number): Promise<Storyline[]> {
    return this.updateStorylinesSync(existing, recentEvents, day);
  }
  async embed(_texts: string[]): Promise<number[][]> {
    return [];
  }
  stats() {
    return { calls: this.calls, costUsd: 0, failures: 0, bulkModel: "mock", midModel: "mock" };
  }

  /* ---------------------------------------------------------------- */
  /* plan                                                              */
  /* ---------------------------------------------------------------- */

  planSync(ctx: BrainContext): DayPlan {
    this.calls++;
    const s = ctx.self;
    const st = ctx.state;
    const h = hashStr(`${s.id}:${ctx.time.day}`);
    const r = parseRhythm(s.rhythm, 6.5);
    const wake = Math.floor(r.wake);
    const bed = r.bed;
    const place = (id: string, fallback: string) => (ctx.places.some((p) => p.id === id) ? id : fallback);
    const home = st.home;
    const steps: PlanStep[] = [];
    const isStudent = st.job === "student";
    const jobless = !isStudent && (["retiree", "unemployed", "drifter", "odd_jobs", "former_mayor"].includes(st.job) || !st.employed);
    const wp = ctx.places.find((p) => p.id === st.workplace);
    const open = /\(open (\d+)–(\d+)\)/.exec(wp?.name ?? "");
    const openAt = open ? Number(open[1]) : 7;
    const closeAt = open ? (Number(open[2]) <= Number(open[1]) ? 24 : Number(open[2])) : 18;
    const till = /till (\d{1,2})(?![:\d]|\s*a\.?m)/.exec(s.rhythm.toLowerCase());
    const foodPlace = this.foodPlace(ctx, h);
    const eveningPlace = this.eveningPlace(ctx, h);
    const friend = this.friendFor(ctx, h);
    const push = (startHour: number, endHour: number, action: PlanStep["action"], location: string, intent: string, withIds?: string[]) => {
      if (endHour - startHour < 0.5 || startHour >= 24) return;
      steps.push({ startHour: Math.max(0, Math.min(23, startHour)), endHour: Math.min(24, endHour), action, location, intent, with: withIds });
    };

    if (st.job === "night_watchman") {
      push(0, 6, "work", st.workplace, "keeping the watch at the lighthouse");
      push(13, 14, "eat", home, "breakfast at one in the afternoon, as usual");
      push(14, 16, "leisure", place("chai_stall", "town_square"), "tea at Meena's before anyone needs me", friend ? [friend] : undefined);
      push(16, 19, "leisure", place("park", "town_square"), "a walk before the watch");
      push(19, 20, "eat", foodPlace, "an early supper");
      push(20, 24, "work", st.workplace, "the night watch — the town sleeps, I don't");
      return { steps, morningThought: this.thought(ctx, h), mood: this.moodFor(ctx, h) };
    }

    let [workStart, workEnd] = r.work ?? (isStudent ? [8, 15] : till ? [Math.max(wake, openAt), Number(till[1])] : [Math.max(wake, openAt), Math.min(closeAt, Math.max(wake, openAt) + 9)]);
    if (workEnd > 24) workEnd = 24;
    if (workEnd <= workStart) workEnd = Math.min(24, workStart + 8);
    if (jobless && !isStudent) [workStart, workEnd] = [Math.max(wake + 2, 9), Math.max(wake + 2, 9) + 3];
    const workVerb: PlanStep["action"] = jobless ? "leisure" : ["painter", "musician"].includes(s.job) ? "create" : "work";
    const workIntent = isStudent ? "classes at the schoolhouse" : jobless ? this.joblessIntent(ctx, h) : `${this.workIntent(ctx, h)}`;

    if (workStart - wake >= 0.75) push(wake, Math.min(workStart, wake + 1), "eat", home, "breakfast at home");
    if (workStart > wake + 1 && workStart - (wake + 1) >= 1) push(wake + 1, workStart, "leisure", h % 3 === 0 ? place("town_square", home) : home, "a slow start to the morning");
    const lunchAt = workStart < 12 && workEnd > 13 ? 12 : null;
    if (lunchAt !== null) {
      push(workStart, lunchAt, workVerb, st.workplace, workIntent);
      push(lunchAt, lunchAt + 1, "eat", foodPlace, `lunch at ${this.placeName(ctx, foodPlace)}`, friend && h % 2 === 0 ? [friend] : undefined);
      push(lunchAt + 1, workEnd, workVerb, st.workplace, workIntent.replace(/^./, (c) => c.toLowerCase()));
    } else {
      push(workStart, workEnd, workVerb, st.workplace, workIntent);
      if (workEnd <= 13) push(workEnd, workEnd + 1, "eat", foodPlace, `a late lunch at ${this.placeName(ctx, foodPlace)}`);
    }
    let t = Math.max(workEnd, lunchAt !== null ? lunchAt + 1 : workEnd);
    if (workEnd <= 13) t = workEnd + 1;
    if (t < 18 && bed > 18) {
      const shopDay = h % 4 === 1 && st.wallet > 60;
      if (shopDay) push(t, Math.min(t + 1, 18), "shop", place("general_store", "town_square"), "pick up a few things at the store");
      const from = shopDay ? Math.min(t + 1, 18) : t;
      if (18 - from >= 1) push(from, 18, "leisure", h % 2 === 0 ? place("park", "town_square") : place("town_square", home), "some air before the evening", friend ? [friend] : undefined);
      t = 18;
    }
    if (bed > 19 && t <= 18) {
      const dinnerPlace = h % 3 === 0 && st.wallet > 30 ? foodPlace : home;
      push(t, t + 1, "eat", dinnerPlace, dinnerPlace === home ? "dinner at home" : `dinner at ${this.placeName(ctx, dinnerPlace)}`);
      t += 1;
    }
    if (bed > t + 0.5 && bed <= 24) {
      const action: PlanStep["action"] = eveningPlace === "temple" ? "worship" : eveningPlace === "studio" || eveningPlace === "town_square" && s.job === "musician" ? "create" : eveningPlace === home ? "leisure" : "leisure";
      push(t, Math.min(bed, 24), action, eveningPlace, this.eveningIntent(ctx, eveningPlace, h), friend ? [friend] : undefined);
    }
    if (bed < 24 && bed > wake) push(bed, 24, "sleep", home, "bed");
    if (steps.length < 3) {
      push(wake, wake + 4, "leisure", place("town_square", home), "wandering the square");
      push(wake + 4, wake + 5, "eat", foodPlace, "something to eat");
      push(wake + 5, Math.max(wake + 6, bed), "leisure", home, "home");
    }
    return { steps: steps.slice(0, 12), morningThought: this.thought(ctx, h), mood: this.moodFor(ctx, h) };
  }

  private placeName(ctx: BrainContext, id: string): string {
    return ctx.places.find((p) => p.id === id)?.name ?? id;
  }

  private foodPlace(ctx: BrainContext, h: number): string {
    const st = ctx.state;
    const ownsFood = ["cafe", "chai_stall", "tavern", "inn", "bakery"].includes(st.workplace) && ctx.self.employer !== null;
    if (ownsFood) return st.workplace;
    if (st.wallet < 12) return st.home;
    const options = st.wallet < 40 ? ["chai_stall", "bakery"] : ["cafe", "chai_stall", "cafe", "inn"];
    const pick = options[h % options.length];
    return ctx.places.some((p) => p.id === pick) ? pick : st.home;
  }

  private eveningPlace(ctx: BrainContext, h: number): string {
    const r = ctx.self.rhythm.toLowerCase();
    const st = ctx.state;
    const has = (id: string) => ctx.places.some((p) => p.id === id);
    if (/tavern|anchor/.test(r) && st.wallet > 8 && has("tavern")) return "tavern";
    if (/chapel/.test(r) && has("temple")) return "temple";
    if (/caf/.test(r) && has("cafe")) return "cafe";
    if (/beach/.test(r) && has("beach")) return "beach";
    if (/square/.test(r) && has("town_square")) return "town_square";
    if (/paint|studio/.test(r) && has("studio")) return "studio";
    if (/park/.test(r) && has("park")) return "park";
    const pool = ["home", "tavern", "park", "home", "town_square", "cafe"];
    const pick = pool[h % pool.length];
    if (pick === "home" || !has(pick) || (pick === "tavern" && st.wallet < 8)) return st.home;
    return pick;
  }

  private eveningIntent(ctx: BrainContext, place: string, h: number): string {
    const name = this.placeName(ctx, place);
    if (place === ctx.state.home) return ["a quiet evening at home", "feet up, door shut", "an early night if I can manage it"][h % 3];
    if (place === "tavern") return ["a pint and the usual faces at the Anchor", "hear what the town is saying at the tavern", "a drink I've earned"][h % 3];
    if (place === "temple") return "evening prayers at the chapel";
    if (place === "studio") return "painting until the light goes";
    return `an evening at ${name}`;
  }

  private workIntent(ctx: BrainContext, h: number): string {
    const job = ctx.self.job.replace(/_/g, " ");
    const opts = [`a full day as ${job}`, `work — ${ctx.self.want.split(";")[0].toLowerCase()}`, `${job}'s work, same as every day`];
    return opts[h % opts.length];
  }

  private joblessIntent(ctx: BrainContext, h: number): string {
    const opts = ["looking for odd jobs and company", "watching the town go by", "asking around for work", "keeping out of the way"];
    return ctx.self.job === "retiree" ? ["morning at my usual bench", "keeping an eye on things"][h % 2] : opts[h % opts.length];
  }

  /** an npc id from the relationship lines with affinity >= 40 */
  private friendFor(ctx: BrainContext, h: number): string | null {
    const friends = ctx.relationships
      .map((line) => ({ id: /\[([a-z0-9_]+)\]/.exec(line)?.[1], aff: Number(/,\s*([+-]?\d+)/.exec(line)?.[1] ?? 0) }))
      .filter((f) => f.id && f.aff >= 40) as Array<{ id: string; aff: number }>;
    if (!friends.length) return null;
    return friends[h % friends.length].id;
  }

  private thought(ctx: BrainContext, h: number): string {
    const s = ctx.self;
    const st = ctx.state;
    const money = st.wallet < 20 ? "The purse is nearly empty. " : st.wallet > 1500 ? "" : "";
    const opts = [
      `${money}${s.want.split(";")[0]}. That's the whole point of today.`,
      `${money}Another day. ${s.opinions[h % 2]}.`,
      `${money}I keep thinking about it: ${s.fear.toLowerCase()}. Better to keep busy.`,
      `${money}Up and at it. ${ctx.world.headlines[0] ? `The Herald says "${ctx.world.headlines[0]}". We'll see.` : "Nothing in the paper yet, which suits me."}`,
    ];
    return opts[h % opts.length];
  }

  private moodFor(ctx: BrainContext, h: number): Mood {
    const st = ctx.state;
    const n = st.needs;
    const bad = ctx.memories.slice(0, 5).some((m) => /missed|evict|fired|default|couldn't afford|not paid/i.test(m));
    if (bad) return h % 2 ? "tense" : "angry";
    if (st.wallet < 15 || n.food < 25) return "tense";
    if (n.social < 25) return "sad";
    if (st.happiness > 75) return "happy";
    return (["content", "neutral", "content", "happy"] as Mood[])[h % 4];
  }

  /* ---------------------------------------------------------------- */
  /* react                                                             */
  /* ---------------------------------------------------------------- */

  reactSync(ctx: BrainContext): Reaction {
    this.calls++;
    const t = ctx.trigger ?? "";
    const h = hashStr(`${ctx.self.id}:${ctx.time.day}:${ctx.time.hour}:${t.slice(0, 20)}`);
    if (/EVICTED/.test(t)) return { decision: "continue", thought: "Evicted. Fine. I've slept in worse places than the inn.", mood: "angry" };
    if (/FIRED/.test(t)) return { decision: "continue", thought: "Let go. Just like that. Someone's going to hear about this.", mood: "angry" };
    if (/wage .* NOT paid|NOT paid/.test(t)) return { decision: "continue", thought: "No wages today. They'd better have it tomorrow.", mood: "tense" };
    if (/food need is critical/.test(t)) {
      const place = ctx.state.wallet >= 5 && ctx.places.some((p) => p.id === "chai_stall") ? "chai_stall" : ctx.state.home;
      return { decision: "interrupt", thought: "I haven't eaten. Everything else can wait ten minutes.", mood: "tense", immediate: { action: "eat", location: place } };
    }
    if (/rest need is critical/.test(t)) return { decision: "continue", thought: "I'm dead on my feet. Early night.", mood: "neutral" };
    if (/EVENT:/.test(t)) {
      const moods: Mood[] = ["tense", "neutral", "afraid", "content"];
      return { decision: "continue", thought: `${t.replace(/^.*EVENT: /, "").split(" — ")[0]}. Well. That changes the day, or it doesn't.`, mood: moods[h % moods.length] };
    }
    if (/Election result/.test(t)) return { decision: "continue", thought: ctx.state.mayorOpinion >= 0 ? "Good. Steady hands." : "So that's how the town votes. Noted.", mood: ctx.state.mayorOpinion >= 0 ? "content" : "tense" };
    const thoughts = ["Noted. Carry on.", "Hm. I'll think about that later.", "Not my problem yet.", "Interesting. Back to it."];
    return { decision: "continue", thought: thoughts[h % thoughts.length], mood: ctx.state.mood };
  }

  /* ---------------------------------------------------------------- */
  /* converse                                                          */
  /* ---------------------------------------------------------------- */

  converseSync(input: ConverseInput): ConverseOutput {
    this.calls++;
    const [a, b, c] = input.participants;
    const ids = input.participants.map((p) => p.self.id);
    const h = hashStr(ids.join("+") + a.time.day + a.time.hour);
    const affAB = this.affinityFrom(a, b.self.id);
    const affBA = this.affinityFrom(b, a.self.id);
    const hostile = affAB + affBA < -30;
    const warm = affAB + affBA > 60;
    const first = (p: BrainContext) => firstName(p.self.name);
    const { line: topic, label } = this.topic(a, b, h);
    const lines = hostile
      ? [
          { speaker: a.self.id, text: `${first(b)}. Didn't expect to see you here.` },
          { speaker: b.self.id, text: `It's a public ${input.locationName.toLowerCase().includes("square") ? "square" : "place"}, ${first(a)}.` },
          { speaker: a.self.id, text: `${topic} You know exactly what I mean.` },
          { speaker: b.self.id, text: `${["That's not what I said.", "Am I a charity?", "Let's be adults about this.", "Say that again, slower."][h % 4]}` },
          { speaker: a.self.id, text: `We're done here.` },
        ]
      : warm
        ? [
            { speaker: a.self.id, text: `${first(b)}! ${["Sit, sit.", "There you are.", "You look tired.", "Good to see a friendly face."][h % 4]}` },
            { speaker: b.self.id, text: `${topic}` },
            { speaker: a.self.id, text: `${["I know. I know.", "Stars above.", "Tell me everything.", "You always say that."][(h >>> 2) % 4]}` },
            { speaker: b.self.id, text: `${["Anyway. Same time tomorrow?", "Don't tell anyone I said so.", "I'll bring the bread.", "Go on, you've got work."][(h >>> 4) % 4]}` },
          ]
        : [
            { speaker: a.self.id, text: `${["Afternoon", "Morning", "Evening"][a.time.hour < 12 ? 1 : a.time.hour < 18 ? 0 : 2]}, ${first(b)}.` },
            { speaker: b.self.id, text: `${topic}` },
            { speaker: a.self.id, text: `${["Is that so.", "Hm.", "Prices being what they are.", "That's the town for you."][h % 4]}` },
          ];
    if (c) lines.push({ speaker: c.self.id, text: `${["Are you two still on about that?", "I heard the same from Sal.", "Leave it, both of you."][h % 3]}` });
    const gossip = h % 5 === 0 ? this.gossipFrom(b) : undefined;
    const dA = hostile ? -(2 + (h % 4)) : warm ? 2 + (h % 3) : ((h >>> 1) % 3) - 1;
    const dB = hostile ? -(2 + ((h >>> 3) % 4)) : warm ? 2 + ((h >>> 3) % 3) : ((h >>> 2) % 3) - 1;
    const mood = (d: number, p: BrainContext): Mood => (d < 0 ? (h % 2 ? "angry" : "tense") : d > 0 ? "content" : p.state.mood);
    const summary = hostile ? `${first(a)} and ${first(b)} argued about ${label}` : warm ? `${first(a)} and ${first(b)} caught up warmly about ${label}` : `${first(a)} and ${first(b)} traded small talk about ${label}`;
    const outcomes = input.participants.map((p, i) => {
      const others = ids.filter((id) => id !== p.self.id);
      const d = i === 0 ? dA : i === 1 ? dB : 0;
      return {
        npcId: p.self.id,
        memory: `${summary} at ${input.locationName}.`,
        importance: hostile ? 5 : warm ? 3 : 2,
        mood: mood(d, p),
        affinityDelta: Object.fromEntries(others.map((o) => [o, d])),
        gossipLearned: i === 0 ? gossip : undefined,
      };
    });
    return { lines, summary, outcomes, drama: hostile ? 6 + (h % 3) : warm ? 3 : 1 + (h % 2), eventType: hostile ? "argument" : gossip ? "gossip" : null };
  }

  private affinityFrom(p: BrainContext, other: string): number {
    const line = p.relationships.find((l) => l.includes(`[${other}]`));
    return line ? Number(/,\s*([+-]?\d+)/.exec(line)?.[1] ?? 0) : 0;
  }

  private topic(a: BrainContext, b: BrainContext, h: number): { line: string; label: string } {
    const prices = a.world.prices;
    const opts: Array<{ line: string; label: string }> = [
      { line: `Bread's ${prices.bread ?? 3} crowns now. ${prices.bread && prices.bread > 3 ? "Robbery." : "For now."}`, label: "the price of bread" },
      { line: a.world.headlines[0] ? `Did you see the Herald? "${a.world.headlines[0]}"` : "Nothing in the paper. Suspicious.", label: "the Herald" },
      { line: `${b.self.opinions[h % 2]}.`, label: `${firstName(b.self.name)}'s opinions` },
      { line: `Election in ${a.world.daysToElection} days. ${a.state.mayorOpinion >= 0 ? "Steady as she goes." : "About time for a change."}`, label: "the election" },
      { line: a.world.activeEvents[0] ? `This ${a.world.activeEvents[0].toLowerCase()} business.` : "Weather's holding, at least.", label: a.world.activeEvents[0] ? a.world.activeEvents[0].toLowerCase() : "the weather" },
      { line: `${b.self.want.split(";")[0]}. That's all I want.`, label: `what ${firstName(b.self.name)} wants` },
    ];
    return opts[(h >>> 5) % opts.length];
  }

  private gossipFrom(p: BrainContext): string | undefined {
    const m = p.memories.find((x) => /Talked|Heard/.test(x));
    return m ? `${p.self.name.split(" ")[0]} says: ${m.replace(/^Day \d+ \d+:\d+ \([^)]*\) — /, "")}` : undefined;
  }

  /* ---------------------------------------------------------------- */
  /* reflect / confessional                                            */
  /* ---------------------------------------------------------------- */

  reflectSync(ctx: BrainContext): Reflection {
    this.calls++;
    const h = hashStr(`${ctx.self.id}:reflect:${ctx.time.day}`);
    const today = ctx.memories.filter((m) => m.startsWith(`Day ${ctx.time.day} `)).map((m) => m.replace(/^Day \d+ \d+:\d+( \([^)]*\))? — /, ""));
    const bad = today.filter((m) => /missed|evict|fired|default|couldn't afford|NOT paid|could not pay|burgl|argued/i.test(m));
    const good = today.filter((m) => /paid|warmly|festival|won|hires|friends/i.test(m));
    const n = ctx.state.needs;
    const needScore = (n.food + n.rest + n.social + n.leisure + n.purpose) / 5;
    const happiness = Math.max(5, Math.min(95, Math.round(needScore * 0.6 + (ctx.state.wallet > 100 ? 20 : ctx.state.wallet > 20 ? 10 : 0) + good.length * 5 - bad.length * 10)));
    let mayorDelta = ((h % 7) - 3) * 0.5;
    if (bad.some((m) => /rent|wage|tax|NOT paid|could not pay/i.test(m))) mayorDelta -= 4;
    if (good.some((m) => /festival|contract/i.test(m))) mayorDelta += 3;
    const summary = bad.length
      ? `A hard day. ${bad[0]} I can't keep pretending it's fine.`
      : good.length
        ? `A decent day. ${good[0]} Small things, but they add up.`
        : `An ordinary day. ${today[0] ?? "Work, food, bed."} ${ctx.self.want.split(";")[0]} — still waiting.`;
    const insights = [
      today.length > 2 ? `People are talking about ${/Talked/.test(ctx.memories[0] ?? "") ? "prices and the election" : "the usual"}.` : `Quiet day; nobody said anything worth remembering.`,
      `${ctx.self.opinions[h % 2]}.`,
    ];
    const mood: Mood = bad.length ? (h % 2 ? "tense" : "sad") : good.length ? "content" : "neutral";
    return {
      summary,
      insights,
      mayorOpinionDelta: Math.round(mayorDelta),
      happiness,
      goalsUpdate: ctx.self.want.split(";")[0],
      mood,
      storylineTags: bad.length ? [bad[0].slice(0, 30)] : [],
    };
  }

  confessionalSync(ctx: BrainContext, r: Reflection): Confessional {
    this.calls++;
    const h = hashStr(`${ctx.self.id}:conf:${ctx.time.day}`);
    const s = ctx.self;
    const text = [
      `${r.summary} What I won't say to anyone's face: ${s.fear.toLowerCase()}. There. I said it to a camera.`,
      `Look — ${r.summary.toLowerCase()} People think they know me. ${s.opinions[h % 2]}. That's the truth of it.`,
      `${r.summary} Tomorrow? ${r.goalsUpdate}. And no, I'm not going to talk about the other thing.`,
    ][h % 3];
    return { day: ctx.time.day, npcId: s.id, text, mood: r.mood };
  }

  /* ---------------------------------------------------------------- */
  /* business / politics / vote                                        */
  /* ---------------------------------------------------------------- */

  businessDecisionSync(ctx: BrainContext, b: BusinessState, competitors: Record<string, number>): BusinessDecision {
    this.calls++;
    const h = hashStr(`${b.locationId}:biz:${ctx.time.day}`);
    const week = b.pnlHistory.slice(-7);
    const revenue = week.reduce((a, p) => a + p.revenue, 0);
    const costs = week.reduce((a, p) => a + p.costs, 0);
    const prices: Record<string, number> = {};
    for (const [good, price] of Object.entries(b.prices)) {
      let p = price;
      if (revenue < costs) p *= 1.05;
      else if ((b.inventory[good] ?? 0) > 40) p *= 0.95;
      else if (competitors[good] && competitors[good] < price * 0.9) p *= 0.97;
      prices[good] = Math.round(p * 100) / 100;
    }
    const takeLoan = b.account < 150 && b.locationId !== "bank" ? 400 : null;
    const reasoning = revenue < costs ? `Lost money this week (revenue ${Math.round(revenue)}, costs ${Math.round(costs)}). Prices go up a touch.` : `Week was fine (revenue ${Math.round(revenue)}, costs ${Math.round(costs)}). Hold steady.`;
    return { prices, hire: null, fire: null, takeLoan, reasoning, publicStatement: h % 4 === 0 && revenue < costs ? `Prices are going up a little. Blame the costs, not me.` : null };
  }

  politicsSync(ctx: BrainContext, election: ElectionState, openPolicy: Policy | null, proposals: Record<string, string>): PoliticsDecision {
    this.calls++;
    const h = hashStr(`${ctx.self.id}:pol:${ctx.time.day}`);
    const s = ctx.self;
    const isMayor = election.mayor === s.id;
    const ambitious = /\bmayor\b|\bcouncil\b/i.test(s.want) || ctx.state.mayorOpinion < -30;
    const declare = isMayor || ambitious;
    const platform = isMayor ? `Steady hands: finish the harbour wall and keep the books straight.` : /rent/i.test(s.want + s.opinions.join(" ")) ? `A rent cap and an end to the cosy arrangement at the top.` : `Fair prices, a fair harbour, and a council that listens to ${s.job.replace(/_/g, " ")}s.`;
    let propose: string | null = null;
    if (isMayor && !openPolicy) {
      const ids = Object.keys(proposals).filter((id) => id !== "tax_up");
      propose = h % 3 === 0 && ids.length ? ids[(h >>> 2) % ids.length] : null;
    }
    const vote = openPolicy ? ctx.state.mayorOpinion >= 0 ? h % 4 !== 0 : h % 2 === 0 : null;
    return { propose, vote, declareCandidacy: declare, platform: declare ? platform : null, reasoning: declare ? "I have something to say and the standing to say it." : "Not my fight." };
  }

  voteSync(ctx: BrainContext, candidates: Array<{ npcId: string; name: string; platform: string; speech: string }>): VoteDecision {
    this.calls++;
    const mayorId = /\[([a-z0-9_]+)\]/.exec(ctx.world.mayor)?.[1];
    const incumbent = candidates.find((c) => c.npcId === mayorId);
    if (candidates.some((c) => c.npcId === ctx.self.id)) return { candidate: ctx.self.id, reasoning: "Obviously." };
    if (incumbent && ctx.state.mayorOpinion >= 0) return { candidate: incumbent.npcId, reasoning: "Better the mayor you know." };
    const scored = candidates.filter((c) => c.npcId !== mayorId).map((c) => ({ c, aff: this.affinityFrom(ctx, c.npcId) })).sort((x, y) => y.aff - x.aff);
    const pick = scored[0]?.c ?? candidates[0];
    return { candidate: pick.npcId, reasoning: scored[0]?.aff > 0 ? `I trust ${pick.name}.` : `Anyone but the way things are.` };
  }

  /* ---------------------------------------------------------------- */
  /* newspaper / storylines                                            */
  /* ---------------------------------------------------------------- */

  writePaperSync(day: number, events: WorldEvent[], prices: Record<string, number>, journalist: BrainContext): Newspaper {
    this.calls++;
    const ranked = [...events].filter((e) => e.type !== "newspaper" && e.type !== "reflection" && e.type !== "confessional").sort((a, b) => b.drama - a.drama || b.importance - a.importance);
    const top = ranked.slice(0, 3);
    const stories = (top.length ? top : [{ id: "none", text: "Nothing happened in Solmere yesterday, which the Herald finds suspicious.", type: "system" } as WorldEvent]).map((e) => ({
      headline: this.headline(e),
      body: `${e.text} The Herald asked around; nobody wanted to be quoted, which tells its own story.`,
      sourceEventIds: [e.id],
    }));
    const gossip = ranked.filter((e) => e.type === "gossip" || e.type === "conversation" || e.type === "argument" || e.type === "romance").slice(0, 2);
    const p = (g: string) => (prices[g] !== undefined ? `${g} ${prices[g]}` : null);
    return {
      day,
      masthead: "The Solmere Herald",
      headline: stories[0].headline,
      stories: stories.slice(0, 4),
      pricesColumn: ["bread", "fish", "meal", "beer", "coffee", "grain", "rent"].map(p).filter(Boolean).join(" · ") || "Prices unchanged.",
      gossipCorner: gossip.length ? gossip.map((g) => g.text).join(" ") : "Sal Romano has heard nothing, which has never happened before.",
      editorial: `${journalist.self.name.split(" ")[0]} writes: this town runs on who's related to whom, and the ledger always comes due.`,
    };
  }

  private headline(e: WorldEvent): string {
    const map: Partial<Record<WorldEvent["type"], string>> = {
      rent_missed: "RENT DAY CLAIMS ANOTHER", eviction: "EVICTED", wage_missed: "PAYROLL MISSED", election_result: "SOLMERE HAS VOTED", election_declared: "CANDIDATE DECLARES",
      argument: "WORDS EXCHANGED", romance: "LOVE ON THE HARBOUR", feud: "FEUD", world_event: "TOWN NEWS", policy_vote: "COUNCIL DECIDES", policy_proposed: "COUNCIL TO VOTE",
      crime: "BREAK-IN", windfall: "LUCKY TICKET", loan_default: "BANK CALLS IN LOAN", fired: "SACKED", hired: "HIRED", festival: "FESTIVAL DAY", price_change: "PRICES MOVE",
    };
    const tag = map[e.type] ?? e.type.replace(/_/g, " ").toUpperCase();
    const who = e.actors.slice(0, 2).map((a) => a.split("_")[0].replace(/^./, (c) => c.toUpperCase())).join(" and ");
    return who ? `${tag}: ${who}` : `${tag}: ${e.text.replace(/\.$/, "").slice(0, 60)}`;
  }

  updateStorylinesSync(existing: Storyline[], recentEvents: WorldEvent[], day: number): Storyline[] {
    this.calls++;
    const out: Storyline[] = existing.map((s) => ({ ...s, actors: [...s.actors], eventIds: [...s.eventIds] }));
    for (const e of recentEvents) {
      if (e.drama < 6 || e.actors.length === 0) continue;
      const key = [...e.actors].slice(0, 2).sort().join("+");
      let s = out.find((x) => x.id === `sl_${key}`) ?? out.find((x) => e.actors.filter((a) => x.actors.includes(a)).length >= 2);
      if (!s) {
        s = { id: `sl_${key}`, title: `${e.type.replace(/_/g, " ")}: ${e.actors.slice(0, 2).map((a) => a.split("_")[0]).join(" & ")}`, summary: e.text, actors: [...e.actors].slice(0, 4), eventIds: [], status: "brewing", startedDay: day, updatedDay: day, heat: 0 };
        out.push(s);
      }
      s.eventIds.push(e.id);
      s.summary = e.text;
      s.updatedDay = day;
      s.heat = Math.min(10, s.heat + 2);
      s.status = s.heat >= 8 ? "climax" : s.heat >= 4 ? "active" : "brewing";
      for (const a of e.actors) if (!s.actors.includes(a) && s.actors.length < 6) s.actors.push(a);
    }
    for (const s of out) {
      if (s.updatedDay < day) s.heat = Math.max(0, s.heat - 1);
      if (s.status !== "resolved" && day - s.updatedDay >= 5) s.status = "resolved";
    }
    return out.filter((s) => s.status !== "resolved" || day - s.updatedDay < 3).sort((a, b) => b.heat - a.heat).slice(0, 10);
  }
}
