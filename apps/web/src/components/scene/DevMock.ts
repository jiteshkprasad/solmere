/**
 * Offline stand-in for the engine (NEXT_PUBLIC_MOCK_WORLD=1): loads town.json +
 * cast.json straight from /content, seeds a snapshot, then ticks once a second
 * with 50 NPCs walking between random locations, a few fake conversations and
 * occasional dramatic events. Sim time advances 2 sim-minutes per real second
 * (a day in 12 min). NEXT_PUBLIC_MOCK_HOUR=<n> or ?hour=<n> picks the starting hour.
 */
import type { TownContent, NpcContent, NpcState, WorldSnapshot, Conversation, WorldEvent, SimTime, ActionKind, Mood } from "@npcworld/schema";
import { useWorld } from "@/lib/store";
import { setContent } from "./content";
import { rng } from "./palette";
import townJson from "../../../../../content/town.json";
import castJson from "../../../../../content/cast.json";

const MOODS: Mood[] = ["elated", "happy", "content", "neutral", "neutral", "neutral", "tense", "sad", "angry", "afraid"];
const THOUGHTS = [
  "Rent is due Friday and the till is thin.", "I should talk to Mira before the council meets.", "Fish prices again. Devendra knows exactly what he is doing.",
  "The harbour looks calm. Too calm.", "If I win the election I'll fix the school roof first.", "Nobody tips on Tuesdays.", "I miss the sea when I'm inland.",
  "Wojtek's new batch is better than he lets on.", "Someone left the chapel gate open again.", "I wonder if Rosa noticed.", "Coffee, then the ledger, then the landlord.",
];
const LINES = [
  ["Have you seen the price of mackerel today?", "Devendra's at it again. Someone should tell the council.", "You say that every week and every week you buy the fish."],
  ["Rent's going up in Salt Lane, I heard.", "Vale wouldn't dare. Not before the election.", "He would dare, and he'd smile doing it."],
  ["The bakery loan came through.", "Mira, that's wonderful! Ashdown actually said yes?", "Six percent, weekly. He didn't say yes so much as tighten the noose."],
  ["I'm running for mayor.", "You? Against Halvorsen? What's your platform?", "Honest prices and a roof on the schoolhouse. Also I'm tired of her speeches."],
  ["Your apprentice was at the tavern past midnight.", "Leo's a grown man, Sal.", "He's nineteen and he sang. Badly. The whole street heard."],
  ["Are you coming to the chapel on Sunday?", "If the tide's kind. Chen wants the boats out at dawn.", "The tide is always kind on Sundays, Tunde."],
  ["I painted the harbour again.", "Same view as last month?", "Same view. Different light. Different me."],
  ["Did you deliver that letter to the Rectory?", "Sister Agnes tipped me in prayers.", "Prayers don't pay rent, Dmitri."],
];
const EVENTS: [string, WorldEvent["type"], number][] = [
  ["Tomas Reyes missed rent again — Vale is 'considering options'.", "rent_missed", 7],
  ["Mira Okafor signs a loan with Ashdown & Co.", "loan", 6],
  ["Ingrid Halvorsen gives a speech on the square.", "speech", 8],
  ["Devendra raises fish prices by 15%.", "price_change", 5],
  ["Rosa and Priya argue outside the café.", "argument", 8],
  ["A ship arrives from the south with cheap grain.", "world_event", 6],
  ["Jay Whitlock hired at the garage.", "hired", 4],
  ["Leo Petrov and Zara Okafor seen together at the beach.", "romance", 7],
];

interface Agent { id: string; x: number; y: number; target: string | null; waitUntil: number; action: ActionKind; locationId: string; talkUntil: number }

export function startDevMock(): () => void {
  const town = townJson as unknown as TownContent;
  const cast = (castJson as unknown as { npcs: NpcContent[] }).npcs;
  setContent({ town, cast });
  const rand = rng(42);
  const locs = town.locations;
  const locById = new Map(locs.map((l) => [l.id, l]));
  const publicLocs = locs.filter((l) => l.type !== "home");
  const qs = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const startHour = Number(qs?.get("hour") ?? process.env.NEXT_PUBLIC_MOCK_HOUR ?? 10);
  const time: SimTime = { day: 3, hour: isFinite(startHour) ? startHour : 10, minute: 0, sleeping: false, wallMs: Date.now(), speed: 2, paused: false };

  const agents = new Map<string, Agent>();
  const npcs: Record<string, NpcState> = {};
  for (const c of cast) {
    const daytime = time.hour >= 7 && time.hour < 22;
    const startLoc = locById.get(daytime ? c.workplace : c.home) ?? locs[0];
    const x = startLoc.pos[0] + (rand() - 0.5) * 6, y = startLoc.pos[1] + (rand() - 0.5) * 6;
    agents.set(c.id, { id: c.id, x, y, target: null, waitUntil: Date.now() + rand() * 8000, action: daytime ? "work" : "sleep", locationId: startLoc.id, talkUntil: 0 });
    npcs[c.id] = {
      id: c.id, name: c.name, pos: [x, y], locationId: startLoc.id, targetLocationId: null, action: daytime ? "work" : "sleep", activity: daytime ? `working at ${startLoc.name}` : "asleep",
      thought: THOUGHTS[Math.floor(rand() * THOUGHTS.length)], mood: MOODS[Math.floor(rand() * MOODS.length)], needs: { food: 70, rest: 70, social: 60, leisure: 50, purpose: 60 },
      wallet: Math.round(rand() * 400), debt: 0, employed: c.job !== "unemployed", job: c.job, jobTitle: c.jobTitle, home: c.home, workplace: c.workplace,
      plan: [], planStepIndex: 0, conversationId: null, sickDays: 0, mayorOpinion: Math.round((rand() - 0.5) * 100), happiness: Math.round(40 + rand() * 50),
    };
  }

  const snapshot: WorldSnapshot = {
    town: town.name, time, npcs, businesses: {}, relationships: [
      { a: "chen_wei", b: "devendra_rao", type: "rival", affinity: -55, lastInteractionDay: 2 },
      { a: "leo_petrov", b: "zara_okafor", type: "romantic", affinity: 40, lastInteractionDay: 2 },
      { a: "rosa_moreno", b: "priya_nair", type: "enemy", affinity: -30, lastInteractionDay: 1 },
    ],
    conversations: [], election: { nextElectionDay: 30, phase: "quiet", candidates: [], speeches: [], lastResult: null, mayor: "ingrid_halvorsen", council: ["marcus_vale", "cornelius_ashdown", "lakshmi_rao", "idris_bello", "agnes_duarte"], approval: 12, approvalHistory: [{ day: 1, approval: 20 }, { day: 2, approval: 15 }, { day: 3, approval: 12 }] },
    policies: [], loans: [], metrics: { day: 3, gdpToday: 1240, cpi: 1.03, unemployment: 0.04, treasury: 5200, gini: 0.41, happiness: 58, loansOutstanding: 1, missedRent: 1, missedWages: 0, priceIndex: { fish: 4.2, bread: 2.1, ale: 3 }, cohesion: 0.62, lonely: ["jay_whitlock"] },
    metricsHistory: [], storylines: [{ id: "s1", title: "The bakery loan", summary: "Mira borrowed from Ashdown; the terms are brutal.", actors: ["mira_okafor", "cornelius_ashdown"], eventIds: [], status: "active", startedDay: 2, updatedDay: 3, heat: 6 }],
    latestPaper: null, activeWorldEvents: [], lastEventSeq: 0, llm: { callsToday: 0, costTodayUsd: 0, costTotalUsd: 0, failRate: 0, bulkModel: "mock", midModel: "mock" },
  };
  const store = useWorld.getState();
  store.applyFrame({ kind: "snapshot", snapshot });
  store.setUi({ connected: true });

  const convs = new Map<string, Conversation>();
  let seq = 1, convSeq = 1, lastEventAt = Date.now();
  const SPEED = 2.4; // m per tick

  const tick = () => {
    const now = Date.now();
    const st = useWorld.getState();
    // clock — advance whatever is in the store so we coexist with the HUD's own mock ticker
    const cur = st.time ?? time;
    time.day = cur.day; time.hour = cur.hour; time.minute = cur.minute + time.speed;
    while (time.minute >= 60) { time.minute -= 60; time.hour = (time.hour + 1) % 24; if (time.hour === 0) time.day++; }
    time.wallMs = now;
    time.sleeping = time.hour >= 23 || time.hour < 6;
    const npcsNow = st.npcs;
    const updates: Array<Pick<NpcState, "id" | "pos" | "locationId" | "targetLocationId" | "action" | "activity" | "mood" | "thought" | "conversationId">> = [];

    for (const a of agents.values()) {
      const n = npcsNow[a.id];
      if (!n) continue;
      const night = time.hour >= 22 || time.hour < 6;
      if (a.talkUntil > now) {
        // stay put while talking
      } else if (a.target) {
        const t = locById.get(a.target)!;
        const dx = t.pos[0] - a.x, dy = t.pos[1] - a.y, d = Math.hypot(dx, dy);
        if (d <= SPEED) {
          a.x = t.pos[0] + (rand() - 0.5) * 5; a.y = t.pos[1] + (rand() - 0.5) * 5;
          a.locationId = a.target; a.target = null;
          a.action = night ? "sleep" : t.type === "home" ? "idle" : t.type === "open" ? "leisure" : t.type === "business" ? (rand() < 0.5 ? "shop" : "eat") : "work";
          a.waitUntil = now + 6000 + rand() * 25000;
        } else { a.x += (dx / d) * SPEED; a.y += (dy / d) * SPEED; a.action = "walk"; }
      } else if (now > a.waitUntil) {
        const dest = night ? locById.get(n.home)! : rand() < 0.35 ? locById.get(n.workplace)! : publicLocs[Math.floor(rand() * publicLocs.length)];
        if (dest.id !== a.locationId) { a.target = dest.id; a.action = "walk"; } else a.waitUntil = now + 5000 + rand() * 10000;
      }
      // sleeping NPCs stay asleep at night if home
      if (night && a.locationId === n.home && !a.target) a.action = "sleep";
      if (!night && a.action === "sleep") a.action = "idle";
      updates.push({
        id: a.id, pos: [Math.round(a.x * 100) / 100, Math.round(a.y * 100) / 100], locationId: a.locationId, targetLocationId: a.target, action: a.action,
        activity: a.action === "walk" ? `walking to ${locById.get(a.target!)?.name}` : a.action === "talk" ? "chatting" : `${a.action} at ${locById.get(a.locationId)?.name}`,
        mood: rand() < 0.01 ? MOODS[Math.floor(rand() * MOODS.length)] : n.mood, thought: rand() < 0.01 ? THOUGHTS[Math.floor(rand() * THOUGHTS.length)] : n.thought, conversationId: n.conversationId,
      });
    }

    // conversations: advance cursors; end; spawn new ones between idle NPCs at the same spot
    for (const c of convs.values()) {
      if (c.done) continue;
      if (now - (c as unknown as { _t: number })._t > 4000) {
        (c as unknown as { _t: number })._t = now;
        c.cursor++;
        if (c.cursor >= c.lines.length) {
          c.done = true; c.cursor = c.lines.length - 1;
          for (const p of c.participants) { const a = agents.get(p)!; a.talkUntil = 0; a.action = "idle"; a.waitUntil = now + 3000; const u = updates.find((x) => x.id === p); if (u) { u.conversationId = null; u.action = "idle"; } }
          if (c.drama >= 7) st.applyFrame({ kind: "events", events: [{ id: "e" + seq, seq: seq++, day: time.day, hour: time.hour, minute: time.minute, type: "argument", actors: c.participants, locationId: c.locationId, text: `${c.participants.map((p) => npcsNow[p]?.name.split(" ")[0]).join(" and ")} fall out at ${locById.get(c.locationId)?.name}`, importance: 6, drama: c.drama }] });
        }
        st.applyFrame({ kind: "conversation", conversation: { ...c } });
      }
    }
    const active = [...convs.values()].filter((c) => !c.done);
    if (active.length < 3 && rand() < 0.5) {
      const byLoc = new Map<string, Agent[]>();
      for (const a of agents.values()) if (!a.target && a.talkUntil < now && a.action !== "sleep") { const arr = byLoc.get(a.locationId) ?? []; arr.push(a); byLoc.set(a.locationId, arr); }
      const groups = [...byLoc.values()].filter((g) => g.length >= 2);
      if (groups.length) {
        const g = groups[Math.floor(rand() * groups.length)];
        const [a, b] = g.sort(() => rand() - 0.5);
        const script = LINES[Math.floor(rand() * LINES.length)];
        const id = "c" + convSeq++;
        const c: Conversation = { id, day: time.day, hour: time.hour, locationId: a.locationId, participants: [a.id, b.id], lines: script.map((text, i) => ({ speaker: i % 2 ? b.id : a.id, text })), cursor: 0, done: false, summary: "", drama: Math.round(2 + rand() * 7) };
        (c as unknown as { _t: number })._t = now;
        convs.set(id, c);
        for (const p of [a, b]) { p.talkUntil = now + 4000 * (script.length + 1); p.action = "talk"; const u = updates.find((x) => x.id === p.id); if (u) { u.conversationId = id; u.action = "talk"; } }
        st.applyFrame({ kind: "conversation", conversation: { ...c } });
      }
    }
    for (const [id, c] of convs) if (c.done && now - (c as unknown as { _t: number })._t > 30000) convs.delete(id);

    // occasional dramatic events
    if (now - lastEventAt > 14000 + rand() * 12000) {
      lastEventAt = now;
      const [text, type, drama] = EVENTS[Math.floor(rand() * EVENTS.length)];
      const ids = [...agents.keys()];
      const actors = [ids[Math.floor(rand() * ids.length)], ids[Math.floor(rand() * ids.length)]];
      st.applyFrame({ kind: "events", events: [{ id: "e" + seq, seq: seq++, day: time.day, hour: time.hour, minute: time.minute, type, actors, locationId: agents.get(actors[0])!.locationId, text, importance: drama, drama }] });
    }

    st.applyFrame({ kind: "tick", time: { ...time }, npcs: updates });
  };

  const h = window.setInterval(tick, 1000);
  tick();
  return () => window.clearInterval(h);
}
