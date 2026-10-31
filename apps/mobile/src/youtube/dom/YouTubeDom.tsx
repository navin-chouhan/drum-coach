'use dom';
// The official YouTube IFrame Player API inside an Expo DOM component (a WebView, @expo/dom-webview), as the web's
// src/youtube/yt.ts builds it: one YT.Player in this page, `playsinline`, no autoplay. YouTubeView.tsx (native) is
// the only user.
//
// What crosses the bridge: the video id once (later videos come as a `load` command), commands through the
// imperative handle, and the player's events to native (`onEvent`): ready, state and rate changes, errors, and
// getCurrentTime() polled every 50 ms (sent only when it moved). Each event is stamped with the app's Clock through
// an offset measured by round trips (`clockNow`), so the song clock on the native side doesn't see the bridge delay.
//
// YouTube rules (CLAUDE.md): this only plays the video in YouTube's own player. Nothing reads, records or stores its
// audio or video (iOS couldn't capture it anyway, B13). No HTML strings: the page is built with DOM calls.
import { useEffect, useRef, useState, type Ref } from 'react';
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from 'expo/dom';
import { nextOffset } from '../../play/clockSync';
import { deadline } from '../../play/domCalls';
import { LOAD_ERROR, measureOffset, ytPlayerVars, type YtCommand, type YtEvent } from '../ytController';

export type YouTubeHandle = DOMImperativeFactory & {
  /** One YtCommand. */
  command: (cmd: never) => void;
};

export type YouTubeDomProps = {
  videoId: string;
  /** Native action: the app's Clock now (ms). */
  clockNow: () => Promise<number>;
  /** Native action: one player event. */
  onEvent: (e: YtEvent) => Promise<void>;
  ref?: Ref<YouTubeHandle>;
  dom?: DOMProps;
};

type YTPlayer = {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getDuration(): number; getPlayerState(): number;
  setPlaybackRate(r: number): void; getPlaybackRate(): number; getAvailablePlaybackRates(): number[];
  cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  getVideoData(): { title?: string }; destroy(): void;
};
type YTNamespace = { Player: new (el: HTMLElement, o: object) => YTPlayer };
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

const POLL_MS = 50;
const RESYNC_MS = 2000;

let loader: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  const win = window as YTWindow;
  loader ??= new Promise<YTNamespace>((resolve, reject) => {
    if (win.YT?.Player) return resolve(win.YT);
    win.onYouTubeIframeAPIReady = () => resolve(win.YT!);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { loader = null; reject(new Error(LOAD_ERROR)); };
    document.head.appendChild(s);
  });
  return loader;
}

export default function YouTubeDom(props: YouTubeDomProps) {
  const { clockNow, onEvent } = props;
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const offset = useRef(NaN);
  const [failed, setFailed] = useState('');
  const first = useRef(props.videoId); // later videos arrive as `load` commands

  const stamp = () => (Number.isFinite(offset.current) ? { at: performance.now() + offset.current } : {});
  const send = (e: YtEvent) => { void onEvent(e).catch(() => {}); };

  useDOMImperativeHandle(props.ref ?? null, () => ({
    command: ((cmd: YtCommand) => {
      const p = player.current;
      if (!p) return;
      if (cmd.type === 'play') p.playVideo();
      else if (cmd.type === 'pause') p.pauseVideo();
      else if (cmd.type === 'seek') p.seekTo(Math.max(0, cmd.sec), true);
      else if (cmd.type === 'rate') p.setPlaybackRate(cmd.rate);
      else if (cmd.type === 'load') p.cueVideoById({ videoId: cmd.videoId, startSeconds: cmd.startSeconds });
    }) as never,
  }) as YouTubeHandle, []);

  // The Clock offset, measured now and every few seconds.
  useEffect(() => {
    let live = true, timer: ReturnType<typeof setTimeout> | undefined;
    const sync = async () => {
      try {
        const m = await measureOffset(deadline(clockNow, 1500), () => performance.now()); // a dropped answer: next sync
        if (live) offset.current = nextOffset(offset.current, m);
      } catch { /* the bridge isn't up yet: try again */ }
      if (live) timer = setTimeout(() => void sync(), RESYNC_MS);
    };
    void sync();
    return () => { live = false; clearTimeout(timer); };
  }, [clockNow]);

  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.background = '#000';
    document.body.style.overflow = 'hidden';
    let live = true, poll: ReturnType<typeof setInterval> | undefined, lastRaw = -1;
    const read = (p: YTPlayer) => ({ raw: p.getCurrentTime?.() ?? 0, rate: p.getPlaybackRate?.() || 1, ...stamp() });
    const meta = (p: YTPlayer) => ({ duration: p.getDuration?.() ?? 0, title: p.getVideoData?.().title ?? '' });
    loadApi().then(YT => {
      if (!live || !host.current) return;
      const el = document.createElement('div');
      host.current.replaceChildren(el);
      const origin = typeof location !== 'undefined' ? location.origin : undefined;
      const p = new YT.Player(el, {
        videoId: first.current, width: '100%', height: '100%',
        playerVars: ytPlayerVars(origin),
        events: {
          onReady: () => {
            player.current = p;
            send({ type: 'ready', ...read(p), ...meta(p), rates: p.getAvailablePlaybackRates?.() ?? [1] });
            poll = setInterval(() => {
              const s = read(p);
              if (s.raw === lastRaw) return;
              lastRaw = s.raw;
              send({ type: 'sample', ...s, duration: p.getDuration?.() ?? 0 });
            }, POLL_MS);
          },
          onStateChange: (e: { data: number }) => { const s = read(p); lastRaw = s.raw; send({ type: 'state', state: e.data, ...s, ...meta(p) }); },
          onPlaybackRateChange: () => { const s = read(p); lastRaw = s.raw; send({ type: 'rate', ...s }); },
          onError: (e: { data: number }) => send({ type: 'error', code: e.data }),
        },
      });
    }, (e: Error) => {
      if (!live) return;
      setFailed(e.message);
      send({ type: 'error', message: e.message });
    });
    return () => {
      live = false;
      clearInterval(poll);
      try { player.current?.destroy(); } catch { /* already gone */ }
      player.current = null;
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {failed ? <p style={{ position: 'absolute', left: 12, right: 12, top: '40%', margin: 0, color: '#fff', textAlign: 'center', font: '600 16px -apple-system, system-ui, sans-serif' }}>{failed}</p> : null}
    </div>
  );
}
