// The song clock: where the YouTube video is, in seconds, at any Clock time. Pure TypeScript (Vitest-tested).
//
// Ported from the web's src/youtube/yt.ts (YtPlayer: anchor / sample / predict / songTime), unchanged in its maths,
// with performance.now() replaced by the app's Clock (iOS: mach host ms, the clock MIDI hits are stamped on).
// getCurrentTime() only moves every ~100–250 ms, so the clock interpolates from an anchor and gently corrects it:
// a sample within 250 ms of the prediction nudges the anchor by 15 % of the error; a bigger error (a seek, a stall)
// or any sample while not playing re-anchors at once.
//
// On the iPad the samples come from the YouTube player inside a WebView (dom/YouTubeDom.tsx), which stamps each one
// with the Clock through a measured offset, so the bridge's delay doesn't enter the song time.

/** YouTube's player states (YT.PlayerState). */
export const YT_STATE = { unstarted: -1, ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 } as const;
export const PLAYING = YT_STATE.playing;

/** How far a sample may be from the prediction before the clock re-anchors (s), and the correction weight. */
export const SNAP_SEC = 0.25;
export const CORRECTION = 0.15;

export type SongClock = {
  readonly state: number;
  readonly playing: boolean;
  /** The playback rate the anchor runs at. */
  readonly rate: number;
  /** Extra delay of what you hear vs the video clock (s). The web's live drum-reduction path; 0 on the iPad (B13). */
  heardDelaySec: number;
  /** A state change (play, pause, buffering…), with the player's time and rate read at Clock time `at`. */
  setState(state: number, raw: number, rate: number, at: number): void;
  /** onPlaybackRateChange, or a new video cued: re-anchor at the player's time. */
  reanchor(raw: number, rate: number, at: number): void;
  /** One poll of getCurrentTime() (the web polls every 50 ms); ignored when it hasn't moved. */
  sample(raw: number, rate: number, at: number): void;
  /** We asked the player to seek: the anchor moves now, before the player confirms. */
  seek(sec: number, at: number): void;
  /** Song position (s) as heard at Clock time `now`. */
  songTime(now: number): number;
};

export function createSongClock(): SongClock {
  let state: number = YT_STATE.unstarted;
  let anchor = { t: 0, at: 0, rate: 1 };
  let lastRaw = -1;
  const predict = (now: number) => (state === PLAYING ? anchor.t + ((now - anchor.at) / 1000) * anchor.rate : anchor.t);
  const reanchor = (raw: number, rate: number, at: number) => {
    lastRaw = raw;
    anchor = { t: raw, at, rate: rate || 1 };
  };
  const clock: SongClock = {
    get state() { return state; },
    get playing() { return state === PLAYING; },
    get rate() { return anchor.rate; },
    heardDelaySec: 0,
    setState(s, raw, rate, at) {
      state = s;
      reanchor(raw, rate, at);
    },
    reanchor,
    sample(raw, rate, at) {
      if (!Number.isFinite(raw) || raw === lastRaw) return;
      lastRaw = raw;
      const err = raw - predict(at);
      if (state !== PLAYING || Math.abs(err) > SNAP_SEC) anchor = { t: raw, at, rate: rate || 1 };
      else anchor = { ...anchor, t: anchor.t + err * CORRECTION };
    },
    seek(sec, at) {
      anchor = { ...anchor, t: Math.max(0, sec), at };
    },
    songTime: now => predict(now) - clock.heardDelaySec * anchor.rate,
  };
  return clock;
}
