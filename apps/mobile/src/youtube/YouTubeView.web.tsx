// The YouTube player on the web: the layout harness only (scripts/screenshots.mjs; the app is iPad-only). A grey box
// the player's size with its controller, which never plays: no video, no network. Metro picks this file for
// `--platform web` only; the iPad uses YouTubeView.tsx (the IFrame player in a WebView).
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { createYtController, type YtController } from './ytController';
import type { YouTubeViewProps } from './YouTubeView';

export type { YouTubeViewProps } from './YouTubeView';

export function YouTubeView({ videoId, now, onPlayer, style, testID }: YouTubeViewProps) {
  const yt = useMemo(() => createYtController({ now, send: () => {} }), []); // eslint-disable-line react-hooks/exhaustive-deps -- one controller
  useEffect(() => { onPlayer(yt); }, [yt, onPlayer]);
  useEffect(() => () => yt.destroy(), [yt]);
  return (
    <View style={[{ backgroundColor: '#3a3a3a', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]} testID={testID} accessibilityLabel="YouTube video player">
      <Text style={{ color: '#ddd', fontWeight: '800' }}>YouTube player · {videoId} (harness stub)</Text>
    </View>
  );
}

/** Re-render when the player changes state: the web's useYt. */
export function useYt(yt: YtController | null) {
  const [, force] = useState(0);
  useEffect(() => yt?.onChange(() => force(x => x + 1)), [yt]);
}
