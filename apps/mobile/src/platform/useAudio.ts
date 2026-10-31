// The audio engine's hooks for screens (logic in audioLifecycle.ts):
// - useAudioEngine: a play screen holds the engine while it's shown, so touch pads sound before the first take and
//   after the app comes back (QA2 M2; AUDIO-DESIGN §3.4 "start() is called when a play screen mounts").
// - useAudioInterruptions: while `active`, `fn(at?)` on a call, Siri, the engine stopping (Home, a route change, a
//   media reset) or the app leaving the foreground. `at` is native's Clock time when it has one (QA2 m6).
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { audio, audioKeeper } from './audio';
import { watchInterruptions } from './audioLifecycle';

export function useAudioEngine(enabled = true) {
  useEffect(() => (enabled ? audioKeeper.hold() : undefined), [enabled]);
}

export function useAudioInterruptions(active: boolean, fn: (at?: number) => void) {
  const latest = useRef(fn);
  useEffect(() => { latest.current = fn; });
  useEffect(() => (active ? watchInterruptions(audio, AppState, at => latest.current(at)) : undefined), [active]);
}
