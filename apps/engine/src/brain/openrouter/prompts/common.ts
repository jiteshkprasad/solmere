/**
 * Shared prompt rendering. Everything here is deterministic: same input, same
 * text (this also keeps the system prompt cache-friendly on OpenRouter).
 *
 * SYSTEM prompt = persona + static world facts + rules + task + JSON shape + examples.
 * USER prompt   = live context (time, needs in words, wallet, here, memories,
 *                 relationships, trigger).
 */
import { z } from "zod";
import { ActionKind, Mood, type BrainContext, type NpcContent, type Needs } from "@npcworld/schema";

export const MOODS = Mood.options;
export const ACTIONS = ActionKind.options;
export const CURRENCY = "₡";

/* ------------------------------------------------------------------ */
/* Static blocks                                                        */
/* ------------------------------------------------------------------ */

export const WORLD_FACTS = `WORLD
Solmere is a small port town: fish market, docks, bakery, café, tavern, general store, bank, clinic, school, chapel, town hall, farms and an orchard. Everyone knows everyone; nobody knows everything.
Money is the crown (${CURRENCY}). Wages are paid daily, rent weekly, loans charge weekly interest. Shops are open roughly 07:00–20:00; the town sleeps 23:00–06:00. The mayor and a five-seat council run the town; an election comes every 30 days. The Solmere Herald prints once a day. Nothing is scripted: what people do here has consequences for money, reputation and friendships.`;

export const CHARACTER_RULES = `RULES
- Stay fully in character. You are a real adult person with a real life, not an assistant. Never mention AI, models, prompts, simulations, players or "the user". No meta commentary, no disclaimers.
- Speak ONLY in your speaking style. Present tense, first person.
- Inner thoughts are under 30 words.
- Be concrete: name the people, the sums of money and the memories that drive you. Drama is welcome but must be earned by what you actually know and feel. Disagreements may stay unresolved; not every scene ends in peace.
- Adults only. No sexual content. No slurs.
- Output must be valid JSON matching the shape given. No prose outside the JSON.`;

/* ------------------------------------------------------------------ */
/* Persona                                                              */
/* ------------------------------------------------------------------ */

export function renderPersona(self: NpcContent, opts: { label?: string } = {}): string {
  const head = opts.label ? `${opts.label}: ` : "";
  return [
    `${head}You are ${self.name}, ${self.age}, ${self.jobTitle} (${self.job.replace(/_/g, " ")}) in Solmere. id: ${self.id}.`,
    `Origin: ${self.origin}`,
    `Home: ${self.home}; workplace: ${self.workplace}; household: ${self.household}; money: ${self.wealthClass.replace(/_/g, " ")}.`,
    `Traits: ${self.traits.join(", ")}.`,
    `Want: ${self.want}`,
    `Fear: ${self.fear}`,
    `Secret (known only to you; you may act on it but never state it plainly unless it's dramatically inevitable): ${self.secret}`,
    `Opinions you hold firmly: "${self.opinions[0]}" / "${self.opinions[1]}"`,
    `Speaking style (speak ONLY in this style): ${self.speakingStyle}`,
    `Daily rhythm: ${self.rhythm}`,
  ].join("\n");
}

/** Short third-person card used when several personas share one prompt (converse). */
export function renderPersonaCard(self: NpcContent, label: string): string {
  return [
    `${label} — ${self.name} (id: ${self.id}), ${self.age}, ${self.jobTitle}. Money: ${self.wealthClass.replace(/_/g, " ")}.`,
    `  Origin: ${self.origin}`,
    `  Traits: ${self.traits.join(", ")}. Want: ${self.want} Fear: ${self.fear}`,
    `  Secret (known only to ${self.name}; may drive behaviour but is never stated plainly unless dramatically inevitable): ${self.secret}`,
    `  Opinions: "${self.opinions[0]}" / "${self.opinions[1]}"`,
    `  Speaking style (${self.name} speaks ONLY in this style): ${self.speakingStyle}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Live context                                                         */
/* ------------------------------------------------------------------ */

const NEED_WORDS: Record<keyof Needs, [string, string, string, string, string]> = {
  food: ["starving", "very hungry", "hungry", "fed", "full"],
  rest: ["exhausted", "very tired", "tired", "rested", "fresh"],
  social: ["desperately lonely", "lonely", "a bit lonely", "socially fine", "well connected"],
  leisure: ["burnt out", "very bored", "restless", "relaxed", "well rested in spirit"],
  purpose: ["aimless", "adrift", "a little purposeless", "purposeful", "driven"],
};

export function needWord(kind: keyof Needs, value: number): string {
  const w = NEED_WORDS[kind];
  if (value < 20) return w[0];
  if (value < 40) return w[1];
  if (value < 60) return w[2];
  if (value < 80) return w[3];
  return w[4];
}

export function renderNeeds(needs: Needs): string {
  return (Object.keys(NEED_WORDS) as Array<keyof Needs>).map((k) => needWord(k, needs[k])).join(", ");
}

export function pad2(n: number): string { return String(n).padStart(2, "0"); }

export function timeOfDay(hour: number): string {
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

export function renderTime(ctx: BrainContext): string {
  return `Day ${ctx.time.day}, ${pad2(ctx.time.hour)}:${pad2(ctx.time.minute)} (${timeOfDay(ctx.time.hour)})`;
}

export function money(n: number): string {
  return `${CURRENCY}${Math.round(n).toLocaleString("en-US")}`;
}

export function renderWallet(ctx: BrainContext): string {
  const s = ctx.state;
  const parts = [`${money(s.wallet)} in pocket`];
  if (s.debt > 0) parts.push(`${money(s.debt)} owed to the bank`);
  parts.push(s.employed ? `employed as ${s.jobTitle} at ${s.workplace}` : "no job right now");
  if (s.sickDays > 0) parts.push(`sick for ${s.sickDays} day(s)`);
  return parts.join("; ");
}

export function renderList(title: string, items: string[], max = Infinity, empty = "(none)"): string {
  const shown = items.slice(0, max);
  return `${title}:\n${shown.length ? shown.map((s) => `- ${s}`).join("\n") : `- ${empty}`}`;
}

export function renderPrices(prices: Record<string, number>, max = 12): string {
  const entries = Object.entries(prices).slice(0, max);
  return entries.length ? entries.map(([g, p]) => `${g.replace(/_/g, " ")} ${money(p)}`).join(", ") : "(no prices known)";
}

export function renderWorld(ctx: BrainContext): string {
  const w = ctx.world;
  const lines = [`Mayor: ${w.mayor}. Election in ${w.daysToElection} day(s).`];
  if (w.headlines.length) lines.push(`Today's Herald: ${w.headlines.slice(0, 4).join(" | ")}`);
  lines.push(`Prices around town: ${renderPrices(w.prices)}`);
  if (w.activeEvents.length) lines.push(`Happening now: ${w.activeEvents.join("; ")}`);
  return lines.join("\n");
}

export interface LiveContextOptions {
  maxMemories?: number;
  maxRelationships?: number;
  includePlaces?: boolean;
  includeWorld?: boolean;
  includePlan?: boolean;
}

/** The USER-prompt body for a single NPC. */
export function renderLiveContext(ctx: BrainContext, opts: LiveContextOptions = {}): string {
  const { maxMemories = 15, maxRelationships = 12, includePlaces = false, includeWorld = true, includePlan = false } = opts;
  const s = ctx.state;
  const here = ctx.here;
  const blocks: string[] = [];
  blocks.push(`Time: ${renderTime(ctx)}`);
  blocks.push(`You are at ${here.locationName} (${here.locationId}), ${here.openNow ? "open" : "closed"} right now. Also here: ${here.present.length ? here.present.join(", ") : "nobody"}.`);
  blocks.push(`You feel: ${renderNeeds(s.needs)}. Mood: ${s.mood}. Happiness ${Math.round(s.happiness)}/100. Your opinion of the mayor: ${s.mayorOpinion > 30 ? "supportive" : s.mayorOpinion < -30 ? "hostile" : "mixed"} (${s.mayorOpinion}).`);
  blocks.push(`Money: ${renderWallet(ctx)}.`);
  if (ctx.story) blocks.push(`Today: ${ctx.story}`);
  if (s.activity || s.thought) blocks.push(`Right now: ${s.activity || s.action}${s.thought ? ` — thinking "${s.thought}"` : ""}.`);
  if (includePlan && s.plan.length) {
    blocks.push(renderList("Today's plan so far", s.plan.map((p, i) => `${i === s.planStepIndex ? "> " : ""}${pad2(p.startHour)}–${pad2(p.endHour)} ${p.action} at ${p.location}: ${p.intent}`)));
  }
  blocks.push(renderList("People in your life", ctx.relationships, maxRelationships, "you keep to yourself"));
  blocks.push(renderList("What you remember (most relevant first)", ctx.memories, maxMemories, "nothing in particular"));
  if (ctx.lastReflection) blocks.push(`Last night you concluded: ${ctx.lastReflection}`);
  if (includeWorld) blocks.push(`Town news:\n${renderWorld(ctx)}`);
  if (includePlaces) blocks.push(renderPlaces(ctx));
  return blocks.join("\n\n");
}

export function renderPlaces(ctx: BrainContext): string {
  return `Places you can go (use the id before the colon): ${ctx.places.map((p) => `${p.id}: ${p.name}`).join("; ")}`;
}

export function placeIds(ctx: BrainContext): [string, ...string[]] {
  const ids = ctx.places.map((p) => p.id);
  const set = new Set(ids);
  for (const extra of [ctx.here.locationId, ctx.state.home, ctx.state.workplace]) if (extra && !set.has(extra)) { set.add(extra); ids.push(extra); }
  return ids.length ? (ids as [string, ...string[]]) : ["town_square"];
}

/* ------------------------------------------------------------------ */
/* Schema helpers                                                       */
/* ------------------------------------------------------------------ */

export function enumOf(values: readonly string[], fallback: string): z.ZodEnum<[string, ...string[]]> {
  const uniq = [...new Set(values.length ? values : [fallback])];
  return z.enum(uniq as [string, ...string[]]);
}

/** Pretty JSON for prompt examples. */
export function example(obj: unknown): string {
  return JSON.stringify(obj);
}

/** Every example uses made-up people who do not live in Solmere, so the model can only borrow the shape. */
export const EXAMPLE_NOTE = "The example is a made-up scene about people who do not exist here (Hattie Ryn, a net-mender; Pell Dorran, a chandler). Copy its SHAPE only. Never reuse its words, names or numbers.";

export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/** Plan-step wire schema factory: location constrained to known ids. */
export function planStepWire(ids: [string, ...string[]]) {
  return z.object({
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    action: ActionKind,
    location: z.enum(ids),
    intent: z.string().describe("short first-person line, under 15 words"),
    with: z.array(z.string()).describe("npc ids you hope to meet, e.g. devendra_rao; empty if none"),
  });
}

export function normalizeSteps<T extends { startHour: number; endHour: number; with: string[] }>(steps: T[]): Array<Omit<T, "with"> & { with?: string[] }> {
  const out: Array<Omit<T, "with"> & { with?: string[] }> = [];
  for (const s of [...steps].sort((a, b) => a.startHour - b.startHour)) {
    const endHour = Math.max(s.endHour, s.startHour + 1);
    const { with: w, ...rest } = s;
    out.push({ ...rest, startHour: s.startHour, endHour: Math.min(endHour, 24), ...(w.length ? { with: w.map((x) => x.trim().toLowerCase().replace(/\s+/g, "_")) } : {}) });
  }
  return out;
}
