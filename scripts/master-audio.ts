/**
 * Stage 2 of the Solmere audio pipeline: turn raw ElevenLabs renders into
 * shippable, loopable, loudness-matched game audio. Costs no API credits, so it
 * is safe to re-run as often as you like.
 *
 *   pnpm master:audio                  # master everything in .audio-cache/raw
 *   pnpm master:audio -- --only music  # music | ambience | oneShots | murmur
 *   pnpm master:audio -- --ids m_town_day,a_gulls
 *   pnpm master:audio -- --report-only # re-measure the shipped files, no re-encode
 *
 * What it does, per group:
 *
 *   music     A 90 s generative render is a *song*: intro, build, ending. We run
 *             ebur128 over it, take the short-term (3 s) loudness curve, and slide
 *             a `loopSeconds`-long window over the interior to find the stretch
 *             whose loudness varies least (penalising windows that are stable only
 *             because they are quiet). That window plus `seamCrossfade` seconds of
 *             extra tail is cut out, then the tail is overlap-added onto the head
 *             with an equal-power crossfade so the wrap point is mathematically
 *             continuous: O(t<X) = tail(t)·w + head(t)·(1-w), O(L⁻) = f(L) = O(0⁺).
 *   ambience  Already rendered with loop=true; we still crossfade the seam, downmix
 *             to mono (the runtime pans and low-passes them spatially anyway).
 *   oneShots  Silence-trimmed top and tail, 8 ms de-click fades, mono.
 *   murmur    Same, quieter target.
 *
 * Everything is then loudness-normalised with a measured *linear* gain (two-pass
 * loudnorm measurement, single gain applied) rather than dynamic loudnorm: a
 * dynamic normaliser rides the gain and would re-introduce exactly the wandering
 * loudness we just removed, and would break the crossfaded seam.
 *
 * Finally every shipped file is re-measured (duration, channels, bitrate,
 * integrated LUFS, true peak, loudness range, short-term stability, spectral
 * rolloff) and, for loops, the seam is measured against an interior baseline.
 * Results go to apps/web/public/audio/master-report.json and the console table.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, rmSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const RAW = resolve(root, ".audio-cache/raw");
const WORK = resolve(root, ".audio-cache/work");
const OUT = resolve(root, "apps/web/public/audio");
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ONLY = opt("--only");
const IDS = new Set((opt("--ids") ?? "").split(",").filter(Boolean));
const REPORT_ONLY = args.includes("--report-only");

type Target = { lufs: number; truePeak: number; lra: number; channels: number; bitrate: string; seamCrossfade: number };
type Item = { id: string; prompt: string; gain?: number; duration?: number; loopSeconds?: number; [k: string]: unknown };
const spec = JSON.parse(readFileSync(resolve(root, "content/audio.json"), "utf8")) as {
  music: Item[]; ambience: Item[]; oneShots: Item[]; murmur: Item[];
  mastering: { targets: Record<string, Target> }; [k: string]: unknown;
};
const GROUPS = ["music", "ambience", "oneShots", "murmur"] as const;
type Group = (typeof GROUPS)[number];

/* ------------------------------------------------------------------ ffmpeg helpers ------------------------------------------------------------------ */

const run = (bin: string, a: string[]) => execFileSync(bin, a, { encoding: "buffer", maxBuffer: 1 << 28 });
function ff(a: string[]): string {
  // ffmpeg writes its logs to stderr; capture both
  try { return execFileSync("ffmpeg", ["-hide_banner", "-nostdin", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 }); }
  catch (e) { const err = e as { stderr?: string; stdout?: string; message: string }; throw new Error(`ffmpeg failed: ${(err.stderr ?? err.message).slice(-1200)}`); }
}
function ffStderr(a: string[]): string {
  const r = execFileSync("bash", ["-c", `ffmpeg -hide_banner -nostdin ${a.map((x) => `'${x.replace(/'/g, "'\\''")}'`).join(" ")} 2>&1`], { encoding: "utf8", maxBuffer: 1 << 28 });
  return r;
}
function probe(file: string) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,bit_rate,size", "-show_entries", "stream=channels,sample_rate", "-of", "json", file], { encoding: "utf8" });
  const j = JSON.parse(out) as { format: { duration: string; bit_rate: string; size: string }; streams: Array<{ channels: number; sample_rate: string }> };
  return {
    duration: Number(j.format.duration), bitrate: Math.round(Number(j.format.bit_rate) / 1000),
    bytes: Number(j.format.size), channels: j.streams[0]?.channels ?? 0, sampleRate: Number(j.streams[0]?.sample_rate ?? 0),
  };
}

/**
 * Full ebur128 pass: integrated LUFS, LRA and true peak from the summary block,
 * plus the short-term (3 s) loudness curve pulled out of frame metadata — the
 * per-frame `framelog` lines only appear at -loglevel verbose, so we read the
 * values off `ametadata` on stdout instead, which is stable across builds.
 */
function ebur128(file: string) {
  const errf = tmp(`ebur128.${process.pid}.log`);
  const q = (x: string) => `'${x.replace(/'/g, "'\\''")}'`;
  const stdout = execFileSync("bash", ["-c",
    `ffmpeg -hide_banner -nostdin -i ${q(file)} -af ` +
    `'ebur128=peak=true:metadata=1,ametadata=print:key=lavfi.r128.S:file=-' -f null - 2>${q(errf)}`,
  ], { encoding: "utf8", maxBuffer: 1 << 28 });
  const log = readFileSync(errf, "utf8");
  rmSync(errf, { force: true });
  const shortTerm: Array<{ t: number; s: number }> = [];
  let t = 0;
  for (const line of stdout.split("\n")) {
    const pt = line.match(/pts_time:([\d.]+)/); if (pt) { t = Number(pt[1]); continue; }
    const sv = line.match(/lavfi\.r128\.S=(-?[\d.]+|-inf)/);
    if (sv) { const s = Number(sv[1]); if (Number.isFinite(s) && s > -70) shortTerm.push({ t, s }); }
  }
  const tail = log.slice(log.lastIndexOf("Integrated loudness"));
  const pick = (section: string, key: string) => {
    const i = tail.indexOf(section); if (i < 0) return NaN;
    const m = tail.slice(i).match(new RegExp(`${key}:\\s*(-?[\\d.]+|-inf)`));
    return m ? Number(m[1]) : NaN;
  };
  return { integrated: pick("Integrated loudness", "I"), lra: pick("Loudness range", "LRA"), truePeak: pick("True peak", "Peak"), shortTerm };
}

/** loudnorm measurement pass (gives input_i / input_tp / input_lra in JSON). */
function measureLoudnorm(file: string, t: Target) {
  const log = ffStderr(["-i", file, "-af", `loudnorm=I=${t.lufs}:TP=${t.truePeak}:LRA=${t.lra}:print_format=json`, "-f", "null", "-"]);
  const i = log.lastIndexOf("{");
  const j = JSON.parse(log.slice(i, log.indexOf("}", i) + 1)) as Record<string, string>;
  return { i: Number(j.input_i), tp: Number(j.input_tp), lra: Number(j.input_lra), thresh: Number(j.input_thresh) };
}

/* ------------------------------------------------------------------ pcm + dsp ------------------------------------------------------------------ */

function decode(file: string, rate = 44100): Float32Array {
  const buf = run("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-i", file, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"]);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
}
const rms = (x: Float32Array, a: number, b: number) => {
  let s = 0; const n = Math.max(1, b - a);
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / n);
};
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));

/** in-place iterative radix-2 FFT (real input, magnitude out) */
function magSpectrum(x: Float32Array, at: number, n = 2048): Float64Array {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); // hann
    re[i] = (x[at + i] ?? 0) * w;
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  const out = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

/** mean |Δ log-magnitude| over 24 log-spaced bands, in dB */
function spectralDistance(x: Float32Array, aAt: number, bAt: number, rate = 44100, n = 2048): number {
  const A = magSpectrum(x, aAt, n), B = magSpectrum(x, bAt, n);
  const bands = 24, lo = 40, hi = rate / 2.2;
  let sum = 0;
  for (let b = 0; b < bands; b++) {
    const f0 = lo * Math.pow(hi / lo, b / bands), f1 = lo * Math.pow(hi / lo, (b + 1) / bands);
    const i0 = Math.max(1, Math.round((f0 * n) / rate)), i1 = Math.min(n / 2, Math.round((f1 * n) / rate));
    let ea = 0, eb = 0;
    for (let i = i0; i < Math.max(i0 + 1, i1); i++) { ea += A[i] * A[i]; eb += B[i] * B[i]; }
    sum += Math.abs(db(Math.sqrt(ea)) - db(Math.sqrt(eb)));
  }
  return sum / bands;
}

/**
 * Spectral shape, averaged over 8 windows: the energy above 10 kHz relative to the
 * whole (dB) and the 95 % spectral rolloff frequency. Rolloff is the honest
 * band-limit test — every mp3 is "band-limited" above its encoder's cutoff, but a
 * render that is genuinely dull or upsampled from something small rolls off low.
 */
function spectralShape(x: Float32Array, rate = 44100) {
  const n = 4096, bins = n / 2;
  const acc = new Float64Array(bins);
  let windows = 0;
  for (let k = 0; k < 8; k++) {
    const at = Math.floor(((k + 1) * (x.length - n)) / 9);
    if (at < 0) continue;
    const S = magSpectrum(x, at, n);
    for (let i = 1; i < bins; i++) acc[i] += S[i] * S[i];
    windows++;
  }
  let tot = 0, hf = 0;
  for (let i = 1; i < bins; i++) { tot += acc[i]; if ((i * rate) / n > 10000) hf += acc[i]; }
  let run = 0, rolloff = 0;
  for (let i = 1; i < bins; i++) { run += acc[i]; if (run >= 0.95 * tot) { rolloff = (i * rate) / n; break; } }
  // spectral cutoff: highest bin still within 70 dB of the loudest bin. This is the
  // real band-limit test — a 96 kbps mp3 cuts around 15-16 kHz, a dull or upsampled
  // render cuts far lower. (rolloff95 is reported too but never flagged on: natural
  // audio puts 95 % of its *energy* under 5 kHz even when it is perfectly bright.)
  let peak = 0;
  for (let i = 1; i < bins; i++) peak = Math.max(peak, acc[i]);
  let cutoff = 0;
  for (let i = bins - 1; i > 1; i--) { if (acc[i] > peak * 1e-7) { cutoff = (i * rate) / n; break; } }
  return { hf10kDb: windows ? db(Math.sqrt(hf / Math.max(tot, 1e-20))) : NaN, rolloff95Hz: Math.round(rolloff), cutoffHz: Math.round(cutoff) };
}

/**
 * Loop seam quality, measured rather than guessed.
 *
 * A loop is seamless when the wrap (last sample → first sample) is no more
 * discontinuous than an arbitrary interior join of the same material. So we
 * measure three things at the wrap — short-window level delta, log-spectral
 * distance, and the sample-level step relative to local RMS — and measure the
 * same three at 48 interior positions to get the material's own baseline
 * distribution. "seam ≈ interior median" means the loop point is inaudible.
 */
function seamMetrics(file: string, loopStart = 0, loopEnd = 0) {
  const rate = 44100, all = decode(file, rate);
  // only the looped region is ever heard, so only it is measured
  const a = Math.round(loopStart * rate), b = loopEnd > 0 ? Math.round(loopEnd * rate) : all.length;
  const x = all.subarray(a, Math.min(b, all.length));
  const n = x.length;
  const win = Math.round(0.03 * rate); // 30 ms: short enough to track a note envelope
  const fft = 2048;
  const levelDelta = (aEnd: number, bStart: number) => Math.abs(db(rms(x, aEnd - win, aEnd)) - db(rms(x, bStart, bStart + win)));
  const step = (aEnd: number, bStart: number) => db(Math.abs(x[bStart] - x[aEnd - 1]) / Math.max(rms(x, aEnd - win, aEnd), 1e-9));
  // The wrap is sample-exact by construction, so the only honest question about the
  // single-sample step is whether it is unusual *for this material*. Rank it against
  // the loop's own adjacent-sample deltas: 0.5 means the wrap transition is exactly as
  // ordinary as the middle of the recording, near 1.0 would mean a click.
  const wrapDelta = Math.abs(x[0] - x[n - 1]);
  let smaller = 0, sampled = 0;
  for (let i = 1; i < n; i += 7) { sampled++; if (Math.abs(x[i] - x[i - 1]) < wrapDelta) smaller++; }
  const stepPercentile = smaller / Math.max(1, sampled);
  const lv: number[] = [], sp: number[] = [], st: number[] = [];
  for (let k = 1; k <= 48; k++) {
    const at = Math.floor((k * (n - 2 * fft)) / 49) + fft;
    lv.push(levelDelta(at, at)); sp.push(spectralDistance(x, at - fft, at, rate, fft)); st.push(step(at, at));
  }
  const q = (a: number[], p: number) => { const s2 = [...a].sort((u, v) => u - v); return s2[Math.min(s2.length - 1, Math.floor(p * s2.length))]; };
  return {
    seamLevelDeltaDb: +levelDelta(n, 0).toFixed(2),
    seamSpectralDistDb: +spectralDistance(x, n - fft, 0, rate, fft).toFixed(2),
    seamStepDb: +step(n, 0).toFixed(1), seamStepPercentile: +stepPercentile.toFixed(3),
    interiorLevelDeltaDb: +q(lv, 0.5).toFixed(2), interiorLevelP90Db: +q(lv, 0.9).toFixed(2),
    interiorSpectralDistDb: +q(sp, 0.5).toFixed(2), interiorSpectralP90Db: +q(sp, 0.9).toFixed(2),
    interiorStepDb: +q(st, 0.5).toFixed(1),
  };
}

/* ------------------------------------------------------------------ stable-window search ------------------------------------------------------------------ */

/**
 * Pick the start time of the `len`-second window whose short-term loudness varies
 * least. Windows that are stable merely because they are quiet (an outro fade, a
 * breakdown) are penalised by how far their mean sits below the track median.
 */
function stableWindow(curve: Array<{ t: number; s: number }>, duration: number, len: number, guardHead = 6, guardTail = 3) {
  const lo = guardHead, hi = duration - guardTail - len;
  if (hi <= lo || curve.length < 8) return { start: Math.max(0, (duration - len) / 2), std: NaN, mean: NaN };
  const all = curve.map((c) => c.s).sort((a, b) => a - b);
  const median = all[Math.floor(all.length / 2)];
  let best = { start: lo, score: Infinity, std: NaN, mean: NaN };
  for (let t0 = lo; t0 <= hi; t0 += 0.25) {
    // short-term loudness is a trailing 3 s window, so only trust values ≥ t0+3
    const vals = curve.filter((c) => c.t >= t0 + 3 && c.t <= t0 + len).map((c) => c.s);
    if (vals.length < 6) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    const range = Math.max(...vals) - Math.min(...vals);
    const score = std + 0.25 * range + 0.5 * Math.max(0, median - mean);
    if (score < best.score) best = { start: t0, score, std, mean };
  }
  return best;
}

/**
 * Flatten *periodic* drift in a finished loop.
 *
 * Some field recordings are lopsided — the ducks all quack in the first half, the
 * sheep in the second — which a listener hears as the loop breathing once per lap.
 * The offending component is, by definition, the loop's own fundamental, so we fit
 * the first Fourier harmonic of the short-term loudness curve and subtract it with
 * a gain envelope of the same period. Because that envelope is itself periodic in
 * T it is continuous across the wrap, so unlike a dynamic normaliser (or a linear
 * de-trend) it cannot re-open the seam we just closed. Correction is capped, and
 * only applied when the drift is big enough to hear.
 */
function flattenPeriodicDrift(input: string, out: string, channels: number, maxDb = 4): { appliedDb: number } {
  const dur = probe(input).duration;
  const curve = ebur128(input).shortTerm.filter((c) => c.t > 3.2);
  if (curve.length < 12 || dur < 6) return { appliedDb: 0 };
  const mean = curve.reduce((a, c) => a + c.s, 0) / curve.length;
  // short-term loudness is a trailing 3 s window: the value reported at t describes t-1.5
  let a1 = 0, b1 = 0;
  for (const c of curve) {
    const w = (2 * Math.PI * (c.t - 1.5)) / dur;
    a1 += (c.s - mean) * Math.cos(w); b1 += (c.s - mean) * Math.sin(w);
  }
  a1 = (2 * a1) / curve.length; b1 = (2 * b1) / curve.length;
  const amp = Math.hypot(a1, b1);
  if (amp < 1.2) return { appliedDb: 0 };
  const k = Math.min(1, maxDb / amp);
  const A = (-a1 * k).toFixed(3), B = (-b1 * k).toFixed(3);
  ff(["-y", "-i", input, "-af",
    `volume=volume='pow(10\\,((${A})*cos(2*PI*t/${dur.toFixed(3)})+(${B})*sin(2*PI*t/${dur.toFixed(3)}))/20)':eval=frame`,
    "-ar", "44100", "-ac", String(channels), "-c:a", "pcm_s24le", out]);
  return { appliedDb: +(amp * k).toFixed(2) };
}

/* ------------------------------------------------------------------ per-item mastering ------------------------------------------------------------------ */

/**
 * Seconds of the loop's own audio repeated either side of it in the encoded file, so a
 * decoder's edge reconstruction falls outside the played region. Measured to make no
 * difference once the subsonic high-pass below is in place (the "clicks" were DC steps,
 * not codec artifacts), so it is off — but the machinery is here if a future codec needs it.
 */
/**
 * Subsonic high-pass, applied before the loop is cut so the crossfade itself works on
 * DC-free material. Generated beds routinely carry a DC/near-DC offset that differs
 * between a loop's head and its tail; at the wrap that becomes a sample step of up to
 * 1.4x the local RMS — inaudible as bass, audible as a tick once per lap, and invisible
 * to every loudness metric because K-weighting already discards that band. Measured on
 * a_chapel: wrap step +2.4 dB -> -5.7 dB relative to local RMS.
 */
const HPF = "highpass=f=25:poles=2";
const LOOP_PAD = 0;
const rawOf = (id: string) => resolve(RAW, `${id}.mp3`);
const outOf = (id: string) => resolve(OUT, `${id}.mp3`);
const tmp = (name: string) => resolve(WORK, name);

type Row = Record<string, unknown> & { id: string; group: Group };

function loopCrossfade(input: string, body: number, xf: number, out: string, channels: number) {
  // tail = input[body .. body+xf], head = input[0 .. body]; acrossfade(tail, head, xf)
  // yields exactly `body` seconds whose wrap point is continuous:
  //   O(t<xf) = tail(t)·w(t) + head(t)·(1-w(t)),  O(body⁻) = f(body) = O(0⁺).
  // Done via two temp files rather than one graph: acrossfade must buffer all of
  // its first input, and an asplit feeding it from the same source deadlocks.
  const tail = `${out}.tail.wav`, head = `${out}.head.wav`;
  ff(["-y", "-i", input, "-ss", String(body), "-t", String(xf), "-ar", "44100", "-ac", String(channels), "-c:a", "pcm_s24le", tail]);
  ff(["-y", "-i", input, "-t", String(body), "-ar", "44100", "-ac", String(channels), "-c:a", "pcm_s24le", head]);
  ff(["-y", "-i", tail, "-i", head, "-filter_complex", `[0:a][1:a]acrossfade=d=${xf}:c1=qsin:c2=qsin[out]`,
    "-map", "[out]", "-ac", String(channels), "-ar", "44100", "-c:a", "pcm_s24le", out]);
  rmSync(tail, { force: true }); rmSync(head, { force: true });
}

/**
 * Loudness-match with a *measured linear gain*, not dynamic loudnorm: a dynamic
 * normaliser rides the level and would re-introduce exactly the wandering
 * loudness we engineered out, and would smear the crossfaded seam.
 *
 * Peaky material (a cow lowing over a quiet field, a wind gust) can't reach its
 * loudness target on linear gain alone without breaching the true-peak ceiling,
 * so each group declares how much peak limiting it will tolerate:
 *   none   music — a bed must never pump; we take the quieter result instead.
 *   8      ambience — up to 8 dB of extra gain, caught by a soft limiter. Noise
 *          beds hide limiting completely and the level match matters more.
 *   40     one-shots / murmur — these are transients; keep the level, tame the peak.
 */
function normaliseAndEncode(input: string, out: string, t: Target, limitHeadroomDb: number, pad = 0) {
  const m = measureLoudnorm(input, t);
  let gain = t.lufs - m.i;
  let limited = false;
  const headroom = t.truePeak - m.tp;
  if (gain > headroom) {
    gain = Math.min(gain, headroom + limitHeadroomDb);
    limited = gain > headroom;
  }
  // Subsonic high-pass first. Generated beds routinely carry a DC/near-DC offset that
  // differs between the head and the tail of a loop; at the wrap that becomes a step of
  // up to 1.4× the local RMS — inaudible as "bass", audible as a tick once per lap, and
  // invisible to every loudness metric because K-weighting already discards that band.
  const filters = [`highpass=f=25:poles=2`, `volume=${gain.toFixed(2)}dB`];
  // ceiling sits 1.2 dB under the true-peak target: alimiter works on sample peaks
  // and the mp3 encoder overshoots between samples
  if (limited) filters.push(`alimiter=limit=${Math.pow(10, (t.truePeak - 1.2) / 20).toFixed(4)}:level=disabled:attack=2:release=80`);
  if (pad <= 0) {
    ff(["-y", "-i", input, "-af", filters.join(","), "-ar", "44100", "-ac", String(t.channels),
      "-c:a", "libmp3lame", "-b:a", t.bitrate, "-write_xing", "1", out]);
    return { gainDb: +gain.toFixed(2), limited, loopStart: 0, loopEnd: 0 };
  }
  // Gapless looping. The uncompressed loop is sample-exact at the wrap (verified:
  // loop[0] === src[body], loop[n-1] === src[body-1]), but an mp3 decoder reconstructs
  // the first and last samples of a *file* from truncated MDCT frames. On noisy beds
  // that error hides; on a smooth quiet one (chapel room tone, sea breeze) it lands
  // 40 dB above the material's own sample-to-sample deltas — an audible tick once per
  // lap. So the file is encoded with `pad` seconds of the loop's own context either
  // side, and the manifest carries exact loopStart/loopEnd for AudioBufferSourceNode.
  // The codec's edge artifacts then sit outside the region that is ever played.
  const L = probe(input).duration;
  const lvl = tmp(`pad.lvl.${process.pid}.wav`), pre = tmp(`pad.pre.${process.pid}.wav`), post = tmp(`pad.post.${process.pid}.wav`);
  ff(["-y", "-i", input, "-af", filters.join(","), "-ar", "44100", "-ac", String(t.channels), "-c:a", "pcm_s24le", lvl]);
  ff(["-y", "-i", lvl, "-ss", (L - pad).toFixed(4), "-c:a", "pcm_s24le", pre]);
  ff(["-y", "-i", lvl, "-t", pad.toFixed(4), "-c:a", "pcm_s24le", post]);
  ff(["-y", "-i", pre, "-i", lvl, "-i", post, "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[o]",
    "-map", "[o]", "-ar", "44100", "-ac", String(t.channels), "-c:a", "libmp3lame", "-b:a", t.bitrate, "-write_xing", "1", out]);
  const preDur = probe(pre).duration;
  for (const f of [lvl, pre, post]) rmSync(f, { force: true });
  return { gainDb: +gain.toFixed(2), limited, loopStart: +preDur.toFixed(4), loopEnd: +(preDur + L).toFixed(4) };
}

function masterMusic(item: Item, t: Target): Row {
  const raw = rawOf(item.id);
  const len = (item.loopSeconds as number) ?? 48;
  const xf = t.seamCrossfade;
  const an = ebur128(raw);
  const dur = probe(raw).duration;
  const win = stableWindow(an.shortTerm, dur, len + xf);
  const seg = tmp(`${item.id}.seg.wav`), loop = tmp(`${item.id}.loop.wav`);
  ff(["-y", "-i", raw, "-ss", win.start.toFixed(3), "-t", (len + xf).toFixed(3), "-af", HPF, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s24le", seg]);
  loopCrossfade(seg, len, xf, loop, 2);
  const norm = normaliseAndEncode(loop, outOf(item.id), t, 0, LOOP_PAD);
  rmSync(seg, { force: true }); rmSync(loop, { force: true });
  return {
    id: item.id, group: "music",
    sourceDuration: +dur.toFixed(1), window: +win.start.toFixed(2),
    windowStdLu: Number.isFinite(win.std) ? +win.std.toFixed(2) : null,
    rawIntegrated: +an.integrated.toFixed(1), rawLra: +an.lra.toFixed(1),
    gainDb: norm.gainDb, loopStart: norm.loopStart, loopEnd: norm.loopEnd,
  };
}

function masterAmbience(item: Item, t: Target): Row {
  const raw = rawOf(item.id);
  const dur0 = probe(raw).duration;
  const an0 = ebur128(raw);
  // A bed can set `loopSeconds` to ship less than the whole render — used when a
  // recording has one long dead patch that would make the loop breathe. Same
  // stable-window search as the music beds, just over a much shorter span.
  const want = (item.loopSeconds as number) ?? 0;
  const src = tmp(`${item.id}.src.wav`), loop = tmp(`${item.id}.loop.wav`);
  let window = 0;
  if (want > 0 && want + 1.5 < dur0) {
    window = stableWindow(an0.shortTerm, dur0, want + 1.5, 0.2, 0.2).start;
    ff(["-y", "-i", raw, "-ss", window.toFixed(3), "-t", (want + 1.5).toFixed(3), "-af", HPF, "-ar", "44100", "-ac", String(t.channels), "-c:a", "pcm_s24le", src]);
  } else {
    ff(["-y", "-i", raw, "-af", HPF, "-ar", "44100", "-ac", String(t.channels), "-c:a", "pcm_s24le", src]);
  }
  const dur = probe(src).duration;
  const xf = Math.min(t.seamCrossfade, dur * 0.15);
  const body = dur - xf - 0.05;
  loopCrossfade(src, body, xf, loop, t.channels);
  const flat = tmp(`${item.id}.flat.wav`);
  const dedrift = flattenPeriodicDrift(loop, flat, t.channels);
  const final = dedrift.appliedDb > 0 ? flat : loop;
  const an = an0;
  const norm = normaliseAndEncode(final, outOf(item.id), t, 8, LOOP_PAD);
  rmSync(src, { force: true }); rmSync(loop, { force: true }); rmSync(flat, { force: true });
  return { id: item.id, group: "ambience", sourceDuration: +dur0.toFixed(1), window: +window.toFixed(2), driftRemovedDb: dedrift.appliedDb, rawIntegrated: +an.integrated.toFixed(1), rawLra: +an.lra.toFixed(1), gainDb: norm.gainDb, loopStart: norm.loopStart, loopEnd: norm.loopEnd };
}

function masterShot(item: Item, group: Group, t: Target): Row {
  const raw = rawOf(item.id);
  const trimmed = tmp(`${item.id}.trim.wav`);
  // top-and-tail silence (the generator pads), then 8 ms de-click fades
  ff(["-y", "-i", raw, "-af",
    "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02:detection=rms," +
    "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05:detection=rms,areverse",
    "-ar", "44100", "-ac", String(t.channels), "-c:a", "pcm_s24le", trimmed]);
  const d = probe(trimmed).duration;
  const faded = tmp(`${item.id}.fade.wav`);
  ff(["-y", "-i", trimmed, "-af", `afade=t=in:st=0:d=0.008,afade=t=out:st=${Math.max(0, d - 0.02).toFixed(3)}:d=0.02`,
    "-ar", "44100", "-ac", String(t.channels), "-c:a", "pcm_s24le", faded]);
  const an = ebur128(raw);
  const norm = normaliseAndEncode(faded, outOf(item.id), t, 40);
  rmSync(trimmed, { force: true }); rmSync(faded, { force: true });
  return { id: item.id, group, sourceDuration: +probe(raw).duration.toFixed(2), trimmedTo: +d.toFixed(2), rawIntegrated: +an.integrated.toFixed(1), gainDb: norm.gainDb, limited: norm.limited };
}

/* ------------------------------------------------------------------ validation ------------------------------------------------------------------ */

function validate(file: string, group: Group, t: Target, loopStart = 0, loopEnd = 0) {
  const p = probe(file);
  const an = ebur128(file);
  const pcm = decode(file);
  const loopSeconds = loopEnd > loopStart ? loopEnd - loopStart : p.duration;
  const st = an.shortTerm.map((c) => c.s);
  const mean = st.reduce((a, b) => a + b, 0) / Math.max(1, st.length);
  const stdev = Math.sqrt(st.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, st.length));
  // Spread is not the same as wander. A gull bed *should* have a big short-term
  // spread — that is the gulls. What ruins a loop is a slow trend, so the real
  // test is drift: how far the mean of the first half sits from the second half.
  const half = Math.floor(st.length / 2);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const drift = st.length > 8 ? Math.abs(avg(st.slice(0, half)) - avg(st.slice(half))) : 0;
  const shape = spectralShape(pcm);
  const loop = group === "music" || group === "ambience";
  const seam = loop ? seamMetrics(file, loopStart, loopEnd) : null;
  const flags: string[] = [];
  if (an.integrated < -45 || !Number.isFinite(an.integrated)) flags.push("near-silent");
  if (an.truePeak > -0.2) flags.push("clipping");
  if (shape.cutoffHz > 0 && shape.cutoffHz < 6000) flags.push("dark-spectrum");
  if (loop && (drift > (group === "music" ? 1.5 : 3.0) || (group === "music" && stdev > 2.5))) flags.push("loudness-wanders");
  if (group === "music" && Number.isFinite(an.lra) && an.lra > t.lra + 3) flags.push("wide-lra");
    const trimDb = Math.max(-8, Math.min(8, t.lufs - an.integrated));
  if (Math.abs(an.integrated - t.lufs + trimDb) > 1.0 && group !== "oneShots") flags.push("off-target-lufs");
  if (seam && seam.seamSpectralDistDb > Math.max(3, seam.interiorSpectralP90Db * 1.6)) flags.push("seam-spectral-jump");
  if (seam && seam.seamLevelDeltaDb > Math.max(3, seam.interiorLevelP90Db * 1.6)) flags.push("seam-level-jump");
  // A click needs both: unusual for this material *and* large enough to hear. On a very
  // smooth bed almost any transition ranks at the top percentile, so the absolute step
  // (relative to local RMS) is what decides.
  if (seam && seam.seamStepPercentile > 0.995 && seam.seamStepDb > -6) flags.push("seam-click");
  return {
    gainTrimDb: +trimDb.toFixed(2), effectiveLufs: +(an.integrated + trimDb).toFixed(1),
    durationS: +loopSeconds.toFixed(2), fileSeconds: +p.duration.toFixed(2), channels: p.channels, bitrateKbps: p.bitrate, kb: Math.round(p.bytes / 1024),
    lufs: +an.integrated.toFixed(1), truePeakDb: +an.truePeak.toFixed(1), lra: +an.lra.toFixed(1),
    shortTermStdLu: +stdev.toFixed(2), driftLu: +drift.toFixed(2), hf10kDb: +shape.hf10kDb.toFixed(1), rolloff95Hz: shape.rolloff95Hz, cutoffHz: shape.cutoffHz, ...(seam ?? {}), flags,
  };
}

/* ------------------------------------------------------------------ main ------------------------------------------------------------------ */

function main() {
  const rows: Row[] = [];
  for (const group of GROUPS) {
    if (ONLY && ONLY !== group) continue;
    const t = spec.mastering.targets[group];
    const items = spec[group];
    console.log(`\n== ${group} (target ${t.lufs} LUFS, TP ${t.truePeak} dB, ${t.channels === 1 ? "mono" : "stereo"} ${t.bitrate}) ==`);
    for (const item of items) {
      if (IDS.size && !IDS.has(item.id)) continue;
      if (!existsSync(rawOf(item.id))) { console.warn(`  MISSING raw ${item.id} — run pnpm gen:audio`); continue; }
      let row: Row;
      try {
        if (REPORT_ONLY) { if (!existsSync(outOf(item.id))) continue; row = { id: item.id, group }; }
        else if (group === "music") row = masterMusic(item, t);
        else if (group === "ambience") row = masterAmbience(item, t);
        else row = masterShot(item, group, t);
        Object.assign(row, validate(outOf(item.id), group, t, (row.loopStart as number) ?? 0, (row.loopEnd as number) ?? 0));
      } catch (e) { console.error(`  FAILED ${item.id}: ${e instanceof Error ? e.message : e}`); continue; }
      rows.push(row);
      const f = (row.flags as string[]).length ? `  !! ${(row.flags as string[]).join(",")}` : "";
      console.log(`  ${item.id.padEnd(18)} ${String(row.durationS).padStart(6)}s ${row.channels}ch ${String(row.bitrateKbps).padStart(3)}k  ${String(row.lufs).padStart(6)} LUFS  TP ${String(row.truePeakDb).padStart(5)}  seamΔ ${row.seamLevelDeltaDb ?? "-"}/${row.seamSpectralDistDb ?? "-"}dB${f}`);
    }
  }

  /* manifest for the runtime */
  const have = (id: string) => existsSync(outOf(id)) && statSync(outOf(id)).size >= 2000;
  const byId = new Map(rows.map((r) => [r.id, r]));
  // A handful of beds (a clinic waiting room, a bonfire, a sleeping street) are
  // sparse and transient: pushing them to the group LUFS target with a limiter
  // would make the clock ticks and the fire pops unnaturally loud. Instead the
  // mastering step leaves them at their natural level and bakes the shortfall
  // into the manifest gain, so what the *player* hears is loudness-matched even
  // where the file on disk is not.
  const decorate = (items: Item[]) => items.map((s) => {
    const r = byId.get(s.id);
    const trim = (r?.gainTrimDb as number) ?? 0;
    return {
      ...s,
      gain: typeof s.gain === "number" ? +(s.gain * Math.pow(10, trim / 20)).toFixed(3) : s.gain,
      file: have(s.id) ? `/audio/${s.id}.mp3` : null,
      seconds: (r?.durationS as number) ?? null,
      lufs: (r?.lufs as number) ?? null,
      loopStart: (r?.loopStart as number) || undefined,
      loopEnd: (r?.loopEnd as number) || undefined,
      gainTrimDb: trim || undefined,
    };
  });
  const manifestPath = resolve(OUT, "manifest.json");
  const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  const rt = {
    ...spec,
    music: decorate(spec.music), ambience: decorate(spec.ambience),
    oneShots: decorate(spec.oneShots), murmur: decorate(spec.murmur),
    generatedAt: (ONLY || IDS.size ? prev.generatedAt : null) ?? new Date().toISOString(),
    masteredAt: new Date().toISOString(),
  };
  writeFileSync(manifestPath, JSON.stringify(rt, null, 1));

  const bytes = readdirSync(OUT).filter((f) => f.endsWith(".mp3")).reduce((a, f) => a + statSync(resolve(OUT, f)).size, 0);
  const report = { masteredAt: rt.masteredAt, targets: spec.mastering.targets, totalMp3Bytes: bytes, totalMp3MB: +(bytes / 1e6).toFixed(2), files: rows };
  writeFileSync(resolve(OUT, "master-report.json"), JSON.stringify(report, null, 1));

  const flagged = rows.filter((r) => (r.flags as string[]).length);
  console.log(`\n${rows.length} files mastered, ${(bytes / 1e6).toFixed(2)} MB total → apps/web/public/audio/`);
  if (flagged.length) console.log(`flagged: ${flagged.map((r) => `${r.id}(${(r.flags as string[]).join("/")})`).join(" ")}`);
  console.log(`report → apps/web/public/audio/master-report.json`);
}
main();
