import AVFoundation
import Foundation

/// The iPad's audio (docs/mobile/AUDIO-DESIGN.md): one AVAudioEngine, a mixer per bus, a pool of AVAudioPlayerNodes per
/// bus, every sound a pre-rendered buffer scheduled with `scheduleBuffer(_:at: AVAudioTime(hostTime:))` on the mach
/// host clock that CoreMIDI timestamps use. JS hands events over seconds ahead; a 10 ms timer on `loopQueue` gives each
/// one to a player node once its schedule time is within 120 ms (LoopPolicy), so a stalled JS thread can't delay a click.
///
/// Threads:
/// - `loopQueue` (serial, userInteractive): start/suspend/restart, the timer, every session/engine notification. Session
///   calls (setCategory/setActive) and engine.start() run here WITHOUT `lock`, so a notification posted synchronously
///   from inside them can't deadlock (handlers only hop onto loopQueue).
/// - the JS thread: schedule, cancel, playNow, setBusVolumes, stats (all short, under `lock`).
/// - `wordsQueue`: prepareWords (blocking speech rendering).
/// - `lock` guards every field below marked (L). The render thread never touches any of it: there are no completion
///   handlers (Apple warns that stopping a node inside one can deadlock); node state is tracked by time instead.
final class AudioEngineHost {
  // MARK: - Types

  /// A queued event, turned into a buffer when it is handed over.
  private enum Pending {
    case sound(index: Int, step: Int)
    case band(part: BandPart, midi: [Int], durMs: Double, vel: Double)
  }

  /// A buffer handed to a node: kept until it has played, so cancel() can tell what it would cut and re-schedule
  /// what it keeps.
  private struct Handed {
    let startMs: Double
    let endMs: Double
    let at: Double
    let buffer: AVAudioPCMBuffer
  }

  private final class Voice {
    let node: AVAudioPlayerNode
    /// Schedule-time end of the last buffer on this node (AudioPolicy.pickVoice).
    var busyUntilMs: Double = 0
    var handed: [Handed] = []
    init(node: AVAudioPlayerNode) { self.node = node }
  }

  private struct Probe {
    var detector: OnsetDetector
    var onsetsMs: [Double] = []
    var scheduledMs: [Double] = []
    var tapBuffers = 0
    var noHostTime = 0
  }

  // MARK: - State

  private let lock = NSLock()
  private let loopQueue = DispatchQueue(label: "com.drumcoach.drum-audio.scheduler", qos: .userInteractive)
  private let wordsQueue = DispatchQueue(label: "com.drumcoach.drum-audio.words", qos: .userInitiated)
  private let policy = LoopPolicy.standard
  private let bank = SoundBank()
  private let words = WordRenderer()
  /// The backing bus's player (BackingPlayer.swift). Lock order: `lock` → the backing's own lock.
  private let backing = BackingPlayer()

  private var engine: AVAudioEngine? // (L)
  private var buses: [Bus: AVAudioMixerNode] = [:] // (L)
  private var pools: [Bus: [Voice]] = [:] // (L)
  private var monoFormat: AVAudioFormat? // (L)
  private var running = false // (L) engine started by us and not stopped since
  private var queue = EventQueue<Pending>() // (L)
  private var route: [String: Any] = [:] // (L) the AudioRoute dictionary ([:] before the first start)
  private var facts: RouteFacts? // (L)
  private var heardOffsetMs = 0.0 // (L)
  private var ioBufferMs = 0.0 // (L)
  /// The lowest `fromMs` of the cancels since the current tick popped its events (-inf = cancel all).
  private var cancelFloorMs: Double? // (L)
  private var volumes: [Bus: Double] = [.click: 0.8, .drums: 0.8, .band: 0.3, .voice: 1, .backing: 0.8] // (L)
  private var duck = 1.0 // (L)
  private var voiceIntervals: [(start: Double, end: Double)] = [] // (L)
  /// The timing probe has its own lock: the tap block takes only `probeLock`, so removeTap() can be called while
  /// holding `lock` without waiting on a tap block that waits on `lock`. Lock order: lock → probeLock.
  private let probeLock = NSLock()
  private var probe: Probe? // (probeLock)
  private var resumeAfterInterruption = false // (L) the engine was running when the interruption began
  private var isForeground = true // (L)
  private var timer: DispatchSourceTimer? // loopQueue only
  private var configObserver: NSObjectProtocol? // loopQueue only
  private var sessionObservers: [NSObjectProtocol] = []

  // stats (L)
  private var scheduled = 0
  private var late = 0
  private var dropped = 0
  private var invalid = 0
  private var cut = 0
  private var engineStarts = 0
  private var lastError: String?
  private var ticks = 0
  private var lastTickMs = 0.0
  private var maxTickGapMs = 0.0
  private var lastTickGapMs = 0.0

  /// Set by the module (sendEvent). Called on loopQueue, never under `lock`.
  var emitRoute: (([String: Any?]) -> Void)?
  var emitInterruption: (([String: Any?]) -> Void)?

  init() {
    let center = NotificationCenter.default
    let session = AVAudioSession.sharedInstance()
    // Each handler only hops onto loopQueue (routeChange is posted on a secondary thread, mediaServicesWereReset on main).
    sessionObservers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: nil) { [weak self] n in
      let reason = (n.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) ?? 0
      self?.loopQueue.async { self?.handleRouteChange(reason: reason) }
    })
    sessionObservers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: nil) { [weak self] n in
      let info = n.userInfo ?? [:]
      self?.loopQueue.async { self?.handleInterruption(info) }
    })
    sessionObservers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: session, queue: nil) { [weak self] _ in
      self?.loopQueue.async { self?.handleMediaReset() }
    })
  }

  deinit {
    sessionObservers.forEach { NotificationCenter.default.removeObserver($0) }
    if let o = configObserver { NotificationCenter.default.removeObserver(o) }
    timer?.cancel()
  }

  // MARK: - Start / suspend

  /// Activates the session and starts the engine (idempotent; also recovers after an interruption, a config change or
  /// a media reset). Returns the route. Blocks the caller (the module's async queue) until done.
  func start() throws -> [String: Any] {
    return try loopQueue.sync { try startOnQueue() }
  }

  private func startOnQueue() throws -> [String: Any] {
    dispatchPrecondition(condition: .onQueue(loopQueue))
    let session = AVAudioSession.sharedInstance()
    do {
      try Self.configure(session)
      try session.setActive(true)
    } catch {
      setError("session: \(error)")
      throw error
    }
    // Rates, latency and buffer are only true after activation.
    var rate = session.sampleRate
    lock.lock()
    if engine == nil { buildGraphLocked(sampleRate: rate) }
    if let e = engine {
      let hw = e.outputNode.outputFormat(forBus: 0).sampleRate
      if hw > 0 { rate = hw }
      if let f = monoFormat, abs(f.sampleRate - rate) > 0.5 {
        teardownLocked() // the hardware rate changed: rebuild at the new one
        buildGraphLocked(sampleRate: rate)
      }
    }
    let e = engine
    let wasRunning = running && (e?.isRunning ?? false)
    lock.unlock()
    guard let engine = e else { throw DrumAudioError("no engine") }
    do {
      try bank.prepare(sampleRate: rate)
    } catch {
      setError("\(error)")
      throw error
    }
    if !engine.isRunning {
      engine.prepare()
      do {
        try engine.start()
      } catch {
        setError("engine.start: \(error)")
        throw error
      }
    }
    let (info, newFacts) = Self.readRoute(session)
    lock.lock()
    if !wasRunning {
      for voices in pools.values { for v in voices { v.node.play() } }
      engineStarts += 1
    }
    let previous = facts
    route = info
    facts = newFacts
    heardOffsetMs = info["heardOffsetMs"] as? Double ?? 0
    ioBufferMs = info["ioBufferMs"] as? Double ?? 0
    running = true
    applyVolumesLocked()
    lock.unlock()
    startTimer()
    if let p = previous, !AudioPolicy.sameRoute(p, newFacts) { emitRoute?(Self.body(info)) }
    return info
  }

  /// `.playback` (Silent mode and screen lock don't mute us), mode default, mixable, a 5 ms IO buffer at 48 kHz,
  /// no interruption for banner-style calls (AUDIO-DESIGN §3.1). setCategory only when it differs, so start() doesn't
  /// post a category-change route event every time.
  private static func configure(_ s: AVAudioSession) throws {
    if s.category != .playback || s.mode != .default || s.categoryOptions != [.mixWithOthers] {
      try s.setCategory(.playback, mode: .default, options: [.mixWithOthers])
    }
    try s.setPreferredSampleRate(48_000)
    try s.setPreferredIOBufferDuration(0.005)
    try? s.setPrefersNoInterruptionsFromSystemAlerts(true)
  }

  /// Stops the engine (battery). Pending events are dropped. Sync for the JS side (later schedule() calls are dropped
  /// until start()); the engine stops on loopQueue.
  func suspend() {
    lock.lock()
    cancelLocked(fromMs: nil)
    backing.stop()
    running = false
    lock.unlock()
    loopQueue.async { self.stopEngineOnQueue(deactivate: true) }
  }

  private func stopEngineOnQueue(deactivate: Bool) {
    dispatchPrecondition(condition: .onQueue(loopQueue))
    stopTimer()
    lock.lock()
    let e = engine
    let isRunningNow = running
    lock.unlock()
    if isRunningNow { return } // a start() came in between
    e?.stop()
    if deactivate { try? AVAudioSession.sharedInstance().setActive(false) }
  }

  // MARK: - Graph

  private func buildGraphLocked(sampleRate: Double) {
    let e = AVAudioEngine()
    let out = e.outputNode.outputFormat(forBus: 0).sampleRate
    let rate = out > 0 ? out : sampleRate
    guard let mono = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1) else {
      lastError = "no mono format at \(rate) Hz"
      return
    }
    monoFormat = mono
    for bus in Bus.allCases {
      let mixer = AVAudioMixerNode()
      e.attach(mixer)
      e.connect(mixer, to: e.mainMixerNode, format: nil)
      buses[bus] = mixer
      // The backing bus has no pool: BackingPlayer owns its player node and AVAudioUnitTimePitch.
      let initial = bus == .backing ? 0 : AudioPolicy.pool(bus).initial
      pools[bus] = (0..<initial).map { _ in makeVoiceLocked(engine: e, mixer: mixer, format: mono) }
    }
    if let m = buses[.backing] { backing.attach(engine: e, mixer: m) }
    engine = e
    observeConfigChange(e)
  }

  private func makeVoiceLocked(engine e: AVAudioEngine, mixer: AVAudioMixerNode, format: AVAudioFormat) -> Voice {
    let node = AVAudioPlayerNode()
    e.attach(node)
    e.connect(node, to: mixer, format: format)
    return Voice(node: node)
  }

  private func teardownLocked() {
    probeLock.lock()
    let hadProbe = probe != nil
    probe = nil
    probeLock.unlock()
    if hadProbe { engine?.mainMixerNode.removeTap(onBus: 0) }
    backing.detach()
    for voices in pools.values { for v in voices { v.node.stop() } }
    engine?.stop()
    if let o = configObserver { NotificationCenter.default.removeObserver(o) }
    configObserver = nil
    engine = nil
    buses = [:]
    pools = [:]
    monoFormat = nil
    running = false
  }

  private func observeConfigChange(_ e: AVAudioEngine) {
    if let o = configObserver { NotificationCenter.default.removeObserver(o) }
    configObserver = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: e, queue: nil) { [weak self] _ in
      self?.loopQueue.async { self?.handleConfigChange() }
    }
  }

  // MARK: - The lookahead loop

  private func startTimer() {
    dispatchPrecondition(condition: .onQueue(loopQueue))
    if timer != nil { return }
    lock.lock()
    lastTickMs = 0 // the loop-gap stats start over with each run
    maxTickGapMs = 0
    lock.unlock()
    let t = DispatchSource.makeTimerSource(flags: [.strict], queue: loopQueue)
    t.schedule(deadline: .now(), repeating: .milliseconds(Int(policy.tickMs)), leeway: .milliseconds(1))
    t.setEventHandler { [weak self] in self?.tick() }
    t.resume()
    timer = t
  }

  private func stopTimer() {
    timer?.cancel()
    timer = nil
  }

  /// One loop pass: pop what's due (under the lock), render band notes (outside it), hand buffers to nodes (under it).
  private func tick() {
    let now = HostClock.nowMs()
    lock.lock()
    guard running else {
      lock.unlock()
      return
    }
    ticks += 1
    if lastTickMs > 0 {
      lastTickGapMs = now - lastTickMs
      maxTickGapMs = max(maxTickGapMs, lastTickGapMs)
    }
    lastTickMs = now
    updateDuckLocked(now: now)
    let due = queue.popDue(nowMs: now)
    cancelFloorMs = nil
    lock.unlock()
    if due.isEmpty { return }

    var ready: [(event: Queued<Pending>, buffer: AVAudioPCMBuffer, bus: Bus)] = []
    var missing = 0
    for e in due {
      switch e.item {
      case let .sound(index, step):
        if let b = bank.buffer(index, step: step), let bus = SoundTable.bus(ofSound: index) {
          ready.append((event: e, buffer: b, bus: bus))
        } else {
          missing += 1 // a word forgotten by a rate change
        }
      case let .band(part, midi, durMs, vel):
        let samples = Synth.bandNote(part: part, midi: midi, seconds: durMs / 1000, vel: vel, sampleRate: bank.sampleRate)
        if let b = bank.makeBuffer(samples) { ready.append((event: e, buffer: b, bus: .band)) }
      }
    }

    lock.lock()
    defer { lock.unlock() }
    dropped += missing
    guard running else {
      dropped += ready.count
      return
    }
    let floor = cancelFloorMs
    let handNow = HostClock.nowMs()
    for r in ready {
      if let f = floor, r.event.at >= f { continue } // cancelled while we rendered
      if AudioPolicy.isLate(scheduleMs: r.event.scheduleMs, nowMs: handNow, ioBufferMs: ioBufferMs, policy: policy) {
        late += 1
        continue
      }
      handOffLocked(r.buffer, bus: r.bus, startMs: r.event.scheduleMs, at: r.event.at, nowMs: handNow)
    }
  }

  /// Gives a buffer to a free node of its bus at host time `startMs` (nil time = "now" for playNow).
  @discardableResult
  private func handOffLocked(_ buffer: AVAudioPCMBuffer, bus: Bus, startMs: Double, at: Double, nowMs: Double, immediately: Bool = false) -> Bool {
    guard let e = engine, let mixer = buses[bus], let format = monoFormat else {
      dropped += 1
      return false
    }
    var voices = pools[bus] ?? []
    let durMs = Double(buffer.frameLength) / buffer.format.sampleRate * 1000
    let voice: Voice
    switch AudioPolicy.pickVoice(busyUntilMs: voices.map(\.busyUntilMs), startMs: immediately ? nowMs : startMs, cap: AudioPolicy.pool(bus).cap) {
    case let .use(i):
      voice = voices[i]
    case .grow:
      voice = makeVoiceLocked(engine: e, mixer: mixer, format: format)
      voice.node.play()
      voices.append(voice)
      pools[bus] = voices
    case .drop:
      dropped += 1
      return false
    }
    if immediately {
      voice.node.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
    } else {
      voice.node.scheduleBuffer(buffer, at: AVAudioTime(hostTime: HostClock.msToTicks(startMs)), options: [], completionHandler: nil)
    }
    voice.busyUntilMs = startMs + durMs
    voice.handed.removeAll { $0.endMs < nowMs }
    voice.handed.append(Handed(startMs: startMs, endMs: startMs + durMs, at: at, buffer: buffer))
    scheduled += 1
    if bus == .voice {
      voiceIntervals.append((start: startMs, end: startMs + durMs))
    }
    if bus == .click, !immediately {
      probeLock.lock()
      if let n = probe?.scheduledMs.count, n < 200_000 { probe?.scheduledMs.append(startMs) }
      probeLock.unlock()
    }
    return true
  }

  // MARK: - JS calls

  /// Takes packed events (src/packing.ts). Returns {accepted, late, dropped, invalid}.
  func schedule(_ packed: [Double]) -> [String: Any] {
    let (events, badRecords) = EventPacking.unpack(packed)
    var unknown = 0
    var silent = 0
    var items: [Queued<Pending>] = []
    items.reserveCapacity(events.count)
    lock.lock()
    guard running else {
      dropped += events.count
      invalid += badRecords
      lastError = "schedule() before start()"
      lock.unlock()
      return ["accepted": 0, "late": 0, "dropped": events.count, "invalid": badRecords]
    }
    let offset = heardOffsetMs
    lock.unlock()
    for e in events {
      switch e {
      case let .sound(at, index, gain):
        guard let bus = SoundTable.bus(ofSound: index), bank.has(index) else {
          unknown += 1
          continue
        }
        let step = AudioPolicy.gainStep(gain, stepsPerUnit: SoundBank.stepsPerUnit(bus))
        if step == 0 {
          silent += 1 // accepted: it plays silence
          continue
        }
        let s = AudioPolicy.scheduleTimeMs(atMs: at, heardOffsetMs: offset, onsetMs: bank.onset(index))
        items.append(Queued(scheduleMs: s, at: at, item: .sound(index: index, step: step)))
      case let .band(at, part, durMs, vel, midi):
        let s = AudioPolicy.scheduleTimeMs(atMs: at, heardOffsetMs: offset, onsetMs: 0)
        items.append(Queued(scheduleMs: s, at: at, item: .band(part: part, midi: midi, durMs: durMs, vel: vel)))
      }
    }
    lock.lock()
    let now = HostClock.nowMs()
    let r = queue.insert(items, nowMs: now, ioBufferMs: ioBufferMs)
    late += r.late
    dropped += r.dropped
    invalid += badRecords + unknown
    let soon = queue.nextScheduleMs.map { AudioPolicy.isDue(scheduleMs: $0, nowMs: now, policy: policy) } ?? false
    lock.unlock()
    if soon { loopQueue.async { self.tick() } } // don't wait up to a tick for something due within the window
    return ["accepted": r.accepted + silent, "late": r.late, "dropped": r.dropped, "invalid": badRecords + unknown]
  }

  /// Drops every event not yet sounding that is heard at or after `fromMs` (nil = all).
  func cancel(fromMs: Double?) {
    lock.lock()
    cancelLocked(fromMs: fromMs)
    lock.unlock()
  }

  /// A player node can't unschedule one buffer, only stop() (which drops all of them and cuts the one sounding). So a
  /// node with something to drop is stopped and the buffers it should keep are scheduled again. A sound ringing on
  /// such a node is cut (counted in `cut`); nodes with nothing to drop ring out. Within 120 ms of Stop this is rare.
  private func cancelLocked(fromMs: Double?) {
    _ = queue.cancel(fromMs: fromMs)
    let floor = fromMs ?? -Double.infinity
    cancelFloorMs = min(cancelFloorMs ?? floor, floor)
    let now = HostClock.nowMs()
    let minStart = now + ioBufferMs + policy.safetyMs
    for voices in pools.values {
      for v in voices {
        let drop = v.handed.filter { $0.endMs > now && $0.at >= floor && $0.startMs > now }
        if drop.isEmpty { continue }
        if v.handed.contains(where: { $0.startMs <= now && $0.endMs > now }) { cut += 1 }
        let keep = v.handed.filter { $0.startMs > now && $0.at < floor }
        v.node.stop()
        if running { v.node.play() }
        v.handed = []
        v.busyUntilMs = 0
        for h in keep {
          guard h.startMs >= minStart else {
            late += 1
            continue
          }
          v.node.scheduleBuffer(h.buffer, at: AVAudioTime(hostTime: HostClock.msToTicks(h.startMs)), options: [], completionHandler: nil)
          v.handed.append(h)
          v.busyUntilMs = max(v.busyUntilMs, h.endMs)
        }
      }
    }
    voiceIntervals.removeAll { $0.start >= floor || $0.end < now }
  }

  /// Touch pads: plays now on a free node (`at: nil`). Returns the estimated heard time (now + IO buffer + heard
  /// offset), or NaN if nothing played (engine not started, silent gain, unknown sound, pool full).
  func playNow(index: Int, gain: Double) -> Double {
    guard let bus = SoundTable.bus(ofSound: index) else { return .nan }
    let step = AudioPolicy.gainStep(gain, stepsPerUnit: SoundBank.stepsPerUnit(bus))
    guard let buffer = bank.buffer(index, step: step) else { return .nan }
    lock.lock()
    defer { lock.unlock() }
    guard running else {
      lastError = "playNow() before start()"
      return .nan
    }
    let now = HostClock.nowMs()
    let start = now + ioBufferMs
    guard handOffLocked(buffer, bus: bus, startMs: start, at: start + heardOffsetMs, nowMs: now, immediately: true) else { return .nan }
    return start + heardOffsetMs
  }

  /// Final bus volumes (src/platform/audioCore.ts scales the settings like the web does). Keys: click, drums, band,
  /// voice, backing.
  func setBusVolumes(_ v: [String: Double]) {
    lock.lock()
    defer { lock.unlock() }
    for (key, value) in v {
      guard let bus = Bus(rawValue: key), value.isFinite else { continue }
      volumes[bus] = min(max(value, 0), 2)
    }
    applyVolumesLocked()
  }

  private func applyVolumesLocked() {
    for (bus, mixer) in buses {
      let ducked = bus != .voice
      mixer.outputVolume = Float((volumes[bus] ?? 1) * (ducked ? duck : 1))
    }
  }

  /// While a voice-bus sound plays, the other buses dip to 45 % in 30 ms (the web's playVoice).
  private func updateDuckLocked(now: Double) {
    voiceIntervals.removeAll { $0.end < now }
    let talking = voiceIntervals.contains { $0.start <= now && now < $0.end }
    let next = AudioPolicy.duckStep(current: duck, target: talking ? AudioPolicy.duckLevel : 1, tickMs: policy.tickMs)
    if next != duck {
      duck = next
      applyVolumesLocked()
    }
  }

  func routeInfo() -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    return route
  }

  func stats() -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    var s: [String: Any] = ["scheduled": scheduled, "late": late, "dropped": dropped + invalid, "engineStarts": engineStarts]
    if let e = lastError { s["lastError"] = e }
    return s
  }

  func debugInfo() -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    var poolInfo: [String: Any] = [:]
    let now = HostClock.nowMs()
    for (bus, voices) in pools {
      poolInfo[bus.rawValue] = ["nodes": voices.count, "busy": voices.filter { $0.busyUntilMs > now }.count]
    }
    return [
      "running": running,
      "engineRunning": engine?.isRunning ?? false,
      "foreground": isForeground,
      "route": route,
      "heardOffsetBranch": AudioPolicy.heardOffsetBranch.rawValue,
      "heardOffsetMs": heardOffsetMs,
      "ioBufferMs": ioBufferMs,
      "sampleRate": bank.sampleRate,
      "pending": queue.count,
      "pools": poolInfo,
      "scheduled": scheduled,
      "late": late,
      "dropped": dropped,
      "invalid": invalid,
      "cut": cut,
      "engineStarts": engineStarts,
      "lastError": lastError ?? "",
      "ticks": ticks,
      "lastTickGapMs": lastTickGapMs,
      "maxTickGapMs": maxTickGapMs,
      "duck": duck,
      "words": bank.wordCount,
      "bufferBytes": bank.cachedBytes,
      "probe": probeActive,
      "timebase": HostClock.timebaseDescription,
      "loop": ["tickMs": policy.tickMs, "windowMs": policy.windowMs, "safetyMs": policy.safetyMs],
      "backing": backing.debugInfo(),
    ]
  }

  // MARK: - Backing (BackingPort, AUDIO-DESIGN §1.4)

  private func backingTimingLocked() -> BackingTiming {
    return BackingTiming(heardOffsetMs: heardOffsetMs, ioBufferMs: ioBufferMs, safetyMs: policy.safetyMs, pitchLatencyMs: 0)
  }

  /// Opens a local file (on the caller's queue) and installs it on the loop queue, where graph changes happen. Returns
  /// {durationMs, sampleRate, frames, channels}.
  func backingLoad(_ uri: String) throws -> [String: Any] {
    let opened: BackingPlayer.Opened
    do {
      opened = try BackingPlayer.openFile(uri)
    } catch {
      setError("\(error)")
      throw error
    }
    return loopQueue.sync { backing.install(opened) }
  }

  /// `durationMs`: ms of the line to play; NaN (or any non-finite value) = to the file's end.
  func backingStart(at: Double, offsetMs: Double, rate: Double, durationMs: Double) -> [String: Any] {
    lock.lock()
    let isRunning = running
    let timing = backingTimingLocked()
    if !isRunning { lastError = "backing start() before start()" }
    lock.unlock()
    guard isRunning else { return ["ok": false, "reason": "backing start() before start()"] }
    let length: Double? = durationMs.isFinite ? durationMs : nil
    return backing.start(BackingStartRequest(at: at, offsetMs: offsetMs, rate: rate, durationMs: length), timing: timing)
  }

  /// Queues a segment right after the last one on the playing line (seamless loops; BackingMath.planQueue).
  func backingQueue(at: Double, offsetMs: Double, durationMs: Double) -> [String: Any] {
    lock.lock()
    let isRunning = running
    lock.unlock()
    guard isRunning else { return ["ok": false, "reason": "backing queue() before start()"] }
    return backing.queue(BackingQueueRequest(at: at, offsetMs: offsetMs, durationMs: durationMs))
  }

  func backingStop() {
    backing.stop()
  }

  func backingAnchor() -> [String: Any] {
    return backing.anchor()
  }

  // MARK: - Words

  /// Renders words not yet ready, one by one, off the JS thread. Calls back with {ready: [{word, index, onsetMs}],
  /// missing: [word]}.
  func prepareWords(_ list: [String], done: @escaping ([String: Any]) -> Void) {
    wordsQueue.async {
      var ready: [[String: Any]] = []
      var missing: [String] = []
      var seen = Set<String>()
      let rate = self.bank.sampleRate > 0 ? self.bank.sampleRate : 48_000
      for raw in list {
        let key = SoundTable.wordKey(raw)
        guard !key.isEmpty, seen.insert(key).inserted else { continue }
        if let index = self.bank.wordIndexFor(key) {
          ready.append(["word": key, "index": index, "onsetMs": self.bank.onset(index)])
          continue
        }
        if self.bank.sampleRate == 0 { try? self.bank.prepare(sampleRate: rate) }
        if let samples = self.words.render(key, sampleRate: rate),
           let added = self.bank.addWord(key, samples: samples, rate: rate) {
          ready.append(["word": key, "index": added.index, "onsetMs": added.onsetMs])
        } else {
          missing.append(key)
        }
      }
      done(["ready": ready, "missing": missing])
    }
  }

  // MARK: - Timing probe (T6-8)

  /// Taps the main mixer and records click onsets (host ms) and the clicks handed over, until stopTimingProbe().
  func startTimingProbe() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard running, let e = engine, !probeActive else { return false }
    let mixer = e.mainMixerNode
    let rate = mixer.outputFormat(forBus: 0).sampleRate
    probeLock.lock()
    probe = Probe(detector: OnsetDetector(sampleRate: rate))
    probeLock.unlock()
    mixer.installTap(onBus: 0, bufferSize: 1024, format: nil) { [weak self] buffer, when in
      self?.probeTap(buffer, when)
    }
    return true
  }

  /// Runs on the tap's thread (not the render thread). Takes only probeLock.
  private func probeTap(_ buffer: AVAudioPCMBuffer, _ when: AVAudioTime) {
    guard let ch = buffer.floatChannelData?[0] else { return }
    let frames = Int(buffer.frameLength)
    let rate = buffer.format.sampleRate
    probeLock.lock()
    defer { probeLock.unlock() }
    guard var p = probe else { return }
    p.tapBuffers += 1
    let found = p.detector.process(UnsafeBufferPointer(start: ch, count: frames))
    if when.isHostTimeValid {
      let base = HostClock.ticksToMs(when.hostTime)
      for f in found where p.onsetsMs.count < 200_000 { p.onsetsMs.append(base + Double(f) / rate * 1000) }
    } else if !found.isEmpty {
      p.noHostTime += 1
    }
    probe = p
  }

  func stopTimingProbe() -> [String: Any] {
    lock.lock()
    probeLock.lock()
    let p = probe
    probe = nil
    probeLock.unlock()
    if p != nil { engine?.mainMixerNode.removeTap(onBus: 0) }
    lock.unlock()
    guard let r = p else {
      return ["onsetsMs": [Double](), "scheduledMs": [Double](), "sampleRate": 0.0, "tapBuffers": 0, "noHostTime": 0]
    }
    return ["onsetsMs": r.onsetsMs, "scheduledMs": r.scheduledMs, "sampleRate": r.detector.sampleRate,
            "tapBuffers": r.tapBuffers, "noHostTime": r.noHostTime]
  }

  private var probeActive: Bool {
    probeLock.lock()
    defer { probeLock.unlock() }
    return probe != nil
  }

  // MARK: - Lifecycle and notifications (loopQueue)

  /// Home, app switch, screen lock: the take ends (core), the engine stops (we have no background audio mode).
  func enterBackground() {
    loopQueue.async {
      self.lock.lock()
      self.isForeground = false
      let wasRunning = self.running
      self.cancelLocked(fromMs: nil)
      self.backing.stop()
      self.running = false
      self.lock.unlock()
      self.stopEngineOnQueue(deactivate: true)
      if wasRunning { self.emitInterruption?(["type": "engine-stopped", "at": HostClock.nowMs(), "cause": "background"]) }
    }
  }

  /// Nothing restarts here: the next start() does (AUDIO-DESIGN §4).
  func enterForeground() {
    loopQueue.async {
      self.lock.lock()
      self.isForeground = true
      self.lock.unlock()
    }
  }

  private func handleInterruption(_ info: [AnyHashable: Any]) {
    dispatchPrecondition(condition: .onQueue(loopQueue))
    guard let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
    let now = HostClock.nowMs()
    switch type {
    case .began:
      lock.lock()
      resumeAfterInterruption = running || resumeAfterInterruption
      cancelLocked(fromMs: nil)
      backing.stop() // never resumed on its own: the user presses Start
      running = false // the system stopped the engine
      lock.unlock()
      stopTimer()
      var body: [String: Any?] = ["type": "began", "at": now]
      if let r = info[AVAudioSessionInterruptionReasonKey] as? UInt { body["reason"] = Self.reasonName(r) }
      emitInterruption?(body)
    case .ended:
      let options = AVAudioSession.InterruptionOptions(rawValue: (info[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0)
      lock.lock()
      let restart = isForeground && resumeAfterInterruption
      resumeAfterInterruption = false
      lock.unlock()
      // Restart the engine (touch pads work again) if it was running; never resume a take (the user presses Start).
      // In the background, or if this fails, the next start() does it.
      if restart { _ = try? startOnQueue() }
      emitInterruption?(["type": "ended", "at": now, "shouldResume": options.contains(.shouldResume)])
    @unknown default:
      break
    }
  }

  private static func reasonName(_ raw: UInt) -> String {
    guard let r = AVAudioSession.InterruptionReason(rawValue: raw) else { return "raw \(raw)" }
    switch r {
    case .default: return "default"
    case .builtInMicMuted: return "builtInMicMuted"
    default: return "raw \(raw)"
    }
  }

  /// A route change (headphones, Bluetooth, USB audio…): cancel, re-read latency and buffer, tell JS (§3.3), and end a
  /// running take with `engine-stopped` / `route-change` (core keeps ≥ 2 whole bars, flagged); the app looks up this
  /// route's measured latency. If the format changed, the engine-config handler
  /// restarts the engine as well.
  private func handleRouteChange(reason: UInt) {
    dispatchPrecondition(condition: .onQueue(loopQueue))
    let (info, newFacts) = Self.readRoute(AVAudioSession.sharedInstance())
    lock.lock()
    let changed = facts.map { !AudioPolicy.sameRoute($0, newFacts) } ?? false
    // Every queued sound goes below: a running take can't go on (AUDIO-DESIGN §3.3/§4), so JS ends it as interrupted.
    let endsTake = AudioPolicy.routeChangeEndsTake(previous: facts, next: newFacts, running: running)
    let oldHeard = heardOffsetMs
    // The backing's line before the heard offset changes: what core has been correcting against.
    let line = changed && running ? backing.reanchorLine() : nil
    if changed {
      cancelLocked(fromMs: nil)
      route = info
      facts = newFacts
      heardOffsetMs = info["heardOffsetMs"] as? Double ?? 0
      ioBufferMs = info["ioBufferMs"] as? Double ?? 0
    }
    let timing = backingTimingLocked()
    lock.unlock()
    // Re-anchor: the file stays on its line under the new route's offset (if the format changed too, the engine has
    // stopped; the config-change handler restarts it and the backing then).
    if let l = line, abs(timing.heardOffsetMs - oldHeard) >= 0.5 { backing.restart(on: l, timing: timing) }
    if changed { emitRoute?(Self.body(info)) }
    if endsTake { emitInterruption?(["type": "engine-stopped", "at": HostClock.nowMs(), "cause": "route-change"]) }
  }

  /// The engine stopped and uninitialised itself (channel count or rate change). Restart it in the foreground.
  private func handleConfigChange() {
    dispatchPrecondition(condition: .onQueue(loopQueue))
    lock.lock()
    let wasRunning = running
    let foreground = isForeground
    cancelLocked(fromMs: nil)
    running = false
    // The engine has stopped: the line from the last anchor read (else the plan's).
    let line = wasRunning ? backing.reanchorLine() : nil
    lock.unlock()
    if !wasRunning { return }
    emitInterruption?(["type": "engine-stopped", "at": HostClock.nowMs(), "cause": "config-change"])
    stopTimer()
    if foreground {
      do {
        let info = try startOnQueue()
        if let l = line {
          lock.lock()
          let timing = backingTimingLocked()
          lock.unlock()
          backing.restart(on: l, timing: timing) // re-anchored on the new render clock
        }
        emitRoute?(Self.body(info))
      } catch {
        backing.stop()
        setError("restart after config change: \(error)")
      }
    } else {
      backing.stop()
    }
  }

  /// Media services were reset: everything is invalid. Rebuild lazily on the next start(); don't restart playback
  /// until the user acts (Apple's guidance).
  private func handleMediaReset() {
    dispatchPrecondition(condition: .onQueue(loopQueue))
    stopTimer()
    lock.lock()
    cancelLocked(fromMs: nil)
    teardownLocked()
    lock.unlock()
    emitInterruption?(["type": "engine-stopped", "at": HostClock.nowMs(), "cause": "media-reset"])
  }

  func shutdown() {
    loopQueue.sync {
      stopTimer()
      lock.lock()
      cancelLocked(fromMs: nil)
      teardownLocked()
      lock.unlock()
    }
  }

  // MARK: - Helpers

  private func setError(_ s: String) {
    lock.lock()
    lastError = s
    lock.unlock()
  }

  /// The AudioRoute (core/play/audioPort.ts) for the session's current output, plus portType and uid.
  static func readRoute(_ s: AVAudioSession) -> ([String: Any], RouteFacts) {
    let out = s.currentRoute.outputs.first
    let portType = out?.portType.rawValue ?? "None"
    let uid = out?.uid ?? ""
    let outputLatencyMs = s.outputLatency * 1000
    let ioBufferMs = s.ioBufferDuration * 1000
    let heard = AudioPolicy.heardOffsetMs(outputLatencyMs: outputLatencyMs, ioBufferMs: ioBufferMs)
    let key = AudioPolicy.routeKey(portType: portType, uid: uid)
    let info: [String: Any] = [
      "key": key,
      "kind": AudioPolicy.routeKind(portType: portType),
      "name": out?.portName ?? "No output",
      "outputLatencyMs": outputLatencyMs,
      "ioBufferMs": ioBufferMs,
      "sampleRate": s.sampleRate,
      "heardOffsetMs": heard,
      "minLeadMs": AudioPolicy.minLeadMs(ioBufferMs: ioBufferMs, heardOffsetMs: heard),
      "portType": portType,
      "uid": uid,
    ]
    return (info, RouteFacts(key: key, sampleRate: s.sampleRate, ioBufferMs: ioBufferMs, outputLatencyMs: outputLatencyMs))
  }

  private static func body(_ d: [String: Any]) -> [String: Any?] {
    return d.mapValues { Optional($0) }
  }
}
