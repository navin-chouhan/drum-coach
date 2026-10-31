import AVFoundation
import Foundation

/// The backing bus (AUDIO-DESIGN §1.4, §6): one local file the owner imported, played by an AVAudioPlayerNode through
/// an AVAudioUnitTimePitch (rate with pitch kept) into busBacking, which mixes it into the main mixer. CLAUDE.md: this
/// is never YouTube audio; only file:// URIs and paths are opened (BackingMath.filePath).
///
///   AVAudioFile ─scheduleSegment→ player ─(file format)→ timePitch ─(file format)→ busBacking (mixer: SRC to 48 kHz)
///
/// - Sample-rate conversion: the player and the time-pitch unit run at the file's rate (its processingFormat); the
///   backing mixer converts to the engine rate, as mixers do for any input. A file in a new format gets new nodes.
/// - Start: `scheduleSegment(startingFrame:)` from BackingMath.planStart, `prepare` (reads the first second), then
///   `play(at:)` at the plan's schedule time. At rate 1 the time-pitch unit is bypassed and the start is a host time,
///   exactly like the clicks. At other rates the player's node timeline runs at sampleRate × rate, but AVFoundation
///   turns host times into node time at sampleRate, so the start is given as a node sample time instead.
/// - Queue (seamless loops): further segments go on the same player with `scheduleSegment(at: nil)`, which plays them
///   right after the previous one, sample-accurate and through the same time-pitch unit, so a loop seam has no gap
///   (BackingMath.planQueue; a gap before one, e.g. a negative offset's lead, is an explicit player sample time).
///   `start` cuts what plays and drops what is queued; nothing else does.
/// - Anchor: `playerTime(forNodeTime: lastRenderTime)` = frames the player had rendered since `play(at:)` when the
///   latest render cycle began, at that cycle's host time; heard heardOffset (+ the time-pitch latency) later. That
///   timeline has no seams, so BackingMath.anchorInSegments maps it through the segment list. Core reads the anchor
///   from `tick` and corrects drift against it (the song is the master).
/// - Route and engine changes: `reanchorLine()` takes the line the file is on (the last anchor, which is what core has
///   corrected against) and the segments queued after it; `restart(on:)` puts them back with the new route's numbers.
///
/// Threads: start/stop/anchor come from the JS thread; graph changes (attach, detach, install) run on the host's
/// loopQueue. Everything here is under `lock`. Lock order: the host's lock → this lock (never the other way). No
/// completion handlers (stopping a node inside one can deadlock): the end of the file is found from the anchor.
final class BackingPlayer {
  private struct Playing {
    var request: BackingStartRequest
    var plan: BackingPlan
    var timing: BackingTiming
    var fileFrames: Int64
    var nodeTimeStart: Bool
    /// Every segment scheduled on the player since the start (the first is the plan's), in player-timeline order.
    var segments: [BackingSegmentPlan]
  }

  /// A file opened off the loop queue, installed on it.
  struct Opened {
    let file: AVAudioFile
    let url: URL
  }

  private let lock = NSLock()
  private weak var engine: AVAudioEngine?
  private weak var mixer: AVAudioMixerNode?
  private var player: AVAudioPlayerNode?
  private var pitch: AVAudioUnitTimePitch?
  private var nodesFormat: AVAudioFormat?
  private var file: AVAudioFile?
  private var fileURL: URL?
  private var playing: Playing?
  private var lastAnchor: BackingAnchor?

  // stats
  private var loads = 0
  private var starts = 0
  private var lateJoins = 0
  private var reanchors = 0
  private var nodeTimeStarts = 0
  private var queued = 0
  private var queueGaps = 0
  private var queueSkips = 0
  private var lastError: String?

  // MARK: - Graph (loopQueue)

  /// The host built a graph: remember its engine and backing mixer; the nodes of a loaded file are rebuilt in it.
  func attach(engine e: AVAudioEngine, mixer m: AVAudioMixerNode) {
    lock.lock()
    defer { lock.unlock() }
    engine = e
    mixer = m
    player = nil // the old nodes went with the old engine
    pitch = nil
    nodesFormat = nil
    playing = nil
    if let f = file { _ = buildNodesLocked(format: f.processingFormat) }
  }

  /// The host is tearing its graph down (media reset, rate change, shutdown). The loaded file is kept.
  func detach() {
    lock.lock()
    defer { lock.unlock() }
    player?.stop()
    playing = nil
    player = nil
    pitch = nil
    nodesFormat = nil
    engine = nil
    mixer = nil
  }

  /// player → timePitch → mixer at the file's format. Both new nodes are connected to each other before the time-pitch
  /// unit joins the (maybe running) mixer, the one kind of connection AVAudioEngine allows while running.
  private func buildNodesLocked(format: AVAudioFormat) -> Bool {
    if player != nil, pitch != nil, let f = nodesFormat, f == format { return true }
    removeNodesLocked()
    guard let e = engine, let m = mixer else { return false }
    let p = AVAudioPlayerNode()
    let tp = AVAudioUnitTimePitch()
    tp.rate = 1
    tp.pitch = 0
    tp.bypass = true
    e.attach(p)
    e.attach(tp)
    e.connect(p, to: tp, format: format)
    e.connect(tp, to: m, format: format)
    player = p
    pitch = tp
    nodesFormat = format
    return true
  }

  private func removeNodesLocked() {
    player?.stop()
    if let e = engine {
      if let p = player { e.detach(p) }
      if let tp = pitch { e.detach(tp) }
    }
    player = nil
    pitch = nil
    nodesFormat = nil
    playing = nil
  }

  // MARK: - Load

  /// Opens a local file (any thread). Throws for anything that isn't a readable mono or stereo local audio file.
  static func openFile(_ uri: String) throws -> Opened {
    guard let path = BackingMath.filePath(uri) else {
      throw DrumAudioError("backing: only local files (file:// or a path) play here")
    }
    let url = URL(fileURLWithPath: path)
    let f: AVAudioFile
    do {
      f = try AVAudioFile(forReading: url)
    } catch {
      throw DrumAudioError("backing: can't open \(url.lastPathComponent): \(error.localizedDescription)")
    }
    let format = f.processingFormat
    guard f.length > 0, format.sampleRate > 0 else { throw DrumAudioError("backing: \(url.lastPathComponent) has no audio") }
    guard format.channelCount >= 1, format.channelCount <= 2 else {
      throw DrumAudioError("backing: \(url.lastPathComponent) has \(format.channelCount) channels (mono or stereo only)")
    }
    return Opened(file: f, url: url)
  }

  /// Makes `o` the loaded file (loopQueue): stops what plays, rebuilds the nodes if the format changed.
  func install(_ o: Opened) -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    player?.stop()
    playing = nil
    lastAnchor = nil
    file = o.file
    fileURL = o.url
    loads += 1
    if engine != nil, !buildNodesLocked(format: o.file.processingFormat) { lastError = "backing: no graph for the file's format" }
    let format = o.file.processingFormat
    return [
      "durationMs": Double(o.file.length) / format.sampleRate * 1000,
      "sampleRate": format.sampleRate,
      "frames": Double(o.file.length),
      "channels": Int(format.channelCount),
    ]
  }

  // MARK: - Start / stop (JS thread)

  /// Plays the loaded file so `req.offsetMs` is heard at `req.at` (Clock ms), at `req.rate`. Returns what was planned
  /// ({ok: true, …}) or why not ({ok: false, reason}).
  func start(_ req: BackingStartRequest, timing: BackingTiming) -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    return startLocked(req, base: timing)
  }

  private func startLocked(_ req: BackingStartRequest, base: BackingTiming) -> [String: Any] {
    guard let f = file else { return failLocked("backing start() before load()") }
    guard let e = engine, e.isRunning, let p = player, let tp = pitch else { return failLocked("backing start() while the engine isn't running") }
    p.stop()
    playing = nil
    lastAnchor = nil
    let rate = BackingMath.clampRate(req.rate)
    let unity = BackingMath.isUnityRate(rate)
    tp.rate = Float(rate)
    tp.pitch = 0
    tp.bypass = unity
    var t = base
    t.pitchLatencyMs = unity ? 0 : max(0, tp.latency * 1000)
    let sampleRate = f.processingFormat.sampleRate
    let frames = f.length
    for attempt in 0..<2 {
      guard let plan = BackingMath.planStart(req, nowMs: HostClock.nowMs(), t, fileSampleRate: sampleRate, fileFrames: frames) else {
        return failLocked("backing: nothing left to play from there")
      }
      if attempt > 0 { p.stop() }
      let count = AVAudioFrameCount(min(plan.frameCount, Int64(UInt32.max)))
      var first = BackingMath.firstSegment(plan)
      first.frameCount = Int64(count)
      p.scheduleSegment(f, startingFrame: AVAudioFramePosition(plan.startFrame), frameCount: count, at: nil, completionHandler: nil)
      p.prepare(withFrameCount: min(count, AVAudioFrameCount(sampleRate)))
      // Reading the first second may take a while on a cold file: if the start is no longer placeable, plan again.
      if AudioPolicy.isLate(scheduleMs: plan.scheduleMs, nowMs: HostClock.nowMs(), ioBufferMs: t.ioBufferMs) {
        if attempt == 0 { continue }
        p.stop()
        return failLocked("backing: couldn't place the start (reading the file took too long)")
      }
      let (when, asNodeTime) = startTimeLocked(plan, player: p, engine: e, timing: t)
      p.play(at: when)
      playing = Playing(request: req, plan: plan, timing: t, fileFrames: frames, nodeTimeStart: asNodeTime, segments: [first])
      starts += 1
      if plan.joinedLateMs > 0 { lateJoins += 1 }
      if asNodeTime { nodeTimeStarts += 1 }
      return [
        "ok": true,
        "rate": plan.rate,
        "startFrame": Double(plan.startFrame),
        "frameCount": Double(count),
        "fileStartMs": plan.fileStartMs,
        "heardAtMs": plan.heardAtMs,
        "scheduleMs": plan.scheduleMs,
        "joinedLateMs": plan.joinedLateMs,
        "pitchLatencyMs": t.pitchLatencyMs,
        "nodeTime": asNodeTime,
      ]
    }
    return failLocked("backing: couldn't place the start")
  }

  /// A host time at rate 1. Otherwise a node sample time extrapolated at sampleRate × rate from the player's last
  /// render (falling back to the host time when the player has no usable render time yet).
  private func startTimeLocked(_ plan: BackingPlan, player p: AVAudioPlayerNode, engine e: AVAudioEngine, timing t: BackingTiming) -> (AVAudioTime, Bool) {
    let hostTime = AVAudioTime(hostTime: HostClock.msToTicks(plan.scheduleMs))
    if BackingMath.isUnityRate(plan.rate) { return (hostTime, false) }
    guard let last = p.lastRenderTime, last.isSampleTimeValid, last.sampleRate > 0 else { return (hostTime, false) }
    let playerHost: Double? = last.isHostTimeValid ? HostClock.ticksToMs(last.hostTime) : nil
    guard let host = BackingMath.renderHostMs(player: playerHost, output: Self.outputHostMs(e), ioBufferMs: t.ioBufferMs) else {
      return (hostTime, false)
    }
    let s = BackingMath.nodeSampleForHost(lastSampleTime: Double(last.sampleTime), lastHostMs: host, targetHostMs: plan.scheduleMs,
                                          sampleRate: last.sampleRate, rate: plan.rate)
    return (AVAudioTime(sampleTime: AVAudioFramePosition(s), atRate: last.sampleRate), true)
  }

  /// Queues `req` right after the last segment on the playing line, without cutting it (BackingMath.planQueue).
  /// Returns what was planned ({ok: true, …}) or why not ({ok: false, reason}).
  func queue(_ req: BackingQueueRequest) -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    return queueLocked(req)
  }

  private func queueLocked(_ req: BackingQueueRequest) -> [String: Any] {
    guard var pl = playing, let last = pl.segments.last else { return failLocked("backing queue() with nothing playing") }
    guard let f = file, let e = engine, e.isRunning, let p = player else { return failLocked("backing queue() while the engine isn't running") }
    let sampleRate = f.processingFormat.sampleRate
    guard let q = BackingMath.planQueue(req, lineHeardAtMs: pl.plan.heardAtMs, lineRate: pl.plan.rate, prevEnd: last.playerFrame + last.frameCount,
                                        nowMs: HostClock.nowMs(), pl.timing, fileSampleRate: sampleRate, fileFrames: pl.fileFrames) else {
      return failLocked("backing: nothing of the queued segment is left to play")
    }
    var seg = q.segment
    let count = AVAudioFrameCount(min(seg.frameCount, Int64(UInt32.max)))
    seg.frameCount = Int64(count)
    // nil: right after the previous segment, sample-accurate. A sample time: on the player's own timeline.
    let when: AVAudioTime? = q.explicitTime ? AVAudioTime(sampleTime: AVAudioFramePosition(seg.playerFrame), atRate: sampleRate) : nil
    p.scheduleSegment(f, startingFrame: AVAudioFramePosition(seg.startFrame), frameCount: count, at: when, completionHandler: nil)
    pl.segments.append(seg)
    playing = pl
    queued += 1
    if q.explicitTime { queueGaps += 1 }
    if q.skippedFrames > 1 { queueSkips += 1 }
    return [
      "ok": true,
      "playerFrame": Double(seg.playerFrame),
      "startFrame": Double(seg.startFrame),
      "frameCount": Double(seg.frameCount),
      "fileStartMs": seg.fileStartMs,
      "heardAtMs": seg.heardAtMs,
      "skippedFrames": Double(q.skippedFrames),
      "explicitTime": q.explicitTime,
      "segments": pl.segments.count,
    ]
  }

  func stop() {
    lock.lock()
    defer { lock.unlock() }
    player?.stop()
    playing = nil
    lastAnchor = nil
  }

  // MARK: - Anchor (JS thread)

  /// {playing: true, at, fileMs}: the file position heard at Clock time `at`, from the render clock; else
  /// {playing: false} (not started yet, ended, stopped, engine off).
  func anchor() -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    guard let a = anchorLocked() else { return ["playing": false] }
    return ["playing": true, "at": a.at, "fileMs": a.fileMs]
  }

  private func anchorLocked() -> BackingAnchor? {
    guard let pl = playing, let p = player, let e = engine, e.isRunning else { return nil }
    guard let nodeTime = p.lastRenderTime, nodeTime.isSampleTimeValid, let pt = p.playerTime(forNodeTime: nodeTime) else { return nil }
    let playerHost: Double? = nodeTime.isHostTimeValid ? HostClock.ticksToMs(nodeTime.hostTime) : nil
    guard let host = BackingMath.renderHostMs(player: playerHost, output: Self.outputHostMs(e), ioBufferMs: pl.timing.ioBufferMs) else { return nil }
    guard let a = BackingMath.anchorInSegments(pl.segments, playerSampleTime: Double(pt.sampleTime), playerSampleRate: pt.sampleRate, hostMs: host,
                                               heardOffsetMs: pl.timing.heardOffsetMs, pitchLatencyMs: pl.timing.pitchLatencyMs) else { return nil }
    lastAnchor = a
    return a
  }

  private static func outputHostMs(_ e: AVAudioEngine) -> Double? {
    guard let t = e.outputNode.lastRenderTime, t.isHostTimeValid else { return nil }
    return HostClock.ticksToMs(t.hostTime)
  }

  // MARK: - Re-anchoring (loopQueue)

  /// The line the file is on now and the segments queued after the one playing, or nil when nothing plays. Call
  /// before the route's numbers change (the engine may already have stopped: then the last anchor read, else the
  /// first segment's line).
  func reanchorLine() -> BackingReanchor? {
    lock.lock()
    defer { lock.unlock() }
    guard let pl = playing, let f = file else { return nil }
    return BackingMath.reanchorPlan(last: anchorLocked() ?? lastAnchor, segments: pl.segments, rate: pl.plan.rate,
                                    sampleRate: f.processingFormat.sampleRate)
  }

  /// Puts the file back on `line` with the new route's numbers (it joins late, so what is heard stays on the line),
  /// then queues the segments after it again. A start with nothing left (its segment ended meanwhile) moves on to the
  /// next segment.
  func restart(on line: BackingReanchor, timing: BackingTiming) {
    lock.lock()
    defer { lock.unlock() }
    reanchors += 1
    var start = line.start
    var rest = line.queue[...]
    while (startLocked(start, base: timing)["ok"] as? Bool) != true {
      guard let next = rest.first else { return }
      rest = rest.dropFirst()
      start = BackingStartRequest(at: next.at, offsetMs: next.offsetMs, rate: line.start.rate, durationMs: next.durationMs)
    }
    for q in rest { _ = queueLocked(q) }
  }

  // MARK: - Debug

  func debugInfo() -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    var d: [String: Any] = [
      "loaded": file != nil,
      "file": fileURL?.lastPathComponent ?? "",
      "playing": playing != nil,
      "loads": loads,
      "starts": starts,
      "lateJoins": lateJoins,
      "reanchors": reanchors,
      "nodeTimeStarts": nodeTimeStarts,
      "queued": queued,
      "queueGaps": queueGaps,
      "queueSkips": queueSkips,
      "lastError": lastError ?? "",
    ]
    if let f = file {
      d["sampleRate"] = f.processingFormat.sampleRate
      d["channels"] = Int(f.processingFormat.channelCount)
      d["durationMs"] = Double(f.length) / f.processingFormat.sampleRate * 1000
    }
    if let pl = playing {
      d["rate"] = pl.plan.rate
      d["pitchLatencyMs"] = pl.timing.pitchLatencyMs
      d["heardOffsetMs"] = pl.timing.heardOffsetMs
      d["heardAtMs"] = pl.plan.heardAtMs
      d["fileStartMs"] = pl.plan.fileStartMs
      d["joinedLateMs"] = pl.plan.joinedLateMs
      d["nodeTimeStart"] = pl.nodeTimeStart
      d["segments"] = pl.segments.count
    }
    if let a = lastAnchor { d["lastAnchor"] = ["at": a.at, "fileMs": a.fileMs, "segment": a.segment] }
    return d
  }

  private func failLocked(_ reason: String) -> [String: Any] {
    lastError = reason
    return ["ok": false, "reason": reason]
  }

  // MARK: - Test tone (the debug screen's Backing card)

  /// Writes the 4-bar test tone (TestTone) for `seconds` or more at 44.1 kHz (so the sample-rate conversion runs) to
  /// Caches, and returns its file:// URI. 16-bit mono CAF, written in chunks.
  static func writeTestTone(bpm: Double, beatsPerBar: Int, seconds: Double) throws -> String {
    guard bpm.isFinite, bpm >= 20, bpm <= 400, beatsPerBar >= 1, beatsPerBar <= 16, seconds.isFinite, seconds > 0, seconds <= 600 else {
      throw DrumAudioError("backing test tone: bad parameters")
    }
    let rate = 44_100.0
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    let url = dir.appendingPathComponent("backing-test-\(Int((bpm * 100).rounded()))-\(beatsPerBar).caf")
    if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: rate,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
    ]
    let total = TestTone.frameCount(bpm: bpm, beatsPerBar: beatsPerBar, seconds: seconds, sampleRate: rate)
    let chunk = 65_536
    do {
      let out = try AVAudioFile(forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
      guard let buffer = AVAudioPCMBuffer(pcmFormat: out.processingFormat, frameCapacity: AVAudioFrameCount(chunk)),
            let ch = buffer.floatChannelData?[0] else {
        throw DrumAudioError("backing test tone: no buffer")
      }
      var from = 0
      while from < total {
        let n = min(chunk, total - from)
        let samples = TestTone.render(bpm: bpm, beatsPerBar: beatsPerBar, sampleRate: rate, from: from, count: n)
        for i in 0..<n { ch[i] = samples[i] }
        buffer.frameLength = AVAudioFrameCount(n)
        try out.write(from: buffer)
        from += n
      }
    } // `out` is closed when it goes out of scope
    return url.absoluteString
  }
}
