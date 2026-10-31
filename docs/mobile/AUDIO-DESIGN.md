# Audio and clock design (iPad)

**Status:** design for A4 (Phase 2). Written by A4d on 2026-10-30. Docs only: the code here is illustrative. The
orchestrator turns §2 into `contracts.ts` / `packages/core`. **A4 starts only after M5 passes** (BOARD D1). §5 has
a branch for each possible M5 outcome.

Inputs: `CLAUDE.md`, `docs/mobile/GATE0.md` (§3.2 clock rule, §3.4 native click, §9 device numbers),
`spikes/midi-probe/modules/drum-midi/ios/{ClickScheduler,HostClock}.swift` (compiled and ran on the iPad),
`src/play/{audio,player}.ts`, `src/ui/LatencyCard.tsx`, `src/engine/scoring.ts` `estimateLatency`, `src/voice/voice.ts`,
`docs/mobile/RECON.md` §3 and §10. A1's `packages/core/src/play/take.ts` doesn't exist on the branch yet, so §2 is
proposed from `player.ts`.

Device facts used (GATE0 §9, iPad M1, iPadOS 26.5): output latency **5.7 ms**, IO buffer **21.3 ms (1024 frames at
48 kHz)** though the probe asked for 5 ms, route Speaker, mach timebase 125/3. The iPad has **one USB-C port**, and
the kit uses it (B6). There's no headphone jack.

---

## 0. Summary (the decision)

1. **Scheduling is native.** A new local Expo module, `drum-audio` (owned by A4), runs one `AVAudioEngine`. It has
   per-bus pools of `AVAudioPlayerNode`s. Every sound is a pre-rendered PCM buffer, scheduled with
   `scheduleBuffer(_:at: AVAudioTime(hostTime:))` on the **same mach host clock** as CoreMIDI timestamps.
2. **JS (the core) only plans.** `@drum-coach/core` turns a take into a list of timed events in Clock ms ("heard at").
   It hands them to native **2–4 s ahead**. A native lookahead loop (10 ms timer, 120 ms window) gives each event to
   a player node. A stalled JS thread can't drop or delay a click. Scoring, wait mode, live tips and the end of the
   take stay in core, on the same Clock.
3. **The port works in heard times.** Native subtracts the route's `heardOffsetMs` (M5 decides whether that's
   `outputLatency` or 0) and the sound's onset. Core never sees audio-clock seconds or output latency.
4. **Session:** `.playback`, mode `.default`, `[.mixWithOthers]`, preferred IO buffer 5 ms, preferred rate 48 kHz,
   `prefersNoInterruptionsFromSystemAlerts = true`. There's no background-audio mode. An interruption, background or
   route change **ends the take** at the last whole bar. The engine is rebuilt lazily, and MIDI older than the resume
   is dropped (B25).
5. **Latency is stored per output route**, measured with the same tap test and `estimateLatency` as the web. Bluetooth
   gets a warning and its own measurement.
6. **No new npm dependency.** The design is first-party Swift on AVFAudio. `react-native-audio-api` fails the
   dependency rule: it's 0.x, and its podspec downloads binaries at pod install and build (§1.5).

What's rejected, one line each:
- **All-JS with `react-native-audio-api`**: 0.13.6 (npm `latest` today) has no `getOutputTimestamp` and no host-time
  anchor. The 1.0 nightly (2026-10-30) adds `outputLatency`/`baseLatency` getters only
  (`outputLatency = session.outputLatency + ioBufferDuration`). So mapping its `currentTime` to MIDI host time still
  costs up to one render quantum of error, and its scheduling would still run on the JS thread. It also fails the
  owner's dependency rule (§1.5).
- **Hybrid "JS schedules on its own audio context, native reports a host↔sample anchor"**: two engines would fight
  over one session, and every sound would pay the JS-thread risk M6 showed (p95 40–59 ms stalls in debug).
- **One custom `AVAudioSourceNode` sequencer** (render block mixes events by `mHostTime`): sample-accurate with no
  pool, but it needs real-time-safe Swift (no locks, no allocation, no ARC on the render thread). Keep it as the fallback
  if M5/T6 show player-node scheduling jitter > 1 ms.
- **Scheduling everything at take start** (as the probe does): fine for 36 clicks. For a 5-minute take, the host→sample
  conversion may use an old anchor (see §6), Stop has to unschedule hundreds of buffers, and endless takes can't
  work this way.

---

## 1. Where scheduling lives

### 1.1 Native (Swift, `modules/drum-audio`)

```
AVAudioEngine
 ├─ busClick  (AVAudioMixerNode)  ← click pool: 2 × AVAudioPlayerNode
 ├─ busDrums  (AVAudioMixerNode)  ← drum pool: 12 × AVAudioPlayerNode (auto-played notes + touch pads)
 ├─ busBand   (AVAudioMixerNode)  ← band pool: 8 × AVAudioPlayerNode (bass/keys notes)
 ├─ busVoice  (AVAudioMixerNode)  ← voice pool: 2 × AVAudioPlayerNode (count-in words, coach clips)
 └─ busBacking(AVAudioMixerNode)  ← backing: 1 × AVAudioPlayerNode → AVAudioUnitTimePitch (Phase 3b)
      all → mainMixerNode → outputNode
```

- **Why pools:** one `AVAudioPlayerNode` plays its scheduled buffers **in sequence**. The documentation doesn't say
  what happens to two buffers that overlap in time on one node, and forum reports say to use one node per overlapping
  sound. The allocator gives each event a node whose last scheduled buffer ends before the new one starts. If none is
  free, the pool grows to a cap (click 4, drums 24, band 16, voice 4). Past the cap the event is dropped and counted
  in `stats().dropped`. Clicks are 50 ms long, so two nodes cover 16ths at 240 BPM.
- **Why pre-rendered buffers:** a player node's `volume` is per node and can't be scheduled per buffer. So gain is
  baked into the buffers:
  - **Clicks:** three buffers (bar 1600 Hz, beat 1050 Hz, subdivision 800 Hz). They're the web `click()` recipe
    (triangle wave, 50 ms, exponential decay, peaks 1 / 0.75 / 0.35). Gain (fade/gap bars) is quantised to 16 steps,
    and scaled copies are cached.
  - **Drums:** the web `playDrum()` recipes (sine sweeps + filtered noise), rendered in Swift at start-up into
    8 velocity layers per pad. That's 10 pads × 8 layers, under 2 MB at 48 kHz mono. The same sounds feed the
    touch pads and the app-played lanes (layered practice, demo, guide).
  - **Band:** each bass/keys note is rendered when it enters the lookahead window, using the web `pad()` envelope with
    its length and velocity. This runs on the scheduler queue, never on the render thread.
  - **Words:** the count-in ("one" … "seven", "and", "e", "a") and `countAloud` words. They're prepared before the take
    (§1.3), with each buffer's **onset** (first sample above −30 dBFS) stored so the vowel lands on the beat, like the
    web's `onsetOf(buf)`.
- **Lookahead loop:** a `DispatchSourceTimer` every 10 ms on a `.userInteractive` serial queue. It moves every queued
  event heard before `now + 120 ms` into its pool with
  `scheduleBuffer(buf, at: AVAudioTime(hostTime: HostClock.msToTicks(at − heardOffsetMs − onsetMs)))`.
  If an event's schedule time is earlier than `now + minLeadMs`, it is dropped and counted as `late`, never played late.
  This copies the web's "drop what's due instead of playing it all at once" rule. A 120 ms window is far longer than
  the 21 ms IO buffer, and short enough that Stop takes effect within one window.
- **Touch pads (`playNow`)**: a **synchronous** Expo `Function` (JSI, not `AsyncFunction`) schedules the pad's buffer
  with `at: nil` on a free drum node. The docs say "if the node is in a playing state, the event plays in the very near
  future". It returns the estimated heard time (`now + ioBufferMs + heardOffsetMs`). Budget: touch → JS (≤ 1 frame) +
  IO buffer (5.3 ms if granted, 21.3 ms as seen) + output latency 5.7 ms ≈ 15–45 ms. **Trigger for a native pad
  view:** if T6-6 measures touch → sound p95 > 35 ms in a Release build, A4 adds a native `DrumPadSurface` Expo view.
  It plays on `touchesBegan` on the main thread and emits `{pad, velocity, hostTimeMs}` to JS afterwards.
- **Coach voice (not timed):** Piper WAV clips from the home server (D2) or on-device `AVSpeechSynthesizer` output play
  on the voice bus "now". While a voice-bus sound plays, native dips `busClick`/`busDrums` to 45 % in 30 ms steps,
  as the web's `playVoice` does. Nothing else in the app touches `AVAudioSession` (§3.6).

### 1.2 JS / core

- `createTake` (§2.3) runs the web `player.ts` logic in core, clock-agnostic. It covers count-in, subdivisions, odd /8,
  `clickOn`, gap and fade bars, app-played lanes, the band, `countAloud`, wait mode, endless and timed takes, free bars
  and live tips.
- The body of the web scheduler's `setInterval` becomes a **pure planner**:
  `planEvents(spec, fromBeat, toBeat): AudioEvent[]`. Every time is computed as `zero + beat × beatMs`, by
  multiplication, never by accumulation. The planner is unit-tested against the web's output (§7.1).
- `take.tick(now)` is called by the app at about 10 Hz (and may be called every frame). It tops the plan up so that
  **≥ 2 s** is always handed over, in 4 s chunks. It also runs `liveCheck`, polls the backing anchor (§6) and detects
  the end. Core has no timers of its own (RECON §10 #3: no globals).
- Scoring is unchanged. `hit.time − latencyMs − driftMs` is matched against `zero + t × beatMs`, all in Clock ms.

### 1.3 Preparing sounds before a take

`audio.prepareWords(words)`: native renders each word once and caches it by text and voice. It uses
**`AVSpeechSynthesizer.write(_:toBufferCallback:)`** (on-device, offline, the same voice every time). When the home
server is reachable, the Piper clip is preferred so the voice matches the web. Clips are cached as files and decoded
once. A take never waits on the network. Missing words are left out of the plan, as the web's `sayAt` returns false.

### 1.4 Backing audio (contract now, build in Phase 3b)

Backing files are decoded once (`AVAudioFile` → `AVAudioPCMBuffer` at the engine rate, so sample-rate conversion
happens at load, not during play). They are scheduled with `scheduleSegment`/`scheduleBuffer` at a host time from an
offset, through `AVAudioUnitTimePitch` (`rate` 0.5–1). This **keeps pitch** at slow speeds. The web shifts pitch, so
this is an intentional improvement and not a parity item. Seeking means stop + schedule from the new offset at a new
host time. v1 (D5) has no Songs, so A4 builds `backing` only if time allows. The interface and the drift handling
(§6) are in place now so Songs (A8) doesn't change the contract.

**Seamless loops (F2).** A looped section must not restart the file: `start()` cuts what plays at once, so a take that
started each repeat with its own `start()` played the next one early (I1 measured a 100–150 ms seam). The contract
(`packages/core/src/play/audioPort.ts`) therefore has:

- `start({ at, offsetMs, rate, durationMs? })`: as before, plus an optional length (ms of the line, file ms from
  `offsetMs`; a negative offset's lead counts in it). Without it the file plays to its end, as before.
- `queue({ at, offsetMs, durationMs })`: a segment after the last one started or queued, at the same rate, without
  cutting anything. `at` is on the start's line. Native puts it on the same `AVAudioPlayerNode` with
  `scheduleSegment(at: nil)`: right after the previous segment, sample-accurate, through the same time-pitch unit, so
  the seam has no gap or overlap. Within a frame of the previous end it goes exactly there, and its first file frame
  moves by that frame, so a section that isn't a whole number of frames never creeps off the line. Due later (a
  negative offset's lead), it waits at an explicit player sample time; due earlier (an overlap, or queued after the
  previous one already ran out), it starts later and skips as far into the file, so what is heard stays on its line.
- The anchor: the player's own timeline (frames since `play(at:)`) has no seams, so native maps it through the list of
  segments (`anchorInSegments`). Core reads each anchor against the line of the repeat it sits closest to.
- Re-anchoring after a route or engine change puts back the segment playing now (from the last anchor, to its end) and
  queues the ones after it again, moved by the same drift.

The take (`take.ts`) starts repeat 0 with the section's length and keeps the next repeat queued (one ahead), so the
web's per-repeat sources and the iPad's segments start and end at the same heard times (web-parity checks both ends to
1e-6 ms). The pure math is `modules/drum-audio/src/backing.ts` (`planBackingQueue`, `anchorInSegments`,
`reanchorPlan`) and its line-by-line Swift mirror `BackingMath.swift`, with the same vectors in both test suites.
Unverified on the device: an explicit player sample time behind the time-pitch unit (only gaps use it), and the
seam by ear (CHECKS.md B7).

### 1.5 Dependencies (the owner's rule in CLAUDE.md, enforced by `scripts/check-deps.mjs`)

Rule: stable releases only (direct dependencies major ≥ 1, no prereleases), at least 7 days old, from the npm
registry, no install scripts. An exception is an exact `name@version` in the allowlists, with a reason.

- **The recommended path adds no npm dependency.** `drum-audio` is a local Expo module: first-party Swift + TS on
  AVFAudio, which ships with iOS. Expo Modules Core and React Native are already in the app. Nothing new to vet, age
  or allowlist.
- **`react-native-audio-api` fails the rule on every version checked:**
  - `0.13.6` (`latest`, published 2026-09-23, 37 days old) is a **0.x** release. `check-deps` rejects direct 0.x
    dependencies ("no stable API yet").
  - Its npm `scripts` has no install hook, but its **podspec downloads prebuilt binaries** (FFmpeg and others). It
    does this through `prepare_command` on `pod install` and an Xcode `script_phase` on build
    (`scripts/download-prebuilt-binaries.sh`). That is install-time code fetched from outside the npm registry, which
    `.npmrc`'s `ignore-scripts=true` doesn't stop and `check-deps` doesn't see.
  - It also needs a `react-native-worklets` peer dependency.
  - The 1.0 line is **nightly prereleases only** (`1.0.0-nightly-…`), and they add a `prepare` script.
- **If it's ever wanted** (for example, for a feature like a waveform view, not for timing), it needs an owner-approved
  exception: an exact `react-native-audio-api@<version>` in `ALLOW_INSTALL_SCRIPT`, plus a 0.x waiver, plus a review of
  the downloaded binaries. The timing design doesn't need it. Re-check when a stable 1.x ships with an output
  timestamp.

---

## 2. The contract

### 2.1 `AudioPort` (proposed `packages/core/src/play/audioPort.ts`, implemented by `apps/mobile/src/platform/audio.ts` and a web adapter)

```ts
import type { Clock } from '../platform';
import type { PadId } from '../engine/kit';

/** Sounds native has ready: synth clicks, drum one-shots (8 velocity layers), prepared words. */
export type SoundId =
  | 'click.bar' | 'click.beat' | 'click.sub'
  | `drum.${PadId}`
  | `word.${string}`;

/** Every `at` is the time the sound is HEARD, in Clock ms (iOS: mach host ms; web: performance.now()). */
export type AudioEvent =
  | { kind: 'sound'; at: number; sound: SoundId; gain: number }            // gain 0..1.5; native quantises
  | { kind: 'band'; at: number; part: 'bass' | 'keys'; midi: number[]; durMs: number; vel: number };

export type AudioRoute = {
  /** Stable per output: portType + uid (e.g. "Speaker", "BluetoothA2DPOutput:AA:BB:…"). Keys the stored latency. */
  key: string;
  kind: 'speaker' | 'wired' | 'usb' | 'bluetooth' | 'airplay' | 'other';
  name: string;
  outputLatencyMs: number;   // AVAudioSession.outputLatency × 1000 (web: baseLatency + outputLatency)
  ioBufferMs: number;        // AVAudioSession.ioBufferDuration × 1000
  sampleRate: number;
  /** Schedule time + heardOffsetMs = heard time. M5 decides: outputLatencyMs (branch A) or 0 (branch B). §5. */
  heardOffsetMs: number;
  /** Hand events over at least this long before they're heard (ioBufferMs + heardOffsetMs + 10). */
  minLeadMs: number;
};

export type AudioInterruption =
  | { type: 'began'; at: number; reason?: string }                 // call, Siri, alarm… (raw iOS reason when given)
  | { type: 'ended'; at: number; shouldResume: boolean }
  | { type: 'engine-stopped'; at: number; cause: 'config-change' | 'media-reset' | 'background' | 'route-change' };

export interface BackingPort {
  load(uri: string): Promise<{ durationMs: number; sampleRate: number }>;
  /** Heard from Clock time `at`, starting `offsetMs` into the file, at `rate` (pitch kept). Cuts what plays and drops
   *  what is queued; plays `durationMs` of the line, or to the file's end without it (§1.4, seamless loops). */
  start(o: { at: number; offsetMs: number; rate: number; durationMs?: number }): void;
  /** A segment right after the last one, on the same line and rate, without cutting it (§1.4). */
  queue(o: { at: number; offsetMs: number; durationMs: number }): void;
  stop(): void;
  /** The file position heard at Clock time `at`, read from the render clock. Null when not playing (or between segments). */
  anchor(): { at: number; fileMs: number } | null;
}

export interface AudioPort {
  /** False off iOS, in Expo Go, or without the module: every call is then a no-op and `start` rejects. */
  readonly available: boolean;
  /** The Clock the port's times are on (iOS: the MidiPort clock; both read mach_absolute_time). */
  readonly clock: Clock;
  /** Activates the session and starts the engine. Idempotent. Call when a play screen mounts and before every take. */
  start(): Promise<AudioRoute>;
  /** Stops the engine (battery) after the app's idle timeout. Pending events are dropped. */
  suspend(): void;
  route(): AudioRoute | null;
  /** Renders words for the count-in and countAloud. Resolves once each word is ready or known missing. */
  prepareWords(words: string[]): Promise<{ missing: string[] }>;
  /** Hands events over (any order, any distance ahead). Events already too late are dropped and counted. */
  schedule(events: AudioEvent[]): { accepted: number; late: number };
  /** Drops every event not yet sounding that is heard at or after `fromMs` (default: all). Sounding ones ring out. */
  cancel(fromMs?: number): void;
  /** Touch pads: plays now, lowest latency, synchronous. Returns the estimated heard time (Clock ms). */
  playNow(sound: SoundId, gain: number): number;
  /** Bus levels 0..1 from settings (clickVolume, bandVolume, voiceVolume…). Not time-critical. */
  setLevels(levels: Partial<Record<'click' | 'drums' | 'band' | 'voice' | 'backing', number>>): void;
  readonly backing: BackingPort | null;   // null until Phase 3b
  onRouteChange(fn: (r: AudioRoute) => void): () => void;
  onInterruption(fn: (e: AudioInterruption) => void): () => void;
  stats(): { scheduled: number; late: number; dropped: number; engineStarts: number; lastError?: string };
}
```

The web adapter implements the same port on `AudioContext`. `schedule` converts a heard time to audio time with the
inverse of `audioToPerf` at the moment of scheduling, and creates the oscillator and noise nodes as `click`,
`playDrum` and `playBand` do today. Because chunks are only a few seconds long, the conversion is always fresh (§6).
So web and iOS run one `createTake`, which closes B21.

### 2.2 Native module surface (`DrumAudio`, Expo Modules API)

| Call | Kind | Notes |
|---|---|---|
| `start()` | AsyncFunction | session + engine + buffers; returns the route |
| `suspend()`, `cancel(fromMs?)` | Function | |
| `schedule(events: Float64Array-packed or JSON array)` | Function | appends to the native queue; returns `{accepted, late}` |
| `playNow(soundIndex, gain)` | **Function (sync, JSI)** | returns heard ms |
| `prepareWords(words)` | AsyncFunction | |
| `nowMs()` | Function | the same code as `drum-midi`'s `HostClock` (T6-1 checks they agree) |
| events `onRoute`, `onInterruption` | Events | sent from the session-notification handlers |
| `debugInfo()` | Function | pools, late/dropped counts, engine starts, route, last error |

`drum-audio` is a **separate module** from A3's `drum-midi`, so the two owners don't collide. It keeps its own copy of
the 20-line `HostClock.swift`. Both read `mach_absolute_time()`, so they are the same clock by construction.

### 2.3 `createTake` (core): what A1's stub should become

```ts
export type TakeDeps = {
  clock: Clock;
  audio: AudioPort;
  onHit: (fn: (h: Hit) => void) => () => void;     // core hit bus, already on the Clock
  settings: () => { latencyMs: number; countIn: boolean; liveTips: …; chattiness: … };
};
export interface Take {
  /** Picks zero = now + leadMs + countIn × beatMs (leadMs = max(300, route.minLeadMs + 100)), prepares words, schedules 4 s. */
  start(): Promise<void>;
  /** Call ~10×/s: keeps ≥ 2 s of plan in native, live tips, backing drift, the end. */
  tick(now: number): void;
  position(now: number): number;                    // run beats (negative in the count-in)
  /** 'user' keeps an endless take (whole bars); 'interrupted' ends at the last whole bar and flags it (§4). */
  stop(reason?: 'user' | 'interrupted'): void;
  readonly state: TakeState;                         // the web `player` fields: zero, beatMs, results, feedback…
  onFinish(fn: (f: Finished) => void): () => void;
}
export function createTake(deps: TakeDeps, chart: Chart, opts: PlayOptions): Take;
export function planEvents(spec: PlanSpec, fromBeat: number, toBeat: number): AudioEvent[]; // pure
```

`zero` is the **heard** time of beat 0 on the Clock, as `player.zero` is on the web (`audioToPerf(zeroAudio)`). The
web's 150 ms lead becomes 300 ms on iOS. That covers the JS→native hop, word preparation already done, and the IO
buffer. A Practice-screen metronome with no take uses the same planner with an endless spec (`createMetronome`).

---

## 3. Audio session

### 3.1 Settings

```swift
let s = AVAudioSession.sharedInstance()
try s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
try s.setPreferredSampleRate(48_000)
try s.setPreferredIOBufferDuration(0.005)
try? s.setPrefersNoInterruptionsFromSystemAlerts(true)   // iOS 14.5+
try s.setActive(true)
// then read s.outputLatency, s.ioBufferDuration, s.sampleRate, s.currentRoute: they are only true after activation
```

| Setting | Choice | Why |
|---|---|---|
| Category | **`.playback`** | Audio continues with Silent mode on or the screen locked (B9). It's the category for "sounds central to the app". |
| Mode | **`.default`** | `.measurement` and the voice modes change input DSP and routing. Nothing in output-only playback benefits from them. |
| Mix | **`[.mixWithOthers]`** | `.playback` is non-mixable by default, so starting a take would stop the owner's Music or Spotify (play-along). Mixable also means other apps' audio doesn't interrupt us. |
| Duck others | **No** | `.duckOthers` would lower the owner's music for the whole session. The coach's voice dips only our own click and drums (§1.1). |
| IO buffer | **request 5 ms; work with whatever is granted** | Scheduled sounds are sample-accurate at any buffer size. The buffer only changes `minLeadMs` and touch-pad latency. The 21.3 ms seen (1024 frames) is either a reading taken before activation, or the shared hardware buffer kept large by another app's session (we're mixable). T6-3 re-reads it after `setActive` + `engine.start`, with nothing else playing. |
| Sample rate | **48 kHz** | The iPad runs at 48 kHz (§9). Buffers are rendered at `engine.outputNode.outputFormat(forBus: 0).sampleRate`, so a route at 44.1 kHz also works. |
| System alerts | **`prefersNoInterruptionsFromSystemAlerts = true`** | With banner-style calls, an incoming call doesn't interrupt the take unless it's accepted. It has no effect with full-screen calls (owner question 4). |
| Background audio | **No `UIBackgroundModes: audio`** | Practising with the app in the background isn't a use case. Without the mode, iOS suspends us, and §4 handles it. |

### 3.2 Routes the owner can actually use

The kit takes the only USB-C port, so wired audio needs a hub.

| Route | Latency | Clock | Verdict |
|---|---|---|---|
| iPad speaker (+ kit sounds on the module's PHONES) | 5.7 ms reported | SoC (likely locked to host time) | **Default.** Measure latency once. |
| USB-C hub → USB-C-to-3.5 mm adapter → module **AUX IN** (click and kit in one pair of headphones) | small (USB audio) | adapter's own crystal | **Best for practice** (owner question 1). Its own route key, so its own latency. |
| Bluetooth headphones | typically 100–250 ms, and the reported value may be wrong | headset's own | **Allowed with a warning**: "Bluetooth adds delay. The app corrects it once measured, but your own kit sound will be early against the click." A separate measurement is required before scored takes. |
| AirPlay | about 2 s (Apple's doc) | — | **Blocked for takes.** "Use the speaker or headphones." |

**The module's own sound** never goes through the app. Scoring uses MIDI host times, so the module's audio path
doesn't affect scores. The app never plays drum sounds for kit hits, only for touch pads and app-played lanes, as on
the web. KIT.md already says the fastest path is headphones on the module.

### 3.3 Route changes and re-measuring

- Observe `AVAudioSession.routeChangeNotification` (posted on a secondary thread) and
  `AVAudioEngineConfigurationChange`. On a channel-count or sample-rate change, the engine **stops and uninitialises**,
  and its nodes stay attached.
- On either notification: hop to the audio queue. Then `cancel()`, restart the engine (`prepare()`, `start()`,
  `play()` on every pool node), re-render buffers if the rate changed, **re-read** `outputLatency`, `ioBufferDuration`
  and `sampleRate`, and emit `onRoute` with the new `AudioRoute`.
- A running take ends as "interrupted" (§4). Its click may already be gone with the stopped engine, and the new
  route's latency isn't the one it was scored against.
- The app looks up `latencyByRoute[route.key]`. If the route is unknown, it shows "New output: measure latency (30 s)"
  and disables scored takes until it's measured, or the user chooses "use the speaker's value". Bluetooth always
  needs its own measurement.
- Settings change (proposal for A1/orchestrator): keep core's `latencyMs: number` as the number core reads. The iOS
  app adds `latencyByRoute: Record<routeKey, { ms, measuredAt }>` and sets `latencyMs` from it on every route event.
  The web keeps its single value.

### 3.4 Engine lifecycle

`start()` is called when a play screen mounts (it takes about 50–100 ms) and again before every take (a no-op if
running). `suspend()` runs after 60 s with no take and no touch-pad screen. A running engine renders silence
continuously, which costs battery. Never `stop()` a player node inside a completion handler: Apple warns this can
deadlock.

### 3.5 Media services reset

On `mediaServicesWereResetNotification` (main thread): throw away the engine and nodes, rebuild them, re-apply the
category and options, re-render the buffers. Don't restart playback until the user acts (Apple's guidance). Emit
`engine-stopped / media-reset`. Test it with Settings → Developer → Reset Media Services.

### 3.6 One owner for the session

Only `drum-audio` calls `setCategory` or `setActive`. A2 and A6 must not add `expo-audio`, `expo-av` or `expo-speech`
for playback. `expo-audio`'s `setAudioModeAsync` would overwrite the category, mode and options. Coach speech goes
through `DrumAudio` (§1.3). A later voice-input feature (STT, `.playAndRecord` + `.defaultToSpeaker`) may switch the
category **only outside a take**, because the switch causes a route change.

---

## 4. Interruptions, background, screen lock, resume

| Event (iPadOS 26.5) | Native | Core / app |
|---|---|---|
| `interruptionNotification` **began** (call accepted, Siri, alarm, timer) | engine is stopped by the system; `cancel()`; emit `began` | `take.stop('interrupted')` |
| `interruptionNotification` **ended** | `setActive(true)`, restart the engine (lazily, on the next `start()` if the app is in the background); emit `ended {shouldResume}` | Show "Take stopped (call)". **Never auto-resume a take**: the user presses Start. |
| `OnAppEntersBackground` (Home, app switch, screen lock) | `cancel()`, `suspend()`; emit `engine-stopped / background` | `take.stop('interrupted')` |
| `OnAppEntersForeground` | nothing (the engine starts on the next `start()`) | Hit bus `staleBefore = clock.now()` (B25); re-check the route |
| Engine config change / route change | §3.3 | `take.stop('interrupted')`, route banner |
| Media services reset | §3.5 | as above |

On iPadOS 27 Apple adds `didBecomeInactive` and `resumptionRecommendation` notifications, and deprecates the legacy
one. Its end event can be missing. Observe the new ones under `if #available(iOS 27, *)` and the legacy one
otherwise. **Never wait for "ended" to recover.** Every `start()` re-activates and restarts whatever is down.

**What happens to the take** (owner question 3; this is the default):
- It ends at the **last whole bar before the interruption**, using the same code as an endless take's Stop.
- It's saved only if that bar count is **≥ 2** and it has scored notes. It's flagged `interrupted: true`, shown in
  history, and **excluded from the tempo ladder, streaks and progression**. Shorter takes are discarded with a toast.
- Wait-mode takes stop, are not saved, and can be resumed from the current note group by pressing Start.

**Stale MIDI (B25)** has two guards in core:
1. The hit bus drops packets with `hostTimeMs < staleBefore`, where `staleBefore` is the clock at foreground. It also
   drops anything older than 250 ms when no take is running, as GATE0 §9 asks of A3.
2. `createTake` drops hits with `time < take.createdAt`, so even a missed foreground event can't put queued strokes
   into a new take.

**Screen lock:** `KeepAwake` (A2) is active during takes, the touch-pad screen and the tap test, so auto-lock doesn't
happen. A manual lock is a background event.

---

## 5. Latency calibration on the iPad

- **The same test as the web.** LatencyCard: 60 BPM, 4 count-in clicks with spoken numbers, 16 clicks, any pad. It
  uses the same `estimateLatency` (median of the nearest-click differences within ±200 ms, at least 6 taps; saved only
  if spread ≤ 50 ms and n ≥ 10).
- **The same meaning.** `latencyMs` = median(hit − **heard** click). Clicks are scheduled through the port as heard
  times (`at`), so the test's click times are exactly the `at` values. Core never adds output latency itself.
- **The test feeds `latencyByRoute[route.key]`**, and through it `latencyMs`.
- **Which offset is "heard"** is the port's `heardOffsetMs`, set by the M5 result. `heard = scheduled + heardOffsetMs`:

| M5 result | Branch | `heardOffsetMs` | Meaning |
|---|---|---|---|
| iPad "vs heard" median ≈ web Linux median (± 5 ms, same player, same day) | **A (expected, the probe's assumption)** | `outputLatencyMs` | `AVAudioTime(hostTime:)` on a player node is when the sample leaves the engine. `outputLatency` covers the hardware. This matches the web's `audioToPerf`. |
| iPad "vs scheduled" median ≈ web median, and "vs heard" is ~6 ms early | **B** | `0` | Host time already means "at the speaker". |
| Both are ~20–27 ms late against the web | **A′** | `outputLatencyMs + ioBufferMs` | Host time means "rendered into the IO buffer". This is how `react-native-audio-api`'s nightly defines `outputLatency`. |

  On the speaker the branches differ by only 5.7 ms, which is close to a player's run-to-run noise. **M5b
  (proposed)** settles it: repeat the iPad tap test on a high-latency route (Bluetooth headphones, or the USB-C audio
  adapter through a hub). Under the right branch, the measured `latencyMs` is the same on both routes (± 5 ms). Under
  the wrong one, it moves by the route's latency difference.
- **Why either branch is safe for scoring:** the tap test measures the end-to-end offset for a route, and takes on
  that route use the same convention. A wrong branch shifts `latencyMs` by a constant and cancels out. It only shows
  when a value is reused across routes (we don't), or when `outputLatency` changes within a route (we re-measure on
  every route event). So A4 can build on branch A before M5b. The choice is one line in `AudioRoute.heardOffsetMs`.
- **The iPad never imports the laptop's value** (RECON §3.3 and §10 #10).

---

## 6. Drift

**Claim: clicks scheduled on host time can't drift against MIDI hits, however long the take.**

- Click *k* is heard at `H_k = zero + k·beatMs`, computed by multiplication. Native schedules it at host time
  `S_k = H_k − d − onset`, where `d = heardOffsetMs` is constant for the route.
- At render time, CoreAudio turns `S_k` into a sample frame using its current host↔sample anchor. The HAL updates
  that anchor every IO cycle from the device's real rate. Because native hands the event over **≤ 120 ms ahead**, the
  conversion error is at most about `rate error × 120 ms` (100 ppm × 120 ms = 0.012 ms), and it doesn't grow with *k*.
- A hit's time is the CoreMIDI packet timestamp in the **same mach ticks**.
- So `offset_k = hit − latencyMs − H_k` has no term that grows with time. There is nothing to correct. The web's
  `drift` exists only because WebAudio's clock and `performance.now()` are separate clocks.
- The probe scheduled 36 clicks at once (18 s ahead). If the conversion happens at schedule time, a 5-minute plan made
  up front would carry `rate error × elapsed` (50 ppm × 300 s = 15 ms). That's why the lookahead loop is required.

**What can still drift:**
1. **One long buffer: a backing file, or a long voice clip.** It plays at the output device's sample rate once
   started, so it slips against host time by `ppm × t`. The built-in speaker probably shares the SoC reference
   (unverified: T6-5 measures it). A USB adapter or Bluetooth headset has its own crystal: ±20–100 ppm is 6–30 ms over
   5 minutes. **Fix:** in `tick`, core reads `backing.anchor()`. Native gets this from
   `player.playerTime(forNodeTime: player.lastRenderTime)` plus the render host time and the rate.
   `driftMs = anchor.at − expectedHeard(anchor.fileMs)` is smoothed as on the web (factor 0.1, a jump over 50 ms is
   ignored). Core adds `driftMs` to expected note times **and to the `at` of every newly planned click and band
   note**. The song is the master. Re-seeking is never needed for < 50 ms.
2. **Float accumulation**: avoided by computing every time from `zero + beat × beatMs`. At 1e9 ms a double resolves
   about 1e-7 ms.
3. **Sleep**: mach time stops, but a take ends when the app backgrounds, so no take spans a sleep.
4. **JS stalls**: these are not drift. Native holds 2–4 s, so a stall shorter than 2 s changes nothing, and a longer
   one drops the late events (counted). It never shifts them.

**The tests that prove it:** T6-2 (unit, synthetic 5-minute stream), T6-4 (device, render onsets over 5 minutes), T6-7
(the owner plays 5 minutes). See §7.

---

## 7. Tests A4 must pass

### 7.1 T6: timing

| ID | Where | Test | Pass |
|---|---|---|---|
| T6-1 | Vitest (core) | `planEvents` vs the web: one spec per click feature (4/4, 3/4, 7/8 with 2+2+3, subdivision 1/2/4, `clickOn` quarters/8ths/2and4, gapBars, fadeClick, count-in words, countAloud, band, app-played lanes, guide at half gain), compared with the web scheduler's calls captured from `player.ts` through a fake `audio.ts` | identical sound, level and gain; times equal to 1e-6 ms |
| T6-2 | Vitest (core) | Synthetic 5-minute take at 120 BPM, Clock offset +1e9 ms (iOS host time). Hits = heard clicks + 20 ms + seeded noise (σ 8 ms), fed through `createTake` with a fake `AudioPort` and a fake Clock driven by `tick` | per-minute mean offset equals 20 ± 0.001 vs the noise-free run; score identical to the same stream at offset 0 |
| T6-3 | Vitest (core) | Backing drift: the fake `backing.anchor()` drifts at +100 ppm and −100 ppm for 5 minutes | residual (expected − true) < 1 ms all the way through; clicks planned after minute 1 follow the backing |
| T6-4 | Vitest (core) | Chunking: `tick` at random 5–400 ms intervals (stalls) | every planned event is handed over exactly once, ≥ 2 s ahead except after a > 2 s stall; `cancel` at Stop; nothing planned past the end |
| T6-5 | Vitest (core) | Lifecycle: `stop('interrupted')` mid-bar 7 → bars 1–6 saved and flagged; at bar 1 → discarded; hits before `createdAt` and before `staleBefore` ignored | as stated |
| T6-6 | Swift `swift test` (Mac) | Pure Swift in `modules/drum-audio/ios/Core/` with a `Package.swift`: `HostClock` ms↔ticks round trip (1e9 ms, timebase 125/3 and 1/1); the pool allocator (overlap → another node, cap → dropped); the lookahead selection (window, `late` rule); the onset finder; click and drum renderers (length, peak, no NaN) | all pass |
| T6-7 | Swift, macOS AVAudioEngine **manual rendering mode** | The scheduler with a fake time source (host = sample/48 kHz) renders 60 s offline; find onsets in the output | each onset at its frame ± 1; overlapping drums all present |
| T6-8 | **iPad**, debug screen, no human | 5 minutes of clicks at 120 BPM with `installTap` on the main mixer: onset frame → host time (tap buffer `AVAudioTime`) vs scheduled host time | after removing the constant offset, \|error\| p99 < 0.5 ms; slope < 1 ms per 5 min; `late` = 0 |
| T6-9 | **iPad**, owner | M5 tap test repeated through the real `AudioPort` (speaker); M5b on a second route (§5) | median within ± 5 ms of M5; spread ≤ web + 3 ms; M5b decides `heardOffsetMs` |
| T6-10 | **iPad**, owner + kit | 5-minute take (snare on every beat, 100 BPM) | mean offset in minute 1 vs minute 5 within ± 3 ms |
| T6-11 | **iPad**, owner, Release build | Touch pads: touch → sound | p95 ≤ 35 ms (via a slow-motion video, or the native touch timestamp vs the rendered onset), else build the native pad view (§1.1) |

### 7.2 T7: robustness (iPad, owner, with the checklist A4 writes)

1. **Silent mode** on (Control Center): the click plays.
2. **Siri** mid-take, then a **Clock alarm** mid-take: the take ends at the last whole bar and is flagged; Start works
   again at once; no hits from during the interruption.
3. **Incoming FaceTime call**, banner style, declined: the take keeps going. Full-screen style: the take ends as in 2.
4. **Home and back, lock and unlock** mid-take: the take ends; after resume, no old strokes appear (play during the
   lock); the next take starts cleanly.
5. **Route changes:** connect Bluetooth headphones while idle, then mid-take; plug the USB-C audio adapter through a
   hub. Each shows the route banner; scored takes are blocked until that route is measured; values are kept per route.
6. **Reset Media Services** (Developer settings) while idle: the next Start works.
7. **Music app playing** while practising: both are audible (mixWithOthers); the click timing equals T6-9.
8. **10-minute soak** (X1-style): no late or dropped events; memory flat.

---

## 8. Risks and open questions

**Risks (A4/orchestrator):**
- **M5 hasn't run yet.** If jitter fails, GATE0 §6's tree applies before any of this is built.
- **The player-node host-time semantics and overlap behaviour are only partly documented.** Pools plus T6-7/T6-8
  cover it. The `AVAudioSourceNode` sequencer is the fallback.
- **The 21.3 ms IO buffer** may be the real grant on this iPad. That's fine for scheduling, but touch pads get slower
  (§1.1 trigger).
- **Another library changing the session** (§3.6). Lint for it: `expo-audio`, `expo-av` and `expo-speech` imports
  are forbidden in `apps/mobile`.
- **Bluetooth's reported `outputLatency`** may be wrong, so it gets a separate measurement, never the reported value
  alone.

**Open questions for the owner (5):**
1. **How do you listen while practising?** (a) iPad speaker + kit sounds in the module's headphones (the default),
   (b) a powered USB-C hub with the kit + a USB-C-to-3.5 mm adapter into the module's AUX IN, so the click and kit are
   in one pair of headphones (recommended; needs a hub and an adapter), or (c) Bluetooth headphones (needs its own
   measurement; your kit's sound will feel early).
2. **Should the app's sound mix with other apps** (Music or Spotify playing while you practise)? The default is yes.
   The alternative stops other audio when a take starts.
3. **A take interrupted by a call, Siri, an alarm or locking the screen:** keep it when ≥ 2 whole bars were played
   (flagged, not counted for the tempo ladder), or always throw it away?
4. **Calls:** are incoming calls on your iPad set to **Banner** (Settings → Apps → Phone/FaceTime → Incoming Calls)?
   With Banner, a call you decline doesn't stop the take.
5. **Count-in voice offline:** is Apple's on-device voice fine when the home server isn't reachable, or should the
   app use clicks only (no spoken "one, two, three, four") until the Piper voice can be fetched?

---

## Sources (checked 2026-10-30)

- Apple, AVAudioPlayerNode (player timeline; "Scheduling playback time": `when` nil / sample time / host time;
  `stop()` unschedules; completion-handler deadlock note):
  https://developer.apple.com/documentation/avfaudio/avaudioplayernode
- Apple, AVAudioTime (host time = `mach_absolute_time()`; `init(hostTime:)`; `extrapolateTime(fromAnchor:)`):
  https://developer.apple.com/documentation/avfaudio/avaudiotime
- Apple, `setPreferredIOBufferDuration(_:)` (request only; check `ioBufferDuration`; minimum ≥ 5 ms / 256 frames;
  before or after activation): https://developer.apple.com/documentation/avfaudio/avaudiosession/setpreferrediobufferduration(_:)
- Apple, `AVAudioSession.outputLatency` (AirPlay ~2 s): https://developer.apple.com/documentation/avfaudio/avaudiosession/outputlatency
- Apple, `AVAudioNode.outputPresentationLatency`: https://developer.apple.com/documentation/avfaudio/avaudionode/outputpresentationlatency
- Apple, `AVAudioIONode.presentationLatency`: https://developer.apple.com/documentation/avfaudio/avaudioionode/presentationlatency
- Apple, Category `.playback` (Silent switch, screen lock, `UIBackgroundModes`, non-mixable by default):
  https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playback
- Apple, Handling audio interruptions (legacy `interruptionNotification` through iOS 26; iOS 27 lifecycle notifications;
  `setPrefersNoInterruptionsFromSystemAlerts`): https://developer.apple.com/documentation/avfaudio/handling-audio-interruptions
- Apple, `setPrefersNoInterruptionsFromSystemAlerts(_:)` (iOS 14.5+, banner-style calls only):
  https://developer.apple.com/documentation/avfaudio/avaudiosession/setprefersnointerruptionsfromsystemalerts(_:)
- Apple, `routeChangeNotification` (secondary thread) and `RouteChangeReason`:
  https://developer.apple.com/documentation/avfaudio/avaudiosession/routechangenotification ·
  https://developer.apple.com/documentation/avfaudio/avaudiosession/routechangereason
- Apple, `AVAudioEngineConfigurationChangeNotification` (engine stops and uninitialises; nodes stay attached):
  https://developer.apple.com/documentation/avfaudio/avaudioengineconfigurationchangenotification
- Apple, `mediaServicesWereResetNotification` (rebuild; don't restart playback until user action):
  https://developer.apple.com/documentation/avfaudio/avaudiosession/mediaserviceswereresetnotification
- Apple, AVSpeechSynthesizer (`write(_:toBufferCallback:)`, `usesApplicationAudioSession`):
  https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer
- Apple, `bluetoothHighQualityRecording` (iOS 26 session option; recording only, not used here):
  https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/bluetoothhighqualityrecording
- Apple Developer Forums: "AVAudioSession: understanding and controlling input/output latency"
  (https://developer.apple.com/forums/thread/25197); "Playing files simultaneously in AVAudioEngine" (one node plays
  in sequence; use several nodes, https://developer.apple.com/forums/thread/14138); "AVAudioPlayerNode won't play with
  host time" (https://developer.apple.com/forums/thread/93917); iOS 26 small-IO-buffer report
  (https://developer.apple.com/forums/thread/818594).
- Render timestamp `mHostTime` = when the buffer is handed to the hardware, plus output latency to hear it (Ableton
  Link iOS example code): https://gist.github.com/edb4b64b6aefa84c2874ec572c8c9ec1
- `react-native-audio-api`: npm dist-tags (`latest` 0.13.6, nightly `1.0.0-nightly-2084a4e-20261030`); both tarballs
  read with `npm pack`. 0.13.6 has no `getOutputTimestamp`, `outputLatency` or `baseLatency`. The nightly adds
  `outputLatency` (`ios/audioapi/ios/core/IOSAudioPlayer.mm`: `session.outputLatency + ioBufferDuration`) and
  `baseLatency` (render quantum / rate), and still has no output timestamp or host-time anchor. The 0.13.6 podspec
  has `prepare_command` and a `script_phase` that run `scripts/download-prebuilt-binaries.sh`; the nightly's
  `package.json` has `"prepare": "./scripts/build.sh"`. Publish date from `npm view react-native-audio-api time`.
- Expo docs, expo-audio `setAudioModeAsync` (`playsInSilentMode`, `interruptionMode`):
  https://docs.expo.dev/versions/v58.0.0/sdk/audio/ (search result only; docs.expo.dev isn't reachable from this
  container). Expo Modules `Function` (sync) vs `AsyncFunction` and `OnAppEntersBackground`/`OnAppEntersForeground`
  were read in `expo-modules-core` 58.0.26 sources (`ios/Api/Factories/SyncFunctionFactories.swift`,
  `EventListenersFactories.swift`).
- Repo: GATE0.md §3.2, §3.4, §9; `ClickScheduler.swift`, `HostClock.swift`; `src/play/{audio,player}.ts`;
  `src/ui/LatencyCard.tsx`; `src/engine/scoring.ts`; `src/voice/voice.ts`; RECON.md §3, §10; KIT.md (module back
  panel: PHONES, AUX IN; USB is MIDI only); CLAUDE.md dependency rule and `scripts/check-deps.mjs` (0.x and
  install-script checks).
