import ExpoModulesCore

/// Drum Coach Gate 0 module. JS name: "DrumMidi". iOS only.
///
/// Contract (docs/mobile/GATE0.md): native code forwards bytes and timestamps; framing, note/velocity semantics,
/// channels and filtering live in TypeScript. Every time is HostClock ms (mach host time), the same base as nowMs().
public final class DrumMidiModule: Module {
  private let hub = MidiInputHub()
  private let clicks = ClickScheduler()

  public func definition() -> ModuleDefinition {
    Name("DrumMidi")

    Events("onInputsChanged", "onMidi")

    OnCreate {
      self.hub.onMidi = { [weak self] bytes, hostTimeMs, nativeReceivedMs in
        self?.sendEvent("onMidi", [
          "bytes": bytes,
          "hostTimeMs": hostTimeMs,
          "nativeReceivedMs": nativeReceivedMs,
        ])
      }
      self.hub.onInputsChanged = { [weak self] inputs in
        self?.sendEvent("onInputsChanged", ["inputs": inputs])
      }
    }

    OnDestroy {
      self.clicks.stop()
      self.hub.shutdown()
    }

    // Back from the background: re-list and reconnect if needed. Idempotent, so no doubled hits (M4).
    OnAppEntersForeground {
      self.hub.resync()
    }

    /// The one monotonic clock, ms.
    Function("nowMs") { () -> Double in
      return HostClock.nowMs()
    }

    Function("listInputs") { () -> [[String: Any]] in
      return try self.hub.listInputs()
    }

    Function("select") { (id: String?) -> Bool in
      return try self.hub.select(id: id)
    }

    Function("setNetworkSessionEnabled") { (enabled: Bool) -> Bool in
      return self.hub.setNetworkSessionEnabled(enabled)
    }

    Function("getDebugInfo") { () -> [String: Any] in
      return self.hub.debugInfo()
    }

    Function("getAudioInfo") { () -> [String: Any] in
      return ClickScheduler.audioInfo()
    }

    AsyncFunction("scheduleClicks") { (startHostTimeMs: Double, bpm: Double, count: Int, accentEvery: Int) -> [String: Any] in
      return try self.clicks.schedule(startHostTimeMs: startHostTimeMs, bpm: bpm, count: count, accentEvery: accentEvery)
    }

    Function("stopClicks") {
      self.clicks.stop()
    }
  }
}
