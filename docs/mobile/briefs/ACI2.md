# Brief: ACI2, a cloud iOS build (compile the Swift without the owner's Mac)

## Goal
The owner tests only the finished app. All the Swift (`apps/mobile/modules/drum-midi`, `drum-audio`) and the Expo
native project have **never been compiled**. Add a GitHub Actions job on a **macOS runner** that does a full
`expo prebuild` + `xcodebuild` of `apps/mobile` for the **iOS Simulator** (no signing), and runs the modules' Swift
unit tests, so compile errors surface in CI and get fixed before the owner's test.

## Read first
`CLAUDE.md` (the CI rules: pinned action SHAs, least privilege, zizmor/actionlint clean, no untrusted interpolation),
`.github/workflows/*.yml` (follow their style exactly), `apps/mobile/{package.json,app.json,README.md,.npmrc}`,
`apps/mobile/modules/*/ios/*.podspec` and their `Tests/` / `Package.swift`, `apps/mobile/modules/drum-audio/CHECKS.md`,
`docs/mobile/GATE0.md` §9 (the owner's build used Xcode 27.1 and Expo SDK 58; a version mismatch once crashed at
launch).

## Owns
`.github/workflows/ios.yml` (new), and `apps/mobile/scripts/ci-ios-build.sh` (new) if a script keeps the workflow
small. Nothing else; propose any app change in your report.

## Requirements
- **Runner and Xcode:** find out (web search via ToolSearch "WebSearch"/"WebFetch"; GitHub's runner-images repo
  lists the installed Xcode versions per image) which `macos-*` image has **Xcode 27.x**, which Expo SDK 58 /
  RN 0.88 need. Select it explicitly (`sudo xcode-select -s /Applications/Xcode_27.x.app`). If no hosted image has
  Xcode 27 yet, say so, and make the job use the newest available plus a clear failure message; don't fake success.
- **Steps:**
  1. checkout (no persisted credentials);
  2. Node 24, root `npm ci` and `apps/mobile` `npm ci` (both use ignore-scripts);
  3. `npx expo prebuild --platform ios --clean`, with CocoaPods install;
  4. `xcodebuild -workspace ios/DrumCoach.xcworkspace -scheme DrumCoach -configuration Debug -sdk iphonesimulator
     -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`. Check the generated
     workspace and scheme names;
  5. the Swift unit tests: `swift test` for any SwiftPM package under `modules/*/ios`, and the podspec test_specs
     if practical;
  6. upload the xcodebuild log as an artifact on failure.
- **Triggers (macOS minutes cost 10× on private repos):** `workflow_dispatch`, and `pull_request` to `main` only when
  paths under `apps/mobile/**` change, with concurrency cancel-in-progress. No push trigger. Timeout ≤ 45 min.
  Cache npm and CocoaPods/DerivedData where safe (keyed on lockfiles and Podfile.lock).
- `permissions: contents: read` only. Pinned SHAs for every action, matching the versions the existing workflows use
  where the same action appears.

## Checks
actionlint and zizmor clean (the repo's workflow-lint job runs them; run them locally if you can install them
without install scripts, otherwise say so). The job itself can only be proven on GitHub. The orchestrator will
trigger it with workflow_dispatch after merging. Write in your report the exact first-run expectations and the
likely failure points.

## Do not touch
Anything outside the owned files. Never push. Commit in your worktree; every message ends with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012qCzBwXtPvMyyk6zKAziwn
```
