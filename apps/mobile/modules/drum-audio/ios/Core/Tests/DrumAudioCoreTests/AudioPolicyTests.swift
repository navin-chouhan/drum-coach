// T6-6: the policy mirror. The same vectors as src/policy.test.ts. Written in a Linux container: NOT compiled or
// run yet. Run: `swift test` in ios/Core.
import XCTest
@testable import DrumAudioCore

final class AudioPolicyTests: XCTestCase {
  func testLoopParameters() {
    let p = LoopPolicy.standard
    XCTAssertEqual(p.tickMs, 10)
    XCTAssertEqual(p.windowMs, 120)
    XCTAssertEqual(p.safetyMs, 10)
    XCTAssertEqual(p.maxPending, 20_000)
  }

  func testHeardOffsetBranches() {
    XCTAssertEqual(AudioPolicy.heardOffsetBranch, .a)
    XCTAssertEqual(AudioPolicy.heardOffsetMs(outputLatencyMs: 5.7, ioBufferMs: 21.3), 5.7)
    XCTAssertEqual(AudioPolicy.heardOffsetMs(outputLatencyMs: 5.7, ioBufferMs: 21.3, branch: .b), 0)
    XCTAssertEqual(AudioPolicy.heardOffsetMs(outputLatencyMs: 5.7, ioBufferMs: 21.3, branch: .a2), 27, accuracy: 1e-9)
  }

  func testMinLead() {
    let vectors: [(Double, Double, Double)] = [(21.3, 5.7, 37), (5.3, 5.7, 21), (10.7, 180, 200.7)]
    for (io, out, lead) in vectors {
      let h = AudioPolicy.heardOffsetMs(outputLatencyMs: out, ioBufferMs: io)
      XCTAssertEqual(AudioPolicy.minLeadMs(ioBufferMs: io, heardOffsetMs: h), lead, accuracy: 1e-9)
    }
  }

  func testLateRuleAndWindow() {
    let now = 1e9, io = 21.3
    let lead = AudioPolicy.minLeadMs(ioBufferMs: io, heardOffsetMs: 5.7)
    XCTAssertFalse(AudioPolicy.isLate(scheduleMs: AudioPolicy.scheduleTimeMs(atMs: now + lead, heardOffsetMs: 5.7, onsetMs: 0), nowMs: now, ioBufferMs: io))
    XCTAssertTrue(AudioPolicy.isLate(scheduleMs: AudioPolicy.scheduleTimeMs(atMs: now + lead - 0.001, heardOffsetMs: 5.7, onsetMs: 0), nowMs: now, ioBufferMs: io))
    XCTAssertEqual(AudioPolicy.scheduleTimeMs(atMs: now + 200, heardOffsetMs: 5.7, onsetMs: 120), now + 74.3, accuracy: 1e-6)
    XCTAssertTrue(AudioPolicy.isLate(scheduleMs: AudioPolicy.scheduleTimeMs(atMs: now + 150, heardOffsetMs: 5.7, onsetMs: 120), nowMs: now, ioBufferMs: io))
    XCTAssertTrue(AudioPolicy.isDue(scheduleMs: now + 119.999, nowMs: now))
    XCTAssertFalse(AudioPolicy.isDue(scheduleMs: now + 120, nowMs: now))
  }

  func testGainStep() {
    let vectors: [(Double, Int, Int)] = [
      (1, 16, 16), (0.75, 16, 12), (0.35, 16, 6), (1.5, 16, 24), (2, 16, 24), (-1, 16, 0), (.nan, 16, 0),
      (0.01, 16, 0), (0.04, 16, 1), (100.0 / 127, 8, 6), (1, 8, 8), (0.5, 8, 4), (0.06, 8, 0), (1.5, 8, 12),
    ]
    for (g, s, step) in vectors {
      XCTAssertEqual(AudioPolicy.gainStep(g, stepsPerUnit: s), step, "\(g) at \(s)")
    }
  }

  func testPickVoice() {
    XCTAssertEqual(AudioPolicy.pickVoice(busyUntilMs: [100, 50, 0], startMs: 60, cap: 4), .use(1))
    XCTAssertEqual(AudioPolicy.pickVoice(busyUntilMs: [100, 50, 0], startMs: 100, cap: 4), .use(0))
    XCTAssertEqual(AudioPolicy.pickVoice(busyUntilMs: [100, 100], startMs: 99, cap: 4), .grow(2))
    XCTAssertEqual(AudioPolicy.pickVoice(busyUntilMs: [100, 100, 100, 100], startMs: 99, cap: 4), .drop)
    XCTAssertEqual(AudioPolicy.pickVoice(busyUntilMs: [], startMs: 0, cap: 1), .grow(0))
  }

  func testTwoClickNodesCover16thsAt240() {
    var busy: [Double] = [0, 0]
    var t = 1e9
    for _ in 0..<64 {
      guard case let .use(i) = AudioPolicy.pickVoice(busyUntilMs: busy, startMs: t, cap: AudioPolicy.pool(.click).cap) else {
        return XCTFail("needed a third node at \(t)")
      }
      busy[i] = t + 60
      t += 62.5
    }
  }

  func testPools() {
    let expected: [(Bus, Int, Int)] = [(.click, 2, 4), (.drums, 12, 24), (.band, 8, 16), (.voice, 2, 4), (.backing, 1, 1)]
    for (bus, initial, cap) in expected {
      XCTAssertEqual(AudioPolicy.pool(bus).initial, initial, bus.rawValue)
      XCTAssertEqual(AudioPolicy.pool(bus).cap, cap, bus.rawValue)
    }
  }

  func testRoutes() {
    let vectors: [(String, String, String, String)] = [
      ("Speaker", "Built-In Speaker", "speaker", "Speaker"),
      ("Headphones", "Wired Headphones", "wired", "Headphones:Wired Headphones"),
      ("USBAudio", "AppleUSBAudioEngine:Apple:USB-C to 3.5mm:1", "usb", "USBAudio:AppleUSBAudioEngine:Apple:USB-C to 3.5mm:1"),
      ("BluetoothA2DPOutput", "AA:BB:CC:DD:EE:FF-tacl", "bluetooth", "BluetoothA2DPOutput:AA:BB:CC:DD:EE:FF-tacl"),
      ("BluetoothLE", "X", "bluetooth", "BluetoothLE:X"),
      ("AirPlay", "abc", "airplay", "AirPlay:abc"),
      ("HDMI", "h", "other", "HDMI:h"),
      ("LineOut", "", "wired", "LineOut"),
    ]
    for (type, uid, kind, key) in vectors {
      XCTAssertEqual(AudioPolicy.routeKind(portType: type), kind)
      XCTAssertEqual(AudioPolicy.routeKey(portType: type, uid: uid), key)
    }
    let a = RouteFacts(key: "Speaker", sampleRate: 48000, ioBufferMs: 21.33, outputLatencyMs: 5.7)
    var b = a
    b.outputLatencyMs = 5.9
    XCTAssertTrue(AudioPolicy.sameRoute(a, b))
    b.outputLatencyMs = 6.3
    XCTAssertFalse(AudioPolicy.sameRoute(a, b))
    b = a
    b.sampleRate = 44100
    XCTAssertFalse(AudioPolicy.sameRoute(a, b))
  }

  func testRouteChangeEndsTake() {
    let a = RouteFacts(key: "Speaker", sampleRate: 48000, ioBufferMs: 21.33, outputLatencyMs: 5.7)
    var hub = a
    hub.key = "USBAudio:hub"
    var late = a
    late.outputLatencyMs = 40
    var jitter = a
    jitter.outputLatencyMs = 5.9
    XCTAssertTrue(AudioPolicy.routeChangeEndsTake(previous: a, next: hub, running: true))
    XCTAssertTrue(AudioPolicy.routeChangeEndsTake(previous: a, next: late, running: true))
    XCTAssertFalse(AudioPolicy.routeChangeEndsTake(previous: a, next: jitter, running: true))
    XCTAssertFalse(AudioPolicy.routeChangeEndsTake(previous: a, next: hub, running: false))
    XCTAssertFalse(AudioPolicy.routeChangeEndsTake(previous: nil, next: a, running: true))
  }

  func testDuckStep() {
    var v = 1.0
    var seen: [Double] = []
    for _ in 0..<4 {
      v = AudioPolicy.duckStep(current: v, target: 0.45)
      seen.append(v)
    }
    XCTAssertEqual(seen[0], 0.8167, accuracy: 1e-4)
    XCTAssertEqual(seen[1], 0.6333, accuracy: 1e-4)
    XCTAssertEqual(seen[2], 0.45, accuracy: 1e-9)
    XCTAssertEqual(seen[3], 0.45, accuracy: 1e-9)
  }
}
