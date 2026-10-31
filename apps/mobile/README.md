# Drum Coach for iPad (`apps/mobile`)

An Expo SDK 58 development build (Expo Router, TypeScript), iPad only, landscape. It runs the same teaching code as
the web app from `packages/core` (`@drum-coach/core`). It is its own npm project, not a root workspace: React Native
needs the exact React that Expo ships (19.3.0), and the web app uses a newer one.

The loop: **build and install on the Mac** (only after native changes, or every 7 days), then **run Metro on the
Linux laptop** and play at the kit.

## One-time setup (Mac and iPad)
Same as the Gate 0 probe (`docs/mobile/GATE0-CHECKLIST.md` §A). In short: Xcode 27 opened once, CocoaPods, Node 22+
(24 is fine), your Apple ID added in Xcode (Personal Team), iPad Developer Mode on and the Mac trusted.

## Build and install (Mac)
```sh
git pull
cd apps/mobile
npm ci
npm run check:versions    # every Expo native module matches this SDK patch (see Troubleshooting)
npm run ios:device        # = npx expo run:ios --device; pick the iPad
```
- **Signing:** the first build may stop at signing. Open `ios/DrumCoach.xcworkspace`, target DrumCoach → Signing &
  Capabilities → Team = your Personal Team, then build again. If `com.drumcoach.app` is taken, change the bundle id
  **locally only**. Never commit `ios/` (it's generated and gitignored) or a team ID.
- **First launch on the iPad:** Settings → General → VPN & Device Management → your developer profile → **Trust**.
  When iPadOS asks to find devices on your **Local Network**, tap **Allow** (Metro, the coach server and Network
  MIDI all need it).
- **Every 7 days** (free Apple ID) the app stops opening. Plug the iPad in and run `npm run ios:device` again.
- **Rebuild** only when native things change: `app.json`, a new native package, `modules/**` (Swift), or an Expo
  upgrade. JavaScript changes just need Metro.

## Daily loop (Linux)
```sh
git pull
cd apps/mobile
npm ci                     # only when package-lock.json changed
npm start -- --lan         # = npx expo start --dev-client --lan
```
Allow TCP port 8081 if a firewall is on (`sudo ufw allow 8081/tcp`). On the iPad, open Drum Coach → the dev launcher
lists the server, or **Enter URL manually**: `http://<linux-ip>:8081`. Same Wi-Fi for both. The Mac can stay off.
Plug the kit into the iPad's USB-C port.

## Checks (Linux, no Mac needed)
```sh
npm run typecheck          # tsc, strict
npm test                   # Vitest: src/**/*.test.ts and modules/**/src/**/*.test.ts
npm run check:versions
EXPO_OFFLINE=1 npx expo prebuild --platform ios --no-install --clean   # then look in ios/, then delete ios/
npx expo export --platform ios --dev --output-dir /tmp/dc-export        # Metro bundles, incl. packages/core
```
- **Layout screenshots:** `node scripts/screenshots.mjs` renders the screens with react-native-web in Playwright's
  Chromium at 1194×834 (fake data from `src/dev/harness/seeds.ts` via the `*.web.ts` platform shims, `?h=<state>`) and
  writes PNGs plus `report.json` (what ends outside the frame) to `screenshots/` (gitignored). A budget check, not
  the iPad's pixels: fonts and native views differ.

## How it fits together
- `app/` is the Expo Router routes (`_layout.tsx`, `index.tsx`, `+not-found.tsx`; A3 adds `app/dev/midi.tsx`).
  Don't create `src/app/`: Expo Router would switch its routes folder to it.
- `src/platform/` holds the device side of the contracts in `contracts.ts` (keep-awake, capabilities; MIDI comes
  from A3).
- `@drum-coach/core/<path>` is `packages/core/src/<path>.ts`, through `node_modules/@drum-coach/core`
  (a link made by `npm ci`). `metro.config.js` watches `packages/core`. Metro and Vitest resolve the core's own
  imports (zod, …) from this app's `node_modules`, so the repo root needs no install.

## Dependencies
`.npmrc` keeps the repo's rules: no install scripts, versions at least 7 days old (npm 11.10+; on an older npm add
`--before=<date a week ago>` when you change dependencies), registry only. Every Expo package is pinned to exactly
what `expo`'s `bundledNativeModules.json` names. To move to a newer Expo patch: pick one that's 7+ days old, set
`expo` and each Expo/React Native package to the versions its `bundledNativeModules.json` names, `npm install`,
`npm run check:versions`, then rebuild on the Mac. Exceptions to the dependency rules (React Native is 0.x, …) are in
`deps-allow.json`.

## Troubleshooting (learned in Gate 0)
- **Crash at launch, dyld "Symbol not found" in ExpoModulesCore:** an Expo package's prebuilt framework is newer than
  the `expo-modules-core` in the build. `npm run check:versions` names it. Pin it to the version the SDK names (or move
  `expo` to the patch that names it), `npm ci`, rebuild.
- **The dev launcher doesn't find Metro:** use Enter URL manually with the Linux IP; check port 8081 and that Local
  Network is allowed (Settings → Privacy & Security → Local Network → Drum Coach).
- **The kit isn't listed:** unplug and replug it (it shows up within 2 s); the module has to be on.
- **Hits arrive late in a debug build:** expected (the JS bridge in debug). Timing is scored on host time, not JS
  arrival time.
- **"Untrusted Developer" or the app won't open:** trust the profile again (see above), or the 7 days are up: rebuild.
