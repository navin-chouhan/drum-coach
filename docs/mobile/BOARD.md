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
| 0 | A0 Recon, S1 MIDI spike | **in progress** | GATE0.md GO + owner decisions D1–D5 |
| 1 | A1 core, A2 Expo shell, A3 MIDI module, A9 harness skeleton | not started (waits for the gate) | T0 green; core tests green; app on simulator + iPad; kit logs hits |
| 2 | A4 audio/clock, A5 data/backend, A6 play surfaces (+A7 mockups) | not started | Lesson plays + scores + saves on iPad, offline, T6 timing |
| 3 | A7 screens, A8 songs, A6 rest | not started | All v1 screens on iPad landscape + iPhone, with touch pads and kit |
| 4 | A10 QA, then fixes | not started | §8 checklist green or every red item is a blocker |

## Agents
| ID | Status | Owns (exclusive) | Brief | Output |
|---|---|---|---|---|
| A0 Recon | running | `docs/mobile/RECON.md` only (read-only otherwise) | [briefs/A0.md](briefs/A0.md) | RECON.md |
| S1 MIDI spike | running | `spikes/midi-probe/**`, `docs/mobile/GATE0.md`, `docs/mobile/GATE0-CHECKLIST.md` | [briefs/S1.md](briefs/S1.md) | GATE0.md, probe app |

**The orchestrator owns** the root `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, this
board, the briefs and the contracts. Root lint and Vitest now ignore `spikes/`, so the probe app can't change web
results.

## Decisions (asked after Gate 0)
| ID | Question | Default / recommendation | Answer |
|---|---|---|---|
| D1 | Go / no-go on Gate 0 | after the device run | — |
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
| B3 | Bridge delay / jitter too high | Unknown until M5/M6 |
| B4 | MIDI clock vs audio clock | Unknown until M5 |
| B5 | Expo Go can't load the module | Mitigated: dev client only |
| B6 | One USB-C port on the iPad | Wi-Fi debugging + Metro; maybe a hub |
| B7 | Free Apple ID builds expire in 7 days | Needs the owner: account choice |
| B8 | The simulator can't see the USB kit | Network MIDI (M8), touch pads, fixtures |
| B9–B19 | see the orchestrator prompt §10 | not yet reached |

## Event log
- 2026-10-27: Board created. Expo `latest` on npm is **58.0.19**. Baseline T0 is running. Root lint/Vitest ignore
  `spikes/`. A0 and S1 briefed and started in parallel.
