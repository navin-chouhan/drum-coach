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
    XCTAssertEqual(KeyPress.name(hidUsage: 0x0B, charactersIgnoringModifiers: "h"), "h") // a command letter (hints)
    XCTAssertEqual(KeyPress.name(hidUsage: 0x1E, charactersIgnoringModifiers: "1"), "1")
    XCTAssertEqual(KeyPress.name(hidUsage: 0x00, charactersIgnoringModifiers: ""), "")
    // a function key (F1): UIKit's private-use character
    XCTAssertEqual(KeyPress.name(hidUsage: 0x3A, charactersIgnoringModifiers: "\u{F704}"), "")
  }

  func testArrowNames() {
    // the arrows' characters are UIKit's private-use strings: named by HID usage, as the web's KeyboardEvent.key
    XCTAssertEqual(KeyPress.name(hidUsage: KeyPress.hidLeftArrow, charactersIgnoringModifiers: "\u{F702}"), "ArrowLeft")
    XCTAssertEqual(KeyPress.name(hidUsage: KeyPress.hidRightArrow, charactersIgnoringModifiers: "\u{F703}"), "ArrowRight")
    XCTAssertEqual(KeyPress.name(hidUsage: KeyPress.hidUpArrow, charactersIgnoringModifiers: "\u{F700}"), "ArrowUp")
    XCTAssertEqual(KeyPress.name(hidUsage: KeyPress.hidDownArrow, charactersIgnoringModifiers: "\u{F701}"), "ArrowDown")
    XCTAssertEqual(KeyPress.hidLeftArrow, 0x50)
    XCTAssertEqual(KeyPress.hidRightArrow, 0x4F)
    XCTAssertEqual(KeyPress.hidUpArrow, 0x52)
    XCTAssertEqual(KeyPress.hidDownArrow, 0x51)
    XCTAssertFalse(KeyPress.passesThrough(hidUsage: KeyPress.hidLeftArrow, command: false, control: false))
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
