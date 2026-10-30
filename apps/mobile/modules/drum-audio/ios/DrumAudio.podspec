Pod::Spec.new do |s|
  s.name           = 'DrumAudio'
  s.version        = '0.1.0'
  s.summary        = 'Drum Coach: AVAudioEngine with player-node pools, host-time scheduling and a native lookahead loop'
  s.description    = 'Local Expo module for apps/mobile. iOS only. Plays pre-rendered clicks, drums, band notes and words at mach host times (the clock of CoreMIDI timestamps). Design: docs/mobile/AUDIO-DESIGN.md.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # The module's files plus the pure core (Core/Sources), compiled into one module. Core/Package.swift and
  # Core/Tests are for `swift test` on the Mac (T6-6) and stay out of the app.
  s.source_files = '*.swift', 'Core/Sources/**/*.swift'
  s.exclude_files = 'Core/Package.swift', 'Core/Tests/**/*'
end
