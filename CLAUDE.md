# Drum Coach — project guide for Claude Code

Personal AI drum instructor app. The owner plays a **Millenium MPS-150** electronic drum kit
connected over USB to a **Linux laptop** (also has a MacBook and iPad). The app runs locally in
**Google Chrome** and reads the kit via the **Web MIDI API**.

Read `docs/SPEC.md` for the product plan and milestones, and `docs/KIT.md` for verified hardware facts.
`prototype/drum-stage.html` is a working single-file prototype (animated kit, hit timeline,
metronome with timing scoring). Reuse its ideas and code; don't throw away what works.

## Hard facts (verified on the real kit — do not "correct" these)
- Device name on Linux: `e-Drum MIDI 1` (ALSA `hw:1,0,0`). On macOS/iOS it shows as `e-Drum`.
- All drum notes arrive on **MIDI channel 10** as Note On; Note Off arrives as Note On velocity 0
  (and sometimes real Note Off). Treat velocity 0 as off.
- Note map (General MIDI, MPS-150 defaults):
  kick 36 · snare 38 · tom1 48 · tom2 45 · floor tom 43 · crash 49 · ride 51 ·
  hi-hat closed 42 · hi-hat open 46 · hi-hat pedal 44.
- The hi-hat pad sends **46 (open) unless the pedal is held down** → 42. Polyphonic aftertouch
  (0xA0) on 42/44/46 with value 127 is the pedal "choke" — not a hit.
- The module constantly sends **MIDI Clock (0xF8)** and **Active Sensing (0xFE)** — filter them.
- Each pad's MIDI note is user-editable on the module (VOICE mode → PAGE to `Nxx`). The low tom was
  once mis-set to 49 (same as crash); it was fixed to 48. So: **always let the user remap notes in-app**
  and include a "hit each pad" calibration screen.
- Velocity range seen in practice: ~15 (light tap) to 127.

## Tech defaults
- Frontend: Vite + React + TypeScript. Rendering of the note highway: Canvas 2D (or PixiJS if needed).
- Audio: Web Audio API (metronome, backing track playback, optional drum synth). Schedule with
  lookahead against `AudioContext.currentTime`; convert to `performance.now()` time with
  `getOutputTimestamp()` when comparing with MIDI event timestamps (`MIDIMessageEvent.timeStamp`).
- MIDI files: `@tonejs/midi` for parsing.
- Backend (only for AI calls + persistence): small Node/TypeScript server (Fastify or Express) with the
  Anthropic SDK and SQLite (`better-sqlite3`). The API key lives in `.env` as `ANTHROPIC_API_KEY`,
  never in the browser. Model id configurable via `.env` (`CLAUDE_MODEL`, default `claude-sonnet-5-5`).
- Must work fully offline except the AI coach features.
- Target browser: Google Chrome on Linux (not snap Chromium — it can be sandboxed from MIDI).
  Serve on `http://localhost` (secure context required for Web MIDI).

## Working rules
- Keep the input → scoring path dependency-light and testable: pure functions in `src/engine/`
  with unit tests (Vitest). Timing math must be tested with synthetic hit streams.
- Every feature must have a keyboard fallback so it can be tested without the kit
  (Space kick, S snare, A/Q hi-hat closed/open, Z pedal, E/R/F toms, W crash, T ride).
- After changing UI, run the dev server and check it in the browser; after changing engine code, run tests.
- Small, frequent commits with clear messages.
