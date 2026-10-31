# Overnight run, 2026-10-30 → 31 (iPad app)

## Day run, 2026-10-31 (read this first)
You asked for as much as possible while you were away. In short:
- **PR #7 is merged into main** (3598af2, all checks green incl. the cloud iOS build). `minimatch` forced to the
  fixed 11.0.3 as you chose (exact young exceptions, remove on 2026-11-04). Later work goes in a new PR.
- **Every web feature the iPad was missing is now ported**, following the web on every doubt:
  - **Journey:** Find my level, the coach's daily lesson and week plan, the Monday recap, badges, notices
    (setup nudge, sore check-in), Beat your best, the all-done cards, "⋯ More", This week, Flow and Stick technique.
  - **Lesson steps:** ear quiz, transcription, "How it moves" steps, intro slides; keyboard H/B/Esc/arrows.
  - **Practice:** Details (the web's full Results), Your take, hear your take, Song sync, intro slides.
  - **Songs:** coach lines and feedback on scored takes, encore share and drum fill, paged sheet.
  - **Progress:** show-off set, Coming up, Your path actions (rebuild mix, reset progress), For your teacher.
  - **Setup:** Coach and voice (goals, minutes, chattiness), the kit test's hit timeline, iPad drum sounds for
    kit hits, the latency hint, and the **API-key coach fallback** (D2: the coach still answers when the home
    server is off; key only in the Keychain and the request header).
- **Three QA passes** (QA1–QA3): every blocker and major fixed; audio now starts on play screens and on return to
  the app, a route change ends a take, the metronome ignores fills, MIDI selection falls back to the e-Drum.
- **YouTube in Release builds:** found that probably every video fails there (error 153: a `file://` page sends no
  origin). Built a small native player (`modules/drum-youtube`, https origin, no media stored) plus "Open in
  YouTube" for refused videos. It compiles and its tests pass in the cloud build; it needs a Release build on the
  iPad to confirm ([YOUTUBE-RELEASE.md](YOUTUBE-RELEASE.md)).
- **Tests now:** root 529 (coverage thresholds met), iPad app 733, lint 0, all 5 lockfiles pass the dependency gate.
- **Layout harness:** `node apps/mobile/scripts/screenshots.mjs --check` renders 63 screen states at 1194×834 in
  Chromium with fake data; every screen fits (lists and scroll areas aside). It found and fixed real bugs: the
  lesson player's pads below the screen, Progress spilling, the warm-up label invisible, placement's cut hand row.
- **Cloud iOS build:** all four native modules compile and their tests pass. Xcode sometimes crashes after the tests
  while saving its results; the script now accepts exactly that case when every test passed.
- **Not done (by decision or size):** voice input to the coach (needs a recording package), PDF printing of sheets,
  the song-audio connection (B13), the Setup progress ring (the mockup replaced it).
- **Your test session:** [FINAL-CHECKLIST.md](FINAL-CHECKLIST.md) now covers all of the above (about 3 hours), plus a
  Release-build YouTube check.

## Morning summary (from the night run)
**Branch:** `claude/drum-coach-expo-ios-x6c1iq`, pushed. **Main** has everything up to Phase 1 (PR #2, merged on
2026-10-30). **PR #7** carries the rest. Its CI is green apart from one check, `npm audit`, which is red because of
a new advisory that isn't ours (below), so it waits for your decision before merging. The web app on Linux is
unchanged, apart from one shared notation fix (triplet rests).

**The whole iPad app is built** and every screen is merged:
- Journey;
- the lesson player (sheet music by default, highway as the alternative);
- Practice (with its play screen, Climb and the metronome);
- Progress (skill map, path, trophies, month report);
- Coach (live session over your home server, feedback, drills, week plan, offline queue);
- Setup (kit, pads, latency per audio output, sound, coach server, API key);
- the 4-step first run;
- **Songs** (inline YouTube, the song clock, Tempo/Learn/Jam/Play/Stage/Sheet modes, MIDI and audio import, backing
  tracks).

Under the screens:
- the shared core runs the take engine, with scores identical to the web's;
- native MIDI is batched, auto-selects `e-Drum` and drops stale messages after a resume;
- native audio is scheduled on the same host clock (click, drums, words, backing tracks with drift correction);
- an app-wide hardware keyboard sends the CLAUDE.md keys into the same hit path as the kit;
- on-iPad SQLite storage;
- the home-server client keeps its token in the Keychain.

**The cloud iOS build compiles the whole app.** It runs on GitHub's macOS runner with Xcode 27.1, the same version
as your Mac, and covers the MIDI and audio modules, backing audio and all the screens. The SwiftPM unit tests pass.
The native unit tests pass too, after a libc++ link fix. Runs 20–22 are green with everything, including the keyboard module
and F2's seamless backing loops (run 22, head 8d3bc07).

**The session paused from about 23:20 to 10:10 UTC**: the account hit its usage limit and the worker restarted.
Nothing was lost; the four agents of that wave were restarted.

## Needs you
- [x] ~~**Decide on the `minimatch` advisory**~~ Done 2026-10-31: forced `minimatch@11.0.3` (plus its new dependency) with exact
      exceptions to remove on 2026-11-04. Was: **Decide on the `minimatch` advisory** (GHSA-g3hv-75wg-m249, moderate). It's in the web's ESLint toolchain,
      dev-only, and it turns `npm audit` red everywhere, `main` included. Either force `minimatch@11.0.3` now with
      an exact "young" exception, as we did for node-forge, or wait until 2026-11-04. PR #7 merges after that.
- [ ] **One test session at the kit:** [FINAL-CHECKLIST.md](FINAL-CHECKLIST.md). It covers the Mac install, the
      hub audio setup, the home server, every screen, the timing comparison with the web, and what to paste back.
      Free Apple ID builds last 7 days.
- [ ] Optional: the home server for the coach, YouTube search and voice. See [HOME-SERVER.md](HOME-SERVER.md).

## Known risks (all need the device)
- YouTube in a Release build: DOM components load from `file://`, which sends no origin, so some videos may refuse
  with error 153. The app shows a clear message when that happens. Dev builds served by Metro are fine.
- Timing feel (count-in, click versus your hits) and the M5 latency branch haven't been measured on the iPad yet.
- Native behaviour: backing at slow speeds, the keyboard module after modals, the audio route switch to the hub.

## Test counts (final, after F2)
- Web/root: 518 tests with coverage thresholds met; typecheck clean; lint 0; build OK.
- iPad app: 614 tests; `check:versions` OK.
- Dependency gate: all 5 lockfiles pass.

All agents have landed: I3 (lesson/Practice gaps), F1 (minor QA fixes: coach exercises now in the charts table, MIDI
debug replay export) and F2 (backing tracks now loop with no gap; listen for the seam with **Loop 1 bar** on the audio
debug screen, CHECKS.md B7). F2's Swift compiles and its native tests pass in cloud iOS run 22.

## Where things are
- Board, with every decision (D0–D9) and blocker: [BOARD.md](BOARD.md).
- QA report: [QA-2026-10-31.md](QA-2026-10-31.md).
- Mockups: `docs/mockups/ipad/`, also at https://claude.ai/artifact/KKKL9ymqagCJK8QLwTpdXV.
