import Foundation

/// Collects CoreMIDI packets and hands them to JS in batches (B24), following `BatchPolicy`: a note-on goes out at
/// once with everything before it, other messages within 8 ms, clock/active-sensing-only batches within 33 ms.
///
/// Threads: `add` runs on CoreMIDI's MIDI thread, the timer on `queue`, `debugInfo`/lifecycle marks on the JS or main
/// thread. All state is behind `lock`, and `emit` is called while holding it, so batches leave in packet order whichever
/// thread sends them. `emit` is the module's `sendEvent`, which only schedules onto the JS runtime (it never runs JS
/// here), so holding the lock across it is short and can't re-enter.
final class PacketBatcher {
  /// The `onPackets` event body: packets, sentMs, reason, foregroundAtMs, backgroundAtMs.
  var emit: (([String: Any?]) -> Void)?

  let policy: BatchPolicy
  /// A timer may fire a little before the deadline as converted to ms; this much early still counts as due.
  private let timerToleranceMs = 0.25

  private let lock = NSLock()
  private let queue = DispatchQueue(label: "drumcoach.midi.batch", qos: .userInteractive)
  private let timer: DispatchSourceTimer

  private var pending: [[String: Any]] = []
  private var oldestReceivedMs = 0.0
  private var deadlineMs: Double?
  /// When the timer is armed for the current batch (nil = not armed for it).
  private var timerDueMs: Double?

  // App lifecycle marks (HostClock ms, 0 = never), sent with every batch so TS can drop packets that were queued
  // while backgrounded (B25) without depending on the order of AppState events and MIDI events.
  private var foregroundAtMs = 0.0
  private var backgroundAtMs = 0.0

  // Stats for the debug screen.
  private var batches = 0
  private var batchedPackets = 0
  private var maxBatchPackets = 0
  private var lastHoldMs = 0.0
  private var maxHoldMs = 0.0
  private var flushes: [FlushReason: Int] = [:]

  init(policy: BatchPolicy = BatchPolicy()) {
    self.policy = policy
    timer = DispatchSource.makeTimerSource(flags: .strict, queue: queue)
    timer.setEventHandler { [weak self] in self?.timerFired() }
    timer.schedule(deadline: .distantFuture, repeating: .never)
    timer.resume()
  }

  deinit {
    timer.cancel()
  }

  /// One packet from the receive block. `nativeReceivedMs` is when the receive block ran (the packet's arrival).
  func add(bytes: [Int], hostTimeMs: Double, nativeReceivedMs: Double) {
    let kind = BatchPolicy.classify(bytes)
    lock.lock()
    defer { lock.unlock() }
    if pending.isEmpty { oldestReceivedMs = nativeReceivedMs }
    pending.append(["bytes": bytes, "hostTimeMs": hostTimeMs, "nativeReceivedMs": nativeReceivedMs])
    let deadline = policy.nextDeadline(current: deadlineMs, kind: kind, arrivalMs: nativeReceivedMs)
    deadlineMs = deadline
    let now = HostClock.nowMs()
    if let reason = policy.flushReason(kind: kind, count: pending.count, deadlineMs: deadline, nowMs: now) {
      flushLocked(reason, nowMs: now)
    } else if timerDueMs.map({ deadline < $0 }) ?? true {
      armLocked(dueMs: deadline, nowMs: now)
    }
  }

  func noteForeground() {
    lock.lock()
    foregroundAtMs = HostClock.nowMs()
    lock.unlock()
  }

  func noteBackground() {
    lock.lock()
    backgroundAtMs = HostClock.nowMs()
    lock.unlock()
  }

  /// Drops anything not yet sent (module teardown).
  func reset() {
    lock.lock()
    pending.removeAll()
    deadlineMs = nil
    timerDueMs = nil
    timer.schedule(deadline: .distantFuture, repeating: .never)
    lock.unlock()
  }

  func debugInfo() -> [String: Any] {
    lock.lock()
    defer { lock.unlock() }
    return [
      "batchPolicy": "noteOn 0 / other \(policy.maxWaitMs) / realtime \(policy.realtimeMaxWaitMs) ms, max \(policy.maxPackets)",
      "batches": batches,
      "batchedPackets": batchedPackets,
      "pendingPackets": pending.count,
      "maxBatchPackets": maxBatchPackets,
      "lastHoldMs": lastHoldMs,
      "maxHoldMs": maxHoldMs,
      "flushNoteOn": flushes[.noteOn] ?? 0,
      "flushDeadline": flushes[.deadline] ?? 0,
      "flushFull": flushes[.full] ?? 0,
      "foregroundAtMs": foregroundAtMs,
      "backgroundAtMs": backgroundAtMs,
    ]
  }

  // MARK: - Private (hold `lock`)

  private func timerFired() {
    lock.lock()
    defer { lock.unlock() }
    timerDueMs = nil
    guard !pending.isEmpty, let deadline = deadlineMs else { return } // a stale fire: that batch already left
    let now = HostClock.nowMs()
    if let reason = policy.flushReason(kind: nil, count: pending.count, deadlineMs: deadline, nowMs: now + timerToleranceMs) {
      flushLocked(reason, nowMs: now)
    } else {
      armLocked(dueMs: deadline, nowMs: now) // fired early: wait for the rest
    }
  }

  /// Arms the one timer for `dueMs` (replacing any earlier arming).
  private func armLocked(dueMs: Double, nowMs: Double) {
    timerDueMs = dueMs
    let delayNs = Int(max(0, dueMs - nowMs) * 1_000_000)
    timer.schedule(deadline: .now() + .nanoseconds(delayNs), repeating: .never, leeway: .microseconds(250))
  }

  private func flushLocked(_ reason: FlushReason, nowMs: Double) {
    let batch = pending
    pending = []
    pending.reserveCapacity(16)
    deadlineMs = nil
    timerDueMs = nil // a timer still armed for this batch finds nothing to send, or re-arms for the next batch
    batches += 1
    batchedPackets += batch.count
    maxBatchPackets = max(maxBatchPackets, batch.count)
    lastHoldMs = nowMs - oldestReceivedMs
    maxHoldMs = max(maxHoldMs, lastHoldMs)
    flushes[reason, default: 0] += 1
    let body: [String: Any?] = [
      "packets": batch,
      "sentMs": nowMs,
      "reason": reason.rawValue,
      "foregroundAtMs": foregroundAtMs,
      "backgroundAtMs": backgroundAtMs,
    ]
    emit?(body)
  }
}
