# drum-audio: checks for the Mac and the iPad

The Swift here was written in a Linux container with no Swift compiler: **none of it has been compiled or run**.
TypeScript tests, the type check, the Metro bundle and Expo autolinking were checked on Linux. Paste results back
verbatim (compile errors, the debug screen's numbers).

Design: `docs/mobile/AUDIO-DESIGN.md`. Debug screen: Home → (link pending) or open `drumcoach://dev/audio`.

Numbering: the design's text names three device checks "T6-1" (§2.2, clocks agree), "T6-3" (§3.2, IO buffer re-read)
and "T6-5/T6-6" (§6, §1.1), but its §7.1 table numbers them differently. This list uses **D1–D3** for the three device
checks part 1 can run now, and the §7.1 / §7.2 IDs for the rest.

## 0. Compile (Mac)

1. `cd apps/mobile && npm ci && npm run ios:device` (the usual build; `modules/**` changed, so rebuild).
2. Compile errors stay inside `modules/drum-audio/ios`. Paste them back as they are.
3. **T6-6, pure Swift tests:** `cd apps/mobile/modules/drum-audio/ios/Core && swift test` (Xcode's toolchain; no
   simulator needed). It runs `HostClockTests`, `AudioPolicyTests`, `EventPackingTests`, `EventQueueTests`,
   `SynthTests` and `BackingMathTests`. The vectors are the same as the Vitest ones in `modules/drum-audio/src/*.test.ts`. All must pass.

## 1. Smoke (iPad, debug build, speaker, nothing else playing)

Open the audio debug screen.

| # | Do | Pass |
|---|---|---|
| S1 | **Start engine** | Output "Speaker (speaker)", key `Speaker`; output latency ≈ 5.7 ms; sample rate 48000; heard offset = output latency (branch A); min lead = IO buffer + heard offset + 10. "Last error" is `–`. |
| S2 | Each touch pad, then the three click buttons | Every sound plays and resembles the web app's. A fast crash then snare, kick, hi-hat: the crash keeps ringing (pool, not cut). |
| S3 | **Prepare one…four, and**, then tap each word | "ready: …" within a few seconds; each word is spoken. If some are "missing", note which. |
| S4 | Metronome 120 BPM quarters, then 240 BPM sixteenths, 4/4 and 3/4 | Steady clicks, accent on beat 1. Stats: late 0, dropped 0. Pools: click ≤ 4 nodes. Loop "max gap" under ~20 ms. |
| S5 | Metronome running, press the iPad's Home button and come back | Clicks stop. Events shows `interruption engine-stopped (background)`. **Start metronome** works again at once. |

## 2. Device checks part 1 can run now

| ID | Do | Pass |
|---|---|---|
| **D1** clocks agree (design §2.2 "T6-1") | **Compare with DrumMidi** five times | `midi − audio` within ±0.01 ms (both read `mach_absolute_time()`). |
| **D2** IO buffer (design §3.2 "T6-3") | Kill other audio apps. **Start engine**, write down IO buffer. Then play something in Music, **Suspend**, **Start engine** again, write it down again. | Report both numbers. 5.33 ms = the 5 ms request granted; 21.33 ms = the hardware kept 1024 frames. Either works; it only changes min lead and touch latency. |
| **D3** = §7.1 **T6-8** timing probe | Metronome 120 BPM quarters → **Start probe** → wait **5 minutes** (screen stays on) → **Stop probe** | `|error| p99 < 0.5 ms`, `slope < 1 ms per 5 min`, matched ≈ 600, late = 0. Report the mean offset too (expected about 0: tap times and schedule times are both engine render times). |

If D3 fails on jitter (p99 ≥ 0.5 ms), the fallback in the design (one `AVAudioSourceNode` sequencer) applies; paste the
numbers and the "Detail" row.

## 3. Later checks (need part 2: createTake, the LatencyCard port, A6's screens)

| ID | Pass |
|---|---|
| T6-9 tap test through the AudioPort (speaker), M5b on a second route | median within ±5 ms of M5; spread ≤ web + 3 ms; M5b decides `heardOffsetMs` (one constant: `HEARD_OFFSET_BRANCH` in `src/policy.ts` and `AudioPolicy.heardOffsetBranch` in Swift). |
| T6-10 5-minute take with the kit | mean offset minute 1 vs minute 5 within ±3 ms |
| T6-11 touch pads, Release build | touch → sound p95 ≤ 35 ms (slow-motion video), else the native pad view (design §1.1) |

## 3b. Backing audio (A4p3, the Backing card)

`AudioPort.backing` plays a local file (never YouTube audio): `AVAudioFile` → player → `AVAudioUnitTimePitch` → backing
bus. The card's test tone is 44.1 kHz on purpose (the backing mixer converts it to 48 kHz). Metronome 120 BPM quarters
4/4 running for every row; screen stays on.

| ID | Do | Pass |
|---|---|---|
| B1 | **Load test tone** at 100 %, **Start on next bar** | The blips start on a bar line and sit on the click (880 Hz on bar 1 of 4, 660 Hz downbeats, 440 Hz beats). Plan: joined late 0, time-pitch 0, host-time start. |
| B2 | Leave B1 running 2 minutes ("Readings … (done)") | Speaker: drift now and smoothed within ±1 ms of each other; \|slope\| < 0.1 ms per minute; min/max span < 2 ms. Paste the rows. A constant offset (the same number all along) is the heard-offset question (M5), not drift. |
| B3 | 75 % and 50 %: **Load test tone** again (it is written at bpm / rate), **Start on next bar** | Same pitch as at 100 %; blips still on the click. Plan says node-time start; note the time-pitch latency. Paste the drift rows after 2 minutes: a constant offset or a jitter of a few ms here is the unverified part (the node timeline behind the time-pitch unit). |
| B4 | During B1, connect and disconnect Bluetooth (or wired) headphones | Events show the route; Native "re-anchors" goes up; the tone keeps playing on the new output on its line (the metronome stops, as in T7-5; restart it to compare by ear). |
| B5 | During B1: Home and back; Siri; Suspend | The tone stops with the engine ("playing false"); **Start on next bar** works again. |
| B6 | Start with the metronome off, **Stop** after 10 s, **Start** again | Starts at once; no crash; "Native error" `–`. |
| B7 | Seamless loops (F2): at 100 %, then 75 %, **Load test tone**, **Loop 1 bar**; listen 2 minutes | Every bar starts with the 880 Hz blip on the click's bar 1, evenly, with no gap, double blip or stumble at the seam. Native: "queued" ≈ bars in 2 min, gaps 0, skips 0. Drift rows as in B2/B3 (no step at the seams). Paste the rows. |

## 4. Robustness (§7.2 T7, on the debug screen now; repeat in a take after part 2)

| # | Do | Pass |
|---|---|---|
| T7-1 | Silent mode on (Control Center), metronome | The click plays (`.playback`). |
| T7-2 | Siri mid-metronome; then a Clock alarm | Events: `interruption began`, later `ended`. Clicks stop; **Start metronome** works at once. |
| T7-3 | Incoming FaceTime call, banner style, declined; then full-screen style | Banner: clicks continue. Full screen: as T7-2. |
| T7-4 | Lock and unlock mid-metronome | Events: `engine-stopped (background)`. Next start is clean. |
| T7-5 | Connect Bluetooth headphones idle, then mid-metronome; a USB-C audio adapter through a hub | Events: `route → …` with the new key and latency; the route card updates; the metronome stops (native cancels everything queued); while the engine runs, also `engine-stopped / route-change` (QA2 M1: a lesson or Practice take ends as interrupted, ≥ 2 whole bars kept and flagged). Bluetooth latency is large (100–250 ms). |
| T7-6 | Settings → Developer → Reset Media Services while idle | Events: `engine-stopped (media-reset)`. **Start engine** works (the graph is rebuilt). |
| T7-7 | Music playing, then start the metronome | Both audible (`mixWithOthers`); Music doesn't stop. |
| T7-8 | 10-minute metronome soak | late 0, dropped 0; "Pending" stays small; memory flat in Xcode's gauge. |

## What to paste back

The compile errors (if any), the `swift test` summary, S1–S5 pass/fail, D1–D3 numbers (copy the Timing probe rows),
B1–B6 (copy the Backing card rows), T7 pass/fail, and anything in "Last error".
