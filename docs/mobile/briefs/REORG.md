# Reorganisation build (D10, owner-approved 2026-10-31)

The owner approved docs/mobile/REORG-PROPOSAL.md with every recommended answer:
- 4 sections: Journey · Practice (Songs is a shelf in it) · You (Progress + the coach's week plan) · Setup. Coach chat
  opens from the coach bubble on any screen. One kit dot instead of three pills.
- Sidebar: expanded on Journey, icon rail elsewhere, hidden while playing; « / » and the `\` key; remembered.
- One shared full-screen player for lessons, Practice and Songs (ready / take / results states as in the wireframes).
- Voice first: speak everything (score, verdict and next step after every take, spoken live tips by default, step
  intros, notices, kick × 2 = say it again); best installed iPad voice now, Piper later.
- One main job per screen; the rest behind ⋯; Just jam behind ⋯; trail as dots; no kit drawing while a real kit is
  plugged in; Share take in ⋯; hide "Song audio (experimental)"; cut "Your time" and the duplicate Skill map button.
- The look (D4) and sheet music by default (D8) stay. Wireframes: docs/mobile/reorg/*-after.png (HTML next to them).

## Rules
- Start: `git fetch origin && git reset --hard origin/claude/drum-coach-expo-ios-x6c1iq`.
- Follow WAVE3-COMMON.md (checks, Metro export with its own TMPDIR, commits, report ≤ 30 lines) and SCREENS-COMMON.md.
- Every feature stays reachable ("Where everything went" table in the proposal) unless the proposal cuts it.
- Kit gestures and the keyboard fallback keep working everywhere; update `padCommands` docs/chips when a move changes.
- Check layout with the harness: `NODE_PATH=/opt/node-tools/node_modules node apps/mobile/scripts/screenshots.mjs
  --check`; update the baseline only for intended changes, and add shots for new states.
- Update Maestro flows (apps/mobile/e2e) and FINAL-CHECKLIST.md lines for what you move.
- Stay in your files; the shared pieces below have one owner each. Others wait for them or use them as merged.

## Owners
| Agent | Owns |
|---|---|
| R1 shell | app/_layout.tsx, app/(main)/_layout.tsx + routes (4 sections, Songs under Practice, Progress→You, Coach as a sheet from the bubble), the collapsible sidebar (src/ui), the kit dot, the ⋯ sheet component in src/ui. Lands first: others merge it. |
| R2 player | the shared full-screen player (src/player/** new) and the lesson player on it (features/lesson screens), placement |
| R3 practice+songs | features/practice/**, features/songs/** onto R2's player; the Practice screen with the Songs shelf |
| R4 journey | features/journey/** to the wireframe |
| R5 you+setup | features/progress/** → You, features/setup/** to the wireframe, first run |
| R6 voice | features/coach/voice.ts, the say/sayNext call sites and the "moments" (a pure table of what is said when), settings defaults, the voice picker, kick × 2 |
