# Phase 1 gate: the new app on your iPad (owner, about 20 minutes)

This is the first build of the real app, `apps/mobile`. It is not the probe. Its MIDI code changed natively (batching,
auto-select, resume handling), so **this build is the first compile of that Swift**. If Xcode shows errors, paste
them back word for word and stop there.

The probe app stays installed. You can still use it for Gate 0's M4–M6.

## 1. Build and install (Mac, iPad on the cable)
```bash
cd ~/workspace/drum-coach && git pull
cd apps/mobile && npm ci
npx expo run:ios --device
```
- Pick the iPad.
- Signing: the bundle id is new (`com.drumcoach.app`). If Xcode asks, open `ios/DrumCoach.xcworkspace` → target →
  Signing & Capabilities → Team = your Personal Team, then run the command again. If it says the id is taken, change it
  on your Mac only.
- First build: 5–15 minutes. Keychain pop-up: your Mac password, then **Always Allow**.
- On the iPad: Settings → General → VPN & Device Management → Trust, if asked.

## 2. Open it (Metro on the Mac, or on Linux)
- Mac: `npx expo start --dev-client`.
- Or Linux: `cd apps/mobile && npm ci && npm start -- --lan`, then on the iPad tap **Enter URL manually**:
  `http://<linux-ip>:8081`.
- Allow **Local Network**.
- [ ] The home screen shows **Drum Coach**, the core link (snare = 38) and **"MIDI module: in this build"**.
- [ ] The screen is landscape and stays landscape when you rotate the iPad.

## 3. MIDI debug (kit plugged into the iPad, module on)
Tap **MIDI debug**.
- [ ] Devices shows **e-Drum (Medeli)**, online and connected, with **"Auto-select on (e-Drum)"**, without tapping
      Select.
- [ ] Hit every pad once. The log shows: Kick, Snare, Hi-hat open (pedal up), Hi-hat pedal, Hi-hat closed (pedal
      held), Tom 1, Tom 2, Floor tom, Crash, Ride, each with a velocity. The pedal's choke is **not** a hit.

## 4. Timing with batching (the fix for the 40–59 ms seen in Gate 0)
Tap **Reset counters**. Play steady 8th notes for 2 minutes, then leave the kit alone for 30 seconds. Write down:
- **Hit → JS p95:** ____ ms (target **< 20 ms**)
- bridge p95: ____ ms, max hold: ____ ms (about 33 ms at most)
- native batches ____ vs packets received ____; note-on flushes ____ vs your strokes ____

## 5. Unplug and replug
- [ ] Unplug the kit: within 2 s it shows offline and not connected. Plug it back in: it reconnects by itself and hits
      log again.
- [ ] The same with the module switched off and on.

## 6. Background (the stale-MIDI fix)
- [ ] Go to the Home Screen for 30 s and hit 10 pads while you're away. Come back: **those strokes don't appear.**
      Stale dropped: ____, oldest stale: ____ ms.
- [ ] Then play 10 strokes: exactly 10 hits, no doubles.

## 7. Send back
Tap **Copy debug info** → Copy, and paste it to me, with the numbers above and any Xcode errors.
