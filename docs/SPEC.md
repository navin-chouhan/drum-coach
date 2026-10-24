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
- Tempo control (practice at 50–100% speed), loop a section (bars A–B), wait mode (song waits for the right hit).
- Metronome with accents and subdivisions.

### 4. Scoring
- Match hits to expected notes per drum with windows: Perfect ±25 ms, Good ±60 ms, else miss.
  Extra hits are counted separately. Hi-hat 42/46 both count as "hi-hat" unless the chart asks for open.
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

## Milestones
- **M0 — Scaffold**: Vite+React+TS app, Node server, Vitest, lint, `npm run dev` starts both.
- **M1 — Input**: MIDI service, keyboard fallback, kit view with animations, calibration and note map.
- **M2 — Play-along**: chart format, 5 built-in grooves, highway, metronome, count-in, tempo/loop.
- **M3 — Scoring**: matcher plus stats (unit-tested), results screen, latency calibration.
- **M4 — AI coach**: `AiProvider` (CLI provider default, API fallback), backend endpoints, post-run feedback, next-exercise, chart generation with validation.
- **M5 — Songs**: MIDI and audio import, sync tool, song library.
- **M6 — Progress**: SQLite persistence, dashboard, weekly plan.

## Non-goals (for now)
- Audio-only transcription of songs (MP3 → drums), mobile apps, multi-user accounts, cloud hosting.
