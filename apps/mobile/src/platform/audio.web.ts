// The AudioPort on the web: the layout harness only (scripts/screenshots.mjs; the app is iPad-only). A silent engine
// that says yes: takes run on performance.now() (the MIDI port's fallback clock too), so a take with no hits ends on
// its results. Nothing plays. Metro picks this file for `--platform web` only.
import type { AudioRoute } from '@drum-coach/core/play/audioPort';
import type { AudioKeeper } from './audioLifecycle';
import type { DrumAudioPort } from './audioCore';

const ROUTE: AudioRoute = { key: 'Speaker:harness', kind: 'speaker', name: 'Harness (silent)', outputLatencyMs: 0, ioBufferMs: 5, sampleRate: 48_000, heardOffsetMs: 0, minLeadMs: 20 };
let scheduled = 0;

export const audio: DrumAudioPort = {
  available: true,
  clock: { now: () => performance.now() },
  start: async () => ROUTE,
  suspend: () => {},
  route: () => ROUTE,
  prepareWords: async () => ({ missing: [] }),
  schedule: events => { scheduled += events.length; return { accepted: events.length, late: 0 }; },
  cancel: () => {},
  playNow: () => performance.now(),
  setLevels: () => {},
  backing: null,
  onRouteChange: () => () => {},
  onInterruption: () => () => {},
  stats: () => ({ scheduled, late: 0, dropped: 0, engineStarts: 1 }),
  debugInfo: () => null,
  startTimingProbe: () => false,
  stopTimingProbe: () => null,
};

export const audioKeeper: AudioKeeper = {
  hold: () => () => {},
  activity: () => {},
  foreground: () => {},
  get suspended() { return false; },
  get holds() { return 0; },
};

export { busVolumes, type DrumAudioPort } from './audioCore';
