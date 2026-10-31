import ExpoModulesCore

/// Drum Coach's YouTube player module. JS name: "DrumYouTube". iOS only.
///
/// Contract: a native view (`videoId` prop, the first video only) that plays the video in YouTube's official IFrame
/// player inside a WKWebView whose page has the app's https origin (PlayerPage.origin), so YouTube accepts the embed
/// in a Release build. Events: `onPlayerEvent({ event })`, a YtEvent of src/youtube/ytController.ts with `at` on the
/// host clock (the same base as DrumMidi.nowMs). Commands: `command(json)`, a YtCommand as JSON.
/// Nothing downloads, records or stores YouTube audio or video (CLAUDE.md).
public final class DrumYouTubeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DrumYouTube")

    View(YouTubePlayerView.self) {
      Events("onPlayerEvent")

      Prop("videoId") { (view: YouTubePlayerView, id: String) in
        view.setVideoId(id)
      }

      // Async functions run on a background queue by default; WKWebView is main-thread only.
      AsyncFunction("command") { (view: YouTubePlayerView, json: String) in
        MainActor.assumeIsolated {
          view.command(json)
        }
      }.runOnQueue(.main)
    }
  }
}
