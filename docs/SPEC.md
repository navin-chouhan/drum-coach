# Drum Coach — product spec

## Goal
A personal drum teacher that listens to every hit from the e-kit, shows what to play, scores how well
it was played, and uses Claude to coach: explain mistakes, pick the next exercise, and build a practice
plan that adapts over time.

## Core loop
1. **Pick something to play**: a lesson exercise, a groove, or a song.
2. **Play along**: notes scroll toward a hit line (one lane per drum) with a click and/or backing audio.
3. **Score**: each expected note is matched to a hit (right drum, within a timing window).
4. **Coach**: a results screen plus AI feedback ("your hi-hat drags on the and-of-3; try 70 BPM").
5. **Progress**: results are saved; the plan adapts.

## Features
### 1. Kit & input
- Web MIDI connection with device picker, hot-plug, and status indicator.
- Calibration: "hit each pad" wizard that records the note numbers → editable note map, saved per kit.
- Latency calibration: tap along to clicks → store an offset (ms) applied to all scoring.
- Live kit view with hit animations (port from `prototype/drum-stage.html`).

### 2. Chart format & content
- Internal chart format (JSON): `{ title, bpm, timeSignature, bars, notes: [{ t (beats), drum, accent?, ghost? }] }`.
- Import: Standard MIDI files (channel 10, or the drum track) → chart; optional audio file (MP3/OGG)
  with a manual sync offset.
- Import uses `@tonejs/midi`; AI-generated charts are validated with a zod schema.
- Built-in library: rudiments (single/double strokes, paradiddle, flam), basic rock/pop/funk grooves,
  simple fills; levels 1–10.
- Exercise builder: AI can generate charts in the JSON format (validated with a schema before use).

### 3. Play-along engine
- Note highway (Canvas), lanes in kit order, hit line, beat/bar grid, count-in.
- Tempo control (practice at 50–125% speed), loop a section (bars A–B), wait mode (song waits for the right hit).
- Metronome with accents and subdivisions.

### 4. Scoring
- Match hits to expected notes per drum with windows: Perfect ±40 ms, Good ±100 ms, else miss. For fast notes Good
  shrinks to 40 % of the closest gap between two notes on one drum (Perfect to half of Good), so a 16th can't be
  "good" halfway to the next one. A stroke further off but within 30 % of a beat (at least 250 ms) of its note is that note's miss, not also an
  extra; only strokes that belong to no note are extra hits. A repeat of the same note within 60 ms at under 70 % of
  its velocity (stick bounce, pad retrigger) is ignored at input. Mean offset and spread include off-time strokes. Hi-hat 42/46 both count as "hi-hat" unless the chart
  asks for open.
- Per-run stats: accuracy %, mean offset (rushing/dragging), spread (consistency), per-drum accuracy,
  velocity consistency, accents and ghost notes, a per-beat-position error heat map.
- Results screen with charts and a timeline replay (expected vs played).

### 5. AI coach (Claude via local backend, using the owner's Claude subscription)
- Backend `AiProvider` interface: `ClaudeCodeCliProvider` (default; headless `claude -p`, no tools,
  empty temp cwd) and `AnthropicApiProvider` (optional, only if `ANTHROPIC_API_KEY` is set).
- Slow and rate-limited: "coach is thinking" state, never blocks playing, answers cached; a missing or
  logged-out CLI shows a clear message and nothing else breaks.
- After each run, send a compact JSON summary (not raw MIDI) → short, specific feedback plus one drill.
- "Next exercise" recommendation from history (adaptive difficulty: speed up when accuracy is above 90% at a tempo).
- Weekly plan generator (goals, minutes per day) → checklist.
- Chat with the coach about technique; it can answer with a generated exercise chart.
- Prompts live in `server/prompts/`; outputs that the app uses are JSON validated with zod.

### 6. Progress & data
- SQLite: sessions, runs, per-run stats, charts, settings.
- Dashboard: practice streak, minutes, accuracy trend per exercise, BPM progress.

### 7. Guided learning (see `docs/LEARNING.md`)
- Curriculum of levelled lessons (`src/content/curriculum.ts`): what / why / how text and steps.
  Each step has a chart, the lanes the student plays (`activeLanes`, the app plays the rest),
  a start and target tempo, and pass criteria.
- Milestones are fixed (a "can do" list plus checkpoint lessons). The lessons in between are written
  per student by the AI coach from their run history; built-in lessons are the offline fallback.
- Tempo ladder per step, spaced review of finished lessons, and a daily session planner
  (warm-up, review, skill, groove) on the **Today** tab. Onboarding asks for goals and minutes per day.
- Profile and lesson progress live in the app settings (localStorage, mirrored to SQLite).

## Milestones
Status (2026-10-24): M0–M6 built; see README for how to run. M7 in progress.

- **M0 — Scaffold**: Vite+React+TS app, Node server, Vitest, lint, `npm run dev` starts both.
- **M1 — Input**: MIDI service, keyboard fallback, kit view with animations, calibration and note map.
- **M2 — Play-along**: chart format, 5 built-in grooves, highway, metronome, count-in, tempo/loop.
- **M3 — Scoring**: matcher plus stats (unit-tested), results screen, latency calibration.
- **M4 — AI coach**: `AiProvider` (CLI provider default, API fallback), backend endpoints, post-run feedback, next-exercise, chart generation with validation.
- **M5 — Songs**: MIDI and audio import, sync tool, song library.
- **M6 — Progress**: SQLite persistence, dashboard, weekly plan.
- **M7 — Guided path**: LEARNING.md, milestones + checkpoint lessons, AI-curated lessons, player active lanes/demo/gap click, tempo ladder, spaced review, Today planner, onboarding, path map, resets.

## Non-goals (for now)
- Audio-only transcription of songs (MP3 → drums), mobile apps, multi-user accounts, cloud hosting.

## Future improvements
- **Real drum removal for "no drums"** (2026-10-24). The live reduction (`src/youtube/tabAudio.ts`, `public/drum-reducer.js`)
  only ducks transients and cuts the kick/cymbal bands: about −5 dB on drum hits at 50 % and −13 dB at 100 %, so on a dense
  mix (tested on "We Will Rock You" with the real kit) the drums are quieter, not gone. Drumless YouTube uploads remain the
  reliable path. Real removal needs a source-separation model (Demucs best, Open-Unmix lighter) on the shared tab audio,
  streamed through the local server and discarded. Blocker found: the owner's laptop (i3-1215U, integrated GPU, 6 GB RAM)
  likely runs Demucs slower than real time; separating ahead of playback would mean holding separated audio in memory,
  which bends the YouTube rule above. Next step when picked up: a ~300 MB speed spike (CPU PyTorch + Demucs/Open-Unmix on
  synthetic audio via `uv`) to measure real-time factor and RAM before designing anything.
