# Brief: A1f, core notation fix (triplet rests)

## Bug (found by A6n; affects the web sheet too)
In `packages/core/src/engine/notation.ts` `layoutMeasures`, a voice with **no notes in a triplet beat** gets
`slots: 3, triplet: false` and is drawn as a **dotted-8th rest** instead of a **quarter rest**. So rests sit off the
beat in triplet grooves.

## Do
1. Write a failing test first: a chart with a triplet beat where one voice is empty. Expect a single quarter rest for
   that beat in that voice; other voices are unchanged.
2. Fix `layoutMeasures` minimally.
3. Check both renderers' behaviour: the web's `src/notation/SheetMusic.tsx` and the iPad's
   `apps/mobile/src/notation/dom/engrave.ts` consume the model. Add a renderer-level test if either needs a change,
   and only change them if the model's shape changes. Prefer a fix that keeps the shape.
4. Run root `npm run typecheck`, `lint` (0), `test:coverage` (thresholds hold), `build`, `cd packages/core && npx
   vitest run`, `cd apps/mobile && npx vitest run`. Also run the web playtest quick mode if it runs here
   (`npm run playtest`).

## Owns
`packages/core/src/engine/notation.ts` and its test; minimal renderer edits only if unavoidable. Not
`packages/core/src/play/**` (A4p2 is working there).

Never push. Commit in your worktree; every message ends with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012qCzBwXtPvMyyk6zKAziwn
```
