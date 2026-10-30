// T6-6: the packed-event reader. The same vectors as `packedVectors` in src/packing.test.ts. Written in a Linux
// container: NOT compiled or run yet. Run: `swift test` in ios/Core.
import XCTest
@testable import DrumAudioCore

final class EventPackingTests: XCTestCase {
  private let vectors: [(String, [Double], Int, Int)] = [
    ("empty", [], 0, 0),
    ("one click", [0, 1000, 0, 1], 1, 0),
    ("click + band", [0, 1000, 1, 0.75, 1, 1100, 0, 240, 100, 1, 36], 2, 0),
    ("NaN time skipped, next kept", [0, .nan, 0, 1, 0, 1000, 2, 0.35], 1, 1),
    ("negative index skipped", [0, 1000, -1, 1, 0, 1000, 1, 1], 1, 1),
    ("fractional index skipped", [0, 1000, 1.5, 1], 0, 1),
    ("huge index skipped", [0, 1000, 1e300, 1], 0, 1),
    ("truncated sound stops reading", [0, 1000, 1], 0, 1),
    ("unknown kind stops reading", [7, 1000, 0, 1, 0, 1000, 0, 1], 0, 1),
    ("band n = 0 stops reading", [1, 1000, 0, 240, 100, 0], 0, 1),
    ("band n = 17 stops reading", [1, 1000, 0, 240, 100, 17], 0, 1),
    ("band n past the end stops reading", [1, 1000, 0, 240, 100, 3, 36, 40], 0, 1),
    ("band note 128 skipped", [1, 1000, 0, 240, 100, 1, 128, 0, 1000, 0, 1], 1, 1),
    ("band part 2 skipped", [1, 1000, 2, 240, 100, 1, 36], 0, 1),
    ("band duration 0 skipped", [1, 1000, 0, 0, 100, 1, 36], 0, 1),
    ("click after a good band", [1, 1000, 1, 480, 90, 3, 60, 64, 67, 0, 1200, 0, 1], 2, 0),
  ]

  func testVectors() {
    for (name, packed, valid, invalid) in vectors {
      let r = EventPacking.unpack(packed)
      XCTAssertEqual(r.events.count, valid, name)
      XCTAssertEqual(r.invalid, invalid, name)
    }
  }

  func testRoundTripValues() {
    let at = 1e9 + 0.123456
    let r = EventPacking.unpack([0, at, 11, 0.5, 1, at + 1000, 1, 480, 90, 3, 60, 64, 67])
    XCTAssertEqual(r.invalid, 0)
    XCTAssertEqual(r.events, [
      .sound(at: at, index: 11, gain: 0.5),
      .band(at: at + 1000, part: .keys, durMs: 480, vel: 90, midi: [60, 64, 67]),
    ])
  }

  func testSoundTable() {
    XCTAssertEqual(SoundTable.pads.count, 10)
    XCTAssertEqual(SoundTable.firstDrum + SoundTable.pads.firstIndex(of: "snare")!, 11)
    XCTAssertEqual([0, 2, 3, 9, 10, 19, 20, 999, 1000, 5000].map { SoundTable.bus(ofSound: $0) },
                   [.click, .click, nil, nil, .drums, .drums, nil, nil, .voice, .voice])
    XCTAssertEqual(SoundTable.wordKey("  Seven "), "seven")
  }
}
