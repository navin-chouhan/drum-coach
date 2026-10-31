// The count-in words' buffers (WordChunks). Written in a Linux container: run by `swift test` in ios/Core.
import XCTest
@testable import DrumAudioCore

final class WordChunksTests: XCTestCase {
  func testAudioIsKept() {
    XCTAssertEqual(WordChunks.action(frameLength: 512, haveAudio: false), .append)
    XCTAssertEqual(WordChunks.action(frameLength: 512, haveAudio: true), .append)
  }

  func testAnEmptyBufferEndsOnlyAfterAudio() {
    XCTAssertEqual(WordChunks.action(frameLength: 0, haveAudio: false), .skip) // a leading empty buffer: keep waiting
    XCTAssertEqual(WordChunks.action(frameLength: 0, haveAudio: true), .end)
  }
}
