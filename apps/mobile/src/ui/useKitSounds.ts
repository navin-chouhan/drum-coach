// The app root's "Play drum sounds on the iPad" (the web's browserSounds in src/ui/App.tsx): while the setting is on,
// every kit (or hardware-key) hit on the app's hit bus plays its drum through the audio port's playNow, and the audio
// engine is held so the first hit sounds. The setting is read from memory and refreshed when settings are saved.
import { useEffect } from 'react';
import { audio, audioKeeper } from '../platform/audio';
import { getStorage } from '../platform/storage';
import { startKitSounds } from '../play/kitSounds';
import { readSettings, subscribeSettings } from './appSettings';
import { getAppHitBus, useAppSettings } from './hooks';

/** The label everywhere the setting shows (Practice ⚙ More, Setup → Sound levels). */
export const KIT_SOUNDS_LABEL = 'Play drum sounds on the iPad (turn the module down)';

export function useKitSounds() {
  const { browserSounds } = useAppSettings();
  useEffect(() => {
    let on = readSettings(getStorage().kv).browserSounds;
    const offSettings = subscribeSettings(() => { on = readSettings(getStorage().kv).browserSounds; });
    const offHits = startKitSounds({ onHit: fn => getAppHitBus().onHit(fn), enabled: () => on, playNow: (s, g) => { audio.playNow(s, g); } });
    return () => { offSettings(); offHits(); };
  }, []);
  useEffect(() => (browserSounds ? audioKeeper.hold() : undefined), [browserSounds]);
}
