// Unit tests for the pure Swift functions of DrumKeys. Written in a Linux container: NOT compiled or run yet.
//
// How to run (on the Mac): in apps/mobile/ios/Podfile change `use_expo_modules!` to
// `use_expo_modules!(includeTests: true)`, run `pod install`, open the workspace, pick the `DrumKeys-Unit-Tests`
// scheme and press Cmd+U (an iOS simulator is fine). Don't commit the Podfile change.
//
// The key map itself is TypeScript (apps/mobile/src/platform/keyboardCore.ts, tested in keyboardCore.test.ts).

import XCTest
@testable import DrumKeys

final class KeyPressTests: XCTestCase {
  func testNames() {
    XCTAssertEqual(KeyPress.name(hidUsage: KeyPress.hidSpace, charactersIgnoringModifiers: " "), " ")
    XCTAssertEqual(KeyPress.name(hidUsage: KeyPress.hidEscape, charactersIgnoringModifiers: "\u{1b}"), "Escape")
    XCTAssertEqual(KeyPress.name(hidUsage: KeyPress.hidReturn, charactersIgnoringModifiers: "\r"), "Enter")
    XCTAssertEqual(KeyPress.name(hidUsage: KeyPress.hidKeypadEnter, charactersIgnoringModifiers: "\r"), "Enter")
    XCTAssertEqual(KeyPress.name(hidUsage: 0x16, charactersIgnoringModifiers: "S"), "s")
    XCTAssertEqual(KeyPress.name(hidUsage: 0x14, charactersIgnoringModifiers: "q"), "q")
    // an arrow key: UIKit's private-use character
    XCTAssertEqual(KeyPress.name(hidUsage: 0x52, charactersIgnoringModifiers: "\u{F700}"), "")
    XCTAssertEqual(KeyPress.name(hidUsage: 0x00, charactersIgnoringModifiers: ""), "")
  }

  func testPassThrough() {
    XCTAssertTrue(KeyPress.passesThrough(hidUsage: 0x16, command: true, control: false))
    XCTAssertTrue(KeyPress.passesThrough(hidUsage: 0x16, command: false, control: true))
    XCTAssertTrue(KeyPress.passesThrough(hidUsage: KeyPress.hidTab, command: false, control: false))
    XCTAssertFalse(KeyPress.passesThrough(hidUsage: 0x16, command: false, control: false))
  }

  func testHostMs() {
    // pressed 12 ms before "now"
    XCTAssertEqual(KeyPress.hostMs(pressTimestamp: 100.000, uptimeNow: 100.012, nowMs: 5000), 4988, accuracy: 1e-6)
    XCTAssertEqual(KeyPress.hostMs(pressTimestamp: 0, uptimeNow: 100, nowMs: 5000), 5000)
    XCTAssertEqual(KeyPress.hostMs(pressTimestamp: 101, uptimeNow: 100, nowMs: 5000), 5000) // in the future
    XCTAssertEqual(KeyPress.hostMs(pressTimestamp: 90, uptimeNow: 100, nowMs: 5000), 5000) // stale
  }

  func testHostClockMatchesDrumMidi() {
    // Same conversions as DrumMidi's HostClock (Apple silicon timebase 125/3).
    XCTAssertEqual(HostClock.ticksToMs(24_000_000, numer: 125, denom: 3), 1000, accuracy: 1e-9)
    XCTAssertEqual(HostClock.msToTicks(1000, numer: 125, denom: 3), 24_000_000)
  }
}
