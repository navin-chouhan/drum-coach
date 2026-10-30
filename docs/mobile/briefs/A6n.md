# Brief: A6n, Sheet music on the iPad (owner: "sheet music always")

## Goal
The owner wants sheet music in v1, always available and the default view in the lesson player (as on the web, where
Sheet comes first and Highway is the alternative). The web draws it with VexFlow (`src/notation/SheetMusic.tsx`,
`packages/core/src/engine/notation.ts`), which needs a DOM. Build `NotationView` for the iPad: the lesson chart as
real drum notation, a moving cursor driven by the Clock, and results on the notes (green on it, orange early/late, red
missed, red ✕ extra), the same as the web.

## Read first
`CLAUDE.md` (dependency + security rules: render text only, no HTML strings; check the rule against any WebView
approach), `docs/mobile/BOARD.md` (B15, D4 revised, D6), `src/notation/*` and `packages/core/src/engine/notation.ts`
(what the web draws and how), `docs/mockups/revamp-lesson.html` (the web's sheet view), `docs/mockups/ipad/` (the
approved look; A7m is adding sheet frames in parallel), `apps/mobile/src/play/**` (A6's highway: match its props,
theme and Clock handling so the lesson player can swap Sheet ↔ Highway), `apps/mobile/package.json`,
`apps/mobile/deps-allow.json`, and `node_modules/expo/bundledNativeModules.json` (`@expo/dom-webview` ~58.0.2,
`react-native-webview` 14.0.1, `react-native-svg` 15.16.0).

## Step 1: choose the approach (evidence first, in your report)
Compare at least:
- (a) **Expo DOM components** (`'use dom'`, rendered by `@expo/dom-webview`): VexFlow runs unchanged inside it;
- (b) **react-native-webview** with a bundled local HTML page;
- (c) **native drawing**: VexFlow's layout through a custom RenderContext that records draw calls → `react-native-svg`
  (or Skia), or our own renderer from core's `notation.ts` model.

Judge each on: the dependency rule (version that SDK 58.0.17 names, ≥ 7 days, major ≥ 1 or a justified 0.x
exception, **no install scripts**, transitive deps); offline (no network, everything bundled); cursor smoothness (the
cursor must move every frame from the Clock without a JS→WebView message per frame: e.g. send zero/bpm once and
animate inside); results on notes as they arrive; no `innerHTML`/HTML strings (the repo's lint rule; a WebView that
injects HTML strings needs a justified, scoped exception or a different design); bundle size; Mac rebuild needed.
Recommend one. If it needs a package, you may add it to `apps/mobile/package.json` + lockfile **this round** (you're
the only agent touching them) at the exact SDK-named version, with any exception in `deps-allow.json` with a reason,
then `npm run check:versions` and `node ../../scripts/check-deps.mjs --project apps/mobile`.

## Step 2: build it
`apps/mobile/src/notation/**` (+ `app/dev/sheet.tsx` showing "The money beat" with a looping fake take like
`/dev/play`, and a Sheet/Highway toggle using A6's `NoteHighway`). Props mirror `NoteHighway` (`chart`, `bpm`,
`zero`, `now`/clock, `latencyMs`, `results`, `theme`). Pure layout/mapping in TS with Vitest tests. Reuse core's
`notation.ts` model; don't fork the web's notation logic.

## Checks
`cd apps/mobile && npx tsc --noEmit && npx vitest run && npm run check:versions`; the Metro export bundles
(`npx expo export --platform ios --dev --output-dir <scratch>`); `EXPO_OFFLINE=1 npx expo prebuild --platform ios
--no-install --clean` autolinks anything new (delete `ios/` after); root `npm run typecheck`, `lint` (0) and `test`;
`node scripts/check-deps.mjs --all` from the root. If you can render the notation in Node/Chromium (e.g. the DOM
component's HTML in Playwright Chromium, which is pre-installed: `require('playwright')`), screenshot it and look at
it.

## Do not touch
`packages/`, `src/` (web), `apps/mobile/src/play/**` (read only), other apps/mobile files, root files, `data/`.
Never push. Commit in your worktree; every message ends with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012qCzBwXtPvMyyk6zKAziwn
```
