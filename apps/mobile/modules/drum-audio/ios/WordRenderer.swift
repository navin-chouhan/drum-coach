import AVFoundation
import Foundation

/// Spoken count-in words on the device (AUDIO-DESIGN §1.3): `AVSpeechSynthesizer.write(_:toBufferCallback:)` renders
/// offline into buffers (it never plays, so it doesn't touch the audio session), which are converted to mono Float at
/// the engine rate. On-device and offline; the same voice every time. (The Piper clip from the home server, preferred
/// when reachable, is a later step: owner question 5.)
///
/// `render` blocks its caller until the word is done, so it must run on a background queue, never main or JS.
final class WordRenderer {
  private let synth = AVSpeechSynthesizer()

  /// How long one word may take; and how long without a new buffer counts as finished when the end marker (an
  /// empty buffer) doesn't come.
  var timeout: TimeInterval = 4
  var idleEnd: TimeInterval = 0.4

  private final class Collector {
    let lock = NSLock()
    var chunks: [AVAudioPCMBuffer] = []
    var lastAt = Date()
    var finished = false
  }

  /// The word as mono Float at `sampleRate`, or nil (no voice, timeout, conversion failed).
  func render(_ text: String, sampleRate: Double) -> [Float]? {
    precondition(!Thread.isMainThread, "WordRenderer.render blocks; call it off the main thread")
    let c = Collector()
    let done = DispatchSemaphore(value: 0)
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate
    utterance.preUtteranceDelay = 0
    utterance.postUtteranceDelay = 0
    DispatchQueue.main.async { [synth] in
      synth.write(utterance) { buffer in
        guard let pcm = buffer as? AVAudioPCMBuffer else { return }
        c.lock.lock()
        defer { c.lock.unlock() }
        if c.finished { return }
        switch WordChunks.action(frameLength: Int(pcm.frameLength), haveAudio: !c.chunks.isEmpty) {
        case .skip:
          return // an empty buffer before any audio (some iOS versions send one first): not the end
        case .end:
          c.finished = true
          done.signal()
          return
        case .append:
          if let copy = Self.copy(pcm) { c.chunks.append(copy) }
          c.lastAt = Date()
        }
      }
    }
    let deadline = Date().addingTimeInterval(timeout)
    while done.wait(timeout: .now() + 0.1) == .timedOut {
      c.lock.lock()
      let idle = !c.chunks.isEmpty && Date().timeIntervalSince(c.lastAt) > idleEnd
      let expired = Date() > deadline
      if idle || expired { c.finished = true }
      c.lock.unlock()
      if idle { break }
      if expired {
        DispatchQueue.main.async { [synth] in synth.stopSpeaking(at: .immediate) }
        return nil
      }
    }
    c.lock.lock()
    let chunks = c.chunks
    c.lock.unlock()
    return Self.convert(chunks, to: sampleRate)
  }

  /// The synthesizer may reuse its buffers: keep a copy.
  private static func copy(_ b: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard let c = AVAudioPCMBuffer(pcmFormat: b.format, frameCapacity: b.frameLength) else { return nil }
    c.frameLength = b.frameLength
    let src = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: b.audioBufferList))
    let dst = UnsafeMutableAudioBufferListPointer(c.mutableAudioBufferList)
    for (s, d) in zip(src, dst) {
      guard let from = s.mData, let to = d.mData else { continue }
      memcpy(to, from, Int(min(s.mDataByteSize, d.mDataByteSize)))
    }
    return c
  }

  /// Joins the chunks and converts them (any rate, Int16 or Float, mono or not) to mono Float at `rate`.
  static func convert(_ chunks: [AVAudioPCMBuffer], to rate: Double) -> [Float]? {
    guard let first = chunks.first,
          let dst = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1),
          let converter = AVAudioConverter(from: first.format, to: dst) else { return nil }
    converter.downmix = true
    let total = chunks.reduce(0) { $0 + Int($1.frameLength) }
    let capacity = AVAudioFrameCount(Double(total) * rate / first.format.sampleRate) + 4096
    guard let out = AVAudioPCMBuffer(pcmFormat: dst, frameCapacity: capacity) else { return nil }
    var next = 0
    var error: NSError?
    let status = converter.convert(to: out, error: &error) { _, inputStatus in
      if next < chunks.count {
        inputStatus.pointee = .haveData
        next += 1
        return chunks[next - 1]
      }
      inputStatus.pointee = .endOfStream
      return nil
    }
    guard status != .error, error == nil, let ch = out.floatChannelData?[0] else { return nil }
    return Array(UnsafeBufferPointer(start: ch, count: Int(out.frameLength)))
  }
}
