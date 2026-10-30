# Maestro flows (T3)

UI smoke tests for the iPad app on the **iOS Simulator on the Mac**. They can't run on Linux, and they were written
without Maestro or a simulator, so treat them as unverified until their first run on the Mac.

| Flow | Checks | Needs |
|---|---|---|
| `launch.yaml` | the app launches and the home shows "Drum Coach" | testID `home-title` on the home's title (A2) |
| `dev-midi.yaml` | the home's MIDI link opens `/dev/midi` and its Devices section shows | testID `dev-midi-devices` on that section (A3), rendered even with no devices; a link on the home with "MIDI" in its text |
| `subflows/open-app.yaml` | shared start: clean launch, optional dev-client URL, waits for `home-title` | (not run on its own) |

`maestro test <folder>` runs only the folder's top-level flows, so `subflows/` isn't run by itself.

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
3. From the repo root:
   ```sh
   maestro test apps/mobile/e2e                       # Release build
   maestro test -e DEV_CLIENT_URL="exp+drum-coach://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" apps/mobile/e2e
   maestro test apps/mobile/e2e/launch.yaml           # one flow
   ```
   The screenshots (`launch-home.png`, `dev-midi-devices.png`) land in the current folder. `maestro studio` helps
   find selectors.

## Adding a flow

Use `testID` props (Maestro's `id:`) rather than text where the text may change, start with
`- runFlow: subflows/open-app.yaml`, and list the new testIDs in the table above. Real MIDI isn't available in the
simulator: drive play screens through the touch pads or the in-app fixture replay, and compare the take with
`scripts/mobile-playtest/compare.mjs` (exact mode).
