// Unit tests for the pure Swift functions of DrumMidi. Written in a Linux container: NOT compiled or run yet.
//
// How to run (on the Mac): in apps/mobile/ios/Podfile change `use_expo_modules!` to
// `use_expo_modules!(includeTests: true)`, run `pod install`, open the workspace, pick the `DrumMidi-Unit-Tests`
// scheme and press Cmd+U (an iOS simulator is fine: nothing here touches CoreMIDI). Don't commit the Podfile change.
//
// These mirror src/batchPolicy.test.ts: the same vectors must give the same answers.

import XCTest
@testable import DrumMidi

final class BatchPolicyTests: XCTestCase {
  // Same table as `vectors` in src/batchPolicy.test.ts.
  private let vectors: [(String, [Int], PacketKind)] = [
    ("clock", [0xF8], .realtimeOnly),
    ("active sensing", [0xFE], .realtimeOnly),
    ("two clocks", [0xF8, 0xF8], .realtimeOnly),
    ("empty", [], .realtimeOnly),
    ("snare hit ch10", [0x99, 38, 100], .noteOn),
    ("kick hit ch1", [0x90, 36, 15], .noteOn),
    ("note-off as note-on vel 0", [0x99, 38, 0], .other),
    ("real note-off", [0x89, 38, 64], .other),
    ("hi-hat choke (poly AT 127)", [0xA9, 46, 127], .other),
    ("CC hi-hat pedal", [0xB9, 4, 90], .other),
    ("running status: off then on", [0x99, 36, 0, 38, 90], .noteOn),
    ("running status: two offs", [0x99, 36, 0, 38, 0], .other),
    ("clock inside a note-on", [0x99, 0xF8, 38, 0xF8, 100], .noteOn),
    ("clock then hit", [0xF8, 0x99, 42, 80], .noteOn),
    ("choke then hit", [0xA9, 46, 127, 0x99, 42, 80], .noteOn),
    ("note-on cut short", [0x99, 38], .other),
    ("sysex with 0x90-like data stays sysex", [0xF0, 0x7E, 0x10, 0x20, 0xF7], .other),
    ("data after sysex has no running status", [0xF0, 0x01, 0xF7, 38, 100], .other),
    ("song position", [0xF2, 0x10, 0x20], .other),
  ]

  func testClassify() {
    for (name, bytes, kind) in vectors {
      XCTAssertEqual(BatchPolicy.classify(bytes), kind, name)
    }
  }

  func testMaxWait() {
    let p = BatchPolicy()
    XCTAssertEqual(p.maxWait(.noteOn), 0)
    XCTAssertEqual(p.maxWait(.other), 8)
    XCTAssertEqual(p.maxWait(.realtimeOnly), 33)
    XCTAssertEqual(p.maxPackets, 128)
  }

  func testNextDeadlineKeepsTheEarliest() {
    let p = BatchPolicy()
    XCTAssertEqual(p.nextDeadline(current: nil, kind: .realtimeOnly, arrivalMs: 100), 133)
    XCTAssertEqual(p.nextDeadline(current: 133, kind: .other, arrivalMs: 110), 118)
    XCTAssertEqual(p.nextDeadline(current: 118, kind: .realtimeOnly, arrivalMs: 112), 118)
    XCTAssertEqual(p.nextDeadline(current: 118, kind: .noteOn, arrivalMs: 115), 115)
  }

  func testFlushReason() {
    let p = BatchPolicy()
    XCTAssertEqual(p.flushReason(kind: .noteOn, count: 1, deadlineMs: 100, nowMs: 100), .noteOn)
    XCTAssertNil(p.flushReason(kind: .realtimeOnly, count: 5, deadlineMs: 133, nowMs: 101))
    XCTAssertEqual(p.flushReason(kind: .realtimeOnly, count: p.maxPackets, deadlineMs: 133, nowMs: 101), .full)
    XCTAssertNil(p.flushReason(kind: nil, count: 3, deadlineMs: 133, nowMs: 132.9))
    XCTAssertEqual(p.flushReason(kind: nil, count: 3, deadlineMs: 133, nowMs: 133), .deadline)
    XCTAssertNil(p.flushReason(kind: nil, count: 0, deadlineMs: 133, nowMs: 200))
  }

  /// The "note-off pulls a clock batch forward" case of the TS model, stepped by hand.
  func testNoteOffPullsAClockBatchForward() {
    let p = BatchPolicy()
    var deadline = p.nextDeadline(current: nil, kind: .realtimeOnly, arrivalMs: 0)
    XCTAssertEqual(deadline, 33)
    deadline = p.nextDeadline(current: deadline, kind: BatchPolicy.classify([0x99, 38, 0]), arrivalMs: 5)
    XCTAssertEqual(deadline, 13)
    XCTAssertNil(p.flushReason(kind: nil, count: 2, deadlineMs: deadline, nowMs: 12))
    XCTAssertEqual(p.flushReason(kind: nil, count: 2, deadlineMs: deadline, nowMs: 13), .deadline)
  }
}

final class HostClockTests: XCTestCase {
  func testAppleSiliconTimebase() {
    // 125/3 ns per tick (the iPad's M1, GATE0 §9): 24 000 000 ticks = 1 s.
    XCTAssertEqual(HostClock.ticksToMs(24_000_000, numer: 125, denom: 3), 1000, accuracy: 1e-9)
    XCTAssertEqual(HostClock.msToTicks(1000, numer: 125, denom: 3), 24_000_000)
  }

  func testNanosecondTimebase() {
    XCTAssertEqual(HostClock.ticksToMs(1_500_000, numer: 1, denom: 1), 1.5, accuracy: 1e-12)
    XCTAssertEqual(HostClock.msToTicks(1.5, numer: 1, denom: 1), 1_500_000)
  }

  func testRoundTripAfterHoursOfUptime() {
    let ticks: UInt64 = 24_000_000 * 3600 * 50 + 7 // 50 h of uptime on 125/3
    let ms = HostClock.ticksToMs(ticks, numer: 125, denom: 3)
    let back = HostClock.msToTicks(ms, numer: 125, denom: 3)
    XCTAssertLessThanOrEqual(back > ticks ? back - ticks : ticks - back, 1)
  }

  func testNegativeMsGivesZeroTicks() {
    XCTAssertEqual(HostClock.msToTicks(-5, numer: 125, denom: 3), 0)
    XCTAssertEqual(HostClock.msToTicks(0, numer: 125, denom: 3), 0)
  }

  func testPacketTimestampZeroMeansNow() {
    XCTAssertEqual(HostClock.packetMs(timeStamp: 0, receivedMs: 1234.5, numer: 125, denom: 3), 1234.5)
    XCTAssertEqual(HostClock.packetMs(timeStamp: 24_000_000, receivedMs: 1234.5, numer: 125, denom: 3), 1000, accuracy: 1e-9)
  }

  func testLiveClockIsMonotonic() {
    let a = HostClock.nowMs()
    let b = HostClock.nowMs()
    XCTAssertGreaterThanOrEqual(b, a)
    let back = HostClock.msToTicks(HostClock.ticksToMs(48_000_000)) // the device's own timebase
    XCTAssertLessThanOrEqual(back > 48_000_000 ? back - 48_000_000 : 48_000_000 - back, 1)
  }
}
