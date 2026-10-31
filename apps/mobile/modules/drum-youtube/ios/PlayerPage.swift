import Foundation

/// The player page and what goes into it. Pure (unit-tested in Tests/PlayerPageTests.swift).
///
/// The page is loaded with `loadHTMLString(_:baseURL:)` and `baseURL` = `origin`, so the document has the app's https
/// origin and YouTube's embed gets a Referer that names the app (a `file://` page sends none, and YouTube then
/// refuses with error 153: docs/mobile/YOUTUBE-RELEASE.md). It runs the official IFrame Player API exactly as the DOM
/// player (src/youtube/dom/YouTubeDom.tsx) does: one YT.Player, `playsinline`, no autoplay, getCurrentTime() polled
/// every 50 ms (sent only when it moved), and the same events (ready, state, rate, sample, error). Each message
/// carries `perf` (the page's performance.now()); native turns it into the app's Clock time (ClockOffset).
///
/// YouTube rules (CLAUDE.md): the page only plays the video in YouTube's own player. Nothing reads, records or
/// stores its audio or video. The only data put into the page is a checked video id.
enum PlayerPage {
  /// The page's origin: https + the app's bundle id (what YouTube asks WebView apps to identify themselves with).
  static let origin = "https://com.drumcoach.app"

  /// The message handler the page posts to.
  static let handlerName = "dcYt"

  /// A YouTube video id: letters, digits, - and _ (11 today; a little room either way).
  static func isVideoId(_ id: String) -> Bool {
    guard (6...20).contains(id.count) else { return false }
    return id.unicodeScalars.allSatisfy { CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_").contains($0) }
  }

  /// The page for `videoId`, or nil when the id isn't one (nothing else ever goes into the page).
  static func html(videoId: String) -> String? {
    guard isVideoId(videoId) else { return nil }
    return #"""
    <!doctype html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
    <style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#player{position:absolute;inset:0;width:100%;height:100%}</style>
    </head><body><div id="player"></div>
    <script>
    (function () {
      var VIDEO = "\#(videoId)", ORIGIN = "\#(origin)", POLL_MS = 50;
      var p = null, poll = null, lastRaw = -1;
      function post(e) { e.perf = performance.now(); window.webkit.messageHandlers.\#(handlerName).postMessage(JSON.stringify(e)); }
      function read() { return { raw: (p.getCurrentTime && p.getCurrentTime()) || 0, rate: (p.getPlaybackRate && p.getPlaybackRate()) || 1 }; }
      function meta() { var d = (p.getVideoData && p.getVideoData()) || {}; return { duration: (p.getDuration && p.getDuration()) || 0, title: d.title || '' }; }
      function put(a, b) { for (var k in b) a[k] = b[k]; return a; }
      window.dcCommand = function (c) {
        if (!p || !c) return;
        if (c.type === 'play') p.playVideo();
        else if (c.type === 'pause') p.pauseVideo();
        else if (c.type === 'seek') p.seekTo(Math.max(0, +c.sec || 0), true);
        else if (c.type === 'rate') p.setPlaybackRate(+c.rate || 1);
        else if (c.type === 'load') p.cueVideoById({ videoId: String(c.videoId), startSeconds: +c.startSeconds || 0 });
      };
      window.onYouTubeIframeAPIReady = function () {
        var player = new YT.Player('player', {
          videoId: VIDEO, width: '100%', height: '100%',
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: ORIGIN },
          events: {
            onReady: function () {
              p = player;
              post(put(put({ type: 'ready', rates: (p.getAvailablePlaybackRates && p.getAvailablePlaybackRates()) || [1] }, read()), meta()));
              poll = setInterval(function () {
                var s = read();
                if (s.raw === lastRaw) return;
                lastRaw = s.raw;
                post(put({ type: 'sample', duration: (p.getDuration && p.getDuration()) || 0 }, s));
              }, POLL_MS);
            },
            onStateChange: function (e) { var s = read(); lastRaw = s.raw; post(put(put({ type: 'state', state: e.data }, s), meta())); },
            onPlaybackRateChange: function () { var s = read(); lastRaw = s.raw; post(put({ type: 'rate' }, s)); },
            onError: function (e) { post({ type: 'error', code: e.data }); }
          }
        });
      };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = function () { post({ type: 'error', load: true }); };
      document.head.appendChild(s);
    })();
    </script></body></html>
    """#
  }

  /// The script that runs one command (a YtCommand as JSON from TypeScript), or nil when it isn't a JSON object
  /// with a `type`: only data re-encoded by JSONSerialization reaches the page, never the text as given.
  static func commandScript(json: String) -> String? {
    guard let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      object["type"] is String,
      let clean = try? JSONSerialization.data(withJSONObject: object),
      let text = String(data: clean, encoding: .utf8) else {
      return nil
    }
    return "window.dcCommand && window.dcCommand(\(text)); true;"
  }

  /// A message from the page as an event for TypeScript: its fields, with `perf` replaced by `at` (the app's Clock
  /// ms, from `stamp`). Nil for anything that isn't a JSON object with a `type`.
  static func event(fromMessage body: Any, stamp: (Double) -> Double) -> [String: Any]? {
    guard let text = body as? String, let data = text.data(using: .utf8),
      var object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      object["type"] is String else {
      return nil
    }
    if let perf = object.removeValue(forKey: "perf") as? Double, perf.isFinite {
      object["at"] = stamp(perf)
    }
    return object
  }
}
