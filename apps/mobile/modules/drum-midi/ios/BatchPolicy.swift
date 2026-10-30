import Foundation

/// The batching policy (B24) as pure functions: a line-by-line mirror of `src/batchPolicy.ts`, which holds the
/// rationale and the tests. Change both together; `Tests/BatchPolicyTests.swift` runs the same vectors.
///
/// A note-on (velocity > 0) flushes the batch at once; other non-realtime messages wait at most `maxWaitMs`;
/// realtime-only batches (clock, active sensing) at most `realtimeMaxWaitMs`; a batch never exceeds `maxPackets`.
/// Native code decides only *when* to send; framing and filtering stay in TypeScript.
enum PacketKind: String {
  case realtimeOnly
  case other
  case noteOn
}

enum FlushReason: String {
  case noteOn
  case full
  case deadline
}

struct BatchPolicy {
  var maxWaitMs: Double = 8
  var realtimeMaxWaitMs: Double = 33
  var maxPackets: Int = 128

  /// Classifies one packet's MIDI 1.0 bytes (see classifyPacket in src/batchPolicy.ts).
  static func classify(_ bytes: [Int]) -> PacketKind {
    var kind = PacketKind.realtimeOnly
    var status = 0 // running status (0 = none)
    var dataIndex = 0
    for raw in bytes {
      let b = raw & 0xFF
      if b >= 0xF8 { continue } // realtime: anywhere, changes nothing
      kind = .other
      if b >= 0x80 {
        status = b < 0xF0 ? b : 0 // system common/exclusive clears the running status
        dataIndex = 0
        continue
      }
      if status & 0xF0 != 0x90 { continue }
      dataIndex += 1
      if dataIndex == 2 {
        if b > 0 { return .noteOn }
        dataIndex = 0 // velocity 0 = note-off; running status may follow
      }
    }
    return kind
  }

  /// The longest a packet of this kind may wait in a batch, ms.
  func maxWait(_ kind: PacketKind) -> Double {
    switch kind {
    case .noteOn: return 0
    case .other: return maxWaitMs
    case .realtimeOnly: return realtimeMaxWaitMs
    }
  }

  /// The batch's deadline after adding a packet that reached native code at `arrivalMs` (current nil = empty batch).
  func nextDeadline(current: Double?, kind: PacketKind, arrivalMs: Double) -> Double {
    let own = arrivalMs + maxWait(kind)
    guard let current = current else { return own }
    return min(current, own)
  }

  /// Whether to send now: after adding a packet (`kind` = its kind) or when the timer fires (`kind` = nil).
  func flushReason(kind: PacketKind?, count: Int, deadlineMs: Double?, nowMs: Double) -> FlushReason? {
    if count <= 0 { return nil }
    if kind == .noteOn { return .noteOn }
    if count >= maxPackets { return .full }
    if let deadline = deadlineMs, deadline <= nowMs { return .deadline }
    return nil
  }
}
