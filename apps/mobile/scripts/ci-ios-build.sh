#!/usr/bin/env bash
# The steps of the cloud iOS build (.github/workflows/ios.yml), on a GitHub-hosted macOS runner. Run from apps/mobile:
#
#   scripts/ci-ios-build.sh select-xcode   pick Xcode $XCODE_VERSION (fails clearly when the image doesn't have it)
#   scripts/ci-ios-build.sh prebuild       npx expo prebuild --platform ios --clean (runs pod install)
#   scripts/ci-ios-build.sh build          xcodebuild the app for the iOS Simulator, unsigned
#   scripts/ci-ios-build.sh swift-tests    swift test for every SwiftPM package under modules/*/ios
#   scripts/ci-ios-build.sh pod-tests      the podspecs' test_specs (DrumMidi-Unit-Tests) on an iPad simulator
#
# Full logs go to $IOS_LOG_DIR (the workflow uploads it when a step fails). Compiler errors are also printed at the
# end of each step and annotated on the run, so the run page shows them without downloading anything.
# It works on a Mac too (no runner needed): IOS_LOG_DIR defaults to a temp dir; select-xcode needs sudo.
# Bash 3.2 compatible (macOS's /bin/bash): no mapfile, no associative arrays.
set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR=$(pwd)
REPO_ROOT=$(cd ../.. && pwd)
LOG_DIR=${IOS_LOG_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ios-logs}
WORKSPACE=ios/DrumCoach.xcworkspace # expo prebuild names it after app.json "name" ("Drum Coach") without the space
SCHEME=DrumCoach
mkdir -p "$LOG_DIR"

err() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error::$*"; else echo "error: $*" >&2; fi; }

# Prints the compiler errors of a failed xcodebuild/swift log (deduplicated) plus its tail, and annotates them.
report_failure() {
  local log=$1 what=$2
  local errors
  errors=$(grep -E '(^|: )(fatal )?error: ' "$log" | sort -u | head -n 60 || true)
  echo "----- $what failed. Compiler and tool errors (full log: $(basename "$log") in the ios-logs artifact) -----"
  if [ -n "$errors" ]; then printf '%s\n' "$errors"; else echo "(no 'error:' lines; see the tail below)"; fi
  echo "----- last 80 lines of $(basename "$log") -----"
  tail -n 80 "$log"
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    # file:line:col: error: message  ->  an annotation on that line (paths made relative to the repo root)
    printf '%s\n' "$errors" | head -n 30 | while IFS= read -r line; do
      if [[ $line =~ ^(/[^:]+):([0-9]+):([0-9]+):\ (fatal\ )?error:\ (.*)$ ]]; then
        echo "::error file=${BASH_REMATCH[1]#"$REPO_ROOT"/},line=${BASH_REMATCH[2]},col=${BASH_REMATCH[3]}::${BASH_REMATCH[5]}"
      fi
    done
    {
      echo "### $what failed"
      echo '```'
      if [ -n "$errors" ]; then printf '%s\n' "$errors"; else tail -n 40 "$log"; fi
      echo '```'
    } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  fi
}

# Runs a command with its full output in a log file (and on the console), and reports the errors if it fails.
run_logged() {
  local log=$1 what=$2
  shift 2
  echo "+ $*"
  local status=0
  "$@" 2>&1 | tee "$log" || status=$?
  if [ "$status" -ne 0 ]; then
    report_failure "$log" "$what"
    return "$status"
  fi
}

select_xcode() {
  : "${XCODE_VERSION:?set XCODE_VERSION, e.g. 27.1}"
  local app="/Applications/Xcode_${XCODE_VERSION}.app"
  if [ ! -d "$app" ]; then
    err "Xcode ${XCODE_VERSION} is not on this runner image (looked for $app). Installed: $(echo /Applications/Xcode*.app). The owner's build uses Xcode 27.1 (docs/mobile/GATE0.md §9); pick an image that has it (actions/runner-images, images/macos/*-Readme.md) rather than building with another Xcode."
    exit 1
  fi
  sudo xcode-select -s "$app/Contents/Developer"
  local got
  # Read the whole output, then keep line 1: piping into `head` closes the pipe early, and xcodebuild crashes on
  # the broken pipe (NSFileHandleOperationException), which failed the first CI run.
  got=$(xcodebuild -version)
  got=${got%%$'\n'*}
  if [ "$got" != "Xcode ${XCODE_VERSION}" ]; then
    err "Selected $app, but xcodebuild reports '$got'."
    exit 1
  fi
  xcodebuild -version
  xcodebuild -showsdks | grep -i 'iphonesimulator' || { err "No iOS Simulator SDK in Xcode ${XCODE_VERSION}."; exit 1; }
  swift --version
  echo "CocoaPods $(pod --version)"
  echo "Node $(node --version), npm $(npm --version)"
}

prebuild() {
  # --clean regenerates ios/ from app.json and the config plugins; prebuild then runs `pod install`.
  run_logged "$LOG_DIR/expo-prebuild.log" "expo prebuild + pod install" npx expo prebuild --platform ios --clean
  cp ios/Podfile ios/Podfile.properties.json "$LOG_DIR/" 2>/dev/null || true
  cp ios/Podfile.lock "$LOG_DIR/" 2>/dev/null || true
  if [ ! -d "$WORKSPACE" ]; then
    err "expo prebuild didn't create $WORKSPACE. ios/ has: $(echo ios/*)"
    exit 1
  fi
  if [ ! -f "ios/DrumCoach.xcodeproj/xcshareddata/xcschemes/$SCHEME.xcscheme" ]; then
    err "No shared scheme '$SCHEME' in ios/DrumCoach.xcodeproj."
    xcodebuild -list -workspace "$WORKSPACE" || true
    exit 1
  fi
}

build() {
  # Debug for the simulator: no signing, and React Native's bundle phase skips Metro (Debug + simulator), so this
  # compiles and links the native code only. arm64 only: the hosted runner is Apple silicon, and a generic simulator
  # destination would otherwise build x86_64 as well (twice the time; macOS minutes are expensive).
  run_logged "$LOG_DIR/xcodebuild-app.log" "xcodebuild (DrumCoach, Debug, iOS Simulator)" \
    xcodebuild \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration Debug \
    -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "${RUNNER_TEMP:-$APP_DIR/ios/build}/DerivedData" \
    ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
    COMPILER_INDEX_STORE_ENABLE=NO \
    CODE_SIGNING_ALLOWED=NO \
    build
}

swift_tests() {
  local found=0 failed=0 pkg dir name
  while IFS= read -r pkg; do
    found=$((found + 1))
    dir=$(dirname "$pkg")
    name=$(echo "${dir#modules/}" | tr '/' '-')
    echo "== swift test: $dir"
    run_logged "$LOG_DIR/swift-test-$name.log" "swift test ($dir)" swift test --package-path "$dir" || failed=$((failed + 1))
  done < <(find modules -path '*/ios/*' -name Package.swift -not -path '*/.build/*' -not -path '*/node_modules/*' | sort)
  if [ "$found" -eq 0 ]; then
    err "No SwiftPM package under modules/*/ios (expected modules/drum-audio/ios/Core)."
    exit 1
  fi
  echo "SwiftPM packages: $found, failed: $failed"
  [ "$failed" -eq 0 ]
}

pod_tests() {
  # The podspecs' test_specs are only installed with `use_expo_modules!(includeTests: true)` (see the header of
  # modules/drum-midi/ios/Tests/BatchPolicyTests.swift). ios/ is generated and never committed, so patch it here.
  if ! grep -q '^  use_expo_modules!$' ios/Podfile; then
    err "ios/Podfile has no plain 'use_expo_modules!' line to add includeTests to; the Expo template changed."
    exit 1
  fi
  # includeTests turns on every module's test specs, and some of Expo's own (ExpoSQLite/Benchmarks) depend on
  # ExpoModulesTestCore, which isn't published: the second CI run failed there. Limit test specs to our local modules
  # by narrowing Expo's own check (scripts/ios/precompiled_modules.rb `should_include_test_specs?`) in the Podfile.
  local ours
  ours=$(ls modules | while IFS= read -r m; do ls "modules/$m/ios"/*.podspec 2>/dev/null; done | sed -E 's#.*/([^/]+)\.podspec$#"\1"#' | paste -sd, -)
  [ -n "$ours" ] || { err "No local module podspecs under modules/*/ios."; exit 1; }
  perl -pi -e 's/^  use_expo_modules!$/  Expo::PrecompiledModules.singleton_class.prepend(Module.new { define_method(:should_include_test_specs?) { |name| ['"$ours"'].include?(name) && super(name) } })\n  use_expo_modules!(includeTests: true)/' ios/Podfile
  (cd ios && run_logged "$LOG_DIR/pod-install-tests.log" "pod install (with test specs)" pod install)

  # Every test spec of a local module: <Pod>-Unit-<TestSpec>, e.g. DrumMidi-Unit-Tests.
  local pods schemes
  pods=$(sed -n "s/^ *s.name *= *'\([A-Za-z0-9]*\)'.*/\1/p" modules/*/ios/*.podspec)
  schemes=$(xcodebuild -list -json -workspace "$WORKSPACE" | PODS=$pods node -e '
    const { workspace } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const pods = process.env.PODS.split(/\s+/).filter(Boolean);
    console.log(workspace.schemes.filter(s => pods.some(p => s.startsWith(p + "-Unit-"))).join("\n"));
  ')
  if [ -z "$schemes" ]; then
    err "No <Pod>-Unit-* test scheme in $WORKSPACE after pod install with includeTests."
    xcodebuild -list -workspace "$WORKSPACE" || true
    exit 1
  fi

  # Any available iPad simulator of the selected Xcode (the tests touch no hardware).
  local udid
  udid=$(xcrun simctl list devices available --json | node -e '
    const { devices } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const ios = Object.entries(devices).filter(([rt]) => rt.includes("SimRuntime.iOS")).sort(([a], [b]) => b.localeCompare(a, "en", { numeric: true }));
    const all = ios.flatMap(([, list]) => list);
    const pick = all.find(d => d.name.startsWith("iPad")) ?? all[0];
    if (pick) console.log(pick.udid);
  ')
  if [ -z "$udid" ]; then
    err "No available iOS simulator on this image."
    xcrun simctl list devices available || true
    exit 1
  fi
  xcrun simctl list devices available | grep "$udid"

  local scheme failed=0
  while IFS= read -r scheme; do
    echo "== xcodebuild test: $scheme"
    run_logged "$LOG_DIR/xcodebuild-$scheme.log" "xcodebuild test ($scheme)" \
      xcodebuild \
      -workspace "$WORKSPACE" \
      -scheme "$scheme" \
      -configuration Debug \
      -destination "platform=iOS Simulator,id=$udid" \
      -derivedDataPath "${RUNNER_TEMP:-$APP_DIR/ios/build}/DerivedData" \
      -resultBundlePath "$LOG_DIR/$scheme.xcresult" \
      COMPILER_INDEX_STORE_ENABLE=NO \
      CODE_SIGNING_ALLOWED=NO \
      test || failed=$((failed + 1))
  done <<< "$schemes"
  [ "$failed" -eq 0 ]
}

case "${1:-}" in
  select-xcode) select_xcode ;;
  prebuild) prebuild ;;
  build) build ;;
  swift-tests) swift_tests ;;
  pod-tests) pod_tests ;;
  *)
    echo "usage: $0 select-xcode|prebuild|build|swift-tests|pod-tests" >&2
    exit 2
    ;;
esac
