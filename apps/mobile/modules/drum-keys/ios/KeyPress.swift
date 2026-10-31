import Foundation

/// Pure helpers for a hardware key press (unit-tested in Tests/KeyPressTests.swift): its name as the web's
/// `KeyboardEvent.key` spells the keys the app uses, and its time on HostClock.
enum KeyPress {
  // USB HID usage IDs (UIKeyboardHIDUsage raw values).
  static let hidReturn = 0x28
  static let hidEscape = 0x29
  static let hidTab = 0x2B
  static let hidSpace = 0x2C
  static let hidKeypadEnter = 0x58

  /// "Escape", "Enter", " " (Space), or the key's character without modifiers, lower-cased ("s", "q"); "" for
  /// anything else (arrows, function keys: their characters are UIKit's private-use strings).
  static func name(hidUsage: Int, charactersIgnoringModifiers chars: String) -> String {
    switch hidUsage {
    case hidEscape: return "Escape"
    case hidReturn, hidKeypadEnter: return "Enter"
    case hidSpace: return " "
    default:
      guard chars.count == 1, let scalar = chars.unicodeScalars.first, scalar.value >= 0x20, scalar.value < 0xE000 else { return "" }
      return chars.lowercased()
    }
  }

  /// Keys the catcher never takes: Tab (focus moves) and anything with ⌘ or ⌃ (system and app shortcuts).
  static func passesThrough(hidUsage: Int, command: Bool, control: Bool) -> Bool {
    return command || control || hidUsage == hidTab
  }

  /// A press's time on HostClock, ms. UIPress.timestamp is seconds of system uptime (ProcessInfo.systemUptime's
  /// base), so its age is `uptimeNow - timestamp`; the press happened that long before `nowMs`. A zero, future or
  /// stale (> 1 s) timestamp gives `nowMs`.
  static func hostMs(pressTimestamp: Double, uptimeNow: Double, nowMs: Double) -> Double {
    let ageMs = (uptimeNow - pressTimestamp) * 1000.0
    if pressTimestamp <= 0 || ageMs < 0 || ageMs > 1000 { return nowMs }
    return nowMs - ageMs
  }
}
