# Common rules for wave 3 (W1, W2, W3, Q2)

The whole app is built and merged (see `docs/mobile/BOARD.md`, the event log and the "Integration backlog" lines).
Wave 3 closes the remaining backlog before the owner's first test session at the kit (`docs/mobile/FINAL-CHECKLIST.md`).
**The owner is away. Follow the web app on every doubt (D9)**, as `SCREENS-COMMON.md` says (read it: kit, testIDs,
keyboard fallback, offline-first, checks).

- **Start:** your worktree may be made from `main`. First run `git reset --hard claude/drum-coach-expo-ios-x6c1iq`.
- **Verify before you build.** Several backlog lines may already be done by I1–I3, F1, F2. For each item in your brief,
  look at the code first and report it as "already done (where)" or fix it.
- **Metro export:** worktrees share `/tmp`. Run it as `TMPDIR=$(mktemp -d) npx expo export --platform ios --clear`
  (or the project's script with that TMPDIR).
- **Checks (paste them):** `cd apps/mobile && npx tsc --noEmit && npx vitest run && npm run check:versions`; the export
  bundles; root `npm run lint` (0), `npm run typecheck`, `npm test`. If you touch `packages/core`, also
  `npm run test:coverage` (thresholds) and keep the web-parity tests exact. No new packages.
- **Stay in your files.** Each brief says what you own. If you need an edit outside it, make the smallest one and list
  it in your report.
- Commits small, in your worktree, never pushed, trailer lines as in SCREENS-COMMON. Final reply ≤ 30 lines.
