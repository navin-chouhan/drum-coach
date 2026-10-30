import ExpoModulesCore

/// Drum Coach's MIDI module (production, from the Gate 0 probe). JS name: "DrumMidi". iOS only.
///
/// Contract (docs/mobile/GATE0.md, apps/mobile/src/platform/contracts.ts `MidiPort`): native code forwards bytes and
/// timestamps; framing, note/velocity semantics, channels and filtering (clock and active sensing too) live in
/// TypeScript. Packets reach JS in batches (`onPackets`, see BatchPolicy). Every time is HostClock ms (mach host
/// time), the same base as nowMs().
public final class DrumMidiModule: Module {
  private let hub = MidiInputHub()
  private let batcher = PacketBatcher()
  private let clicks = ClickScheduler()

  public func definition() -> ModuleDefinition {
    Name("DrumMidi")

    Events("onInputsChanged", "onPackets")

    OnCreate {
      self.batcher.emit = { [weak self] body in
        self?.sendEvent("onPackets", body)
      }
      self.hub.onPacket = { [weak self] bytes, hostTimeMs, nativeReceivedMs in
        self?.batcher.add(bytes: bytes, hostTimeMs: hostTimeMs, nativeReceivedMs: nativeReceivedMs)
      }
      self.hub.onInputsChanged = { [weak self] inputs, selection in
        self?.sendEvent("onInputsChanged", ["inputs": inputs, "selection": selection])
      }
    }

    OnDestroy {
      self.clicks.stop()
      self.hub.shutdown()
      self.batcher.reset()
    }

    // Back from the background: mark the time (TS drops packets queued while backgrounded, B25), then re-list and
    // reconnect if needed. Idempotent, so no doubled hits (M4).
    OnAppEntersForeground {
      self.batcher.noteForeground()
      self.hub.resync()
    }

    OnAppEntersBackground {
      self.batcher.noteBackground()
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

    /// Auto-select by name prefix (e.g. ["e-Drum"]) when nothing is selected; [] turns it off.
    Function("setPreferredNames") { (names: [String]) -> Bool in
      return try self.hub.setPreferredNames(names)
    }

    Function("getSelection") { () -> [String: Any] in
      return self.hub.selection()
    }

    Function("setNetworkSessionEnabled") { (enabled: Bool) -> Bool in
      return self.hub.setNetworkSessionEnabled(enabled)
    }

    Function("getDebugInfo") { () -> [String: Any] in
      return self.hub.debugInfo().merging(self.batcher.debugInfo()) { _, batch in batch }
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
