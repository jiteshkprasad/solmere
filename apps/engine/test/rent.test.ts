import { describe, expect, it } from "vitest";
import { makeWorld, runDays } from "./helpers.js";

describe("rent cycle", () => {
  it("pays the landlord on day 7 and records misses", async () => {
    const w = makeWorld(1);
    const before = w.npcs.marcus_vale.wallet;
    await runDays(w, 8);
    expect(w.npcs.marcus_vale.wallet).toBeGreaterThan(before);
    const rentEvents = w.events.filter((e) => e.type === "rent");
    expect(rentEvents.length).toBeGreaterThan(3);
    const missed = w.events.filter((e) => e.type === "rent_missed");
    expect(missed.length).toBeGreaterThanOrEqual(1);
    expect(w.loans.some((l) => l.borrower === "mira_okafor")).toBe(true);
    expect(w.events.some((e) => e.type === "loan")).toBe(true);
  });
});
