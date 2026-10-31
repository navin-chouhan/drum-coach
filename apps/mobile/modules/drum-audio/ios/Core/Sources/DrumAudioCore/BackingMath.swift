import Foundation

/// Backing audio math as pure functions: a line-by-line mirror of `src/backing.ts`, which holds the rationale and the
/// tests. Change both together; `Tests/DrumAudioCoreTests/BackingMathTests.swift` runs the same vectors.
///
/// A start asks for a line: file position `offsetMs` is heard at Clock time `at`, and the file advances `rate` ms per
/// Clock ms. Native keeps that line exactly (negative offsets start later, late starts skip into the file, the first
/// frame is rounded up and its heard time recomputed). Only local files play here (CLAUDE.md: never YouTube audio).
/// A start may end after `durationMs` of its line; further segments are queued behind it on the same player timeline
/// (planQueue), which has no seams, and the anchor maps that timeline through the segment list (anchorInSegments).
struct BackingTiming: Equatable {
  /// Schedule time + heardOffsetMs = heard time (AudioRoute.heardOffsetMs).
  var heardOffsetMs: Double
  var ioBufferMs: Double
  /// LoopPolicy.safetyMs.
  var safetyMs: Double
  /// AVAudioUnitTimePitch.latency × 1000 when it isn't bypassed, else 0.
  var pitchLatencyMs: Double
}

struct BackingStartRequest: Equatable {
  var at: Double
  var offsetMs: Double
  var rate: Double
  /// Ms of the line (file ms from offsetMs) to play; nil or not finite = to the file's end.
  var durationMs: Double? = nil
}

/// A queued segment: `offsetMs` heard at `at` on the start's line, `durationMs` of the line (BackingPort.queue).
struct BackingQueueRequest: Equatable {
  var at: Double
  var offsetMs: Double
  var durationMs: Double
}

/// One segment on the player's timeline (a start's first segment is at player frame 0).
struct BackingSegmentPlan: Equatable {
  /// Where the segment begins on the player's timeline: frames since `play(at:)`, at the file's rate.
  var playerFrame: Int64
  /// First file frame (`scheduleSegment(startingFrame:)`) and how many (`frameCount:`).
  var startFrame: Int64
  var frameCount: Int64
  var fileStartMs: Double
  /// When startFrame is heard on the line (Clock ms).
  var heardAtMs: Double
}

struct BackingQueuePlan: Equatable {
  var segment: BackingSegmentPlan
  /// Frames of the segment's line skipped: it overlapped the previous segment, or came too late to place.
  var skippedFrames: Int64
  /// True: scheduled at an explicit player time (a gap before it). False: `at: nil`, right after the previous one.
  var explicitTime: Bool
}

/// After a route or engine change: the start to put back, then the segments to queue behind it.
struct BackingReanchor: Equatable {
  var start: BackingStartRequest
  var queue: [BackingQueueRequest]
}

struct BackingPlan: Equatable {
  var rate: Double
  /// First file frame of the segment (`scheduleSegment(startingFrame:)`).
  var startFrame: Int64
  var frameCount: Int64
  var fileStartMs: Double
  /// When startFrame is heard (Clock ms), on the requested line.
  var heardAtMs: Double
  /// When startFrame must enter the player (host ms): heardAtMs − heardOffsetMs − pitchLatencyMs.
  var scheduleMs: Double
  /// Clock ms of the line skipped because `at` was too close or past (0 = on time).
  var joinedLateMs: Double
}

struct BackingAnchor: Equatable {
  var at: Double
  var fileMs: Double
  /// The segment it was read in (anchorInSegments); 0 for a single one.
  var segment: Int = 0
}

enum BackingMath {
  /// The rates accepted (AVAudioUnitTimePitch takes 1/32…32; the app uses 0.5…1). NaN and ≤ 0 mean 1.
  static let minRate = 0.25
  static let maxRate = 2.0
  /// Rates this close to 1 bypass the time-pitch unit.
  static let unityRateEps = 1e-6
  /// Extra room for a late join: the first frames are read (`prepare`) before `play(at:)`.
  static let lateJoinMarginMs = 50.0
  /// A queued segment this close (player frames) to where the previous one ends is played right after it.
  static let seamSlackFrames: Int64 = 1

  /// JS Math.round (halves round up, also below 0), so the TS and Swift plans agree to the frame.
  static func jsRound(_ x: Double) -> Double {
    return (x + 0.5).rounded(.down)
  }

  /// The line's end in file frames: offsetMs + durationMs to the nearest frame, within the file; no length = its end.
  static func lineEndFrame(offsetMs: Double, durationMs: Double?, sampleRate: Double, frames: Int64) -> Int64 {
    guard let d = durationMs, d.isFinite else { return frames }
    let e = min(Double(frames), jsRound((offsetMs + d) * sampleRate / 1000))
    return e <= 0 ? 0 : Int64(e)
  }

  static func clampRate(_ rate: Double) -> Double {
    if !rate.isFinite || rate <= 0 { return 1 }
    return min(max(rate, minRate), maxRate)
  }

  static func isUnityRate(_ rate: Double) -> Bool {
    return abs(rate - 1) < unityRateEps
  }

  /// Earliest heard time a start can still be placed exactly at `nowMs` (the late rule of AudioPolicy.isLate).
  static func earliestHeardMs(nowMs: Double, _ t: BackingTiming) -> Double {
    return nowMs + t.ioBufferMs + t.safetyMs + t.heardOffsetMs + t.pitchLatencyMs
  }

  /// The segment for a start request, or nil when nothing of the file is left (or the request or file is malformed).
  static func planStart(_ req: BackingStartRequest, nowMs: Double, _ t: BackingTiming, fileSampleRate: Double, fileFrames: Int64,
                        marginMs: Double = lateJoinMarginMs) -> BackingPlan? {
    let rate = clampRate(req.rate)
    guard req.at.isFinite, req.offsetMs.isFinite, nowMs.isFinite, fileSampleRate > 0, fileFrames > 0 else { return nil }
    var at = req.at
    var offset = req.offsetMs
    if offset < 0 {
      at += -offset / rate
      offset = 0
    }
    let earliest = earliestHeardMs(nowMs: nowMs, t)
    var joinedLateMs = 0.0
    if at < earliest {
      let join = earliest + marginMs
      joinedLateMs = join - at
      offset += joinedLateMs * rate
      at = join
    }
    let frame = max(0, (offset * fileSampleRate / 1000 - 1e-6).rounded(.up))
    let endFrame = lineEndFrame(offsetMs: req.offsetMs, durationMs: req.durationMs, sampleRate: fileSampleRate, frames: fileFrames)
    guard frame < Double(endFrame) else { return nil }
    let startFrame = Int64(frame)
    let fileStartMs = Double(startFrame) * 1000 / fileSampleRate
    let heardAtMs = at + (fileStartMs - offset) / rate
    return BackingPlan(rate: rate, startFrame: startFrame, frameCount: endFrame - startFrame, fileStartMs: fileStartMs,
                       heardAtMs: heardAtMs, scheduleMs: heardAtMs - t.heardOffsetMs - t.pitchLatencyMs, joinedLateMs: joinedLateMs)
  }

  /// A start's plan as the first segment of its player timeline.
  static func firstSegment(_ p: BackingPlan) -> BackingSegmentPlan {
    return BackingSegmentPlan(playerFrame: 0, startFrame: p.startFrame, frameCount: p.frameCount, fileStartMs: p.fileStartMs, heardAtMs: p.heardAtMs)
  }

  /// The next segment on a playing line (player frame 0 heard at `lineHeardAtMs`), after the segment that ends at
  /// player frame `prevEnd`: within a frame of it, exactly there (`at: nil`, its first file frame moved by that frame);
  /// later, after a gap; earlier, or before what can still be placed at `nowMs` (then + the margin), later than asked
  /// and as many frames into the file. Nil when nothing of it is left or for a malformed request or file.
  static func planQueue(_ req: BackingQueueRequest, lineHeardAtMs: Double, lineRate: Double, prevEnd: Int64, nowMs: Double, _ t: BackingTiming,
                        fileSampleRate: Double, fileFrames: Int64, marginMs: Double = lateJoinMarginMs) -> BackingQueuePlan? {
    guard req.at.isFinite, req.offsetMs.isFinite, req.durationMs.isFinite, nowMs.isFinite, lineHeardAtMs.isFinite,
          fileSampleRate > 0, fileFrames > 0 else { return nil }
    let rate = clampRate(lineRate)
    let fpm = fileSampleRate / 1000 // file frames per ms
    var at = req.at
    var offset = req.offsetMs
    if offset < 0 {
      at += -offset / rate
      offset = 0
    }
    let wantD = jsRound((at - lineHeardAtMs) * rate * fpm)
    let earliestD = ((earliestHeardMs(nowMs: nowMs, t) - lineHeardAtMs) * rate * fpm).rounded(.up)
    guard abs(wantD) < 9e15, abs(earliestD) < 9e15 else { return nil }
    let want = Int64(wantD)
    var playerFrame = abs(want - prevEnd) <= seamSlackFrames ? prevEnd : max(want, prevEnd)
    let earliest = Int64(earliestD)
    if playerFrame < earliest { playerFrame = earliest + Int64((marginMs * rate * fpm).rounded(.up)) }
    let skipped = playerFrame - want // −1 …: a seam a frame early starts its file a frame early too
    let first = max(0, (offset * fpm - 1e-6).rounded(.up) + Double(skipped))
    let endFrame = lineEndFrame(offsetMs: req.offsetMs, durationMs: req.durationMs, sampleRate: fileSampleRate, frames: fileFrames)
    guard first < Double(endFrame) else { return nil }
    let startFrame = Int64(first)
    let seg = BackingSegmentPlan(playerFrame: playerFrame, startFrame: startFrame, frameCount: endFrame - startFrame,
                                 fileStartMs: Double(startFrame) / fpm, heardAtMs: lineHeardAtMs + Double(playerFrame) / fpm / rate)
    return BackingQueuePlan(segment: seg, skippedFrames: skipped, explicitTime: playerFrame != prevEnd)
  }

  static func expectedHeardMs(_ req: BackingStartRequest, fileMs: Double) -> Double {
    return req.at + (fileMs - req.offsetMs) / clampRate(req.rate)
  }

  static func expectedFileMs(_ req: BackingStartRequest, heardMs: Double) -> Double {
    return req.offsetMs + (heardMs - req.at) * clampRate(req.rate)
  }

  /// The player's own last-render host time when valid and within two IO buffers + 5 ms of the output node's; else
  /// the output node's; else nil.
  static func renderHostMs(player: Double?, output: Double?, ioBufferMs: Double) -> Double? {
    func ok(_ x: Double?) -> Bool { return x.map { $0.isFinite && $0 > 0 } ?? false }
    if ok(player), let p = player {
      if !ok(output) { return p }
      if let o = output, abs(p - o) <= 2 * ioBufferMs + 5 { return p }
    }
    return ok(output) ? output : nil
  }

  /// The anchor from the render clock: `playerSampleTime` = frames of the segment rendered when the last cycle began
  /// (`playerTime(forNodeTime: lastRenderTime)`, negative before the start). Nil before the start, after the end, or
  /// with invalid times.
  static func anchor(plan: BackingPlan, playerSampleTime: Double, playerSampleRate: Double, hostMs: Double,
                     heardOffsetMs: Double, pitchLatencyMs: Double, fileFrames: Int64) -> BackingAnchor? {
    let only = BackingSegmentPlan(playerFrame: 0, startFrame: plan.startFrame, frameCount: fileFrames - plan.startFrame,
                                  fileStartMs: plan.fileStartMs, heardAtMs: plan.heardAtMs)
    return anchorInSegments([only], playerSampleTime: playerSampleTime, playerSampleRate: playerSampleRate, hostMs: hostMs,
                            heardOffsetMs: heardOffsetMs, pitchLatencyMs: pitchLatencyMs)
  }

  /// The anchor across queued segments: the player's timeline has no seams, so `playerSampleTime` falls in one segment
  /// (`segment`: its index). Nil in a gap between segments, before the first, after the last, or with invalid times.
  static func anchorInSegments(_ segments: [BackingSegmentPlan], playerSampleTime: Double, playerSampleRate: Double, hostMs: Double,
                               heardOffsetMs: Double, pitchLatencyMs: Double) -> BackingAnchor? {
    guard playerSampleRate > 0, playerSampleTime.isFinite, hostMs.isFinite else { return nil }
    var i = segments.count - 1
    while i >= 0 {
      let s = segments[i]
      let into = playerSampleTime - Double(s.playerFrame)
      if into >= 0 {
        guard into < Double(s.frameCount) else { return nil }
        return BackingAnchor(at: hostMs + heardOffsetMs + pitchLatencyMs, fileMs: s.fileStartMs + into * 1000 / playerSampleRate, segment: i)
      }
      i -= 1
    }
    return nil
  }

  /// Behind a time-pitch unit the node timeline runs at sampleRate × rate per real second: the start as node time,
  /// extrapolated from the player's last render.
  static func nodeSampleForHost(lastSampleTime: Double, lastHostMs: Double, targetHostMs: Double, sampleRate: Double, rate: Double) -> Int64 {
    return Int64((lastSampleTime + (targetHostMs - lastHostMs) / 1000 * sampleRate * clampRate(rate)).rounded())
  }

  /// The line to restart on after a route or engine change: the last anchor read, else the plan's own line.
  static func reanchorRequest(last: BackingAnchor?, plan: BackingPlan) -> BackingStartRequest {
    if let a = last { return BackingStartRequest(at: a.at, offsetMs: a.fileMs, rate: plan.rate) }
    return BackingStartRequest(at: plan.heardAtMs, offsetMs: plan.fileStartMs, rate: plan.rate)
  }

  /// After a route or engine change, the whole timeline to put back: the segment playing now from the last anchor read
  /// (to its end), then the segments after it, moved by the same drift (nil `last`: from the first segment, unmoved).
  /// Nil when the anchor's segment isn't one of `segments` (or there are none).
  static func reanchorPlan(last: BackingAnchor?, segments: [BackingSegmentPlan], rate: Double, sampleRate: Double) -> BackingReanchor? {
    let k = last?.segment ?? 0
    guard k >= 0, k < segments.count, sampleRate > 0 else { return nil }
    let s = segments[k]
    let r = clampRate(rate)
    func endMs(_ f: BackingSegmentPlan) -> Double { return Double(f.startFrame + f.frameCount) * 1000 / sampleRate }
    var shift = 0.0
    var start = BackingStartRequest(at: s.heardAtMs, offsetMs: s.fileStartMs, rate: r)
    if let a = last {
      shift = a.at - (s.heardAtMs + (a.fileMs - s.fileStartMs) / r)
      start = BackingStartRequest(at: a.at, offsetMs: a.fileMs, rate: r)
    }
    start.durationMs = endMs(s) - start.offsetMs
    let queue = segments[(k + 1)...].map { f in
      BackingQueueRequest(at: f.heardAtMs + shift, offsetMs: f.fileStartMs, durationMs: endMs(f) - f.fileStartMs)
    }
    return BackingReanchor(start: start, queue: Array(queue))
  }

  /// A local file to play: a file:// URI or an absolute path; anything else (http, YouTube, content://) is refused.
  static func filePath(_ uri: String) -> String? {
    let s = uri.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("/") { return s }
    guard s.lowercased().hasPrefix("file://") else { return nil }
    var rest = String(s.dropFirst("file://".count))
    if !rest.hasPrefix("/"), rest.lowercased().hasPrefix("localhost/") { rest = String(rest.dropFirst("localhost".count)) }
    guard rest.hasPrefix("/") else { return nil }
    return rest.removingPercentEncoding
  }

  static func driftMs(_ req: BackingStartRequest, _ a: BackingAnchor) -> Double {
    return a.at - expectedHeardMs(req, fileMs: a.fileMs)
  }

  /// The web's smoothing (player.ts): factor 0.1; a reading of 50 ms or more is ignored.
  static func smoothDrift(previous: Double, reading: Double) -> Double {
    return abs(reading) < 50 ? previous + (reading - previous) * 0.1 : previous
  }
}

/// The debug screen's test tone (the "Backing" card): a sine blip on every beat (880 Hz on bar 1 of each 4-bar
/// phrase, 660 Hz on other downbeats, 440 Hz on the other beats), 60 ms, 1 ms attack, so the owner hears it against
/// the click. Beat k starts at frame round(k × 60 / bpm × rate), computed per beat, never accumulated. Rendered in
/// chunks so a 2-minute file never sits in memory.
enum TestTone {
  static let blipSeconds = 0.06
  static let attackSeconds = 0.001
  static let peak: Float = 0.5

  static func beatFrame(_ k: Int, bpm: Double, sampleRate: Double) -> Int {
    return Int((Double(k) * 60 / bpm * sampleRate).rounded())
  }

  /// Total frames: whole 4-bar phrases covering at least `seconds`.
  static func frameCount(bpm: Double, beatsPerBar: Int, seconds: Double, sampleRate: Double) -> Int {
    let phraseBeats = 4 * max(1, beatsPerBar)
    let phraseSeconds = Double(phraseBeats) * 60 / bpm
    let phrases = max(1, Int((seconds / phraseSeconds).rounded(.up)))
    return beatFrame(phrases * phraseBeats, bpm: bpm, sampleRate: sampleRate)
  }

  static func frequency(beat k: Int, beatsPerBar: Int) -> Double {
    let bpb = max(1, beatsPerBar)
    if k % (4 * bpb) == 0 { return 880 }
    return k % bpb == 0 ? 660 : 440
  }

  /// Frames [from, from + count) of the tone.
  static func render(bpm: Double, beatsPerBar: Int, sampleRate: Double, from: Int, count: Int) -> [Float] {
    var out = [Float](repeating: 0, count: max(0, count))
    guard bpm > 0, sampleRate > 0, count > 0 else { return out }
    let blip = Int(blipSeconds * sampleRate)
    let attack = max(1, Int(attackSeconds * sampleRate))
    let beatFrames = 60 / bpm * sampleRate
    var k = max(0, Int(((Double(from - blip)) / beatFrames).rounded(.down)))
    while true {
      let start = beatFrame(k, bpm: bpm, sampleRate: sampleRate)
      if start >= from + count { break }
      let f = frequency(beat: k, beatsPerBar: beatsPerBar)
      let lo = max(start, from), hi = min(start + blip, from + count)
      if lo < hi {
        for i in lo..<hi {
          let n = i - start
          let t = Double(n) / sampleRate
          let env = n < attack ? Double(n) / Double(attack) : exp(-(t - attackSeconds) / 0.015)
          out[i - from] += peak * Float(env * sin(2 * Double.pi * f * t))
        }
      }
      k += 1
    }
    return out
  }
}
