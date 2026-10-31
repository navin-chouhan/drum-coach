Pod::Spec.new do |s|
  s.name           = 'DrumYouTube'
  s.version        = '0.1.0'
  s.summary        = "Drum Coach: YouTube's own IFrame player in a WKWebView whose page has the app's https origin"
  s.description    = 'Local Expo module for apps/mobile. iOS only. A native view that plays a YouTube video in the official IFrame player (no download, capture or storage of any media) and forwards its events; the controller lives in TypeScript.'
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
  s.frameworks = 'UIKit', 'WebKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
  # The XCTest files stay out of the app's pod (they import XCTest).
  s.exclude_files = 'Tests/**/*'

  # Pure-function tests (PlayerPage: the page, ids, commands; ClockOffset). The app build never compiles them; how to
  # run them: the header of Tests/PlayerPageTests.swift.
  s.test_spec 'Tests' do |test_spec|
    test_spec.source_files = 'Tests/**/*.swift'
    test_spec.frameworks = 'XCTest'
    # ExpoModulesCore is C++ inside: without libc++ the test bundle fails to link (as DrumMidi's did in the cloud
    # iOS build). The app target gets it from React Native; the bare test bundle doesn't.
    test_spec.pod_target_xcconfig = { 'OTHER_LDFLAGS' => '$(inherited) -lc++' }
  end
end
