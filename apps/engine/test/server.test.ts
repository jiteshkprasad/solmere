import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorldSnapshot } from "@npcworld/schema";
import { makeWorld, runDays } from "./helpers.js";
import { startServer } from "../src/server/index.js";
import type { World } from "../src/core/types.js";
process.env.ADMIN_TOKEN ??= "change-me"; // test-only token

let w: World;
let stop: () => void;
let base: string;

function hasKey(v: unknown, key: string): boolean {
  if (Array.isArray(v)) return v.some((x) => hasKey(x, key));
  if (v && typeof v === "object") return Object.keys(v).some((k) => k === key || hasKey((v as Record<string, unknown>)[k], key));
  return false;
}

beforeAll(async () => {
  w = await runDays(makeWorld(1), 1);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const s = startServer(w, port);
  stop = s.stop;
  base = `http://127.0.0.1:${port}`;
  await new Promise((r) => setTimeout(r, 200));
});

afterAll(() => stop());

describe("http api", () => {
  it("serves health, state and content", async () => {
    const h = (await (await fetch(`${base}/healthz`)).json()) as { ok: boolean };
    expect(h.ok).toBe(true);
    const state = await (await fetch(`${base}/api/state`)).json();
    expect(() => WorldSnapshot.parse(state)).not.toThrow();
    const content = (await (await fetch(`${base}/api/content`)).json()) as { cast: { npcs: unknown[] } };
    expect(content.cast.npcs).toHaveLength(50);
    expect(hasKey(content, "secret")).toBe(false);
    const npc = (await (await fetch(`${base}/api/npcs/mira_okafor`)).json()) as { state: { id: string }; content: unknown; memories: unknown };
    expect(npc.state.id).toBe("mira_okafor");
    expect(hasKey(npc.content, "secret")).toBe(false);
    expect(Array.isArray(npc.memories)).toBe(true);
    const events = (await (await fetch(`${base}/api/events?since=0&limit=5`)).json()) as unknown[];
    expect(events.length).toBe(5);
    const metrics = (await (await fetch(`${base}/api/metrics`)).json()) as unknown[];
    expect(metrics.length).toBeGreaterThanOrEqual(1);
    expect((await fetch(`${base}/api/paper/999`)).status).toBe(404);
  });

  it("guards admin endpoints", async () => {
    expect((await fetch(`${base}/api/admin/pause`, { method: "POST" })).status).toBe(401);
    const ok = await fetch(`${base}/api/admin/pause`, { method: "POST", headers: { "x-admin-token": "change-me" } });
    expect(ok.status).toBe(200);
    expect(w.clock.paused).toBe(true);
    await fetch(`${base}/api/admin/resume`, { method: "POST", headers: { "x-admin-token": "change-me" } });
    expect(w.clock.paused).toBe(false);
    const inj = await fetch(`${base}/api/admin/inject`, { method: "POST", headers: { "x-admin-token": "change-me", "content-type": "application/json" }, body: JSON.stringify({ cardId: "storm" }) });
    expect(inj.status).toBe(200);
    expect(w.events.some((e) => e.type === "world_event" && e.data?.cardId === "storm")).toBe(true);
  });

  it("streams a snapshot first on /api/stream", async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/stream`, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: snapshot");
    ctrl.abort();
  });
});
