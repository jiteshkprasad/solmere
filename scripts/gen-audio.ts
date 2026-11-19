/**
 * Stage 1 of the Solmere audio pipeline: render raw audio from ElevenLabs.
 *
 *   pnpm gen:audio                 # generate everything missing
 *   pnpm gen:audio -- --only music # music | ambience | oneShots | murmur
 *   pnpm gen:audio -- --dry-run    # list what would be generated
 *   pnpm gen:audio -- --force m_town_day,a_gulls   # regenerate specific ids
 *   pnpm gen:audio -- --force all  # regenerate everything (spends credits)
 *
 * Writes RAW renders to .audio-cache/raw/<id>.mp3 and never touches
 * apps/web/public/audio/ — that is stage 2 (`pnpm master:audio`), which trims,
 * loop-crossfades, loudness-normalises and encodes. Keeping the raw renders out
 * of the public dir means mastering can be re-run any number of times without
 * spending a single API credit, and the shipped files stay small.
 *
 * Music is deliberately rendered LONGER than the loop we ship (rawMs, ~90 s):
 * generative music always has an intro, a build and an ending, so the mastering
 * step picks the most dynamically stable interior window instead.
 *
 * Idempotent: existing raw files are skipped unless --force. music_v2_5 (falls
 * back to music_v2 / music_v1), eleven_text_to_sound_v2 with loop=true for the
 * ambience beds, 44.1 kHz 192 kbps source material.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
export const RAW_DIR = resolve(root, ".audio-cache/raw");
mkdirSync(RAW_DIR, { recursive: true });

// .env at repo root (never printed)
for (const p of [resolve(root, ".env"), resolve(root, "apps/engine/.env")]) {
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("ELEVENLABS_API_KEY missing (put it in .env)"); process.exit(1); }

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const DRY = flag("--dry-run");
const ONLY = opt("--only");
const forceArg = opt("--force") ?? "";
const FORCE_ALL = forceArg === "all";
const FORCE = new Set(forceArg.split(",").filter((s) => s && s !== "all"));
const MUSIC_MODELS = (opt("--music-model") ?? "music_v2_5,music_v2,music_v1").split(",");
const SFX_MODEL = opt("--sfx-model") ?? "eleven_text_to_sound_v2";
const FORMAT = "mp3_44100_192";
const CONCURRENCY = Number(opt("--jobs") ?? 3);

type Music = { id: string; prompt: string; rawMs: number };
type Sfx = { id: string; prompt: string; duration: number };
const spec = JSON.parse(readFileSync(resolve(root, "content/audio.json"), "utf8")) as {
  music: Music[]; ambience: Sfx[]; oneShots: Sfx[]; murmur: Sfx[]; [k: string]: unknown;
};

const API = "https://api.elevenlabs.io/v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(path: string, body: unknown, label: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${API}${path}?output_format=${FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": KEY!, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      console.log(`  ok ${label} ${(buf.length / 1024).toFixed(0)} KB`);
      return buf;
    }
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) { console.warn(`  retry ${label}: ${res.status}`); await sleep(3000 * attempt); continue; }
    throw new Error(`${label}: ${res.status} ${text.slice(0, 300)}`);
  }
  throw new Error(`${label}: gave up`);
}

const rawPath = (id: string) => resolve(RAW_DIR, `${id}.mp3`);
const needs = (id: string) => FORCE_ALL || FORCE.has(id) || !existsSync(rawPath(id)) || statSync(rawPath(id)).size < 2000;

async function genMusic(m: Music) {
  if (!needs(m.id)) return console.log(`  skip ${m.id} (cached)`);
  if (DRY) return console.log(`  would render music ${m.id} (${(m.rawMs ?? 90000) / 1000}s raw)`);
  let lastErr: unknown;
  for (const model of MUSIC_MODELS) {
    try {
      const buf = await call("/music", { prompt: m.prompt, music_length_ms: m.rawMs ?? 90000, force_instrumental: true, model_id: model }, `${m.id} [${model}]`);
      writeFileSync(rawPath(m.id), buf);
      return;
    } catch (e) {
      lastErr = e;
      if (/model|422|not (found|available)|invalid/i.test(String(e))) { console.warn(`  ${model} unavailable, trying next`); continue; }
      throw e;
    }
  }
  throw lastErr;
}

async function genSfx(s: Sfx, loop: boolean) {
  if (!needs(s.id)) return console.log(`  skip ${s.id} (cached)`);
  if (DRY) return console.log(`  would render sfx ${s.id} (${s.duration}s${loop ? ", loop" : ""})`);
  const buf = await call("/sound-generation", {
    text: s.prompt, duration_seconds: Math.min(30, Math.max(0.5, s.duration)), loop, prompt_influence: 0.4, model_id: SFX_MODEL,
  }, s.id);
  writeFileSync(rawPath(s.id), buf);
}

/** Run `jobs` at a time so a 45-item set doesn't take twenty minutes. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>, failures: string[]) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try { await fn(item); } catch (e) { const id = (item as { id?: string }).id ?? "?"; console.error(`  FAILED ${id}: ${e instanceof Error ? e.message : e}`); failures.push(id); }
    }
  }));
}

async function main() {
  const failures: string[] = [];
  const groups: Array<[string, () => Promise<void>]> = [
    ["music", () => pool(spec.music, CONCURRENCY, genMusic, failures)],
    ["ambience", () => pool(spec.ambience, CONCURRENCY, (s) => genSfx(s, true), failures)],
    ["oneShots", () => pool(spec.oneShots, CONCURRENCY, (s) => genSfx(s, false), failures)],
    ["murmur", () => pool(spec.murmur, CONCURRENCY, (s) => genSfx(s, false), failures)],
  ];
  for (const [name, run] of groups) {
    if (ONLY && ONLY !== name) continue;
    console.log(`\n== ${name} ==`);
    await run();
  }
  const all = [...spec.music, ...spec.ambience, ...spec.oneShots, ...spec.murmur];
  const have = all.filter((a) => existsSync(rawPath(a.id)) && statSync(rawPath(a.id)).size >= 2000);
  console.log(`\nraw cache: ${have.length}/${all.length} in .audio-cache/raw — now run \`pnpm master:audio\``);
  if (failures.length) { console.error(`failed: ${failures.join(", ")}`); process.exit(2); }
}
main().catch((e) => { console.error(e); process.exit(1); });
