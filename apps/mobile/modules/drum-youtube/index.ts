// Drum Coach's YouTube player module: YouTube's official IFrame player in a native WKWebView whose page has the app's
// https origin (https://com.drumcoach.app), so YouTube accepts the embed in a Release build, where the DOM
// component's file:// page gets error 153 (docs/mobile/YOUTUBE-RELEASE.md). iOS only; `available` is false
// elsewhere and src/youtube/YouTubeView.tsx falls back to the DOM player.
// Speaks src/youtube/ytController.ts's YtCommand / YtEvent: events carry `at` on the host clock (DrumMidi.nowMs).
// Nothing downloads, records or stores YouTube audio or video (CLAUDE.md).

import { linked, NativePlayer } from './src/DrumYouTubeModule';

export { toYtEvent, type NativeYtEvent } from './src/events';
export type { NativePlayerProps, NativePlayerRef } from './src/DrumYouTubeModule';

/** True when the native player exists in this build. */
export const available = linked && NativePlayer != null;
export { NativePlayer };
