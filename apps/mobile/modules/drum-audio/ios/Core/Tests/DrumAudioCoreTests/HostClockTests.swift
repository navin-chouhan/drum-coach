// T6-6: HostClock ms ↔ ticks. Written in a Linux container: NOT compiled or run yet. Run: `swift test` in ios/Core.
import XCTest
@testable import DrumAudioCore

final class HostClockTests: XCTestCase {
  func testRoundTripAt1e9MsAppleSilicon() {
    // Apple silicon: 125/3 ns per tick.
    let ms = 1e9 + 0.123456
    let ticks = HostClock.msToTicks(ms, numer: 125, denom: 3)
    XCTAssertEqual(HostClock.ticksToMs(ticks, numer: 125, denom: 3), ms, accuracy: 1e-4) // one tick = 41.7 ns
  }

  func testRoundTripNanosecondTimebase() {
    let ms = 1e9 + 0.5
    let ticks = HostClock.msToTicks(ms, numer: 1, denom: 1)
    XCTAssertEqual(ticks, 1_000_000_000_500_000)
    XCTAssertEqual(HostClock.ticksToMs(ticks, numer: 1, denom: 1), ms, accuracy: 1e-6)
  }

  func testNegativeMsIsZeroTicks() {
    XCTAssertEqual(HostClock.msToTicks(-5, numer: 125, denom: 3), 0)
    XCTAssertEqual(HostClock.msToTicks(0, numer: 125, denom: 3), 0)
  }

  func testNowIsMonotonic() {
    let a = HostClock.nowMs()
    let b = HostClock.nowMs()
    XCTAssertGreaterThanOrEqual(b, a)
  }
}
