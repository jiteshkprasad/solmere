import { describe, expect, it } from "vitest";
import { WorldSnapshot } from "@npcworld/schema";
import { makeWorld, runDays } from "./helpers.js";
import { snapshot } from "../src/core/scheduler.js";

function findNaN(v: unknown, path = ""): string[] {
  if (typeof v === "number") return Number.isFinite(v) ? [] : [path];
  if (Array.isArray(v)) return v.flatMap((x, i) => findNaN(x, `${path}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => findNaN(x, `${path}.${k}`));
  return [];
}

describe("headless 2 sim-days with MockBrain", () => {
  it("runs a plausible town day", async () => {
    const w = await runDays(makeWorld(1), 2);
    expect(w.clock.day).toBe(3);
    for (const n of Object.values(w.npcs)) expect(n.plan.length, `${n.id} has a plan`).toBeGreaterThan(0);
    expect(w.conversationLog.length).toBeGreaterThanOrEqual(20);
    const wages = w.events.filter((e) => e.type === "wage");
    expect(wages.length).toBeGreaterThan(20);
    expect(w.metricsHistory.length).toBe(2);
    expect(w.metrics.gdpToday).toBeGreaterThan(0);
    expect(w.papers.length).toBe(1);
    expect(w.confessionals.length).toBeGreaterThan(40);
    const snap = snapshot(w);
    expect(findNaN(snap)).toEqual([]);
    expect(() => WorldSnapshot.parse(snap)).not.toThrow();
    expect(findNaN(w.memories)).toEqual([]);
    // every NPC reflected at least once
    for (const id of Object.keys(w.npcs)) expect((w.memories[id] ?? []).some((m) => m.kind === "reflection"), `${id} reflected`).toBe(true);
  });

  it("is deterministic for a given seed", async () => {
    const a = await runDays(makeWorld(7), 1);
    const b = await runDays(makeWorld(7), 1);
    expect(a.eventsTotal).toBe(b.eventsTotal);
    expect(a.metrics).toEqual(b.metrics);
    expect(Object.values(a.npcs).map((n) => n.wallet)).toEqual(Object.values(b.npcs).map((n) => n.wallet));
  });
});
