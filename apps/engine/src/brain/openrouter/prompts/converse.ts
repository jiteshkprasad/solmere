import { z } from "zod";
import { EventType, Mood, type ConverseInput, type ConverseOutput } from "@npcworld/schema";
import { CHARACTER_RULES, EXAMPLE_NOTE, WORLD_FACTS, clamp, enumOf, example, renderList, renderNeeds, renderPersonaCard, renderTime, renderWallet } from "./common.js";

const CONVERSATION_EVENT_TYPES = ["conversation", "argument", "romance", "breakup", "friendship", "feud", "gossip"] as const;

export function buildConversePrompt(input: ConverseInput) {
  const parts = input.participants;
  const ids = parts.map((p) => p.self.id);
  const idEnum = enumOf(ids, "unknown");

  const schema = z.object({
    lines: z.array(z.object({ speaker: idEnum, text: z.string().describe("under 25 words, spoken aloud") })).min(4).max(8),
    summary: z.string().describe("one neutral sentence of what happened, third person"),
    outcomes: z.array(
      z.object({
        npcId: idEnum,
        memory: z.string().describe("first-person memory of this talk, one sentence, names and sums included"),
        importance: z.number().min(0).max(10),
        mood: Mood,
        affinityDelta: z.array(z.object({ npcId: idEnum, delta: z.number().min(-30).max(30) })).describe("how this person's feeling toward each OTHER participant moved"),
        gossipLearned: z.string().nullable().describe("something learned about a third party, or null"),
      }),
    ).min(parts.length).max(parts.length),
    drama: z.number().min(0).max(10),
    eventType: z.enum(CONVERSATION_EVENT_TYPES).nullable(),
  });

  const labels = ["A", "B", "C"];
  const system = [
    `You write one real conversation between ${parts.length} people in Solmere and its consequences. Each speaker is a distinct person below; you voice all of them.`,
    "",
    parts.map((p, i) => renderPersonaCard(p.self, `SPEAKER ${labels[i]}`)).join("\n\n"),
    "",
    WORLD_FACTS,
    "",
    CHARACTER_RULES.replace("- Speak ONLY in your speaking style. Present tense, first person.", "- Each person speaks ONLY in their own speaking style; a reader should tell them apart with the names removed."),
    "",
    `TASK
Write the exchange as 4–8 spoken lines. Speakers alternate naturally (nobody gets two lines in a row unless interrupted by silence). Each line is under 25 words, spoken aloud, no stage directions in brackets. Start from the pretext and from each person's "Today" note.
This is a real village. Most talk is ordinary: work, food, weather with a point to it, family, a joke, a favour, a small worry, a bit of news. Conflict when a "Today" note or the pretext carries a story beat or a small friction (money owed, a broken promise, a noisy neighbour), or when someone is genuinely provoked; then make it specific (names, sums, what was done) and let it move forward: a new fact, a demand, a refusal, a promise, an apology, a threat. Never just restate an old grievance.
Do not repeat what these people already said to each other (listed below): add something new or talk about something else. Secrets leak through behaviour, not confession. People may disagree, deflect, tease or refuse, and things may stay unresolved.
Then report the consequences:
- outcomes: exactly one entry per participant (npcId = their id). memory: what they will remember, first person, one sentence, concrete. importance 0–10 (a routine chat is 2–3, a threat or promise 6–8, a life-changing revelation 9–10). mood after the talk. affinityDelta: one entry per OTHER participant, -30..30 (a routine chat moves ±2–5; a betrayal or real kindness ±15–30). gossipLearned: only if a third party was discussed in a way they'll repeat.
- summary: one neutral third-person sentence for the town record.
- drama 0–10; eventType: "conversation" for ordinary talk, "argument", "gossip", "friendship", "romance", "feud" or "breakup" when that is truly what happened, else null.`,
    "",
    `OUTPUT JSON shape. ${EXAMPLE_NOTE}
${example({
  lines: [
    { speaker: "hattie_ryn", text: "Nine crowns a spool, Pell. Nine. It was seven at midsummer." },
    { speaker: "pell_dorran", text: "Talk to the mill, Hattie, not to me. I pay eight before it's on the shelf." },
    { speaker: "hattie_ryn", text: "Then show me the mill's bill. You've a new cart and I've a torn trawl." },
    { speaker: "pell_dorran", text: "Eight, if you take three spools and stop counting my carts." },
    { speaker: "hattie_ryn", text: "Eight. And I'll tell the Marren boys you can bend when it suits you." },
  ],
  summary: "Hattie Ryn haggled Pell Dorran down to eight crowns a spool at the chandlery and let him know she'd tell others he can be moved.",
  outcomes: [
    { npcId: "hattie_ryn", memory: "I got Pell down to eight a spool, but only by threatening to tell the Marren boys he bends.", importance: 4, mood: "content", affinityDelta: [{ npcId: "pell_dorran", delta: -3 }], gossipLearned: null },
    { npcId: "pell_dorran", memory: "Hattie Ryn got eight a spool out of me and now knows I bend; if she tells the Marrens I have a problem.", importance: 6, mood: "tense", affinityDelta: [{ npcId: "hattie_ryn", delta: -6 }], gossipLearned: "Hattie has a torn trawl to mend — someone's boat is out of the water this week." },
  ],
  drama: 4,
  eventType: "argument",
})}`,
  ].join("\n");

  const userBlocks = parts.map((p, i) => {
    const s = p.state;
    return [
      `SPEAKER ${labels[i]} — ${p.self.name} (${p.self.id}) right now:`,
      `Feels: ${renderNeeds(s.needs)}. Mood: ${s.mood}. Money: ${renderWallet(p)}.`,
      renderList("People in their life", p.relationships, 8, "keeps to themselves"),
      renderList("What they remember (most relevant first)", p.memories, 8, "nothing in particular"),
      p.lastReflection ? `Last night they concluded: ${p.lastReflection}` : "",
      p.state.thought ? `Current thought: "${p.state.thought}"` : "",
      p.story ? `Today: ${p.story}` : "",
    ].filter(Boolean).join("\n");
  });
  const first = parts[0];
  const user = [
    `Time: ${renderTime(first)}. Place: ${input.locationName}. Others nearby: ${first.here.present.filter((n) => !parts.some((p) => p.self.name === n || p.self.id === n)).join(", ") || "nobody"}.`,
    `Town news: mayor ${first.world.mayor}, election in ${first.world.daysToElection} day(s).${first.world.headlines.length ? ` Herald: ${first.world.headlines.slice(0, 3).join(" | ")}` : ""}${first.world.activeEvents.length ? ` Happening: ${first.world.activeEvents.join("; ")}` : ""}`,
    "",
    userBlocks.join("\n\n"),
    "",
    input.history?.length ? `What they already said to each other recently (do not repeat; move on or add something new):\n${input.history.map((h) => `- ${h}`).join("\n")}` : "",
    input.avoidTopics?.length ? `The whole town has talked these to death today; avoid them unless a Today note demands it: ${input.avoidTopics.join(", ")}.` : "",
    `PRETEXT: ${input.pretext}`,
    "",
    `Write the conversation (4–8 lines, speakers by id: ${ids.join(", ")}) and its consequences. Return the JSON.`,
  ].join("\n");

  const map = (w: z.infer<typeof schema>): ConverseOutput => {
    const byId = new Map(w.outcomes.map((o) => [o.npcId, o]));
    const outcomes = parts.map((p) => {
      const o = byId.get(p.self.id);
      const delta: Record<string, number> = {};
      for (const other of ids) if (other !== p.self.id) delta[other] = 0;
      for (const d of o?.affinityDelta ?? []) if (d.npcId !== p.self.id && d.npcId in delta) delta[d.npcId] = clamp(Math.round(d.delta), -30, 30);
      return {
        npcId: p.self.id,
        memory: o?.memory?.trim() || `I talked with ${parts.filter((q) => q !== p).map((q) => q.self.name).join(" and ")} at ${input.locationName}.`,
        importance: clamp(Math.round(o?.importance ?? 3), 0, 10),
        mood: o?.mood ?? p.state.mood,
        affinityDelta: delta,
        ...(o?.gossipLearned ? { gossipLearned: o.gossipLearned.trim() } : {}),
      };
    });
    return {
      lines: w.lines.map((l) => ({ speaker: l.speaker, text: l.text.trim() })),
      summary: w.summary.trim(),
      outcomes,
      drama: clamp(Math.round(w.drama), 0, 10),
      eventType: w.eventType ? (EventType.parse(w.eventType)) : null,
    };
  };

  return { system, user, schema, map, maxTokens: 1400 };
}
