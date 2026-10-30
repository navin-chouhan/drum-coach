import Foundation

/// The reader for `schedule`'s flat [Double]: a mirror of `unpackEvents` and the sound table in `src/packing.ts`
/// (which documents the record layout). Change both together; EventPackingTests.swift runs the same vectors.
enum PackedEvent: Equatable {
  case sound(at: Double, index: Int, gain: Double)
  case band(at: Double, part: BandPart, durMs: Double, vel: Double, midi: [Int])

  var at: Double {
    switch self {
    case let .sound(at, _, _): return at
    case let .band(at, _, _, _, _): return at
    }
  }
}

enum BandPart: Int {
  case bass = 0
  case keys = 1
}

enum SoundTable {
  static let clickBar = 0
  static let clickBeat = 1
  static let clickSub = 2
  static let firstDrum = 10
  static let firstWord = 1000
  /// The web's PADS order (src/engine/kit.ts); index firstDrum + position.
  static let pads = ["kick", "snare", "hhClosed", "hhOpen", "hhPedal", "tom1", "tom2", "floor", "crash", "ride"]

  static func bus(ofSound index: Int) -> Bus? {
    if index >= 0 && index <= 2 { return .click }
    if index >= firstDrum && index < firstDrum + pads.count { return .drums }
    if index >= firstWord { return .voice }
    return nil
  }

  /// The normalised text a word is cached under (wordKey in packing.ts).
  static func wordKey(_ text: String) -> String {
    return text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }
}

enum EventPacking {
  static let kindSound = 0.0
  static let kindBand = 1.0
  static let maxBandNotes = 16

  /// Reads records until the end. A malformed record stops reading (the rest counts as one invalid); a well-formed
  /// record with a bad value is skipped and counted.
  static func unpack(_ data: [Double]) -> (events: [PackedEvent], invalid: Int) {
    var events: [PackedEvent] = []
    var invalid = 0
    var i = 0
    while i < data.count {
      let kind = data[i]
      if kind == kindSound {
        guard i + 4 <= data.count else { return (events, invalid + 1) }
        let at = data[i + 1], index = data[i + 2], gain = data[i + 3]
        i += 4
        if at.isFinite && isInt(index) && index >= 0 && gain.isFinite {
          events.append(.sound(at: at, index: Int(index), gain: gain))
        } else {
          invalid += 1
        }
      } else if kind == kindBand {
        guard i + 6 <= data.count else { return (events, invalid + 1) }
        let n = data[i + 5]
        guard isInt(n), n >= 1, n <= Double(maxBandNotes), i + 6 + Int(n) <= data.count else { return (events, invalid + 1) }
        let count = Int(n)
        let at = data[i + 1], part = data[i + 2], durMs = data[i + 3], vel = data[i + 4]
        let midi = Array(data[(i + 6)..<(i + 6 + count)])
        i += 6 + count
        let notesOk = midi.allSatisfy { $0.isFinite && $0 >= 0 && $0 <= 127 }
        if at.isFinite, part == 0 || part == 1, durMs.isFinite, durMs > 0, vel.isFinite, notesOk,
           let bandPart = BandPart(rawValue: Int(part)) {
          events.append(.band(at: at, part: bandPart, durMs: durMs, vel: vel, midi: midi.map { Int($0.rounded()) }))
        } else {
          invalid += 1
        }
      } else {
        return (events, invalid + 1)
      }
    }
    return (events, invalid)
  }

  private static func isInt(_ x: Double) -> Bool {
    return x.isFinite && x.rounded(.towardZero) == x && abs(x) < 1e9
  }
}
