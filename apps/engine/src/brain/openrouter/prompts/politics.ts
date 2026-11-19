import { z } from "zod";
import type { BrainContext, ElectionState, PoliticsDecision, Policy } from "@npcworld/schema";
import { CHARACTER_RULES, EXAMPLE_NOTE, WORLD_FACTS, example, renderLiveContext, renderPersona } from "./common.js";

export function buildPoliticsPrompt(ctx: BrainContext, election: ElectionState, openPolicy: Policy | null, proposals: Record<string, string>) {
  const proposalIds = Object.keys(proposals);
  const isMayor = election.mayor === ctx.self.id;
  const onCouncil = election.council.includes(ctx.self.id);
  const canPropose = (isMayor || onCouncil) && proposalIds.length > 0 && !openPolicy;
  const electionWindow = election.phase === "declared" || election.phase === "campaign";
  const alreadyCandidate = election.candidates.some((c) => c.npcId === ctx.self.id);

  const schema = z.object({
    propose: (proposalIds.length ? z.enum(proposalIds as [string, ...string[]]) : z.string()).nullable().describe("policy id to propose, or null"),
    vote: z.boolean().nullable().describe("your vote on the open policy, or null if there is none"),
    declareCandidacy: z.boolean(),
    platform: z.string().nullable().describe("one or two sentences if declaring, else null"),
    reasoning: z.string().describe("2–3 sentences in your voice"),
  });

  const role = isMayor ? "You are the mayor." : onCouncil ? "You sit on the council." : "You hold no office.";

  const system = [
    renderPersona(ctx.self),
    "",
    WORLD_FACTS,
    "",
    CHARACTER_RULES,
    "",
    `TASK
Politics, in character. ${role}
- propose: ${canPropose ? "as an office-holder with no policy on the table, you MAY propose one policy id from the list, or null if nothing serves you or the people you care about." : "null (you cannot propose right now)."}
- vote: ${openPolicy ? "true or false on the open policy. Vote your wallet, your friends and your grudges, not the common good unless that is who you are." : "null (no policy is open)."}
- declareCandidacy: ${electionWindow && !alreadyCandidate ? "true only if you genuinely want the mayor's chair and could plausibly win a few votes; running costs time and makes enemies." : "false (not a declaration window, or you already declared)."}
- platform: ${electionWindow && !alreadyCandidate ? "if declaring, one or two sentences in your voice on what you'd change; else null." : "null."}
- reasoning: 2–3 sentences in your voice.`,
    "",
    `OUTPUT JSON shape. ${EXAMPLE_NOTE}
${example({ propose: null, vote: false, declareCandidacy: false, platform: null, reasoning: "A twine tariff sounds kind until you're the one selling twine. The fishers will curse me either way, but they still buy rope. I vote no, and I don't run for anything; I have a shop." })}`,
  ].join("\n");

  const user = [
    renderLiveContext(ctx, { maxMemories: 10, maxRelationships: 10 }),
    "",
    `ELECTION: phase ${election.phase}; mayor ${election.mayor}; council ${election.council.join(", ")}; next election day ${election.nextElectionDay}; mayor approval ${election.approval}.`,
    election.candidates.length ? `Declared candidates: ${election.candidates.map((c) => `${c.npcId} ("${c.platform}")`).join("; ")}.` : "No candidates declared yet.",
    openPolicy ? `OPEN POLICY: ${openPolicy.id} — "${openPolicy.title}", proposed by ${openPolicy.proposedBy} on day ${openPolicy.proposedDay}. Votes so far: ${Object.entries(openPolicy.votes).map(([k, v]) => `${k}:${v ? "yes" : "no"}`).join(", ") || "none"}.` : "No policy is open for a vote.",
    proposalIds.length ? `Policies that could be proposed: ${proposalIds.map((id) => `${id}: ${proposals[id]}`).join("; ")}.` : "",
    "",
    "Decide. Return the JSON.",
  ].filter((l) => l !== "").join("\n");

  const map = (w: z.infer<typeof schema>): PoliticsDecision => ({
    propose: canPropose && w.propose && proposalIds.includes(w.propose) ? w.propose : null,
    vote: openPolicy ? w.vote : null,
    declareCandidacy: electionWindow && !alreadyCandidate ? w.declareCandidacy : false,
    platform: electionWindow && !alreadyCandidate && w.declareCandidacy && w.platform ? w.platform.trim() : null,
    reasoning: w.reasoning.trim(),
  });

  return { system, user, schema, map, maxTokens: 500 };
}
