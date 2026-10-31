Pod::Spec.new do |s|
  s.name           = 'DrumMidi'
  s.version        = '0.2.0'
  s.summary        = 'Drum Coach: CoreMIDI input (raw bytes + host timestamps, batched), Network MIDI (no audio: drum-audio owns the audio session)'
  s.description    = 'Local Expo module for apps/mobile. iOS only. Native code forwards bytes and timestamps in batches; all MIDI semantics live in TypeScript.'
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
  s.frameworks = 'CoreMIDI'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
  # The XCTest files stay out of the app's pod (they import XCTest).
  s.exclude_files = 'Tests/**/*'

  # Pure-function tests (HostClock, BatchPolicy, InputSelection). The app build never compiles them; how to
  # run them: the header of Tests/BatchPolicyTests.swift.
  s.test_spec 'Tests' do |test_spec|
    test_spec.source_files = 'Tests/**/*.swift'
    test_spec.frameworks = 'XCTest'
    # ExpoModulesCore is C++ inside: without libc++ the test bundle fails to link (std::terminate, operator new…),
    # as the cloud iOS build showed. The app target gets it from React Native; the bare test bundle doesn't.
    test_spec.pod_target_xcconfig = { 'OTHER_LDFLAGS' => '$(inherited) -lc++' }
  end
end
