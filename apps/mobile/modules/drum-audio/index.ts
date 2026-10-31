// Drum Coach's audio module (docs/mobile/AUDIO-DESIGN.md): one AVAudioEngine, player-node pools, every sound a
// pre-rendered buffer scheduled at a mach host time (the clock of CoreMIDI timestamps) by a native lookahead loop.
// iOS only; `native` is null elsewhere. apps/mobile/src/platform/audio.ts wraps it into core's `AudioPort`.

export { native } from './src/DrumAudioModule';
export * from './src/DrumAudio.types';
export * from './src/policy';
export { EventQueue, type InsertResult, type Queued } from './src/eventQueue';
export { busOfSound, packEvents, PAD_ORDER, SOUND_INDEX, soundIndex, unpackEvents, wordKey, type PackedEvent } from './src/packing';
export { matchOnsets, summarizeTiming, type TimingSummary } from './src/timingProbe';
export * from './src/backing';
