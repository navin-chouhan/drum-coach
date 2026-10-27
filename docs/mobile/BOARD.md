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
| 1 | A1 core, A2 Expo shell, A3 MIDI module, A9 harness skeleton | not started (waits for the gate) | T0 green; core tests green; app on simulator + iPad; kit logs hits |
| 2 | A4 audio/clock, A5 data/backend, A6 play surfaces (+A7 mockups) | not started | Lesson plays + scores + saves on iPad, offline, T6 timing |
| 3 | A7 screens, A8 songs, A6 rest | not started | All v1 screens on iPad landscape + iPhone, with touch pads and kit |
| 4 | A10 QA, then fixes | not started | §8 checklist green or every red item is a blocker |

## Agents
| ID | Status | Owns (exclusive) | Brief | Output |
|---|---|---|---|---|
| A0 Recon | **done, merged** (17ff0c6) | `docs/mobile/RECON.md` only (read-only otherwise) | [briefs/A0.md](briefs/A0.md) | RECON.md |
| S1 MIDI spike | **done, merged** (47c30c0); verdict PENDING the device run | `spikes/midi-probe/**`, `docs/mobile/GATE0.md`, `docs/mobile/GATE0-CHECKLIST.md` | [briefs/S1.md](briefs/S1.md) | GATE0.md, probe app |

**The orchestrator owns** the root `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, this
board, the briefs and the contracts. Root lint and Vitest now ignore `spikes/`, so the probe app can't change web
results.

## Decisions (asked after Gate 0)
| ID | Question | Default / recommendation | Answer |
|---|---|---|---|
| D1 | Go / no-go on Gate 0 | after the device run ([GATE0-CHECKLIST.md](GATE0-CHECKLIST.md)) | — |
| D2 | Where the coach runs | (a) home server over LAN/Tailscale with a token | — |
| D3 | Data | one-time import of `data/`, then the device is the source of truth | — |
| D4 | Mockups | list + designs before A6/A7 build screens | — |
| D5 | v1 scope | Journey, lesson player, Practice, Progress, Setup, Songs with inline YouTube | — |

## Blocker register
| ID | Blocker | State |
|---|---|---|
| B0 | **This run has no Mac, Xcode, iPad or kit** (Linux cloud container). The Swift module can't be compiled and M1–M9 can't run here. | **Open, needs the owner.** S1 delivers the code and the checklist. The owner runs them on the MacBook. |
| B1 | No Web MIDI on iOS; Expo has no built-in MIDI | Mitigated by design: our own CoreMIDI module (S1) |
| B2 | Kit doesn't enumerate on iPad/iPhone | Unknown until M2/M7. Needs the owner's hardware. |
| B3 | Bridge delay / jitter too high | Unknown until M5/M6. Clicks are scheduled natively on host time already (S1), so the Swift click scheduler is the default, not the fallback |
| B4 | MIDI clock vs audio clock | Unknown until M5. `react-native-audio-api` 0.13.6 has no host-time mapping (S1), so A4 plans native host-time scheduling |
| B5 | Expo Go can't load the module | Mitigated: dev client only |
| B6 | One USB-C port on the iPad | Wi-Fi debugging + Metro; maybe a hub |
| B7 | Free Apple ID builds expire in 7 days | Needs the owner: account choice |
| B8 | The simulator can't see the USB kit | Network MIDI (M8), touch pads, fixtures |
| B23 | The probe's Swift has never been compiled; a possible start-up hang (`DispatchQueue.main.sync`) | Open. GATE0.md §5.1 has the fallbacks. The owner pastes back any Xcode errors |
| B9–B19 | see the orchestrator prompt §10 | not yet reached |
| B20 | The server binds 127.0.0.1 and returns 403 for any Host that isn't localhost (`server/index.ts:33-38,425`) | Known (A0). A5 adds a LAN/token mode if D2 = a/c |
| B21 | The take engine (`src/play/player.ts`) isn't in the core, so iOS scoring could drift from web scoring | Known (A0). Phase 1/2 needs a clock-agnostic `createTake` in core with an injected audio interface. Added to A1/A4 scope |
| B22 | The AI routes read the server's own SQLite. With the device as source of truth (D3), the coach sees stale data | Known (A0). Ask with D2/D3: sync runs to the server, or send context with each request |

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
