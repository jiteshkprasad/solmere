/**
 * Cuts the build-time portrait atlas (public/portraits/atlas.webp) into one PNG
 * per NPC under public/og/portraits/<id>.png.
 *
 * Why: the OG image routes render with `next/og` (satori + resvg), which decodes
 * PNG/JPEG but not WebP, and cannot read the sprite sheet by offset. One small
 * PNG per face is the cheapest thing the renderer can embed.
 *
 * Run after scripts/gen-portraits.mjs:  node apps/web/scripts/gen-og-portraits.mjs
 * The OG routes fall back to initials on a hashed colour when these are absent,
 * so this step is optional. OWNED BY THE STORY/SHARE AGENT.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/** sharp is not a declared dependency of the web app — find it wherever it lives. */
function loadSharp() {
  const require = createRequire(import.meta.url);
  for (const spec of ["sharp", path.join(process.env.npm_config_prefix ?? "/usr/local", "lib/node_modules/sharp"), `${process.env.HOME}/.npm-global/lib/node_modules/sharp`]) {
    try { return require(spec); } catch { /* next */ }
  }
  throw new Error("sharp not found — `npm i -g sharp` or add it as a devDependency, then re-run");
}
const sharp = loadSharp();

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(web, "public", "portraits");
const OUT = path.join(web, "public", "og", "portraits");
const TILE = 256;

const idx = JSON.parse(await readFile(path.join(SRC, "index.json"), "utf8"));
if (!idx?.ids?.length) throw new Error("portrait index is empty — run scripts/gen-portraits.mjs first");

await mkdir(OUT, { recursive: true });
const atlas = await readFile(path.join(SRC, "atlas.webp"));

let n = 0;
for (const [slot, id] of idx.ids.entries()) {
  const png = await sharp(atlas)
    .extract({ left: (slot % idx.cols) * idx.size, top: Math.floor(slot / idx.cols) * idx.size, width: idx.size, height: idx.size })
    .resize(TILE, TILE)
    .png({ compressionLevel: 9, palette: true, quality: 88 })
    .toBuffer();
  await writeFile(path.join(OUT, `${id}.png`), png);
  n++;
}
console.log(`[og-portraits] wrote ${n} tiles (${TILE}px) to public/og/portraits`);
