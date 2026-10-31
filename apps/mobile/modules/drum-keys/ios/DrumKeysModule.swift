import ExpoModulesCore

/// Drum Coach's hardware-keyboard module. JS name: "DrumKeys". iOS only.
///
/// Contract: native code forwards key down / up with the key's name ("s", "h", " ", "Escape", "Enter", "ArrowLeft"), its HID usage,
/// Shift and Option, and the press time on HostClock ms (mach host time, the same base as DrumMidi's nowMs(), so a
/// key stroke and a pad hit are directly comparable). The key map (CLAUDE.md keys) lives in TypeScript.
public final class DrumKeysModule: Module {
  private let catcher = KeyCatcher()

  public func definition() -> ModuleDefinition {
    Name("DrumKeys")

    Events("onKey")

    OnCreate {
      self.catcher.onKey = { [weak self] key, code, down, shift, alt, timeMs in
        self?.sendEvent("onKey", [
          "key": key, "code": code, "down": down, "shift": shift, "alt": alt,
          "timeMs": timeMs, "sentMs": HostClock.nowMs(),
        ])
      }
    }

    OnDestroy {
      self.catcher.shutdown()
    }

    OnAppEntersForeground {
      self.catcher.refocusSoon()
    }

    /// The one monotonic clock, ms (same as DrumMidi.nowMs).
    Function("nowMs") { () -> Double in
      return HostClock.nowMs()
    }

    /// On: the catcher takes hardware keys whenever no text field is being edited. Off: it lets go.
    Function("setEnabled") { (enabled: Bool) in
      self.catcher.setEnabled(enabled)
    }

    /// Takes the keys back now (after a modal or a route change). No-op while a text field is being edited.
    Function("refocus") {
      self.catcher.refocus()
    }

    Function("getDebugInfo") { () -> [String: Any] in
      return [
        "focused": self.catcher.focused,
        "keysSent": self.catcher.keysSent,
        "focusCalls": self.catcher.focusCalls,
        "timebase": HostClock.timebaseDescription,
      ]
    }
  }
}
