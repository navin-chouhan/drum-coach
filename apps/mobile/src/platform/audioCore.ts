// The pure part of the iPad's AudioPort (tested in Node with a fake native module): packing, word ids, levels,
// listeners, stats and the "not available" fallbacks. audio.ts binds it to the drum-audio native module.
// Contract: packages/core/src/play/audioPort.ts. Design: docs/mobile/AUDIO-DESIGN.md §2.

import type { Clock } from '@drum-coach/core/platform';
import type { AudioEvent, AudioInterruption, AudioPort, AudioRoute, BackingPort, SoundId } from '@drum-coach/core/play/audioPort';
import { backingFilePath } from '../../modules/drum-audio/src/backing';
import type { BackingQueueResult, BackingStartResult, BusVolumes, DrumAudioApi, NativeRoute, TimingProbeResult } from '../../modules/drum-audio/src/DrumAudio.types';
import { packEvents, soundIndex, wordKey } from '../../modules/drum-audio/src/packing';

type Level = 'click' | 'drums' | 'band' | 'voice' | 'backing';

/**
 * Settings levels → bus volumes, as the web mixes them (src/play/audio.ts): clicks, synth drums and backing under
 * `master` = 0.8 × level; the band at 0.5 × bandVolume under master; the voice at voiceVolume, not under master.
 * The web has no drum level (drums follow clickVolume), so `drums` follows `click` until it is set. One difference:
 * on the web the band also follows clickVolume (it sits under master); here each bus is independent.
 */
export function busVolumes(levels: Partial<Record<Level, number>>): BusVolumes {
  const v = (x: number | undefined, fallback = 1) => Math.min(Math.max(Number.isFinite(x) ? (x as number) : fallback, 0), 1.5);
  return {
    click: 0.8 * v(levels.click),
    drums: 0.8 * v(levels.drums ?? levels.click),
    band: 0.8 * 0.5 * v(levels.band, 0.6),
    voice: v(levels.voice),
    backing: 0.8 * v(levels.backing),
  };
}

/** A native route dictionary → AudioRoute, or null when it isn't one (native returns {} before the first start). */
export function toAudioRoute(r: Partial<NativeRoute> | null | undefined): AudioRoute | null {
  if (!r || typeof r.key !== 'string' || typeof r.minLeadMs !== 'number') return null;
  return {
    key: r.key,
    kind: r.kind ?? 'other',
    name: r.name ?? r.key,
    outputLatencyMs: r.outputLatencyMs ?? 0,
    ioBufferMs: r.ioBufferMs ?? 0,
    sampleRate: r.sampleRate ?? 0,
    heardOffsetMs: r.heardOffsetMs ?? 0,
    minLeadMs: r.minLeadMs,
  };
}

/** The BackingPort plus what the audio debug screen's Backing card needs. */
export interface DrumBackingPort extends BackingPort {
  /** What native planned for the last start (or why it didn't play); null before the first. */
  lastStart(): BackingStartResult | null;
  /** What native planned for the last queued segment (or why it wasn't queued); null before the first (and after a start). */
  lastQueue(): BackingQueueResult | null;
  /** Writes the debug test tone (4-bar beat blips, 44.1 kHz) for `seconds` or more and resolves its file:// URI. */
  testTone(bpm: number, beatsPerBar: number, seconds: number): Promise<string>;
}

export const LOCAL_FILES_ONLY = 'Backing audio plays local files only (file:// or a path): never YouTube or a stream';

/**
 * core's BackingPort on the module (AUDIO-DESIGN §1.4, §6). Local files only: a URI that isn't file:// or a path is
 * refused here and again in native (CLAUDE.md: YouTube audio is never played, streamed or stored). `start`, `stop`
 * and `anchor` are synchronous JSI calls that never throw; `load` rejects with native's reason.
 */
export function createBackingPort(native: DrumAudioApi, log: (message: string, error?: unknown) => void): DrumBackingPort {
  let last: BackingStartResult | null = null;
  let lastQueued: BackingQueueResult | null = null;
  const safely = <T>(what: string, fallback: T, f: () => T): T => {
    try {
      return f();
    } catch (e) {
      log(`drum-audio ${what} failed`, e);
      return fallback;
    }
  };
  return {
    async load(uri) {
      if (backingFilePath(uri) == null) throw new Error(LOCAL_FILES_ONLY);
      const r = await native.backingLoad(uri);
      return { durationMs: r.durationMs, sampleRate: r.sampleRate };
    },
    start({ at, offsetMs, rate, durationMs }) {
      lastQueued = null;
      last = safely('backingStart', { ok: false, reason: 'native call failed' }, () => native.backingStart(at, offsetMs, rate, durationMs ?? Number.NaN));
      if (!last.ok) log(`drum-audio backing start: ${last.reason}`);
    },
    queue({ at, offsetMs, durationMs }) {
      lastQueued = safely('backingQueue', { ok: false, reason: 'native call failed' }, () => native.backingQueue(at, offsetMs, durationMs));
      if (!lastQueued.ok) log(`drum-audio backing queue: ${lastQueued.reason}`);
    },
    stop() {
      safely('backingStop', undefined, () => native.backingStop());
    },
    anchor() {
      const a = safely('backingAnchor', null, () => native.backingAnchor());
      if (!a || !a.playing || !Number.isFinite(a.at) || !Number.isFinite(a.fileMs)) return null;
      return { at: a.at, fileMs: a.fileMs };
    },
    lastStart: () => last,
    lastQueue: () => lastQueued,
    testTone: (bpm, beatsPerBar, seconds) => native.backingTestTone(bpm, beatsPerBar, seconds),
  };
}

/** The AudioPort plus what the audio debug screen needs. */
export interface DrumAudioPort extends AudioPort {
  readonly backing: DrumBackingPort | null;
  debugInfo(): Record<string, unknown> | null;
  startTimingProbe(): boolean;
  stopTimingProbe(): TimingProbeResult | null;
}

type Options = {
  /** The Clock when the module is missing (tests, web, Expo Go). Default: performance.now(). */
  fallbackClock?: Clock;
  log?: (message: string, error?: unknown) => void;
};

const NOT_AVAILABLE = 'Audio module not in this build (iOS development build needed)';

export function createAudioPort(native: DrumAudioApi | null, opts: Options = {}): DrumAudioPort {
  const log = opts.log ?? ((m, e) => console.warn(m, e));
  const clock: Clock = native
    ? { now: () => native.nowMs() }
    : (opts.fallbackClock ?? { now: () => performance.now() });
  const words = new Map<string, number>();
  let current: AudioRoute | null = null;
  let unresolved = 0; // sounds the JS side couldn't pack (unprepared words, unknown pads)
  let levels: Partial<Record<Level, number>> = {};
  const routeListeners = new Set<(r: AudioRoute) => void>();
  const interruptionListeners = new Set<(e: AudioInterruption) => void>();

  // One native subscription each, fanned out, so the cached route is always fresh.
  if (native) {
    native.addListener('onRoute', r => {
      const route = toAudioRoute(r);
      if (!route) return;
      current = route;
      for (const fn of [...routeListeners]) fn(route);
    });
    native.addListener('onInterruption', e => {
      for (const fn of [...interruptionListeners]) fn(e);
    });
  }

  const safely = <T>(what: string, fallback: T, f: () => T): T => {
    try {
      return f();
    } catch (e) {
      log(`drum-audio ${what} failed`, e);
      return fallback;
    }
  };

  return {
    available: native != null,
    clock,

    async start() {
      if (!native) throw new Error(NOT_AVAILABLE);
      const route = toAudioRoute(await native.start());
      if (!route) throw new Error('drum-audio start() returned no route');
      current = route;
      return route;
    },

    suspend() {
      if (native) safely('suspend', undefined, () => native.suspend());
    },

    route() {
      if (!native) return null;
      return current ?? safely('route', null, () => toAudioRoute(native.route()));
    },

    async prepareWords(list) {
      const keys = [...new Set(list.map(wordKey).filter(k => k !== ''))];
      if (!native) return { missing: keys };
      const todo = keys.filter(k => !words.has(k));
      if (todo.length > 0) {
        const r = await native.prepareWords(todo);
        for (const w of r.ready) words.set(w.word, w.index);
      }
      return { missing: keys.filter(k => !words.has(k)) };
    },

    schedule(events: AudioEvent[]) {
      if (!native) {
        unresolved += events.length;
        return { accepted: 0, late: 0 };
      }
      const { packed, unresolved: skipped } = packEvents(events, words);
      unresolved += skipped;
      if (packed.length === 0) return { accepted: 0, late: 0 };
      const r = safely('schedule', null, () => native.schedule(packed));
      if (!r) return { accepted: 0, late: 0 };
      return { accepted: r.accepted, late: r.late };
    },

    cancel(fromMs?: number) {
      if (native) safely('cancel', undefined, () => native.cancel(fromMs ?? null));
    },

    playNow(sound: SoundId, gain: number) {
      if (!native) return Number.NaN;
      const index = soundIndex(sound, words);
      if (index == null) {
        unresolved++;
        return Number.NaN;
      }
      return safely('playNow', Number.NaN, () => native.playNow(index, gain));
    },

    setLevels(next) {
      levels = { ...levels, ...next };
      if (native) safely('setLevels', undefined, () => native.setBusVolumes(busVolumes(levels)));
    },

    backing: native ? createBackingPort(native, log) : null,

    onRouteChange(fn) {
      routeListeners.add(fn);
      return () => void routeListeners.delete(fn);
    },

    onInterruption(fn) {
      interruptionListeners.add(fn);
      return () => void interruptionListeners.delete(fn);
    },

    stats() {
      const base = { scheduled: 0, late: 0, dropped: 0, engineStarts: 0 };
      const s = native ? safely('stats', base, () => native.stats()) : { ...base, lastError: NOT_AVAILABLE };
      return { ...s, dropped: s.dropped + unresolved };
    },

    debugInfo() {
      return native ? safely('debugInfo', null, () => native.debugInfo()) : null;
    },

    startTimingProbe() {
      return native ? safely('startTimingProbe', false, () => native.startTimingProbe()) : false;
    },

    stopTimingProbe() {
      return native ? safely('stopTimingProbe', null, () => native.stopTimingProbe()) : null;
    },
  };
}
