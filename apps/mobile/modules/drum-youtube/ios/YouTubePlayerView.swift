import ExpoModulesCore
import UIKit
import WebKit

/// Routes the page's messages to the view without the content controller retaining it. WebKit calls it on the main
/// thread (WKScriptMessageHandler is a main-actor protocol).
@MainActor
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
  weak var target: YouTubePlayerView?

  init(_ target: YouTubePlayerView) {
    self.target = target
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    target?.received(message)
  }
}

/// The player view: a WKWebView with the player page (PlayerPage) loaded under the app's https origin, inline
/// playback, nothing stored (a non-persistent website data store) and no capture of any kind. Events go to
/// TypeScript as `onPlayerEvent({ event })`; commands come in through `command(json)`.
final class YouTubePlayerView: ExpoView, WKNavigationDelegate, WKUIDelegate {
  let onPlayerEvent = EventDispatcher()

  private var webView: WKWebView?
  private var videoId: String?
  private var offset = ClockOffset()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    clipsToBounds = true
  }

  // No deinit: the message handler holds the view weakly and WKWebView's delegates are weak, so nothing to undo (and
  // a nonisolated deinit touching the main-actor web view is a Swift 6 warning).

  override func layoutSubviews() {
    super.layoutSubviews()
    webView?.frame = bounds
  }

  /// The first video (later ones arrive as `load` commands, as in the DOM player): builds the page once.
  func setVideoId(_ id: String) {
    guard videoId == nil else { return }
    videoId = id
    guard let page = PlayerPage.html(videoId: id) else {
      onPlayerEvent(["event": ["type": "error", "code": 2] as [String: Any]]) // YouTube's own code for an invalid id
      return
    }
    let web = makeWebView()
    offset.reset()
    web.loadHTMLString(page, baseURL: URL(string: PlayerPage.origin))
  }

  func command(_ json: String) {
    guard let script = PlayerPage.commandScript(json: json) else { return }
    webView?.evaluateJavaScript(script, completionHandler: nil)
  }

  fileprivate func received(_ message: WKScriptMessage) {
    guard message.name == PlayerPage.handlerName else { return }
    let host = HostClock.nowMs()
    guard let parsed = PlayerPage.parse(message: message.body) else { return }
    let at = parsed.perf.map { offset.stamp(hostMs: host, perfMs: $0) }
    onPlayerEvent(["event": PlayerPage.stamped(parsed.event, at: at)])
  }

  private func makeWebView() -> WKWebView {
    if let webView { return webView }
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = [] // a tap on the app's own Play starts it (never by itself: the page only cues)
    config.allowsAirPlayForMediaPlayback = true
    config.websiteDataStore = .nonPersistent() // nothing kept on disk: no cookies, no cache of the stream
    config.userContentController.add(WeakMessageHandler(self), name: PlayerPage.handlerName)
    let web = WKWebView(frame: bounds, configuration: config)
    web.navigationDelegate = self
    web.uiDelegate = self
    web.isOpaque = false
    web.backgroundColor = .black
    web.scrollView.isScrollEnabled = false
    web.scrollView.bounces = false
    #if DEBUG
    web.isInspectable = true // the pod targets iOS 16.4+
    #endif
    addSubview(web)
    webView = web
    return web
  }

  // MARK: - Navigation: the page stays; links the player opens (the YouTube logo, "Watch on YouTube") go to YouTube.

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if navigationAction.targetFrame?.isMainFrame == true, navigationAction.navigationType == .linkActivated, let url = navigationAction.request.url {
      UIApplication.shared.open(url)
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = navigationAction.request.url { UIApplication.shared.open(url) }
    return nil
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    // WebKit killed the page (memory): build it again; the controller sees a new `ready`.
    guard let id = videoId, let page = PlayerPage.html(videoId: id) else { return }
    offset.reset()
    webView.loadHTMLString(page, baseURL: URL(string: PlayerPage.origin))
  }
}
