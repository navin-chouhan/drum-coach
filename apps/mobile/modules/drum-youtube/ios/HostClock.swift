import Darwin
import Foundation

/// The one monotonic millisecond clock of the app: mach host time (`mach_absolute_time`) converted with
/// `mach_timebase_info`, the same base as DrumMidi's and DrumKeys' nowMs(), so a player event and a pad hit are
/// directly comparable. (Each module keeps its own small copy; the conversions are tested in DrumMidi.)
enum HostClock {
  private static let timebase: (numer: Double, denom: Double) = {
    var info = mach_timebase_info_data_t()
    mach_timebase_info(&info)
    return (Double(info.numer), Double(info.denom))
  }()

  static func nowMs() -> Double {
    return Double(mach_absolute_time()) * timebase.numer / timebase.denom / 1_000_000.0
  }
}
