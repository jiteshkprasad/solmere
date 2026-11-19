import type { BusinessDecision, Confessional, Newspaper, NpcState, Reflection, Storyline } from "@npcworld/schema";
import { Newspaper as NewspaperSchema, Storyline as StorylineSchema } from "@npcworld/schema";
import type { World } from "./types.js";
import { fmtClock } from "./clock.js";
import { brainCall, newLlmDay, track } from "./brainRunner.js";
import { buildContext } from "./context.js";
import { broadcast, emit } from "./eventlog.js";
import { addMemory } from "./memory.js";
import { dailyIncomes, householdSupport, economyNewDay, exportSurplus, ownerDraws, payWage, perishStock, treasuryDues } from "./economy.js";
import { collectRent, serviceLoans, takeLoan } from "./finance.js";
import { drawDailyEvents, expireEffects, festivalMorning } from "./events.js";
import { politicsMorning, recordApproval } from "./politics.js";
import { computeMetrics, priceIndex } from "./metrics.js";
import { fallAsleep } from "./agent.js";
import { MockBrain } from "../brain/mock.js";
import { endConversationsOf } from "./conversations.js";
import { storyNewDay } from "./story.js";

const fallbackBrain = new MockBrain();
export const JOURNALIST = "priya_nair";

/* ------------------------------------------------------------------ */
/* bedtime: reflect + confessional                                     */
/* ------------------------------------------------------------------ */

export function reflectAtBedtime(w: World, npc: NpcState): void {
  const rt = w.rt[npc.id];
  rt.busy = true;
  npc.action = "confess";
  npc.activity = "thinking over the day";
  const ctx = buildContext(w, npc.id, "Bedtime. Reflect on the day.", `today ${w.content.npcs[npc.id].want}`);
  track(w, (async () => {
    const r = await brainCall(w, "reflect", npc.id, () => w.brain.reflect(ctx), () => fallbackBrain.reflectSync(ctx));
    applyReflection(w, npc, r);
    if (!w.degraded) {
      const c = await brainCall(w, "confessional", npc.id, () => w.brain.confessional(ctx, r), () => fallbackBrain.confessionalSync(ctx, r));
      applyConfessional(w, npc, c);
    }
  })().finally(() => {
    rt.busy = false;
    fallAsleep(w, npc);
  }));
}

function applyReflection(w: World, npc: NpcState, r: Reflection): void {
  const rt = w.rt[npc.id];
  addMemory(w, npc.id, "reflection", r.summary, 8);
  for (const i of r.insights.slice(0, 3)) addMemory(w, npc.id, "reflection", i, 5);
  if (r.goalsUpdate) addMemory(w, npc.id, "reflection", `Goals: ${r.goalsUpdate}`, 4);
  npc.mayorOpinion = clamp(npc.mayorOpinion + r.mayorOpinionDelta, -100, 100);
  npc.happiness = clamp(r.happiness, 0, 100);
  npc.mood = r.mood;
  npc.thought = r.summary;
  rt.lastReflection = r.summary;
  emit(w, "reflection", `${npc.name} reflects: ${r.summary}`, { actors: [npc.id], locationId: npc.home, importance: 0, drama: 1, witnesses: [], quiet: true, data: { storylineTags: r.storylineTags } });
  broadcast(w, { kind: "npc", npc });
}

function applyConfessional(w: World, npc: NpcState, c: Confessional): void {
  const conf: Confessional = { day: w.clock.day, npcId: npc.id, text: c.text, mood: c.mood };
  w.confessionals.push(conf);
  emit(w, "confessional", `${npc.name}, to camera: "${c.text.slice(0, 140)}${c.text.length > 140 ? "…" : ""}"`, { actors: [npc.id], locationId: npc.home, importance: 0, drama: 3, witnesses: [], quiet: true });
  broadcast(w, { kind: "confessional", confessional: conf });
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/* ------------------------------------------------------------------ */
/* 06:00 morning                                                       */
/* ------------------------------------------------------------------ */

export function morning(w: World): void {
  treasuryDues(w);
  drawDailyEvents(w);
  festivalMorning(w);
  politicsMorning(w);
  if (w.clock.day > 1) track(w, writePaper(w));
}

async function writePaper(w: World): Promise<void> {
  const day = w.clock.day - 1;
  const events = w.yesterdayEvents.filter((e) => e.importance >= 3 || e.drama >= 5).sort((a, b) => b.drama - a.drama).slice(0, 60);
  const prices = priceIndex(w);
  const ctx = buildContext(w, JOURNALIST, "Write today's edition of the Solmere Herald.", "newspaper story scandal");
  const raw = await brainCall(w, "paper", JOURNALIST, () => w.brain.writePaper(day, events, prices, ctx), () => fallbackBrain.writePaperSync(day, events, prices, ctx));
  const parsed = NewspaperSchema.safeParse({ ...raw, day });
  const paper: Newspaper = parsed.success ? parsed.data : fallbackBrain.writePaperSync(day, events, prices, ctx);
  w.papers.push(paper);
  if (w.papers.length > 120) w.papers.shift();
  emit(w, "newspaper", `The Solmere Herald: "${paper.headline}"`, { actors: [JOURNALIST], locationId: "cafe", importance: 3, witnesses: Object.keys(w.npcs), data: { day } });
  for (const s of paper.stories) w.log(`      · ${s.headline}`);
  broadcast(w, { kind: "paper", paper });
}

/* ------------------------------------------------------------------ */
/* weekly business decisions (07:00 on day % 7 == 0)                   */
/* ------------------------------------------------------------------ */

export function businessDecisions(w: World): void {
  for (const b of Object.values(w.businesses)) {
    if (!w.npcs[b.owner]) continue;
    track(w, decideBusiness(w, b.locationId));
  }
}

async function decideBusiness(w: World, bizId: string): Promise<void> {
  const b = w.businesses[bizId];
  const owner = w.npcs[b.owner];
  const competitors: Record<string, number> = {};
  for (const good of Object.keys(b.prices)) {
    const others = Object.values(w.businesses).filter((o) => o.locationId !== bizId && o.prices[good] !== undefined);
    if (others.length) competitors[good] = Math.round((others.reduce((a, o) => a + o.prices[good], 0) / others.length) * 100) / 100;
  }
  const ctx = buildContext(w, owner.id, `Weekly business review for ${w.content.locations[bizId].name}.`, "business prices hire loan money");
  const d = await brainCall(w, "business", owner.id, () => w.brain.businessDecision(ctx, b, competitors), () => fallbackBrain.businessDecisionSync(ctx, b, competitors));
  applyBusinessDecision(w, bizId, d);
}

function applyBusinessDecision(w: World, bizId: string, d: BusinessDecision): void {
  const b = w.businesses[bizId];
  const owner = w.npcs[b.owner];
  const name = w.content.locations[bizId].name;
  const sym = w.content.economy.currency.symbol;
  const changes: string[] = [];
  for (const [good, price] of Object.entries(d.prices ?? {})) {
    if (b.prices[good] === undefined || !Number.isFinite(price)) continue;
    const base = w.content.economy.goods[good]?.basePrice ?? price;
    const p = Math.round(clamp(price, base * 0.5, base * 2) * 100) / 100;
    if (Math.abs(p - b.prices[good]) >= 0.05) {
      changes.push(`${w.content.economy.goods[good]?.label ?? good} ${sym}${b.prices[good]} → ${sym}${p}`);
      b.prices[good] = p;
    }
  }
  if (changes.length) emit(w, "price_change", `${name} changes prices: ${changes.join(", ")}.`, { actors: [owner.id], locationId: bizId, importance: 4, witnesses: [owner.id, ...b.employees, "priya_nair"] });
  if (d.fire && b.employees.includes(d.fire)) {
    b.employees = b.employees.filter((e) => e !== d.fire);
    const n = w.npcs[d.fire];
    n.employed = false;
    w.content.npcs[d.fire].employer = null;
    w.rt[d.fire].fired = true;
    emit(w, "fired", `${owner.name} lets ${n.name} go from ${name}.`, { actors: [d.fire, owner.id], locationId: bizId, importance: 8 });
    w.rt[d.fire].triggers.push(`You have been FIRED from ${name} by ${owner.name}.`);
  }
  if (d.hire && w.npcs[d.hire] && !w.npcs[d.hire].employed && d.hire !== owner.id) {
    const n = w.npcs[d.hire];
    b.employees.push(d.hire);
    n.employed = true;
    n.workplace = bizId;
    w.content.npcs[d.hire].employer = bizId;
    w.content.npcs[d.hire].workplace = bizId;
    w.rt[d.hire].fired = false;
    emit(w, "hired", `${owner.name} hires ${n.name} at ${name}.`, { actors: [d.hire, owner.id], locationId: bizId, importance: 7 });
    w.rt[d.hire].triggers.push(`${owner.name} has hired you at ${name}. Start tomorrow.`);
  }
  if (d.takeLoan && d.takeLoan > 0) takeLoan(w, owner.id, bizId, d.takeLoan);
  if (d.publicStatement) emit(w, "system", `${owner.name} (${name}): "${d.publicStatement}"`, { actors: [owner.id], locationId: bizId, importance: 4, drama: 3, witnesses: Object.keys(w.npcs) });
  addMemory(w, owner.id, "reflection", `Business review of ${name}: ${d.reasoning}`, 5);
  broadcast(w, { kind: "business", business: b });
}

/* ------------------------------------------------------------------ */
/* 23:30 storylines, 23:59 nightly, 00:00 new day                      */
/* ------------------------------------------------------------------ */

export function updateStorylines(w: World): void {
  const recent = w.todayEvents.filter((e) => e.importance >= 4 || e.drama >= 5).slice(-80);
  if (!recent.length && !w.storylines.length) return;
  track(w, (async () => {
    const before = new Set(w.storylines.map((s) => s.id));
    const raw = await brainCall(w, "storylines", null, () => w.brain.updateStorylines(w.storylines, recent, w.clock.day), () => fallbackBrain.updateStorylinesSync(w.storylines, recent, w.clock.day));
    const valid: Storyline[] = [];
    for (const s of raw) {
      const p = StorylineSchema.safeParse(s);
      if (p.success) valid.push(p.data);
    }
    w.storylines = valid.slice(0, 12);
    for (const s of w.storylines) if (!before.has(s.id)) emit(w, "storyline", `New storyline: ${s.title} — ${s.summary}`, { actors: s.actors.filter((a) => w.npcs[a]), locationId: null, importance: 0, witnesses: [], drama: 4 });
    broadcast(w, { kind: "storylines", storylines: w.storylines });
  })());
}

export async function nightly(w: World): Promise<void> {
  for (const npc of Object.values(w.npcs)) {
    const rt = w.rt[npc.id];
    if (rt.workedToday && rt.wagePaidDay !== w.clock.day) payWage(w, npc);
  }
  dailyIncomes(w);
  ownerDraws(w);
  householdSupport(w);
  exportSurplus(w);
  perishStock(w);
  recordApproval(w);
  w.metrics = computeMetrics(w);
  w.metricsHistory.push(w.metrics);
  if (w.metricsHistory.length > 400) w.metricsHistory.shift();
  broadcast(w, { kind: "metrics", metrics: w.metrics });
  broadcast(w, { kind: "election", election: w.election });
  const m = w.metrics;
  const wages = w.todayEvents.filter((e) => e.type === "wage");
  const wageSum = wages.reduce((a, e) => a + Number(e.data?.wage ?? 0), 0);
  const sales = w.todayEvents.filter((e) => e.type === "transaction").length;
  w.log(`${fmtClock(w.clock)}  [ledger] ${wages.length} wages paid (${w.content.economy.currency.symbol}${Math.round(wageSum)}), ${sales} purchases, ${w.conversationLog.filter((c) => c.day === w.clock.day).length} conversations today`);
  w.log(`${fmtClock(w.clock)}  [metrics] gdp ${m.gdpToday} · cpi ${m.cpi} · unemployment ${Math.round(m.unemployment * 100)}% · treasury ${m.treasury} · gini ${m.gini} · happiness ${m.happiness} · approval ${w.election.approval} · missed rent ${m.missedRent} · missed wages ${m.missedWages} · llm calls ${w.llm.callsToday} ($${w.llm.costTodayUsd.toFixed(4)})`);
  for (const hook of w.nightlyHooks) {
    try {
      await hook(w);
    } catch (e) {
      console.error("[nightly hook]", e);
    }
  }
}

export function newDay(w: World): void {
  economyNewDay(w);
  expireEffects(w);
  newLlmDay(w);
  w.yesterdayEvents = w.todayEvents;
  w.todayEvents = [];
  w.gatherings = w.gatherings.filter((g) => !g.done && g.day >= w.clock.day);
  for (const npc of Object.values(w.npcs)) {
    const rt = w.rt[npc.id];
    rt.injected = [];
    if (npc.sickDays > 0) {
      npc.sickDays -= 1;
      if (npc.sickDays === 0) {
        emit(w, "recovered", `${npc.name} is back on their feet.`, { actors: [npc.id], locationId: npc.home, importance: 3 });
        rt.stepKey = null;
      }
    }
  }
  if (w.festivalDay !== null && w.festivalDay < w.clock.day) w.festivalDay = null;
  storyNewDay(w);
}

/** 08:00 on rent days. */
export function weeklyFinance(w: World): void {
  collectRent(w);
  serviceLoans(w);
}

/** Scheduled gatherings (festival, speeches, fishers' meeting, open mic): inject a plan step. */
export function runGatherings(w: World, hour: number): void {
  for (const g of w.gatherings) {
    if (g.done || g.day !== w.clock.day || g.hour !== hour) continue;
    g.done = true;
    const ids = g.npcs === "any" ? Object.keys(w.npcs).filter((id) => !w.rt[id].sleeping && w.npcs[id].sickDays === 0) : g.npcs.filter((id) => w.npcs[id]);
    const locName = w.content.locations[g.location]?.name ?? g.location;
    for (const id of ids) {
      endConversationsOf(w, id);
      w.rt[id].injected.push({ startHour: hour, endHour: Math.min(24, hour + 2), action: "leisure", location: g.location, intent: `at ${locName} for ${g.reason}` });
      w.rt[id].stepKey = null;
    }
    emit(w, "system", `${ids.length} people head to ${locName} for ${g.reason}.`, { actors: [], locationId: g.location, importance: 2, drama: 3 });
  }
}
