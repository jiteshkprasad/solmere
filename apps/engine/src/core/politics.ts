import type { Policy, PoliticsDecision, VoteDecision } from "@npcworld/schema";
import type { World } from "./types.js";
import { brainCall, track } from "./brainRunner.js";
import { buildContext, presentAt, tag } from "./context.js";
import { broadcast, emit } from "./eventlog.js";
import { addMemory } from "./memory.js";
import { applyEffects, proposePolicy } from "./events.js";
import { INITIAL_MAYOR } from "./world.js";

export const DECLARE_DAYS_BEFORE = 10;
export const SPEECH_DAYS_BEFORE = 5;
const MAX_CHALLENGERS = 4;

function proposals(w: World): Record<string, string> {
  return Object.fromEntries(Object.entries(w.content.events.policyProposals).map(([id, p]) => [id, p.title]));
}

function openPolicy(w: World): Policy | null {
  return w.policies.find((p) => p.status === "proposed") ?? null;
}

/** The 6 NPCs most likely to run: ambition in their `want`, or a grudge against the mayor. */
export function ambitious(w: World, n = 6): string[] {
  const score = (id: string) => {
    const want = (w.content.npcs[id].want + " " + w.content.npcs[id].opinions.join(" ")).toLowerCase();
    let s = 0;
    if (/\bmayor\b/.test(want)) s += 6;
    if (/\bcouncil\b/.test(want)) s += 4;
    if (/\bprices?\b|\brent\b/.test(want)) s += 2;
    s += Math.max(0, -w.npcs[id].mayorOpinion) / 20;
    return s;
  };
  return Object.keys(w.npcs)
    .filter((id) => id !== w.election.mayor && !w.election.council.includes(id))
    .sort((a, b) => score(b) - score(a))
    .slice(0, n);
}

/** 06:00 of election-relevant days: schedule the speech gathering. */
export function politicsMorning(w: World): void {
  const e = w.election;
  if (w.clock.day === e.nextElectionDay - SPEECH_DAYS_BEFORE && e.candidates.length) {
    w.gatherings.push({ day: w.clock.day, hour: 12, location: "town_square", npcs: "any", reason: "the candidates' speeches", done: false });
  }
  if (w.clock.day === e.nextElectionDay) {
    w.gatherings.push({ day: w.clock.day, hour: 10, location: "town_hall", npcs: "any", reason: "election day voting", done: false });
  }
}

/** Hourly hook. */
export function politicsHour(w: World, hour: number): void {
  const e = w.election;
  const day = w.clock.day;
  if (hour === 9 && day === e.nextElectionDay - DECLARE_DAYS_BEFORE) track(w, declareWindow(w));
  if (hour === 12 && day === e.nextElectionDay - SPEECH_DAYS_BEFORE) track(w, speeches(w));
  if (hour === 10 && day === e.nextElectionDay) track(w, runVote(w));
  if (hour === 10 && day !== e.nextElectionDay) {
    const open = openPolicy(w);
    if (open && open.proposedDay < day) track(w, councilVote(w, open));
    else if (!open && day % 7 === 3) track(w, mayorProposes(w));
  }
}

async function askPolitics(w: World, id: string, trigger: string): Promise<PoliticsDecision> {
  const ctx = buildContext(w, id, trigger, "mayor election council policy " + trigger);
  const fallback = (): PoliticsDecision => ({ propose: null, vote: null, declareCandidacy: false, platform: null, reasoning: "no answer" });
  return brainCall(w, "politics", id, () => w.brain.politics(ctx, w.election, openPolicy(w), proposals(w)), fallback);
}

async function declareWindow(w: World): Promise<void> {
  const e = w.election;
  e.phase = "declared";
  e.candidates = [];
  const asked = [e.mayor, ...e.council, ...ambitious(w)].filter((id, i, arr) => arr.indexOf(id) === i && w.npcs[id]);
  const answers = await Promise.all(asked.map(async (id) => [id, await askPolitics(w, id, `The mayoral election is in ${DECLARE_DAYS_BEFORE} days. Candidates must declare today. Will you run, and on what platform?`)] as const));
  const declared = answers.filter(([, a]) => a.declareCandidacy);
  const incumbent = declared.find(([id]) => id === e.mayor);
  const challengers = declared.filter(([id]) => id !== e.mayor).slice(0, MAX_CHALLENGERS);
  const list = incumbent ? [incumbent, ...challengers] : challengers.length ? challengers : [[e.mayor, { platform: "Steady hands. Finish what we started." }] as const];
  for (const [id, a] of list) {
    const platform = a.platform?.trim() || "A fair deal for everyone in Solmere.";
    e.candidates.push({ npcId: id, platform, declaredDay: w.clock.day });
    emit(w, "election_declared", `${w.npcs[id].name} declares for mayor: "${platform}"`, { actors: [id], locationId: "town_hall", importance: 6, witnesses: Object.keys(w.npcs) });
  }
  broadcast(w, { kind: "election", election: e });
}

async function speeches(w: World): Promise<void> {
  const e = w.election;
  e.phase = "campaign";
  for (const c of e.candidates) {
    const ctx = buildContext(w, c.npcId, "You are giving your election speech in the town square.", "speech election mayor " + c.platform);
    const text = await brainCall(w, "speech", c.npcId, () => w.brain.speech(ctx, c.platform), () => `${c.platform} That is my promise to Solmere.`);
    e.speeches.push({ npcId: c.npcId, day: w.clock.day, text });
    const npc = w.npcs[c.npcId];
    npc.action = "speech";
    npc.activity = "giving a speech in the square";
    const present = presentAt(w, "town_square", c.npcId).map((n) => n.id);
    emit(w, "speech", `${npc.name} speaks in the square: "${text.slice(0, 160)}${text.length > 160 ? "…" : ""}"`, {
      actors: [c.npcId], locationId: "town_square", importance: 6, witnesses: [c.npcId, ...present], data: { text },
    });
    for (const id of present) addMemory(w, id, "event", `${npc.name}'s election speech: ${text}`, 6, [c.npcId]);
  }
  broadcast(w, { kind: "election", election: e });
}

async function runVote(w: World): Promise<void> {
  const e = w.election;
  e.phase = "voting";
  if (!e.candidates.length) e.candidates.push({ npcId: e.mayor, platform: "Steady hands.", declaredDay: w.clock.day });
  const candidates = e.candidates.map((c) => ({ npcId: c.npcId, name: w.npcs[c.npcId].name, platform: c.platform, speech: e.speeches.find((s) => s.npcId === c.npcId)?.text ?? "" }));
  const tally: Record<string, number> = Object.fromEntries(candidates.map((c) => [c.npcId, 0]));
  const votes = await Promise.all(Object.keys(w.npcs).map(async (id) => {
    const ctx = buildContext(w, id, "It is election day. Cast your vote for mayor.", "election mayor vote " + candidates.map((c) => c.name).join(" "));
    const fallback = (): VoteDecision => ({ candidate: candidates[0].npcId, reasoning: "default" });
    const v = await brainCall(w, "vote", id, () => w.brain.vote(ctx, candidates), fallback);
    return [id, tally[v.candidate] !== undefined ? v.candidate : candidates[0].npcId, v.reasoning] as const;
  }));
  for (const [voter, cand, reasoning] of votes) {
    tally[cand] += 1;
    w.npcs[voter].action = "vote";
    emit(w, "vote", `${w.npcs[voter].name} votes for ${w.npcs[cand].name}.`, { actors: [voter], locationId: "town_hall", importance: 2, quiet: true, data: { candidate: cand, reasoning } });
  }
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const top = ranked.filter(([, v]) => v === ranked[0][1]).map(([id]) => id);
  const winner = top.length > 1 ? w.rng.pick(top) : top[0];
  const previousMayor = e.mayor;
  e.lastResult = { day: w.clock.day, tally, winner };
  e.mayor = winner;
  e.council = newCouncil(w, ranked.map(([id]) => id), winner);
  e.phase = "counted";
  e.candidates = [];
  e.speeches = [];
  e.nextElectionDay = w.clock.day + w.content.town.clock.electionEveryDays;
  syncMayorJob(w, previousMayor);
  const summary = ranked.map(([id, v]) => `${w.npcs[id].name.split(" ")[0]} ${v}`).join(", ");
  emit(w, "election_result", winner === previousMayor ? `${w.npcs[winner].name} is re-elected mayor (${summary}).` : `${w.npcs[winner].name} is the new mayor of Solmere, unseating ${w.npcs[previousMayor].name} (${summary}).`, {
    actors: [winner, previousMayor], locationId: "town_hall", importance: 9, witnesses: Object.keys(w.npcs), data: { tally },
  });
  for (const id of Object.keys(w.npcs)) w.rt[id].triggers.push(`Election result: ${w.npcs[winner].name} is mayor. Council: ${e.council.map((c) => w.npcs[c].name).join(", ")}.`);
  broadcast(w, { kind: "election", election: e });
}

function newCouncil(w: World, rankedCandidates: string[], winner: string): string[] {
  const council: string[] = [];
  for (const id of rankedCandidates) if (id !== winner && council.length < 5) council.push(id);
  for (const id of w.election.council) if (id !== winner && !council.includes(id) && council.length < 5) council.push(id);
  const byOpinion = Object.values(w.npcs).filter((n) => n.id !== winner && !council.includes(n.id)).sort((a, b) => b.mayorOpinion - a.mayorOpinion);
  for (const n of byOpinion) if (council.length < 5) council.push(n.id);
  return council;
}

/** Keep NPC job fields consistent with who is mayor (also used when resuming a snapshot). */
export function syncMayorJob(w: World, previousMayor?: string): void {
  const mayor = w.election.mayor;
  const m = w.npcs[mayor];
  if (m && m.job !== "mayor") {
    m.job = "mayor";
    m.jobTitle = "Mayor of Solmere";
    m.employed = true;
    m.workplace = "town_hall";
    w.content.npcs[mayor].employer = "town";
    w.content.npcs[mayor].workplace = "town_hall";
  }
  const old = previousMayor && previousMayor !== mayor ? previousMayor : mayor !== INITIAL_MAYOR ? INITIAL_MAYOR : null;
  const o = old ? w.npcs[old] : null;
  if (o && o.job === "mayor") {
    o.job = "former_mayor";
    o.jobTitle = "Former mayor";
    o.employed = false;
    o.workplace = "town_square";
    w.content.npcs[old!].employer = null;
    w.content.npcs[old!].workplace = "town_square";
  }
}

async function mayorProposes(w: World): Promise<void> {
  const a = await askPolitics(w, w.election.mayor, "Weekly council session: you may propose one policy from the list, or none.");
  if (a.propose && w.content.events.policyProposals[a.propose]) proposePolicy(w, a.propose, w.election.mayor);
}

async function councilVote(w: World, policy: Policy): Promise<void> {
  const votes = await Promise.all(w.election.council.map(async (id) => {
    const a = await askPolitics(w, id, `Council vote today on: "${policy.title}" (proposed by ${policy.proposedBy === "petition" ? "petition" : w.npcs[policy.proposedBy]?.name}). Vote yes or no.`);
    return [id, a.vote === true] as const;
  }));
  for (const [id, v] of votes) policy.votes[id] = v;
  const yes = votes.filter(([, v]) => v).length;
  policy.status = yes * 2 > votes.length ? "passed" : "rejected";
  const names = votes.map(([id, v]) => `${w.npcs[id].name.split(" ")[0]} ${v ? "yes" : "no"}`).join(", ");
  emit(w, "policy_vote", `Council ${policy.status === "passed" ? "PASSES" : "rejects"} "${policy.title}" ${yes}-${votes.length - yes} (${names}).`, {
    actors: [w.election.mayor, ...w.election.council], locationId: "town_hall", importance: 7, witnesses: Object.keys(w.npcs), data: { policyId: policy.id, votes: policy.votes },
  });
  if (policy.status === "passed") {
    const { _policyId, ...effects } = policy.effects as Record<string, unknown>;
    applyEffects(w, effects, { cardId: `policy:${String(_policyId)}`, title: policy.title });
  }
  broadcast(w, { kind: "election", election: w.election });
}

/** 23:59: approval = mean mayorOpinion. */
export function recordApproval(w: World): void {
  const vals = Object.values(w.npcs).map((n) => n.mayorOpinion);
  const approval = Math.round((vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)) * 10) / 10;
  w.election.approval = approval;
  w.election.approvalHistory.push({ day: w.clock.day, approval });
  if (w.election.approvalHistory.length > 400) w.election.approvalHistory.shift();
}

export function mayorName(w: World): string {
  return tag(w, w.election.mayor);
}
