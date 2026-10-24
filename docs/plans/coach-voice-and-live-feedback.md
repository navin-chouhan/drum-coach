# Plan: a coach with a voice, and feedback while you play

Status: approved (2026-10-24), not built yet. Decisions are at the bottom.

## Why
Today all feedback arrives *after* a take: a verdict line, the results screen, and (on request) Claude's
written feedback. A real teacher also talks to you *while* you play ("you're rushing", "hi-hat foot down")
and counts you in. Reading the screen mid-groove is hard, so the important bits should be heard.

## Principles
- **Real-time = rules, not the LLM.** Claude takes 10–20 s to answer, so live cues come from a small,
  tested rule engine running on the hits the player already judges. Claude stays for between-take advice.
- **Few words, at the right moment.** At most one cue every 2 bars, never during the count-in or the
  first bar, only when a problem lasts at least a bar, and never the same cue twice in a row unless it
  got worse. Silence means "fine".
- **Works offline.** The default voice must not need the internet (the app is offline except Claude).
- **Everything optional.** Live tips and voice each have an on/off switch and a "chattiness" level.

## 1. Live feedback engine (pure, tested): `src/engine/liveCoach.ts`
Input: the judged hits the player already produces (`player.results`, `player.feedback`, velocities,
pads), the chart notes and the beat position. Output: at most one `Cue { id, text, spoken, lane?, priority }`
per check (once per bar).

Signals over a sliding window (last 2 bars, ≥ 8 scored notes):
| Cue | Trigger | Says |
|---|---|---|
| Missing lane | a lane missed ≥ 3 times in a row | "Kick! Bring the kick back in" |
| Rushing / dragging | mean offset < −20 ms / > +20 ms (overall or one lane) | "Rushing, sit back" / "Dragging, push" |
| Unsteady | spread rising above 35 ms | "Steady, listen to the click" |
| Extra hits | ≥ 3 extra hits on a lane in 2 bars | "Only the notes shown" |
| Hi-hat open | the chart wants closed (42) but the pad sends open (46) | "Hi-hat foot down" (MPS-150 sends 46 unless the pedal is held) |
| Dynamics | accents not louder than normal notes; ghosts too loud; velocity CV > 20 % | "Accents louder" / "Ghost notes softer" / "Even strokes" |
| Drift (jam) | offset trend > 30 ms per minute | "You're speeding up" |
| Praise | 8 clean notes in a row after a correction, or a clean bar at a new tempo | "That's it!" |

Priorities: missing lane > hi-hat open > timing > extras > dynamics > praise. Cool-downs per cue (8 bars)
and a global gap (2 bars). Cues pause in wait mode and demo mode.
Tests: synthetic hit streams (like `scoring.test.ts`), e.g. a stream that drags 30 ms must cue "Dragging"
within 2 bars, exactly once in 8 bars, and never during the count-in.

## 2. Showing cues: highway banner
- A short banner at the top of the highway (big text, 1.5 s, fades), plus the lane flashes amber.
- Works in Free play, lessons, YouTube Play (scored) and Jam (jam uses only timing/drift/dynamics cues).
- Results screen: "Tips you got" list, and the cue history goes into the run summary for the coach.

## 3. The coach's voice
What it says:
1. **Count-in**: "one, two, three, four" in tempo (replaces/joins the click), "and" for 8th count-ins in the
   counting lessons. Must be sample-accurate, so it is played from pre-made audio, not live speech.
2. **Live cues**: the `spoken` text of a cue (≤ 1.5 s), ducking the metronome while speaking.
3. **Between takes**: the verdict line ("Pass. Up to 85 BPM") and lesson intros ("Hi-hat alone first").
4. **Claude's feedback**: read aloud. Add a short `spoken` field (≤ 2 sentences) to the coach's JSON so the
   voice is brief and the full text stays on screen.

Voice engine (recommended: **Piper**, with the browser voice as a fallback):
| | Piper (local neural TTS) | Browser `speechSynthesis` |
|---|---|---|
| Sound | natural | on this Linux laptop: robotic (speech-dispatcher) or Google voices that need internet |
| Offline | yes | only the robotic voices |
| Timing | phrases pre-rendered to WAV, played by Web Audio: exact | 100–300 ms start delay: fine between takes, not for counting |
| Setup | `pipx install piper-tts` + one voice file (~60 MB); light on CPU/RAM | none |

Server: `POST /api/tts { text }` → WAV via the `piper` CLI, cached on disk by hash (`data/tts/`). Fixed phrases
(numbers, "and", all cue texts) are rendered once at start-up so live cues play instantly. If Piper isn't
installed, the app says so in Settings and uses `speechSynthesis`.

## 4. Settings
Live tips: off / on screen / on screen + voice. Voice: on/off, which voice, speed, volume, "count me in".
Chattiness: quiet (only important cues) / normal / talkative (adds praise). Per-lesson: counting lessons
default to the spoken count-in.

## Files (expected)
- New: `src/engine/liveCoach.ts` (+ tests), `src/voice/voice.ts` (Piper/browser engine, phrase cache, ducking),
  `server/tts.ts` (+ test with a fake `piper`), `docs/plans/…` → `docs/LEARNING.md` section.
- Changed: `src/play/player.ts` (call the live coach once per bar, schedule spoken count-in),
  `src/play/Highway.tsx` (banner), `src/play/Results.tsx` (tips list), `src/input/settings.ts`,
  `src/lesson/LessonPlayer.tsx` (speak verdicts/intros), `src/coach/schemas.ts` + `server/prompts/feedback.md` (`spoken`).

## Phases
1. Live-coach engine + tests, highway banner, settings switch. (Most of the value, no new dependencies.)
2. Voice with `speechSynthesis` for verdicts, lesson intros and Claude's feedback.
3. Piper on the server, phrase cache, spoken count-in and spoken live cues with ducking.
4. Tune thresholds on real takes with the kit (keyboard timing is 10–30 ms late, so tune with pads).

## Verification
- Unit tests for every cue rule, cool-downs and priorities with synthetic hit streams.
- Headless e2e with `drumCoach.emitNote`: dragging / missing-kick / open-hi-hat streams show the right banner
  once; voice calls are captured by a fake engine.
- `server/tts` test with a fake `piper` binary (like the fake `claude` in `server/ai/coach.test.ts`).
- Manual with the kit: count-in lands on the beat, cues are understandable over the music and not annoying.

## Decisions (owner, 2026-10-24)
1. **Voice engine: Piper** (offline, natural), browser voice only as the fallback when Piper is missing.
   Install with `uv tool install piper-tts` (uv is already on the laptop) plus one voice file in `data/voices/`.
2. **Chattiness is a setting**: quiet / normal / talkative, default normal; changeable any time, and per lesson.
3. **Count-in: voice + click**: "one, two, three, four" spoken on the count-in clicks; the click continues alone.
