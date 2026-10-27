# Gate 0 checklist (owner, on the MacBook + iPad, then iPhone)

Print this, fill in the blanks, and paste the numbers back with the "Copy results" JSON. One sitting: about 60–90
minutes the first time (most of it is the one-time setup). Background and design: [GATE0.md](GATE0.md).

Date: __________ Mac: macOS ______ Xcode ______ Node ______ iPad model ______ iPadOS ______
iPhone model ______ iOS ______ Apple ID type: free / paid (free builds expire after 7 days)

> The probe's native code has never been compiled (it was written on Linux). If Xcode shows errors in
> `modules/drum-midi/ios/*.swift`, copy them verbatim and paste them back; don't spend long fixing them yourself.

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
- [ ] The kit: module **on**, USB cable from the module's USB-B into the iPad (USB-C to USB-B cable, or Apple's USB-C
      to USB adapter + the kit's cable).

---

## B. Rows M1–M9

For each row: do the steps, tick what holds, write the numbers. Press **Reset counters and log** before each row
that counts. After each row press **Copy results** and paste it somewhere (Notes) labelled with the row.

### M1. The development build runs with the native module
1. Open MIDI Probe on the iPad.

- [ ] The title "Drum Coach · MIDI probe (Gate 0)" shows and there is **no** orange "native DrumMidi module isn't in
      this build" warning.
- [ ] The native line under Devices shows `timebase ____/____` (expect 125/3 on Apple silicon).

Compile fixes needed? yes / no. If yes, what: _______________________________________________

### M2. The kit enumerates on the iPad and survives hot-plug
1. With the kit plugged in and on: look at **Devices**.
2. Unplug the kit's USB, wait 3 s, plug it back in. Then switch the module off and on.

- [ ] The kit is listed with a green dot, name ____________ (expect `e-Drum`), manufacturer ____________, and is
      **Selected** automatically.
- [ ] Unplugged: it turns **offline** (red) within ~2 s, or disappears. Replugged: online again and still Selected,
      without pressing anything; hits arrive again.
- [ ] Module off/on: same.
- Native line: connects ____ disconnects ____ setup notes ____ (connects should go up by about 1 per replug).

### M3. Notes, channel and filtering are right (the shared TS path)
1. Reset. Don't touch the kit for 10 s.
2. Hit each pad once, in this order, about 1 s apart: kick, snare, hi-hat (pedal up), hi-hat pedal press,
   hi-hat (pedal held down), tom 1, tom 2, floor tom, crash, ride.
3. Play 10 soft snare taps and 10 hard ones. Then a few quick snare doubles (fast "da-da").

- [ ] In the log, each pad shows the right note and name: kick 36 · snare 38 · hi-hat open 46 · pedal 44 ·
      hi-hat closed 42 · tom 1 48 · tom 2 45 · floor 43 · crash 49 · ride 51. All on **ch10**. Wrong ones:
      ______________
- [ ] After step 1 (idle 10 s): clock F8 ≈ 400 (one per ~24 ms) ____ · active sensing FE ____ · **hits 0**.
- [ ] The pedal press shows poly AT with **[choke]** entries and **no** hit from them. choke count ____
- [ ] note-off count ____ (of which note-on vel 0: ____): note-offs are never hits.
- [ ] Softest tap velocity ____, hardest ____ (expect ~15 to 127).
- [ ] hits ____ = number of strokes you played ____ (bounces show as orange **[filtered]**, not as hits).
      filtered ____ · off channel 10 ____ (expect 0) · dropped bytes ____ (expect 0) · time went back ____ (expect 0)

### M4. No doubled hits after background, lock and replug
1. Reset. Hit the snare 10 times slowly. hits should be 10.
2. Press Home (app to background), wait 10 s, come back. Hit the snare 10 times.
3. Lock the iPad, wait 10 s, unlock, back to the app. Hit the snare 10 times.
4. Unplug and replug the kit. Hit the snare 10 times.

- [ ] hits after each step: ____ / ____ / ____ / ____ (expect 10 / 20 / 30 / 40, never one stroke counted twice)
- [ ] Native line: connects ____ (expect +1 for the replug only, not +1 per foreground), background ____×,
      foreground ____×.

### M5. Tap-to-click timing, compared with the web app
**On the iPad** (use the speaker or the wired headphones you practise with; write which: ____________):
1. Tap test → **Start tap test**. After the 4 count-in clicks, hit the **snare** with each of the next 32 clicks
   (120 BPM). Play along, don't react. Do it **3 times**.

| Run | vs heard click: median | mean | spread ± | n | vs scheduled: median | output latency | IO buffer |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |

**On the Linux laptop, web app** (same day, same kit, Chrome — not snap Chromium):
1. In the repo: `npm run dev`, open **http://localhost:5173**, allow MIDI.
2. Click the **⚙ gear** button (Setup) in the header → Setup opens on the **Your kit** sub-tab → open the **Latency**
   row (its text says "Tap a pad with the click 16 times…" until it has been measured once) → **Start**. After the spoken "1, 2, 3, 4", hit the **snare** with each of the next
   16 clicks (60 BPM). Do it 3 times. Don't press Save unless you want to.
3. Write the line "You hit on average **X ms after/before** the click (**n** taps, spread **±S** ms)" and, if shown,
   "Your speakers add **N ms**".

| Web run | X (ms, + after / − before) | spread ± | n | speakers add |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

- [ ] iPad spread is within ~5 ms of the web spread: iPad avg spread ____ vs web ____
- [ ] iPad medians agree within ±5 ms across the 3 runs: ____ / ____ / ____
- [ ] Which offset is closer to your web number: vs heard / vs scheduled? ____________
- [ ] Native line: packets with ts=0 ____ (if > 0, CoreMIDI didn't stamp them; write it down).
- Optional: **Copy last tap test as fixture** and paste it back.

### M6. Bridge delay and jitter under load
1. Reset counters and **Reset delay stats**.
2. Play a busy groove for 2 minutes: 8ths on the hi-hat, kick and snare, plus 3 fast snare rolls and some crash hits.

- Bridge delay **JS − host**: min ____ median ____ p95 ____ max ____ ms (n ____)
- **native − host**: min ____ median ____ p95 ____ max ____ ms
- [ ] p95 (JS − host) ≤ 16 ms and max ≤ 50 ms. (Scoring uses the host timestamps, so this only affects how quickly
      a hit appears on screen.)
- [ ] events ____ ≈ native packets ____ (no events lost across the bridge).

### M7. iPhone
Install on the iPhone (`npx expo run:ios --device`, same steps as section A; for the kit you need a USB-C iPhone, or
a Lightning to USB 3 Camera Adapter with power for older ones; write which: ____________). Repeat **M1–M6 in short**:

- [ ] M1 runs · [ ] M2 kit listed (name ____) + replug · [ ] M3 notes OK, hits = strokes · [ ] M4 no doubles
- Tap test (2 runs): median ____ / ____ spread ____ / ____ · bridge p95 ____ max ____

### M8. Network MIDI from the Mac (for testing without the kit on the iPad)
1. On the iPad, Devices → switch **Network MIDI session** on. Note its name: ____________
2. On the Mac: Audio MIDI Setup → Window → **Show MIDI Studio** → open **MIDI Network Setup** (the Network/globe
   button). Under "My Sessions" add a session if none, tick it. Under "Directory" select the iPad, press **Connect**.
3. On the iPad: the session (e.g. "Session 1" or "Network Session 1") appears in Devices → **Select** it.
4. On the Mac: `cd spikes/midi-probe/tools && npm install && node replay-fixture.mjs --list`, then
   `node replay-fixture.mjs ../../../src/input/fixtures/emulated-ghost-groove.json --port "<the session name from --list>"`.

- [ ] Per pass the probe should count exactly: note-on **153**, note-off **153**, clock **1192**, active sensing **83**;
      and, if the network keeps the timing, hits **136** / filtered **17** (the web input path gives the same).
      Got: note-on ____ note-off ____ clock ____ active sensing ____ hits ____ filtered ____
- [ ] Sender lateness printed by the tool: median ____ p95 ____ max ____ ms; probe bridge p95 ____ ms
- [ ] Local Network prompt appeared and was allowed: yes / no

### M9. Ten-minute soak
1. Reset everything. Leave the probe open with the kit on for 10 minutes; play a little every minute or so (screen
   must not lock: Settings → Display & Brightness → Auto-Lock → Never for this test, then set it back).

- [ ] clock count ≈ 10 × 60 × 41.7 ≈ 25 000: ____ (a big shortfall means messages were lost)
- [ ] events ____ = native packets ____ · time went back ____ (expect 0) · dropped bytes ____ (expect 0)
- [ ] Bridge delay at the end: median ____ p95 ____ max ____ ms (no growth over time)
- [ ] One more tap test at the end: median ____ spread ____ (same as M5 within ±5 ms)

---

## C. Paste back

- [ ] The **Copy results** JSON for M2, M3, M4, M5, M6, M8, M9 (and the iPhone's).
- [ ] This sheet's numbers (a photo is fine).
- [ ] Any Xcode compile errors, verbatim.
- [ ] Optional: a tap-test fixture JSON.
