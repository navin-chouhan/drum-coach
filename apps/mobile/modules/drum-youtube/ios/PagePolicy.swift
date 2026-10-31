import Foundation

/// What the player view lets the page do (QA4 m1, m2). Pure (unit-tested in Tests/PlayerPageTests.swift).
enum PagePolicy {
  /// The page's own host (PlayerPage.origin).
  static let host = "com.drumcoach.app"

  /// Messages count only from our page: the main frame, with our origin. The YouTube iframe can't post events.
  static func acceptsMessage(isMainFrame: Bool, scheme: String, host: String) -> Bool {
    return isMainFrame && scheme == "https" && host == Self.host
  }

  enum Navigation: Equatable {
    case allow
    case cancel
    /// Cancel here and open it in the YouTube app or Safari.
    case openOutside(URL)
  }

  /// A navigation: subframes (YouTube's embed iframe) are allowed; the main frame only for the page we load
  /// (`expectingPage` = a loadHTMLString is in flight). Anything else in the main frame is cancelled, and opened
  /// outside the app when it's a YouTube link (the logo, "Watch on YouTube").
  static func navigation(url: URL?, isMainFrame: Bool, expectingPage: Bool) -> Navigation {
    if !isMainFrame { return .allow }
    if expectingPage, let url, isOurPage(url) { return .allow }
    if let url, isYouTube(url) { return .openOutside(url) }
    return .cancel
  }

  /// A new window (target=_blank): never inside the app; a YouTube link opens outside.
  static func newWindow(url: URL?) -> URL? {
    guard let url, isYouTube(url) else { return nil }
    return url
  }

  static func isOurPage(_ url: URL) -> Bool {
    return url.absoluteString == "about:blank" || (url.scheme == "https" && url.host == host && (url.path.isEmpty || url.path == "/"))
  }

  static func isYouTube(_ url: URL) -> Bool {
    guard url.scheme == "https" || url.scheme == "http", let h = url.host?.lowercased() else { return false }
    return h == "youtube.com" || h.hasSuffix(".youtube.com") || h == "youtu.be"
  }
}
