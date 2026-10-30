// The inline YouTube player on the iPad: the official IFrame player in a WebView (dom/YouTubeDom.tsx), with its
// controller (ytController.ts: the web's YtPlayer API and song clock on the app's Clock). Mount it where the video
// shows; `onPlayer` hands the screen its controller once (a new key = a new player, as the web re-creates it).
//
// Playback never starts by itself: the player is cued, and only play() (a tap on a Songs control) or a tap on the
// video starts it. mediaPlaybackRequiresUserAction is off so those taps on native controls can start it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import YouTubeDom, { type YouTubeHandle } from './dom/YouTubeDom';
import { createYtController, type YtCommand, type YtController, type YtEvent } from './ytController';

export type YouTubeViewProps = {
  videoId: string;
  /** The app's Clock (iOS: MidiPort.clock.now), the one hits are stamped on. */
  now: () => number;
  onPlayer: (yt: YtController) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function YouTubeView({ videoId, now, onPlayer, style, testID }: YouTubeViewProps) {
  const handle = useRef<YouTubeHandle>(null);
  const nowRef = useRef(now);
  nowRef.current = now;
  const yt = useMemo(() => createYtController({
    now: () => nowRef.current(),
    send: (cmd: YtCommand) => { const h = handle.current as { command?: (c: YtCommand) => void } | null; h?.command?.(cmd); },
  }), []);
  const [first] = useState(videoId); // a version switch is yt.load(); the WebView keeps its player
  useEffect(() => { onPlayer(yt); }, [yt, onPlayer]);
  useEffect(() => () => yt.destroy(), [yt]);

  const clockNow = useCallback(async () => nowRef.current(), []);
  const onEvent = useCallback(async (e: YtEvent) => { yt.handle(e); }, [yt]);

  return (
    <View style={[{ backgroundColor: '#000', overflow: 'hidden' }, style]} testID={testID} accessibilityLabel="YouTube video player">
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
    </View>
  );
}

/** Re-render when the player changes state (play, pause, error): the web's useYt. */
export function useYt(yt: YtController | null) {
  const [, force] = useState(0);
  useEffect(() => yt?.onChange(() => force(x => x + 1)), [yt]);
}
