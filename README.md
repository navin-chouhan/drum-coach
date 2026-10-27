# Drum Coach

A personal drum teacher for an adult learning drums as a first instrument. It runs locally in
Google Chrome, listens to a **Millenium MPS-150** e-kit over USB MIDI, shows what to play on a note
highway, scores every hit, and plans each day's practice. An AI coach uses your own Claude
subscription to write lessons for you and to give feedback.

- **Guided path.** Seven fixed milestones, each with a "you can…" list and checkpoint lessons.
- **Lessons curated for you.** The AI coach reads your recent takes and writes the next lesson for
  your weakest skill. Forty built-in lessons are the offline fallback.
- **A journey with rewards.** Every finished lesson earns 1–3 stars and a celebration; every stage passed
  gives you a drummer rank (Stick Rookie → Swing Cat) and unlocks a **show-off song**: a real song the coach
  picks for what you can now play, to learn and play for your friends in Stage mode.
- **Daily session.** The Journey tab gives you a 15–45 minute plan: warm-up, review, one skill and one
  groove. You press Start and it walks you through.
- **Hand-holding practice.** Build grooves one limb at a time while the app plays the other drums.
  Hear a demo first, count in, and get a one-line verdict after every take. The tempo goes up or
  down for you.
- **Real songs.** Search YouTube, find drumless versions and covers, set the tempo, learn by ear, jam
  along and play scored.
- **Progress.** Streaks, minutes, accuracy and BPM trends, and spaced review of finished lessons.

Everything except the AI coach and YouTube search works offline. A computer keyboard can stand in
for the kit.

## Quick start

You need Linux with Google Chrome and Node.js 24. Older Node works from 22.18, which can run
TypeScript files directly. You also need the drum kit on USB, or just the keyboard. For the coach,
install Claude Code and log in once with `claude`.

```bash
npm install
```
```bash
npm run dev
```

This starts the web app on http://localhost:5173 and the API on 127.0.0.1:8787. Open
**http://localhost:5173** in Google Chrome and allow MIDI access when asked. Use real Chrome; snap
Chromium can be sandboxed away from MIDI. Close `amidi -d` or any other app holding the kit's MIDI
port first.

### First time
1. **Answer the setup questions.** Pick the styles you want (rock/pop, funk/R&B, jazz, or none if
   you're not sure) and your minutes per day. 25 is recommended.
2. **Calibrate.** Open **Setup** (the ⚙ gear, top right) → **Pads**, hit each pad when asked, so the app knows your note map.
   Then do **latency calibration** on the real kit: tap along with the clicks.
3. **Go back to Journey** and press the **Next up** button.

No kit? Use these keys, and hold Shift for an accent. You can also click a pad under Setup → Kit test.

| Key | Drum | Key | Drum |
|---|---|---|---|
| Space | kick | E / R / F | tom 1 / tom 2 / floor tom |
| S | snare | W | crash |
| A / Q | hi-hat closed / open | T | ride |
| Z | hi-hat pedal | | |

## Using the app

The tabs are **Journey** (home), **Songs**, **Practice** and **Progress**. Your kit, the kit test and the coach's
settings are under **Setup** (the ⚙ gear). One **kit chip** in the header is green when the kit and the sound work,
or says how many things need fixing; click it for the details. While a take runs, the app goes into focus mode: only
the music and **Stop** stay on screen. **Esc** stops a take anywhere. The mic button (or hold **V**) talks to the coach
from any screen. Every screen you play from shows each move's **kit gesture** (hi-hat pedal × 3 = yes / the big move,
ride × 2 = next or something else, tom 2 × 2 = listen, floor × 2 slower, tom 1 × 2 faster, crash × 4 stops a take).

### Journey (home)
- **One next move.** A short line from the coach, then the next lesson as a big card (what you'll do, the coach's
  reason, minutes, steps, tempo) and the moves under it: **Start** (hi-hat pedal × 3), **Something else** (ride × 2),
  **Hear it** (tom 2 × 2), **Just jam**. Once today's set is done, the next lesson on your trail leads and the
  2-minute challenge and Beat your best join the moves.
- **You.** Rank, the stage ring, and three big numbers: day streak, notes landed this week, minutes today against
  your daily goal. The week's focus is one line (its reason folds away); the skill map is a link away.
- **Today's set.** A slim strip with a minute bar; tap any item.
- **The stage and its song.** The trail reads from what's done to the lesson you're on to what's left (lessons you
  started come first, coach lessons have a ✍, the ★ challenges and the song at the end). Beside it, the stage song
  with a ring of bars ready, **Hear it** / **Play it**, and your own song (or "Pick a real song").
- **More ways to play:** Flow, Stick technique, Learn a new song, Ask the coach for a different lesson.
- **Full path, coach lessons, weekly plan, settings** (folded): every stage and lesson, the weekly plan, resets.

### Finishing a lesson
The last clean take of a lesson brings up **LESSON COMPLETE!** with your stars (★ passed, ★★ 95%+ on time and few
extra hits, ★★★ 98%+ with mostly perfect hits), a drum fill, and how close you are to the next rank. **Go for ★★★**
plays it again; your best is kept. Passing a stage's last checkpoint shows **RANK UP!** with your new title. After
every finished lesson the coach writes your next one in the background.

### Progress
**Getting better** (notes landed per day you played, with the coach's line), **this week** (days played, streak,
minutes against your goal, the focus), the **skill map** (working on now, next on your path, later), **trophies**
(ranks and badges earned, then the three closest with how far you are), **coming up** (show-off set, your fills,
you vs you), **your time** (14 days against your daily goal) and **your lessons** in plain words. Buttons at the top
open this month's report and the page for a human teacher. In a song's **Play (scored)** mode, tick **Stage mode** for
a big video and an **ENCORE!** instead of the score sheet.

### A lesson
1. **The top bar** shows the steps (the one you're on by name), the tempo with a ladder of 5-BPM rungs from the step's
   start to its goal, **Hints** (H) and **Band** (B).
2. **The coach line and four moves**, each with its kit gesture: Play (or the move the moment needs), Hear it,
   Slower / Learn it slowly, Skip to next.
3. **The sheet** fills its panel. With hints on, the count is big under the notes (on quarter and 8th charts every
   "&" is shown; the ones you say but don't play are blue) with R / L / K / H under each note. Under the sheet the
   **goal**: boxes for the clean takes and what "clean" means ("12 of 16 notes land…"), and a mini kit with your pads.
4. **During a take** a beat ball bounces along the count and lands on each number with the click; the bar counter
   and **Stop** sit under the music.
5. **After the take** each note says on it, late, early or missed in its colour, extra hits get an ×, and a timing
   line shows every hit against the click. The side card keeps the count, the stars and one tip.
   - Two clean takes raise the tempo by 5 BPM. At the target tempo, you move to the next step.
   - A rough take slows it down (never below 40); after a few stuck takes the big move changes (check the latency,
     count with me, learn it slowly, something different).
6. **How it moves** shows the movement at your tempo (the grip from the side and from above, the kick heel down or
   heel up, strokes, accents, doubles, flams, drags), with the usual mistake one tap away and 📷 Check yourself.
   Details, Save as MIDI, Ask the coach for something different, Reset and Delete are under **⋯ More**.

Finished lessons come back for **review** after 2, 5, 12 and 30 days. A failed review brings the
lesson back the next day.

### Resets
| What | Where |
|---|---|
| Change goals or minutes per day | Journey → "Goals: … (change)" |
| Plan today again from current progress | Journey → "Rebuild today's plan" |
| Start one lesson over | In the lesson → "Reset this lesson" |
| Remove a coach lesson | In that lesson → "Delete this lesson" |
| Start the whole path over and redo setup | Bottom of Journey → "Reset all lesson progress" |

Resets never delete your run history (Progress tab).

### Other tabs
- **Practice.** On top, what you played last ("pick up where you left off", with today's start tempo and your best
  clean tempo); the For you cards below have a yellow ring: ride × 2 moves it, hi-hat pedal × 3 plays it. A short
  **warm-up** (tom 1 × 2) chains a few exercises, a minute each. Tabs and search list everything. Playing looks like a
  lesson: big − / + for the tempo, loop bars and times round, results on the notes, **Climb** (off by default: 2 clean
  takes move the tempo up 5, up to 5 above your best), the playing options as toggles, and your takes on this one.
- **Songs.** Learn real songs from YouTube (below). "Import files" still takes a drum MIDI file plus
  an MP3/OGG/WAV backing track.
- **Setup → Your kit.** The kit's status, then a checklist: latency (first when your takes all lean late), hit each pad
  once (the pad to hit in huge type on a drawing of your kit), soft then loud, sound levels, which hand leads, kit
  connected. The note map and the emulated kit are under Advanced.
- **Setup → Kit test.** Live animated kit, last hit with velocity, and a scrolling hit timeline.
- **Setup → Coach and voice.** Voice, while you play, sticks in hand (the gestures), Claude and your plan.

### Sheet music while you play
Practice, lessons and YouTube *Play (scored)* show the music as **drum notation** by default (switch *Sheet / Highway*
at the top right of the play area). A cursor glides through the current bar, played notes get a comic sticker
(green on time, yellow a bit off, red "MISS!"), extra hits get a ✕, notes the app plays for you (layered lessons)
are grey, and the page turns after each page of bars. Before you press Start it shows the music you're about to play.

## The coach while you play
- **Tips while you play** (Setup → Coach and voice): short banners on the highway such as "Dragging by 30 ms. Push a little" or "Hitting 180 ms after each click. Play with the click, not after it",
  "Bring the kick back in", "Hi-hat foot down" (the MPS-150 sends *open* unless the pedal is held). At most one
  tip every couple of bars. **How chatty**: quiet (only big problems), normal, talkative (adds dynamics tips
  and more praise). Tips also show on the results screen and go to the AI coach.
- **Voice**: "on screen + spoken" says the tips; "Speak verdicts and the coach's feedback" reads lesson verdicts
  and the AI coach's main point; "Count me in out loud" says "one, two, three, four" on the count-in clicks.
  Clicks and synth drums dip while the coach talks.

- **The live coach** (on by default; Setup → Coach and voice → "The coach follows my practice"). One remembering conversation per
  practice session: it greets each exercise, reacts to every take (it remembers the earlier ones: "the kick went from
  40 to 20 ms late"), and suggests one next step as a big button in the coach panel (bottom right): tap it, or just
  say "yes". It's written for a beginner: patient, one thing at a time, slows down readily.
  - **Talk to it:** hold **V** (or the 🎙 button) and speak; let go to send. Speech is transcribed on this laptop
    (Whisper, offline). **Hands-free:** when the coach asks you something, it listens for ~6 s by itself.
  - Fast: one `claude` process stays running for the session, and the coach starts speaking as soon as its first
    sentence is written (about 1–2 s). Model and effort: `CLAUDE_CLI_MODEL` / `CLAUDE_CLI_EFFORT` in `.env`
    (Haiku + low by default). Lessons, plans, show-off picks and song grooves are written in the background by
    `CLAUDE_CLI_LESSON_MODEL` / `CLAUDE_CLI_LESSON_EFFORT` (Sonnet + medium by default).
  - *The coach writes the tips*: once per exercise it writes its own wording for the live tips; the rules still
    decide when they fire.
  - Speech-to-text needs `uv`; the speech model (~140 MB) is downloaded into `data/whisper` the first time.

**Voice setup (offline, one time):**
```bash
uv tool install piper-tts
~/.local/share/uv/tools/piper-tts/bin/python -m piper.download_voices en_US-lessac-medium --data-dir data/voices
```
Restart `npm run dev`. Setup → Coach and voice → "test the voice". Without Piper the browser's voice is used (robotic on Linux).
Other voices: https://huggingface.co/rhasspy/piper-voices (put the `.onnx` + `.onnx.json` in `data/voices/`,
or set `PIPER_VOICE=/path/voice.onnx` in `.env`). Rendered phrases are cached in `data/tts/`.

## Learning songs from YouTube
1. **Songs** tab → search "artist song", or paste a YouTube / YouTube Music link → **Learn this**.
2. **Versions** → *Find drumless & covers*. Pick a drumless version to play along with and a drum
   cover to watch.
3. **1 · Set tempo.** Press Play and hit any pad on every beat, starting on a "1", for 8–16 taps.
   Then Save. Tick *Click along* to check it by ear. Each version needs its own tempo; once one
   version has it, 2–4 taps set the next.
4. **2 · Learn by ear.** Loop a few bars, slowing them down with Speed, and play what you hear.
   Each pass becomes a take (rings).
   - *Use take*, click cells to fix notes, then *Save bars*.
   - Tick *Hear my part* to compare with the recording.
   - *Ask coach for the groove* gives Claude's best guess from its knowledge of the song, not by
     listening. Use it as a starting point.
5. **3 · Jam.** Play freely along with the song. You're scored against its beat: timing, drift and
   dynamics per drum, plus the coach.
6. **4 · Play (scored).** Your transcription as a note highway over the drumless version, scored and
   saved to Progress.
7. **5 · Sheet music.** Your transcription as drum notation (x = cymbals, o = open hi-hat,
   (note) = ghost, > = accent, feet stems down). *Print / save as PDF*. Learn by ear can show the
   current bars as notation too, and every lesson step has a *Notation* section.

**Song audio (experimental).** *Connect song audio* opens a small "song player" window; Chrome asks
which tab to share: pick *Drum Coach – song player* with "Also share tab audio" on. Then you can:
- **turn the drums down** (quieter, not removed), for songs without a drumless version;
- get **suggested notes** in Learn by ear: while a section loops, the app listens for kick, snare and
  hi-hat hits and marks them as dashed squares; a note is suggested once it's heard in 2 passes.
  *Use suggestions* adds them to your part. Toms, cymbals and busy mixes aren't detected well, so check
  every note by ear.
Nothing is recorded or stored: the audio is analysed live and discarded.

**YouTube setup** (one time, free):
1. Go to https://console.cloud.google.com/ and create a project.
2. *APIs & Services → Library* → enable **YouTube Data API v3**.
3. *Credentials → Create credentials → API key*. Restrict it to YouTube Data API v3.
4. Put it in `.env` as `YOUTUBE_API_KEY=...` and restart `npm run dev`.

The free quota allows about 100 searches a day, and results are cached for 24 hours. Without a key
you can still paste links. Videos play ad-free with Premium when Chrome is signed in to YouTube, and
a few videos don't allow embedding.

## How it teaches
The pedagogy is in [docs/LEARNING.md](docs/LEARNING.md). In short:
- **The path is fixed.** `MILESTONES` in `src/content/curriculum.ts` defines levels 0–6: setup and
  counting, one limb at a time, the money beat, variations and fills, 16ths and dynamics, triplet
  feels, swing. Each milestone names **checkpoint** lessons, and passing them moves you on.
- **The lessons in between are chosen per student.** The coach writes them from your data. The
  built-in lessons fill in when the coach is unavailable, and serve as its examples.
- **Methods.** Layered groove building, demo first, count out loud, the tempo ladder, a gap click
  (silent bars), spaced review, interleaved sessions, and one specific fix at a time.
- **Goals filter lessons.** Lessons tagged rock, funk or jazz show only if you picked that goal;
  no goals shows everything.

## The AI coach
The browser never talks to Claude. The local server calls an `AiProvider` (`server/ai/providers.ts`):
- **`claude-cli` (default).** Runs your logged-in Claude Code headless:
  `claude -p --output-format json --tools "" --safe-mode --no-session-persistence --max-turns 1`.
  It runs in an empty temporary folder with no tools and without your API key in its environment,
  so it can only answer.
- **`api` (optional).** Used only with `AI_PROVIDER=api` and `ANTHROPIC_API_KEY` set.

Each feature has a prompt in `server/prompts/`. `system.md` is shared, and each request adds its own
file: `feedback`, `next`, `plan`, `chat`, `groove` or `lesson`. The coach only ever gets compact JSON
summaries, never raw MIDI. Every answer is validated with zod (`src/coach/schemas.ts`,
`src/youtube/schemas.ts`), cached in SQLite and queued one at a time. Calls can take a minute and
count toward your usage limits. The app shows "the coach is thinking" and never blocks playing. If
the CLI is missing or logged out, Setup → Coach and voice says so and everything else keeps working.

## Configuration (`.env`, all optional)
| Variable | Purpose |
|---|---|
| `YOUTUBE_API_KEY` | YouTube search (see YouTube setup) |
| `AI_PROVIDER` | `api` to use the Anthropic API instead of the `claude` CLI |
| `ANTHROPIC_API_KEY` | Key for the API provider |
| `CLAUDE_MODEL` | Model for the API provider (default `claude-sonnet-5-5`) |
| `CLAUDE_CLI_MODEL` | Model for the CLI provider (default: your Claude Code default) |
| `CLAUDE_CLI_LESSON_MODEL` / `CLAUDE_CLI_LESSON_EFFORT` | Model and effort for lessons, plans, show-off picks and song grooves (default `claude-sonnet-5-5`, `medium`) |
| `CLAUDE_BIN` | Path to the `claude` binary, if it's not on `PATH` |
| `DATA_DIR` | Where SQLite and uploaded audio live (default `./data`) |
| `PORT` | API port (default 8787). The Vite dev server proxies `/api` to it. |

## Your data
Everything stays on this machine.

- **`data/drum-coach.db` (SQLite).** Back it up if you care about your history. It holds:
  - runs, with per-run summaries
  - imported and coach-made charts, and their audio in `data/audio/`
  - settings
  - weekly plans
  - coach lessons (`ai_lessons`)
  - YouTube songs, beat grids and search cache
  - the coach's answer cache
- **The browser's localStorage.** It mirrors settings so the app works with the server down:
  - `drumcoach.settings`: latency, sound and coach options, your profile, lesson progress and
    today's session
  - `drumcoach.noteMap.<device>`: the note map per kit
  - `drumcoach.midiInput`: the chosen MIDI input
  - `drumcoach.playOptions`: Practice options
  - `drumcoach.chat`: chat history

The API only accepts requests from localhost and binds to 127.0.0.1.

## Architecture
```
src/
  engine/    pure, unit-tested logic (no DOM)
    kit, midi, calibration      note map, MIDI parsing, hit-each-pad wizard
    chart, run, scoring         chart format + pattern() DSL, A–B/repeat runs, matcher, stats, latency estimate
    lesson, planner             pass check, tempo ladder, spaced review, milestones, daily session
    progress                    dashboard + rule-based "next exercise"
    midiImport                  Standard MIDI → chart
    youtube, tempo, transcribe, jam   link parsing, beat grid from taps, take quantizing, chartless jam scoring
  input/     MIDI (useMidi), keyboard fallback, hit event bus, note-map and settings stores
  play/      Web Audio (click, synth drums), lookahead player, Highway canvas, Practice (free play), Results
  lesson/    Journey tab, lesson player, celebration, show-off card, lesson state + resets, coach-lesson store
  content/   curriculum (milestones + built-in lessons), exercise library, chart store, file import
  coach/     coach API client, zod schemas, run summary, coach settings/cards, results feedback
  youtube/   Songs tab: search, versions, tempo, learn, jam, play, YouTube player, drum reducer
  ui/        App shell and tabs, kit view, calibration, latency, progress, timeline
server/
  index.ts   Fastify routes (below)        db.ts     SQLite schema
  ai/        providers, coach (cache/queue/validation), coach lessons
  youtube.ts YouTube Data API search + cache
  prompts/   one Markdown prompt per coach feature
public/      popup YouTube player and the drum-reducer AudioWorklet
prototype/   the original single-file prototype
```

**Data flow.** A MIDI or keyboard hit goes onto the hit bus with a `performance.now()` timestamp and
the pad from your note map. The player matches it against the expected notes, after subtracting
your latency, using Perfect ±40 ms and Good ±100 ms windows, tighter for fast notes (a stroke slightly further off is a miss
for its note rather than an extra; stick bounces within 60 ms at under 70 % of the stroke's velocity are ignored). The finished take gives `RunStats`, which
drives the verdict, the tempo ladder and the saved run. The coach later reads those saved runs to
write lessons.

**Clocks.** Clicks and app-played drums are scheduled ahead on the Web Audio clock with a 120 ms
lookahead. Their times are converted to `performance.now()` with `getOutputTimestamp()`, so they are
on the same clock as `MIDIMessageEvent.timeStamp`. YouTube runs use the video's clock instead.

### API
| Route | What it does |
|---|---|
| `GET /api/health` | Server and provider check |
| `GET/POST /api/charts`, `PATCH/DELETE /api/charts/:id`, `GET/PUT /api/charts/:id/audio` | Saved charts and backing audio |
| `GET/POST /api/runs` | Run history |
| `GET /api/settings`, `PUT /api/settings/:key` | Settings mirror |
| `GET /api/coach/status` | Is the coach ready? |
| `POST /api/coach/feedback \| next \| plan \| chat \| groove \| lesson` | Coach features |
| `GET /api/plan`, `PUT /api/plan/:id/checks` | Weekly plan |
| `GET /api/lessons`, `DELETE /api/lessons/:id` | Coach-written lessons |
| `GET /api/youtube/search`, `GET /api/youtube/versions` | YouTube search, drumless and cover finder |
| `GET/POST /api/ytsongs`, `PATCH/DELETE /api/ytsongs/:id`, `PUT /api/ytgrids/:videoId` | YouTube songs and beat grids |

## Development
```bash
npm test        # Vitest: engine, curriculum, coach, YouTube
npm run lint    # ESLint
npm run build   # type-check + production build
```
- **Rules.** Read `CLAUDE.md` first: it has the project rules and the verified kit facts.
- **Tests.** Engine code stays pure and tested with synthetic hit streams.
- **UI changes.** Check them in Chrome with the keyboard fallback.
- **Dev console.** `drumCoach.emitNote(38, 100)` fakes a hit, and `drumCoach.player` shows the live
  player state.
- **Adding a built-in lesson.** Add a `lesson(...)` entry to `src/content/curriculum.ts`. Patterns
  use one character per step: `x` hit, `X` accent, `g` ghost, `.` rest. For example
  `P(2, { hihat: 'xxxxxxxx', kick: 'x...x...', snare: '..x...x.' })` is the money beat in 8ths.
  `curriculum.test.ts` checks every chart. To make a lesson a gate, add its id to a milestone's
  `checkpoints`.
- **Changing what the coach writes.** Edit `server/prompts/lesson.md`. The answer must match
  `AiLessonSchema`.

## Troubleshooting
- **"MIDI blocked".** Click the icon left of the address bar, allow MIDI, then click the status chip.
- **No MIDI device.** Check `amidi -l` (it should show `e-Drum MIDI 1`). Close other apps holding the
  port. Use Google Chrome, not snap Chromium.
- **Every hit is graded late.** Do latency calibration with the same headphones or speakers you
  practise with.
- **The hi-hat counts as open.** The pad sends *open* unless the pedal is held down. Plain hi-hat
  notes accept both; open-hi-hat lessons need the pedal lifted.
- **"Coach unavailable".** Run `claude` once in a terminal to log in. Check the status under Setup → Coach and voice.
- **YouTube search errors.** Check `YOUTUBE_API_KEY` and the daily quota. Pasting a link always
  works.
- **Port already in use.** Another `npm run dev` is running. Stop it, or set `PORT` and Vite's port.

## Docs
- [CLAUDE.md](CLAUDE.md): project rules for Claude Code.
- [docs/SPEC.md](docs/SPEC.md): product spec and milestones (M0–M7).
- [docs/LEARNING.md](docs/LEARNING.md): how the app teaches.
- [docs/KIT.md](docs/KIT.md): verified hardware and MIDI facts.
- `prototype/drum-stage.html`: the original prototype. Open it in Chrome.
