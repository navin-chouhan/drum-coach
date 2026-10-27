# Gate 0: MIDI into an Expo dev build on iPad / iPhone

**Verdict: PENDING — needs the owner's device run.**

Pre-run assessment: **GO to the device run, medium risk.** Everything that can be checked without a Mac is green
(TypeScript, 47 unit tests, prebuild + autolinking). The open risks are all device-only: the Swift has never been
compiled, and the kit's USB enumeration on the iPad and the click/host-time mapping are unmeasured. Each one has a
row in [GATE0-CHECKLIST.md](GATE0-CHECKLIST.md) and a branch in the decision tree below.

Written by S1 on 2026-10-27 in a Linux cloud container: no Xcode, no Swift compiler, no simulator, no iPad, no kit.
**No result in this file comes from a device.**

---

## 1. Module search

Judged on: Expo Modules API + New Architecture, maintenance, raw bytes, host timestamps (not JS receive time),
hot-plug, licence. Sources: npm registry metadata, the published tarballs (native code read directly), GitHub pages.

| Package | Version / last publish | API | Raw bytes | Host timestamps | Hot-plug | Network MIDI | Licence | Notes |
|---|---|---|---|---|---|---|---|---|
| `react-native-midi-api` (Odisei-Music) | 0.2.0, 2026-09-01 (3 releases since 2026-06) | Expo Modules API, Web MIDI surface | Yes, one event per message (native UMP decode) | **Partly.** Native sends mach host ms, but JS converts it to `performance.now()` with a one-time offset taken at import (round-trip error, and drift if the two clocks diverge, e.g. after sleep). Packet timestamp 0 is not mapped to "now". No native clock function exposed in the public API. | Yes (device added/removed) | No | MIT | Best candidate. Modern CoreMIDI (`MIDIInputPortCreateWithProtocol`). GitHub repo returned 404 to us (private or moved), so open issues couldn't be checked. Young, one company. |
| `react-native-nitro-midi` (raycaster-io) | 0.1.0, 2026-08-24 | Nitro Modules (not Expo Modules), Rust `midir` core over C ABI | Yes | **No**: README says "arrival time (no host-time conversion on iOS)" | Yes | Yes (`MIDINetworkSession`) | MIT | Needs a Rust toolchain in the Xcode build. Timestamps disqualify it. GitHub repo 404 to us. |
| `@motiz88/react-native-midi` | 0.0.6, 2023-11-25 | Expo Modules API, Web MIDI surface | Yes | **No / wrong**: divides raw mach ticks by 1e6 as if they were ns (on Apple silicon a tick is 125/3 ns) | Partly | No | MIT | Abandoned (2 years, 4 open issues, 1 open PR, no releases). Deprecated `MIDIInputPortCreate`. |
| `react-native-midi` (ShavaShav) | 0.0.3, 2022-05-14 | Old bridge | Android only | — | — | — | Apache-2.0 | iOS not implemented. |
| `expo-midi`, `react-native-midi-module` | — | — | — | — | — | — | — | Not on npm (404). |
| Expo blog "MIDI over Bluetooth with Expo Modules" (Oct 2025) | tutorial, not a package | | | | | | | Reference only. |

**Verdict: none fully qualifies.** The deciding gap is the clock: the app needs MIDI timestamps and click times on
**one** native monotonic clock, and none of the packages exposes that (react-native-midi-api comes closest but
re-bases to `performance.now()` once, at import). Network MIDI is also missing from the Expo-API candidates.

**Recommendation: our own small local module** (`spikes/midi-probe/modules/drum-midi`, ~550 lines of Swift with comments), which
is what the probe uses. Don't adopt `react-native-midi-api`; if A3 wants to save effort, vendor ideas from it (its
packet-walking code and SysEx reassembly are sound), not the package.

## 2. Versions (pinned in `spikes/midi-probe/package.json`, exact)

| Package | Version | Source |
|---|---|---|
| `expo` | **58.0.19** | npm `latest` on 2026-10-27 (verified) |
| `react-native` | **0.88.0** | `expo/bundledNativeModules.json` for SDK 58 (npm `latest` is 0.88.1; SDK 58 pins 0.88.0) |
| `react` | 19.3.0 | create-expo-app blank-typescript template for SDK 58 |
| `expo-dev-client` | 58.0.15 | bundledNativeModules (`~58.0.15`) |
| `expo-clipboard` | 58.0.4 | bundledNativeModules |
| `expo-status-bar` | 58.0.4 | template |
| `expo-modules-core` (transitive) | 58.0.26 | lockfile |
| `typescript` / `@types/react` | 6.0.3 / 19.3.0 | template |
| `vitest` (dev) | 5.0.5 | same major as the root |
| `react-native-audio-api` | 0.13.6 (npm `latest`, 2026-10-27) | **not installed**: not in SDK 58's bundled list, and not used (see §3.4). Peer: `react-native-worklets >= 0.7` (SDK 58 bundles 0.13.0). |
| `@julusian/midi` (Mac tool only) | 3.8.1, 2026-08-10 | `spikes/midi-probe/tools/package.json`, prebuilt binaries for darwin arm64/x64 |
| iOS deployment target | 16.4 | `ExpoModulesCore.podspec` minimum for SDK 58 |
| Node on the Mac | 22+ works (the container ran 22.22); the plan assumes 24 | |

Scaffolded with `npx create-expo-app@latest --template blank-typescript` (create-expo-app 5.0.0), then
`EXPO_OFFLINE=1 npx expo install expo-dev-client expo-clipboard` (the container can't reach api.expo.dev).

## 3. Design

### 3.1 Module API (`modules/drum-midi/index.ts`, JS name `DrumMidi`)

| Call | Returns | Notes |
|---|---|---|
| `listInputs()` | `{ id, name, manufacturer, online }[]` | `id` = `kMIDIPropertyUniqueID`. Sources seen earlier but gone are kept as `online: false`. |
| `select(id \| null)` | `boolean` (connected) | Idempotent. Remembers ID **and name**. |
| event `onInputsChanged` | `{ inputs }` | On every CoreMIDI setup/object/property notification. |
| event `onMidi` | `{ bytes: number[], hostTimeMs, nativeReceivedMs }` | **One event per CoreMIDI packet.** `bytes` may hold several messages: TS frames them. |
| `nowMs()` | `number` | `mach_absolute_time()` → ms via `mach_timebase_info`. Same base as `hostTimeMs`. |
| `setNetworkSessionEnabled(bool)` | `boolean` | `MIDINetworkSession.default()`: policy `.anyone` set **before** enabling. |
| `scheduleClicks(startHostTimeMs, bpm, count, accentEvery)` | `{ scheduledHostTimesMs, outputLatencyMs, ioBufferMs, sampleRate, route }` | See 3.4. |
| `stopClicks()`, `getAudioInfo()`, `getDebugInfo()` | | Debug info: connect/disconnect counts, packets, packets with timestamp 0, timebase, network session name. |

Off iOS (`Platform.OS !== 'ios'`, Expo Go, a build without the module) `requireOptionalNativeModule` gives null and
every call degrades: `[]`, `false`, `performance.now()`, a rejected promise, a no-op subscription.
`expo-module.config.json` lists only `apple`, so Android never tries to link it.

### 3.2 The clock rule

**Every time in the app is `DrumMidi.nowMs()` milliseconds** (mach host time). CoreMIDI packet timestamps and
`AVAudioTime(hostTime:)` use the same ticks, so a hit's `hostTimeMs` and a click's scheduled time are directly
comparable, with no JS timing in between. `performance.now()` is never mixed in on iOS. A packet timestamp of 0
("now") becomes the receive time (`mach_absolute_time()` at the top of the receive block) and is counted
(`zeroTimestampPackets`). Note: on Apple silicon a mach tick is 125/3 ns, so ticks must go through the timebase.
mach time stops while the device sleeps; harmless, because nothing compares it with a wall clock.

For the web core (A1): this is the same contract as the web app's "`performance.now()` = `MIDIMessageEvent.timeStamp`"
clock; the core only needs "one monotonic ms clock" injected.

### 3.3 CoreMIDI choices

- **Client:** `MIDIClientCreateWithBlock`, created on the **main thread** (`DispatchQueue.main.sync` from the JS
  thread on first use) so notifications have a run loop whichever delivery CoreMIDI uses. The notify block handles
  `msgSetupChanged`, `msgObjectAdded`, `msgObjectRemoved`, `msgPropertyChanged` (offline flag): re-list, reconnect the
  selected source (by unique ID, else by **name**, since a replugged device may get a new ID), emit `onInputsChanged`.
- **Input: `MIDIInputPortCreateWithProtocol(._1_0)`** (UMP event lists), not the legacy packet-list block.
  Why: the legacy `MIDIInputPortCreateWithBlock`/`MIDIPacketList` API is deprecated since iOS 14; with protocol 1.0
  every UMP word is one complete MIDI 1.0 message (CoreMIDI already resolves the device's running status and splits
  realtime bytes into their own words), so turning words back into bytes is a **fixed unpack by message type, not a
  parser** (`ios/UmpUnpack.swift`, ~60 lines, mirrored and unit-tested in `src/shared/umpUnpack.ts`). The unpacked
  bytes of one packet are concatenated and **framed in TypeScript** (`src/shared/framing.ts`), which also copes with
  running status, interleaved realtime and split messages in case a source (e.g. a network session) delivers them.
  Packets are walked in place with `unsafeSequence()`, reading `wordCount` words from the packet's memory (a packet can
  be longer than the 64-word tuple).
- **Idempotent connect (M4):** the hub holds one `connected` endpoint; `reconcile` returns early if the target is
  already connected and always disconnects the old source first. `OnAppEntersForeground` calls `resync()`, which runs
  the same reconcile, so returning from the background can't add a second connection. On the JS side the probe keeps
  one subscription outside React and removes the previous one on Fast Refresh (a doubled JS listener would look
  exactly like the M4 bug).
- **Threads:** all hub state is on one serial queue; the receive block (CoreMIDI's MIDI thread) touches only its
  packet and a locked counter, then calls `sendEvent`, which in Expo Modules 58 schedules onto the JS runtime
  (`LegacyEventEmitterCompat.sendEvent` → `runtime.schedule`), so it is safe off the JS thread.
- **Native forwards bytes + timestamps only.** Note/velocity semantics, channel 10, Note On velocity 0 = off,
  poly-AT choke, clock/active-sensing filtering, bounce and crosstalk filters are all in TS
  (`src/shared/`), the latter copied unchanged from the web app (`parity.test.ts` proves identical hits on the repo
  fixtures and the web test vectors).

### 3.4 Click path: **native** (`AVAudioEngine` + `AVAudioPlayerNode.scheduleBuffer(at: AVAudioTime(hostTime:))`)

`react-native-audio-api` 0.13.6 was checked (source read from the npm tarball): `AudioContext.currentTime` is
`destination.currentSampleFrame / sampleRate` (`common/cpp/audioapi/core/destinations/AudioDestinationNode.cpp`),
and there is **no `getOutputTimestamp`, no `outputLatency`/`baseLatency`, and no host-time anchor** on the context. A JS
mapping would have to sample `currentTime` and `nowMs()` together, which carries up to a render quantum (~5–20 ms) of
error, more than the jitter we are trying to measure. So the probe schedules clicks natively on host time.

Mapping to "heard" time, the same way the web app does: the web adds the output latency
(`getOutputTimestamp().performanceTime`, or `currentTime + baseLatency + outputLatency`). The probe uses
**heard = scheduled host time + `AVAudioSession.outputLatency`**. Whether `AVAudioTime(hostTime:)` on a player node
means "enters the output unit" or "leaves the speaker" is not documented clearly, so the tap test reports offsets
against both the heard time (web-equivalent) and the scheduled time; M5 tells us which is right. The session is
`.playback` + `.mixWithOthers`, preferred IO buffer 5 ms. Clicks: 50 ms triangle bursts, 1600 Hz accent / 1050 Hz
(the web click's pitches).

For Phase 2 (A4): if `react-native-audio-api` later exposes an output timestamp, re-check; otherwise the app's
metronome/backing need the same native host-time scheduling, or a native mapping (`AVAudioEngine` render timestamps).

### 3.5 The probe app

`spikes/midi-probe/App.tsx`: one screen (devices + Network MIDI switch, counters, bridge delay, tap test, results,
last 50 messages). Counters are computed **in JS from the raw bytes** by `src/shared/probe.ts`: clock, active
sensing, other realtime, poly AT and choke, note-off (and the Note On velocity 0 part), note-on, off-channel-10, hits,
filtered (bounce/crosstalk), CC, sysex, dropped bytes, timestamps going backwards. Bridge delay = `nowMs()` read
first thing in the JS handler − `hostTimeMs` (min / median / p95 / max, resettable), plus the native part
(`nativeReceivedMs − hostTimeMs`). Tap test: 120 BPM, 4 count-in + 32 clicks, snare only, scored with
`estimateLatency` copied from `src/engine/scoring.ts` (median = the web number; mean and spread shown too; "trusted"
uses LatencyCard's spread ≤ 50 ms and ≥ 10 taps). "Copy results" (expo-clipboard) / "Share…" export the JSON in §7;
"Copy last tap test as fixture" exports a `src/input/fixtures/*.json` fixture (chart = one snare per beat, beat 0 = the
first heard click, `latencyMs` = the take's median, `expect` left empty).

### 3.6 M8 helper

`spikes/midi-probe/tools/replay-fixture.mjs` (Mac): plays a fixture to a named MIDI output with `@julusian/midi`
3.8.1 (maintained fork of node-midi; RtMidi; prebuilds for macOS arm64/x64; MIT). Pacing uses absolute targets with a
2 ms spin, prints send lateness per pass. Has its own `package.json` (a native Node addon doesn't belong in the app).

## 4. Verified here (Linux container) and how

| Check | Result |
|---|---|
| `npm install` in `spikes/midi-probe` | OK (lockfile committed) |
| `npx tsc --noEmit` | **clean** |
| `npx vitest run` (spike) | **8 files, 47 tests pass**: framing (13), classify + parseMidiMessage (6), stats (3), probe counters incl. fixture (5), parity with the web input path (5), tap test + fixture export (6), UMP unpack model (5), replay timing/loader (4) |
| `npx expo prebuild --platform ios --no-install --clean` (`EXPO_OFFLINE=1`) | **OK.** Info.plist has `NSLocalNetworkUsageDescription`, `NSBonjourServices` (`_apple-midi._udp`), bundle id `com.drumcoach.midiprobe`; deployment target 16.4. Generated `ios/` deleted. |
| Autolinking | `expo-modules-autolinking resolve --platform apple` lists `drum-midi` → pod `DrumMidi` (`modules/drum-midi/ios`), module class `DrumMidiModule` (20 modules total). The Podfile's `use_expo_modules!` consumes exactly this list. |
| `npx expo-doctor` (1.21.5) | **18/20 pass.** The 2 failures are network-only: app.json schema check (`getaddrinfo ENOTFOUND exp.host`) and the React Native Directory check (proxy 403). |
| `@julusian/midi` loads | Native binding loads; `new Output()` fails with "Failed to initialise RtMidi" because the container has no ALSA sequencer. Expected; the Mac uses CoreMIDI. |
| Root `npm test` / lint / build | Unchanged: 48 files / 349 tests pass; lint 310 problems (307 errors, 3 warnings), all pre-existing; build OK. Run with `spikes` excluded (the root ignore lands with c9d998a on main). |

## 5. Unverified (needs the Mac and the devices)

1. **The Swift has never been compiled.** See 5.1.
2. All device behaviour: enumeration of the MPS-150 ("e-Drum") over USB-C on iPad and iPhone (M2, M7); hot-plug
   events (M3); whether CoreMIDI delivers packet timestamps of 0; Note Off vs Note On velocity 0 on iOS; bridge delay
   (M6); the tap-test numbers (M5).
3. `AVAudioTime(hostTime:)` semantics on `AVAudioPlayerNode` (render vs output time): M5 decides.
4. Network MIDI (M8): the Local Network prompt, Bonjour discovery from the Mac, and the session source appearing in
   `listInputs`.
5. Bluetooth MIDI (M9, optional): the probe has no pairing UI (`CABTMIDICentralViewController`); an adapter must be
   paired in another app first.
6. `replay-fixture.mjs`'s MIDI-out half (no MIDI ports here).
7. `expo-doctor`'s two network checks.

### 5.1 First compile on the Mac (checklist step 0)

**Compile.** Written against the iOS 16.4+ SDK, CoreMIDI's Swift overlay (`MIDIEventList.unsafeSequence()`,
`MIDIInputPortCreateWithProtocol`), `MIDINetworkSession` (`.anyone`/`.noOne`, `isEnabled`, `networkName`) and Expo
Modules Core 58.0.26 (checked against its sources in `node_modules`: `Events`, `OnCreate`, `OnAppEntersForeground`,
`sendEvent`, `[String: Any]` returns). Expect small compile fixes; any fix stays inside `modules/drum-midi/ios`. The
owner pastes the errors back verbatim.

**Start-up hang (deadlock risk).** `MidiInputHub.startIfNeeded()` creates the CoreMIDI client and port with
`DispatchQueue.main.sync` when it is called from the JS thread (the first `listInputs()`/`select()`, which the probe
calls as soon as its screen mounts). If the main thread is at that moment waiting synchronously on the JS thread,
both wait forever.
*Symptom:* the probe's screen appears and then freezes (no scrolling, no button response) right after launch, every
launch. In Xcode, Debug → Pause shows the main thread blocked and the JS thread inside `startIfNeeded` /
`DispatchQueue.main.sync`.

*Fallback A (owner, one line):* in `spikes/midi-probe/modules/drum-midi/ios/MidiInputHub.swift`, replace

```swift
    if Thread.isMainThread { create() } else { DispatchQueue.main.sync(execute: create) }
```
with
```swift
    create() // created on the calling (JS) thread; no main-thread hop
```
then rebuild (`npx expo run:ios --device`). Then run **M3**: if the list still updates on unplug/replug, the notify
block is delivered without the main run loop and A is the fix.

*Fallback B (A3, if A breaks M3, i.e. no hot-plug updates):* create the client on a dedicated MIDI thread that owns a
run loop, so notifications have a run loop and nothing ever waits on main:

```swift
final class MidiRunLoopThread: Thread {
  private let ready = DispatchSemaphore(value: 0)
  private var loop: CFRunLoop?
  override func main() {
    loop = CFRunLoopGetCurrent()
    RunLoop.current.add(NSMachPort(), forMode: .default) // keeps the run loop alive
    ready.signal()
    while !isCancelled { RunLoop.current.run(mode: .default, before: .distantFuture) }
  }
  /// Runs `block` on this thread and waits for it.
  func sync(_ block: @escaping () -> Void) {
    if loop == nil { start(); ready.wait() }
    let done = DispatchSemaphore(value: 0)
    CFRunLoopPerformBlock(loop, CFRunLoopMode.defaultMode.rawValue) { block(); done.signal() }
    CFRunLoopWakeUp(loop)
    done.wait()
  }
}
// in MidiInputHub: private let midiThread = MidiRunLoopThread()
// in startIfNeeded: midiThread.sync(create)   // instead of the main-thread line
```

## 6. Decision tree (after the device run)

The plan's rules, with what to look at in the probe's results:

- **All of M2–M6 pass → GO with Expo + our module** (D1 = go). A3 productises `modules/drum-midi`; A1 moves
  `src/shared` into `@drum-coach/core`.
- **Only the bridge delay is high (M6: p95 ≥ 20 ms, everything else passes) → GO.** Hit visuals are driven natively or
  from a Reanimated shared value; scoring is unaffected, because it uses the host timestamps.
- **Jitter fails (M5: iPad spread > web spread + 3 ms, or the mean offset moves more than ± 5 ms across 3 runs) →
  investigate, then retry:**
  - the timestamp source: `zeroTimestampPackets` in the debug info (> 0 means CoreMIDI didn't stamp packets and we
    used the receive time), and the `native − host` delay spread;
  - the audio clock mapping: the "vs heard" and "vs scheduled" offsets, and whether `outputLatencyMs` changed between
    runs (route changes);
  - the audio-session buffer size: `ioBufferMs` (we ask for 5 ms; iOS may grant more).
  If it still fails, **STOP and report options**: the click scheduler is already in Swift on host time (the option the
  plan names), so the remaining ones are a different timestamp source (receive time vs packet time), a fixed
  IO buffer / sample rate, or another input path (Network MIDI, M8) to separate USB from the app.
- **Kit doesn't enumerate (M2, or M7 on the iPhone) → check the cable/adapter, power (powered hub or the camera
  adapter's charging port) and the module's USB mode; STOP and report.**

Rows outside the tree: step 0 (build) and M1 (kit on the Mac) are preconditions: fix and continue. M3 and M4 are
part of "all of M2–M6": a failure there (no reconnect, doubled hits) is a bug in the module or the JS subscription;
fix it and re-run the row before deciding. M7 is
M2 on the iPhone. M8 failing only removes automated device tests (fixtures + touch pads remain, B8). M9 and X1 are
optional.

## 7. What the owner pastes back

1. The **"Copy results" JSON** after each row (iPad, then iPhone): `kind: "drum-coach-gate0-probe"`, device and
   inputs, counters, framer stats, bridge and native delay stats, audio info, every tap-test run (clicks, taps, both
   offsets), native debug info (connects, packets, timestamp-0 packets, background/foreground counts) and the last 300
   raw messages.
2. The **filled-in GATE0-CHECKLIST.md** (step 0, M1–M8, M9 and X1 if done), including the web app's Latency results
   on Linux Chrome for M5.
3. Optional: one **"Copy last tap test as fixture"** JSON (we add it to `src/input/fixtures/`).
4. Any Xcode compile errors, verbatim, and whether the start-up fallback (5.1) was needed.

## 8. Requests to the orchestrator

1. **Merge order:** merge after c9d998a (root lint/Vitest ignore `spikes/`). Before it, root `npm run lint` and
   `npm test` would also pick up the spike's files (and its `node_modules` once installed), changing the root results.
2. **A1:** `spikes/midi-probe/src/shared/{midi,kit,hitFilter,latency}.ts` are copies (headers say so);
   `framing.ts`, `classify.ts`, `probe.ts`, `stats.ts` are new and belong in `@drum-coach/core` too.
   `parity.test.ts` imports the web source directly; drop it once both use the core.
3. **A3:** start from `modules/drum-midi`; keep the "native forwards bytes + host time" contract and `nowMs()` as the
   single clock. If `manufacturer` comes back empty on the device, read it from the source's entity/device
   (`MIDIEndpointGetEntity` → `MIDIEntityGetDevice`).
4. **A4:** react-native-audio-api 0.13.6 has no output timestamp; budget for native host-time scheduling (§3.4).

## 9. Device run results (owner, 2026-10-27/28)

Setup: MacBook Air, macOS 27.2, Xcode 27.1 (27A9275), Node 24.22.1, CocoaPods 1.17.0, free Apple ID (Personal Team).
iPad with an Apple M1 (device id 00008103-…), iPadOS 26.5. Debug build, Metro on the Mac over Wi-Fi.

| Row | Result | Evidence |
|---|---|---|
| Step 0 | **PASS** after one fix. The first launch aborted in dyld: "Symbol not found" in ExpoModulesCore, referenced from ExpoFileSystem. expo 58.0.19 allowed expo-file-system 58.0.12, whose prebuilt framework needs expo-modules-core 58.0.27, but 58.0.19 pins 58.0.26. Fixed by expo 58.0.20 (4ff7140). Our Swift compiled first time. No start-up hang (§5.1 fallback not needed). | timebase 125/3, module available |
| M1 | not reported | — |
| M2 | **PASS** | `e-Drum` (manufacturer `Medeli`) listed, online, auto-selected. Every pad on ch10 with the KIT.md note: kick 36, snare 38, hi-hat open 46 (pedal up), pedal 44 + poly AT 127 on 44/42/46 (3× choke, never a hit), hi-hat closed 42 (pedal held), tom 1 48, tom 2 45, floor 43, crash 49, ride 51. Every note-off is a note-on vel 0. 30 strokes → hits 30, plus 5 retriggers filtered as bounces (30–40 ms after the stroke, ~45 % velocity, as KIT.md says). Velocity 17–127 seen. Clock F8 every 24.2–24.4 ms and FE ~250 ms, counted and never hits. 0 dropped bytes, 0 off-channel, 0 time-went-back, ts=0 packets 0. |
| M6 (early look, debug build) | p95 **40–59 ms** (target < 20) | JS − host median 0.4 ms, p95 40–59 ms; native − host median 0.05 ms, p95 0.08 ms. The JS thread redraws on every clock message (~41/s) in a debug build. To be re-measured in a Release build; batching events per frame is the planned fix (A3). Scoring uses host time, unaffected. |
| Note for A3 | Packets queued while the app is backgrounded arrive on resume with their old timestamps (native − host max 48.7 s). The real app must ignore stale messages after a resume (e.g. drop anything older than ~250 ms when no take is running). | lifecycle backgrounded 5 / foregrounded 8 |

Audio (first look): output latency 5.7 ms, IO buffer 21.3 ms (1024 frames at 48 kHz), route Speaker.
