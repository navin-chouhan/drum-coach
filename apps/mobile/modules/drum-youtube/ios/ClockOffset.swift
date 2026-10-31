import Foundation

/// Host clock − the page's performance.now(), from the player's own messages: each one carries `perf` (the page's
/// time when it was read) and arrives a little later. The arrival delay is never negative, so the smallest
/// (host − perf) over recent messages is the best estimate (the same idea as the DOM player's round trips, without
/// asking). A message's host time is then perf + offset: the song clock doesn't see the delivery delay. Pure.
struct ClockOffset {
  /// How many recent samples count (the page polls every 50 ms: about 10 s).
  let window: Int
  private var samples: [Double] = []

  init(window: Int = 200) {
    self.window = max(1, window)
  }

  /// The current estimate, or nil before the first sample.
  var value: Double? { samples.min() }

  /// Adds a sample (host ms at arrival, the page's perf ms) and returns the message's host time.
  mutating func stamp(hostMs: Double, perfMs: Double) -> Double {
    samples.append(hostMs - perfMs)
    if samples.count > window { samples.removeFirst(samples.count - window) }
    return perfMs + (value ?? (hostMs - perfMs))
  }

  /// A new page (a reload) has a new performance.now() origin: start over.
  mutating func reset() {
    samples.removeAll()
  }
}
