// Which YouTube player a song uses (docs/mobile/YOUTUBE-RELEASE.md, option A): the native one (modules/drum-youtube:
// the page has the app's https origin, so YouTube accepts it) in a Release build whenever the build has it; the DOM
// component (dom/YouTubeDom.tsx) otherwise. A dev build keeps the DOM player (Metro serves its page over http, which
// YouTube accepts) unless the dev toggle asks for the native one, so it can be tried before a Release build. Pure.
import type { KeyValueStore } from '@drum-coach/core/platform';

/** Dev toggle: '1' = use the native player in a dev build too. */
export const NATIVE_YT_DEV_KEY = 'drumcoach.dev.nativeYouTube';

export type PlayerKind = 'native' | 'dom';

export function choosePlayer(o: { nativeAvailable: boolean; dev: boolean; devNative: boolean }): PlayerKind {
  return o.nativeAvailable && (!o.dev || o.devNative) ? 'native' : 'dom';
}

export function readDevNative(kv: Pick<KeyValueStore, 'get'>): boolean {
  try { return kv.get(NATIVE_YT_DEV_KEY) === '1'; } catch { return false; }
}
