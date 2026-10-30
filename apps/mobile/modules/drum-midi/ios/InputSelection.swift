import Foundation

/// Which source the hub connects to, as a pure function: a mirror of `src/selection.ts` (rules and tests there).
/// Change both together; `Tests/InputSelectionTests.swift` runs the same cases.
enum InputSelection {
  struct Candidate {
    var uniqueID: Int32
    var name: String
    var online: Bool
  }

  /// setPreferredNames keeps these: trimmed, non-empty, in order.
  static func cleanPreferredNames(_ names: [String]) -> [String] {
    return names.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
  }

  /// The unique ID to connect now, or nil for none.
  static func target(
    _ sources: [Candidate],
    selectedID: Int32?,
    selectedName: String?,
    preferredNames: [String],
    autoSelect: Bool
  ) -> Int32? {
    let online = sources.filter { $0.online }.sorted { a, b in
      a.name != b.name ? a.name < b.name : a.uniqueID < b.uniqueID
    }
    if selectedID != nil || selectedName != nil {
      if let uid = selectedID, let hit = online.first(where: { $0.uniqueID == uid }) { return hit.uniqueID }
      if let name = selectedName { return online.first(where: { $0.name == name })?.uniqueID }
      return nil
    }
    guard autoSelect else { return nil }
    for pref in preferredNames {
      let p = pref.lowercased()
      if let hit = online.first(where: { $0.name.lowercased().hasPrefix(p) }) { return hit.uniqueID }
    }
    return nil
  }
}
