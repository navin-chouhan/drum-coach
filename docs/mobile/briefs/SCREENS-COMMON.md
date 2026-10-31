# Common rules for every screen agent (A7b–A7e, A8)

**The owner is away. Follow the web app's decisions on every doubt** (D9): same features, wording, rules, flows and
numbers as the web app (`src/**`, `README.md`, `docs/LEARNING.md`), laid out as the approved iPad mockups
(`docs/mockups/ipad/`, NOTES.md and PNGs are the source of truth for look and layout). If the mockup and the web
disagree on behaviour, the web wins. If they disagree on layout or look, the mockup wins.

## Two parts
- **Part 1 (start now): models.** `apps/mobile/src/features/<feature>/**`: pure TS view models built from core
  (`@drum-coach/core/...`), Storage (`src/data`, `src/platform/storage.ts`), HomeServer (`src/platform/api.ts`), the
  MIDI hit bus (`src/platform/midi.ts`) and audio (`src/platform/audio.ts`), with Vitest tests. Port the web logic.
  Don't fork core logic; if core lacks a pure function the web keeps in `src/`, copy it into your feature folder with
  a header naming the source, and list it in your report for a later move to core.
- **Part 2: screens**, after the UI kit lands. The orchestrator messages you. Then `git merge
  claude/drum-coach-expo-ios-x6c1iq` into your worktree and build the screens with `apps/mobile/src/ui` (A7a's kit),
  `src/play` (A6: NoteHighway, KitView, TouchPads), `src/notation` (A6n: NotationView) and the take engine
  (`@drum-coach/core/play/take`, A4p2) once it's merged. Never restyle around the kit: if the kit lacks something, add
  a small local component in your feature folder and list it for promotion.

## Every screen
Landscape 1194×834, ≥ 44 pt targets, accessibilityLabel on controls, kit gestures on moves
(`packages/core/src/engine/padCommands.ts`) through the hit bus, the keyboard fallback for an iPad hardware keyboard
(CLAUDE.md keys), offline-first (the coach and YouTube show the "server unreachable" state, everything else works),
and no HTML strings or eval. testIDs on primary elements (`<screen>-<thing>`).

## Checks (paste in your report)
`cd apps/mobile && npx tsc --noEmit && npx vitest run && npm run check:versions`; the Metro export bundles; root
`npm run lint` (0) and `test`. No new packages unless the brief allows; ask the orchestrator.

## Commits
Small, in your worktree, never pushed; every message ends with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012qCzBwXtPvMyyk6zKAziwn
```
Final reply ≤ 30 lines: worktree, branch, commits, what's built, checks, what's unverified on device, anything you
copied from `src/` (for a later core move), and requests.
