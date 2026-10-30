// The Clock on the UI thread: a shared value that a Reanimated frame callback sets every frame to the Clock time the
// frame shows. No React render per frame; animated styles read it directly. See clockSync.ts for the mapping.
import { useEffect } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { nextOffset, sampleOffset } from './clockSync';

export type UiClockOptions = {
  /** Added to every frame's time: how far ahead of the callback the frame reaches the glass (0 = none). */
  displayLeadMs?: number;
  /** How often the JS thread re-measures Clock − performance.now() (ms). */
  resyncMs?: number;
  /** False: no frame callback runs (a component that was handed a shared clock). Default true. */
  enabled?: boolean;
};

/** Clock ms for the current frame, updated on the UI thread. `now` is the app's Clock (iOS: MidiPort.clock.now). */
export function useUiClock(now: () => number, o: UiClockOptions = {}): SharedValue<number> {
  const enabled = o.enabled ?? true;
  const offset = useSharedValue(sampleOffset(now, () => performance.now()));
  const lead = useSharedValue(o.displayLeadMs ?? 0);
  const clock = useSharedValue(now());

  useEffect(() => {
    lead.value = o.displayLeadMs ?? 0;
  }, [lead, o.displayLeadMs]);

  useEffect(() => {
    if (!enabled) return;
    const resync = () => {
      offset.value = nextOffset(offset.value, sampleOffset(now, () => performance.now()));
    };
    resync();
    const id = setInterval(resync, o.resyncMs ?? 1000);
    return () => clearInterval(id);
  }, [enabled, now, offset, o.resyncMs]);

  const frames = useFrameCallback(() => {
    'worklet';
    clock.value = performance.now() + offset.value + lead.value;
  }, enabled);
  useEffect(() => frames.setActive(enabled), [frames, enabled]);

  return clock;
}
