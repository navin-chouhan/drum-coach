# Brief: A7a, the UI kit, app navigation and Journey (screens wave 1)

## Goal
The owner **approved the mockups** (`docs/mockups/ipad/`, D4: the web app's look on iPad layouts). Build the shared
UI kit and app shell every screen uses, then the **Journey** screen, pixel-faithful to `png/journey.png` at
1194×834 landscape. Later waves (lesson player, Setup and first run, Practice/Progress/Coach) build on your kit.
Make it easy to use and hard to misuse.

## Read first
`docs/mockups/ipad/` (NOTES.md, every HTML/PNG, `ipad.css`, `mock.js`: the source of truth for look and layout),
the web app's look (`src/ui/*.tsx`, its CSS, `docs/mockups/revamp-*.html`), the web Journey (`src/lesson/*`,
`src/ui/*`) and core (`packages/core/src/engine/{lesson,planner,progress,skills,profile,greeting,health}.ts`,
`packages/core/src/content/curriculum.ts`) for the real data, `apps/mobile/src/data/**` (A5's Storage: runs,
settings, kv), `apps/mobile/src/platform/*`, `apps/mobile/src/play/**` (A6's themes and colours: keep one source of
truth for drum and result colours), `apps/mobile/app/*` (A2's shell), `CLAUDE.md`.

## Owns
- `apps/mobile/src/ui/**`: the kit. Tokens: pink dotted ground, ink, pop yellow, cream, teal mascot, drum and
  result colours shared with `src/play/theme`, type scale, spacing, the hard-shadow offset. Components: Screen
  (dotted ground and safe areas), Sidebar (black, with the kit/latency/coach status card), Card (black outline and
  hard shadow), Panel, BigMove button (blue or cream, with gesture chips), GestureChip (pad colour dot + "× 2"),
  Pill, Label (yellow tag), CoachLine (mascot + bubble), StatTile, Ring, Trail, Toggle/Segmented, ListRow. Each
  component is touch-sized (≥ 44 pt) and accessible (accessibilityRole/label).
- `apps/mobile/app/(main)/_layout.tsx` (sidebar layout: Journey, Practice, Progress, Coach, Setup; landscape),
  `app/(main)/index.tsx` (Journey), placeholder routes for the other four with a "coming next" panel in the same
  look. Keep `app/dev/*` reachable (e.g. a small "Dev" row in the sidebar in `__DEV__`). Move A2's home content
  (build info, core link, dev links and their testIDs `home-title`, `home-dev-*-link`) into the Dev row or a Dev
  screen, keeping the testIDs.
- `apps/mobile/src/features/journey/**`: Journey's view model (pure TS, tested) from core + Storage. The iPad starts
  fresh (D3): the day-one state shows Stage 1 with an empty trail. Also the state with history, as drawn.
- Fonts: the mockups use a heavy display face. Use the iOS system heavy weight, or bundle a font only if it's ≥ 7
  days old with no install scripts via `expo-font` (already installed). Ask before adding a package; you may not
  edit `package.json`.

## Kit gestures
Moves show their pad gesture chips (hi-hat pedal × 3 / crash × 2 = yes …, `packages/core/src/engine/padCommands.ts`).
Wire the gestures to the moves through the MIDI hit bus (`src/platform/midi.ts`), so Journey works hands-free.

## Checks
`cd apps/mobile && npx tsc --noEmit && npx vitest run && npm run check:versions`; the Metro export bundles; root
`npm run lint` (0) and `test`. **Visual check:** there's no simulator here, so render your components on the web if
feasible (react-native-web isn't installed: don't add it), or write a precise list of what to compare against
`png/journey.png` on the iPad. Pure layout math (trail spacing, rings) gets unit tests.

## Do not touch
`apps/mobile/src/play/**` (A6; import only), `src/notation/**` (A6n), `modules/**`, `src/platform/**` and
`src/data/**` (import only), `packages/` (A4p2), `package.json`, root files. Never push. Commit in your worktree;
every message ends with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012qCzBwXtPvMyyk6zKAziwn
```
Report part 1 (the kit + navigation) as soon as it's committed, by stating in a commit message
"UI kit ready", then continue with Journey. The orchestrator starts the next screen agents on top of your kit.
