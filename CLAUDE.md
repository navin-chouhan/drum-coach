# Drum Coach — project guide for Claude Code

Personal AI drum instructor app. The owner plays a **Millenium MPS-150** electronic drum kit
connected over USB to a **Linux laptop** (also has a MacBook and iPad). The app runs locally in
**Google Chrome** and reads the kit via the **Web MIDI API**.

Read `docs/SPEC.md` for the product plan and milestones, `docs/KIT.md` for verified hardware facts, and
`docs/LEARNING.md` for how the app teaches (lessons are authored in `src/content/curriculum.ts` with `pattern()`).
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
- Backend (only for AI calls + persistence): small Node/TypeScript Fastify server bound to `127.0.0.1`,
  with SQLite (`better-sqlite3`). See "AI coach rules" below for how it talks to Claude.
- Must work fully offline except the AI coach features.
- Target browser: Google Chrome on Linux (not snap Chromium — it can be sandboxed from MIDI).
  Serve on `http://localhost` (secure context required for Web MIDI).

## AI coach rules (use the owner's Claude subscription, not an API key)
- The browser never talks to Claude. The backend goes through an `AiProvider` interface:
  - `ClaudeCodeCliProvider` (default): runs the logged-in Claude Code CLI headless, e.g.
    `claude -p --output-format json --tools "" --no-session-persistence` with the prompt + run summary
    on stdin and an **empty temp dir as cwd**, so it can only answer — never edit files or run commands.
    Re-check `claude --help` for flag names when implementing (verified with 2.1.310; `--max-turns`
    isn't listed in `--help` there).
  - `AnthropicApiProvider` (optional fallback): only if `ANTHROPIC_API_KEY` is set in `.env`;
    model from `CLAUDE_MODEL` (default `claude-sonnet-5-5`).
- Calls are slow and count toward usage limits: show a "coach is thinking" state, never block playing,
  send compact JSON summaries (not raw MIDI), cache answers.
- If the CLI is missing or logged out, show a clear message; everything else keeps working.
- Prompts live in `server/prompts/`; JSON outputs the app uses are validated with zod.
- Personal use only; the app is not distributed.

## YouTube rules
- Songs come from YouTube via the official IFrame Player API (playback) and Data API v3 (search, key in `.env`,
  only used server-side). Never download, rip, record or store YouTube audio/video.
- "No drums" = a drumless upload on YouTube, or the experimental live reduction: Chrome tab capture of the
  popup player tab (`getDisplayMedia` + `suppressLocalAudioPlayback`), processed in real time and discarded.
- Song timing runs on the YouTube clock (`src/youtube/yt.ts`) and the per-video beat grid (`src/engine/tempo.ts`).

## Working rules
- Keep the input → scoring path dependency-light and testable: pure functions in `src/engine/`
  with unit tests (Vitest). Timing math must be tested with synthetic hit streams.
- Every feature must have a keyboard fallback so it can be tested without the kit
  (Space kick, S snare, A/Q hi-hat closed/open, Z pedal, E/R/F toms, W crash, T ride).
- After changing UI, run the dev server and check it in the browser; after changing engine code, run tests.
- Small, frequent commits with clear messages.
