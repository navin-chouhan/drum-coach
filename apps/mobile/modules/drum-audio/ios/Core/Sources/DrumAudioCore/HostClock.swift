import Darwin
import Foundation

/// The one monotonic millisecond clock of the app: mach host time (`mach_absolute_time`) converted with
/// `mach_timebase_info`. CoreMIDI packet timestamps and `AVAudioTime(hostTime:)` use the same ticks, so MIDI hits
/// and scheduled clicks are directly comparable. On Apple silicon one tick is 125/3 ns, so ticks are NOT nanoseconds.
/// The clock does not advance while the device sleeps; that is fine because every time in the app comes from it.
///
/// A copy of apps/mobile/modules/drum-midi/ios/HostClock.swift (AUDIO-DESIGN §2.2: each module keeps its own). Both
/// read `mach_absolute_time()`, so they are the same clock by construction; the audio debug screen shows the two
/// modules' nowMs() side by side (CHECKS.md, clock check).
enum HostClock {
  private static let timebase: (numer: Double, denom: Double) = {
    var info = mach_timebase_info_data_t()
    mach_timebase_info(&info)
    return (Double(info.numer), Double(info.denom))
  }()

  static var timebaseDescription: String { "\(Int(timebase.numer))/\(Int(timebase.denom))" }

  static func ticksToMs(_ ticks: UInt64) -> Double {
    return ticksToMs(ticks, numer: timebase.numer, denom: timebase.denom)
  }

  static func msToTicks(_ ms: Double) -> UInt64 {
    return msToTicks(ms, numer: timebase.numer, denom: timebase.denom)
  }

  // MARK: - Pure conversions (unit-tested in Tests/DrumAudioCoreTests/HostClockTests.swift with fixed timebases)

  /// Ticks → ms for a given timebase (ns per tick = numer / denom).
  static func ticksToMs(_ ticks: UInt64, numer: Double, denom: Double) -> Double {
    return Double(ticks) * numer / denom / 1_000_000.0
  }

  /// ms → ticks for a given timebase; negative or zero ms give 0.
  static func msToTicks(_ ms: Double, numer: Double, denom: Double) -> UInt64 {
    let ticks = ms * 1_000_000.0 * denom / numer
    return ticks <= 0 ? 0 : UInt64(ticks.rounded())
  }

  /// A packet's time in ms: its CoreMIDI timestamp, or the receive time when the timestamp is 0 ("now").
  static func packetMs(timeStamp: UInt64, receivedMs: Double, numer: Double, denom: Double) -> Double {
    return timeStamp == 0 ? receivedMs : ticksToMs(timeStamp, numer: numer, denom: denom)
  }

  static func packetMs(timeStamp: UInt64, receivedMs: Double) -> Double {
    return packetMs(timeStamp: timeStamp, receivedMs: receivedMs, numer: timebase.numer, denom: timebase.denom)
  }

  static func nowMs() -> Double {
    return ticksToMs(mach_absolute_time())
  }
}
