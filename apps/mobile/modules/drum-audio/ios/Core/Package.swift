// swift-tools-version:5.9
// The pure Swift of DrumAudio (no AVFoundation, no Expo), as a package so it can be tested with `swift test` on a
// Mac (T6-6, AUDIO-DESIGN §7.1). The app's pod compiles the same Sources/ files into the DrumAudio module
// (ios/DrumAudio.podspec); this file and Tests/ are excluded from it.
//
//   cd apps/mobile/modules/drum-audio/ios/Core && swift test
import PackageDescription

let package = Package(
  name: "DrumAudioCore",
  platforms: [.macOS(.v13), .iOS(.v16)],
  targets: [
    .target(name: "DrumAudioCore", path: "Sources/DrumAudioCore"),
    .testTarget(name: "DrumAudioCoreTests", dependencies: ["DrumAudioCore"], path: "Tests/DrumAudioCoreTests"),
  ]
)
