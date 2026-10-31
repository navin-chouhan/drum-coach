// While `active`, calls `fn` on a call, Siri, the audio engine stopping or the app leaving the foreground (QA m5):
// watchInterruptions on the app's AudioPort and React Native's AppState. `fn` may change every render.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { audio } from '../../platform/audio';
import { watchInterruptions } from './interrupt';

export function useInterruptions(active: boolean, fn: (at?: number) => void) {
  const latest = useRef(fn);
  useEffect(() => { latest.current = fn; });
  useEffect(() => (active ? watchInterruptions(audio, AppState, at => latest.current(at)) : undefined), [active]);
}
