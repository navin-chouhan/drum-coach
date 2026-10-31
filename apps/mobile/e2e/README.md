# Maestro flows (T3)

UI smoke tests for the iPad app on the **iOS Simulator on the Mac**. They can't run on Linux, and they were written
without Maestro or a simulator (A9, then updated by A10 for the real app), so treat them as unverified until their
first run on the Mac. Every flow starts from a clean install, so each one goes through the first run first.

| Flow | Checks | Build |
|---|---|---|
| `launch.yaml` | the app launches, the first run finishes (kit steps skipped), Journey shows with all six sidebar tabs | any |
| `lesson-to-progress.yaml` | Journey's big move opens the full-screen player; Full path → "Sit, hold, strike" → Play with the touch pads → results → the lesson shows on You › Your lessons | any |
| `setup.yaml` | Setup's groups; note map, kit test, latency and MIDI input open full screen and close; the server test explains a bad URL | any |
| `songs-offline.yaml` | with no home server: Songs search says it needs the server, file import is there, the coach tab opens | any |
| `intro-slides.yaml` | "The money beat" by deep link: Play → the 4 intro slides (Next / Back, page numbers, the How it moves demo) → Ready starts the take; the next take has no slides | any |
| `lesson-steps.yaml` | by deep link: the ear quiz (4 rounds by touch, summary, Done → the playable step), transcription (tap, Check ×2, Show me, Done → step 2), a look step (the demo, Done) | any |
| `technique-flow.yaml` | `/technique` (movements, tempo, the demo, ← Journey) and `/flow` (opens the player in flow mode, Flow ▶ plays, Stop) | any |
| `practice-details.yaml` | Practice's picked exercise → play screen → intro slides → a take on the touch pads → Your take → Details and history → Back | any |
| `find-my-level.yaml` | Journey's Find my level: a rung, Play it / Stop, Start at this stage → Journey | any |
| `progress-showoff.yaml` | You › Show-off & fills shows the show-off set (empty on a fresh install) | any |
| `subflows/through-intro.yaml` | Next through the intro slides when they show (a no-op otherwise) | (not run on its own) |
| `dev-midi.yaml` | the sidebar's Dev row opens `/dev/midi` and its Devices section shows | **debug only** (tag `debug`) |
| `subflows/open-app.yaml` | shared start: clean launch, optional dev-client URL, finishes the first run if it shows, waits for Journey | (not run on its own) |
| `subflows/finish-first-run.yaml` | Welcome (Rock, 25 min, new to drums) → Plug in → Pads are fine → Latency → Skip | (not run on its own) |

`config.yaml` runs every top-level flow except the `debug` ones: the sidebar's Dev row exists only in debug builds
(`__DEV__`), so a Release build would fail `dev-midi.yaml`. `subflows/` isn't run by itself.

testIDs the flows rely on: `home-title`, `nav-*`, `screen-*`, `firstrun-*`, `journey-*`, `lesson-*`, `progress-*`, `you-door-*`,
`setup-*` (pages and tools: `setup-row-<page>`, `setup-tool-<page or tool>` and `-close`), `notemap-<pad>`, `latency-*`, `songs-*`, `coach-*`,
`lesson-intro*`, `lesson-quiz*`, `lesson-transcribe*`, `lesson-look`, `technique-*`, `screen-technique`, `flow-*`,
`practice-*` (`practice-details-*`), `placement-*`, `progress-showoff*`. If a screen renames one, update the flow in
the same commit.

Deep links (`drumcoach://lesson/<id>`, `drumcoach://technique`, `drumcoach://flow`) open a screen directly, so a flow
doesn't depend on where Journey draws its tiles. The hardware-keyboard commands (H, B, arrows, 1–3) aren't driven by
the flows: Maestro's `pressKey` types into a field, it doesn't reach the app's key catcher; check them by hand
(FINAL-CHECKLIST §7).

## Run them on the Mac

1. Once: Xcode with an iPad simulator runtime, Java 17+, and Maestro:
   `curl -fsSL "https://get.maestro.mobile.dev" | bash`, then `maestro --version`.
2. Build and install the app on a booted iPad simulator. A simulator build needs no signing or Apple ID.
   - **Release build (simplest):** the JS bundle is inside, so no Metro is needed:
     ```sh
     cd apps/mobile && npm ci
     npx expo run:ios --configuration Release --device "iPad Air 13-inch (M3)"   # any iPad simulator; xcrun simctl list devices
     ```
   - **Dev-client build:** it opens on the Expo dev launcher, so give the flows Metro's URL. Start Metro on the Mac
     (`npx expo start --dev-client`), then pass the URL in step 3.
3. Simulator: **I/O → Keyboard → Connect Hardware Keyboard** on (the lesson's hidden keyboard field then never raises
   the on-screen keyboard over the touch pads), and the simulator in landscape.
4. From the repo root:
   ```sh
   maestro test apps/mobile/e2e                                             # Release build, every v1 flow
   maestro test -e DEV_CLIENT_URL="exp+drum-coach://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" apps/mobile/e2e
   maestro test --include-tags debug -e DEV_CLIENT_URL="…" apps/mobile/e2e  # adds dev-midi.yaml (debug build)
   maestro test apps/mobile/e2e/lesson-to-progress.yaml                     # one flow
   ```
   Screenshots (`launch-journey.png`, `lesson-ready.png`, `lesson-take.png`, `lesson-results.png`,
   `progress-after-take.png`, `setup.png`, `songs-offline.png`, `coach-offline.png`, …) land in the current folder.
   `maestro studio` helps find selectors.

## Known soft spots (fix the flow, not the app, if they're the only failure)
- `lesson-to-progress.yaml` taps the touch pads at estimated screen points (65 %, 90 %) and (71 %, 92 %). They're
  optional: a take with no hits still ends with results and is saved. If they hit nothing, adjust the points with
  `maestro studio`.
- The first Journey item on day one is the two-minute stretch (a resting step). If the planner picks something else,
  the flow still only checks that the player opened and closes it.
- `id:` and `text:` are regexes (`firstrun-welcome|home-title`); text matches the accessibility label on iOS.

## Adding a flow

Use `testID` props (Maestro's `id:`) rather than text where the text may change, start with
`- runFlow: subflows/open-app.yaml`, and list the flow above. Real MIDI isn't available in the simulator: drive play
screens through the touch pads or Network MIDI (the Mac's `scripts/mobile-playtest/replay-to-ipad.mjs`), and compare
the take with `scripts/mobile-playtest/compare.mjs` (exact mode).
