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
  static let hidRightArrow = 0x4F
  static let hidLeftArrow = 0x50
  static let hidDownArrow = 0x51
  static let hidUpArrow = 0x52

  /// "Escape", "Enter", " " (Space), "ArrowLeft" / "ArrowRight" / "ArrowUp" / "ArrowDown", or the key's character
  /// without modifiers, lower-cased ("s", "q", "h", "1"); "" for anything else (function keys and the like: their
  /// characters are UIKit's private-use strings). Which names are pads and which are commands is TypeScript's.
  static func name(hidUsage: Int, charactersIgnoringModifiers chars: String) -> String {
    switch hidUsage {
    case hidEscape: return "Escape"
    case hidReturn, hidKeypadEnter: return "Enter"
    case hidSpace: return " "
    case hidLeftArrow: return "ArrowLeft"
    case hidRightArrow: return "ArrowRight"
    case hidUpArrow: return "ArrowUp"
    case hidDownArrow: return "ArrowDown"
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

  /// Whether a text field that began editing still counts as being edited (QA2 m9): it must still exist, be in a
  /// window and be first responder. A field torn down without `textDidEndEditing` (a Modal closing with the keyboard
  /// up) no longer counts, so the catcher can take the keys back.
  static func stillEditing(alive: Bool, inWindow: Bool, firstResponder: Bool) -> Bool {
    return alive && inWindow && firstResponder
  }
}
