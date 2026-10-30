import Darwin
import Foundation

/// The one monotonic millisecond clock of the app: mach host time (`mach_absolute_time`) converted with
/// `mach_timebase_info`. CoreMIDI packet timestamps and `AVAudioTime(hostTime:)` use the same ticks, so MIDI hits
/// and scheduled clicks are directly comparable. On Apple silicon one tick is 125/3 ns, so ticks are NOT nanoseconds.
/// The clock does not advance while the device sleeps; that is fine because every time in the app comes from it.
enum HostClock {
  private static let timebase: (numer: Double, denom: Double) = {
    var info = mach_timebase_info_data_t()
    mach_timebase_info(&info)
    return (Double(info.numer), Double(info.denom))
  }()

  static var timebaseDescription: String { "\(Int(timebase.numer))/\(Int(timebase.denom))" }

  static func ticksToMs(_ ticks: UInt64) -> Double {
    return Double(ticks) * timebase.numer / timebase.denom / 1_000_000.0
  }

  static func msToTicks(_ ms: Double) -> UInt64 {
    let ticks = ms * 1_000_000.0 * timebase.denom / timebase.numer
    return ticks <= 0 ? 0 : UInt64(ticks.rounded())
  }

  static func nowMs() -> Double {
    return ticksToMs(mach_absolute_time())
  }
}
