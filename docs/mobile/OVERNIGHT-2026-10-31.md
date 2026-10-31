# Overnight run, 2026-10-30 → 31 (iPad app)

## Morning summary (read this first)
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
One native test target needed a libc++ link fix (pushed). The newest module, the keyboard, compiles in the next run.

**The session paused from about 23:20 to 10:10 UTC**: the account hit its usage limit and the worker restarted.
Nothing was lost; the four agents of that wave were restarted.

## Needs you
- [ ] **Decide on the `minimatch` advisory** (GHSA-g3hv-75wg-m249, moderate). It's in the web's ESLint toolchain,
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

## Test counts (at the time of writing)
- Web/root: 516 tests with coverage thresholds met; typecheck clean; lint 0; build OK.
- iPad app: 575 tests; `check:versions` OK.
- Dependency gate: all 5 lockfiles pass.

Final numbers are added when the last agents land (I3: lesson/Practice gaps; F1: minor QA fixes; F2: seamless backing
loops).

## Where things are
- Board, with every decision (D0–D9) and blocker: [BOARD.md](BOARD.md).
- QA report: [QA-2026-10-31.md](QA-2026-10-31.md).
- Mockups: `docs/mockups/ipad/`, also at https://claude.ai/artifact/KKKL9ymqagCJK8QLwTpdXV.
