// The YouTube player as the Songs screens use it: the web's YtPlayer API (src/youtube/yt.ts: ready, error, state,
// songTime, play, pause, seek, setRate, load, onChange) on the iPad. Pure TypeScript (Vitest-tested): the player
// itself runs in a WebView (dom/YouTubeDom.tsx, the official IFrame Player API); this side receives its events,
// keeps the song clock (songClock.ts) on the app's Clock and sends it commands.
//
// YouTube rules (CLAUDE.md): only the official IFrame player plays the video. Nothing here downloads, records or
// stores audio or video; the only things kept are the video id, a beat grid and the notes the student writes.
import { estimateOffset, type OffsetSample } from '../play/clockSync';
import { createSongClock, PLAYING, YT_STATE } from './songClock';

export { PLAYING, YT_STATE };

/** Commands to the player in the WebView. */
export type YtCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; sec: number }
  | { type: 'rate'; rate: number }
  | { type: 'load'; videoId: string; startSeconds: number };

/**
 * Events from the player. `raw` = getCurrentTime() (s), `rate` = getPlaybackRate(), `at` = the Clock time it was read
 * (missing until the WebView has measured its Clock offset: the controller then uses its own now()).
 */
export type YtEvent =
  | { type: 'ready'; raw: number; rate: number; at?: number; duration: number; title: string; rates: number[] }
  | { type: 'state'; state: number; raw: number; rate: number; at?: number; duration: number; title: string }
  | { type: 'rate'; raw: number; rate: number; at?: number }
  | { type: 'sample'; raw: number; rate: number; at?: number; duration: number }
  | { type: 'error'; code?: number; message?: string };

/** The web's messages (yt.ts ERRORS), plus 152/153, which YouTube added for players it won't serve (153: the
 * player didn't say where it's embedded, as a Release build's file:// page can't: docs/mobile/YOUTUBE-RELEASE.md). */
export const YT_ERRORS: Record<number, string> = {
  2: 'Invalid video id.',
  5: "This video can't play in the browser player.",
  100: 'Video not found or private.',
  101: "The owner doesn't allow this video to be embedded. Try another upload of the song.",
  150: "The owner doesn't allow this video to be embedded. Try another upload of the song.",
  152: "The owner doesn't allow this video to be embedded. Try another upload of the song.",
  153: "The owner doesn't allow this video to be embedded. Try another upload of the song.",
};
/** The codes where YouTube refuses to play the video in this player: the screen offers "Open in YouTube". */
export const REFUSED_CODES: readonly number[] = [101, 150, 152, 153];
export const isRefused = (code: number | undefined) => code !== undefined && REFUSED_CODES.includes(code);
/** The video on YouTube itself (the YouTube app or Safari): watching only, no song clock there. */
export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
export const LOAD_ERROR = 'Could not load YouTube. Are you online?';
export const ytErrorText = (e: { code?: number; message?: string }) =>
  e.message ?? (e.code !== undefined ? YT_ERRORS[e.code] ?? `YouTube error ${e.code}` : 'YouTube error');

/** The nearest rate YouTube offers (keeps pitch), as the web's setRate. */
export const nearestRate = (rates: readonly number[], r: number) =>
  (rates.length ? rates : [r]).reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a), 1);

/** The web's playerVars. `origin` only when the page has a real one (the dev server); a file:// page has none. */
export function ytPlayerVars(origin: string | undefined) {
  return { playsinline: 1, rel: 0, modestbranding: 1, ...(origin && /^https?:\/\//.test(origin) && { origin }) };
}

/** Clock − performance.now() inside the WebView, from round trips to the native Clock (the tightest bracket wins). */
export async function measureOffset(clockNow: () => Promise<number>, perfNow: () => number, n = 5): Promise<number> {
  const samples: OffsetSample[] = [];
  for (let i = 0; i < n; i++) {
    const before = perfNow();
    const clock = await clockNow();
    samples.push({ before, clock, after: perfNow() });
  }
  return estimateOffset(samples);
}

export type YtController = {
  /** Resolves when the player is ready (the web's `ready`). */
  readonly ready: Promise<void>;
  readonly isReady: boolean;
  /** The current error text ('' = none). */
  readonly error: string;
  /** YouTube's error code with it, when it sent one. */
  readonly errorCode: number | undefined;
  readonly state: number;
  readonly playing: boolean;
  readonly rate: number;
  readonly duration: number;
  readonly title: string;
  /** Song position (s) as heard at Clock time `now` (default: now). */
  songTime(now?: number): number;
  play(): void;
  pause(): void;
  seek(sec: number): void;
  /** Asks for the nearest rate YouTube offers; returns it. */
  setRate(r: number): number;
  /** Cues another video (a version switch): no autoplay. */
  load(videoId: string, startSeconds?: number): void;
  /** Re-render hook: called on ready, state, rate and error changes (not per sample). */
  onChange(fn: () => void): () => void;
  /** An event from the WebView. */
  handle(e: YtEvent): void;
  destroy(): void;
};

export function createYtController(deps: { now: () => number; send: (cmd: YtCommand) => void }): YtController {
  const clock = createSongClock();
  const listeners = new Set<() => void>();
  let isReady = false, error = '', errorCode: number | undefined, duration = 0, title = '', rates: number[] = [], destroyed = false;
  let resolveReady!: () => void;
  const ready = new Promise<void>(r => { resolveReady = r; });
  const emit = () => listeners.forEach(l => { try { l(); } catch { /* one listener can't stop the rest */ } });
  const send = (cmd: YtCommand) => { if (isReady && !destroyed) deps.send(cmd); };
  const at = (e: { at?: number }) => (typeof e.at === 'number' && Number.isFinite(e.at) ? e.at : deps.now());

  return {
    ready,
    get isReady() { return isReady; },
    get error() { return error; },
    get errorCode() { return errorCode; },
    get state() { return clock.state; },
    get playing() { return clock.playing; },
    get rate() { return clock.rate; },
    get duration() { return duration; },
    get title() { return title; },
    songTime: (now = deps.now()) => clock.songTime(now),
    play: () => send({ type: 'play' }),
    pause: () => send({ type: 'pause' }),
    seek(sec) {
      send({ type: 'seek', sec: Math.max(0, sec) });
      clock.seek(sec, deps.now());
    },
    setRate(r) {
      const best = nearestRate(rates, r);
      send({ type: 'rate', rate: best });
      return best;
    },
    load(videoId, startSeconds = 0) {
      error = ''; errorCode = undefined;
      send({ type: 'load', videoId, startSeconds });
      clock.reanchor(startSeconds, clock.rate, deps.now());
      emit();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    handle(e) {
      if (destroyed) return;
      switch (e.type) {
        case 'ready':
          duration = e.duration; title = e.title; rates = e.rates.filter(r => r > 0);
          clock.reanchor(e.raw, e.rate, at(e));
          if (!isReady) { isReady = true; resolveReady(); }
          emit();
          return;
        case 'state':
          duration = e.duration || duration; title = e.title || title;
          clock.setState(e.state, e.raw, e.rate, at(e));
          emit();
          return;
        case 'rate':
          clock.reanchor(e.raw, e.rate, at(e));
          emit();
          return;
        case 'sample':
          if (e.duration) duration = e.duration;
          clock.sample(e.raw, e.rate, at(e));
          return;
        case 'error':
          error = ytErrorText(e); errorCode = e.code;
          emit();
      }
    },
    destroy() {
      destroyed = true;
      listeners.clear();
    },
  };
}
