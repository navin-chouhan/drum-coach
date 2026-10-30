// T6-6: the lookahead selection. The same scenarios as src/eventQueue.test.ts. Written in a Linux container: NOT
// compiled or run yet. Run: `swift test` in ios/Core.
import XCTest
@testable import DrumAudioCore

final class EventQueueTests: XCTestCase {
  private let now = 1e9
  private let io = 21.3

  private func ev(_ scheduleMs: Double, _ at: Double? = nil, _ item: String = "") -> Queued<String> {
    return Queued(scheduleMs: scheduleMs, at: at ?? scheduleMs + 5.7, item: item)
  }

  func testSortedWithStableTies() {
    var q = EventQueue<String>()
    let r = q.insert([ev(now + 300, nil, "c"), ev(now + 100, nil, "a"), ev(now + 300, nil, "d"), ev(now + 200, nil, "b")], nowMs: now, ioBufferMs: io)
    XCTAssertEqual(r, InsertResult(accepted: 4, late: 0, dropped: 0))
    XCTAssertEqual(q.popDue(nowMs: now + 1000).map(\.item), ["a", "b", "c", "d"])
  }

  func testLateAtInsert() {
    var q = EventQueue<String>()
    let r = q.insert([ev(now + 31.29), ev(now + 31.3), ev(now - 500)], nowMs: now, ioBufferMs: io)
    XCTAssertEqual(r, InsertResult(accepted: 1, late: 2, dropped: 0))
  }

  func testWindow() {
    var q = EventQueue<String>()
    _ = q.insert([ev(now + 50, nil, "50"), ev(now + 119.9, nil, "119.9"), ev(now + 120), ev(now + 500)], nowMs: now, ioBufferMs: io)
    XCTAssertEqual(q.popDue(nowMs: now).map(\.item), ["50", "119.9"])
    XCTAssertEqual(q.nextScheduleMs, now + 120)
    XCTAssertEqual(q.popDue(nowMs: now).count, 0)
    XCTAssertEqual(q.popDue(nowMs: now + 10).count, 1)
  }

  func testCancel() {
    var q = EventQueue<String>()
    _ = q.insert([ev(now + 100, now + 1000), ev(now + 200, now + 2000), ev(now + 300, now + 3000)], nowMs: now, ioBufferMs: io)
    XCTAssertEqual(q.cancel(fromMs: now + 2000), 2)
    XCTAssertEqual(q.count, 1)
    XCTAssertEqual(q.cancel(fromMs: nil), 1)
    XCTAssertEqual(q.count, 0)
  }

  func testCap() {
    var p = LoopPolicy.standard
    p.maxPending = 2
    var q = EventQueue<String>(policy: p)
    XCTAssertEqual(q.insert([ev(now + 100), ev(now + 200), ev(now + 300)], nowMs: now, ioBufferMs: io),
                   InsertResult(accepted: 2, late: 0, dropped: 1))
  }

  func testFiveMinuteMetronomeInChunks() {
    var q = EventQueue<Int>()
    let beatMs = 500.0, zero = now + 300, clicks = 600
    let lead = AudioPolicy.minLeadMs(ioBufferMs: io, heardOffsetMs: 5.7)
    var handed: [Int] = []
    var planned = 0
    var lateAtPop = 0
    var t = now
    var step = 0
    while t < zero + Double(clicks) * beatMs + 1000 {
      if step % 10 == 0 && planned < clicks && zero + Double(planned) * beatMs < t + 2000 {
        var chunk: [Queued<Int>] = []
        while planned < clicks && zero + Double(planned) * beatMs < t + 4000 {
          let at = zero + Double(planned) * beatMs
          chunk.append(Queued(scheduleMs: at - 5.7, at: at, item: planned))
          planned += 1
        }
        XCTAssertEqual(q.insert(chunk, nowMs: t, ioBufferMs: io).late, 0)
      }
      for e in q.popDue(nowMs: t) {
        if e.at < t + lead { lateAtPop += 1 }
        handed.append(e.item)
      }
      step += 1
      t = now + Double(step) * 10
    }
    XCTAssertEqual(handed, Array(0..<clicks))
    XCTAssertEqual(lateAtPop, 0)
  }
}
