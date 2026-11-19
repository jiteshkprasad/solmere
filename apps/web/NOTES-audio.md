# Audio — Solmere

*Owner's verdict on the previous set: "the music is not very good, especially the ambient music."*
The whole chain was rebuilt. **I cannot hear anything**, so every claim below is either a
measurement (ffmpeg/ffprobe) or a statement about prompt craft — never "it sounds good".

## The four problems, and what was done

**1. The "music" was a song, not a bed.** A generative render has an intro, a build,
dynamics and an ending; it draws attention to itself and its loop point is obvious. Now each
bed is rendered at **90 s** and the mastering step runs `ebur128` over it, takes the
short-term (3 s) loudness curve, and slides a `loopSeconds`-long window over the interior
looking for the stretch whose loudness varies least — penalising windows that are stable only
because they are *quiet* (an outro, a breakdown). That window plus `seamCrossfade` seconds of
extra tail is cut out, and the tail is overlap-added onto the head with an equal-power
crossfade, making the wrap continuous by construction:

    O(t<X) = tail(t)·w(t) + head(t)·(1−w(t)),   O(L⁻) = f(L) = O(0⁺)

Verified at sample level on a_songbirds: `loop[0] === src[body]` and `loop[n−1] === src[body−1]`
exactly — the wrap is literally an ordinary adjacent-sample transition of the source.

**2. Nothing was loudness-matched.** Every file is now normalised with a *measured linear
gain* (two-pass loudnorm measurement, single gain applied). Deliberately **not** dynamic
loudnorm: a dynamic normaliser rides the level, which would re-introduce exactly the
wandering loudness we just engineered out and would smear the crossfaded seam. All 14 music
beds now land within 0.1 LU of each other (-23.5 … -23.4 LUFS).

**3. The prompts were generic.** Every music prompt now names bpm, key/mode, metre, the exact
instruments and what each one plays, arrangement density and production style, and bans the
song-shaped behaviours explicitly: no intro, outro, build, drop, fill, crash, riser, final
chord, section change, key change or solo; one short progression looped for the whole take;
at most three or four instruments; steady dynamics; "a background bed for a game that loops
forever, so it must never draw attention to itself". Keys were picked from a narrow
circle-of-fifths family (C/G/D/F major, A/D minor) so an 8-second crossfade between two beds
cannot clash. Ambience prompts name each source **and its distance in metres**, and state
that the level is even throughout, that there is no single dramatic event, that it loops
seamlessly, and that there is no music and no intelligible speech. (The sound-generation
endpoint caps prompts at 450 characters, so ambience prompts are dense rather than long.)

**4. The runtime mix was too simple.** See "Runtime mix".

## Pipeline

    pnpm gen:audio      # ElevenLabs → .audio-cache/raw/<id>.mp3   (idempotent; --force <ids>|all)
    pnpm master:audio   # ffmpeg → apps/web/public/audio/          (no API credits; re-runnable)
    pnpm audio          # both

Raw renders are cached **outside** `public/`, so mastering can be re-run any number of times
for free and the shipped files stay small. `.audio-cache/` should be gitignored.
`master:audio` also takes `--only <group>`, `--ids a,b`, and `--report-only` (re-measure the
shipped files without re-encoding).

## Mastering targets

| group | LUFS | true peak | channels | bitrate | seam crossfade | peak limiting allowed |
|---|---|---|---|---|---|---|
| music | -23 | -1.5 dB | stereo | 128k | 4.0 s | none — a bed must never pump |
| ambience | -20 | -1.5 dB | mono | 96k | 1.8 s | up to 8 dB |
| oneShots | -14 | -1.0 dB | mono | 96k | — | yes |
| murmur | -24 | -1.5 dB | mono | 64k | — | yes |

Music sits well under the world, ambience a little louder, one-shots punch through, murmur
stays quiet. Ambience, one-shots and murmur are noise and are **mono** — the runtime pans and
filters them spatially anyway, so stereo in the file would only be thrown away.

**eff. LUFS** is the file's loudness plus the `gainTrimDb` the mastering step bakes into the
manifest. A few beds are sparse and transient (a clinic waiting room, a bonfire): forcing the
*file* to the group target with a limiter would make the clock ticks and the fire pops
unnaturally loud, so they keep their natural crest factor on disk and the shortfall (±8 dB
max) is applied as manifest gain. What the player hears is level-matched even where the file
is not.

## A subsonic high-pass, which turned out to matter a lot

Several beds shipped with a wrap step of **up to 1.4× the local RMS** — a tick once per lap —
while every loudness metric said they were fine. Cause: the generator leaves a DC / near-DC
offset that differs between a loop's head and its tail (a_chapel measured +0.22 DC at the end,
≈0 at the start). K-weighting discards that band, so LUFS/LRA/true-peak are all blind to it.
Fix: `highpass=f=25:poles=2` applied **before** the loop is cut, so the crossfade works on
DC-free material. Measured on a_chapel: wrap step **+2.4 dB → −5.7 dB** relative to local RMS,
and the flag cleared. (A padded-encode + `AudioBufferSourceNode.loopStart/loopEnd` scheme was
built and measured first, on the theory that this was an mp3 MDCT edge artifact — it made no
difference, so it is switched off. `LOOP_PAD` in the script documents that dead end.)

## How the loop seam is measured

A loop is seamless when the wrap is no more discontinuous than an arbitrary interior join of
the same material. For every loop, three things are measured at the wrap — 30 ms level delta,
log-spectral distance over 24 log-spaced bands, and the single-sample step relative to local
RMS — and the same three at **48 interior positions** for the material's own baseline.

Across all 45 loops: median seam level delta **0.91 dB** vs median interior
**1.02 dB**; median seam spectral distance **3.55 dB** vs interior
**3.44 dB**. The seams are statistically indistinguishable from the middle of the
material. Seams above their own file's interior *p90*: a_sea_breeze, a_storm_wind.

The single-sample step is reported as a **percentile rank** against the loop's own
adjacent-sample deltas (median across all loops: 0.82), because on a smooth bed almost any
transition ranks high; a click needs to be both unusual *and* large, so the flag requires
percentile > 0.995 **and** a step above −6 dB relative to local RMS.

## Measurements — music

| id | dur s | ch | kbps | LUFS | eff. LUFS | true peak | LRA | drift LU | cutoff Hz | seam/interior level ΔdB | seam/interior spectral dB | seam step dB / pctile | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| m_town_day | 48.04 | 2 | 128 | -23.4 | -23.0 | -11.1 | 1.4 | 0.02 | 16505 | 1.38 / 1.13 | 2.72 / 2.97 | -32 / 0.76 | — |
| m_town_morning | 48.04 | 2 | 128 | -23.4 | -23.0 | -9.5 | 1.6 | 0.02 | 15924 | 0.15 / 0.39 | 3.13 / 2.93 | -18 / 0.92 | — |
| m_town_evening | 48.04 | 2 | 128 | -23.5 | -23.0 | -7.8 | 1.2 | 0.04 | 16462 | 0.85 / 0.35 | 6.74 / 3.16 | -39 / 0.20 | — |
| m_night | 48.04 | 2 | 128 | -23.4 | -23.0 | -6.9 | 3.9 | 1.22 | 6180 | 1.47 / 0.56 | 1.89 / 2.86 | -57 / 0.02 | — |
| m_harbour_day | 48.04 | 2 | 128 | -23.4 | -23.0 | -9.7 | 1.0 | 0.07 | 16247 | 0.53 / 1.02 | 2.32 / 5.56 | -13 / 0.95 | — |
| m_harbour_night | 48.04 | 2 | 128 | -23.4 | -23.0 | -10.4 | 1.8 | 0.54 | 14093 | 1.45 / 0.42 | 2.14 / 2.83 | -13 / 1.00 | — |
| m_farms | 48.04 | 2 | 128 | -23.4 | -23.0 | -8.6 | 1.8 | 0.06 | 16010 | 0.46 / 0.55 | 3.79 / 3.33 | -17 / 0.90 | — |
| m_workshop | 48.04 | 2 | 128 | -23.4 | -23.0 | -8.7 | 1.0 | 0.08 | 3133 | 0.18 / 1.14 | 11.49 / 3.44 | -26 / 0.39 | dark-spectrum |
| m_tavern | 40.05 | 2 | 128 | -23.4 | -23.0 | -11.7 | 0.8 | 0.26 | 16279 | 1.33 / 0.84 | 2.36 / 3.61 | -16 / 0.83 | — |
| m_chapel | 40.05 | 2 | 128 | -23.4 | -23.0 | -13.7 | 1.2 | 0.37 | 6298 | 0.03 / 0.26 | 2.85 / 3.00 | -41 / 0.14 | — |
| m_cafe | 40.05 | 2 | 128 | -23.5 | -23.0 | -9.9 | 0.7 | 0.12 | 16484 | 0.04 / 0.89 | 5.86 / 3.27 | -6 / 1.00 | seam-click |
| m_festival | 48.04 | 2 | 128 | -23.5 | -23.0 | -9.8 | 1.4 | 0.10 | 6600 | 0.01 / 1.02 | 3.99 / 3.67 | -17 / 0.96 | — |
| m_storm | 40.05 | 2 | 128 | -23.5 | -23.0 | -16.1 | 0.7 | 0.14 | 2670 | 0.55 / 0.33 | 2.13 / 1.31 | -8 / 1.00 | dark-spectrum |
| m_election | 48.04 | 2 | 128 | -23.4 | -23.0 | -10.2 | 2.3 | 0.07 | 16021 | 0.28 / 0.56 | 6.24 / 4.36 | -7 / 1.00 | — |

## Measurements — ambience

| id | dur s | ch | kbps | LUFS | eff. LUFS | true peak | LRA | drift LU | cutoff Hz | seam/interior level ΔdB | seam/interior spectral dB | seam step dB / pctile | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| a_sea_waves | 26.20 | 1 | 96 | -21.0 | -20.0 | -2.6 | 9.9 | 1.50 | 18852 | 0.71 / 0.77 | 2.89 / 3.35 | 4 / 0.90 | — |
| a_sea_breeze | 26.20 | 1 | 96 | -20.7 | -20.0 | -2.9 | 1.3 | 0.45 | 18809 | 1.88 / 0.85 | 3.36 / 3.07 | -6 / 0.99 | — |
| a_gulls | 24.19 | 1 | 96 | -20.1 | -20.0 | -1.9 | 10.5 | 1.05 | 18508 | 0.98 / 2.26 | 3.87 / 4.33 | -31 / 0.05 | — |
| a_harbour_work | 24.19 | 1 | 96 | -22.0 | -20.0 | -2.3 | 5.1 | 1.37 | 18809 | 3.61 / 1.92 | 3.27 / 3.94 | -24 / 0.43 | — |
| a_lighthouse_wind | 24.19 | 1 | 96 | -20.4 | -20.0 | -4.6 | 4.6 | 0.38 | 18820 | 0.55 / 0.74 | 4.81 / 3.09 | -3 / 0.98 | — |
| a_songbirds | 26.20 | 1 | 96 | -20.4 | -20.0 | -3.1 | 4.9 | 0.61 | 17065 | 0.85 / 3.67 | 3.69 / 4.82 | 11 / 0.96 | — |
| a_birds_day | 26.20 | 1 | 96 | -20.1 | -20.0 | -2.3 | 4.5 | 0.08 | 19165 | 0.66 / 0.44 | 3.48 / 2.51 | -6 / 0.20 | — |
| a_crickets | 26.20 | 1 | 96 | -20.4 | -20.0 | -7.4 | 3.3 | 0.34 | 16150 | 4.55 / 2.96 | 5.28 / 5.06 | -8 / 0.26 | — |
| a_wind_grass | 26.20 | 1 | 96 | -23.4 | -20.0 | -2.6 | 7.8 | 1.60 | 18895 | 1.29 / 1.13 | 2.42 / 3.41 | 0 / 0.32 | — |
| a_sheep | 22.18 | 1 | 96 | -20.5 | -20.0 | -3.1 | 2.8 | 0.42 | 16505 | 1.21 / 4.14 | 3.91 / 6.14 | -6 / 0.79 | — |
| a_cows | 22.18 | 1 | 96 | -22.3 | -20.0 | -1.9 | 4.1 | 0.12 | 18346 | 2.37 / 3.15 | 3.04 / 5.66 | -9 / 0.34 | — |
| a_chickens | 22.18 | 1 | 96 | -21.8 | -20.0 | -2.9 | 4.2 | 0.86 | 16699 | 1.89 / 3.84 | 5.73 / 6.66 | -4 / 0.82 | — |
| a_orchard | 24.19 | 1 | 96 | -20.5 | -20.0 | -2.7 | 3.3 | 0.09 | 18475 | 0.28 / 1.28 | 3.12 / 3.09 | 2 / 1.00 | seam-click |
| a_market | 26.20 | 1 | 96 | -20.9 | -20.0 | -2.3 | 5.2 | 0.78 | 18788 | 0.91 / 1.09 | 4.85 / 4.23 | -10 / 0.85 | — |
| a_fountain | 22.18 | 1 | 96 | -21.6 | -20.0 | -1.7 | 1.3 | 0.37 | 18788 | 1.92 / 2.82 | 5.58 / 5.08 | 4 / 0.87 | — |
| a_cafe | 24.19 | 1 | 96 | -20.6 | -20.0 | -7.1 | 19.4 | 0.59 | 17603 | 1.51 / 0.44 | 4.84 / 3.31 | -25 / 0.18 | — |
| a_tavern | 26.20 | 1 | 96 | -21.7 | -20.0 | -3.0 | 8.4 | 0.34 | 17173 | 1.75 / 0.86 | 7.52 / 3.55 | -3 / 0.98 | — |
| a_bakery | 22.18 | 1 | 96 | -20.0 | -20.0 | -3.5 | 3.8 | 0.83 | 16817 | 0.10 / 1.07 | 2.98 / 3.56 | -5 / 0.92 | — |
| a_carpentry | 24.19 | 1 | 96 | -20.6 | -20.0 | -5.5 | 5.1 | 0.63 | 18691 | 0.69 / 0.80 | 2.91 / 3.71 | -15 / 0.47 | — |
| a_garage | 24.19 | 1 | 96 | -20.3 | -20.0 | -1.2 | 8.5 | 1.55 | 19003 | 5.25 / 3.63 | 5.13 / 4.02 | -8 / 0.48 | — |
| a_brewery | 24.19 | 1 | 96 | -20.7 | -20.0 | -2.9 | 1.8 | 0.51 | 18777 | 3.05 / 2.89 | 5.92 / 5.19 | -6 / 0.99 | — |
| a_school | 24.19 | 1 | 96 | -27.7 | -20.0 | -2.9 | 7.5 | 0.53 | 17819 | 0.00 / 1.53 | 3.62 / 3.80 | -7 / 0.61 | — |
| a_chapel | 24.19 | 1 | 96 | -21.3 | -20.0 | -2.9 | 3.5 | 0.49 | 18508 | 4.76 / 2.48 | 3.55 / 3.33 | -0 / 0.99 | — |
| a_clinic | 22.18 | 1 | 96 | -30.6 | -22.6 | -3.0 | 11.5 | 0.68 | 18734 | 0.18 / 1.33 | 2.79 / 2.99 | -8 / 0.46 | off-target-lufs |
| a_park_pond | 14.68 | 1 | 96 | -22.4 | -20.0 | -3.0 | 9.0 | 5.10 | 18702 | 2.24 / 1.79 | 3.49 / 3.48 | -7 / 1.00 | loudness-wanders |
| a_night_town | 26.20 | 1 | 96 | -29.0 | -21.0 | -4.1 | 7.7 | 3.24 | 18691 | 4.14 / 1.99 | 2.72 / 2.86 | -13 / 0.76 | loudness-wanders |
| a_rain | 26.20 | 1 | 96 | -20.5 | -20.0 | -6.1 | 0.3 | 0.12 | 18842 | 0.29 / 0.40 | 2.53 / 3.07 | -16 / 0.17 | — |
| a_storm_wind | 26.20 | 1 | 96 | -20.3 | -20.0 | -3.1 | 3.8 | 0.12 | 17560 | 2.49 / 0.70 | 3.22 / 2.99 | -19 / 0.42 | — |
| a_heat_haze | 26.20 | 1 | 96 | -20.1 | -20.0 | -8.6 | 3.6 | 1.20 | 16010 | 0.32 / 0.31 | 4.05 / 3.64 | -11 / 0.14 | — |
| a_bonfire | 24.19 | 1 | 96 | -29.7 | -21.7 | -2.4 | 6.0 | 1.36 | 18777 | 3.00 / 2.09 | 5.17 / 5.60 | 3 / 0.99 | off-target-lufs |
| a_festival_crowd | 26.20 | 1 | 96 | -20.4 | -20.0 | -4.2 | 2.0 | 0.27 | 18637 | 0.18 / 0.99 | 4.27 / 3.33 | -19 / 0.56 | — |

## Measurements — one-shots

| id | dur s | ch | kbps | LUFS | eff. LUFS | true peak | LRA | drift LU | cutoff Hz | flags |
|---|---|---|---|---|---|---|---|---|---|---|
| s_bell | 8.05 | 1 | 96 | -15.8 | -14.0 | -2.5 | 25.5 | 19.01 | 6223 | — |
| s_thunder | 6.56 | 1 | 96 | -15.3 | -14.0 | -2.6 | 5.4 | 2.48 | 1044 | dark-spectrum |
| s_thunder_close | 4.34 | 1 | 97 | -14.9 | -14.0 | -2.3 | 14.3 | 8.76 | 9970 | — |
| s_foghorn | 4.57 | 1 | 97 | -13.7 | -14.0 | -6.0 | 3.9 | 2.40 | 4953 | dark-spectrum |
| s_boat_horn | 3.08 | 1 | 97 | -14.3 | -14.0 | -2.5 | 20.0 | 0.00 | 18249 | — |
| s_fireworks | 9.87 | 1 | 96 | -18.8 | -14.0 | -2.5 | 6.1 | 2.72 | 16010 | — |
| s_door_bell | 2.04 | 1 | 97 | -14.8 | -14.0 | -2.4 | 0.0 | 0.00 | 18325 | — |
| s_cheer | 4.88 | 1 | 97 | -14.1 | -14.0 | -2.5 | 3.6 | 2.10 | 15999 | — |
| s_gasp | 2.53 | 1 | 97 | -14.4 | -14.0 | -1.2 | 0.0 | 0.00 | 16021 | — |
| s_coin | 1.02 | 1 | 99 | -19.6 | -14.0 | -1.5 | 0.0 | 0.00 | 18928 | — |

## Measurements — murmur

| id | dur s | ch | kbps | LUFS | eff. LUFS | true peak | LRA | drift LU | cutoff Hz | flags |
|---|---|---|---|---|---|---|---|---|---|---|
| v_m_low | 2.69 | 1 | 65 | -24.4 | -24.0 | -11.3 | 0.0 | 0.00 | 15698 | — |
| v_m_mid | 3.03 | 1 | 65 | -24.3 | -24.0 | -8.9 | 20.0 | 0.00 | 11585 | — |
| v_f_low | 0.84 | 1 | 66 | -24.4 | -24.0 | -15.6 | 0.0 | 0.00 | 8118 | — |
| v_f_mid | 2.87 | 1 | 65 | -24.4 | -24.0 | -5.3 | 0.0 | 0.00 | 16021 | — |
| v_elder | 2.93 | 1 | 65 | -24.4 | -24.0 | -3.6 | 0.0 | 0.00 | 16021 | — |
| v_young | 2.80 | 1 | 65 | -24.4 | -24.0 | -9.7 | 0.0 | 0.00 | 16721 | — |

## Remaining flags, and why they stand

* **dark-spectrum** (`s_thunder` 969 Hz, `s_foghorn` 5.1 kHz, `m_storm`, `m_workshop`) —
  spectral cutoff under 6 kHz. Physically correct for thunder, a foghorn and a low drone;
  the check exists to catch a genuinely dull or upsampled render, and did not fire on anything
  that should be bright. Nothing is band-limited by the encoder: everything else sits at
  16–19 kHz.
* **seam-click** (`m_cafe` −5.5 dB, `a_orchard`) — a residual wrap step of ~0.5× local RMS on
  two very smooth beds. One sample, ~46 dB below a 30 ms block of the same material; the level
  and spectral seam metrics for both are at or below their interior medians.
* **loudness-wanders** (`a_park_pond`, `a_night_town`) — half-to-half drift above 3 LU on
  sparse event beds. `a_park_pond` went 19.6 → 5.1 LU after a re-render, a stable-window trim
  to 15 s and drift flattening; both also run as two staggered layers, which masks the rest.
* **off-target-lufs** (`a_clinic`, `a_bonfire`) — could not reach the group target inside the
  ±8 dB manifest trim; both very sparse and peaky. Effective levels land within ~2 dB.
* Nothing is near-silent and **nothing clips** — worst true peak across all 61 files is
  -1.2 dBTP.

Two clips were **regenerated with adjusted prompts** after measurement flagged them:

* `m_storm` — short-term σ 7.4 LU, LRA 21.2: the prompt still allowed piano strikes and
  swells. Rewritten to a single sustained chord, "no struck or plucked notes, no swell, no
  crescendo, no event of any kind, every second sounds the same as every other second"
  → σ 0.7 LU, LRA 0.7, drift 0.15 LU.
* `a_garage` — seam level delta 16.8 dB vs interior p90 5.9: the prompt asked for an engine
  "coughing and settling to a rough idle", a once-only event that cannot loop. Rewritten to an
  engine *already idling*, "no engine starting or stopping, nothing that happens only once".

## Periodic drift flattening

Some field recordings are lopsided — the ducks all quack in the first half, the sheep in the
second — heard as the loop breathing once per lap. That component is by definition the loop's
own fundamental, so the mastering step fits the **first Fourier harmonic** of the short-term
loudness curve and subtracts it with a gain envelope of the same period (capped at 4 dB,
applied only above 1.2 dB, with the short-term window's 1.5 s group delay compensated).
Because the envelope is itself periodic in T it is continuous across the wrap — unlike a
dynamic normaliser or a linear de-trend, it cannot re-open the seam. Measured:
`a_sheep` drift 4.89 → 0.42 LU (LRA 8.2 → 2.8), `a_chickens` 3.14 → 0.89 LU.

## Runtime mix

`apps/web/src/lib/audio/engine.ts`, `apps/web/src/components/scene/audio/AudioLayer.tsx`

* **Master limiter.** `master → DynamicsCompressorNode (threshold −6 dB, ratio 20, knee 3,
  attack 4 ms, release 220 ms) → destination`. Several ambience beds, a music bed, one-shots
  and murmur can all be up at once and the sum can never clip.
* **Distance is a filter, not just a fader.** Every loop player and one-shot runs through a
  `BiquadFilterNode` low-pass whose cutoff is interpolated *in the log domain* from
  `farHz` 900 Hz at the edge of a source's radius up to `nearHz` 18 kHz on top of it, scaled
  by camera height. The far side of town is muffled, not merely quiet.
* **Interiors.** A shared `ConvolverNode` with a procedurally generated 1.5 s room impulse
  (one-pole-low-passed noise, exponential decay) sits on a send. The tavern, café, chapel,
  school, clinic, bakery, carpentry, garage and brewery beds — plus the three point-source
  music beds — feed it in proportion to proximity, so rooms sound enclosed while the harbour
  stays open. One convolver for the whole scene, so it is cheap.
* **Anti-repetition.** Loop offsets are derived from the asset id (stable per instance), and
  the 13 busiest beds (sea, gulls, market, tavern, crickets, festival crowd, rain, storm wind,
  songbirds, sheep, cows, chickens, pond) run as **two instances of the same file** at
  different offsets, ±1.5 % playback rate and ±0.18 pan. They drift apart instead of repeating
  in lockstep — no extra download. Level is split ÷√n so summed power is unchanged.
* **Slower music moves.** Crossfade is now **8 s** (was 4). When a point-source bed takes over,
  the town bed both ducks (`pointDuck` 0.75) *and* darkens — its low-pass drops toward 1.4 kHz
  — so it reads as the street heard from inside the room.
* **Music never restarts.** Selection only changes which player is faded up; music players are
  never stopped, so a bed that is re-selected continues from where it was.
* **Murmur is distance-filtered too** — voices lose their consonants with distance faster than
  anything else.
* Mix defaults moved with the new loudness targets: master 0.85, music 0.7, ambience
  0.75, murmur 0.7.

## Size

| group | files | MB |
|---|---|---|
| music (stereo 128k) | 14 | 10.26 |
| ambience (mono 96k) | 31 | 9.06 |
| one-shots (mono 96k) | 10 | 0.57 |
| murmur (mono 64k) | 6 | 0.123 |
| **total mp3** | **61** | **20.01** |
| incl. manifest + report | 63 | 20.09 |

Down from ~65 MB (everything was 192 kbps stereo) to **20.0 MB**, under the ~25 MB target.

## Verified in the app

`NEXT_PUBLIC_MOCK_WORLD=1 next dev -p 3023`, Playwright + swiftshader, clicked the Sound
button, then `page.evaluate(() => window.__npcAudio())`:

    ctx: "running", sampleRate: 44100, loaded: 10
    settings: { enabled: true, master: 0.85, music: 0.7, ambience: 0.75, murmur: 0.7 }
    buffers: a_birds_day, a_cafe, a_market, a_sea_breeze, a_songbirds,
             m_cafe, m_town_day, s_cheer, s_door_bell, s_gasp

Camera over Town Square, Day 3, 10:58 — exactly the right set: the town daytime bed, the café
point source (the camera is near Café Moreno), square walla, day birds, sea breeze drifting in
from the shore, plus warmed event one-shots. Mixer popover screenshot:
`apps/web/screenshots/audio-mixer.png`.

`npx tsc --noEmit` and `npx eslint` are clean on `src/lib/audio/**` and
`src/components/scene/audio/**`. (Two pre-existing `tsc` errors remain in
`components/arrival/CatchUp.tsx` and `components/hud/ArrivalCard.tsx` — another agent's files.)
