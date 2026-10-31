// Backing audio math: the same vectors as src/backing.test.ts, plus the test tone. Written in a Linux container (the
// lengths / queued-segment vectors too: not compiled or run here). Run: `swift test` in ios/Core.
import XCTest
@testable import DrumAudioCore

final class BackingMathTests: XCTestCase {
  // The iPad speaker (GATE0 §9): 5.7 ms heard offset, 21.3 ms IO buffer, safety 10.
  private let speaker = BackingTiming(heardOffsetMs: 5.7, ioBufferMs: 21.3, safetyMs: 10, pitchLatencyMs: 0)
  private let now = 1e9
  private let rate441 = 44_100.0
  private let frames441: Int64 = 44_100 * 360 // 6 minutes

  private func plan(_ at: Double, _ offset: Double, _ rate: Double, now n: Double? = nil, timing: BackingTiming? = nil,
                    sampleRate: Double? = nil, frames: Int64? = nil) -> BackingPlan? {
    return BackingMath.planStart(BackingStartRequest(at: at, offsetMs: offset, rate: rate), nowMs: n ?? now, timing ?? speaker,
                                 fileSampleRate: sampleRate ?? rate441, fileFrames: frames ?? frames441)
  }

  func testRates() {
    let got = [1, 0.5, 0.75, 0.1, 3, .nan, 0, -1].map(BackingMath.clampRate)
    XCTAssertEqual(got, [1, 0.5, 0.75, 0.25, 2, 1, 1, 1])
    XCTAssertTrue(BackingMath.isUnityRate(1))
    XCTAssertTrue(BackingMath.isUnityRate(1 + 1e-7))
    XCTAssertFalse(BackingMath.isUnityRate(0.999))
  }

  func testOnTime() throws {
    let p = try XCTUnwrap(plan(now + 2000, 1000, 1))
    XCTAssertEqual(p.startFrame, 44_100)
    XCTAssertEqual(p.fileStartMs, 1000)
    XCTAssertEqual(p.heardAtMs, now + 2000)
    XCTAssertEqual(p.scheduleMs, now + 2000 - 5.7, accuracy: 1e-6)
    XCTAssertEqual(p.frameCount, frames441 - 44_100)
    XCTAssertEqual(p.joinedLateMs, 0)
  }

  func testFirstFrameRoundsUpAndStaysOnTheLine() throws {
    let req = BackingStartRequest(at: now + 1000, offsetMs: 10.01, rate: 0.5)
    var t = speaker
    t.pitchLatencyMs = 46.4
    let p = try XCTUnwrap(BackingMath.planStart(req, nowMs: now, t, fileSampleRate: rate441, fileFrames: frames441))
    XCTAssertEqual(p.startFrame, 442)
    XCTAssertEqual(p.fileStartMs, 442 / 44.1, accuracy: 1e-9)
    XCTAssertEqual(p.heardAtMs, BackingMath.expectedHeardMs(req, fileMs: p.fileStartMs), accuracy: 1e-6)
    XCTAssertEqual(p.heardAtMs - (now + 1000), (442 / 44.1 - 10.01) / 0.5, accuracy: 1e-6)
    XCTAssertEqual(p.scheduleMs, p.heardAtMs - 5.7 - 46.4, accuracy: 1e-6)
  }

  func testExactFrameStaysExact() throws {
    let p = try XCTUnwrap(plan(now + 1000, 0.1 * 3 * 1000, 1, sampleRate: 48_000, frames: 10_000_000))
    XCTAssertEqual(p.startFrame, 14_400)
  }

  func testNegativeOffsetStartsLater() throws {
    let p = try XCTUnwrap(plan(now + 1000, -250, 0.5))
    XCTAssertEqual(p.startFrame, 0)
    XCTAssertEqual(p.heardAtMs, now + 1500, accuracy: 1e-6)
  }

  func testLateJoinStaysOnTheLine() throws {
    let req = BackingStartRequest(at: now + 10, offsetMs: 5000, rate: 0.75)
    let p = try XCTUnwrap(BackingMath.planStart(req, nowMs: now, speaker, fileSampleRate: rate441, fileFrames: frames441))
    let join = BackingMath.earliestHeardMs(nowMs: now, speaker) + BackingMath.lateJoinMarginMs
    XCTAssertEqual(p.joinedLateMs, join - (now + 10), accuracy: 1e-6)
    XCTAssertGreaterThanOrEqual(p.heardAtMs, join - 1e-6)
    XCTAssertLessThan(p.heardAtMs - join, 1000 / 44_100 / 0.75 + 1e-6)
    XCTAssertEqual(p.heardAtMs, BackingMath.expectedHeardMs(req, fileMs: p.fileStartMs), accuracy: 1e-6)
    XCTAssertGreaterThanOrEqual(p.scheduleMs, now + speaker.ioBufferMs + speaker.safetyMs)

    let pastReq = BackingStartRequest(at: now - 3000, offsetMs: 0, rate: 0.75)
    let past = try XCTUnwrap(BackingMath.planStart(pastReq, nowMs: now, speaker, fileSampleRate: rate441, fileFrames: frames441))
    XCTAssertEqual(past.fileStartMs, BackingMath.expectedFileMs(pastReq, heardMs: past.heardAtMs), accuracy: 1e-6)
    XCTAssertGreaterThan(past.fileStartMs, 2250)
  }

  func testExactlyEarliestIsOnTime() throws {
    let at = BackingMath.earliestHeardMs(nowMs: now, speaker)
    XCTAssertEqual(try XCTUnwrap(plan(at, 0, 1)).joinedLateMs, 0)
  }

  func testNilPastTheEndOrMalformed() {
    XCTAssertNil(plan(now + 1000, 360_000, 1))
    XCTAssertNil(plan(now - 400_000, 0, 1))
    XCTAssertNil(plan(.nan, 0, 1))
    XCTAssertNil(plan(now + 1000, 0, 1, sampleRate: 0, frames: 10))
    XCTAssertNil(plan(now + 1000, 0, 1, sampleRate: 48_000, frames: 0))
    XCTAssertEqual(plan(now + 1000, 0, .nan)?.rate, 1)
  }

  // MARK: - Lengths and queued segments (seamless loops)

  func testStartWithALength() throws {
    let p = try XCTUnwrap(BackingMath.planStart(BackingStartRequest(at: now + 1000, offsetMs: 1000, rate: 0.75, durationMs: 2400), nowMs: now, speaker,
                                                fileSampleRate: rate441, fileFrames: frames441))
    XCTAssertEqual(p.startFrame, 44_100)
    XCTAssertEqual(p.frameCount, Int64((3.4 * 44_100).rounded()) - 44_100)
    let late = try XCTUnwrap(BackingMath.planStart(BackingStartRequest(at: now - 500, offsetMs: 1000, rate: 0.75, durationMs: 2400), nowMs: now, speaker,
                                                   fileSampleRate: rate441, fileFrames: frames441))
    XCTAssertEqual(late.startFrame + late.frameCount, Int64((3.4 * 44_100).rounded()))
    let lead = try XCTUnwrap(BackingMath.planStart(BackingStartRequest(at: now + 1000, offsetMs: -300, rate: 1, durationMs: 2400), nowMs: now, speaker,
                                                   fileSampleRate: rate441, fileFrames: frames441))
    XCTAssertEqual(lead.frameCount, Int64((2.1 * 44_100).rounded()))
    func withLength(_ at: Double, _ offset: Double, _ d: Double) -> BackingPlan? {
      return BackingMath.planStart(BackingStartRequest(at: at, offsetMs: offset, rate: 1, durationMs: d), nowMs: now, speaker,
                                   fileSampleRate: rate441, fileFrames: frames441)
    }
    XCTAssertNil(withLength(now + 1000, 0, 0))
    XCTAssertNil(withLength(now + 1000, -300, 200))
    XCTAssertNil(withLength(now - 5000, 0, 2000))
    XCTAssertEqual(withLength(now + 1000, 0, .nan)?.frameCount, frames441)
    XCTAssertEqual(BackingMath.lineEndFrame(offsetMs: 0, durationMs: 1e9, sampleRate: 44_100, frames: 1000), 1000)
    XCTAssertEqual(BackingMath.lineEndFrame(offsetMs: 0, durationMs: nil, sampleRate: 44_100, frames: 1000), 1000)
    XCTAssertEqual(BackingMath.lineEndFrame(offsetMs: -500, durationMs: 100, sampleRate: 44_100, frames: 1000), 0)
    XCTAssertEqual(BackingMath.jsRound(-2.5), -2)
    XCTAssertEqual(BackingMath.jsRound(2.5), 3)
  }

  /// A section looped `n` times: the start, then the queued segments, as core's take hands them over.
  private func loop(_ n: Int, rate: Double, offsetMs: Double, secFileMs: Double, sampleRate: Double = 44_100) throws
    -> (p: BackingPlan, segs: [BackingSegmentPlan], plans: [BackingQueuePlan], at0: Double, sec: Double) {
    let frames = Int64(sampleRate) * 600
    let at0 = now + 1000, sec = secFileMs / rate
    let p = try XCTUnwrap(BackingMath.planStart(BackingStartRequest(at: at0, offsetMs: offsetMs, rate: rate, durationMs: secFileMs), nowMs: now, speaker,
                                                fileSampleRate: sampleRate, fileFrames: frames))
    var segs = [BackingMath.firstSegment(p)]
    var plans: [BackingQueuePlan] = []
    for r in 1..<n {
      let last = segs[segs.count - 1]
      let q = try XCTUnwrap(BackingMath.planQueue(BackingQueueRequest(at: at0 + Double(r) * sec, offsetMs: offsetMs, durationMs: secFileMs),
                                                  lineHeardAtMs: p.heardAtMs, lineRate: p.rate, prevEnd: last.playerFrame + last.frameCount,
                                                  nowMs: now, speaker, fileSampleRate: sampleRate, fileFrames: frames))
      segs.append(q.segment)
      plans.append(q)
    }
    return (p, segs, plans, at0, sec)
  }

  func testQueuedRepeatsAreBackToBack() throws {
    for rate in [1, 0.75, 0.5] {
      let l = try loop(200, rate: rate, offsetMs: 2650, secFileMs: 2400)
      for (i, q) in l.plans.enumerated() {
        let prev = l.segs[i]
        XCTAssertEqual(q.segment.playerFrame, prev.playerFrame + prev.frameCount) // no gap, no overlap
        XCTAssertFalse(q.explicitTime)
        XCTAssertEqual(q.skippedFrames, 0)
        XCTAssertEqual(q.segment.startFrame, l.segs[0].startFrame)
        XCTAssertEqual(q.segment.frameCount, l.segs[0].frameCount)
        XCTAssertLessThan(abs(q.segment.heardAtMs - (l.at0 + Double(i + 1) * l.sec)), 1000 / 44_100 / rate)
      }
    }
  }

  func testOddSectionLengthNeverCreeps() throws {
    let l = try loop(500, rate: 0.75, offsetMs: 123.456, secFileMs: 1234.5678, sampleRate: 48_000)
    for (i, q) in l.plans.enumerated() {
      XCTAssertEqual(q.segment.playerFrame, l.segs[i].playerFrame + l.segs[i].frameCount)
      XCTAssertLessThanOrEqual(abs(q.skippedFrames), 1)
      let sectionStartHeard = q.segment.heardAtMs - (q.segment.fileStartMs - 123.456) / 0.75
      XCTAssertLessThan(abs(sectionStartHeard - (l.at0 + Double(i + 1) * l.sec)), 1.5 * 1000 / 48_000 / 0.75)
    }
  }

  func testQueuedLeadWaitsAtAnExplicitTime() throws {
    let at0 = now + 1000
    let p = try XCTUnwrap(BackingMath.planStart(BackingStartRequest(at: at0, offsetMs: -300, rate: 1, durationMs: 2400), nowMs: now, speaker,
                                                fileSampleRate: rate441, fileFrames: frames441))
    let q = try XCTUnwrap(BackingMath.planQueue(BackingQueueRequest(at: at0 + 2400, offsetMs: -300, durationMs: 2400), lineHeardAtMs: p.heardAtMs,
                                                lineRate: 1, prevEnd: p.frameCount, nowMs: now, speaker, fileSampleRate: rate441, fileFrames: frames441))
    XCTAssertTrue(q.explicitTime)
    XCTAssertEqual(q.segment.playerFrame, Int64((2.4 * 44_100).rounded()))
    XCTAssertEqual(q.segment.startFrame, 0)
    XCTAssertEqual(q.segment.heardAtMs, at0 + 2700, accuracy: 1e-6)
  }

  func testQueuedOverlapSkipsAndLateQueueJoinsOnTheLine() throws {
    let at0 = now + 1000
    let p = try XCTUnwrap(BackingMath.planStart(BackingStartRequest(at: at0, offsetMs: 0, rate: 0.5, durationMs: 10_000), nowMs: now, speaker,
                                                fileSampleRate: rate441, fileFrames: frames441))
    let over = try XCTUnwrap(BackingMath.planQueue(BackingQueueRequest(at: at0 + 19_000, offsetMs: 5000, durationMs: 1000), lineHeardAtMs: p.heardAtMs,
                                                   lineRate: 0.5, prevEnd: p.frameCount, nowMs: now, speaker, fileSampleRate: rate441, fileFrames: frames441))
    XCTAssertEqual(over.segment.playerFrame, p.frameCount)
    XCTAssertEqual(over.skippedFrames, 22_050)
    XCTAssertEqual(over.segment.startFrame, Int64(5.5 * 44_100))
    XCTAssertFalse(over.explicitTime)
    let later = now + 30_000
    let late = try XCTUnwrap(BackingMath.planQueue(BackingQueueRequest(at: at0 + 20_000, offsetMs: 0, durationMs: 60_000), lineHeardAtMs: p.heardAtMs,
                                                   lineRate: 0.5, prevEnd: p.frameCount, nowMs: later, speaker, fileSampleRate: rate441, fileFrames: frames441))
    XCTAssertTrue(late.explicitTime)
    XCTAssertGreaterThanOrEqual(late.segment.heardAtMs, BackingMath.earliestHeardMs(nowMs: later, speaker) + BackingMath.lateJoinMarginMs - 1e-6)
    XCTAssertEqual(late.segment.heardAtMs - (at0 + 20_000), late.segment.fileStartMs / 0.5, accuracy: 1e-3)
    XCTAssertEqual(late.skippedFrames, late.segment.startFrame)
  }

  func testQueueNilWhenNothingIsLeftOrMalformed() throws {
    let p = try XCTUnwrap(BackingMath.planStart(BackingStartRequest(at: now + 1000, offsetMs: 0, rate: 1, durationMs: 1000), nowMs: now, speaker,
                                                fileSampleRate: rate441, fileFrames: frames441))
    func q(_ at: Double, _ offset: Double, _ d: Double, sampleRate: Double = 44_100, frames: Int64? = nil) -> BackingQueuePlan? {
      return BackingMath.planQueue(BackingQueueRequest(at: at, offsetMs: offset, durationMs: d), lineHeardAtMs: p.heardAtMs, lineRate: 1,
                                   prevEnd: p.frameCount, nowMs: now, speaker, fileSampleRate: sampleRate, fileFrames: frames ?? frames441)
    }
    XCTAssertNil(q(now + 2000, 360_000, 1000))
    XCTAssertNil(q(now + 1500, 0, 400)) // overlapped entirely
    XCTAssertNil(q(now + 2000, 0, .nan))
    XCTAssertNil(q(now + 2000, 0, 1000, sampleRate: 0, frames: 10))
    XCTAssertNil(q(now + 2000, 0, 1000, frames: 0))
  }

  func testAnchorAcrossSeams() throws {
    let segs = [
      BackingSegmentPlan(playerFrame: 0, startFrame: 44_100, frameCount: 44_100, fileStartMs: 1000, heardAtMs: 0),
      BackingSegmentPlan(playerFrame: 44_100, startFrame: 44_100, frameCount: 44_100, fileStartMs: 1000, heardAtMs: 0),
      BackingSegmentPlan(playerFrame: 100_000, startFrame: 0, frameCount: 1000, fileStartMs: 0, heardAtMs: 0), // after a gap
    ]
    func at(_ s: Double) -> BackingAnchor? {
      return BackingMath.anchorInSegments(segs, playerSampleTime: s, playerSampleRate: 44_100, hostMs: now, heardOffsetMs: 5.7, pitchLatencyMs: 0)
    }
    let a0 = try XCTUnwrap(at(44_099))
    XCTAssertEqual(a0.segment, 0)
    XCTAssertEqual(a0.fileMs, 1000 + 44_099 / 44.1, accuracy: 1e-9)
    let a1 = try XCTUnwrap(at(44_100))
    XCTAssertEqual(a1.segment, 1)
    XCTAssertEqual(a1.fileMs, 1000, accuracy: 1e-9)
    let a2 = try XCTUnwrap(at(100_500))
    XCTAssertEqual(a2.segment, 2)
    XCTAssertEqual(a2.fileMs, 500 / 44.1, accuracy: 1e-9)
    XCTAssertEqual(try XCTUnwrap(at(0)).at, now + 5.7, accuracy: 1e-6)
    XCTAssertNil(at(-1))
    XCTAssertNil(at(90_000))
    XCTAssertNil(at(101_000))
    XCTAssertNil(BackingMath.anchorInSegments([], playerSampleTime: 0, playerSampleRate: 44_100, hostMs: now, heardOffsetMs: 5.7, pitchLatencyMs: 0))
    XCTAssertNil(BackingMath.anchorInSegments(segs, playerSampleTime: 0, playerSampleRate: 0, hostMs: now, heardOffsetMs: 5.7, pitchLatencyMs: 0))
  }

  func testLoopReadOnAPerfectClockHasNoDriftInAnyRepeat() throws {
    for rate in [1, 0.75] {
      var t = speaker
      t.pitchLatencyMs = rate == 1 ? 0 : 46.4
      let at0 = now + 1500, secFile = 2400.0, sec = secFile / rate
      let p = try XCTUnwrap(BackingMath.planStart(BackingStartRequest(at: at0, offsetMs: 2650, rate: rate, durationMs: secFile), nowMs: now, t,
                                                  fileSampleRate: rate441, fileFrames: frames441))
      var segs = [BackingMath.firstSegment(p)]
      for r in 1..<50 {
        let last = segs[r - 1]
        let q = try XCTUnwrap(BackingMath.planQueue(BackingQueueRequest(at: at0 + Double(r) * sec, offsetMs: 2650, durationMs: secFile),
                                                    lineHeardAtMs: p.heardAtMs, lineRate: rate, prevEnd: last.playerFrame + last.frameCount,
                                                    nowMs: now, t, fileSampleRate: rate441, fileFrames: frames441))
        segs.append(q.segment)
      }
      var ms = 0.0
      while ms < 49 * sec {
        let a = try XCTUnwrap(BackingMath.anchorInSegments(segs, playerSampleTime: ms / 1000 * 44_100 * rate, playerSampleRate: 44_100,
                                                           hostMs: p.scheduleMs + ms, heardOffsetMs: t.heardOffsetMs, pitchLatencyMs: t.pitchLatencyMs))
        let line = BackingStartRequest(at: at0 + Double(a.segment) * sec, offsetMs: 2650, rate: rate)
        XCTAssertLessThan(abs(BackingMath.driftMs(line, a)), 1000 / 44_100 / rate)
        ms += 337
      }
    }
  }

  func testReanchorPlan() throws {
    let segs = [
      BackingSegmentPlan(playerFrame: 0, startFrame: 44_100, frameCount: 44_100, fileStartMs: 1000, heardAtMs: now + 100),
      BackingSegmentPlan(playerFrame: 44_100, startFrame: 44_100, frameCount: 44_100, fileStartMs: 1000, heardAtMs: now + 2100),
      BackingSegmentPlan(playerFrame: 88_200, startFrame: 44_100, frameCount: 44_100, fileStartMs: 1000, heardAtMs: now + 4100),
    ]
    let plan = try XCTUnwrap(BackingMath.reanchorPlan(last: BackingAnchor(at: now + 3103, fileMs: 1500, segment: 1), segments: segs, rate: 0.5, sampleRate: 44_100))
    XCTAssertEqual(plan.start, BackingStartRequest(at: now + 3103, offsetMs: 1500, rate: 0.5, durationMs: 500))
    XCTAssertEqual(plan.queue.count, 1)
    XCTAssertEqual(plan.queue[0].at, now + 4103, accuracy: 1e-6)
    XCTAssertEqual(plan.queue[0].offsetMs, 1000)
    XCTAssertEqual(plan.queue[0].durationMs, 1000, accuracy: 1e-9)
    let fresh = try XCTUnwrap(BackingMath.reanchorPlan(last: nil, segments: segs, rate: 0.5, sampleRate: 44_100))
    XCTAssertEqual(fresh.start, BackingStartRequest(at: now + 100, offsetMs: 1000, rate: 0.5, durationMs: 1000))
    XCTAssertEqual(fresh.queue.map(\.at), [now + 2100, now + 4100])
    XCTAssertNil(BackingMath.reanchorPlan(last: BackingAnchor(at: now, fileMs: 0, segment: 3), segments: segs, rate: 0.5, sampleRate: 44_100))
    XCTAssertNil(BackingMath.reanchorPlan(last: nil, segments: [], rate: 1, sampleRate: 44_100))
    XCTAssertNil(BackingMath.reanchorPlan(last: nil, segments: segs, rate: 1, sampleRate: 0))

    // put back after a heard-offset change, the queued segment still follows back to back
    let at0 = now + 1000
    let p = try XCTUnwrap(BackingMath.planStart(BackingStartRequest(at: at0, offsetMs: 0, rate: 1, durationMs: 2000), nowMs: now, speaker,
                                                fileSampleRate: rate441, fileFrames: frames441))
    let s1 = try XCTUnwrap(BackingMath.planQueue(BackingQueueRequest(at: at0 + 2000, offsetMs: 0, durationMs: 2000), lineHeardAtMs: p.heardAtMs,
                                                 lineRate: 1, prevEnd: p.frameCount, nowMs: now, speaker, fileSampleRate: rate441, fileFrames: frames441))
    let later = now + 1500
    let bt = BackingTiming(heardOffsetMs: 180, ioBufferMs: 10.7, safetyMs: 10, pitchLatencyMs: 0)
    let back = try XCTUnwrap(BackingMath.reanchorPlan(last: BackingAnchor(at: at0 + 500, fileMs: 500, segment: 0), segments: [BackingMath.firstSegment(p), s1.segment],
                                                      rate: 1, sampleRate: 44_100))
    let q = try XCTUnwrap(BackingMath.planStart(back.start, nowMs: later, bt, fileSampleRate: rate441, fileFrames: frames441))
    XCTAssertGreaterThan(q.joinedLateMs, 0)
    XCTAssertEqual(q.startFrame + q.frameCount, 2 * 44_100)
    let r = try XCTUnwrap(BackingMath.planQueue(back.queue[0], lineHeardAtMs: q.heardAtMs, lineRate: 1, prevEnd: q.frameCount, nowMs: later, bt,
                                                fileSampleRate: rate441, fileFrames: frames441))
    XCTAssertEqual(r.segment.playerFrame, q.frameCount)
    XCTAssertFalse(r.explicitTime)
    XCTAssertEqual(r.segment.heardAtMs, at0 + 2000, accuracy: 1e-3)
  }

  func testRenderHostMs() {
    XCTAssertEqual(BackingMath.renderHostMs(player: now, output: now + 21.3, ioBufferMs: 21.3), now)
    XCTAssertEqual(BackingMath.renderHostMs(player: now, output: now + 47.5, ioBufferMs: 21.3), now)
    XCTAssertEqual(BackingMath.renderHostMs(player: now, output: now + 47.7, ioBufferMs: 21.3), now + 47.7)
    XCTAssertEqual(BackingMath.renderHostMs(player: now, output: nil, ioBufferMs: 21.3), now)
    XCTAssertEqual(BackingMath.renderHostMs(player: nil, output: now, ioBufferMs: 21.3), now)
    XCTAssertEqual(BackingMath.renderHostMs(player: 0, output: now, ioBufferMs: 21.3), now)
    XCTAssertNil(BackingMath.renderHostMs(player: nil, output: nil, ioBufferMs: 21.3))
  }

  private let shortPlan = BackingPlan(rate: 1, startFrame: 44_100, frameCount: 0, fileStartMs: 1000, heardAtMs: 0, scheduleMs: 0, joinedLateMs: 0)

  func testAnchor() throws {
    let a = try XCTUnwrap(BackingMath.anchor(plan: shortPlan, playerSampleTime: 22_050, playerSampleRate: 44_100, hostMs: now,
                                             heardOffsetMs: 5.7, pitchLatencyMs: 2, fileFrames: frames441))
    XCTAssertEqual(a.at, now + 7.7, accuracy: 1e-6)
    XCTAssertEqual(a.fileMs, 1500, accuracy: 1e-9)
    XCTAssertNil(BackingMath.anchor(plan: shortPlan, playerSampleTime: -1, playerSampleRate: 44_100, hostMs: now, heardOffsetMs: 5.7, pitchLatencyMs: 0, fileFrames: frames441))
    XCTAssertNil(BackingMath.anchor(plan: shortPlan, playerSampleTime: Double(frames441 - 44_100), playerSampleRate: 44_100, hostMs: now, heardOffsetMs: 5.7, pitchLatencyMs: 0, fileFrames: frames441))
    XCTAssertNil(BackingMath.anchor(plan: shortPlan, playerSampleTime: 0, playerSampleRate: 0, hostMs: now, heardOffsetMs: 5.7, pitchLatencyMs: 0, fileFrames: frames441))
    XCTAssertNil(BackingMath.anchor(plan: shortPlan, playerSampleTime: 0, playerSampleRate: 44_100, hostMs: .nan, heardOffsetMs: 5.7, pitchLatencyMs: 0, fileFrames: frames441))
  }

  func testPerfectClockHasNoDriftAtAnyRate() throws {
    for rate in [1, 0.75, 0.5] {
      var t = speaker
      t.pitchLatencyMs = rate == 1 ? 0 : 46.4
      let req = BackingStartRequest(at: now + 1500, offsetMs: 12_345.6, rate: rate)
      let p = try XCTUnwrap(BackingMath.planStart(req, nowMs: now, t, fileSampleRate: rate441, fileFrames: frames441))
      for h in [p.scheduleMs, p.scheduleMs + 1000, p.scheduleMs + 60_000] {
        let a = try XCTUnwrap(BackingMath.anchor(plan: p, playerSampleTime: (h - p.scheduleMs) / 1000 * 44_100 * rate, playerSampleRate: 44_100,
                                                 hostMs: h, heardOffsetMs: t.heardOffsetMs, pitchLatencyMs: t.pitchLatencyMs, fileFrames: frames441))
        XCTAssertLessThan(abs(BackingMath.driftMs(req, a)), 1e-6)
      }
    }
  }

  /// AUDIO-DESIGN §6 / T6-3 shape: a device clock off by ±100 ppm shows in the anchor; the smoothed value tracks it.
  func testDriftAt100ppm() throws {
    for ppm in [100.0, -100.0] {
      let req = BackingStartRequest(at: now + 1000, offsetMs: 0, rate: 1)
      let p = try XCTUnwrap(BackingMath.planStart(req, nowMs: now, speaker, fileSampleRate: rate441, fileFrames: frames441))
      var smoothed = 0.0
      var worst = 0.0
      var ms = 0.0
      while ms <= 300_000 {
        let frames = ms / 1000 * 44_100 * (1 + ppm * 1e-6)
        let a = try XCTUnwrap(BackingMath.anchor(plan: p, playerSampleTime: frames, playerSampleRate: 44_100, hostMs: p.scheduleMs + ms,
                                                 heardOffsetMs: 5.7, pitchLatencyMs: 0, fileFrames: frames441))
        let d = BackingMath.driftMs(req, a)
        XCTAssertEqual(d, -ms * ppm * 1e-6, accuracy: 1e-6)
        smoothed = BackingMath.smoothDrift(previous: smoothed, reading: d)
        worst = max(worst, abs(smoothed - d))
        ms += 100
      }
      XCTAssertLessThan(worst, 1)
      XCTAssertEqual(abs(smoothed), 30, accuracy: 0.5)
    }
  }

  func testNodeSampleForHost() {
    XCTAssertEqual(BackingMath.nodeSampleForHost(lastSampleTime: 1000, lastHostMs: now, targetHostMs: now + 1000, sampleRate: 44_100, rate: 1), 45_100)
    XCTAssertEqual(BackingMath.nodeSampleForHost(lastSampleTime: 1000, lastHostMs: now, targetHostMs: now + 1000, sampleRate: 44_100, rate: 0.5), 23_050)
    XCTAssertEqual(BackingMath.nodeSampleForHost(lastSampleTime: 1000, lastHostMs: now, targetHostMs: now + 200, sampleRate: 48_000, rate: 0.75), 8200)
  }

  func testReanchor() throws {
    let p = BackingPlan(rate: 0.5, startFrame: 0, frameCount: 0, fileStartMs: 250, heardAtMs: now + 100, scheduleMs: 0, joinedLateMs: 0)
    XCTAssertEqual(BackingMath.reanchorRequest(last: BackingAnchor(at: now + 5000, fileMs: 2700), plan: p),
                   BackingStartRequest(at: now + 5000, offsetMs: 2700, rate: 0.5))
    XCTAssertEqual(BackingMath.reanchorRequest(last: nil, plan: p), BackingStartRequest(at: now + 100, offsetMs: 250, rate: 0.5))

    let req = BackingStartRequest(at: now + 1000, offsetMs: 0, rate: 1)
    let first = try XCTUnwrap(BackingMath.planStart(req, nowMs: now, speaker, fileSampleRate: rate441, fileFrames: frames441))
    let bt = BackingTiming(heardOffsetMs: 180, ioBufferMs: 10.7, safetyMs: 10, pitchLatencyMs: 0)
    let q = try XCTUnwrap(BackingMath.planStart(BackingMath.reanchorRequest(last: nil, plan: first), nowMs: now + 30_000, bt,
                                                fileSampleRate: rate441, fileFrames: frames441))
    XCTAssertGreaterThan(q.joinedLateMs, 0)
    XCTAssertEqual(q.heardAtMs, BackingMath.expectedHeardMs(req, fileMs: q.fileStartMs), accuracy: 1e-6)
    XCTAssertEqual(q.scheduleMs, q.heardAtMs - 180, accuracy: 1e-6)
  }

  func testFilePath() {
    XCTAssertEqual(BackingMath.filePath("file:///var/mobile/Containers/Data/Application/X/Documents/songs/a%20b.m4a"),
                   "/var/mobile/Containers/Data/Application/X/Documents/songs/a b.m4a")
    XCTAssertEqual(BackingMath.filePath("file://localhost/tmp/x.caf"), "/tmp/x.caf")
    XCTAssertEqual(BackingMath.filePath("/tmp/x.wav"), "/tmp/x.wav")
    for u in ["https://www.youtube.com/watch?v=abc", "http://192.168.1.2:8787/api/charts/x/audio", "content://x", "file://host/x", "x.m4a", "", "file:///bad%zz"] {
      XCTAssertNil(BackingMath.filePath(u), u)
    }
  }

  // MARK: - Test tone

  func testToneLengthAndBeats() {
    // 120 BPM 4/4: a 4-bar phrase is 8 s; 130 s → 17 phrases = 136 s.
    XCTAssertEqual(TestTone.frameCount(bpm: 120, beatsPerBar: 4, seconds: 130, sampleRate: 44_100), 136 * 44_100)
    XCTAssertEqual(TestTone.frequency(beat: 0, beatsPerBar: 4), 880)
    XCTAssertEqual(TestTone.frequency(beat: 4, beatsPerBar: 4), 660)
    XCTAssertEqual(TestTone.frequency(beat: 5, beatsPerBar: 4), 440)
    XCTAssertEqual(TestTone.frequency(beat: 16, beatsPerBar: 4), 880)
    let x = TestTone.render(bpm: 120, beatsPerBar: 4, sampleRate: 44_100, from: 0, count: 44_100)
    XCTAssertEqual(x.count, 44_100)
    XCTAssertFalse(x.contains { !$0.isFinite })
    XCTAssertEqual(x[0], 0) // the blip starts at its beat frame
    XCTAssertGreaterThan(x[12], 0.1) // a quarter period of 880 Hz in, during the attack
    XCTAssertEqual(x[22_049], 0) // silence between the blips (beat 1 at 22 050)
    XCTAssertGreaterThan(x[22_050 + 60].magnitude, 0.01)
    XCTAssertLessThanOrEqual(x.map(\.magnitude).max() ?? 0, TestTone.peak)
  }

  func testToneChunksMatchOneRender() {
    let whole = TestTone.render(bpm: 97, beatsPerBar: 3, sampleRate: 44_100, from: 0, count: 120_000)
    var chunks: [Float] = []
    var from = 0
    while from < 120_000 {
      let n = min(4096, 120_000 - from)
      chunks += TestTone.render(bpm: 97, beatsPerBar: 3, sampleRate: 44_100, from: from, count: n)
      from += n
    }
    XCTAssertEqual(chunks, whole)
  }
}
