# Brief: A7m, iPad mockups (D4)

## Goal
Draw the **fresh iPad-native designs** the owner approves before any screen is built (D4). They should show what the
v1 app looks like at the kit: iPad only, **landscape 1194×834**. These are mockups only, with no app code.

## Read first
`CLAUDE.md`, `docs/mobile/BOARD.md` (D0, D2, D4, D5), `README.md` (every screen and feature), `docs/LEARNING.md` (how
the app teaches), `docs/SPEC.md`, the web screens in `src/ui`, `src/lesson`, `src/play`, `src/coach` (what each screen
must do), and the approved web designs `docs/mockups/revamp-*.html` with `mockup.css` (content and flow to keep; the
look changes). `docs/mobile/RECON.md` §4 lists the screen inventory.

## Design direction (owner's decision: iPad-native)
- **iPad conventions:** a sidebar on the left (Journey, Practice, Progress, Setup, plus Coach), sheets and popovers
  for secondary tasks, native-looking controls (segmented controls, toggles, grouped lists), the SF system font
  (`-apple-system`), and the iPadOS status bar.
- **Played at the kit, at arm's length:** large type for anything read while playing, touch targets ≥ 44 pt, high
  contrast, and nothing important in the bottom 60 pt (the home indicator). The lesson player is **full-screen**,
  with the sidebar hidden while playing.
- Light theme; dark is optional later.
- **Hands-free:** show where kit gestures drive the screen (e.g. "hit crash to start, floor tom for next", per the web
  app's pad commands, `src/engine/padCommands.ts`).
- States that matter: no kit connected (touch pads offered), the coach "thinking", and the coach server unreachable
  (D2: home server first, else an optional API key).

## Screens (one HTML file each, plus an index)
1. `journey.html`: stages, ranks, today's lesson and the next step.
2. `lesson-take.html`: the lesson player during a take: note highway, the kit view with hit feedback, step/tempo
   ladder, the goal box, the count-in.
3. `lesson-results.html`: results on the notes (timing per note), what to fix, next move, and a "Share take" button
   (MIDI export via the share sheet, D5).
4. `practice.html`
5. `progress.html`
6. `setup.html`: Kit (pick `e-Drum`, status), Pads calibration, Latency, Coach (server URL and token, Test
   connection, optional API key), as one sidebar section with grouped lists.
7. `coach.html`: the coach panel (feedback after a take, chat, thinking/unreachable states). Use a sheet or an
   inspector.
8. `touch-pads.html`: the on-screen multi-touch pad kit (no-kit fallback), laid out like the real kit.
9. `first-run.html`: welcome → plug in the kit → hit each pad → latency, as a short flow (can be one file with
   steps).

## Deliver
- `docs/mockups/ipad/*.html` + `docs/mockups/ipad/ipad.css` + `docs/mockups/ipad/index.html` (a grid of all screens
  with one line each).
- Each page renders one 1194×834 frame. Use real content from the curriculum (real lesson names, real numbers in a
  plausible range), not lorem ipsum. Inline SVG for the kit and highway; no external assets except optional Google
  Fonts (not needed: system font).
- **PNG screenshots:** `docs/mockups/ipad/png/<screen>.png` at 1194×834, rendered with the pre-installed Playwright
  Chromium (`require('playwright')`, `chromium.launch()`). Look at every PNG yourself and fix clipping or overflow
  before finishing.
- `docs/mockups/ipad/NOTES.md`: per screen, what it shows, what changed from the web design and why, and open
  questions for the owner (≤ 3 per screen).

## Do not touch
Anything outside `docs/mockups/ipad/`. Never push. Commit in your worktree; every message ends with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012qCzBwXtPvMyyk6zKAziwn
```
