import { Hono } from "hono";
import { arcsSummary } from "../core/story.js";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import { ADMIN_HEADER, type StreamFrame } from "@npcworld/schema";
import type { World } from "../core/types.js";
import { snapshot, tickFrame } from "../core/scheduler.js";
import { publicCast } from "../core/content.js";
import { recentMemories } from "../core/memory.js";
import { edgesTouching } from "../core/relationships.js";
import { drainPendingEvents } from "../core/eventlog.js";
import { fireCard } from "../core/events.js";
import { emit } from "../core/eventlog.js";
import { saveAll } from "../core/persistence.js";
import { defaultSpeed } from "../core/clock.js";
import { addMemory } from "../core/memory.js";

export function createApp(w: World) {
  const app = new Hono();
  app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", ADMIN_HEADER], allowMethods: ["GET", "POST", "OPTIONS"] }));

  app.get("/healthz", (c) => c.json({ ok: true, day: w.clock.day, uptimeSec: Math.round((Date.now() - w.startedAt) / 1000), llmOk: w.llm.calls === 0 || w.llm.failures / w.llm.calls < 0.5 }));
  app.get("/api/state", (c) => c.json(snapshot(w)));
  app.get("/api/content", (c) => c.json({ town: w.content.town, cast: publicCast(w.content.cast) }));

  app.get("/api/events", (c) => {
    const since = Number(c.req.query("since") ?? 0);
    const limit = Math.min(1000, Math.max(1, Number(c.req.query("limit") ?? 200)));
    const list = w.events.filter((e) => e.seq > since).slice(0, limit);
    return c.json(list);
  });

  app.get("/api/npcs/:id", (c) => {
    const id = c.req.param("id");
    const state = w.npcs[id];
    if (!state) return c.json({ error: "no such npc" }, 404);
    const { secret: _s, ...content } = w.content.npcs[id];
    return c.json({
      state,
      content,
      memories: recentMemories(w, id, 30),
      relationships: edgesTouching(w, id),
      confessionals: w.confessionals.filter((x) => x.npcId === id).slice(-14),
    });
  });

  app.get("/api/paper/latest", (c) => {
    const p = w.papers[w.papers.length - 1];
    return p ? c.json(p) : c.json({ error: "no paper yet" }, 404);
  });
  app.get("/api/paper/:day", (c) => {
    const p = w.papers.find((x) => x.day === Number(c.req.param("day")));
    return p ? c.json(p) : c.json({ error: "no paper for that day" }, 404);
  });
  app.get("/api/confessionals/:day", (c) => c.json(w.confessionals.filter((x) => x.day === Number(c.req.param("day")))));
  app.get("/api/conversations", (c) => {
    const day = c.req.query("day") ? Number(c.req.query("day")) : w.clock.day;
    return c.json([...w.conversationLog, ...w.conversations].filter((x) => x.day === day));
  });
  app.get("/api/metrics", (c) => c.json(w.metricsHistory.length ? w.metricsHistory : [w.metrics]));
  app.get("/api/election", (c) => c.json(w.election));
  app.get("/api/storylines", (c) => c.json(w.storylines));
  app.get("/api/arcs", (c) => c.json(arcsSummary(w)));
  app.get("/api/llm", (c) => {
    const s = w.brain.stats();
    // Per-kind cost from the runner is a before/after delta of the global counter and over-attributes
    // under concurrency; prefer the brain's own per-call accounting when it exposes it.
    const telemetry = (w.brain as { telemetry?: () => { byKind?: Record<string, { calls: number; costUsd: number; failures: number }> } }).telemetry?.();
    const byKind = telemetry?.byKind ?? w.llm.byKind;
    return c.json({ calls: s.calls, costUsd: s.costUsd, failures: s.failures, bulkModel: s.bulkModel, midModel: s.midModel, callsToday: w.llm.callsToday, costTodayUsd: w.llm.costTodayUsd, degraded: w.degraded, byKind, last50: w.llm.last50 });
  });

  app.get("/api/stream", (c) =>
    streamSSE(c, async (stream) => {
      let alive = true;
      const send = (frame: StreamFrame, json?: string) => {
        if (!alive) return;
        stream.writeSSE({ data: json ?? JSON.stringify(frame), event: frame.kind }).catch(() => {
          alive = false;
        });
      };
      await stream.writeSSE({ data: JSON.stringify({ kind: "snapshot", snapshot: snapshot(w) } satisfies StreamFrame), event: "snapshot" });
      w.listeners.add(send);
      stream.onAbort(() => {
        alive = false;
        w.listeners.delete(send);
      });
      while (alive) await stream.sleep(1000);
      w.listeners.delete(send);
    }),
  );

  /* ---------------- admin ---------------- */
  const admin = new Hono();
  admin.use("*", async (c, next) => {
    const token = process.env.ADMIN_TOKEN;
    if (!token || c.req.header(ADMIN_HEADER) !== token) return c.json({ error: "unauthorized" }, 401);
    await next();
  });
  admin.post("/pause", (c) => {
    w.clock.paused = true;
    return c.json({ ok: true, paused: true });
  });
  admin.post("/resume", (c) => {
    w.clock.paused = false;
    return c.json({ ok: true, paused: false });
  });
  admin.post("/speed", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const v = Number(body.simMinutesPerRealSecond);
    if (!Number.isFinite(v) || v <= 0 || v > 120) return c.json({ error: "simMinutesPerRealSecond must be in (0, 120]" }, 400);
    w.clock.speed = v;
    return c.json({ ok: true, speed: v, default: defaultSpeed(w.content.town.clock.simHourRealMinutes) });
  });
  admin.post("/inject", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.cardId === "string") {
      const card = w.content.events.deck.find((x) => x.id === body.cardId);
      if (!card) return c.json({ error: "unknown cardId" }, 404);
      fireCard(w, card);
      return c.json({ ok: true, fired: card.id });
    }
    if (typeof body.text === "string" && body.text.trim()) {
      const targets: string[] = Array.isArray(body.targets) ? body.targets.filter((t: unknown) => typeof t === "string" && w.npcs[t]) : [];
      const drama = Number.isFinite(Number(body.drama)) ? Number(body.drama) : 6;
      emit(w, "world_event", body.text, { actors: targets, locationId: null, drama, importance: Math.max(3, drama - 1), witnesses: targets.length ? targets : Object.keys(w.npcs) });
      for (const t of targets) {
        addMemory(w, t, "event", body.text, 8, targets);
        w.rt[t].triggers.push(`EVENT: ${body.text}`);
      }
      return c.json({ ok: true });
    }
    return c.json({ error: "pass { cardId } or { text, targets?, drama? }" }, 400);
  });
  admin.post("/save", (c) => c.json({ ok: true, path: saveAll(w) }));
  app.route("/api/admin", admin);

  return app;
}

/**
 * Start the HTTP server. NOTE: the frame broadcaster deliberately does NOT live
 * here on its own timer any more. It used to, and because the simulation ran on
 * a separate 1 Hz interval the two drifted against each other: some seconds the
 * broadcaster sampled positions twice between two sim steps (so NPCs appeared to
 * freeze) and some seconds it missed one (so they appeared to jump a double
 * stride). That beat frequency was the visible "jitter". Now `main.ts` drives one
 * loop and calls `broadcastFrames()` immediately after each tick, so a frame is
 * always sent exactly when the world has just moved.
 */
export function startServer(w: World, port: number) {
  const app = createApp(w);
  const server = serve({ fetch: app.fetch, port });
  return {
    server,
    stop: () => {
      server.close();
    },
  };
}
