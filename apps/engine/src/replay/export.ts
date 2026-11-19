/**
 * Season exporter: turns a recorded season (headless --record <dir>, plus the engine's data/ files for the same run)
 * into static files the viewer plays back with no engine at all (NEXT_PUBLIC_REPLAY=<season>).
 *
 *   tsx src/replay/export.ts --season s1 --recording ../../season/s1 --data ../../season/s1-data --out ../web/public/season/s1
 *
 * Output (all JSON):
 *   manifest.json        days, the sim-minute each day starts, chapters (story arcs), best moments, the election result
 *   content.json         town map and public cast (the same as GET /api/content)
 *   days/NN.json         { day, start, end, snapshot, frames: [[s, frame], ...] } — ticks carry only changed fields,
 *                        pos frames drop `ids` when unchanged (the player restores both)
 *   papers.json          every Herald, oldest first
 *   npcs/<id>.json       memories (the player filters by the day being watched) and the cast entry
 */
import { createReadStream, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import type { StreamFrame, WorldEvent, Newspaper } from "@npcworld/schema";
import { loadContent, publicCast } from "../core/content.js";

type Rec = { s: number; f: StreamFrame };

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  if (i > 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (d !== undefined) return d;
  throw new Error(`missing --${k}`);
};

const season = arg("season", "s1");
const recDir = resolve(arg("recording"));
const dataDir = resolve(arg("data"));
const outDir = resolve(arg("out"));

async function readDay(file: string): Promise<Rec[]> {
  const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  const out: Rec[] = [];
  for await (const line of rl) if (line.trim()) out.push(JSON.parse(line));
  return out;
}

const TICK_FIELDS = ["pos", "locationId", "targetLocationId", "action", "activity", "mood", "thought", "conversationId"] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface Moment { s: number; day: number; hour: number; minute: number; kind: string; title: string; text: string; actors: string[]; locationId: string | null; score: number; }
interface ChapterStage { stage: string; s: number; day: number; text: string; choice?: string }
interface Chapter { id: string; title: string; actors: string[]; stages: ChapterStage[] }

async function main() {
  mkdirSync(join(outDir, "days"), { recursive: true });
  mkdirSync(join(outDir, "npcs"), { recursive: true });

  const files = readdirSync(recDir).filter((f) => /^day-\d+\.jsonl\.gz$/.test(f)).sort();
  const dayStarts: Record<number, number> = {};
  const moments: Moment[] = [];
  const chapters = new Map<string, Chapter>();
  const papers: Newspaper[] = [];
  let election: unknown = null;
  let totalBytes = 0;

  for (const f of files) {
    const recs = await readDay(join(recDir, f));
    const snap = recs[0];
    if (snap?.f.kind !== "snapshot") throw new Error(`${f}: first frame is not a snapshot`);
    const day = snap.f.snapshot.time.day;
    dayStarts[day] = snap.s;

    // slim the snapshot: the history is rebuilt from metrics frames as the player goes
    const snapshot = { ...snap.f.snapshot, metricsHistory: snap.f.snapshot.metricsHistory.slice(-30) };

    const last: Record<string, Record<string, unknown>> = {};
    for (const [id, n] of Object.entries(snapshot.npcs)) last[id] = Object.fromEntries(TICK_FIELDS.map((k) => [k, (n as Record<string, unknown>)[k]]));
    let lastIds = "";
    const frames: Array<[number, unknown]> = [];

    for (const r of recs.slice(1)) {
      const fr = r.f;
      if (fr.kind === "tick") {
        const npcs = fr.npcs.map((n) => {
          const prev = last[n.id] ?? {};
          const d: Record<string, unknown> = { id: n.id };
          for (const k of TICK_FIELDS) {
            const v = (n as Record<string, unknown>)[k];
            if (k === "pos") continue; // positions come from pos frames
            if (!same(prev[k], v)) d[k] = v;
          }
          last[n.id] = { ...prev, ...n };
          return d;
        }).filter((d) => Object.keys(d).length > 1);
        frames.push([r.s, { kind: "tick", time: fr.time, npcs }]);
        continue;
      }
      if (fr.kind === "pos") {
        const ids = fr.ids.join(",");
        frames.push([r.s, ids === lastIds ? { kind: "pos", p: fr.p } : { kind: "pos", ids: fr.ids, p: fr.p }]);
        lastIds = ids;
        continue;
      }
      if (fr.kind === "npc") {
        // Full NPC states repeat the plan and needs; keep them (the NPC card reads them) but drop nothing else.
        frames.push([r.s, fr]);
        continue;
      }
      if (fr.kind === "paper") papers.push(fr.paper);
      if (fr.kind === "election") election = fr.election;
      if (fr.kind === "events") for (const e of fr.events) collect(e, r.s);
      frames.push([r.s, fr]);
    }

    const body = JSON.stringify({ day, start: snap.s, end: recs[recs.length - 1].s, snapshot, frames });
    totalBytes += body.length;
    writeFileSync(join(outDir, "days", `${String(day).padStart(2, "0")}.json`), body);
    console.log(`day ${day}: ${frames.length} frames, ${(body.length / 1e6).toFixed(2)} MB`);
  }

  function collect(e: WorldEvent, s: number) {
    const data = (e.data ?? {}) as Record<string, unknown>;
    const base = { s, day: e.day, hour: e.hour, minute: e.minute, actors: e.actors, locationId: e.locationId };
    if (typeof data.arcId === "string") {
      const id = data.arcId;
      const ch = chapters.get(id) ?? { id, title: String(data.title ?? id), actors: [], stages: [] };
      for (const a of e.actors) if (!ch.actors.includes(a)) ch.actors.push(a);
      ch.stages.push({ stage: String(data.stage ?? "incident"), s, day: e.day, text: e.text, choice: typeof data.choice === "string" ? data.choice : undefined });
      chapters.set(id, ch);
      if (data.stage === "decision") moments.push({ ...base, kind: "decision", title: String(data.title ?? id), text: e.text, score: 10 });
      else if (e.drama >= 6) moments.push({ ...base, kind: "incident", title: String(data.title ?? id), text: e.text, score: 7 });
      return;
    }
    if (e.type === "election_result") moments.push({ ...base, kind: "election", title: "Election day", text: e.text, score: 10 });
    else if ((e.type === "romance" || e.type === "feud") && e.drama >= 6) moments.push({ ...base, kind: e.type, title: e.type === "romance" ? "Romance" : "Feud", text: e.text, score: e.drama });
    else if (e.type === "world_event" && e.drama >= 7) moments.push({ ...base, kind: "town", title: "In town", text: e.text, score: e.drama - 1 });
  }

  // content and cast
  const content = loadContent();
  const cast = publicCast(content.cast);
  writeFileSync(join(outDir, "content.json"), JSON.stringify({ town: content.town, cast }));

  // memories per NPC (the player shows only those up to the day being watched)
  const memPath = join(dataDir, "memories.jsonl");
  const mems: Record<string, unknown[]> = {};
  if (existsSync(memPath)) {
    for (const line of readFileSync(memPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const m = JSON.parse(line) as { npcId: string; embedding?: unknown };
      delete m.embedding;
      (mems[m.npcId] ??= []).push(m);
    }
  }
  for (const c of cast.npcs as Array<{ id: string }>) {
    writeFileSync(join(outDir, "npcs", `${c.id}.json`), JSON.stringify({ content: c, memories: mems[c.id] ?? [] }));
  }

  writeFileSync(join(outDir, "papers.json"), JSON.stringify(papers.sort((a, b) => a.day - b.day)));

  const days = Object.keys(dayStarts).map(Number).sort((a, b) => a - b);
  const manifest = {
    season,
    title: "Solmere, season 1",
    days,
    dayStarts,
    end: Math.max(...days.map((d) => dayStarts[d])) + 24 * 60,
    chapters: [...chapters.values()].sort((a, b) => a.stages[0].s - b.stages[0].s),
    moments: moments.sort((a, b) => a.s - b.s),
    election,
    papers: papers.map((p) => ({ day: p.day, headline: p.headline })),
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest));
  console.log(`exported ${days.length} days (${(totalBytes / 1e6).toFixed(1)} MB raw), ${manifest.chapters.length} chapters, ${moments.length} moments, ${papers.length} papers → ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
