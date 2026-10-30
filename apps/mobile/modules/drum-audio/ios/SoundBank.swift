import AVFoundation
import Foundation

/// Every sound the engine can play, as PCM buffers at the engine rate (AUDIO-DESIGN §1.1): the three clicks and the
/// ten drum one-shots rendered at start, words added by prepareWords. Gains are baked in: a (sound, gain step) pair is
/// a scaled copy, made on first use and cached. Thread-safe (its own lock); never touched by the render thread.
final class SoundBank {
  private let lock = NSLock()
  private(set) var sampleRate: Double = 0
  private var format: AVAudioFormat?
  private var base: [Int: [Float]] = [:]
  private var onsetMs: [Int: Double] = [:]
  private var cache: [Int: AVAudioPCMBuffer] = [:]
  private var wordIndex: [String: Int] = [:]
  private var nextWord = SoundTable.firstWord

  /// Gain steps per unit for a bus (AudioPolicy.GainSteps).
  static func stepsPerUnit(_ bus: Bus) -> Int {
    switch bus {
    case .click: return AudioPolicy.GainSteps.click
    case .drums: return AudioPolicy.GainSteps.drum
    default: return AudioPolicy.GainSteps.word
    }
  }

  /// Renders the fixed sounds for `rate` (a no-op if already at it). A new rate also forgets the words: the app calls
  /// prepareWords after start() (the take does it before every take).
  func prepare(sampleRate rate: Double) throws {
    lock.lock()
    defer { lock.unlock() }
    if abs(rate - sampleRate) < 0.5, format != nil { return }
    guard let mono = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1) else {
      throw DrumAudioError("no mono format at \(rate) Hz")
    }
    format = mono
    sampleRate = rate
    base = [:]
    onsetMs = [:]
    cache = [:]
    wordIndex = [:]
    nextWord = SoundTable.firstWord
    for level in 0...2 { base[level] = Synth.click(level: level, sampleRate: rate) }
    for (i, pad) in SoundTable.pads.enumerated() { base[SoundTable.firstDrum + i] = Synth.drum(pad, sampleRate: rate) }
    // Warm the usual layers so the first take and the first touch don't render on demand.
    for level in 0...2 { _ = bufferLocked(level, step: AudioPolicy.GainSteps.click) }
    for i in SoundTable.pads.indices { _ = bufferLocked(SoundTable.firstDrum + i, step: AudioPolicy.GainSteps.drum) }
  }

  func has(_ index: Int) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return base[index] != nil
  }

  /// How far into the buffer the sound starts, ms (words; 0 for the synth sounds, which start at sample 0).
  func onset(_ index: Int) -> Double {
    lock.lock()
    defer { lock.unlock() }
    return onsetMs[index] ?? 0
  }

  /// The buffer for a sound at a gain step (step 0 = silence = nil).
  func buffer(_ index: Int, step: Int) -> AVAudioPCMBuffer? {
    lock.lock()
    defer { lock.unlock() }
    return bufferLocked(index, step: step)
  }

  private func bufferLocked(_ index: Int, step: Int) -> AVAudioPCMBuffer? {
    guard step > 0, step < 64, let format = format, let bus = SoundTable.bus(ofSound: index) else { return nil }
    let key = index << 6 | step
    if let b = cache[key] { return b }
    guard let samples = base[index] else { return nil }
    let gain = AudioPolicy.stepGain(step, stepsPerUnit: Self.stepsPerUnit(bus))
    guard let b = Self.makeBuffer(Synth.scaled(samples, by: gain), format: format) else { return nil }
    cache[key] = b
    return b
  }

  /// A one-off buffer at the bank's rate (band notes).
  func makeBuffer(_ samples: [Float]) -> AVAudioPCMBuffer? {
    lock.lock()
    let format = self.format
    lock.unlock()
    guard let format = format else { return nil }
    return Self.makeBuffer(samples, format: format)
  }

  static func makeBuffer(_ samples: [Float], format: AVAudioFormat) -> AVAudioPCMBuffer? {
    guard !samples.isEmpty,
          let b = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
          let ch = b.floatChannelData?[0] else { return nil }
    b.frameLength = AVAudioFrameCount(samples.count)
    samples.withUnsafeBufferPointer { src in
      for i in 0..<src.count { ch[i] = src[i] }
    }
    return b
  }

  // MARK: - Words

  func wordIndexFor(_ key: String) -> Int? {
    lock.lock()
    defer { lock.unlock() }
    return wordIndex[key]
  }

  /// Adds a rendered word (samples at `rate`; ignored if the bank has moved to another rate meanwhile).
  func addWord(_ key: String, samples: [Float], rate: Double) -> (index: Int, onsetMs: Double)? {
    let trimmed = Onset.trimTail(samples, sampleRate: rate)
    guard !trimmed.isEmpty else { return nil }
    let onset = Onset.seconds(trimmed, sampleRate: rate) * 1000
    lock.lock()
    defer { lock.unlock() }
    guard abs(rate - sampleRate) < 0.5 else { return nil }
    if let existing = wordIndex[key] { return (existing, onsetMs[existing] ?? 0) }
    let index = nextWord
    nextWord += 1
    wordIndex[key] = index
    base[index] = trimmed
    onsetMs[index] = onset
    return (index, onset)
  }

  var wordCount: Int {
    lock.lock()
    defer { lock.unlock() }
    return wordIndex.count
  }

  /// Bytes held by rendered buffers (debug info).
  var cachedBytes: Int {
    lock.lock()
    defer { lock.unlock() }
    return cache.values.reduce(0) { $0 + Int($1.frameLength) * 4 }
  }
}

struct DrumAudioError: Error, CustomStringConvertible {
  let description: String
  init(_ description: String) { self.description = description }
}
