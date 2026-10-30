# Brief: A4d, Audio and clock design (docs only; the build waits for M5)

## Goal
Write `docs/mobile/AUDIO-DESIGN.md`: the design A4 implements in Phase 2. It covers the metronome (accents,
subdivisions, count-in), backing audio, drum sounds for the touch pads, latency calibration, and the
`AudioPort`/`createTake` contract between the native side and `@drum-coach/core`. Everything is on **one host-time
clock**. **No code** except illustrative snippets in the doc. The orchestrator turns your proposed interfaces into
`contracts.ts`.

## Read first
`CLAUDE.md` (tech defaults: lookahead scheduling; one clock), `docs/mobile/GATE0.md` (§3.2 clock rule, §3.4 why the
click is native, §9 device numbers: output latency 5.7 ms, IO buffer 21.3 ms = 1024 frames at 48 kHz),
`spikes/midi-probe/modules/drum-midi/ios/ClickScheduler.swift` and `HostClock.swift` (they compiled and ran on the
iPad), `src/play/audio.ts`, `src/play/player.ts` (the web take engine: count-in, wait mode, endless takes, drift
correction, backing), `src/engine/calibration.ts`, `docs/mobile/RECON.md` §3 and §10.

## Answer in the doc (with reasons and the current API docs you checked: use web search for AVAudioEngine,
AVAudioSession on iPadOS 26, and the current `react-native-audio-api` capabilities)
1. **Where scheduling lives:** native Swift (AVAudioEngine + `AVAudioPlayerNode.scheduleBuffer(at: AVAudioTime(hostTime:))`)
   versus a hybrid. Cover: the click, accents and subdivisions; backing audio files (decoded, then scheduled at a host
   time and seekable); one-shot drum samples for the touch pads (lowest latency). Recommend one, and say what JS does.
2. **The `AudioPort` interface** (TypeScript) that core's `createTake` uses. Read A1's draft in
   `packages/core/src/play/take.ts` if it exists in the branch; otherwise propose from `player.ts`. It covers schedule
   click(s) at a Clock time, start backing at a Clock time from an offset, stop, output latency, the route, and
   events for interruption and route change.
3. **Audio session:** category (playback, so the mute switch doesn't silence the click: B9), mode, options (mix with
   others? duck?), the preferred IO buffer (5 ms vs the 21 ms seen), sample rate, Bluetooth headphones (latency
   warning), and the module's own sound. Also how to re-measure output latency after a route change.
4. **Interruptions** (call, Siri, alarm), background, screen lock and resume: what happens to a running take
   (abort and keep the take?), and how to restart the engine. Apply the B25 lesson: stale MIDI after resume.
5. **Latency calibration on iPad:** the tap test (as in the probe) feeds the same `latencyMs` as the web. Which offset
   is "heard" (scheduled + outputLatency) vs "scheduled": the M5 result decides. Write both branches.
6. **Drift:** a 5-minute take must not drift. Show why host-time scheduling can't drift relative to MIDI host times,
   and what still can (sample-rate mismatch for long backing files). Give the test that proves it.
7. **The tests A4 must pass** (T6/T7): unit tests for pure scheduling math in TS, Swift-side tests, on-device checks
   for the owner.
8. **Risks and open questions** for the owner (≤ 5).

## Do not touch
Anything except `docs/mobile/AUDIO-DESIGN.md`. Never push. Commit in your worktree; every message ends with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012qCzBwXtPvMyyk6zKAziwn
```
