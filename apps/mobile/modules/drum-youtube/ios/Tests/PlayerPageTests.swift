// Unit tests for the pure Swift of DrumYouTube. Written in a Linux container: NOT compiled or run yet.
//
// How to run (on the Mac): in apps/mobile/ios/Podfile change `use_expo_modules!` to
// `use_expo_modules!(includeTests: true)`, run `pod install`, open the workspace, pick the `DrumYouTube-Unit-Tests`
// scheme and press Cmd+U (an iOS simulator is fine). Don't commit the Podfile change. The cloud iOS build
// (scripts/ci-ios-build.sh pod-tests) runs them too.
//
// The events' TypeScript side is tested in modules/drum-youtube/src/events.test.ts.

import XCTest
@testable import DrumYouTube

final class PlayerPageTests: XCTestCase {
  func testVideoIds() {
    XCTAssertTrue(PlayerPage.isVideoId("dQw4w9WgXcQ"))
    XCTAssertTrue(PlayerPage.isVideoId("a-b_C123456"))
    XCTAssertFalse(PlayerPage.isVideoId(""))
    XCTAssertFalse(PlayerPage.isVideoId("abc"))
    XCTAssertFalse(PlayerPage.isVideoId("dQw4w9WgXcQ\"</script>"))
    XCTAssertFalse(PlayerPage.isVideoId("dQw4 9WgXcQ"))
  }

  func testPage() throws {
    let page = try XCTUnwrap(PlayerPage.html(videoId: "dQw4w9WgXcQ"))
    XCTAssertTrue(page.contains("var VIDEO = \"dQw4w9WgXcQ\""))
    XCTAssertTrue(page.contains("ORIGIN = \"https://com.drumcoach.app\""))
    XCTAssertTrue(page.contains("https://www.youtube.com/iframe_api"))
    XCTAssertTrue(page.contains("playsinline: 1"))
    XCTAssertTrue(page.contains("window.webkit.messageHandlers.dcYt.postMessage"))
    XCTAssertFalse(page.contains("autoplay")) // the page only cues: play() comes from the app
    XCTAssertNil(PlayerPage.html(videoId: "bad id"))
  }

  func testCommands() throws {
    let play = try XCTUnwrap(PlayerPage.commandScript(json: "{\"type\":\"play\"}"))
    XCTAssertTrue(play.hasPrefix("window.dcCommand && window.dcCommand({"))
    XCTAssertTrue(play.contains("\"type\":\"play\""))
    let seek = try XCTUnwrap(PlayerPage.commandScript(json: "{\"type\":\"seek\",\"sec\":12.5}"))
    XCTAssertTrue(seek.contains("12.5"))
    XCTAssertNil(PlayerPage.commandScript(json: "alert(1)"))
    XCTAssertNil(PlayerPage.commandScript(json: "[1,2]"))
    XCTAssertNil(PlayerPage.commandScript(json: "{\"sec\":1}"))
  }

  func testEvents() throws {
    let sample = try XCTUnwrap(PlayerPage.parse(message: "{\"type\":\"sample\",\"raw\":3.5,\"rate\":1,\"duration\":200,\"perf\":1000}"))
    XCTAssertEqual(sample.perf, 1000)
    XCTAssertNil(sample.event["perf"])
    let e = PlayerPage.stamped(sample.event, at: 6000)
    XCTAssertEqual(e["type"] as? String, "sample")
    XCTAssertEqual(e["at"] as? Double, 6000)
    let err = try XCTUnwrap(PlayerPage.parse(message: "{\"type\":\"error\",\"code\":153}"))
    XCTAssertNil(err.perf)
    XCTAssertEqual(err.event["code"] as? Int, 153)
    XCTAssertNil(PlayerPage.stamped(err.event, at: nil)["at"])
    XCTAssertNil(PlayerPage.parse(message: "not json"))
    XCTAssertNil(PlayerPage.parse(message: 42))
  }
}

final class ClockOffsetTests: XCTestCase {
  func testSmallestDelayWins() {
    var c = ClockOffset(window: 3)
    XCTAssertNil(c.value)
    XCTAssertEqual(c.stamp(hostMs: 10_010, perfMs: 0), 10_010) // first: as it arrived
    XCTAssertEqual(c.stamp(hostMs: 10_102, perfMs: 100), 10_102) // a faster delivery: the offset drops to 10 002
    XCTAssertEqual(c.value, 10_002)
    XCTAssertEqual(c.stamp(hostMs: 10_220, perfMs: 200), 10_202) // a slow one doesn't move it
  }

  func testWindowForgetsOldSamples() {
    var c = ClockOffset(window: 2)
    _ = c.stamp(hostMs: 1_000, perfMs: 0) // offset 1000
    _ = c.stamp(hostMs: 1_105, perfMs: 100) // 1005
    _ = c.stamp(hostMs: 1_206, perfMs: 200) // 1006: the 1000 has left the window
    XCTAssertEqual(c.value, 1_005)
    c.reset()
    XCTAssertNil(c.value)
  }
}
