import AVFoundation
import Foundation

/// Metronome clicks scheduled at mach host times, so they share the clock of CoreMIDI timestamps:
/// `AVAudioPlayerNode.scheduleBuffer(_:at: AVAudioTime(hostTime:))`.
///
/// Why native and not react-native-audio-api: its AudioContext.currentTime is rendered frames / sample rate with no
/// host-time anchor (no getOutputTimestamp, no outputLatency) in 0.13.x, so a JS-side mapping would carry about one
/// render quantum of error. See docs/mobile/GATE0.md.
final class ClickScheduler {
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private var format: AVAudioFormat?
  private var accent: AVAudioPCMBuffer?
  private var beat: AVAudioPCMBuffer?
  private let lock = NSLock()

  /// Playback (sounds with the silent switch on), mixes with other apps, a small IO buffer for low latency.
  static func configureSession() throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
    try session.setPreferredIOBufferDuration(0.005)
    try session.setActive(true)
  }

  /// What the audio session reports now. outputLatencyMs is the term the probe adds to a click's scheduled host
  /// time to get the time it is heard, like the web app adds AudioContext.outputLatency.
  static func audioInfo() -> [String: Any] {
    let session = AVAudioSession.sharedInstance()
    let route = session.currentRoute.outputs.map { "\($0.portType.rawValue): \($0.portName)" }.joined(separator: ", ")
    return [
      "outputLatencyMs": session.outputLatency * 1000,
      "ioBufferMs": session.ioBufferDuration * 1000,
      "sampleRate": session.sampleRate,
      "route": route,
    ]
  }

  /// Schedules `count` clicks from `startHostTimeMs` (HostClock ms), one per beat, the first of every `accentEvery`
  /// accented. Returns the host times used and the audio info. Replaces anything still scheduled.
  func schedule(startHostTimeMs: Double, bpm: Double, count: Int, accentEvery: Int) throws -> [String: Any] {
    guard bpm > 0, count > 0, count <= 1000 else { throw ClickError("bad bpm or count") }
    guard startHostTimeMs > HostClock.nowMs() + 30 else { throw ClickError("start time is in the past") }
    lock.lock()
    defer { lock.unlock() }
    try Self.configureSession()
    try startEngineIfNeeded()
    player.stop() // drops anything scheduled earlier
    player.play()
    guard let accent = accent, let beat = beat else { throw ClickError("no click buffers") }
    let beatMs = 60000.0 / bpm
    var times: [Double] = []
    for i in 0..<count {
      let ms = startHostTimeMs + Double(i) * beatMs
      let when = AVAudioTime(hostTime: HostClock.msToTicks(ms))
      let isAccent = accentEvery > 0 && i % accentEvery == 0
      player.scheduleBuffer(isAccent ? accent : beat, at: when, options: [], completionHandler: nil)
      times.append(ms)
    }
    var result = Self.audioInfo()
    result["scheduledHostTimesMs"] = times
    return result
  }

  func stop() {
    lock.lock()
    defer { lock.unlock() }
    player.stop()
  }

  private func startEngineIfNeeded() throws {
    if format == nil {
      let rate = engine.outputNode.outputFormat(forBus: 0).sampleRate
      let sampleRate = rate > 0 ? rate : AVAudioSession.sharedInstance().sampleRate
      guard let mono = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1) else {
        throw ClickError("no audio format")
      }
      format = mono
      engine.attach(player)
      engine.connect(player, to: engine.mainMixerNode, format: mono)
      accent = Self.click(format: mono, frequency: 1600, peak: 0.9) // the web click: 1600 Hz bar, 1050 Hz beat
      beat = Self.click(format: mono, frequency: 1050, peak: 0.7)
    }
    if !engine.isRunning {
      engine.prepare()
      try engine.start() // also after a route change or an interruption stopped it
    }
  }

  /// A 50 ms triangle burst with a fast exponential decay (the web click's shape, src/play/audio.ts `click`).
  private static func click(format: AVAudioFormat, frequency: Double, peak: Float) -> AVAudioPCMBuffer? {
    let sampleRate = format.sampleRate
    let frames = AVAudioFrameCount(sampleRate * 0.05)
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames),
          let channel = buffer.floatChannelData?[0] else { return nil }
    buffer.frameLength = frames
    for i in 0..<Int(frames) {
      let t = Double(i) / sampleRate
      let phase = t * frequency - (t * frequency).rounded(.down)
      let triangle = 4 * abs(phase - 0.5) - 1
      let envelope = exp(-t / 0.011)
      channel[i] = Float(triangle * envelope) * peak
    }
    return buffer
  }
}

struct ClickError: Error, CustomStringConvertible {
  let description: String
  init(_ description: String) { self.description = description }
}
