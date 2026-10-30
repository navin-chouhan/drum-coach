# Brief: ACI, CI and dependency gate for the mobile projects

## Goal
Main's pipeline (`npm run check`, `.github/workflows/*`, `scripts/check-deps.mjs`, `.githooks/*`) guards the web root
only. Extend it to the new sub-projects so they are held to the same rules: `apps/mobile` (Expo app, own lockfile),
`scripts/mobile-playtest` (Mac-side tools, own lockfile, coming in A9's merge) and `spikes/midi-probe` (regression
tool, own lockfile).

## Read first
`CLAUDE.md` (the rules at the end), `scripts/check-deps.mjs` (+ its recent workspace change), `.github/workflows/*`,
`.github/dependabot.yml`, `.githooks/*`, `package.json` scripts, `apps/mobile/package.json`, `apps/mobile/deps-allow.json`,
`apps/mobile/scripts/` + `scripts/check-expo-versions.mjs`, `apps/mobile/.npmrc`.

## Owns
`scripts/check-deps.mjs`, `.github/workflows/**`, `.github/dependabot.yml`, `.githooks/**`, root `package.json`
**scripts only**. Nothing else.

## Deliver
1. `check-deps.mjs --project <dir>`: the same checks against `<dir>/package.json` + `<dir>/package-lock.json`; the
   allowlists come from `<dir>/deps-allow.json` (`prerelease`, `young`, `deprecated`, `zeroMajor`, `installScript`,
   exact `name@version` → reason; stale entries are problems, as today). For `apps/mobile`, a `file:` link to
   `../../packages/core` (a private workspace of this repo) is allowed like the root workspace link. `zeroMajor` lets a
   listed 0.x spec/package through (react-native has no 1.0). No default run without `--project` changes behaviour.
2. Root scripts: `deps:check` checks the root **and** every project dir that has a lockfile (`apps/mobile`, and
   `scripts/mobile-playtest`, `spikes/midi-probe` when present); `mobile:test` = `cd apps/mobile && npm ci && npx tsc
   --noEmit && npx vitest run && npm run check:versions`. Keep `npm run check` working; add `mobile:test` to it only if
   it doesn't need anything the CI image lacks.
3. CI: a `mobile` job (ubuntu, Node 24, cached npm) running the mobile checks and `check-deps --project` for each
   sub-project; pinned actions by commit SHA and least-privilege `permissions:` like the existing workflows (zizmor
   runs on them). Dependabot entries for `/apps/mobile` with the same 7-day cooldown and grouping; **ignore** major
   bumps of `expo`, `react-native`, `react` there (SDK upgrades are deliberate).
4. Tests for the `--project` mode (a temp dir with a tiny package.json/lock, offline: cached verifications or
   injected registry docs — make the registry fetch injectable rather than mocking globals).
5. Current state: run `node scripts/check-deps.mjs --project apps/mobile` and `--project spikes/midi-probe`; report
   every problem found (the spike runs expo 58.0.20, probably "too young" for a few more days: propose allowlist
   entries with reasons, don't hide them).

## Checks
Root `npm run typecheck`, `lint` (0), `test:coverage`, `build`, `deps:check` (network once per new version; the
container's proxy blocks `npm audit signatures`, so say so rather than skipping it in the script).

## Do not touch
Anything outside the owned files. Never push. Commit in your worktree; every message ends with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012qCzBwXtPvMyyk6zKAziwn
```
