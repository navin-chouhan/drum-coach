Pod::Spec.new do |s|
  s.name           = 'DrumMidi'
  s.version        = '0.1.0'
  s.summary        = 'Drum Coach Gate 0: CoreMIDI input (raw bytes + host timestamps), Network MIDI and host-time clicks'
  s.description    = 'Local Expo module for the midi-probe spike. iOS only. Native code forwards bytes and timestamps; all MIDI semantics live in TypeScript.'
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
  s.frameworks = 'CoreMIDI', 'AVFoundation'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
