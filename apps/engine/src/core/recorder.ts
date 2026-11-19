/**
 * Season recorder (headless --record <dir>). Writes everything the viewer would receive over SSE into one gzipped
 * JSONL file per sim-day: a snapshot first, then every frame stamped with its absolute sim-minute (`s`). Positions are
 * sampled every sim-minute and the 1 Hz tick frame every 5 sim-minutes, which is enough for the replay to interpolate.
 */
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { resolve } from "node:path";
import { createGzip, type Gzip } from "node:zlib";
import type { StreamFrame } from "@npcworld/schema";
import type { World } from "./types.js";
import { drainPendingEvents } from "./eventlog.js";
import { posFrame, snapshot, tickFrame } from "./scheduler.js";
import { absMinutes } from "./clock.js";

export interface Recorder {
  afterTick(): void;
  close(): Promise<void>;
}

export function attachRecorder(w: World, dir: string): Recorder {
  mkdirSync(dir, { recursive: true });
  let day = -1;
  let gz: Gzip | null = null;
  let file: WriteStream | null = null;
  let lastPos = -1;
  const pending: Promise<void>[] = [];

  const write = (frame: StreamFrame) => gz?.write(`${JSON.stringify({ s: Math.round(absMinutes(w.clock)), f: frame })}\n`);

  const closeFile = () => {
    if (!gz || !file) return;
    const f = file;
    pending.push(new Promise((res) => f.on("finish", () => res())));
    gz.end();
    gz = null;
    file = null;
  };

  const openDay = () => {
    closeFile();
    day = w.clock.day;
    gz = createGzip({ level: 9 });
    file = createWriteStream(resolve(dir, `day-${String(day).padStart(2, "0")}.jsonl.gz`));
    gz.pipe(file);
    write({ kind: "snapshot", snapshot: snapshot(w) });
  };

  const listener = (frame: StreamFrame) => {
    if (frame.kind === "pos" || frame.kind === "tick" || frame.kind === "snapshot") return;
    write(frame);
  };
  w.listeners.add(listener);

  return {
    afterTick() {
      if (w.clock.day !== day) openDay();
      const events = drainPendingEvents();
      if (events.length) write({ kind: "events", events });
      const m = Math.floor(absMinutes(w.clock));
      if (m === lastPos) return;
      lastPos = m;
      const p = posFrame(w);
      if (p.kind === "pos") write({ ...p, t: m });
      if (m % 5 === 0) write(tickFrame(w));
    },
    async close() {
      w.listeners.delete(listener);
      closeFile();
      await Promise.all(pending);
    },
  };
}
