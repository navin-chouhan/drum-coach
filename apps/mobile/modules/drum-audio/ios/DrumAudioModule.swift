import ExpoModulesCore

/// Drum Coach's audio module. JS name: "DrumAudio". iOS only. Design: docs/mobile/AUDIO-DESIGN.md.
///
/// Every time is HostClock ms (mach host time), the same base as DrumMidi's nowMs() and CoreMIDI timestamps. Times
/// handed in (`schedule`) are HEARD times; native subtracts the route's heardOffsetMs and the sound's onset.
/// apps/mobile/src/platform/audio.ts wraps this into core's AudioPort; events are packed by src/packing.ts.
public final class DrumAudioModule: Module {
  private let host = AudioEngineHost()

  public func definition() -> ModuleDefinition {
    Name("DrumAudio")

    Events("onRoute", "onInterruption")

    OnCreate {
      self.host.emitRoute = { [weak self] body in
        self?.sendEvent("onRoute", body)
      }
      self.host.emitInterruption = { [weak self] body in
        self?.sendEvent("onInterruption", body)
      }
    }

    OnDestroy {
      self.host.shutdown()
    }

    // No background audio mode: the take ends and the engine stops (AUDIO-DESIGN §4).
    OnAppEntersBackground {
      self.host.enterBackground()
    }

    OnAppEntersForeground {
      self.host.enterForeground()
    }

    /// The one monotonic clock, ms (HostClock: the same code as DrumMidi's).
    Function("nowMs") { () -> Double in
      return HostClock.nowMs()
    }

    /// Session + engine + buffers; idempotent. Resolves with the AudioRoute (+ portType, uid).
    AsyncFunction("start") { () throws -> [String: Any] in
      return try self.host.start()
    }

    Function("suspend") {
      self.host.suspend()
    }

    /// The current AudioRoute, or {} before the first start().
    Function("route") { () -> [String: Any] in
      return self.host.routeInfo()
    }

    AsyncFunction("prepareWords") { (words: [String], promise: Promise) in
      self.host.prepareWords(words) { result in
        promise.resolve(result)
      }
    }

    /// Packed events (src/packing.ts): returns {accepted, late, dropped, invalid}.
    Function("schedule") { (packed: [Double]) -> [String: Any] in
      return self.host.schedule(packed)
    }

    Function("cancel") { (fromMs: Double?) in
      self.host.cancel(fromMs: fromMs)
    }

    /// Synchronous (JSI) so a touch reaches the engine without an async hop. Returns the estimated heard ms or NaN.
    Function("playNow") { (index: Int, gain: Double) -> Double in
      return self.host.playNow(index: index, gain: gain)
    }

    Function("setBusVolumes") { (volumes: [String: Double]) in
      self.host.setBusVolumes(volumes)
    }

    Function("stats") { () -> [String: Any] in
      return self.host.stats()
    }

    Function("debugInfo") { () -> [String: Any] in
      return self.host.debugInfo()
    }

    Function("startTimingProbe") { () -> Bool in
      return self.host.startTimingProbe()
    }

    Function("stopTimingProbe") { () -> [String: Any] in
      return self.host.stopTimingProbe()
    }

    // Backing audio (core's BackingPort; AUDIO-DESIGN §1.4). Local files only (file:// or a path): never YouTube audio.

    /// Opens the file and installs it on the backing bus. Resolves {durationMs, sampleRate, frames, channels}.
    AsyncFunction("backingLoad") { (uri: String) throws -> [String: Any] in
      return try self.host.backingLoad(uri)
    }

    /// Heard from Clock time `at`, `offsetMs` into the file, at `rate` (pitch kept). Returns the plan ({ok: true, …})
    /// or {ok: false, reason}.
    Function("backingStart") { (at: Double, offsetMs: Double, rate: Double) -> [String: Any] in
      return self.host.backingStart(at: at, offsetMs: offsetMs, rate: rate)
    }

    Function("backingStop") {
      self.host.backingStop()
    }

    /// {playing: true, at, fileMs} from the render clock, else {playing: false}.
    Function("backingAnchor") { () -> [String: Any] in
      return self.host.backingAnchor()
    }

    /// The audio debug screen's test tone: writes it to Caches and resolves its file:// URI.
    AsyncFunction("backingTestTone") { (bpm: Double, beatsPerBar: Int, seconds: Double) throws -> String in
      return try BackingPlayer.writeTestTone(bpm: bpm, beatsPerBar: beatsPerBar, seconds: seconds)
    }
  }
}
