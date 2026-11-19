import { describe, expect, it } from "vitest";
import { makeWorld, runDays } from "./helpers.js";
import { storyFor } from "../src/core/story.js";

describe("story director", () => {
  it("moves arcs through to decisions and keeps most people on ordinary days", async () => {
    const w = await runDays(makeWorld(3), 10);
    expect(w.arcs.length).toBeGreaterThanOrEqual(3);
    const decided = w.arcs.filter((a) => a.choice);
    expect(decided.length, "at least two arcs reached a decision in 10 days").toBeGreaterThanOrEqual(2);
    for (const a of decided) expect(a.fact).toBeTruthy();
    expect(w.arcs.filter((a) => a.stage !== "done").length).toBeLessThanOrEqual(3);
    const notes = Object.keys(w.npcs).map((id) => storyFor(w, id) ?? "");
    const drivers = notes.filter((n) => n.startsWith("TODAY'S STORY")).length;
    expect(drivers).toBeGreaterThan(0);
    expect(drivers).toBeLessThanOrEqual(12);
  });

  it("draws everyday village news with real names", async () => {
    const w = await runDays(makeWorld(5), 3);
    const everyday = w.events.filter((e) => e.type === "world_event" && String((e.data as { cardId?: string })?.cardId ?? "").startsWith("life_"));
    expect(everyday.length).toBeGreaterThanOrEqual(2);
    for (const e of everyday) expect(e.text).not.toMatch(/\{name/);
  });
});
