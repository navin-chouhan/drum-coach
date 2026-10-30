import CoreMIDI
import Foundation

/// CoreMIDI input for one selected source. Forwards each packet's MIDI 1.0 bytes with its host timestamp (to the
/// PacketBatcher, which sends them to JS in batches) and does nothing else: note/velocity semantics, channels,
/// filtering and framing are TypeScript's.
///
/// Selection (InputSelection, mirrored in src/selection.ts): an explicit `select` wins, by unique ID or else by name
/// (a replugged device can come back with a new ID); with nothing selected, `setPreferredNames` auto-selects the
/// first online source whose name starts with a preferred name, on start, on every setup change and after a replug.
///
/// Threads: `listInputs`/`select`/`resync` come from the JS thread, the notify block from CoreMIDI, the receive block
/// from CoreMIDI's high-priority MIDI thread. All mutable state is touched only on `stateQueue`; the receive block
/// only reads the packet it is given and bumps a locked counter.
final class MidiInputHub {
  /// One packet: bytes, hostTimeMs (packet timestamp, or the receive time when the packet says 0 = "now"),
  /// nativeReceivedMs. Called on CoreMIDI's MIDI thread.
  var onPacket: (([Int], Double, Double) -> Void)?
  /// inputs (as listInputs), selection (as selection()).
  var onInputsChanged: (([[String: Any]], [String: Any]) -> Void)?

  private let stateQueue = DispatchQueue(label: "drumcoach.midi.state")
  private var client = MIDIClientRef()
  private var inputPort = MIDIPortRef()
  private var started = false

  /// Every source seen this session, by unique ID, so a source that disappears is listed as offline.
  private var known: [Int32: Source] = [:]
  private var selectedID: Int32?
  private var selectedName: String?
  private var connected = MIDIEndpointRef() // 0 = none
  private var connectedID: Int32?
  private var preferredNames: [String] = []
  /// Auto-select by preferredNames when nothing is selected. Off after select(nil), on after setPreferredNames.
  private var autoSelect = false

  // Debug counters (M4: connect/disconnect must not pile up).
  private var connectCalls = 0
  private var disconnectCalls = 0
  private var setupNotifications = 0
  private var lastError: OSStatus = noErr
  private let packetLock = NSLock()
  private var packetsReceived = 0
  private var zeroTimestampPackets = 0

  struct Source {
    var endpoint: MIDIEndpointRef
    var uniqueID: Int32
    var name: String
    var manufacturer: String
    var online: Bool

    var dictionary: [String: Any] {
      ["id": String(uniqueID), "name": name, "manufacturer": manufacturer, "online": online]
    }
  }

  // MARK: - Setup

  /// Creates the client and input port once. The client is created on the main thread: CoreMIDI delivers
  /// notifications for clients made with a callback on the run loop that created them, and the main run loop always
  /// runs. (With a block it may use its own thread; creating on main is safe either way.)
  private func startIfNeeded() throws {
    if stateQueue.sync(execute: { started }) { return }
    var status: OSStatus = noErr
    let create = {
      status = MIDIClientCreateWithBlock("DrumCoach" as CFString, &self.client) { [weak self] notification in
        self?.handleNotification(notification)
      }
      guard status == noErr else { return }
      // MIDI 1.0 protocol: CoreMIDI hands us UMP words that each carry one MIDI 1.0 message (see UmpUnpack).
      status = MIDIInputPortCreateWithProtocol(self.client, "DrumCoach In" as CFString, ._1_0, &self.inputPort) { [weak self] eventList, _ in
        self?.receive(eventList)
      }
    }
    // If the app hangs at start (main waiting on JS while JS waits here): docs/mobile/GATE0.md §5.1, fallback A/B.
    if Thread.isMainThread { create() } else { DispatchQueue.main.sync(execute: create) }
    guard status == noErr else {
      throw MidiError(status: status, what: "creating the CoreMIDI client/port")
    }
    stateQueue.sync {
      started = true
      _ = refreshLocked()
      reconcileLocked()
    }
  }

  func shutdown() {
    stateQueue.sync {
      disconnectLocked()
      if inputPort != 0 { MIDIPortDispose(inputPort); inputPort = 0 }
      if client != 0 { MIDIClientDispose(client); client = 0 }
      started = false
    }
  }

  // MARK: - JS API

  func listInputs() throws -> [[String: Any]] {
    try startIfNeeded()
    return stateQueue.sync { refreshLocked().map { $0.dictionary } }
  }

  /// Selects a source by unique ID (the `id` from listInputs), or none with nil. Idempotent: selecting the source
  /// that is already connected changes nothing. None (or an id that isn't a number) also turns auto-select off
  /// until the next setPreferredNames. Returns whether a source is connected afterwards.
  func select(id: String?) throws -> Bool {
    try startIfNeeded()
    return stateQueue.sync {
      if let id = id, let uid = Int32(id) {
        selectedID = uid
        selectedName = known[uid]?.name
      } else {
        selectedID = nil
        selectedName = nil
        autoSelect = false
      }
      _ = refreshLocked()
      reconcileLocked()
      return connected != 0
    }
  }

  /// Auto-select: with nothing selected, connect the first online source whose name starts with one of `names`
  /// (case-insensitive, in order), now and whenever one appears. An empty list turns auto-select off. Emits
  /// onInputsChanged so JS learns the selection. Returns whether a source is connected afterwards.
  func setPreferredNames(_ names: [String]) throws -> Bool {
    try startIfNeeded()
    return stateQueue.sync {
      preferredNames = InputSelection.cleanPreferredNames(names)
      autoSelect = !preferredNames.isEmpty
      _ = refreshLocked()
      reconcileLocked()
      emitInputsLocked()
      return connected != 0
    }
  }

  /// selectedId, selectedName, connectedId ("" = none), preferredNames, autoSelect.
  func selection() -> [String: Any] {
    return stateQueue.sync { selectionLocked() }
  }

  /// Re-lists and reconnects the selected source if needed (app back in the foreground). Idempotent.
  func resync() {
    guard stateQueue.sync(execute: { started }) else { return }
    stateQueue.async {
      _ = self.refreshLocked()
      self.reconcileLocked()
      self.emitInputsLocked()
    }
  }

  func setNetworkSessionEnabled(_ enabled: Bool) -> Bool {
    let session = MIDINetworkSession.default()
    // Policy first: with the default (no one), a Mac sees the iPad in Audio MIDI Setup but cannot connect.
    session.connectionPolicy = enabled ? .anyone : .noOne
    session.isEnabled = enabled
    resync() // the session's source appears or goes away
    return session.isEnabled
  }

  func debugInfo() -> [String: Any] {
    packetLock.lock()
    let packets = packetsReceived, zeroTs = zeroTimestampPackets
    packetLock.unlock()
    return stateQueue.sync { () -> [String: Any] in
      let info: [String: Any] = [
        "started": started,
        "connectCalls": connectCalls,
        "disconnectCalls": disconnectCalls,
        "setupNotifications": setupNotifications,
        "connected": connected != 0,
        "connectedName": connectedID.flatMap { known[$0]?.name } ?? (connected != 0 ? "?" : ""),
        "selectedId": selectedID.map { String($0) } ?? "",
        "selectedName": selectedName ?? "",
        "connectedId": connectedID.map { String($0) } ?? "",
        "preferredNames": preferredNames,
        "autoSelect": autoSelect,
        "packetsReceived": packets,
        "zeroTimestampPackets": zeroTs,
        "lastError": Int(lastError),
        "networkSessionEnabled": MIDINetworkSession.default().isEnabled,
        "networkSessionName": MIDINetworkSession.default().networkName,
        "timebase": HostClock.timebaseDescription,
      ]
      return info
    }
  }

  // MARK: - Hot-plug

  private func handleNotification(_ notification: UnsafePointer<MIDINotification>) {
    switch notification.pointee.messageID {
    case .msgSetupChanged, .msgObjectAdded, .msgObjectRemoved, .msgPropertyChanged:
      stateQueue.async {
        self.setupNotifications += 1
        _ = self.refreshLocked()
        self.reconcileLocked()
        self.emitInputsLocked()
      }
    default:
      break
    }
  }

  private func emitInputsLocked() {
    let list = known.values.sorted { $0.name < $1.name }.map { $0.dictionary }
    // sendEvent only schedules onto the JS runtime: safe to call here, and keeps the order
    onInputsChanged?(list, selectionLocked())
  }

  private func selectionLocked() -> [String: Any] {
    return [
      "selectedId": selectedID.map { String($0) } ?? "",
      "selectedName": selectedName ?? "",
      "connectedId": connectedID.map { String($0) } ?? "",
      "preferredNames": preferredNames,
      "autoSelect": autoSelect,
    ]
  }

  /// Re-reads the present sources; anything known but no longer present (or flagged offline) is offline.
  private func refreshLocked() -> [Source] {
    var present = Set<Int32>()
    let count = MIDIGetNumberOfSources()
    for i in 0..<count {
      let ep = MIDIGetSource(i)
      guard ep != 0 else { continue }
      let uid = intProperty(ep, kMIDIPropertyUniqueID)
      let source = Source(
        endpoint: ep,
        uniqueID: uid,
        name: stringProperty(ep, kMIDIPropertyDisplayName) ?? stringProperty(ep, kMIDIPropertyName) ?? "MIDI \(uid)",
        manufacturer: stringProperty(ep, kMIDIPropertyManufacturer) ?? "",
        online: intProperty(ep, kMIDIPropertyOffline) == 0
      )
      known[uid] = source
      present.insert(uid)
    }
    for uid in known.keys where !present.contains(uid) {
      known[uid]?.online = false
    }
    return known.values.sorted { $0.name < $1.name }
  }

  /// Connects exactly the source InputSelection picks (the selected one by unique ID, else by name; else, with
  /// nothing selected, the first preferred one), and nothing else. The connected source becomes the selection.
  private func reconcileLocked() {
    let candidates = known.values.map { InputSelection.Candidate(uniqueID: $0.uniqueID, name: $0.name, online: $0.online) }
    let targetID = InputSelection.target(
      candidates, selectedID: selectedID, selectedName: selectedName, preferredNames: preferredNames, autoSelect: autoSelect)
    guard let uid = targetID, let source = known[uid] else {
      disconnectLocked()
      return
    }
    if source.endpoint == connected { return } // idempotent: already listening, no second connection
    disconnectLocked()
    let status = MIDIPortConnectSource(inputPort, source.endpoint, nil)
    connectCalls += 1
    if status == noErr {
      connected = source.endpoint
      connectedID = source.uniqueID
      selectedID = source.uniqueID
      selectedName = source.name
    } else {
      lastError = status
    }
  }

  private func disconnectLocked() {
    guard connected != 0 else { return }
    let status = MIDIPortDisconnectSource(inputPort, connected) // fails harmlessly if the device is already gone
    disconnectCalls += 1
    if status != noErr { lastError = status }
    connected = 0
    connectedID = nil
  }

  // MARK: - Receive (CoreMIDI's MIDI thread)

  private func receive(_ eventList: UnsafePointer<MIDIEventList>) {
    let receivedTicks = mach_absolute_time()
    let receivedMs = HostClock.ticksToMs(receivedTicks)
    let wordsOffset = MemoryLayout<MIDIEventPacket>.offset(of: \MIDIEventPacket.words)!
    var zeroTs = 0, packets = 0
    for packet in eventList.unsafeSequence() {
      packets += 1
      let wordCount = Int(packet.pointee.wordCount)
      // Read the words from the packet in place: a packet can be longer than the 64-word tuple.
      let wordsPtr = UnsafeRawPointer(packet).advanced(by: wordsOffset).assumingMemoryBound(to: UInt32.self)
      var bytes: [Int] = []
      bytes.reserveCapacity(wordCount * 3)
      UmpUnpack.append(UnsafeBufferPointer(start: wordsPtr, count: wordCount), to: &bytes)
      guard !bytes.isEmpty else { continue }
      let ts = packet.pointee.timeStamp
      if ts == 0 { zeroTs += 1 }
      onPacket?(bytes, HostClock.packetMs(timeStamp: ts, receivedMs: receivedMs), receivedMs) // 0 means "now"
    }
    packetLock.lock()
    packetsReceived += packets
    zeroTimestampPackets += zeroTs
    packetLock.unlock()
  }

  // MARK: - Properties

  private func intProperty(_ obj: MIDIObjectRef, _ key: CFString) -> Int32 {
    var value: Int32 = 0
    MIDIObjectGetIntegerProperty(obj, key, &value)
    return value
  }

  private func stringProperty(_ obj: MIDIObjectRef, _ key: CFString) -> String? {
    var value: Unmanaged<CFString>?
    guard MIDIObjectGetStringProperty(obj, key, &value) == noErr, let str = value?.takeRetainedValue() else { return nil }
    return str as String
  }
}

struct MidiError: Error, CustomStringConvertible {
  let status: OSStatus
  let what: String
  var description: String { "CoreMIDI error \(status) \(what)" }
}
