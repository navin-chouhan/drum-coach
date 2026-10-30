import Foundation

/// Events handed over by JS and not yet given to a player node: a mirror of `src/eventQueue.ts`. Change both
/// together; EventQueueTests.swift runs the same scenarios. Sorted by schedule time (ties keep insertion order).
/// Not thread-safe: the owner (AudioEngineHost) holds its lock around every call.
struct Queued<T> {
  var scheduleMs: Double
  var at: Double
  var item: T
}

struct InsertResult: Equatable {
  var accepted = 0
  var late = 0
  var dropped = 0
}

struct EventQueue<T> {
  private(set) var items: [Queued<T>] = []
  let policy: LoopPolicy

  init(policy: LoopPolicy = .standard) {
    self.policy = policy
  }

  var count: Int { items.count }

  var nextScheduleMs: Double? { items.first?.scheduleMs }

  /// Adds events (any order): late ones are counted and not kept; past maxPending the rest are dropped.
  mutating func insert(_ events: [Queued<T>], nowMs: Double, ioBufferMs: Double) -> InsertResult {
    var r = InsertResult()
    for e in events {
      if AudioPolicy.isLate(scheduleMs: e.scheduleMs, nowMs: nowMs, ioBufferMs: ioBufferMs, policy: policy) {
        r.late += 1
        continue
      }
      if items.count >= policy.maxPending {
        r.dropped += 1
        continue
      }
      items.insert(e, at: upperBound(e.scheduleMs))
      r.accepted += 1
    }
    return r
  }

  /// Removes and returns every event due at `nowMs`, earliest first.
  mutating func popDue(nowMs: Double) -> [Queued<T>] {
    var n = 0
    while n < items.count && AudioPolicy.isDue(scheduleMs: items[n].scheduleMs, nowMs: nowMs, policy: policy) { n += 1 }
    if n == 0 { return [] }
    let due = Array(items[0..<n])
    items.removeFirst(n)
    return due
  }

  /// Drops every waiting event heard at or after `fromMs` (nil = all). Returns how many.
  mutating func cancel(fromMs: Double?) -> Int {
    let before = items.count
    if let from = fromMs {
      items.removeAll { $0.at >= from }
    } else {
      items.removeAll()
    }
    return before - items.count
  }

  /// First index whose scheduleMs is greater than `ms`.
  private func upperBound(_ ms: Double) -> Int {
    var lo = 0, hi = items.count
    while lo < hi {
      let mid = (lo + hi) / 2
      if items[mid].scheduleMs <= ms { lo = mid + 1 } else { hi = mid }
    }
    return lo
  }
}
