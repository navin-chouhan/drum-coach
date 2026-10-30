// Mirrors src/selection.test.ts. Written in a Linux container: NOT compiled or run yet (how to run: the header of
// BatchPolicyTests.swift).

import XCTest
@testable import DrumMidi

final class InputSelectionTests: XCTestCase {
  private typealias C = InputSelection.Candidate

  private func kit(_ id: Int32 = 101, online: Bool = true) -> C { C(uniqueID: id, name: "e-Drum", online: online) }
  private let net = C(uniqueID: 7, name: "Network Session 1", online: true)

  private func target(
    _ sources: [C], selectedID: Int32? = nil, selectedName: String? = nil,
    preferred: [String] = ["e-Drum"], autoSelect: Bool = true
  ) -> Int32? {
    return InputSelection.target(
      sources, selectedID: selectedID, selectedName: selectedName, preferredNames: preferred, autoSelect: autoSelect)
  }

  func testAutoSelectsThePreferredKitWhenItAppears() {
    XCTAssertNil(target([net]))
    XCTAssertEqual(target([net, kit()]), 101)
  }

  func testPrefixIsCaseInsensitive() {
    XCTAssertEqual(target([C(uniqueID: 3, name: "e-Drum MIDI 1", online: true)], preferred: ["E-DRUM"]), 3)
  }

  func testPreferredOrderThenNameThenID() {
    let alpha = C(uniqueID: 9, name: "Alpha Pads", online: true)
    XCTAssertEqual(target([alpha, kit(101), kit(50)], preferred: ["e-Drum", "Alpha"]), 50)
    XCTAssertEqual(target([alpha, kit(101)], preferred: ["Alpha", "e-Drum"]), 9)
  }

  func testIgnoresOfflineSources() {
    XCTAssertNil(target([kit(101, online: false)]))
  }

  func testNothingWithAutoSelectOff() {
    XCTAssertNil(target([kit()], autoSelect: false))
  }

  func testExplicitSelectionWins() {
    XCTAssertEqual(target([kit(), net], selectedID: 7, selectedName: net.name), 7)
  }

  func testOfflineSelectionStaysSelected() {
    let offlineNet = C(uniqueID: 7, name: net.name, online: false)
    XCTAssertNil(target([offlineNet, kit()], selectedID: 7, selectedName: net.name))
  }

  func testReselectsByNameAfterReplugWithNewID() {
    XCTAssertEqual(target([kit(101, online: false), kit(202)], selectedID: 101, selectedName: "e-Drum"), 202)
  }

  func testSelectedIDBeatsSameName() {
    XCTAssertEqual(target([kit(101), kit(202)], selectedID: 202, selectedName: "e-Drum"), 202)
  }

  func testUnlistedIDHasNoNameToFallBackOn() {
    XCTAssertNil(target([kit(101)], selectedID: 555))
  }

  func testCleanPreferredNames() {
    XCTAssertEqual(InputSelection.cleanPreferredNames([" e-Drum ", "", "  ", "TD-"]), ["e-Drum", "TD-"])
  }
}
