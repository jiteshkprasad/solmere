#!/usr/bin/env node
/**
 * Build the NPC portrait sprite atlas.
 *
 *   pnpm --filter @npcworld/web dev            # in one terminal (NEXT_PUBLIC_MOCK_WORLD=1)
 *   node scripts/gen-portraits.mjs --url http://localhost:3000
 *
 * Writes `apps/web/public/portraits/atlas.webp` (a grid of 192² head-and-shoulders
 * renders) and `apps/web/public/portraits/index.json` (the id → slot map).
 * `apps/web/src/lib/portraits.ts` serves every avatar out of that one image, so
 * the app never renders 50 heads into a render target at startup again. Delete
 * the two files and the runtime fallback takes over.
 *
 * How it works: the same renderer the app already ships
 * (`components/scene/characters/portraits.ts`) is driven headlessly on the
 * `/dev-npcs` route — the cheapest page that mounts the character layer — with
 * `?portraits=render` so the atlas loader stands aside. The tiles are composited
 * and encoded in the page (canvas → WebP), so this script needs no image
 * libraries of its own.
 *
 * Flags: --url <origin>  --out <dir>  --size <px>  --timeout <ms>  --headed
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const URL_BASE = (flag("url", "http://localhost:3000") || "").replace(/\/$/, "");
const OUT_DIR = path.resolve(ROOT, flag("out", "apps/web/public/portraits"));
const TILE = Number(flag("size", 192));
const TIMEOUT = Number(flag("timeout", 900000));
const HEADED = argv.includes("--headed");

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const spec of [process.env.PLAYWRIGHT_MODULE, "playwright", "playwright-core"].filter(Boolean)) {
    try { return require(spec); } catch { /* try the next one */ }
  }
  throw new Error("playwright not found — `pnpm add -D playwright` (or set PLAYWRIGHT_MODULE to an install of it)");
}

async function main() {
  const cast = JSON.parse(await readFile(path.join(ROOT, "content/cast.json"), "utf8"));
  const expected = Array.isArray(cast) ? cast.length : (cast.npcs?.length ?? 50);

  const res = await fetch(`${URL_BASE}/dev-npcs`).catch(() => null);
  if (!res || !res.ok) throw new Error(`no dev server at ${URL_BASE} (start it with NEXT_PUBLIC_MOCK_WORLD=1 pnpm --filter @npcworld/web dev)`);

  const { chromium } = loadPlaywright();
  const launch = { headless: !HEADED };
  if (process.env.PLAYWRIGHT_CHROMIUM) launch.executablePath = process.env.PLAYWRIGHT_CHROMIUM;
  if (process.env.PLAYWRIGHT_GL_ARGS) launch.args = process.env.PLAYWRIGHT_GL_ARGS.split(" ");
  const browser = await chromium.launch(launch);
  // a tiny viewport: the town render is throwaway here, only the 192² portrait
  // render target matters, so keep the main pass as cheap as possible
  const page = await browser.newPage({ viewport: { width: 420, height: 300 } });
  page.on("pageerror", (e) => console.warn("  page error:", e.message.split("\n")[0]));

  console.log(`· driving ${URL_BASE}/dev-npcs (expecting ${expected} portraits)`);
  await page.goto(`${URL_BASE}/dev-npcs?portraits=render&hour=12`, { waitUntil: "load", timeout: 120000 });

  const t0 = Date.now();
  let last = -1, stalledSince = Date.now();
  for (;;) {
    const n = await page.evaluate(() => Object.keys(window.__portraitDump?.() ?? {}).length).catch(() => 0);
    if (n !== last) { last = n; stalledSince = Date.now(); process.stdout.write(`\r  ${n}/${expected} portraits rendered (${((Date.now() - t0) / 1000).toFixed(0)} s)   `); }
    if (n >= expected) break;
    // a rig that fails to build never produces a tile — don't wait forever for it
    if (n > 0 && Date.now() - stalledSince > 45000) { console.warn(`\n  stalled at ${n}/${expected} (a rig probably failed) — packing what exists`); break; }
    if (Date.now() - t0 > TIMEOUT) { console.warn(`\n  timed out with ${n}/${expected} — packing what exists`); break; }
    await page.waitForTimeout(1000);
  }
  process.stdout.write("\n");

  console.log("· packing the atlas");
  // Pull the tiles out first and pack them on a *blank* page: the render loop on
  // /dev-npcs competes for the main thread and would make the pack take minutes.
  const map = await page.evaluate(() => window.__portraitDump());
  await page.close();
  const blank = await browser.newPage();
  const packed = await blank.evaluate(async ({ map, tile }) => {
    const ids = Object.keys(map).sort();
    const cols = Math.ceil(Math.sqrt(ids.length));
    const rows = Math.ceil(ids.length / cols);
    const c = document.createElement("canvas");
    c.width = cols * tile; c.height = rows * tile;
    const ctx = c.getContext("2d");
    for (let i = 0; i < ids.length; i++) {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = map[ids[i]]; });
      ctx.drawImage(img, (i % cols) * tile, Math.floor(i / cols) * tile, tile, tile);
    }
    return { ids, cols, rows, dataUrl: c.toDataURL("image/webp", 0.9) };
  }, { map, tile: TILE });
  await browser.close();

  if (!packed.ids.length) throw new Error("no portraits were produced");
  const [, b64] = packed.dataUrl.split(",");
  const bytes = Buffer.from(b64, "base64");
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "atlas.webp"), bytes);
  await writeFile(
    path.join(OUT_DIR, "index.json"),
    `${JSON.stringify({ version: 1, size: TILE, cols: packed.cols, rows: packed.rows, ids: packed.ids }, null, 1)}\n`,
  );
  console.log(`✓ ${packed.ids.length} portraits · ${packed.cols}×${packed.rows} tiles · ${(bytes.length / 1024).toFixed(0)} kB → ${path.relative(ROOT, OUT_DIR)}/atlas.webp`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
