// The inline YouTube player on the iPad: the official IFrame player in a WebView, with its controller
// (ytController.ts: the web's YtPlayer API and song clock on the app's Clock). Mount it where the video shows;
// `onPlayer` hands the screen its controller once (a new key = a new player, as the web re-creates it).
//
// Two players speak the same YtCommand / YtEvent (playerChoice.ts picks): the native one (modules/drum-youtube, a
// WKWebView whose page has the app's https origin, so YouTube accepts it in a Release build) and the DOM component
// (dom/YouTubeDom.tsx, whose Release page is file:// and gets error 153: docs/mobile/YOUTUBE-RELEASE.md).
//
// Playback never starts by itself: the player is cued, and only play() (a tap on a Songs control) or a tap on the
// video starts it. Taps on native controls can start it (no user-action requirement in either WebView).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import * as DrumYouTube from '../../modules/drum-youtube';
import { getStorage } from '../platform/storage';
import YouTubeDom, { type YouTubeHandle } from './dom/YouTubeDom';
import { choosePlayer, readDevNative } from './playerChoice';
import { createYtController, LOAD_ERROR, type YtCommand, type YtController, type YtEvent } from './ytController';

export type YouTubeViewProps = {
  videoId: string;
  /** The app's Clock (iOS: MidiPort.clock.now, the host clock the native player stamps its events on). */
  now: () => number;
  onPlayer: (yt: YtController) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function YouTubeView({ videoId, now, onPlayer, style, testID }: YouTubeViewProps) {
  const [kind] = useState(() => choosePlayer({ nativeAvailable: DrumYouTube.available, dev: __DEV__, devNative: readDevNative(getStorage().kv) }));
  const handle = useRef<YouTubeHandle>(null);
  const native = useRef<DrumYouTube.NativePlayerRef>(null);
  const nowRef = useRef(now);
  nowRef.current = now;
  const yt = useMemo(() => createYtController({
    now: () => nowRef.current(),
    send: (cmd: YtCommand) => {
      if (kind === 'native') { void native.current?.command(JSON.stringify(cmd)).catch(() => {}); return; }
      const h = handle.current as { command?: (c: YtCommand) => void } | null;
      h?.command?.(cmd);
    },
  }), [kind]);
  const [first] = useState(videoId); // a version switch is yt.load(); the WebView keeps its player
  useEffect(() => { onPlayer(yt); }, [yt, onPlayer]);
  useEffect(() => () => yt.destroy(), [yt]);

  const clockNow = useCallback(async () => nowRef.current(), []);
  const onEvent = useCallback(async (e: YtEvent) => { yt.handle(e); }, [yt]);
  const onNative = useCallback((e: { nativeEvent: unknown }) => { const ev = DrumYouTube.toYtEvent(e.nativeEvent, LOAD_ERROR); if (ev) yt.handle(ev); }, [yt]);
  const Native = DrumYouTube.NativePlayer;

  return (
    <View style={[{ backgroundColor: '#000', overflow: 'hidden' }, style]} testID={testID} accessibilityLabel="YouTube video player">
      {kind === 'native' && Native ? (
        <Native ref={native} videoId={first} onPlayerEvent={onNative} style={{ flex: 1 }} testID={testID ? `${testID}-native` : undefined} />
      ) : (
        <YouTubeDom
          ref={handle}
          videoId={first}
          clockNow={clockNow}
          onEvent={onEvent}
          dom={{
            style: { flex: 1 }, scrollEnabled: false, bounces: false, overScrollMode: 'never',
            allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false, allowsFullscreenVideo: true,
          }}
        />
      )}
    </View>
  );
}

/** Re-render when the player changes state (play, pause, error): the web's useYt. */
export function useYt(yt: YtController | null) {
  const [, force] = useState(0);
  useEffect(() => yt?.onChange(() => force(x => x + 1)), [yt]);
}
