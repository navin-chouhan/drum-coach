import Foundation

/// The catcher's debug counters (QA2 m9): written on the main thread, read by `getDebugInfo` on the JS thread, so
/// every access holds a lock. Unit-tested in Tests/KeyPressTests.swift.
final class DebugCounters {
  struct Snapshot: Equatable {
    var keysSent = 0
    var focusCalls = 0
    var focused = false
  }

  private let lock = NSLock()
  private var value = Snapshot()

  func keySent() {
    lock.lock(); defer { lock.unlock() }
    value.keysSent += 1
  }

  /// One focus attempt, and whether the catcher ended up first responder.
  func focusCall(focused: Bool) {
    lock.lock(); defer { lock.unlock() }
    value.focusCalls += 1
    value.focused = focused
  }

  func snapshot() -> Snapshot {
    lock.lock(); defer { lock.unlock() }
    return value
  }
}
