# Mobile run 1, 2026-10-27 (stopped at Gate 0)

## Morning summary (read this first)
**Branch:** `claude/drum-coach-expo-ios-x6c1iq`, pushed. This run was in a cloud container that is thrown away
afterwards, so unpushed work would be lost; that's why it was pushed. Nothing is merged to main. `data/` was never
touched. **The web app is unchanged: 349/349 tests, the build is clean, lint 310 problems (the same as before).**

This run was **Claude Code on the web in a Linux container**, not on the MacBook. There is no Xcode, no Swift compiler,
no iPad and no kit here. So Phase 0 got as far as it can without hardware:
- **A0 Recon is done:** [RECON.md](RECON.md).
- **S1 MIDI spike is done:** a probe app in `spikes/midi-probe/` with our own CoreMIDI module, the
  [GATE0.md](GATE0.md) design and assessment, and a printable [GATE0-CHECKLIST.md](GATE0-CHECKLIST.md).
- **The Gate 0 verdict is PENDING.** It needs you at the kit with the MacBook and the iPad (about 60–90 min the first
  time). Nothing in Phase 1 starts before that.

**Done (commits)**
- c9d998a, 7778540: the board, the A0/S1 briefs, root lint/Vitest ignore `spikes/`, worktrees ignored.
- 17ff0c6 (A0): RECON.md. The core = 44 TS files + 2 fixtures, and 39 test files move with it. Every browser-API
  use is listed with file:line. There are 37 server routes, 35 used by the client. 44 `.tsx` files, about 12 screens.
- S1, 7 commits ending in 47c30c0:
  - `spikes/midi-probe`: Expo SDK 58.0.19 / RN 0.88.0, dev client.
  - The local `drum-midi` module (Swift): CoreMIDI `MIDIInputPortCreateWithProtocol(._1_0)`, hot-plug, a mach
    host-time ms clock, Network MIDI, and clicks scheduled natively on host time (`AVAudioPlayerNode` at
    `AVAudioTime(hostTime:)`).
  - The probe screen: devices, a live log, filter counters, bridge-delay stats, a 32-tap test at 120 BPM, and
    "Copy results" JSON.
  - A Mac-side fixture replayer for M8.
  - The shared TS path (framing, UMP unpack, the parser copied from `src/engine/midi.ts`) has a parity test. It gives
    the same hits as the web `receiveMidi` on both fixtures.

**Findings that change the plan**
- **No ready-made MIDI module qualifies.** The closest, `react-native-midi-api` 0.2.0, moves host times onto
  `performance.now()` with a one-time offset. So we use our own module.
- **`react-native-audio-api` (0.13.6) can't map its clock to host time.** So the click is scheduled in Swift from
  the start. A4 builds the metronome natively, or as a hybrid.
- **The take engine (`src/play/player.ts`) isn't in the core.** It has to become a clock-agnostic core API, or iPad
  scores could drift from web scores (B21).
- **The server only accepts localhost** (B20), and **the coach reads the server's own database** (B22). Both are tied
  to D2/D3.

**Test counts:** web 48 files / 349 tests pass; spike 8 files / 47 tests pass; spike `tsc` clean; `expo prebuild` iOS
OK with `drum-midi` autolinked; expo-doctor 18/20 (the 2 failures are network checks blocked in the container).

**Blockers** (full register in [BOARD.md](BOARD.md)):
- B0: no Mac or devices in this run.
- B23: the Swift has never been compiled. There is a possible start-up hang, with a one-line fallback in GATE0.md §5.1.
- B2–B4: the kit enumerating on the iPad, jitter, and the clock mapping are all unmeasured.
- B7: Apple ID type.
- B20–B22: from the recon.

## What needs you
- [ ] On the MacBook: `git pull`, then work through [GATE0-CHECKLIST.md](GATE0-CHECKLIST.md): step 0 (build), then
      M1–M8, and M9 if you have a Bluetooth adapter.
- [ ] Paste back the "Copy results" JSON per device, the filled checklist (with the Linux Chrome latency numbers for
      M5), and any Xcode errors verbatim. If you paste compile errors, I fix them and you re-run.
- [ ] **D1** Go / no-go, after the device run.
- [ ] **D2** Where the coach runs: (a) home server over LAN/Tailscale with a token *(recommended)*, (b) fully on
      device with an API key, or (c) hybrid.
- [ ] **D3** Data: a one-time import of `data/`, then the device is the source of truth *(default)*. Also say how the
      coach should see iPad runs (B22): sync runs to the server, or send context with each request.
- [ ] **D4** Mockups: OK to draw the screen list at 1194×834 and 393×852 in Phase 2?
- [ ] **D5** v1 scope: Journey, lesson player, Practice, Progress, Setup, and Songs with inline YouTube *(default)*?
- [ ] B7: a free Apple ID (re-install every 7 days) or a paid account?
