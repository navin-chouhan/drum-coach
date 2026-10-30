# Mobile (Expo iPad + iPhone) — board

The orchestrator owns this file. It is updated after every event. The plan is the orchestrator prompt, kept in the
session. The decisions it needs are D1–D5, below.

## Run context
- **Run 1, 2026-10-27.** Claude Code on the web, in a **Linux cloud container** (no Xcode, no Swift toolchain, no iPad,
  no kit). Node 22 is installed here. The plan assumes Node 24 on the Mac.
- **Branch:** `claude/drum-coach-expo-ios-x6c1iq`. The harness assigned it, so it replaces `claude/mobile-expo-<date>`.
  The container is thrown away after the session, so the work is **pushed to that branch**. Nothing is merged to main.
- Sub-agents work in their own git worktrees. The orchestrator merges them into the branch.

## Phases
| Phase | Agents | Status | Gate |
|---|---|---|---|
| 0 | A0 Recon, S1 MIDI spike | **built; waiting for the owner's device run** | GATE0.md GO + owner decisions D1–D5 |
| 1 | A1 core, A2 Expo shell, A3 MIDI module, A9 harness skeleton | **code complete, merged; waiting for the owner's iPad check** ([PHASE1-CHECKLIST.md](PHASE1-CHECKLIST.md)) | T0 green; core tests green; app on simulator + iPad; kit logs hits |
| 2 | A4 audio/clock, A5 data/backend, A6 play surfaces (+A7 mockups) | **in progress**: A4/A5/A6 part 1 merged; A4p2 take engine and A7a screens running | Lesson plays + scores + saves on iPad, offline, T6 timing |
| 3 | A7 screens, A6 rest | not started | All v1 screens on iPad landscape, with touch pads and kit |
| 3b | A8 Songs (inline YouTube) | not started (the phase right after v1, D5) | Songs on iPad landscape |
| 4 | A10 QA, then fixes | not started | §8 checklist green or every red item is a blocker |

## Agents
| ID | Status | Owns (exclusive) | Brief | Output |
|---|---|---|---|---|
| A0 Recon | **done, merged** (17ff0c6) | `docs/mobile/RECON.md` only (read-only otherwise) | [briefs/A0.md](briefs/A0.md) | RECON.md |
| S1 MIDI spike | **done, merged** (47c30c0); device run: step 0, M2, M3 pass; M4–M6, M8 open | `spikes/midi-probe/**`, `docs/mobile/GATE0.md`, `docs/mobile/GATE0-CHECKLIST.md` | [briefs/S1.md](briefs/S1.md) | GATE0.md, probe app |

| A1 Core extraction | **done, merged** (63f08d1) | `packages/core/**` (not `platform.ts`/`package.json`), shims at old paths, delegated minimal edits to root tsconfig/eslint/vitest | [briefs/A1.md](briefs/A1.md) | `@drum-coach/core` |
| A2 Expo shell | **done, merged** (278c5de) | `apps/mobile/**` except A3/A9/contracts paths; `scripts/check-expo-versions.mjs` | [briefs/A2.md](briefs/A2.md) | the app shell |
| A3 MIDI module | **done, merged** (46cded5) | `apps/mobile/modules/drum-midi/**`, `src/platform/midi.ts`, `src/dev/**`, `app/dev/**` | [briefs/A3.md](briefs/A3.md) | production MIDI input + debug screen |
| A9 Test harness | **done, merged** (b4a2363) | `scripts/mobile-playtest/**`, `apps/mobile/e2e/**` | [briefs/A9.md](briefs/A9.md) | T4 references, Mac replayer, Maestro skeletons |

| A5s Home-server mode | **done, merged** (fe907e1) | `server/access.ts`, `server/coachContext.ts`, the access hook, `listen` and coach-route input in `server/index.ts`, `.env.example`, `docs/mobile/HOME-SERVER.md` | [briefs/A5s.md](briefs/A5s.md) | LAN + token, `/api/health`, coach context (B20, B22) |
| A7m iPad mockups | **v2 merged** (web look, iPad layout; 17 frames incl. falling highway); waiting for the owner's review | `docs/mockups/ipad/**` | [briefs/A7m.md](briefs/A7m.md) | 9 screens + PNGs + notes for the owner |
| A4d Audio design | **done, merged** (4467428) | `docs/mobile/AUDIO-DESIGN.md` | [briefs/A4d.md](briefs/A4d.md) | AudioPort + native scheduling design |

| A4 Audio module part 1 | **done, merged** (a5ddb79) | `apps/mobile/modules/drum-audio/**`, `src/platform/audio.ts`, `src/dev/audio/**`, `app/dev/audio.tsx` | [briefs/A4.md](briefs/A4.md) | native host-time audio + AudioPort |
| A5 Data + server client | **done, merged** (94ad37b, with follow-ups) | `src/platform/{storage,api}.ts`, `src/data/**`, `app/dev/server.tsx`, `src/dev/server/**`, apps/mobile package.json (this round) | [briefs/A5.md](briefs/A5.md) | Storage, HomeServer, coach context builder |
| A6 Play surfaces part 1 | **done, merged** (3d6b725) | `apps/mobile/src/play/**`, `app/dev/play.tsx` | [briefs/A6.md](briefs/A6.md) | renderer choice, highway, kit view, touch pads |
| ACI Mobile CI + deps gate | **done, merged** (9acf52b) | `scripts/check-deps.mjs`, `.github/**`, `.githooks/**`, root package.json scripts | [briefs/ACI.md](briefs/ACI.md) | `--project` deps checks, mobile CI job, Dependabot |

| A6n Sheet music | **done, merged** (e1ca412) | `apps/mobile/src/notation/**`, `app/dev/sheet.tsx`, apps/mobile package.json (this round) | [briefs/A6n.md](briefs/A6n.md) | NotationView (VexFlow on iPad) |

| A4p2 Take engine (core) | running | `packages/core/src/play/**` (not audioPort.ts) | [briefs/A4p2.md](briefs/A4p2.md) | createTake, planEvents, createMetronome, parity tests |
| A7a UI kit + nav + Journey | **done, merged** (1a9a884) | `apps/mobile/src/ui/**`, `app/(main)/**`, `src/features/journey/**` | [briefs/A7a.md](briefs/A7a.md) | the screens' foundation |

| ACI2 Cloud iOS build | **done, merged** (e00a272); first run on PR #3 | `.github/workflows/ios.yml`, `apps/mobile/scripts/ci-ios-build.sh` | [briefs/ACI2.md](briefs/ACI2.md) | Swift compiled on macOS runners |
| A1f Core notation fix | **done, merged** (c2147ec) | `packages/core/src/engine/notation.ts` (+test) | [briefs/A1f.md](briefs/A1f.md) | triplet rests |

| A7b Lesson player | running | `app/lesson/**`, `src/features/lesson/**` | [briefs/A7b.md](briefs/A7b.md) | the lesson player |
| A7c Setup + first run | running | `app/(main)/setup*`, `app/welcome/**`, `src/features/{setup,firstRun,latency,pads}/**` | [briefs/A7c.md](briefs/A7c.md) | Setup, first run |
| A7d Practice + Progress | running | `app/(main)/{practice,progress}*`, `app/practice/**`, `src/features/{practice,progress}/**` | [briefs/A7d.md](briefs/A7d.md) | Practice, Progress |
| A7e Coach panel | **done, merged** (490b4ec) | `app/(main)/coach.tsx`, `src/features/coach/**` | [briefs/A7e.md](briefs/A7e.md) | coach panel |
| A8 Songs | running | `app/(main)/songs.tsx`, `app/song/**`, `src/features/songs/**`, `src/youtube/**` | [briefs/A8.md](briefs/A8.md) | Songs + imports |

| A4p3 Backing audio | running | `apps/mobile/modules/drum-audio/**`, `src/platform/audio*` | [briefs/A4p3.md](briefs/A4p3.md) | BackingPort |

**The orchestrator owns** the root `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, this
board, the briefs and the contracts. Root lint and Vitest now ignore `spikes/`, so the probe app can't change web
results.

## Decisions (asked after Gate 0)
| ID | Question | Default / recommendation | Answer |
|---|---|---|---|
| D0 | Devices | — | **iPad only, landscape locked** (`ios.isTabletOnly`). Layouts are width-based so iPhone can be added later. iPhone joins Android under "later". M7 skipped. |
| Dev loop | Where builds and tests run | — | **Build + install on the Mac; Metro and tests on Linux** (owner). Rebuild on the Mac only for native changes or every 7 days. M1 and M8 are done on the Mac during the install session. |
| D6 | Audio (AUDIO-DESIGN §8) | — | **(2026-10-30)** Listening: **USB-C hub, iPad 3.5 mm out → module AUX IN** (click and kit in the module's headphones; latency is measured for that route). **Mix with other apps.** Interrupted take: **keep if ≥ 2 whole bars**, flagged, not counted for the ladder or stars. Calls on the iPad are **Banner** style (`prefersNoInterruptionsFromSystemAlerts` covers declined calls). Offline count-in and tips: **the iPad's built-in voice**. |
| D7 | Home server (A5s) | — | **(2026-10-30)** Plain HTTP on the home Wi-Fi is fine (Tailscale optional, away from home). Coach context cap stays **50 KB**. Web and iPad **share** one live-coach session and one set of rate limits. |
| D8 | Sheet music | — | **(2026-10-30) "Sheet music always"**: in v1, and the default view in the lesson player (Highway is the alternative, as on the web). B15 becomes v1 work: A6n. Highway (the alternative view): the owner has no preference, so **left to right** (it reads the same way as the sheet; A6's default, and falling lanes stay a setting). |
| D9 | Owner away (12 h from 2026-10-30 evening) | — | **Keep going; on any doubt follow the web app's decision; parallelise as much as possible; keep merging to main through green PRs.** |
| D1 | Go / no-go on Gate 0 | after the device run ([GATE0-CHECKLIST.md](GATE0-CHECKLIST.md)) | **Go (owner, 2026-10-30)**, with M4–M6 and M8 still open. They run in parallel with Phase 1; **M5 (jitter) must pass before A4 starts in Phase 2.** |
| Layout | apps/mobile in npm workspaces? | — | **No** (orchestrator): React Native needs the exact React version Expo bundles (19.3.0), and the web uses ^19.3.1. Root workspaces = `packages/*` only. `apps/mobile` is its own npm project and uses `file:../../packages/core` + Metro watchFolders. Shims and server imports use relative `.ts` paths (Node type stripping refuses `.ts` in node_modules). |
| D2 | Where the coach runs | (a) home server over LAN/Tailscale with a token | **Both, server first**: the home server (Claude subscription via the CLI) when reachable, else an optional Anthropic API key in the Keychain. The subscription can't be used from the iPad directly (Anthropic allows subscription logins only in its own apps; no CLI on iOS). The iPad sends compact context with each coach request. |
| D3 | Data | one-time import of `data/`, then the device is the source of truth | **Start fresh on the iPad.** No import tool. `data/` untouched. No sync. |
| D4 | Mockups | list + designs before A6/A7 build screens | **Revised 2026-10-30: "Web look, iPad layout"**: the web app's identity (pink dotted ground, black outlines, hard shadows, yellow, chunky type, mascot, emoji, web kit drawing) on the iPad layouts (one landscape screen, full-screen player, big type, gesture chips). The first version (iPad-native: sidebar, sheets, native controls) at 1194×834 for: Journey, lesson player (take + results), Practice, Progress, Setup (kit, pads, latency, coach), coach panel, touch pad kit, first run. The owner approves them before screens are built. |
| D4✓ | Mockups approved | — | **Approved by the owner 2026-10-30** (v3: web look on iPad layouts, sheet music default). Screens start. |
| D5 | v1 scope | Journey, lesson player, Practice, Progress, Setup, Songs with inline YouTube | **Lean v1**: Journey, lesson player, Practice, Progress, Setup, coach, "Share take" (MIDI export via the share sheet). Songs is the next phase. Later: camera self-check, ear quiz, transcribe, teacher view. |

## Blocker register
| ID | Blocker | State |
|---|---|---|
| B0 | **This run has no Mac, Xcode, iPad or kit** (Linux cloud container). The Swift module can't be compiled and M1–M9 can't run here. | **Open, needs the owner.** S1 delivers the code and the checklist. The owner runs them on the MacBook. |
| B1 | No Web MIDI on iOS; Expo has no built-in MIDI | Mitigated by design: our own CoreMIDI module (S1) |
| B2 | Kit doesn't enumerate on iPad/iPhone | **Cleared on iPad (M2 pass)**: `e-Drum` (Medeli) enumerates over USB-C on iPadOS 26.5 |
| B3 | Bridge delay / jitter too high | Unknown until M5/M6. Clicks are scheduled natively on host time already (S1), so the Swift click scheduler is the default, not the fallback |
| B4 | MIDI clock vs audio clock | Unknown until M5. `react-native-audio-api` 0.13.6 has no host-time mapping (S1), so A4 plans native host-time scheduling |
| B5 | Expo Go can't load the module | Mitigated: dev client only |
| B6 | One USB-C port on the iPad | Wi-Fi debugging + Metro; maybe a hub |
| B7 | Free Apple ID builds expire in 7 days | **Decided: free Apple ID for now**, reinstall weekly. Revisit (paid, TestFlight) once in daily use |
| B8 | The simulator can't see the USB kit | Network MIDI (M8), touch pads, fixtures |
| B23 | The probe's Swift has never been compiled; a possible start-up hang | **Cleared**: compiled first time with Xcode 27.1, no hang. A launch crash came from Expo's own package versions (fixed: expo 58.0.20) |
| B24 | Bridge delay p95 40–59 ms in the debug build (M6 target < 20) | Open. Re-measure in a Release build; batch events per frame in A3. Scoring unaffected (host time) |
| B25 | MIDI queued while backgrounded arrives on resume with old timestamps | Open, for A3: drop stale messages after a resume |
| B26 | `npm audit` in apps/mobile: 9 findings (4 high), all in Expo CLI dev tooling (node-forge ≤ 1.4.0, zod < 4.6.6 nested under expo, deepmerge low); nothing ships in the app | Open. The fix node-forge 1.4.2 is < 7 days old. **On 2026-11-03:** add `overrides` (node-forge 1.4.2, zod ^4.6.7) in apps/mobile, wire `npm audit` for apps/mobile into CI, and remove the 44 `young` entries from `spikes/midi-probe/deps-allow.json` (expo 58.0.20 set, all ≥ 7 days by then) |
| B9–B19 | see the orchestrator prompt §10 | not yet reached |
| B20 | The server binds 127.0.0.1 and returns 403 for any Host that isn't localhost (`server/index.ts:33-38,425`) | Known (A0). A5 adds a LAN/token mode if D2 = a/c |
| B21 | The take engine (`src/play/player.ts`) isn't in the core, so iOS scoring could drift from web scoring | Known (A0). Phase 1/2 needs a clock-agnostic `createTake` in core with an injected audio interface. Added to A1/A4 scope |
| B22 | The AI routes read the server's own SQLite. With the device as source of truth (D3), the coach sees stale data | **Resolved by D2**: the iPad sends compact context with each coach request (the same payload for the server and API-key paths). A5 adds request-context support to the coach routes |
| B18 | Data migration from `data/` | **Closed by D3** (start fresh) |
| B16 | Screen rewrite size | Reduced by D0 (one layout) + D5 (lean v1). Fresh iPad-native mockups (D4) add review rounds |

## Event log
- 2026-10-27: Board created. Expo `latest` on npm is **58.0.19**. Baseline T0 is running. Root lint/Vitest ignore
  `spikes/`. A0 and S1 briefed and started in parallel.
- 2026-10-27: A0 finished. RECON.md was reviewed (docs only) and merged. Core = 44 TS files + 2 fixtures; 39 test
  files move with it. Blockers live in `src/input` (store/settings use localStorage and fetch; `performance.now()`
  default) and `content/charts.ts`. Three new blockers are logged (B20–B22).
- 2026-10-27: S1 finished. M1–M9 renumbered to the plan on request (47c30c0), then merged. No ready-made module
  qualifies (none puts MIDI and click times on one clock), so we use our own `drum-midi` module (CoreMIDI
  `MIDIInputPortCreateWithProtocol(._1_0)`, host-time clock, Network MIDI, native host-time clicks). Expo SDK 58.0.19,
  RN 0.88.0. Spike: tsc clean, 47/47 tests; prebuild + autolinking OK. **T0 after the merge: 349/349 tests, build OK,
  lint 310 (the same as the baseline).** Run stopped at Gate 0: waiting for the owner's device run and D1–D5.
- 2026-10-27: Owner decisions: iPad only + landscape (D0), free Apple ID (B7), coach = home server first with an
  API-key fallback (D2), start fresh (D3), fresh iPad-native mockups (D4), lean v1 + Share take with Songs next
  (D5). D1 waits for the device run. M7 is marked skipped in the checklist.
- 2026-10-27: Owner dev loop: Mac to build/install, Linux for Metro and the kit tests (checklist section A2).
- 2026-10-28: Device run day 1 (owner, MacBook Air on macOS 27.2 with Xcode 27.1; iPad M1 on iPadOS 26.5). Step 0 passes
  after the expo 58.0.20 fix. M2 passes (every note, choke, note-off, bounce filter, clock filtering). M3 passes
  (all changes in under 2 s). M4 is in progress; M5, M6 and M8 are still to do. Resume next session.
- 2026-10-30: Owner: start Phase 1. Orchestrator: root workspaces `packages/*`, `packages/core` skeleton +
  `platform.ts` contract, `apps/mobile/src/platform/contracts.ts` (MidiPort, KeepAwake, Capabilities), root lint and
  Vitest ignore `apps/`. T0 unchanged (349/349, build OK, lint 310). Briefs A1, A2, A3, A9 written. All four started
  in parallel. A3 does part 1 (native) first; part 2 (TS glue + debug screen) after A1 and A2 merge.
- 2026-10-30: Owner asked for more parallel work. Added A5s (home-server mode, pulled forward), A7m (iPad mockups) and
  A4d (audio design, docs only). 7 agents running.
- 2026-10-30: **Rebased onto main** (83cff46: security and quality pipeline). Fix-ups: vitest config conflict
  markers, `packages/core/src` added to the root tsconfig (type-aware lint), and `scripts/check-deps.mjs` accepts this
  repo's own private workspaces (packages/*: their dependency specs are checked, the link isn't a download). Main's
  rules now apply to all mobile work: `npm run check` must pass; dependencies stable, ≥ 7 days old, registry only, no
  install scripts, exceptions as exact name@version with a reason; render text only; spawn with `childEnv()`; the API
  stays behind `server/guard.ts`. T0 after the rebase: typecheck clean, lint 0 problems (max-warnings 0), 358/358
  tests, coverage thresholds met, build OK, deps:check OK. The pre-rebase branch is kept locally as
  `backup/pre-rebase-1030`.
- 2026-10-30: A3 part 1 done (native batching, select by name, resume marks; 42 TS tests; Swift uncompiled). Held
  for the merge order. A4d merged: AUDIO-DESIGN.md recommends our own `drum-audio` Expo module (AVAudioEngine, player
  node pools, host-time scheduling, a native 120 ms scheduling window, JS plans 2–4 s ahead). No new npm dependency:
  `react-native-audio-api` fails the dependency rule (0.x, downloads binaries at pod install). Five owner questions
  (listening setup, mixing with other apps, interrupted takes, call banners, offline count-in voice) are queued for
  the Phase 2 gate.
- 2026-10-30: A2 merged out of order (no file overlap with A1, nothing depends on A1 but a guarded optional
  require). It uses the newest **Expo SDK set where every package is ≥ 7 days old: expo 58.0.17**, RN 0.88.0,
  expo-modules-core 58.0.24, pinned exactly per bundledNativeModules. This set has never run on the iPad (Gate 0 ran
  58.0.20). There are 4 exceptions in `apps/mobile/deps-allow.json` (react-native and react-native-worklets 0.x,
  fsevents install script, gensync prerelease). A3 part 1 merged after it. T0: typecheck, lint 0, 358/358, build,
  deps:check all pass; apps/mobile: tsc clean, 54 passed + 1 skipped (waits for core), check:versions OK. A9 done
  (reference scores: flam taps 32/32, mean 7.4 ms; ghost groove 136/136, mean 20.1 ms), held until after A1. A5s
  done (token access inside guard.ts, `/api/health`, coach context on 5 routes, 23 tests). Review asked for two
  hardening changes. `npm audit signatures` can't download keys in this container; plain `npm audit` reports 0.
- 2026-10-30: A5s merged after review fixes (proxied requests always need the token; `HOST` → `APP_HOST`). T0:
  383/383, typecheck, lint 0, coverage, build OK. The owner asked for more parallel work. Contracts added:
  `packages/core/src/play/audioPort.ts` (from AUDIO-DESIGN §2.1; `drum.${string}` until A1 lands PadId) and
  `HomeServer`/`Storage` in `apps/mobile/src/platform/contracts.ts`. Started A4 (audio part 1), A5 (data + server
  client), A6 (play surfaces part 1) and ACI (mobile CI + deps gate). 7 agents running: A1, A7m, A4, A5, A6, ACI
  (+ A3 part 2 after A1).
- 2026-10-30: **A1 merged**: `@drum-coach/core` has 47 source files + 2 fixtures and 42 test files (327 tests run
  alone, without `performance`); 35 engine shims plus content/schemas/fixtures shims at the old paths; engine coverage
  threshold moved unchanged. A9 merged after it. Its **reference scores are identical after the move** (flam taps
  32/32, mean 7.4 ms; ghost groove 136/136, mean 20.1 ms). A7m mockups merged. Integration fixes: A9's fixture dir
  now points to the core folder; the mockup renderer became ESM (`render.mjs`, lint 0). `AudioPort` now uses
  `PadId`; A1's `take.ts` draft is marked superseded by `audioPort.ts` and AUDIO-DESIGN §2.3. T0: typecheck, lint
  0, 408/408 tests (54 files), build, deps:check, `reference.ts --check`, mobile-playtest `node --test` 24/24;
  apps/mobile tsc + 55 tests. **Phase 1 code is complete apart from A3 part 2.**
- 2026-10-30: ACI merged. `check-deps --all` checks the root and every sub-project lockfile; there's a CI `mobile` job;
  Dependabot covers apps/mobile (no expo/react/react-native majors). Orchestrator added `.npmrc` (ignore-scripts,
  min-release-age, no git) and `deps-allow.json` to spikes/midi-probe (44 temporary `young` entries for its verified
  expo 58.0.20 set, until 2026-11-03), spikes/midi-probe/tools and scripts/mobile-playtest (`@julusian/midi`
  install script: ships prebuilds). `noxcturnal` (new, in both Expo sets) checked: Expo's own package
  (github.com/expo/noxcturnal, maintained by an Expo engineer). `mobile:test` reinstalls only when node_modules is out
  of date. All 5 lockfiles pass; T0 green. B26 opened for the apps/mobile audit findings.
- 2026-10-30: A3 part 2 merged: `createMidiPort`/`getMidiPort` (one native subscription, auto-select e-Drum),
  `connectMidiToHitBus` (one framer per connection, stale drop > 250 ms within 1 s of a foreground or while
  backgrounded), and the MIDI debug screen (`dev-midi-devices`, snapshot redraw 4×/s, on-screen pads through the same
  path). Both fixtures replayed as native batches on a shifted host clock give exactly the web hits. apps/mobile: 77
  tests; root: 422 tests, typecheck/lint clean. **Phase 1 code complete.** The gate needs the owner's iPad run: the
  first compile of the new Swift; checklist in PHASE1-CHECKLIST.md. Still running: A4, A5, A6.
- 2026-10-30: A5 merged: expo-sqlite storage mirroring server/db.ts (versioned, WAL, kv store with the web's keys),
  HomeServer (token only in the Keychain, scrubbed from errors, no Origin, typed failures), coach-context builder
  (≤ 50 KB, checked against the server's own schema), /dev/server. Added expo-sqlite 58.0.13 and expo-secure-store
  58.0.2 (both ≥ 7 days, no install scripts). Orchestrator fixes: root `.gitignore` `data` → `/data` (it hid
  apps/mobile/src/data); the CI mobile job also runs the root `npm ci` (parity tests use the root's zod). apps/mobile:
  141 tests, check:versions OK; root: 422 tests, lint 0; all 5 lockfiles pass. A5 follow-ups: capabilities uses the
  token health check, home links to the dev screens, core imports replace the schema copies, SSE coach session via
  `expo/fetch` streaming.
- 2026-10-30: A6 part 1 merged: NoteHighway (scrolls on the UI thread; direction, lane order and colours
  configurable; defaults follow the mockups), KitView, TouchPads (velocity auto/fixed/centre, hi-hat closed by
  default), /dev/play. Renderer: Reanimated 4 + views now. `@shopify/react-native-skia@2.14.0` passes the rules (no
  install scripts; prebuilt binaries from an npm package, ~750 MB in node_modules); add it only if the iPad
  smoothness check fails. apps/mobile 193 tests; root 422. Follow-up: local ChartLike/PadId → core imports.
- 2026-10-30: Owner reviewed the mockups: the iPad-native look lost the app's character. **D4 revised to "Web look,
  iPad layout".** A7m is redrawing all 16 frames, plus a falling-highway frame for comparison. A6's components
  already switch to the web theme and falling lanes; KitView/TouchPads follow the new mockups once approved.
- 2026-10-30: A5 follow-ups merged (core schemas where they exist; the token health check; home links to
  /dev/{midi,server,audio,play}; `HomeServer.stream` for SSE over expo/fetch, now in contracts.ts). A4 part 1 merged:
  the `drum-audio` module (10 ms DispatchSourceTimer on a userInteractive queue, 120 ms window, late events dropped
  and never played late, player-node pools click/drums/band/voice, synthesized click and drum velocity layers cached
  on first use, words via AVSpeechSynthesizer with onset detection like the web, ducking), `AudioPort` on iOS
  unchanged, /dev/audio, CHECKS.md D1–D3 for the owner. Integration: the tightened `SoundId` (drum.${PadId}) flagged
  3 spots, now fixed. audioPort docs: playNow → NaN when nothing plays; stats.dropped includes malformed events.
  apps/mobile 299 tests; root 422; lint 0. Open: drum-midi's ClickScheduler still sets the audio session (two
  session owners, AUDIO-DESIGN §3.6); A3 is removing it from the app module (the spike keeps it).
- 2026-10-30: A3 follow-up merged: drum-midi's ClickScheduler and audio functions removed from the app module
  (drum-audio is the only audio-session owner; the spike keeps its own). apps/mobile 299 tests.
- 2026-10-30: A7m v2 merged: all screens redrawn in the web look on the iPad layouts. A black sidebar replaces the
  web's top bar (landscape is short on height); the full-screen player keeps a black top bar; the kit is drawn in
  the web kit's style. The kick is white and the floor tom brown, so no drum colour reads as a result colour (green,
  orange, red). A `lesson-take-falling` frame is there to compare highway directions. `mock.js` lint fix (an unused
  constant; it exports its drawing functions on window). The gallery artifact is republished.
- 2026-10-30: Owner answered the 5 audio and 3 home-server questions (D6, D7): all defaults; the listening setup is
  the hub + AUX IN route. Nothing built needs to change; A4 part 2 uses them (route-keyed latency, keep-if-2-bars).
- 2026-10-30: Owner: "sheet music always" (D8). Started A6n (sheet music on the iPad) and an A7m follow-up (sheet frames).
- 2026-10-30: Owner doesn't mind the highway direction: left to right (matches the sheet), falling lanes stay a setting.
- 2026-10-30: PR #2 (branch → main). Dependency review failed on 3 advisories, all in Expo CLI dev tooling. Owner
  approved: **node-forge forced to 1.4.2** (fixed, 3 days old: exact `young` exception in apps/mobile/deps-allow.json
  until 2026-11-03), and **zod 3.x under @expo/cli (GHSA-mrhx-c7xc-m3w5) and deepmerge (GHSA-gcqx-w48m-w2h4)** listed
  in Dependency review's `allow-ghsas` with reasons, because no fixed release exists. Remove each when Expo ships a
  fix (B26).
- 2026-10-30: **PR #2 merged into main** (aa2b828) after CI was green (Check Node 22/24, Mobile, CodeQL, secret
  scan, dependency review, npm audit + signatures, workflow lint). The branch is fast-forwarded to main and carries
  on. Owner **approved the mockups**. Started A4p2 (take engine in core) and A7a (UI kit + nav + Journey). Next
  screen agents start on top of A7a's kit.
- 2026-10-30: A6n merged: NotationView = VexFlow 5 inside an Expo DOM component (`@expo/dom-webview` 58.0.2, already
  autolinked, so no new native code); embedded in Release builds (offline); the cursor runs on the WebView's own
  frames from a Clock offset (short round trips every 2 s); results pushed as they arrive; the log replays after a
  WebView reload. Added `vexflow` 5.0.0 and `react-native-web` 0.21.4 (needed by the dev DOM bundle; zeroMajor
  exception). Props mirror NoteHighway. apps/mobile 312 tests; root 422; lint 0; all lockfiles pass. Found a core
  notation bug (web too): an empty voice in a triplet beat gets a dotted-8th rest (layoutMeasures).
- 2026-10-30: **Owner: build the complete app; the owner tests the final app** (no device gates between phases).
  Mitigation for the never-compiled Swift: a cloud iOS simulator build on GitHub's macOS runners (ACI2).
- 2026-10-30: Owner away 12 h (D9). Screen agents A7b–A7e and A8 started on their models (part 1); they get the UI kit when A7a commits it.
- 2026-10-30: A7a part 1 (UI kit, sidebar, placeholders incl. songs) merged early so the screen agents can build on it.
- 2026-10-30: ACI2 merged: `.github/workflows/ios.yml` on the `xcode-27` runner (Xcode 27.1, the owner's build), prebuild + xcodebuild for the iPad simulator + Swift unit tests; triggers: dispatch and PRs to main touching apps/mobile. `.github/actionlint.yaml` declares the new hosted label actionlint doesn't know yet.
- 2026-10-30: A7a merged (Journey on core + Storage; nav = js-tabs drawn as the sidebar; old home → /about; Dev row in debug). Integration notes sent: lesson route `/lesson/[id]?item=N&mode=play|hear|jam` + `markDonePatch` (A7b); skill map / full path in Progress (A7d); one source for drum colours (follow-up).
- 2026-10-30: A8 granted src/data schema/store edits (songs migration 2) and expo-document-picker + expo-file-system. Started A4p3 (backing audio) so imported tracks can play.
- 2026-10-30: A7e merged (coach panel + Coach tab; expo-speech 58.0.3; voice input left for later, as the web needs STT). Requests forwarded: A7b mounts CoachInspector on results + handles /lesson/chart?chartId=&bpm=; A8 opens /song/<id> from plan items.
