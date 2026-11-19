import { describe, expect, it } from "vitest";
import { makeWorld, runDays } from "./helpers.js";

describe("election", () => {
  it("declares, speaks, votes and counts on day 30", async () => {
    const w = await runDays(makeWorld(3), 31);
    const declared = w.events.filter((e) => e.type === "election_declared");
    expect(declared.length).toBeGreaterThanOrEqual(1);
    expect(w.events.some((e) => e.type === "speech")).toBe(true);
    const result = w.events.find((e) => e.type === "election_result");
    expect(result).toBeDefined();
    expect(w.election.lastResult).not.toBeNull();
    expect(w.election.mayor).toBeTruthy();
    expect(w.npcs[w.election.mayor]).toBeDefined();
    expect(w.election.nextElectionDay).toBe(60);
    expect(w.election.council).toHaveLength(5);
    expect(w.election.approvalHistory.length).toBeGreaterThan(25);
    expect(w.events.some((e) => e.type === "world_event")).toBe(true);
    expect(w.events.some((e) => e.type === "price_change" || e.type === "system")).toBe(true);
  }, 300_000);
});
