import Foundation

/// The web app's synth sounds (src/play/audio.ts `click`, `playDrum`, `playBand`) rendered offline into mono Float
/// samples, so every sound can be a pre-rendered buffer. Pure Swift (no AVFoundation): unit-tested in SynthTests.swift.
///
/// WebAudio semantics copied: `env()` = setValueAtTime(max(peak, 0.0002)) then exponentialRampToValueAtTime(0.0001,
/// decay), holding 0.0001 until the oscillator stops at decay + 0.05 s; exponential frequency sweeps; lowpass/highpass
/// biquads with WebAudio's default Q = 1 read in dB (the spec's LPF/HPF formula); the web's 'peaking' filter has the
/// default 0 dB gain, which is an identity, so it is left out. Oscillators are naive (not band-limited like WebAudio's),
/// so the timbre matches "roughly" (A4 brief); timing and levels are what matter.
enum Synth {
  enum Wave {
    case sine, triangle, square, sawtooth

    /// One period, phase in [0, 1); all start at 0 going up, like WebAudio's periodic waves.
    func value(_ p: Double) -> Double {
      switch self {
      case .sine: return sin(2 * Double.pi * p)
      case .triangle:
        let q = (p + 0.25).truncatingRemainder(dividingBy: 1)
        return 1 - 4 * abs(q - 0.5)
      case .square: return p < 0.5 ? 1 : -1
      case .sawtooth:
        return 2 * (p + 0.5).truncatingRemainder(dividingBy: 1) - 1
      }
    }
  }

  enum FilterType {
    case lowpass, highpass
  }

  /// A direct-form-I biquad with Audio EQ Cookbook coefficients (WebAudio's BiquadFilterNode for LPF/HPF).
  struct Biquad {
    private var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
    private var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0

    /// `qDb` is WebAudio's Q for lowpass/highpass (dB). A cutoff at or above Nyquist passes everything.
    init(_ type: FilterType, frequency: Double, qDb: Double = 1, sampleRate: Double) {
      let nyquist = sampleRate / 2
      guard frequency > 0, frequency < nyquist else {
        if type == .highpass && frequency >= nyquist { b0 = 0 } // nothing passes
        return
      }
      let w0 = 2 * Double.pi * frequency / sampleRate
      let cosW = cos(w0)
      let alpha = sin(w0) / (2 * pow(10, qDb / 20))
      let a0 = 1 + alpha
      switch type {
      case .lowpass:
        b0 = (1 - cosW) / 2 / a0
        b1 = (1 - cosW) / a0
        b2 = b0
      case .highpass:
        b0 = (1 + cosW) / 2 / a0
        b1 = -(1 + cosW) / a0
        b2 = b0
      }
      a1 = -2 * cosW / a0
      a2 = (1 - alpha) / a0
    }

    mutating func process(_ x: Double) -> Double {
      let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
      x2 = x1
      x1 = x
      y2 = y1
      y1 = y
      return y
    }
  }

  /// Deterministic white noise in [-1, 1) (xorshift32), so renders are repeatable.
  struct Noise {
    private var state: UInt32
    init(seed: UInt32 = 0x9E37_79B9) { state = seed == 0 ? 1 : seed }
    mutating func next() -> Double {
      state ^= state << 13
      state ^= state >> 17
      state ^= state << 5
      return Double(state) / Double(UInt32.max) * 2 - 1
    }
  }

  static let envFloor = 0.0001

  /// The web's `env()`: from max(peak, 0.0002) down to 0.0001 exponentially over `decay`, then held.
  static func decayEnvelope(frames: Int, sampleRate: Double, peak: Double, decay: Double) -> [Double] {
    var env = [Double](repeating: envFloor, count: frames)
    let start = max(peak, 0.0002)
    let rampFrames = max(1, Int((decay * sampleRate).rounded()))
    let ratio = pow(envFloor / start, 1 / Double(rampFrames))
    var v = start
    for i in 0..<min(frames, rampFrames) {
      env[i] = v
      v *= ratio
    }
    return env
  }

  /// The web's `tone()`: an oscillator swept exponentially f0 → f1 over `sweep`, with the decay envelope; it stops
  /// at decay + 0.05 s.
  static func tone(sampleRate: Double, wave: Wave, f0: Double, f1: Double, sweep: Double, decay: Double, peak: Double) -> [Float] {
    let frames = Int(((decay + 0.05) * sampleRate).rounded())
    let env = decayEnvelope(frames: frames, sampleRate: sampleRate, peak: peak, decay: decay)
    var out = [Float](repeating: 0, count: frames)
    var phase = 0.0
    let sweepFrames = max(1.0, sweep * sampleRate)
    for i in 0..<frames {
      let x = Double(i)
      let f = x < sweepFrames ? f0 * pow(f1 / f0, x / sweepFrames) : f1
      out[i] = Float(wave.value(phase) * env[i])
      phase += f / sampleRate
      phase -= phase.rounded(.down)
    }
    return out
  }

  /// The web's `noise()`: white noise through the filters, with the decay envelope; it stops at decay + 0.05 s.
  static func noise(sampleRate: Double, decay: Double, peak: Double, filters: [(FilterType, Double)], seed: UInt32 = 0x9E37_79B9) -> [Float] {
    let frames = Int(((decay + 0.05) * sampleRate).rounded())
    let env = decayEnvelope(frames: frames, sampleRate: sampleRate, peak: peak, decay: decay)
    var chain = filters.map { Biquad($0.0, frequency: $0.1, sampleRate: sampleRate) }
    var rng = Noise(seed: seed)
    var out = [Float](repeating: 0, count: frames)
    for i in 0..<frames {
      var x = rng.next()
      for k in chain.indices { x = chain[k].process(x) }
      out[i] = Float(x * env[i])
    }
    return out
  }

  /// Sums sounds that all start at 0 (the result is as long as the longest).
  static func mix(_ parts: [[Float]]) -> [Float] {
    var out = [Float](repeating: 0, count: parts.map(\.count).max() ?? 0)
    for p in parts {
      for i in p.indices { out[i] += p[i] }
    }
    return out
  }

  /// The metronome click (web `click`): level 0 = bar 1600 Hz, 1 = beat 1050 Hz, 2 = subdivision 800 Hz; a 50 ms
  /// triangle decay, peaks 1 / 0.75 / 0.35, 60 ms long. Gain 1.
  static func click(level: Int, sampleRate: Double) -> [Float] {
    let freq = [1600.0, 1050, 800][min(max(level, 0), 2)]
    let peak = [1.0, 0.75, 0.35][min(max(level, 0), 2)]
    let frames = Int((0.06 * sampleRate).rounded())
    let env = decayEnvelope(frames: frames, sampleRate: sampleRate, peak: peak, decay: 0.05)
    var out = [Float](repeating: 0, count: frames)
    for i in 0..<frames {
      let t = Double(i) / sampleRate
      out[i] = Float(Wave.triangle.value((t * freq).truncatingRemainder(dividingBy: 1)) * env[i])
    }
    return out
  }

  /// A drum one-shot at velocity 127 (web `playDrum`, v = 1). Velocity layers are scaled copies (the web's recipes
  /// are linear in v). `pad` is a PadId; an unknown pad gives [].
  static func drum(_ pad: String, sampleRate r: Double) -> [Float] {
    switch pad {
    case "kick":
      return mix([tone(sampleRate: r, wave: .sine, f0: 160, f1: 42, sweep: 0.11, decay: 0.38, peak: 1.1),
                  noise(sampleRate: r, decay: 0.02, peak: 0.25, filters: [(.lowpass, 1500)])])
    case "snare":
      return mix([noise(sampleRate: r, decay: 0.2, peak: 0.7, filters: [(.highpass, 1100)]),
                  tone(sampleRate: r, wave: .triangle, f0: 220, f1: 160, sweep: 0.05, decay: 0.12, peak: 0.45)])
    case "tom1": return tone(sampleRate: r, wave: .sine, f0: 240, f1: 150, sweep: 0.2, decay: 0.45, peak: 0.9)
    case "tom2": return tone(sampleRate: r, wave: .sine, f0: 185, f1: 115, sweep: 0.22, decay: 0.5, peak: 0.9)
    case "floor": return tone(sampleRate: r, wave: .sine, f0: 125, f1: 78, sweep: 0.25, decay: 0.6, peak: 1)
    case "hhPedal": return noise(sampleRate: r, decay: 0.04, peak: 0.18, filters: [(.highpass, 8000)])
    case "hhClosed": return noise(sampleRate: r, decay: 0.06, peak: 0.38, filters: [(.highpass, 7000)])
    case "hhOpen": return noise(sampleRate: r, decay: 0.45, peak: 0.38, filters: [(.highpass, 7000)])
    case "crash": return noise(sampleRate: r, decay: 1.6, peak: 0.5, filters: [(.highpass, 3500)])
    case "ride":
      let hiss = noise(sampleRate: r, decay: 0.9, peak: 0.16, filters: [(.highpass, 6000)])
      let bells: [[Float]] = [1.0, 1.48, 2.13].map { (m: Double) -> [Float] in
        tone(sampleRate: r, wave: .square, f0: 620 * m, f1: 610 * m, sweep: 0.3, decay: 0.5, peak: 0.035)
      }
      return mix([hiss] + bells)
    default: return []
    }
  }

  /// The web's `pad()` envelope: exponential attack 0.0001 → peak in 12 ms, hold, from 50 ms settle toward 0.7 × peak
  /// (time constant 0.15 s), from `end` release toward 0.0001 (0.04 s); `frames` covers end + 0.3 s.
  static func padEnvelope(frames: Int, sampleRate: Double, peak: Double, end: Double) -> [Double] {
    var env = [Double](repeating: 0, count: frames)
    let attackEnd = Int((0.012 * sampleRate).rounded())
    let settleStart = Int((0.05 * sampleRate).rounded())
    let releaseStart = max(settleStart, Int((end * sampleRate).rounded()))
    let attackRatio = pow(peak / envFloor, 1 / Double(max(1, attackEnd)))
    let settleDecay = exp(-1 / (0.15 * sampleRate))
    let releaseDecay = exp(-1 / (0.04 * sampleRate))
    var v = envFloor
    var settle = 1.0 // e^(-(t - 0.05)/0.15)
    var release = 1.0 // e^(-(t - end)/0.04)
    var atRelease = peak
    for i in 0..<frames {
      if i < attackEnd {
        env[i] = v
        v *= attackRatio
      } else if i < settleStart {
        env[i] = peak
      } else if i < releaseStart {
        env[i] = 0.7 * peak + 0.3 * peak * settle
        settle *= settleDecay
      } else {
        if i == releaseStart { atRelease = 0.7 * peak + 0.3 * peak * settle }
        env[i] = envFloor + (atRelease - envFloor) * release
        release *= releaseDecay
      }
    }
    return env
  }

  /// One held synth note (web `pad()`): oscillator → lowpass → envelope, `dur` seconds before release.
  static func pad(sampleRate r: Double, midi: Int, dur: Double, peak: Double, wave: Wave, cutoff: Double, detuneCents: Double = 0) -> [Float] {
    guard peak > envFloor else { return [] }
    let end = max(0.05, dur)
    let frames = Int(((end + 0.3) * r).rounded())
    let env = padEnvelope(frames: frames, sampleRate: r, peak: peak, end: end)
    let f = 440 * pow(2, (Double(midi) - 69) / 12) * pow(2, detuneCents / 1200)
    var lp = Biquad(.lowpass, frequency: cutoff, sampleRate: r)
    var out = [Float](repeating: 0, count: frames)
    var phase = 0.0
    for i in 0..<frames {
      out[i] = Float(lp.process(wave.value(phase)) * env[i])
      phase += f / r
      phase -= phase.rounded(.down)
    }
    return out
  }

  /// The longest band note rendered, s (bounds memory; a longer note is cut at its release).
  static let maxBandSeconds = 16.0

  /// One band note (web `playBand`): `seconds` = its length at this tempo, `vel` 0–127.
  static func bandNote(part: BandPart, midi: [Int], seconds: Double, vel: Double, sampleRate r: Double) -> [Float] {
    let v = min(max(vel, 0), 127) / 127
    let s = min(max(seconds, 0), maxBandSeconds)
    guard v > 0, let first = midi.first else { return [] }
    switch part {
    case .bass:
      return mix([pad(sampleRate: r, midi: first, dur: s * 0.92, peak: 0.5 * v, wave: .sawtooth, cutoff: 420),
                  pad(sampleRate: r, midi: first - 12, dur: s * 0.92, peak: 0.35 * v, wave: .sine, cutoff: 200)])
    case .keys:
      var voices: [[Float]] = []
      for m in midi {
        voices.append(pad(sampleRate: r, midi: m, dur: s * 0.95, peak: 0.09 * v, wave: .triangle, cutoff: 2200, detuneCents: -6))
        voices.append(pad(sampleRate: r, midi: m, dur: s * 0.95, peak: 0.06 * v, wave: .sawtooth, cutoff: 1400, detuneCents: 7))
      }
      return mix(voices)
    }
  }

  /// A copy scaled by `gain`.
  static func scaled(_ x: [Float], by gain: Double) -> [Float] {
    let g = Float(gain)
    return x.map { $0 * g }
  }

  static func peakAbs(_ x: [Float]) -> Float {
    return x.reduce(0) { max($0, abs($1)) }
  }
}
