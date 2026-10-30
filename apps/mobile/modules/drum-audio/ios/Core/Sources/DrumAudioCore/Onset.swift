import Foundation

enum Onset {
  /// Where a word's sound starts, s (the web's `onsetOf`, src/voice/voice.ts): RMS over 10 ms windows; the first
  /// window at ≥ 50 % of the loudest one; 0 if that's the first window. The vowel then lands on the beat.
  static func seconds(_ x: [Float], sampleRate: Double) -> Double {
    let win = max(1, Int((sampleRate * 0.01).rounded()))
    var env: [Double] = []
    var i = 0
    while i + win <= x.count {
      var s = 0.0
      for j in i..<(i + win) { s += Double(x[j]) * Double(x[j]) }
      env.append((s / Double(win)).squareRoot())
      i += win
    }
    let peak = max(0, env.max() ?? 0)
    guard let k = env.firstIndex(where: { $0 >= peak * 0.5 }), k > 0 else { return 0 }
    return Double(k * win) / sampleRate
  }

  /// Drops the silence after the last sample above `floor` (keeping `tailS`), so a spoken word doesn't hold a
  /// voice node for its trailing silence.
  static func trimTail(_ x: [Float], sampleRate: Double, floor: Float = 0.001, tailS: Double = 0.02) -> [Float] {
    guard let last = x.lastIndex(where: { abs($0) > floor }) else { return [] }
    let end = min(x.count, last + 1 + Int(tailS * sampleRate))
    return Array(x[0..<end])
  }
}

/// Finds click onsets in a stream of output buffers (the T6-8 timing probe). A sample with |x| ≥ `threshold` is an
/// onset when at least `quietS` worth of samples with |x| < `quiet` came since the last loud one. It is then moved back
/// to the first sample above `floor` within the last 2 ms of the same buffer (a click starts at 0 and rises, so this
/// is its first non-silent sample).
struct OnsetDetector {
  var threshold: Float = 0.05
  var quiet: Float = 0.01
  var quietS: Double = 0.02
  var floor: Float = 0.0005
  let sampleRate: Double
  private var quietFrames = Int.max / 2 // the stream starts quiet

  init(sampleRate: Double) {
    self.sampleRate = sampleRate
  }

  /// Onset frame indexes within `x`.
  mutating func process(_ x: UnsafeBufferPointer<Float>) -> [Int] {
    var found: [Int] = []
    let needQuiet = Int(quietS * sampleRate)
    let back = Int(0.002 * sampleRate)
    for i in 0..<x.count {
      let a = abs(x[i])
      if a >= threshold {
        if quietFrames >= needQuiet {
          var start = i
          let lo = max(0, i - back)
          while start > lo && abs(x[start - 1]) > floor { start -= 1 }
          found.append(start)
        }
        quietFrames = 0
      } else if a < quiet {
        quietFrames += 1 // samples between `quiet` and `threshold` (a rising edge, a tail) neither count nor reset
      }
    }
    return found
  }

  mutating func process(_ x: [Float]) -> [Int] {
    return x.withUnsafeBufferPointer { process($0) }
  }
}
