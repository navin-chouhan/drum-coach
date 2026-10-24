// YouTube IFrame Player API wrapper with a smoothed song clock.
// The player can live in this window or in a popup (needed for live drum reduction: the popup tab is captured).

type YTPlayer = {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getDuration(): number; getPlayerState(): number;
  setPlaybackRate(r: number): void; getPlaybackRate(): number; getAvailablePlaybackRates(): number[];
  loadVideoById(o: { videoId: string; startSeconds?: number }): void; cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  getVideoData(): { title?: string }; destroy(): void;
};
type YTNamespace = { Player: new (el: HTMLElement, o: object) => YTPlayer };
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

const loaders = new WeakMap<Window, Promise<YTNamespace>>();
function loadApi(win: YTWindow): Promise<YTNamespace> {
  if (!loaders.has(win)) {
    loaders.set(win, new Promise((resolve, reject) => {
      if (win.YT?.Player) return resolve(win.YT);
      win.onYouTubeIframeAPIReady = () => resolve(win.YT!);
      const s = win.document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { loaders.delete(win); reject(new Error('Could not load YouTube. Are you online?')); };
      win.document.head.appendChild(s);
    }));
  }
  return loaders.get(win)!;
}

const ERRORS: Record<number, string> = {
  2: 'Invalid video id.', 5: "This video can't play in the browser player.", 100: 'Video not found or private.',
  101: "The owner doesn't allow this video to be embedded. Try another upload of the song.", 150: "The owner doesn't allow this video to be embedded. Try another upload of the song.",
};
export const PLAYING = 1;

export class YtPlayer {
  ready: Promise<void>;
  error = '';
  state = -1;
  /** Extra delay of what you hear vs the video clock (live drum reduction path), seconds. */
  heardDelaySec = 0;
  private p?: YTPlayer;
  private anchor = { t: 0, at: 0, rate: 1 };
  private lastRaw = -1;
  private poll = 0;
  private listeners = new Set<() => void>();

  constructor(el: HTMLElement, videoId: string, win: Window = window) {
    this.ready = loadApi(win as YTWindow).then(YT => new Promise<void>(resolve => {
      this.p = new YT.Player(el, {
        videoId, width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: win.location.origin },
        events: {
          onReady: () => resolve(),
          onStateChange: (e: { data: number }) => { this.state = e.data; this.reanchor(); this.emit(); },
          onPlaybackRateChange: () => { this.reanchor(); this.emit(); },
          onError: (e: { data: number }) => { this.error = ERRORS[e.data] ?? `YouTube error ${e.data}`; this.emit(); },
        },
      });
    }));
    // getCurrentTime only updates every ~100–250 ms over postMessage: interpolate and gently correct.
    this.poll = window.setInterval(() => this.sample(), 50);
  }

  onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach(l => l()); }

  private reanchor() {
    if (!this.p) return;
    this.lastRaw = this.p.getCurrentTime();
    this.anchor = { t: this.lastRaw, at: performance.now(), rate: this.p.getPlaybackRate() || 1 };
  }
  private sample() {
    if (!this.p?.getCurrentTime) return;
    const raw = this.p.getCurrentTime();
    if (raw === this.lastRaw) return;
    this.lastRaw = raw;
    const now = performance.now(), err = raw - this.predict(now);
    if (this.state !== PLAYING || Math.abs(err) > 0.25) this.anchor = { t: raw, at: now, rate: this.p.getPlaybackRate() || 1 };
    else this.anchor = { ...this.anchor, t: this.anchor.t + err * 0.15 };
  }
  private predict(now: number) {
    return this.state === PLAYING ? this.anchor.t + ((now - this.anchor.at) / 1000) * this.anchor.rate : this.anchor.t;
  }

  /** Song position (s) as heard at performance.now() time `now`. */
  songTime(now = performance.now()) { return this.predict(now) - this.heardDelaySec * this.anchor.rate; }
  get playing() { return this.state === PLAYING; }
  get rate() { return this.anchor.rate; }
  get duration() { return this.p?.getDuration?.() ?? 0; }
  get title() { return this.p?.getVideoData?.().title ?? ''; }

  play() { this.p?.playVideo(); }
  pause() { this.p?.pauseVideo(); }
  seek(sec: number) { this.p?.seekTo(Math.max(0, sec), true); this.anchor = { ...this.anchor, t: Math.max(0, sec), at: performance.now() }; }
  /** Nearest rate YouTube offers (keeps pitch). */
  setRate(r: number) {
    const rates = this.p?.getAvailablePlaybackRates?.() ?? [r];
    const best = rates.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a), 1);
    this.p?.setPlaybackRate(best);
    return best;
  }
  load(videoId: string, startSeconds = 0) { this.error = ''; this.p?.cueVideoById({ videoId, startSeconds }); this.reanchor(); }
  destroy() { clearInterval(this.poll); this.p?.destroy(); this.listeners.clear(); }
}
