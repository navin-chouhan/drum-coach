# Mobile recon (A0): the map for the Expo iPad/iPhone port

Read-only survey of the web app at `607528e` (main, 2026-10-27), for the agents that build `@drum-coach/core` (B17) and the
native screens. Every claim was checked by grep or by reading the file; `path:line` is given for each one. `npm ci && npx vitest run`
was run in this worktree: **349 tests in 48 files, all passing**.

Short version:
- `src/engine` (35 files) and `src/content/{curriculum,demos,library}.ts` are already pure. They use no DOM, no Web Audio, no
  `fetch` and no Vite features. The only browser-ish uses are `new URL` (one file), `toLocale*` (two calls) and `Math.random` defaults.
- The blockers are all in **`src/input`** (`hits.ts → store.ts` uses `localStorage` and `fetch`, and `settings.ts` reads
  `localStorage` at import and listens on `window`) and in **`src/content/charts.ts`** (React, `fetch`, `AudioContext`).
- The heart of a take, **`src/play/player.ts` (358 lines)**, is not in the candidate core. It wires the matcher, wait mode,
  endless takes, the external (YouTube) clock and drift correction to Web Audio. If it isn't split, iOS has to re-implement it.
  This is the biggest risk (see §10).

---

## 1. Browser API uses in the candidate core (and what they pull in)

Candidate core = `src/engine/*.ts`, `src/content/*.ts`, `src/coach/schemas.ts`, `src/youtube/schemas.ts`, `src/input/hits.ts`,
`src/input/settings.ts`, plus their imports. A script that followed every relative import found **one file pulled in from
outside**: `src/input/store.ts` (through `hits.ts:3`). Searched for: `window document navigator localStorage sessionStorage
fetch performance AudioContext AudioBuffer requestAnimationFrame setTimeout setInterval HTMLElement Canvas MIDIMessageEvent
KeyboardEvent Blob File URL crypto structuredClone TextEncoder/Decoder import.meta Intl toLocale* Math.random Date process`.

| What | Where | Blocker? | Smallest fix |
|---|---|---|---|
| `performance.now()` as a default parameter | `src/input/hits.ts:31` (`emitNote(…, time = performance.now())`) | **Yes** (the clock must be injected; RN's `performance.now()` is not on the CoreMIDI host clock) | Inject `now: () => number` (iOS: `DrumMidi.nowMs()`, web: `performance.now`) |
| `localStorage` (read at import, inside try) | `src/input/settings.ts:44`, `:67` | **Yes** (it reads at import time; the RN copy would silently start from defaults) | Split: `Settings` type, `DEFAULTS`, `migrate`, `serverIsNewer` → core. The store goes behind a `KeyValueStore` interface, and the web impl stays in `src/input/settings.ts` |
| `window.addEventListener('storage')` (guarded by `typeof window`) | `src/input/settings.ts:60-63` | No (guarded), but web-only behaviour | Keep in the web store |
| `fetch('/api/settings/app')` (relative URL) | `src/input/settings.ts:68` | **Yes** (a relative URL has no base in RN) | A `SyncClient` interface (`put(key, value)`), injected |
| `localStorage` + `fetch` (pulled in by `hits.ts`) | `src/input/store.ts:9,17,22,23,46,47,54,59` | **Yes** | `hits.ts` takes `getNoteMap`/`getPadCal` from an injected `InputConfig`, and `store.ts` stays web (or becomes `createKitStore(kv, sync)` in core with injected ports) |
| React `useEffect/useState`, `fetch`, `AudioContext`, `AudioBuffer` | `src/content/charts.ts:1,13,33,40-43` | **Yes** | Move `charts.ts` to the web app (`src/web/…` or leave in place). Core keeps `library.ts`/`curriculum.ts` only |
| React, `File`, `fetch`, dynamic `import()` | `src/content/SongsView.tsx:1,11,16,20,32,43` | **Yes** (a `.tsx` screen) | Web-only screen; it is not core |
| `new URL(…)`, `url.searchParams.get` | `src/engine/youtube.ts:10,14` | Low (Expo SDK ≥ 50 ships a WHATWG URL polyfill; older RN `URLSearchParams.get` threw) | Keep. Add a core test, and a startup smoke check on device |
| `toLocaleString('en')`, `toLocaleDateString('en', {weekday:'long'})` | `src/engine/progress.ts:111,142` | Low (Hermes on iOS has `Intl`) | Keep. Verify the output on device |
| `new Date()` / local-time math (wall clock, not monotonic) | `src/engine/history.ts:27-37`, `src/engine/lesson.ts:331`, `src/engine/profile.ts:21,64`, `src/engine/progress.ts:55-61,131,221`, `src/input/settings.ts:66` (`Date.now`) | No (wall-clock dates are fine) | Most take `now` as a parameter already. Keep |
| `Math.random` as a default RNG | `src/engine/kitEmulator.ts:35,57` | No | Keep (`seededRandom` exists, `kitEmulator.ts`) |
| `Uint8Array` from `@tonejs/midi` | `src/engine/exportMidi.ts:1,17`, `src/engine/midiImport.ts:1` | No (pure JS); `Blob` is built by the caller (`LessonPlayer.tsx:601`, `PlayMode.tsx:53`) | Keep. Saving the file is the platform's job (iOS: `expo-sharing`) |
| `zod` v4 | `src/engine/chart.ts:1`, `src/coach/schemas.ts:1`, `src/youtube/schemas.ts:1` | Low (zod 4 may JIT with `new Function`; Hermes is slow at it or refuses it) | On RN call `z.config({ jitless: true })` once at startup. Verify on device |
| `Array.prototype.findLastIndex`, `.at`, `.flatMap`, `.replaceAll` | e.g. `src/engine/scoring.ts:103` | No (Hermes in current RN has them) | — |
| `setTimeout` / `setInterval` / `requestAnimationFrame` | **none** in the candidate core | — | — |
| DOM types, React imports, `import.meta.*`, `?url`/`?raw`, `import.meta.glob`, JSON or asset imports | **none** in the core `.ts` sources. The only `import.meta.glob` is in a test: `src/input/fixtures.test.ts:5` (Vitest supports it) | No | — |
| Comments that say "performance.now clock" | `src/engine/scoring.ts:16`, `src/input/hits.ts:6` | No (scoring is clock-agnostic: it only subtracts ms) | Reword to "the host ms clock" |

Vite-only features exist **only in web files**: `import.meta.env.DEV` in `src/voice/voice.ts:11`, `src/notation/SheetMusic.tsx:298`,
`src/youtube/SongView.tsx:38` and `src/main.tsx:19`; a CSS import in `src/main.tsx:7`; a lazy VexFlow chunk in `src/notation/index.tsx:4-8`.

**Import style.** Most core files import with an explicit `.ts` (e.g. `src/engine/run.ts:1`). A few don't: `src/engine/padCommands.ts:1`,
`src/engine/calibration.ts:1` (type-only, erased), and the `src/input/*` files. The server runs these files **directly
with Node type stripping** (`package.json` `"server": "node … server/index.ts"`), so every value import reachable from `server/`
must keep its `.ts` extension. Keep that rule in core. Metro resolves an explicit `./x.ts`, but **verify that in A2**.

## 2. The core import graph

**Edges that leave the candidate core:**

| From | To | Kind | Fix |
|---|---|---|---|
| `src/input/hits.ts:3` | `src/input/store.ts` (`localStorage`, `fetch`) | value | Inject `getNoteMap`/`getPadCal` |
| `src/content/charts.ts:1` | `react` | package | Move `charts.ts` to web |
| `src/content/SongsView.tsx:4` | `src/ui/nav.ts` | value | Web screen; not core |
| `src/input/fixtures.ts:5-6` | `hits.ts`, `store.ts` | value | Moves with `hits.ts` once the store is injected |

Edges **inside** the core that cross folders, all fine: `src/engine/lesson.ts:1` → `content/demos.ts` (type only); `src/coach/schemas.ts:2-4` →
`engine/chart.ts`, `content/demos.ts`, `engine/band.ts`; `src/youtube/schemas.ts:2` → `engine/chart.ts`; `src/content/curriculum.ts:1-6` → engine.
Packages used by the core: `zod`, `@tonejs/midi`. That's all.

**Who imports the core from outside.** The server imports 12 core modules by relative `.ts` path, for example `server/index.ts:7-27` and
`server/ai/lessons.ts:1-10` (curriculum, library, chart, lesson, planner, profile, skills, health, history, progress, stageSong,
transcribe, both schemas). `scripts/playtest/emulated-fixture.ts:4-7` imports chart, kit, kitEmulator and run.

### Proposed final core (`packages/core/src/…`, consumed as TS source)

| Group | Files | Count |
|---|---|---|
| engine | `band calibration chart demoPose earQuiz exportMidi feel form greeting health history jam kit kitEmulator lesson liveCoach meter midi midiImport notation onsets padCal padCommands planner profile progress run scoring sight skills stageSong takeMarks tempo transcribe youtube` | 35 |
| content | `curriculum.ts`, `demos.ts`, `library.ts` | 3 |
| schemas | `coach/schemas.ts`, `youtube/schemas.ts` | 2 |
| input (after injection) | `hits.ts` (filters plus the bus, with `now`/note map/pad cal injected), `settings.ts` (type, `DEFAULTS`, `migrate`, `serverIsNewer`), `fixtures.ts` (`replayFixture`) | 3 |
| new interfaces | `platform.ts`: `Clock { now(): number }`, `KeyValueStore`, `SyncClient`, and later `AudioPort` | 1 |
| fixtures (data) | `input/fixtures/emulated-flam-taps.json`, `emulated-ghost-groove.json` | 2 |
| **Total** | **44 `.ts` + 2 JSON** (about 3.6k source lines: engine 2,558 + content ~940 + the rest) | |

**Candidates for a second core pass** (they're pure or nearly, but they import web modules): `src/coach/summary.ts` (needs only the
`Finished` type from `play/player.ts:48`), `src/lesson/tools.ts`, `src/ui/drums.ts`, `src/ui/nav.ts` (a pure event bus), the
pure parts of `src/coach/session.ts` (`replyFor`/`coachLine`/`screenAction`/`thinkingAbout`, tested in `session.test.ts`),
`src/lesson/state.ts` (pure apart from `getSettings`/`setSettings`), `nudgeLevel` in `src/ui/SoundCheckCard.tsx` (tested), and,
most important, the take engine inside `src/play/player.ts` (see §3 and §10).

**Stays web-only:** `src/input/{store,useMidi,keyboard,emulatedKit}.ts`, `src/content/{charts.ts,SongsView.tsx}`,
`src/play/*` (audio, player, views), `src/voice/*`, `src/youtube/{api,yt,tabAudio}.ts` and the `*Mode.tsx` views,
`src/coach/{api.tsx,session.ts,aiTips.ts,weekPlan.ts,CoachView.tsx,CoachFeedback.tsx}`, `src/lesson/*`, `src/notation/*`,
`src/ui/*`, `src/main.tsx`, `public/*`. To keep the web app unchanged, leave **re-export shims** at the old paths (e.g.
`src/engine/scoring.ts` → `export * from '@drum-coach/core/engine/scoring'`), or update the imports in one mechanical commit.

## 3. Clock assumptions

There are three clocks today. **Hit clock**: `performance.now()` ms, the same base as `MIDIMessageEvent.timeStamp` and
`KeyboardEvent.timeStamp`. **Audio clock**: `AudioContext.currentTime` s. **Song clock**: YouTube `getCurrentTime()` s.
Scoring only ever compares hit-clock ms.

| Place | What it assumes |
|---|---|
| `src/input/useMidi.ts:29` | `receiveMidi(e.data, e.timeStamp)`: the MIDI timestamp *is* the hit clock |
| `src/input/keyboard.ts:18-19` | `KeyboardEvent.timeStamp` is on the same clock (true in Chrome) |
| `src/input/hits.ts:31,35,38` | default `time = performance.now()`; bounce (60 ms) and crosstalk (15 ms) windows are differences on that clock |
| `src/input/emulatedKit.ts:25,34` | builds hit times from `player.zero` + `latencyMs`; delivers with `setTimeout(…, t - performance.now())` |
| `src/engine/kitEmulator.ts:25,61-75` | `RawMidi.timeStamp` in ms; 0xF8 every `60000/bpm/24` ms, 0xFE every 300 ms |
| `src/input/fixtures.ts:21,28-31` | synthetic `zero` (2e9 + n·1e7); fixture times are ms after beat 0 |
| `src/play/audio.ts:35-43` | `audioToPerf(t)`: audio time → hit ms via `getOutputTimestamp()` (trusted only within 250 ms of now). Fallback: `now + (t − currentTime + baseLatency + outputLatency)·1000` |
| `src/play/player.ts:158-162` | first click at `currentTime + 0.15`; `player.zero = audioToPerf(zeroAudio)`, so **beat 0 is in hit-clock ms** |
| `src/play/player.ts:109, 197` | expected note time = `zero + t·beatMs`; a hit is matched at `h.time − latencyMs − drift` |
| `src/play/player.ts:170, 275-276` | `drift`: smoothed `audioToPerf(zeroAudio) − zero` (only if under 50 ms), so the audio clock slipping against the hit clock is followed |
| `src/play/player.ts:241-279` | lookahead scheduler: `setInterval` every 25 ms, schedules everything due before `currentTime + 0.2` (200 ms; the README "Clocks" paragraph says 120 ms, which is stale) and drops what's later than 30 ms; finishes when `performance.now() > zero + beats·beatMs + 400` |
| `src/play/player.ts:112-123` | `position(now = performance.now())`: run beats from hit-clock time (wait mode advances by elapsed ms) |
| `src/play/player.ts:307-332` | external clock (YouTube): `zero = 0`, a hit's time = `ext.position(h.time − latency)·beatMs`, polled every 50 ms |
| `src/youtube/yt.ts:60-94` | song time interpolated from `getCurrentTime()` (which updates every ~100-250 ms) anchored at `performance.now()`, minus `heardDelaySec` |
| `src/youtube/{LearnMode.tsx:50, TempoMode.tsx:25, JamMode.tsx:29}` | `yt.songTime(h.time − latencyMs)`: a hit-clock time goes into the song clock |
| `src/youtube/tabAudio.ts:51` | onset time = `performance.now() − (ctx.currentTime − o.time)·1000` |
| `src/ui/LatencyCard.tsx:23-28` → `src/engine/scoring.ts:297` | click times via `audioToPerf`; taps on the hit clock; `estimateLatency` takes the median difference |
| `src/voice/voice.ts:55-59,68-98` | the count-in voice is scheduled on the audio clock (`sayAt`); `busyUntil` is on `performance.now()` |
| Rendering: `src/play/Highway.tsx:29`, `src/ui/Timeline.tsx:31`, `src/notation/SheetMusic.tsx:306`, `src/play/AtKit.tsx:37,48` | `performance.now()` for the frame (to read `position()` and fade cues) |
| Wall clock (not timing): `src/play/player.ts:161,307,349`, `src/youtube/JamMode.tsx:38,46` | `new Date().toISOString()` for `startedAt`; `durationS` |

**What "one monotonic ms clock" must mean for the core API:**
1. Every time the core takes or returns (`Hit.time`, `PlayedHit.time`, `Expected.time`, `zero`, `RawMidi.timeStamp`,
   `estimateLatency` inputs) is in **host ms**: on iOS `DrumMidi.nowMs()` / `hostTimeMs` (mach time), on web `performance.now()`.
   The core never reads a clock by itself. It gets a `Clock` (or a `now` argument).
2. The platform's audio layer owns the mapping between audio time and host ms (web: `audioToPerf`; iOS: S1's mapping). It hands the
   core the beat-0 time in host ms, plus an updated drift. The core never sees audio-clock seconds.
3. `latencyMs` is the one measured correction (sound out → stroke heard by the student). It's per device and per output, so the iPad
   needs its own measurement (don't import the laptop's value).
4. The song clock is a function `position(hostMs) → beats` that the platform supplies (as `PlayOptions.external` does now).

## 4. Screen inventory

44 `.tsx` files. Lines from `wc -l`. Dependencies were found by grep (Canvas = `getContext`, rAF = `requestAnimationFrame`, SVG = inline or DOM SVG).
"Default v1" = Journey, lesson player, Practice, Progress, Setup (kit, pads, latency, server), and Songs with inline YouTube.

| File | Lines | README section | Main dependencies | Tag |
|---|---|---|---|---|
| `src/ui/App.tsx` | 152 | Using the app (tabs, kit chip, Setup) | Web MIDI (`useMidi`), `navigator.userActivation` (`:58-62`), key listeners | v1 (native tab shell) |
| `src/main.tsx` | 21 | — | DOM root, CSS, settings sync on start (`:11-16`) | web-only (the start-up sync logic moves to the app) |
| `src/lesson/TodayView.tsx` | 506 | Journey (home) | SVG ring, `fetch('/api/runs')` (`:61`) | v1 |
| `src/lesson/LessonPlayer.tsx` | 622 | A lesson | notation (VexFlow), `player`, Save-as-MIDI download (`:601`) | v1 (MIDI export later) |
| `src/lesson/Celebration.tsx` | 52 | Finishing a lesson | Web Audio fill (`:11`) | v1 |
| `src/lesson/EarQuiz.tsx` | 61 | A lesson (tool) | keys | v1 |
| `src/lesson/Transcribe.tsx` | 49 | A lesson (tool) | — | v1 |
| `src/lesson/RealSong.tsx` | 44 | A lesson (song bite over YouTube, N3) | YouTube IFrame | v1 (inline YouTube) |
| `src/lesson/ShowoffCard.tsx` | 45 | Journey → stage song | coach `showoff` (server) | v1 (needs server) |
| `src/play/PlayView.tsx` | 375 | Other tabs → Practice | Web Audio, `localStorage` (`:22`), `fetch` | v1 |
| `src/play/Results.tsx` | 171 | A lesson step 5 (after the take) | Canvas timing line (`:133`), `POST /api/runs` (`:25`) | v1 |
| `src/play/AtKit.tsx` | 144 | A lesson (coach line, moves, ladder, goal) | SVG mini kit | v1 |
| `src/play/IntroSlides.tsx` | 85 | A lesson (intro slides) | keys | v1 |
| `src/play/NotesView.tsx` | 47 | Sheet music while you play (Sheet/Highway switch) | VexFlow, Highway | v1 |
| `src/play/Highway.tsx` | 124 | Sheet music while you play (highway) | Canvas + rAF | v1 (Skia) |
| `src/notation/SheetMusic.tsx` | 382 | Sheet music while you play | **VexFlow** + Bravura, `document.fonts` (`:218,362`), Canvas/SVG, rAF | v1 (the hardest screen, see §10) |
| `src/notation/index.tsx` | 25 | Learning songs step 7 (print) | lazy chunk, `window.print` (`:19`) | v1 for the sheet; printing later |
| `src/ui/ProgressView.tsx` | 246 | Progress | SVG charts, `fetch('/api/runs')` (`:37`) | v1 |
| `src/ui/SkillMapView.tsx` | 94 | Journey → skill map, placement | — | v1 |
| `src/ui/YouVsYou.tsx` | 64 | Progress → you vs you, monthly report | `fetch` takes and the `month` coach call (`:15,28,33`) | later |
| `src/ui/TeacherView.tsx` | 66 | Progress → page for a human teacher | `window.print` (`:41`), `fetch` (`:14-22`) | later |
| `src/ui/Calibrate.tsx` | 219 | Setup → Your kit (checklist, PadWizard) | SVG kit, keys, `fetch` (`:26`) | v1 |
| `src/ui/PadCalibration.tsx` | 83 | Setup → Your kit (soft then loud) | `onRawMidi` (`:41`) | v1 |
| `src/ui/LatencyCard.tsx` | 60 | First time → latency calibration | Web Audio clicks + `audioToPerf` (`:23-28`) | v1 |
| `src/ui/SoundCheckCard.tsx` | 112 | Setup → Your kit (sound levels) | Web Audio lookahead clicks (`:20,76`) | v1 |
| `src/ui/EmulatedKitCard.tsx` | 30 | Setup → Advanced (emulated kit) | — | later (dev) |
| `src/ui/KitView.tsx` | 226 | Setup → Kit test (live kit) | SVG animation | v1 |
| `src/ui/LastHit.tsx` | 22 | Setup → Kit test | — | v1 |
| `src/ui/Timeline.tsx` | 69 | Setup → Kit test (hit timeline) | Canvas + rAF | v1 |
| `src/ui/TechniqueView.tsx` | 27 | Journey → Stick technique | — | later |
| `src/ui/TechniqueDemo.tsx` (+ `demoArt.ts` 374) | 167 | A lesson step 6 "How it moves" | rAF, **DOM SVG** (`demoArt.ts:16-35` uses `document.createElementNS`) | later (rewrite with react-native-svg) |
| `src/ui/SelfCheck.tsx` | 78 | "📷 Check yourself" | `getUserMedia` video + `MediaRecorder` (`:24,34`), download (`:72`) | later (expo-camera) |
| `src/coach/CoachView.tsx` (`CoachSettings`, `PlanCard`) | 144 | Setup → Coach and voice; Journey weekly plan | `fetch` status and plan (`:31,93,101`) | v1 (server URL and status); plan needs the server |
| `src/coach/CoachFeedback.tsx` | 50 | Results → coach feedback | coach `feedback` | v1 (needs server) |
| `src/coach/api.tsx` (`Thinking`) | 35 | "coach is thinking" | — | v1 (component) |
| `src/voice/TalkToCoach.tsx` | 69 | The coach while you play → talk to it (hold V) | mic via `listen.ts` (`getUserMedia`, `MediaRecorder`) | later |
| `src/youtube/SongsPage.tsx` | 87 | Learning songs step 1 | — | v1 |
| `src/youtube/SongView.tsx` | 224 | Learning songs steps 2-7 | YouTube IFrame, **`window.open` popup** (`:68`), tab audio, VexFlow | v1 without the popup or tab audio |
| `src/youtube/TempoMode.tsx` | 91 | 1 · Set tempo | rAF, Web Audio click (`:42`) | v1 |
| `src/youtube/LearnMode.tsx` | 167 | 2 · Learn by ear | rAF, VexFlow, Web Audio, coach `groove` (`:100`) | v1 (no note suggestions) |
| `src/youtube/GridEditor.tsx` | 79 | 2 · Learn by ear (cells) | Canvas + rAF | v1 |
| `src/youtube/JamMode.tsx` | 108 | 3 · Jam | `POST /api/runs` (`:48`) | v1 |
| `src/youtube/PlayMode.tsx` | 77 | 4 · Play (scored), Stage mode | VexFlow, MIDI download (`:53`) | v1 |
| `src/content/SongsView.tsx` | 84 | Songs → Import files (MIDI + MP3) | `File` inputs, `fetch` PUT audio | later (expo-document-picker) |

Counts: **44 files**. The v1 tag has 34 (including small widgets), later 9 (`YouVsYou`, `TeacherView`, `EmulatedKitCard`, `TechniqueView`,
`TechniqueDemo`, `SelfCheck`, `TalkToCoach`, `SongsView`, print), and web-only 1 (`main.tsx`). Screens a user navigates to:
Journey, Lesson, Practice, Results, Progress, Skill map, Setup×3 (Your kit, Kit test, Coach and voice), Songs list, Song view
with 5 modes. That's **about 12 navigable screens**; the rest are panels or widgets.

## 5. localStorage and sessionStorage keys

`sessionStorage` and IndexedDB: **not used** (grep). Every `localStorage` access is wrapped in try/catch.

| Key | file:line | Value shape | Mirrored to the server? |
|---|---|---|---|
| `drumcoach.settings` | `src/input/settings.ts:8` (read `:44`, write `:67`) | `Settings` (`settings.ts:10-37`): latency, sound, voice and coach switches, `profile`, `lessons: Record<id, LessonProgress>`, `session`, `fills`, `arcade`, `badges`, `updatedAt`, `v` | Yes: `PUT /api/settings/app` (`:68`). At start-up the newer copy wins (`src/main.tsx:12-16`, `serverIsNewer` `settings.ts:57`) |
| `drumcoach.noteMap.<kitName>` | `src/input/store.ts:5` (`:9,46,59`) | `NoteMap = Record<PadId, number>` (`src/engine/kit.ts:24`) | Yes: `PUT /api/settings/noteMap.<kit>` (`:47`). The server copy wins on start (`:52-61`) |
| `drumcoach.padCal.<kitName>` | `src/input/store.ts:16` (`:17,22`) | `KitCalibration = Partial<Record<PadId, {soft, loud, bounceMs?, bounceRatio?}>>` (`src/engine/padCal.ts:6-7`) | Yes: `PUT /api/settings/padCal.<kit>` (`:23`). Only the current kit's copy is pulled (`:56`) |
| `drumcoach.midiInput` | `src/input/useMidi.ts:6` (`:13,57`) | string (device name) | No |
| `drumcoach.playOptions` | `src/play/PlayView.tsx:22` (`:37,50`) | `PlayOptions` minus `fromBar/toBar/backing`, plus `chartId` and `climb?` (`:23`) | No |

Server-only settings rows (never in `localStorage`): `teacherNotes` (`src/ui/TeacherView.tsx:11-17`, `server/index.ts:128`) and `monthReport`
(`server/index.ts:159,170`, read by `src/ui/YouVsYou.tsx:33`). Kit names are the MIDI device name (`useMidi.ts:21`), so the iPad's
device is **`e-Drum`**, not `e-Drum MIDI 1` (CLAUDE.md). It gets its own note map row unless it's migrated.
README drift: README's "Your data" lists `drumcoach.chat` (it's not in the code) and leaves out `drumcoach.padCal.*`.

## 6. All `/api` calls

The server has **37 routes** (`server/index.ts`); the client uses **35 of them** from about 45 call sites. All client URLs are **relative** (`/api/...`),
through Vite's proxy (`vite.config.ts:11`). The server **binds to 127.0.0.1** (`server/index.ts:425`) and **refuses with 403 any Host other than
localhost/127.0.0.1** (`:33-38`), so today a phone **can't reach any route** (§7). "Phone alone?" = can the device serve it itself, with
expo-sqlite and the core.

**Persistence**
| Client | Method + path | Server | Phone alone? |
|---|---|---|---|
| `src/content/charts.ts:13` | GET `/api/charts` | `:60` | yes |
| `src/content/charts.ts:33` | POST `/api/charts` | `:62` | yes |
| `src/play/PlayView.tsx:167` | PATCH `/api/charts/:id` | `:73` | yes |
| `src/content/SongsView.tsx:43` | DELETE `/api/charts/:id` | `:80` | yes |
| `src/content/SongsView.tsx:32` | PUT `/api/charts/:id/audio` | `:94` (writes `data/audio/`) | yes (expo-file-system) |
| `src/content/charts.ts:43` | GET `/api/charts/:id/audio` | `:105` | yes |
| `src/ui/ProgressView.tsx:37`, `src/ui/Calibrate.tsx:26`, `src/play/PlayView.tsx:71`, `src/lesson/TodayView.tsx:61` | GET `/api/runs` | `:146` (SQL with `json_extract`, `:114-120`) | yes (expo-sqlite has JSON1) |
| `src/play/Results.tsx:25`, `src/youtube/JamMode.tsx:48` | POST `/api/runs` | `:132` (also keeps `run_hits`, capped `:139-141`) | yes |
| `src/ui/YouVsYou.tsx:15` | GET `/api/runs/:id/take` | `:147` | yes |
| `src/ui/TeacherView.tsx:22` | GET `/api/profile` | `:130` (`studentProfile`, core) | yes |
| `src/input/store.ts:54`, `src/ui/TeacherView.tsx:14`, `src/ui/YouVsYou.tsx:33` | GET `/api/settings` | `:175` | yes |
| `src/input/settings.ts:68`, `src/input/store.ts:23,47`, `src/ui/TeacherView.tsx:17` | PUT `/api/settings/:key` | `:176` | yes |
| `src/coach/CoachView.tsx:93`, `src/coach/weekPlan.ts:13` | GET `/api/plan` | `:234` | yes (read) |
| `src/coach/CoachView.tsx:101` | PUT `/api/plan/:id/checks` | `:235` | yes |
| `src/lesson/aiLessons.ts:17` | GET `/api/lessons` | `:387` | yes (read) |
| `src/lesson/aiLessons.ts:43` | DELETE `/api/lessons/:id` | `:388` | yes |

**AI coach**: all of these need the home server (the claude CLI). Most go through `askCoach` (`src/coach/api.tsx:17`).
| Client | Method + path | Server |
|---|---|---|
| `src/coach/CoachView.tsx:31` | GET `/api/coach/status` | `:187` (spawns `claude --version`) |
| `src/coach/CoachFeedback.tsx:23`, `src/youtube/JamMode.tsx:102` | POST `/api/coach/feedback` | `:199` |
| `src/coach/CoachView.tsx:114`, `src/coach/weekPlan.ts:22` | POST `/api/coach/plan` | `:206` (reads server runs, `app` settings, ai_lessons, yt_songs; writes `plans`) |
| `src/coach/session.ts:97` | POST `/api/coach/session`: **server-sent events** on a POST, read with `res.body.pipeThrough(new TextDecoderStream())` (`:99`) | `:243` (raw SSE `:262-268`) |
| `src/coach/aiTips.ts:19` | POST `/api/coach/tips` | `:271` |
| `src/youtube/LearnMode.tsx:100` | POST `/api/coach/groove` | `:367` |
| `src/lesson/ShowoffCard.tsx:40` | POST `/api/coach/showoff` (also does a YouTube search) | `:374` |
| `src/lesson/aiLessons.ts:40` | POST `/api/coach/lesson` | `:394` (reads server `app` settings, runs, yt_songs; writes `ai_lessons`) |
| `src/ui/YouVsYou.tsx:28` | POST `/api/coach/month` | `:155` |

**Voice (TTS/STT)**: these need the home server.
| Client | Method + path | Server | iOS alternative |
|---|---|---|---|
| `src/voice/voice.ts:34` | GET `/api/tts/status` | `:281` | — |
| `src/voice/voice.ts:40` | GET `/api/tts?text=` (WAV) | `:282` (Piper, `data/tts` cache) | `expo-speech` (AVSpeechSynthesizer), as `speechSynthesis` is now (`voice.ts:76-97`); bundle pre-rendered count-in and tip clips |
| `src/voice/listen.ts:56` | POST `/api/stt` (audio/wav) | `:293` (Whisper via uv) | on-device SFSpeechRecognizer (a module), later |
| — (unused by the client) | GET `/api/stt/status` | `:292` | — |

**YouTube**
| Client | Method + path | Server | Phone alone? |
|---|---|---|---|
| `src/youtube/api.ts:15` | GET `/api/youtube/search` | `:304` (Data API key, server-only by rule) | **no** (pasting a link still works: `engine/youtube.ts:6`) |
| `src/youtube/api.ts:16` | GET `/api/youtube/versions` | `:311` | **no** |
| `src/youtube/api.ts:22` | GET `/api/ytsongs` | `:332` | yes |
| `src/youtube/api.ts:26` | POST `/api/ytsongs` | `:333` | yes |
| `src/youtube/api.ts:31` | PATCH `/api/ytsongs/:id` | `:341` | yes |
| `src/youtube/api.ts:35` | DELETE `/api/ytsongs/:id` | `:355` | yes |
| `src/youtube/api.ts:17` | PUT `/api/ytgrids/:videoId` | `:361` | yes |

**Other**: GET `/api/health` (`:58`), which no client calls. The play test waits on `/api/runs` instead (`scripts/playtest/run.mjs`).
README drift: README's API table lists `POST /api/coach/next` and `/api/coach/chat`, which **don't exist**. It leaves out `profile`, `runs/:id/take`,
`coach/{month,session,tips,showoff}`, `tts` and `stt`.

## 7. Server dependencies that can't run on iOS

| Dependency | Where | Why not on iOS | v1 answer |
|---|---|---|---|
| Claude Code CLI (one-shot) | `server/ai/providers.ts:27-66` (`spawn claude -p … --tools "" --safe-mode`) | no subprocesses; the subscription login lives on the laptop | home server over LAN or Tailscale (D2) |
| Claude CLI long-lived session (stream-json) | `server/ai/session.ts:33-45` | same | same; SSE to the device |
| Anthropic SDK fallback | `server/ai/providers.ts:70-93` | would put an API key on the device (against CLAUDE.md) | server only |
| Prompts read from disk | `server/ai/coach.ts:8-9`, `server/ai/session.ts:14` | — | server only |
| Piper TTS (Python via uv, `.onnx` voices) | `server/tts.ts:10-29`, `server/piper_helper.py` | no Python | `expo-speech`, plus clips rendered on the server and bundled |
| Whisper STT (`uv run --with faster-whisper`) | `server/stt.ts:13-26`, `server/whisper_helper.py` | no uv or Python | server, or on-device recognizer later |
| `better-sqlite3` (native Node addon), WAL | `server/db.ts:1,9-10` | Node addon | `expo-sqlite`, same schema |
| Files: `data/audio/` (backing tracks), `data/tts/`, `data/voices/`, `data/whisper/` | `server/db.ts:5-7`, `server/tts.ts:10`, `server/stt.ts:23` | — | backing audio → `expo-file-system`; the rest stays on the server |
| YouTube Data API v3 (key in `.env`) | `server/youtube.ts:6-16` | the key must stay server-side (CLAUDE.md) | server |
| Fastify, host and origin guard, `127.0.0.1` bind | `server/index.ts:30-38,425` | — | for D2 the server must bind to the LAN/Tailscale interface and take a **token** in place of the Host check |

**Hidden coupling.** The AI routes build their context from the **server's** SQLite, not from the request:
`app` settings (`:121,253,397`), runs (`runRows` `:114`), `plans`, `ai_lessons`, `yt_songs` and `teacherNotes`. If the device is the
source of truth (D3), the device must keep pushing runs, settings and songs to the server, or send that context with each
request. Otherwise the coach writes lessons for a stale student.

**SQLite schema to mirror in expo-sqlite** (`server/db.ts:11-34`):

| Table | Columns (row shape) |
|---|---|
| `charts` | `id TEXT PK, json TEXT (Chart), source TEXT ('import'/'ai'/…), audio_file TEXT?, sync_offset_ms REAL=0, created_at TEXT` |
| `runs` | `id INTEGER PK, chart_id, chart_title, level INTEGER?, started_at TEXT (ISO), duration_s REAL, bpm REAL, speed REAL, accuracy REAL, mean_offset REAL, spread REAL, summary_json TEXT` (+ index `runs_started`) |
| `run_hits` | `run_id INTEGER PK, json TEXT` (`RunTake`: `{beatMs, beats, beatsPerBar, timeSignature, hits: [time, pad, vel][]}`, `src/coach/schemas.ts:117-121`) |
| `settings` | `key TEXT PK, value TEXT (JSON)`; keys `app`, `noteMap.<kit>`, `padCal.<kit>`, `teacherNotes`, `monthReport` |
| `plans` | `id INTEGER PK, json TEXT (Plan), checks_json TEXT='{}', created_at` |
| `yt_search` | `q TEXT PK, json TEXT, at INTEGER` (server cache; not needed on device) |
| `yt_songs` | `id TEXT PK ('yt-<videoId>'), title, original_id, drumless_id?, cover_id?, ts_num INT=4, ts_den INT=4, notes_json TEXT='[]', created_at, verified_at TEXT?` |
| `yt_grids` | `video_id TEXT PK, bpm REAL, offset_sec REAL` |
| `ai_lessons` | `id TEXT PK, json TEXT (Lesson), created_at` |
| `ai_cache` | `key TEXT PK, kind, response TEXT, created_at` (server only) |

The row → API mapping lives in `server/index.ts` (`chartOut` `:50`, `runRows` `:114-120`, `ytSong` `:322-327`). Move these mappers into core
so both sides share them.

## 8. Test inventory

From `npx vitest run` (Vitest, **node environment**, no jsdom: `vitest.config.ts:3`):

| Folder | Files | Tests | Move to core? |
|---|---|---|---|
| `src/engine` | 33 | 272 | **all** (6 of them import `src/content/*`, which is core too) |
| `src/content` | 1 (`curriculum.test.ts`) | 8 | yes |
| `src/coach` | 2 | 13 | `schemas.test.ts` (6) yes; `session.test.ts` (7) no (it imports `session.ts`, which needs React and `fetch`), not until its pure functions are split out |
| `src/input` | 4 | 19 | `fixtures` (3), `hits` (5, after store injection: `hits.test.ts:51` imports `./store`), `kitEmulator` (8), `settings` (3, `migrate`/`serverIsNewer`): all yes |
| `src/ui` | 1 (`soundCheck.test.ts`) | 1 | no (or extract `nudgeLevel`) |
| `src/voice` | 1 | 1 | no |
| `server` + `server/ai` | 6 | 35 | no (server) |
| **Total** | **48** | **349** | **39 files / 305 tests** move to core |

**`scripts/playtest/`.** `run.mjs` is the automated play test (`npm run playtest`). It starts the API on a temporary `DATA_DIR` with the
coach off (`CLAUDE_BIN=/bin/false`), plus Vite and headless Google Chrome. It drives the page over the DevTools protocol, seeds `drumcoach.settings` in
`localStorage` (`run.mjs:82`), and plays lessons with the emulated MPS-150 (Beginner and Solid presets, `:41-42`). Each take must give a
verdict, move the tempo the way it says, and get saved, and the page must not throw. `helpers.js` is the console driver (`window.T`).
It records real-kit fixtures: `T.recordMidi()` then `T.saveFixture(name, note)` (`helpers.js:24-39`, which downloads a JSON).
`emulated-fixture.ts` writes the two emulated fixtures. **None of this runs on iOS** (it's Chrome-only, DOM selectors and `import('/src/…')`).
A9 needs its own harness.

**`src/input/fixtures/`.** Recorded or emulated sessions: `{name, source, noteMap, chart, speed, fromBar, toBar, repeats, latencyMs,
midi: [msAfterBeat0, status, d1, d2][], expect: {minLanded?, maxExtras?, minAccuracy?}}` (`src/input/fixtures.ts:13-19`). Each one replays
through the real input path: note map, bounce filter and crosstalk filter (`hits.ts`), then the matcher (`fixtures.ts:24-39`).
They include 0xF8, 0xFE and poly aftertouch from the emulator. Two exist: `emulated-flam-taps` (1,146 messages) and `emulated-ghost-groove`
(1,581 messages). There are no real MPS-150 recordings yet.

**Replaying fixtures from a Mac to an iPad over Network MIDI (M8).**
1. On the iPad, the app calls `setNetworkSessionEnabled(true)` (S1 module). On the Mac, Audio MIDI Setup → MIDI Network Setup → connect to
   the iPad's session.
2. A small Mac sender, `swift scripts/mobile/replay-fixture.swift <fixture.json>` (CoreMIDI, no npm dependency), or Node with a MIDI
   output package, sends each `[t, s, d1, d2]` to the network destination at `start + t` ms. On the iPad, a dev action starts the fixture's
   chart (same bars and repeats, `latencyMs = 0`) so that beat 0 ≈ `start` plus a known lead-in.
3. The iPad checks `expect` against the take's result. The bytes arrive with **iPad** host timestamps (arrival time), so Wi-Fi jitter
   (a few ms, sometimes tens) can move hits across the 15 ms crosstalk and 60 ms bounce windows. Use this as an **end-to-end smoke test
   of the native path**. The exact assertions stay in Vitest's in-process replay (`replayFixture`), which runs unchanged in core.
   An in-app "replay fixture" dev action (bytes straight into core `receiveMidi` with synthetic host times) covers the simulator (B8).

## 9. Web-only features with no iOS equivalent

| Feature | Where | Reason |
|---|---|---|
| Tab capture of the popup player (drums down, note suggestions) | `src/youtube/tabAudio.ts:24-35`, `public/drum-reducer.js`, `public/band-levels.js` | iOS can't capture another app's or a WKWebView's audio; there's no `getDisplayMedia`/`suppressLocalAudioPlayback` |
| Popup song player window | `src/youtube/SongView.tsx:68`, `public/yt-player.html` | it only exists for tab capture; no windows on iOS |
| AudioWorklet DSP | `tabAudio.ts:35` | it depends on tab capture (and Expo audio has no AudioWorklet) |
| Web MIDI (`navigator.requestMIDIAccess`) | `src/input/useMidi.ts:10,40` | not in Safari or iOS; replaced by S1's CoreMIDI module (B1) |
| `KeyboardEvent` kit fallback | `src/input/keyboard.ts:10-19`, `App.tsx:51-56` | RN has no key events without a native module; use touch pads (and a hardware-keyboard module later) |
| `window.print` (teacher page, sheet) | `src/ui/TeacherView.tsx:41`, `src/notation/index.tsx:19` | no print stylesheet; `expo-print` with HTML is a later option |
| `<a download>` / Blob saves (MIDI, self-check clip) | `src/ui/download.ts:2`, `LessonPlayer.tsx:601`, `PlayMode.tsx:53`, `SelfCheck.tsx:72` | use `expo-sharing` / `expo-file-system` instead |
| `<input type=file>` import of MIDI and audio | `src/content/SongsView.tsx:11-32` | use `expo-document-picker` |
| VexFlow DOM rendering + `document.fonts` | `src/notation/SheetMusic.tsx:4-7,218,362` | needs a DOM/SVG context (see §10) |
| DOM-built SVG art for "How it moves" | `src/ui/demoArt.ts:16-35` | `document.createElementNS`; rewrite with react-native-svg |
| `speechSynthesis`, `MediaRecorder`, `getUserMedia` | `src/voice/voice.ts:76-108`, `src/voice/listen.ts:9-10`, `src/ui/SelfCheck.tsx:24-34` | they have native equivalents (`expo-speech`, `expo-audio`, `expo-camera`), not the same APIs |
| `navigator.userActivation` sound unlock | `src/ui/App.tsx:58-62` | Chrome autoplay policy; iOS needs an AVAudioSession category instead |
| `storage` event cross-tab sync | `src/input/settings.ts:60-63` | there are no tabs |
| Dev console hooks (`drumCoach.emitNote`, `drumCoachSheet`, `drumCoachYt`) | `src/main.tsx:19-21`, `SheetMusic.tsx:298`, `SongView.tsx:38` | use the dev menu or a debug screen |

## 10. Risks (ranked) with mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | **The take engine isn't in the core.** `src/play/player.ts` (358 lines) holds the matcher wiring, wait mode, endless/2-minute takes, free bars, the band and click plans, drift correction and the external clock, all tied to `AudioContext`. A native rewrite would drift from web scoring. | In A1, extract a `createTake({ clock, audio: AudioPort, … })` into core. It schedules events in host ms and is fed hits and position. Web keeps `player.ts` as a thin adapter (`audio()`/`audioToPerf`). Test it with synthetic hit streams and the fixtures. If that's too big for A1, do it first thing in A4, but design the interface in A1. |
| 2 | **Clock mismatch on iOS** (MIDI host time vs audio output time vs YouTube). If it's off, every hit is "late". | Core API in host ms only (§3). The audio port reports beat 0 in host ms (S1/A4 mapping). Measure latency on the iPad. Compare `drift` on device (M5). |
| 3 | **Import-time side effects** in `settings.ts:44,60` and `store.ts:12-18` (they read `localStorage` at import, add a window listener and `fetch` relative URLs), and singletons (`input/settings` is imported by 28 web files). | Core holds pure parts plus `configureCore({ clock, kv, sync })`. Web shims at the old paths keep the web imports unchanged. Make it a lint rule: no globals in `packages/core` (an ESLint `no-restricted-globals` list). |
| 4 | **Moving files breaks the server and tooling.** The server imports core by relative `.ts` path under Node type stripping, which refuses `.ts` inside `node_modules`. Vitest and tsconfig `include` change too. | Import core by relative path, or keep `src/engine/*` shims. Run T0 (`npm test`, `lint`, `build`, `playtest`) after each move. Keep the `.ts` extensions. |
| 5 | **Notation (VexFlow) has no RN renderer.** It's the default play view (`settings.playView: 'sheet'`, `settings.ts:39`). | v1: draw from `engine/notation.ts` `layoutMeasures`/`noteHints` with Skia or react-native-svg plus Bravura glyphs, or run VexFlow in a WebView for static sheets with the highway live. Decide with a spike before A6. |
| 6 | **The coach's context lives in the server DB** (§7). With the device as source of truth, lessons, plans and the session see stale data. | An outbox sync of runs, settings, yt_songs and plan checks to the home server, or move the context builders (`server/index.ts:206-233,394-423`, `server/ai/lessons.ts`) into core and send the context with the request. Plus token auth and a LAN bind (D2). |
| 7 | **Hermes and RN runtime gaps**: zod 4 JIT, `URL.searchParams`, `Intl`, `TextDecoderStream` for SSE (`src/coach/session.ts:99`), streaming `fetch`. | `z.config({ jitless: true })`; a startup self-test screen that runs a few core functions; `expo/fetch` streaming with manual UTF-8 decoding, or fall back to a non-streamed reply. |
| 8 | **Big mixed screens** (`LessonPlayer.tsx` 622, `TodayView.tsx` 506, `PlayView.tsx` 375) hold decision logic (verdicts, next move, tempo ladder calls). Native rewrites will diverge. | Before A7, move view-model logic into core functions or hooks with tests (`lesson/state.ts`, `coach/summary.ts`, the pure parts of `coach/session.ts`). Native screens render only. |
| 9 | **Testing without a kit or keyboard** (B0, B8). CLAUDE.md requires a keyboard fallback for every feature. | Touch pads that call the same `receiveMidi` path; the in-app fixture replay; Network MIDI from the Mac; a hardware-keyboard module later. |
| 10 | **Per-device data**: the kit name changes (`e-Drum` vs `e-Drum MIDI 1`), and so does latency. An imported `noteMap.<kit>`/`padCal.<kit>` won't apply. | On import (D3), copy the laptop's map and cal to the iPad's device name if the user agrees. Always rerun "hit each pad" and latency on the iPad. |

Also stale docs to fix later (not A0's job): `docs/SPEC.md:84-85` lists "mobile apps" as a non-goal; README's lookahead (120 ms vs 200 ms in `player.ts:243`),
its API table and its localStorage list (§5, §6).

## What A1 should do first
1. Create `packages/core` (TS source, no build step) with `platform.ts`: `Clock`, `KeyValueStore`, `SyncClient`. Add an ESLint `no-restricted-globals` rule for it.
2. Move the 35 `src/engine` files, `content/{curriculum,demos,library}.ts` and both `schemas.ts` unchanged. Leave re-export shims at the old paths so web and server stay untouched.
3. Run T0 (`npm test`, `npm run lint`, `npm run build`, `npm run playtest`), and check that `node server/index.ts` still starts under type stripping.
4. Split `src/input/settings.ts`: type, `DEFAULTS`, `migrate`, `serverIsNewer` → core; the `localStorage`/`fetch`/`storage` store stays web.
5. Make `hits.ts` injectable (`now`, `getNoteMap`, `getPadCal`), move it and `fixtures.ts` plus the fixture JSON to core, and keep `store.ts` web.
6. Move the 39 core test files (305 tests) next to their sources. Core Vitest must pass with no DOM and no `performance` global (stub it to prove it).
7. Move the row ↔ API mappers (`chartOut`, `runRows`, `ytSong`) and the SQLite DDL into core, for expo-sqlite (A5) and the server.
8. Write the `createTake` interface (`AudioPort`, beat 0 in host ms, drift, external position) as a typed stub with doc comments, and agree it with A4.
9. Add one core test that drives a fixture through `receiveMidi` with an injected clock offset by 1e9 ms (iOS host time), to prove scoring is clock-agnostic.
10. Report in BOARD.md: core file and test counts, the shims left behind, and anything that didn't move.
