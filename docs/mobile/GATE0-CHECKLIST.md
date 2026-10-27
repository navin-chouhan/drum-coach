# Gate 0 checklist (owner, on the MacBook + iPad)

> **v1 is iPad only (owner decision D0).** Skip M7 (iPhone) and the iPhone fields.

Print this, fill in the blanks, and paste the numbers back with the "Copy results" JSON. One sitting: about 60–90
minutes the first time (most of it is the one-time setup). Background and design: [GATE0.md](GATE0.md).

Date: __________ Mac: macOS ______ Xcode ______ Node ______ iPad model ______ iPadOS ______
iPhone model ______ iOS ______ Apple ID type: free / paid (free builds expire after 7 days)

> The probe's native code has never been compiled (it was written on Linux). If Xcode shows errors in
> `modules/drum-midi/ios/*.swift`, copy them verbatim and paste them back; don't spend long fixing them yourself.
> If the app **freezes at start**, see GATE0.md §5 "First compile on the Mac" (a one-line fallback).

---

## A. One-time setup (Mac and iPad)

- [ ] **Xcode** from the App Store, opened once (accept the licence, let it install the iOS platform).
      Then: `sudo xcode-select -s /Applications/Xcode.app`.
- [ ] **CocoaPods**, if the build asks for it: `brew install cocoapods`.
- [ ] **Node 22 or newer** (the plan assumes 24): `node -v`.
- [ ] Xcode → Settings → Accounts → add your Apple ID (a Personal Team is enough).
- [ ] Get the code: `git clone …` (or `git pull`), then `cd spikes/midi-probe && npm ci`.
- [ ] iPad: connect it to the Mac with a USB-C cable, unlock it, tap **Trust This Computer**.
- [ ] iPad: Settings → Privacy & Security → **Developer Mode** → on → restart → confirm "Turn On".
- [ ] Build and install: `npx expo run:ios --device` → pick the iPad.
      If signing fails: open `ios/MIDIProbe.xcworkspace`, target MIDIProbe → Signing & Capabilities → Team = your
      Personal Team (if the bundle ID `com.drumcoach.midiprobe` is taken, change it **locally only**). Don't commit
      anything under `ios/` (it is generated and gitignored), and never commit a team ID.
- [ ] iPad: Settings → General → VPN & Device Management → your developer profile → **Trust**.
- [ ] Xcode → Window → Devices and Simulators → the iPad → tick **Connect via network**. Unplug the cable: the iPad's
      single USB-C port is now free for the kit (B6). Mac and iPad on the same Wi-Fi.
- [ ] Start Metro: `npx expo start --dev-client` (in `spikes/midi-probe`). Open **MIDI Probe** on the iPad; it finds
      Metro (or scan the QR code). When iPadOS asks to find devices on the **Local Network**, tap **Allow** (Metro and
      Network MIDI both need it).

---

## A2. Owner's flow: install from the Mac, then test from Linux

The Mac is only needed to **build and install** (section A, step 0, M1 and M8, about 30 min). Then the kit tests
run with **Metro on the Linux machine**:
1. On Linux: `git fetch origin && git checkout claude/drum-coach-expo-ios-x6c1iq && git pull`, then
   `cd spikes/midi-probe && npm ci && npx expo start --dev-client --lan`.
2. Note the `exp+...://...` URL or the QR code it prints. Allow TCP port **8081** in the Linux firewall if one is on
   (e.g. `sudo ufw allow 8081/tcp`).
3. On the iPad, open MIDI Probe → the dev launcher → **Enter URL manually** with `http://<linux-ip>:8081` (or scan the
   QR code). The Mac can now be off. The iPad and Linux machine must be on the same Wi-Fi.
4. Do M2–M6 at the kit, then M5's web half on the same Linux machine.

Rebuild on the Mac only when native code changes (`modules/drum-midi/ios/*.swift`, `app.json`, new native
libraries), or every 7 days (free Apple ID).

---

## B. Step 0: the app builds and opens

1. Open MIDI Probe on the iPad (kit not plugged in yet).

- [ ] The title "Drum Coach · MIDI probe (Gate 0)" shows and there is **no** orange "native DrumMidi module isn't in
      this build" warning. The UI responds (scrolls, buttons work).
- [ ] The native line under Devices shows `timebase ____/____` (expect 125/3 on Apple silicon).

Compile fixes needed? yes / no. If yes, what: _______________________________________________

---

## C. Rows M1–M9

For each row: do the steps, tick what holds, write the numbers. Press **Reset counters and log** before each row
that counts. After each row press **Copy results** and paste it somewhere (Notes) labelled with the row.

### M1. Kit → Mac (Audio MIDI Setup): baseline sanity check
1. Plug the kit's USB into the Mac, module on.
2. Audio MIDI Setup → Window → **Show MIDI Studio**.

- [ ] **`e-Drum`** is visible (not greyed out). Name shown: ____________
- Then unplug it from the Mac.

### M2. Kit → iPad (USB-C direct)
Plug the module's USB into the iPad (USB-C to USB-B cable, or Apple's USB-C to USB adapter + the kit's cable),
module on.

1. Look at **Devices**.
2. Reset. Don't touch the kit for 10 s.
3. Hit each pad once, in this order, about 1 s apart: kick, snare, hi-hat (pedal up), hi-hat pedal press,
   hi-hat (pedal held down), tom 1, tom 2, floor tom, crash, ride.
4. Play 10 very soft snare taps and 10 very hard ones.

- [ ] **`e-Drum`** is listed with a green dot and **Selected** automatically. Name ____________ manufacturer
      ____________
- [ ] Every pad's note is correct in the log, all on **ch10**: kick 36 · snare 38 · hi-hat open **46** (pedal up) ·
      pedal **44** · hi-hat closed **42** (pedal held) · tom 1 48 · tom 2 45 · floor 43 · crash 49 · ride 51.
      Wrong ones: ______________
- [ ] Velocity range seen: softest ____ hardest ____ (expect about **15 to 127**).
- [ ] Note-offs handled: note-off ____ (of which note-on vel 0: ____). None of them shows as a hit.
- [ ] Choke: pressing the pedal shows poly AT 127 on 42/44/46 with **[choke]**, never a hit. choke count ____
- [ ] Clock and active sensing filtered: after the 10 s idle, clock F8 ≈ 400 (one per ~24 ms) ____, active sensing FE
      ____, and **hits 0**. They never appear as hits.
- [ ] hits ____ = number of strokes you played ____ (bounces show as orange **[filtered]**, not as hits).
      off channel 10 ____ (expect 0) · dropped bytes ____ (expect 0) · time went back ____ (expect 0)

### M3. Unplug and replug the kit while the app runs
1. With the probe open and the kit selected, unplug the kit's USB. Count seconds until it shows offline (red) or
   disappears.
2. Wait 3 s, plug it back in. Count seconds until it is online and Selected again.
3. Without touching the app, hit the snare 10 times. Then repeat 1–3 once more by switching the module off and on.

- [ ] List updates within **2 s**: unplug ____ s, replug ____ s; module off ____ s, on ____ s.
- [ ] Hits resume **without restarting the app** (and without pressing Select): hits ____ after 10 strokes.
- Native line: connects ____ disconnects ____ setup notes ____ (connects should go up by about 1 per replug).

### M4. App to background and back; screen lock and unlock
1. Reset. Hit the snare 10 times slowly. hits should be 10.
2. Press Home (app to background), wait 10 s, come back. Hit the snare 10 times.
3. Lock the iPad, wait 10 s, unlock, back to the app. Hit the snare 10 times.

- [ ] MIDI resumes each time: hits after each step ____ / ____ / ____ (expect **10 / 20 / 30**).
- [ ] **No doubled hits**: never one stroke counted twice (the log shows one `[hit]` per stroke).
- Native line: connects ____ (should not go up on foreground), background ____×, foreground ____×.

### M5. Tap test on the iPad, then the same tap test in the web app on Linux
**On the iPad** (use the speaker or the wired headphones you practise with; write which: ____________):
1. Tap test → **Start tap test**. After the 4 count-in clicks, hit the **snare** with each of the next 32 clicks
   (120 BPM). Play along, don't react. Do it **3 times**.

| Run | vs heard click: mean | median | spread ± | n | vs scheduled: mean | output latency | IO buffer |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |

**On the Linux laptop, web app** (same day, same kit, Chrome — not snap Chromium):
1. In the repo: `npm run dev`, open **http://localhost:5173**, allow MIDI.
2. Click the **⚙ gear** button (Setup) in the header → Setup opens on the **Your kit** sub-tab → open the **Latency**
   row (its text says "Tap a pad with the click 16 times…" until it has been measured once) → **Start**. After the
   spoken "1, 2, 3, 4", hit the **snare** with each of the next 16 clicks (60 BPM). Do it 3 times. Don't press Save
   unless you want to.
3. Write the line "You hit on average **X ms after/before** the click (**n** taps, spread **±S** ms)" and, if shown,
   "Your speakers add **N ms**".

| Web run | X (ms, + after / − before) | spread ± | n | speakers add |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

- [ ] **Spread (jitter) on the iPad ≤ web spread + 3 ms**: iPad average spread ____ vs web average spread ____
- [ ] **Mean offset stable across the 3 iPad runs (± 5 ms)**: ____ / ____ / ____
- [ ] Which offset is closer to your web X: vs heard / vs scheduled? ____________
- [ ] Native line: packets with ts=0 ____ (if > 0, CoreMIDI didn't stamp them; write it down).
- Optional: **Copy last tap test as fixture** and paste it back.

### M6. Bridge delay
1. Reset counters and **Reset delay stats**.
2. Play a busy groove for 2 minutes: 8ths on the hi-hat, kick and snare, plus 3 fast snare rolls and some crashes.

- Bridge delay **JS − host**: min ____ median ____ p95 ____ max ____ ms (n ____)
- **native − host**: min ____ median ____ p95 ____ max ____ ms
- [ ] **p95 (JS − host) < 20 ms.** (Visual feedback only: scoring uses the host timestamps.)
- [ ] events ____ ≈ native packets ____ (no events lost across the bridge).

### M7. Kit → iPhone (USB-C, or Lightning via the camera adapter): **SKIPPED, v1 is iPad only**
Install on the iPhone (`npx expo run:ios --device`, the same steps as section A). Connection used: USB-C direct /
Lightning to USB 3 Camera Adapter / other: ____________. Then do **all of M2** on the iPhone.

- [ ] Same as M2: e-Drum listed (name ____), every pad's note correct, velocity ____–____, note-offs and choke never
      hits, clock/active sensing filtered, hits ____ = strokes ____.
- [ ] **Does the kit enumerate without external power?** yes / no. If no: what made it work (powered adapter, hub,
      charger in the camera adapter): ____________

### M8. Mac sends the emulated fixture over a Network MIDI session to the iPad
1. On the iPad, Devices → switch **Network MIDI session** on. Note its name: ____________
2. On the Mac: Audio MIDI Setup → Window → **Show MIDI Studio** → open **MIDI Network Setup** (the Network/globe
   button). Under "My Sessions" add a session if none, tick it. Under "Directory" select the iPad, press **Connect**.
3. On the iPad: the session (e.g. "Session 1" or "Network Session 1") appears in Devices → **Select** it. Reset.
4. On the Mac: `cd spikes/midi-probe/tools && npm install && node replay-fixture.mjs --list`, then
   `node replay-fixture.mjs ../../../src/input/fixtures/emulated-ghost-groove.json --port "<the session name from --list>"`.

- [ ] **Hits arrive.** Per pass the probe should count exactly: note-on **153**, note-off **153**, clock **1192**,
      active sensing **83**; and, if the network keeps the timing, hits **136** / filtered **17** (the web input path
      gives the same). Got: note-on ____ note-off ____ clock ____ active sensing ____ hits ____ filtered ____
- [ ] Sender lateness printed by the tool: median ____ p95 ____ max ____ ms; probe bridge p95 ____ ms
- [ ] Local Network prompt appeared and was allowed: yes / no

### M9. Optional: Bluetooth MIDI adapter (only if you have one)
The probe has no Bluetooth pairing screen. Pair the adapter first in an app that has one (e.g. GarageBand →
Settings → Advanced → Bluetooth MIDI Devices); once connected it shows up as a source for every app.

1. Kit's 5-pin MIDI OUT → the adapter. Pair it as above, then open the probe: it should be listed. Select it.
2. Repeat the M2 pad check and one M5 tap test.

- [ ] Listed as ____________ · notes correct · hits = strokes ____ / ____
- [ ] Tap test: mean ____ spread ____ (compare with M5) · bridge p95 ____ ms

### X1. Optional extra: ten-minute soak
1. Reset everything. Leave the probe open with the kit on for 10 minutes; play a little every minute or so (the
   screen must not lock: Settings → Display & Brightness → Auto-Lock → Never for this test, then set it back).

- [ ] clock count ≈ 10 × 60 × 41.7 ≈ 25 000: ____ (a big shortfall means messages were lost)
- [ ] events ____ = native packets ____ · time went back ____ (expect 0) · dropped bytes ____ (expect 0)
- [ ] Bridge delay at the end: median ____ p95 ____ max ____ ms (no growth over time)
- [ ] One more tap test at the end: mean ____ spread ____ (same as M5 within ±5 ms)

---

## D. Paste back

- [ ] The **Copy results** JSON for M2, M3, M4, M5, M6, M8 (and M9 / X1 if done).
- [ ] This sheet's numbers (a photo is fine).
- [ ] Any Xcode compile errors, verbatim, and whether you needed the start-up fallback.
- [ ] Optional: a tap-test fixture JSON.
