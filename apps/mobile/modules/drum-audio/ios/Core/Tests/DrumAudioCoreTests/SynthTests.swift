// T6-6: the renderers (length, peak, no NaN) and the onset finder. Written in a Linux container: NOT compiled or
// run yet. Run: `swift test` in ios/Core.
import XCTest
@testable import DrumAudioCore

final class SynthTests: XCTestCase {
  private let rate = 48_000.0

  private func assertClean(_ x: [Float], _ name: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertFalse(x.contains { !$0.isFinite }, "\(name) has NaN/inf", file: file, line: line)
  }

  func testClicks() {
    let expectedPeaks: [Float] = [1, 0.75, 0.35]
    for level in 0...2 {
      let c = Synth.click(level: level, sampleRate: rate)
      XCTAssertEqual(c.count, 2880) // 60 ms
      assertClean(c, "click \(level)")
      XCTAssertEqual(Synth.peakAbs(c), expectedPeaks[level], accuracy: 0.1) // sampled peaks: 0.909 / 0.693 / 0.333
      XCTAssertEqual(c[0], 0, accuracy: 1e-6) // starts at zero (onset is exact)
      XCTAssertLessThan(abs(c[2879]), 0.001) // decayed to the 0.0001 floor
    }
    // 44.1 kHz routes work too
    XCTAssertEqual(Synth.click(level: 1, sampleRate: 44_100).count, 2646)
  }

  func testDrums() {
    // [pad, length s (longest component: decay + 0.05), max peak]
    let vectors: [(String, Double, Float)] = [
      ("kick", 0.43, 1.4), ("snare", 0.25, 1.2), ("tom1", 0.5, 0.95), ("tom2", 0.55, 0.95), ("floor", 0.65, 1.05),
      ("hhPedal", 0.09, 0.6), ("hhClosed", 0.11, 1), ("hhOpen", 0.5, 1), ("crash", 1.65, 1.2), ("ride", 0.95, 0.6),
    ]
    for (pad, seconds, maxPeak) in vectors {
      let d = Synth.drum(pad, sampleRate: rate)
      XCTAssertEqual(d.count, Int((seconds * rate).rounded()), pad)
      assertClean(d, pad)
      let p = Synth.peakAbs(d)
      XCTAssertGreaterThan(p, 0.02, pad)
      XCTAssertLessThan(p, maxPeak, pad)
    }
    XCTAssertEqual(Synth.drum("cowbell", sampleRate: rate), [])
    XCTAssertEqual(SoundTable.pads.map { Synth.drum($0, sampleRate: rate).isEmpty }, Array(repeating: false, count: 10))
  }

  func testRendersAreDeterministic() {
    XCTAssertEqual(Synth.drum("snare", sampleRate: rate), Synth.drum("snare", sampleRate: rate))
  }

  func testBandNotes() {
    let bass = Synth.bandNote(part: .bass, midi: [36], seconds: 0.5, vel: 100, sampleRate: rate)
    XCTAssertEqual(bass.count, Int(((0.5 * 0.92 + 0.3) * rate).rounded()))
    assertClean(bass, "bass")
    XCTAssertGreaterThan(Synth.peakAbs(bass), 0.05)
    XCTAssertLessThan(Synth.peakAbs(bass), 1)
    let keys = Synth.bandNote(part: .keys, midi: [60, 64, 67], seconds: 1, vel: 90, sampleRate: rate)
    XCTAssertEqual(keys.count, Int(((0.95 + 0.3) * rate).rounded()))
    assertClean(keys, "keys")
    XCTAssertLessThan(Synth.peakAbs(keys), 0.6)
    XCTAssertEqual(Synth.bandNote(part: .keys, midi: [], seconds: 1, vel: 90, sampleRate: rate), [])
    XCTAssertEqual(Synth.bandNote(part: .bass, midi: [36], seconds: 1, vel: 0, sampleRate: rate), [])
    // a short note still has its 50 ms minimum and 0.3 s tail; a huge one is capped
    XCTAssertEqual(Synth.bandNote(part: .bass, midi: [36], seconds: 0.01, vel: 100, sampleRate: rate).count, Int((0.35 * rate).rounded()))
    XCTAssertEqual(Synth.bandNote(part: .bass, midi: [36], seconds: 1000, vel: 100, sampleRate: rate).count,
                   Int(((16 * 0.92 + 0.3) * rate).rounded()))
  }

  func testPadEnvelopeShape() {
    let env = Synth.padEnvelope(frames: Int(1.3 * rate), sampleRate: rate, peak: 0.5, end: 1)
    XCTAssertEqual(env[0], 0.0001, accuracy: 1e-9)
    XCTAssertEqual(env[Int(0.03 * rate)], 0.5, accuracy: 1e-9) // held after the 12 ms attack
    XCTAssertEqual(env[Int(0.999 * rate)], 0.35 + 0.15 * exp(-0.949 / 0.15), accuracy: 1e-3) // settling to 0.7 × peak
    XCTAssertLessThan(env[Int(1.29 * rate)], 0.001) // released
  }

  func testScaled() {
    XCTAssertEqual(Synth.scaled([0.5, -1], by: 0.5), [0.25, -0.5])
  }

  func testBiquadHighpassBlocksDC() {
    var hp = Synth.Biquad(.highpass, frequency: 1000, sampleRate: rate)
    var y = 0.0
    for _ in 0..<10_000 { y = hp.process(1) }
    XCTAssertEqual(y, 0, accuracy: 1e-6)
    var lp = Synth.Biquad(.lowpass, frequency: 1000, sampleRate: rate)
    for _ in 0..<10_000 { y = lp.process(1) }
    XCTAssertEqual(y, 1, accuracy: 1e-6)
  }

  // MARK: - Onsets

  func testWordOnsetLikeTheWeb() {
    // 100 ms of silence, then a tone: the first 10 ms window at ≥ 50 % of the peak RMS is at 100 ms.
    var x = [Float](repeating: 0, count: Int(0.1 * rate))
    x += (0..<Int(0.2 * rate)).map { Float(0.5 * sin(2 * Double.pi * 300 * Double($0) / rate)) }
    XCTAssertEqual(Onset.seconds(x, sampleRate: rate), 0.1, accuracy: 1e-9)
    XCTAssertEqual(Onset.seconds(Array(x[Int(0.1 * rate)...]), sampleRate: rate), 0) // loud from the start
    XCTAssertEqual(Onset.seconds([], sampleRate: rate), 0)
  }

  func testTrimTail() {
    let x: [Float] = [0, 0.5, 0.2] + [Float](repeating: 0, count: 48_000)
    XCTAssertEqual(Onset.trimTail(x, sampleRate: rate).count, 3 + 960)
    XCTAssertEqual(Onset.trimTail([0, 0], sampleRate: rate), [])
  }

  func testOnsetDetectorFindsEachClickAtItsFirstSample() {
    let click = Synth.scaled(Synth.click(level: 2, sampleRate: rate), by: 0.8) // the quietest click on the bus
    var stream = [Float](repeating: 0, count: 48_000)
    let starts = [1000, 4000, 7000, 10_000, 40_000]
    for s in starts {
      for (i, v) in click.enumerated() where s + i < stream.count { stream[s + i] += v }
    }
    var det = OnsetDetector(sampleRate: rate)
    // fed in 1024-frame buffers like the tap
    var found: [Int] = []
    var offset = 0
    while offset < stream.count {
      let end = min(stream.count, offset + 1024)
      found += det.process(Array(stream[offset..<end])).map { $0 + offset }
      offset = end
    }
    XCTAssertEqual(found.count, starts.count)
    for (f, s) in zip(found, starts) { XCTAssertLessThanOrEqual(abs(f - (s + 1)), 1) } // sample 0 of a click is 0
  }
}
