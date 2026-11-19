import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { createBrain } from "./brain/index.js";
import { ENGINE_ROOT, loadContent } from "./core/content.js";
import { createWorld } from "./core/world.js";
import { runHeadless, tick, tickFrame, posFrame } from "./core/scheduler.js";
import { currentSpeed } from "./core/clock.js";
import { broadcast, drainPendingEvents } from "./core/eventlog.js";
import { restore, saveAll, snapshotExists } from "./core/persistence.js";
import { attachRecorder } from "./core/recorder.js";
import { startServer } from "./server/index.js";
import { fmtClock } from "./core/clock.js";
import type { World } from "./core/types.js";

loadEnv({ path: resolve(ENGINE_ROOT, ".env") });

interface Args {
  headless: boolean;
  days: number;
  speed: number | null;
  seed: string | null;
  fresh: boolean;
  record: string | null;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { headless: false, days: 1, speed: null, seed: null, fresh: false, quiet: false, record: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--headless") a.headless = true;
    else if (k === "--fresh") a.fresh = true;
    else if (k === "--quiet") a.quiet = true;
    else if (k === "--days") a.days = Math.max(1, Number(v)), i++;
    else if (k === "--speed") a.speed = Number(v), i++;
    else if (k === "--seed") a.seed = String(v), i++;
    else if (k === "--record") a.record = String(v), i++;
  }
  return a;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const content = loadContent();
  const brain = createBrain();
  const log = args.quiet ? () => {} : (line: string) => console.log(line);
  const w = createWorld(content, brain, { seed: args.seed ?? undefined, headless: args.headless, log });
  console.log(`[engine] ${content.town.name}: ${content.cast.npcs.length} NPCs, ${content.town.locations.length} locations, seed ${w.seed}`);

  if (!args.fresh && snapshotExists() && restore(w)) console.log(`[engine] resumed from data/snapshot.json at ${fmtClock(w.clock)}`);
  else console.log(`[engine] fresh world at ${fmtClock(w.clock)}`);

  if (args.headless) return headless(w, args);

  w.nightlyHooks.push((world) => {
    const p = saveAll(world);
    console.log(`[engine] saved ${p}`);
  });
  const port = Number(process.env.ENGINE_PORT ?? 4000);
  const server = startServer(w, port);
  console.log(`[engine] listening on http://localhost:${port}  (SSE at /api/stream)`);
  if (args.speed) w.clock.speed = args.speed;

  /*
   * ONE loop drives everything.
   *
   * This used to be two independent `setInterval(…, 1000)`s — one that stepped the
   * simulation and one, in the server, that sampled positions and broadcast them.
   * Two free-running 1 Hz timers drift against each other, so in some real seconds
   * the broadcaster sampled twice between sim steps (NPCs looked frozen) and in
   * others it missed a step (NPCs jumped a double stride). That beat frequency was
   * the visible jitter, and no amount of client-side smoothing could hide it.
   *
   * Now: a single self-correcting loop at TICK_HZ. Each pass advances the world by
   * the time that *actually* elapsed rather than the time we hoped would elapse, so
   * a late tick produces proportionally more movement instead of a stutter, and
   * then broadcasts immediately — a frame is only ever sent right after the world
   * has moved. Positions go out every pass in a compact `pos` frame; the heavy
   * `tick` frame (thoughts, activities, moods) still goes at ~1 Hz, which is as
   * often as those values actually change.
   */
  const TICK_HZ = 4;
  const TICK_MS = 1000 / TICK_HZ;
  const MAX_CATCHUP_MS = 2000; // after a long stall, skip ahead rather than fast-forwarding the town

  let running = false;
  let stopped = false;
  let last = Date.now();
  let sinceFullFrame = 0;
  let timer: NodeJS.Timeout;

  const loop = async () => {
    if (stopped) return;
    const started = Date.now();
    if (!running) {
      running = true;
      try {
        const elapsed = Math.min(MAX_CATCHUP_MS, started - last);
        last = started;
        // sim-minutes for the real time that actually passed
        await tick(w, currentSpeed(w) * (elapsed / 1000));
        if (w.listeners.size) {
          broadcast(w, posFrame(w));
          sinceFullFrame += elapsed;
          if (sinceFullFrame >= 1000) {
            sinceFullFrame = 0;
            broadcast(w, tickFrame(w));
          }
          const events = drainPendingEvents();
          if (events.length) broadcast(w, { kind: "events", events });
        } else {
          drainPendingEvents();
        }
      } catch (e) {
        console.error("[engine] tick failed", e);
      } finally {
        running = false;
      }
    }
    // self-correcting: subtract the time this pass cost so the cadence doesn't drift
    const drift = Date.now() - started;
    timer = setTimeout(loop, Math.max(0, TICK_MS - drift));
  };
  timer = setTimeout(loop, TICK_MS);

  const shutdown = (sig: string) => {
    console.log(`[engine] ${sig}: saving snapshot…`);
    stopped = true;
    clearTimeout(timer);
    try {
      saveAll(w);
    } catch (e) {
      console.error("[engine] save failed", e);
    }
    server.stop();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

async function headless(w: World, args: Args): Promise<void> {
  const started = Date.now();
  const step = args.speed && args.speed > 0 ? args.speed : 1;
  console.log(`[engine] headless: ${args.days} sim-day(s), ${step} sim-min per tick`);
  const rec = args.record ? attachRecorder(w, resolve(process.cwd(), args.record)) : null;
  if (rec) console.log(`[engine] recording the season to ${args.record}`);
  await runHeadless(w, args.days, step, rec ? () => rec.afterTick() : undefined);
  await rec?.close();
  const s = w.brain.stats();
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n[engine] done: reached ${fmtClock(w.clock)} in ${secs}s · events ${w.eventsTotal} · conversations ${w.conversationLog.length} · papers ${w.papers.length}`);
  console.log(`[engine] llm: ${s.calls} calls, ${s.failures} failures, $${s.costUsd.toFixed(4)} total (${s.bulkModel} / ${s.midModel})`);
  const kinds = Object.entries(w.llm.byKind).map(([k, v]) => `${k} ${v.calls}`).join(", ");
  if (kinds) console.log(`[engine] by kind: ${kinds}`);
  if (process.env.HEADLESS_SAVE === "1") console.log(`[engine] saved ${saveAll(w)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
