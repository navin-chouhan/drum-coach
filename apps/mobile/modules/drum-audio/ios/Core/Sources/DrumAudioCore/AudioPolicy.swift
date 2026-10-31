import Foundation

/// The scheduler's policy as pure functions: a line-by-line mirror of `src/policy.ts`, which holds the rationale and
/// the tests. Change both together; `Tests/DrumAudioCoreTests/AudioPolicyTests.swift` runs the same vectors.
///
/// `at` = when a sound is HEARD (HostClock ms). A buffer starts in the engine at its schedule time
/// = at − heardOffsetMs − onsetMs.
struct LoopPolicy {
  /// Timer interval, ms.
  var tickMs: Double = 10
  /// Events whose schedule time is before now + windowMs are handed to a player node.
  var windowMs: Double = 120
  /// Margin on top of the IO buffer; an event handed over later than this is dropped as late.
  var safetyMs: Double = 10
  /// The most events held natively; past it, events are dropped.
  var maxPending: Int = 20_000

  static let standard = LoopPolicy()
}

/// What `AVAudioTime(hostTime:)` on a player node means; M5/M5b decide (AUDIO-DESIGN §5).
enum HeardOffsetBranch: String {
  /// The sample leaves the engine; outputLatency covers the hardware (the probe's and the web's assumption).
  case a = "A"
  /// Host time already means "at the speaker".
  case b = "B"
  /// Host time means "rendered into the IO buffer" (A′).
  case a2 = "A2"
}

enum AudioPolicy {
  /// The one constant M5 flips (mirrors HEARD_OFFSET_BRANCH in src/policy.ts).
  static let heardOffsetBranch: HeardOffsetBranch = .a

  /// Schedule time + heardOffsetMs = heard time.
  static func heardOffsetMs(outputLatencyMs: Double, ioBufferMs: Double, branch: HeardOffsetBranch = heardOffsetBranch) -> Double {
    switch branch {
    case .a: return outputLatencyMs
    case .b: return 0
    case .a2: return outputLatencyMs + ioBufferMs
    }
  }

  /// Hand events over at least this long before they're heard: ioBufferMs + heardOffsetMs + safety.
  static func minLeadMs(ioBufferMs: Double, heardOffsetMs: Double, policy: LoopPolicy = .standard) -> Double {
    return ioBufferMs + heardOffsetMs + policy.safetyMs
  }

  /// When the buffer must start in the engine (host ms).
  static func scheduleTimeMs(atMs: Double, heardOffsetMs: Double, onsetMs: Double) -> Double {
    return atMs - heardOffsetMs - onsetMs
  }

  /// The late rule: too close to place exactly, so dropped and counted, never played late.
  static func isLate(scheduleMs: Double, nowMs: Double, ioBufferMs: Double, policy: LoopPolicy = .standard) -> Bool {
    return scheduleMs < nowMs + ioBufferMs + policy.safetyMs
  }

  /// Whether the loop hands this event to a player node on the tick at `nowMs`.
  static func isDue(scheduleMs: Double, nowMs: Double, policy: LoopPolicy = .standard) -> Bool {
    return scheduleMs < nowMs + policy.windowMs
  }

  /// The largest gain an event may ask for (AudioEvent.gain is 0..1.5).
  static let maxGain: Double = 1.5

  /// Gain steps per unit gain (GAIN_STEPS in policy.ts).
  enum GainSteps {
    static let click = 16
    static let drum = 8
    static let word = 16
  }

  /// step = round(clamp(gain, 0, 1.5) × stepsPerUnit); 0 = silence; NaN counts as 0.
  static func gainStep(_ gain: Double, stepsPerUnit: Int) -> Int {
    let g = gain.isFinite ? min(max(gain, 0), maxGain) : 0
    return Int((g * Double(stepsPerUnit)).rounded(.toNearestOrAwayFromZero))
  }

  static func stepGain(_ step: Int, stepsPerUnit: Int) -> Double {
    return Double(step) / Double(stepsPerUnit)
  }

  /// Player-node pools per bus: start size and cap (POOLS in policy.ts).
  static func pool(_ bus: Bus) -> (initial: Int, cap: Int) {
    switch bus {
    case .click: return (2, 4)
    case .drums: return (12, 24)
    case .band: return (8, 16)
    case .voice: return (2, 4)
    case .backing: return (1, 1)
    }
  }

  /// The pool allocator: the lowest node whose last buffer ends at or before `startMs`; else grow to `cap`; else drop.
  static func pickVoice(busyUntilMs: [Double], startMs: Double, cap: Int) -> VoicePick {
    for (i, busy) in busyUntilMs.enumerated() where busy <= startMs {
      return .use(i)
    }
    return busyUntilMs.count < cap ? .grow(busyUntilMs.count) : .drop
  }

  /// AVAudioSession.Port raw values → AudioRoute.kind.
  static func routeKind(portType: String) -> String {
    switch portType {
    case "Speaker", "Receiver": return "speaker"
    case "Headphones", "LineOut": return "wired"
    case "USBAudio": return "usb"
    case "BluetoothA2DPOutput", "BluetoothLE", "BluetoothHFP": return "bluetooth"
    case "AirPlay": return "airplay"
    default: return "other"
    }
  }

  /// The stored-latency key: "Speaker" for the built-in speaker, else "portType:uid".
  static func routeKey(portType: String, uid: String) -> String {
    if routeKind(portType: portType) == "speaker" || uid.isEmpty { return portType }
    return "\(portType):\(uid)"
  }

  /// Same route (no route event): same key, rate and buffer, latency within 0.5 ms.
  static func sameRoute(_ a: RouteFacts, _ b: RouteFacts) -> Bool {
    return a.key == b.key && a.sampleRate == b.sampleRate && abs(a.ioBufferMs - b.ioBufferMs) < 0.5
      && abs(a.outputLatencyMs - b.outputLatencyMs) < 0.5
  }

  /// A route event while the engine runs ends the take (AUDIO-DESIGN §3.3/§4): every queued sound is dropped and the
  /// new route's latency isn't the take's. The host then emits `engine-stopped` / `route-change`. No previous route
  /// (the first start) or the same route (latency jitter): nothing ends. Mirror of src/policy.ts routeChangeEndsTake.
  static func routeChangeEndsTake(previous: RouteFacts?, next: RouteFacts, running: Bool) -> Bool {
    guard running, let p = previous else { return false }
    return !sameRoute(p, next)
  }

  /// Voice ducking: click, drums, band and backing dip to 45 % while a voice-bus sound plays, over 30 ms.
  static let duckLevel: Double = 0.45
  static let duckRampMs: Double = 30

  /// One tick of the duck ramp toward `target`.
  static func duckStep(current: Double, target: Double, tickMs: Double = LoopPolicy.standard.tickMs) -> Double {
    let maxStep = (1 - duckLevel) * tickMs / duckRampMs
    return current < target ? min(target, current + maxStep) : max(target, current - maxStep)
  }
}

enum Bus: String, CaseIterable {
  case click, drums, band, voice, backing
}

enum VoicePick: Equatable {
  case use(Int)
  case grow(Int)
  case drop
}

/// The parts of a route the scheduler compares (AudioRoute without name/kind).
struct RouteFacts: Equatable {
  var key: String
  var sampleRate: Double
  var ioBufferMs: Double
  var outputLatencyMs: Double
}
