# YouTube in a Release build (error 153)

**Status: open, no code change yet.** The installed packages offer no sound fix, so this note lists the options and
what each costs. The owner picks one. Written 2026-10-31 by W3 (investigation timebox about 2 h).

## The problem

- Songs plays YouTube in YouTube's own IFrame player. The player runs inside an Expo DOM component:
  `apps/mobile/src/youtube/dom/YouTubeDom.tsx`, which is a WKWebView (`@expo/dom-webview` 58.0.2).
- **Dev build:** the DOM page comes from Metro, at `http://<mac>:8081/_expo/@dom/...`. The page has a real http
  origin, so the embed request carries a `Referer`, and YouTube plays the video.
- **Release build:** the page is the bundled file `www.bundle/<hash>.html`. You can see this in
  `node_modules/expo/src/dom/base.ts`, where `getBaseURL()` returns `'www.bundle'` on iOS in production. The native
  view then opens it with `loadFileURL` (`@expo/dom-webview/ios/DomWebView.swift`, `load(request:)`).
- A `file://` page has a `null` origin and sends **no `Referer`** to `https://www.youtube.com/embed/...`. Since 2025,
  YouTube refuses embeds that don't say where they are embedded. Those embeds fail with **error 153** ("video player
  configuration error"). This most likely hits **every video**, not just a few. That still needs checking on a
  Release build (see the checklist line below).
- What the app does today: `ytPlayerVars` passes `origin` only when the page has a real http(s) origin, and error 153
  shows a clear message (`YT_ERRORS[153]` in `ytController.ts`). Everything else in Songs still works: Learn by ear's
  grid, the sheet music and imported files. But nothing plays in sync with the video.

## What the installed packages allow (checked in the source)

| Idea | Result |
|---|---|
| Load the page with an HTML string and an https `baseUrl` (the usual WKWebView fix: `loadHTMLString(_:baseURL:)`) | **Not available.** The `@expo/dom-webview` source is a Record with only `uri` (`DomWebViewRecords.swift`), so there is no `html`, no `baseUrl` and no headers. `react-native-webview` (which has `source={{ html, baseUrl }}`) is not installed, and adding it would be a new package. |
| Pass the `origin` playerVar anyway (for example `https://com.drumcoach.app`) | **No.** It doesn't add a `Referer`. Worse, the IFrame API posts its messages to that origin, which doesn't match the page's real `null` origin, so the player's events (ready, state, time) would be dropped. |
| `youtube-nocookie.com` host | Same embed rules, same missing `Referer`, so it won't help. (The web app doesn't use it either.) |
| Wrap the page in an `srcdoc` iframe, or set `<meta name="referrer">` | The origin stays `null`, and a file page has no referrer to send. |
| Navigate the WebView itself to `youtube.com/embed/...` | It loses the JS API (no song clock, so no scoring), and the navigation from a file page still sends no `Referer`. |
| `dom={{ overrideUri }}` (expo's internal prop, read in `webview-wrapper.tsx`) | **This works as a mechanism:** the DOM component can load from any http(s) URL, and the bridge scripts are injected into whatever page loads. But something has to *serve* the page from an http(s) origin. See options B and C. |
| A local http server in Expo | None is shipped in Release builds. Metro exists only in dev. |

## Options

**A. A small native YouTube view of our own (recommended).** About 1–1.5 days plus a cloud iOS build. No npm package.
- A new local Expo module, `modules/drum-youtube`, next to drum-audio, drum-keys and drum-midi. It is a WKWebView
  that loads the player page with `loadHTMLString(page, baseURL: URL(string: "https://com.drumcoach.app")!)`. The
  page then has an https origin named after the app, which is what YouTube asks WebView apps to send. The `origin`
  playerVar becomes that value.
- The page is a bundled resource with the same code as `YouTubeDom.tsx` (IFrame API, 50 ms time poll, Clock
  round trips). It is built with DOM calls; there is no HTML from user data. Messages go through a
  `WKScriptMessageHandler`.
- `YouTubeView.tsx` swaps `YouTubeDom` for the native view and keeps the `YtCommand` / `YtEvent` protocol, so
  `ytController.ts`, the song clock and all their tests stay as they are. Only the message mapping is new, and it
  can be unit-tested.
- Risk: new Swift that only the cloud build and the iPad can check. YouTube rules hold: it only plays in YouTube's
  player, and nothing is downloaded, recorded or stored.

**B. Serve the player page from the home server over the LAN.** About 0.5–1 day. No native code.
- The Fastify server serves the exported DOM page (`www.bundle/*` from the same `expo export`). The app sets
  `dom={{ overrideUri: 'http://<home-server>/yt-player/<hash>.html' }}` when the home server is configured.
  `NSAllowsLocalNetworking` is already in `app.json`.
- Costs:
  - YouTube plays only while the home server is reachable. Today a pasted link plays without it.
  - Each app build must be copied to the server, or the page and the app drift apart.
  - It uses an Expo prop marked `@internal`.
  - YouTube may not accept a bare LAN IP as a `Referer`. That is untested.

**C. Host the player page on an https site (for example GitHub Pages).** About 0.5 day, plus a step on every
release.
- Same `overrideUri` idea as B, with a public https origin. It needs only the internet, which YouTube needs anyway.
- Costs: one hosted page per app build (version drift), public hosting the owner has to keep up, and the same
  `@internal` prop.

**D. Fallback only: "Open in YouTube".** About 1 h.
- On error 153, a button opens the video in the YouTube app or in Safari (`Linking.openURL`).
- It is honest and allowed, but you can't play along with scoring, because the app gets no song clock.
- Worth adding next to A, B or C, not instead of them.

## For the owner to check in a Release build

FINAL-CHECKLIST → Songs, first line: open any song in a **Release** build (not the dev client). If the player shows
error 153 for every video, this note applies. Pick option A, B or C, and say whether you want D now.
