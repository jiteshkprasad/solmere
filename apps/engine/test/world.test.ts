import { describe, expect, it } from "vitest";
import { loadContent } from "../src/core/content.js";
import { makeWorld } from "./helpers.js";

describe("content + world init", () => {
  it("loads and validates all content files", () => {
    const c = loadContent();
    expect(c.cast.npcs).toHaveLength(50);
    expect(c.town.locations.length).toBeGreaterThan(40);
    expect(c.events.deck.length).toBeGreaterThan(10);
  });

  it("initialises 50 NPCs at home with money", () => {
    const w = makeWorld(1);
    const ids = Object.keys(w.npcs);
    expect(ids).toHaveLength(50);
    for (const id of ids) {
      const n = w.npcs[id];
      expect(n.locationId).toBe(n.home);
      expect(n.pos).toEqual(w.content.locations[n.home].pos);
      expect(n.wallet).toBeGreaterThan(0);
      expect(n.action).toBe("sleep");
    }
    expect(Object.keys(w.businesses).length).toBe(Object.keys(w.content.economy.startingBusinessAccounts).length);
    expect(w.businesses.bakery.account).toBe(900);
    expect(w.election.mayor).toBe("ingrid_halvorsen");
    expect(w.election.council).toHaveLength(5);
    expect(w.loans.find((l) => l.borrower === "mira_okafor")?.missedPayments).toBe(2);
    expect(w.rel.size).toBeGreaterThan(190);
    expect(w.metrics.gini).toBeGreaterThan(0.3);
  });
});
