# Final checklist: the iPad app at the kit, in one sitting (owner)

About 3 hours. The Mac builds and installs; the Linux laptop runs the home server (and Metro if you like); you sit at
the MPS-150 with the iPad. Tick each box, write the numbers in the blanks, and paste back section 12.

What's already known (so you don't need to report it again):
- The first QA pass ([QA-2026-10-31.md](QA-2026-10-31.md)) found 4 major issues, all fixed since (I3): **M1** a grey
  header bar above the lesson player, **M2** no touch pads on Practice's play screen, **M3** Practice ignored
  calls/backgrounding, **M4** "Practise" on a song row in Progress did nothing. The places marked **(M1)**…**(M4)**
  below check that they stay fixed. The hardware keyboard works (I2), and Practice lists imported MIDI files.
- The second QA pass ([QA2-2026-10-31.md](QA2-2026-10-31.md): 4 major, 9 minor) is being fixed in the next wave.
  Steps marked **(QA2 …)** check those fixes; if one fails, note the build's commit (`git log --oneline -1`).
- Still not built: the API-key coach fallback (Setup says so).

The cloud iOS build (`.github/workflows/ios.yml`, Xcode 27.1) already compiles the whole app, all Swift included, and
the SwiftPM tests pass, so a compile error on your Mac would be a local setup problem, not new code.

---

## 1. Build and install (Mac, iPad on the cable) — 20 min
```bash
cd ~/workspace/drum-coach && git fetch origin && git checkout claude/drum-coach-expo-ios-x6c1iq && git pull
cd apps/mobile && npm ci
npx expo run:ios --device          # the debug build first: it has the Dev row (MIDI, Audio, Server, Play, Build)
```
- Signing as in PHASE1-CHECKLIST §1 (Personal Team; bundle id `com.drumcoach.app`; change it locally only if taken).
- Free Apple ID (B7): the install expires in 7 days.
- [ ] The app opens on **the first run** (black bar with 4 step pills: Welcome, Plug in, Your pads, Latency), landscape,
      and stays landscape when you turn the iPad.
- [ ] Xcode → Devices and Simulators → the iPad → **Connect via network** is ticked (the USB-C port is about to go to the hub).

## 2. The hub setup (D6) — 10 min
USB-C hub on the iPad: **kit USB → hub**, **hub 3.5 mm out → module AUX IN**, charger into the hub's PD port if it
has one. Headphones on the module. Metro: on the Mac (`npx expo start --dev-client`) or on Linux
(`cd apps/mobile && npm ci && npm start -- --lan`, then **Enter URL manually** `http://<linux-ip>:8081`). Allow **Local Network**.
- [ ] The kit enumerates through the hub: Setup → Kit shows **e-Drum** connected (sidebar pill "kit" green). Hub model: ____
- [ ] Click and kit sounds are in the module's headphones (iPad speaker silent). Setup → Latency shows the route
      name: ____ (expect "USB audio" or "Headphones"; it must **not** say Speaker).
- [ ] Charging through the hub while the kit is plugged in: yes / no / hub has no PD.

## 3. Home server (Linux) — 10 min
Follow [HOME-SERVER.md](HOME-SERVER.md): `.env` with `APP_HOST=0.0.0.0`, `APP_TOKEN` (≥ 24 chars), `ALLOWED_HOSTS`;
firewall port 8787 on the Wi-Fi interface; `npm run server`.
- [ ] Setup → Coach · home server: URL `http://<linux-ip>:8787`, paste the token → **Save and test** →
      "✓ Connected · ____ ms". The token field shows 🔒 afterwards (Keychain); the sidebar's coach pill turns green.
- [ ] A wrong token says the server refused it; a wrong URL says it didn't answer. Then fix it again.

## 4. Gate 0 leftovers on the app's MIDI debug screen (debug build) — 20 min
Sidebar → Dev row → **MIDI** (`/dev/midi`). These replace the probe's M4–M6 (GATE0-CHECKLIST.md).
- **M4 background / lock:** Reset. 10 slow snare hits; Home 10 s and back; 10 hits; lock 10 s, unlock; 10 hits.
  - [ ] Hits after each step ____ / ____ / ____ (expect 10 / 20 / 30), never one stroke counted twice.
  - [ ] Strokes played **while away** don't appear on return (Stale dropped: ____, oldest stale ____ ms) (B25).
- **M6 bridge delay:** Reset. A busy groove 2 min (8ths on the hat, kick, snare, 3 fast rolls, crashes).
  - Hit → JS: median ____ p95 ____ max ____ ms; Bridge: median ____ p95 ____; max hold ____ ms.
  - [ ] **p95 (hit → JS) < 20 ms** (B24). If not, repeat in the Release build (section 10).
  - [ ] Note-ons ≈ your strokes; the pedal's choke is never a hit; clock (F8) and active sensing (FE) counted, not hits.
- **M5 tap test**, iPad half: Setup → Latency → **Measure** → Start; hit the snare with each of the 16 clicks (60 BPM).
  3 runs. Web half on Linux in section 9.

  | iPad run | average after the click | steady ± | hits |
  |---|---|---|---|
  | 1 | | | |
  | 2 | | | |
  | 3 | | | |
  - [ ] The 3 averages within ± 5 ms of each other. Then **Save** the last one: the Latency row shows ____ ms for this route.
- **M8 (optional)**, Network MIDI, in the app (QA m9): Dev → **MIDI**, switch **Network MIDI session** on and note its
  name ____. On the Mac, connect to it in Audio MIDI Setup → MIDI Network Setup (as GATE0-CHECKLIST M8 steps 2–3), then
  **Select** the session on the iPad and press **Reset counters**. On the Mac:
  `cd scripts/mobile-playtest && npm ci && node replay-to-ipad.mjs --list`, then
  `node replay-to-ipad.mjs --port "<the session>" --fixture emulated-ghost-groove` (one pass).
  On the iPad: **Copy debug info**, save it as `debug.json` on the Mac, and run
  `node compare.mjs debug.json --fixture emulated-ghost-groove` (tolerant ±5 ms by default; the report keeps every kit
  hit since Reset, up to 5000).
  - [ ] Counters for the pass: note-on **153**, clock **1192**, active sensing **83**; hits **136** / filtered **17**.
        Got: note-on ____ clock ____ active sensing ____ hits ____ filtered ____
  - [ ] `compare.mjs` prints **SAME** or **SAME within tolerance** (paste its output); median ____ max |____| ms.
  - [ ] **Back to the kit (QA2 M4):** switch **Network MIDI session** off. The app falls back to the e-Drum by itself
        within a few seconds (Devices: e-Drum · connected). If it doesn't, **Select** e-Drum under Devices (or press
        **Auto-select e-Drum**, or Setup → MIDI input → **Use this**). Check the sidebar's kit pill is green before
        section 5: the rest of the session needs the kit.

## 5. Audio checks (`apps/mobile/modules/drum-audio/CHECKS.md`) — 25 min
Sidebar → Dev row → **Audio**. Section 0 (compile) is done by the cloud build; still run the pure Swift tests on the Mac:
`cd apps/mobile/modules/drum-audio/ios/Core && swift test`.
- [ ] `swift test`: all pass (paste the summary).
- [ ] **S1–S5** (smoke) on the hub route instead of the speaker, then S1 once on the speaker (unplug the 3.5 mm).
- [ ] **D1** clocks agree: `midi − audio` within ±0.01 ms, 5 times.
- [ ] **D2** IO buffer: ____ ms, then after Music + Suspend: ____ ms.
- [ ] **D3** 5-minute timing probe: p99 |error| ____ ms (< 0.5), slope ____ ms/5 min (< 1), matched ____, late ____.
- [ ] **B1–B6** backing card (test tone at 100 %, 75 %, 50 %; drift rows after 2 min; route change; Home; restart).
- [ ] **T7-1…T7-8** robustness (silent switch, Siri, FaceTime banner then full screen, lock, Bluetooth / hub route
      change, Reset Media Services, Music + metronome, 10-min soak).

## 6. First run (fresh install: delete the app and run `npx expo run:ios --device` again, or do this first) — 10 min
- [ ] **Welcome:** goals chips, minutes (25 recommended), "Played drums before?"; **Continue** (also hi-hat pedal × 3).
- [ ] **Plug in:** "e-Drum found"; hitting the snare shows the pad you hit with its note and velocity and "it works".
- [ ] **Your pads:** "Hit TOM 1" etc. in huge type; a wrong pad says which pad it was; hitting the pad is the answer
      (no screen taps). Set tom 1 to 49 on the module (VOICE → PAGE to N…) to see the **duplicate note** stop with the
      module fix; set it back to 48 and finish.
- [ ] **Latency:** 16 hits with the click → the delay and how steady → Save → Journey.
- [ ] Sidebar pills afterwards: kit green, latency ____ ms, coach (green if section 3 is done).

## 7. Every screen — 70 min
Kit gestures everywhere: hi-hat pedal × 3 or crash × 2 = yes / the big move, tom 2 × 2 = listen, floor × 2 = slower,
tom 1 × 2 = faster (warm-up), ride × 2 = next, crash × 4 = stop.

**Journey**
- [ ] Coach line, Up next with the groove preview, four moves with gesture pills, You (rank, streak, landed, minutes),
      Today's set with the minute bar, Stage song, the trail. Everything fits without scrolling.
- [ ] **Start** by hi-hat pedal × 3 opens today's item; ride × 2 = Something else; tom 2 × 2 = Hear it.
- [ ] Skill map and Full path open Progress on those views.
- [ ] **Find my level:** a rung with its sheet; **Play it** (hi-hat pedal × 3) → a take; a clean one moves up a rung,
      a rough one ends the test with "Start there"; **Start at this stage** goes back to Journey on that stage.
- [ ] **More ways to play → 🌊 Flow:** the player opens on your newest finished groove (the jam lesson if none), the
      big move is **Flow ▶**; the groove loops, the click fades out, nothing passes or fails; crash × 4 stops.
- [ ] **More ways to play → 🥢 Stick technique:** every movement (grip, full stroke … kick); ✓ Right / ✗ Wrong,
      1× ½× ¼×, the tempo 40–100; "Talk me through it" speaks (not during a take); ← Journey (or Esc) goes back.

**Lesson player** (open a groove with a tempo ladder, e.g. Stage 1–3)
- [ ] Full screen, **no grey header bar above the black bar** **(M1)**; Sheet is the default, Highway switches (left to right).
- [ ] Before: coach line, moves (Play / Hear it / Slower / Skip) with gestures, the goal with tick boxes, the kit view
      lights on each hit. Hints (H) and Band (B) toggle.
- [ ] Count-in: one bar with the big number on the beat; then the take: cursor on the sheet, notes turn green /
      orange (+ms sticker) / red dashed MISS / red ✕ extra; one live tip at a time; **crash × 4 stops**.
- [ ] Results: verdict line, the whole take on the notes, timing line ("on average N ms late"), take card (count, stars,
      best run, extras), one thing to fix with **Fix bar N**, Ask the coach.
- [ ] Two clean takes → the tempo goes up 5 (ladder), Journey's set ticks the item done.
- [ ] **Hear your take**, **Share take** (share sheet with `<title> <UTC stamp>.mid`, e.g. `Rock beat 2026-10-31-14-05.mid`,
      the web's name; AirDrop it to the Mac and open it).
- [ ] **Interrupted take (D6):** start a take, press Home after ≥ 2 bars → back: kept and flagged, not on the ladder.
      Again after 1 bar: dropped with a short notice.
- [ ] Unplug the kit: the player switches to the **touch pads**; two fingers = hi-hat + kick together; a take with
      touch pads scores; plug back in: the kit view returns.
- [ ] **Intro slides** (a step's first take): 4 slides (what · who plays what · count it · how it moves). Hi-hat × 1
      forward, snare × 1 back (on a keyboard → / Enter, ←, Esc closes); "Ready ▶" starts the count-in. The other
      gestures do nothing while they're up. Next take at the same tempo: no slides; 15 BPM faster: slides again.
- [ ] **Ear quiz** (Full path → Stage 0 "Steady or rushed?"): A then B play; answer hi-hat (A) or snare (B) (keys 1–2),
      tom 2 × 1 (R) hears it again; ✓ Right / Not quite after each, 4 rounds, "N of 4 right", **Done** → step 2.
      "Where's the kick?" (Stage 2): three answers with hi-hat / snare / floor (keys 1–3).
- [ ] **Transcription** (Stage 2 "Write what you hear"): the groove plays twice; tap boxes, **Check it** marks right /
      ✕ extra / ? missing; after two checks **Show me** fills it; 80 % passes → **Done**.
- [ ] **Look step** (Stage 3 "The flam", step 1): the animated How it moves, one move (Done = hi-hat pedal × 3).
      **Listen step** (Stage 2 "Listen: the money beat"): **▶ Find it on YouTube** opens the search, "✓ I listened: next step".
- [ ] ⋯ More → **🤸 How it moves** opens the full-size demo for this lesson; Esc or ✕ closes it.
- [ ] Hardware keyboard: H hints, B band, Esc stops a take / closes More, the coach panel and the celebration;
      Enter on the celebration is its main button.

**Practice**
- [ ] Pick up where you left off, the warm-up card (tom 1 × 2 starts it), For you cards with the yellow ring (ride × 2
      moves it, hi-hat pedal × 3 plays it), the library by kind, search.
- [ ] Play screen: − / + tempo with best clean, loop bars, times round, Climb (2 clean takes → +5), How it plays chips,
      your takes here; a take saves (it shows in Progress).
- [ ] Unplug the kit: touch pads on the play screen **(M2)**. Home mid-take: the take stops **(M3)**.
- [ ] An exercise's first take shows the intro slides (not for the warm-up, Hear it or wait mode); hi-hat × 1 turns them.
- [ ] After a take: **📊 Details and history** shows accuracy, timing and dynamics;
      **Play again** plays, **Back** returns to the take card. Esc stops a take.
- [ ] Metronome (🔔): change the tempo and its options; steady clicks in the module's headphones. Play a tom fill
      while it runs: the tempo must not change **(QA2 M3)**.

**Progress**
- [ ] Getting better (landed per day), This week, skill map, trophies, Your time, Your lessons in plain words, with
      today's takes in them. "Practise" on a lesson row opens it; on an exercise opens Practice at best + 5;
      on a song row opens the song **(M4)**. This month's report (needs the server).
- [ ] Trophies: "Show-off song" counts the bars of a song you played at 85 % or better (____ / 16 bars) **(QA2 m2)**.
      Optional: a song checked by ear with 16+ bars all ready lands in the **Show-off set** with **▶ Play it**.
- [ ] **Show-off set:** empty, it says how a song gets there; with two or more ready songs, **🎤 Concert: the whole
      set** opens the first song of the set.

**Songs** (home server on)
- [ ] Search "artist + title" → results → **Learn this** → the song opens full screen with the YouTube player
      inline. Write down if you see **error 153** (known risk in Release builds).
- [ ] Set tempo (tap along), Learn by ear, Jam, Play, Sheet music modes; speed 75 % / 50 %; versions (drumless, cover).
- [ ] Server off (stop `npm run server`): search says it can't reach the home server; pasting a YouTube link still adds the song.
- [ ] Import files: a drum `.mid` (AirDrop one from the Mac) → Save to library (it shows in Practice's library); with
      an MP3 backing: it plays in the take.

**Coach**
- [ ] Ask "what should I work on?" → "Your coach is thinking…" → an answer; a drill card → **Play this drill** opens it
      in the player; the week plan's items open their lesson/drill/song.
- [ ] Results → Ask the coach → feedback and a drill for that take.
- [ ] Server off: the offline card (what failed, Try again, Coach settings, what keeps working); the question waits.
- [ ] Voice: live tips "voice" in Setup → tips are spoken between takes, never during one.

**Setup**
- [ ] Kit row (name, Medeli, connected), last hit live, MIDI input picker. Kit test says "No kit? Keys: Space kick ·
      S snare …" **(QA2 m3)**, and those keys play the kit on a hardware keyboard.
- [ ] Hit each pad once (10 of 10), Soft then loud (velocity calibration ✓ done), **Note map**: change the snare to
      another note and back; hits follow the map at once (Kit test shows it).
- [ ] Latency: the current route's value and the other routes measured (unplug the hub audio: it switches to the
      speaker's value, plug back: the hub's value).
- [ ] Sound levels, which hand leads, live tips, kit gestures off → gestures do nothing anywhere; on again.
- [ ] Hardware keyboard in the tools: Hit each pad once ← goes back a pad, Esc stops; Sound levels → Check from the
      kit answers with keys 1 / 2 / 3; Esc closes any tool.

## 8. Offline — 5 min
Wi-Fi off (Control Center).
- [ ] Journey, a lesson take, Practice, Progress, Setup all work; the coach pill goes grey; Coach and Songs search
      show their offline states; nothing hangs.

## 9. Timing comparison with the web (Linux, Chrome, same day, same kit) — 15 min
`npm run dev` → http://localhost:5173 → ⚙ Setup → Your kit → Latency → Start, 16 snare hits, 3 runs.

| Web run | average after the click | spread ± | n |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
- [ ] **iPad spread ≤ web spread + 3 ms** (section 4 vs this table): iPad ____ vs web ____.
- [ ] The same lesson take on both (e.g. "Your first jam" step 1 at 70): web landed ____ / mean offset ____ ms;
      iPad landed ____ / mean offset ____ ms. Expect the same within your own take-to-take variation (± 5 ms).

## 10. Release build (Mac) — 15 min
```bash
cd apps/mobile && npx expo run:ios --device --configuration Release
```
- [ ] Opens without Metro; no Dev row in the sidebar; everything in section 7 that you spot-check still works.
- [ ] Repeat M6 if it failed in debug: open Setup → Kit test and play 2 min: the pads light with no visible lag.
- [ ] **T6-11** touch pads: slow-motion video of a finger tap → sound, p95 ≤ 35 ms: ____ ms.
- [ ] Songs: does the YouTube player show **error 153**? yes / no.

## 11. Maestro on the simulator (optional, Mac) — 10 min
`maestro test apps/mobile/e2e` against a Release simulator build (apps/mobile/e2e/README.md).
- [ ] launch / lesson-to-progress / setup / songs-offline: pass or the failing step: ____
- [ ] intro-slides / lesson-steps / technique-flow / practice-details / find-my-level / progress-showoff: pass or the
      failing step: ____

## 12. Paste back
- Section 2–3: hub model, route name, server test line.
- Section 4: M4 counts, stale dropped, M6 numbers, the iPad tap-test table, and **Copy debug info** from `/dev/midi`.
- Section 5: the `swift test` summary, S1–S5, D1–D3 numbers (Timing probe rows), B1–B6 (Backing card rows), T7, "Last error".
- Section 7: every unticked box with one line on what happened (screenshots welcome: top button + volume up).
- Section 9: both tables and the same-lesson numbers.
- Section 10: Release results, T6-11, error 153 yes/no.
- Anything that surprised you, and any **(M…)** or **(QA2 …)** step that failed, with the build's commit.
