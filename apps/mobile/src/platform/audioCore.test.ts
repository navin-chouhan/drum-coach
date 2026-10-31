import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { AudioInterruption, AudioPort, AudioRoute, BackingPort, SoundId } from '@drum-coach/core/play/audioPort';
import type { DrumAudioApi, DrumAudioEvents, NativeBackingAnchor, NativeRoute } from '../../modules/drum-audio/src/DrumAudio.types';
import { unpackEvents } from '../../modules/drum-audio/src/packing';
import { busVolumes, createAudioPort, LOCAL_FILES_ONLY, toAudioRoute, type DrumAudioPort } from './audioCore';

const speaker: NativeRoute = {
  key: 'Speaker', kind: 'speaker', name: 'Speaker', outputLatencyMs: 5.7, ioBufferMs: 21.3, sampleRate: 48000,
  heardOffsetMs: 5.7, minLeadMs: 37, portType: 'Speaker', uid: 'Built-In Speaker',
};

/** A fake drum-audio module: records calls, lets the test fire native events. */
function fakeNative(over: Partial<DrumAudioApi> = {}) {
  const listeners: { [K in keyof DrumAudioEvents]: DrumAudioEvents[K][] } = { onRoute: [], onInterruption: [] };
  const calls: {
    schedule: number[][]; cancel: (number | null)[]; volumes: unknown[]; playNow: [number, number][];
    backingLoad: string[]; backingStart: [number, number, number, number][]; backingQueue: [number, number, number][]; backingStop: number;
  } = { schedule: [], cancel: [], volumes: [], playNow: [], backingLoad: [], backingStart: [], backingQueue: [], backingStop: 0 };
  let now = 1e9;
  let anchor: NativeBackingAnchor = { playing: false };
  const api: DrumAudioApi = {
    nowMs: () => now,
    start: async () => speaker,
    suspend: vi.fn(),
    route: () => ({}) as NativeRoute,
    prepareWords: async words => ({
      ready: words.filter(w => w !== 'seven').map((w, i) => ({ word: w, index: 1000 + i, onsetMs: 80 })),
      missing: words.filter(w => w === 'seven'),
    }),
    schedule: packed => {
      calls.schedule.push(packed);
      return { accepted: unpackEvents(packed).events.length, late: 0, dropped: 0, invalid: 0 };
    },
    cancel: fromMs => void calls.cancel.push(fromMs),
    playNow: (index, gain) => {
      calls.playNow.push([index, gain]);
      return now + 21.3 + 5.7;
    },
    setBusVolumes: v => void calls.volumes.push(v),
    stats: () => ({ scheduled: 3, late: 1, dropped: 2, engineStarts: 1 }),
    debugInfo: () => ({ running: true }),
    startTimingProbe: () => true,
    stopTimingProbe: () => ({ onsetsMs: [], scheduledMs: [], sampleRate: 48000, tapBuffers: 0, noHostTime: 0 }),
    backingLoad: async uri => {
      calls.backingLoad.push(uri);
      return { durationMs: 8000, sampleRate: 44100, frames: 352800, channels: 1 };
    },
    backingStart: (at, offsetMs, rate, durationMs) => {
      calls.backingStart.push([at, offsetMs, rate, durationMs]);
      return { ok: true, rate, startFrame: 0, fileStartMs: offsetMs, heardAtMs: at, scheduleMs: at - 5.7, joinedLateMs: 0, pitchLatencyMs: 0, nodeTime: false };
    },
    backingQueue: (at, offsetMs, durationMs) => {
      calls.backingQueue.push([at, offsetMs, durationMs]);
      return { ok: true, playerFrame: 88_200, startFrame: 0, frameCount: 88_200, fileStartMs: offsetMs, heardAtMs: at, skippedFrames: 0, explicitTime: false, segments: 2 };
    },
    backingStop: () => void calls.backingStop++,
    backingAnchor: () => anchor,
    backingTestTone: async (bpm, bpb) => `file:///cache/backing-test-${bpm * 100}-${bpb}.caf`,
    addListener(event, fn) {
      (listeners[event] as unknown[]).push(fn);
      return { remove: () => undefined };
    },
    ...over,
  };
  return {
    api, calls, listeners,
    setNow: (ms: number) => void (now = ms),
    setAnchor: (a: NativeBackingAnchor) => void (anchor = a),
    emitRoute: (r: NativeRoute) => listeners.onRoute.forEach(fn => fn(r)),
    emitInterruption: (e: AudioInterruption) => listeners.onInterruption.forEach(fn => fn(e)),
  };
}

describe('types', () => {
  it('the port is an AudioPort; the native route is an AudioRoute', () => {
    expectTypeOf<DrumAudioPort>().toExtend<AudioPort>();
    expectTypeOf<NativeRoute>().toExtend<AudioRoute>();
  });
});

describe('createAudioPort without the module', () => {
  const port = createAudioPort(null, { fallbackClock: { now: () => 42 } });
  it('is unavailable and degrades: start rejects, the rest are no-ops', async () => {
    expect(port.available).toBe(false);
    expect(port.clock.now()).toBe(42);
    await expect(port.start()).rejects.toThrow(/not in this build/);
    expect(port.route()).toBeNull();
    expect(port.schedule([{ kind: 'sound', at: 1, sound: 'click.bar', gain: 1 }])).toEqual({ accepted: 0, late: 0 });
    expect(port.playNow('drum.snare', 1)).toBeNaN();
    expect(await port.prepareWords(['One', 'two'])).toEqual({ missing: ['one', 'two'] });
    expect(() => { port.cancel(); port.suspend(); port.setLevels({ click: 1 }); }).not.toThrow();
    expect(port.backing).toBeNull();
    expect(port.stats()).toMatchObject({ scheduled: 0, dropped: 1, lastError: expect.stringMatching(/not in this build/) });
    expect(port.debugInfo()).toBeNull();
  });
});

describe('createAudioPort on the module', () => {
  it('uses the native clock and caches the route from start()', async () => {
    const f = fakeNative();
    const port = createAudioPort(f.api);
    expect(port.available).toBe(true);
    expect(port.clock.now()).toBe(1e9);
    expect(port.route()).toBeNull(); // native says {} before start
    const r = await port.start();
    expect(r).toEqual(toAudioRoute(speaker));
    expect(r).not.toHaveProperty('portType');
    expect(port.route()).toEqual(r);
  });

  it('packs events, resolving words from prepareWords; unprepared ones count as dropped', async () => {
    const f = fakeNative();
    const port = createAudioPort(f.api);
    expect(await port.prepareWords(['One', ' two', 'seven', 'one'])).toEqual({ missing: ['seven'] });
    const at = 1e9 + 1000;
    const r = port.schedule([
      { kind: 'sound', at, sound: 'click.bar', gain: 1 },
      { kind: 'sound', at, sound: 'word.one', gain: 1 },
      { kind: 'sound', at, sound: 'word.seven', gain: 1 },
      { kind: 'band', at, part: 'bass', midi: [36], durMs: 480, vel: 100 },
    ]);
    expect(r).toEqual({ accepted: 3, late: 0 });
    expect(unpackEvents(f.calls.schedule[0]).events.map(e => (e.kind === 'sound' ? e.index : 'band'))).toEqual([0, 1000, 'band']);
    expect(port.stats()).toEqual({ scheduled: 3, late: 1, dropped: 3, engineStarts: 1 });
  });

  it('prepareWords only asks native for new words', async () => {
    const prepare = vi.fn(async (words: string[]) => ({ ready: words.map((w, i) => ({ word: w, index: 1000 + i, onsetMs: 0 })), missing: [] }));
    const port = createAudioPort(fakeNative({ prepareWords: prepare }).api);
    await port.prepareWords(['one', 'two']);
    await port.prepareWords(['two', 'three']);
    expect(prepare.mock.calls).toEqual([[['one', 'two']], [['three']]]);
  });

  it('an empty schedule never crosses to native', () => {
    const f = fakeNative();
    expect(createAudioPort(f.api).schedule([])).toEqual({ accepted: 0, late: 0 });
    expect(f.calls.schedule).toEqual([]);
  });

  it('playNow resolves the sound index; cancel passes null for "all"', () => {
    const f = fakeNative();
    const port = createAudioPort(f.api);
    expect(port.playNow('drum.snare', 0.8)).toBeCloseTo(1e9 + 27, 9);
    expect(port.playNow('drum.cowbell' as SoundId, 1) /* not a pad */).toBeNaN();
    expect(f.calls.playNow).toEqual([[11, 0.8]]);
    port.cancel();
    port.cancel(5);
    expect(f.calls.cancel).toEqual([null, 5]);
  });

  it('route and interruption events reach every listener and update the cached route', async () => {
    const f = fakeNative();
    const port = createAudioPort(f.api);
    await port.start();
    const routes: AudioRoute[] = [];
    const events: AudioInterruption[] = [];
    const offRoute = port.onRouteChange(r => routes.push(r));
    port.onInterruption(e => events.push(e));
    const bt: NativeRoute = { ...speaker, key: 'BluetoothA2DPOutput:AA', kind: 'bluetooth', outputLatencyMs: 180, heardOffsetMs: 180, minLeadMs: 211.3, portType: 'BluetoothA2DPOutput', uid: 'AA' };
    f.emitRoute(bt);
    f.emitInterruption({ type: 'began', at: 1e9 + 5, reason: 'default' });
    expect(routes.map(r => r.key)).toEqual(['BluetoothA2DPOutput:AA']);
    expect(port.route()?.kind).toBe('bluetooth');
    expect(events).toEqual([{ type: 'began', at: 1e9 + 5, reason: 'default' }]);
    offRoute();
    f.emitRoute(speaker);
    expect(routes.length).toBe(1);
    expect(port.route()?.key).toBe('Speaker');
  });

  it('a throwing native call is logged, never thrown (losing a click must not crash a take)', () => {
    const log = vi.fn();
    const port = createAudioPort(fakeNative({ schedule: () => { throw new Error('boom'); } }).api, { log });
    expect(port.schedule([{ kind: 'sound', at: 1e9 + 500, sound: 'click.beat', gain: 1 }])).toEqual({ accepted: 0, late: 0 });
    expect(log).toHaveBeenCalledOnce();
  });

  it('setLevels sends merged bus volumes', () => {
    const f = fakeNative();
    const port = createAudioPort(f.api);
    port.setLevels({ click: 1 });
    port.setLevels({ voice: 0.5 });
    expect(f.calls.volumes.at(-1)).toEqual(busVolumes({ click: 1, voice: 0.5 }));
  });
});

describe('busVolumes (the web mix)', () => {
  it('defaults: click/drums/backing 0.8, band 0.8 × 0.5 × 0.6, voice 1', () => {
    const v = busVolumes({});
    expect(v.click).toBeCloseTo(0.8);
    expect(v.drums).toBeCloseTo(0.8);
    expect(v.band).toBeCloseTo(0.24);
    expect(v.voice).toBe(1);
    expect(v.backing).toBeCloseTo(0.8);
  });
  it('drums follow the click level until set; values are clamped to 0..1.5', () => {
    expect(busVolumes({ click: 0.5 }).drums).toBeCloseTo(0.4);
    expect(busVolumes({ click: 0.5, drums: 1 }).drums).toBeCloseTo(0.8);
    expect(busVolumes({ click: 9 }).click).toBeCloseTo(1.2);
    expect(busVolumes({ voice: -1 }).voice).toBe(0);
    expect(busVolumes({ voice: Number.NaN }).voice).toBe(1);
  });
});

describe('toAudioRoute', () => {
  it('drops the raw port fields and rejects non-routes', () => {
    expect(toAudioRoute(speaker)).toEqual({
      key: 'Speaker', kind: 'speaker', name: 'Speaker', outputLatencyMs: 5.7, ioBufferMs: 21.3, sampleRate: 48000,
      heardOffsetMs: 5.7, minLeadMs: 37,
    });
    expect(toAudioRoute({})).toBeNull();
    expect(toAudioRoute(null)).toBeNull();
  });
});

describe('backing (BackingPort)', () => {
  it('is non-null on the module; load passes local files through and returns {durationMs, sampleRate}', async () => {
    const f = fakeNative();
    const port = createAudioPort(f.api);
    expect(port.backing).not.toBeNull();
    expectTypeOf(port.backing!).toExtend<BackingPort>();
    expect(await port.backing!.load('file:///var/mobile/Documents/songs/x.m4a')).toEqual({ durationMs: 8000, sampleRate: 44100 });
    expect(await port.backing!.load('/var/mobile/Documents/songs/y.m4a')).toEqual({ durationMs: 8000, sampleRate: 44100 });
    expect(f.calls.backingLoad).toEqual(['file:///var/mobile/Documents/songs/x.m4a', '/var/mobile/Documents/songs/y.m4a']);
  });

  it('refuses anything that is not a local file, before native sees it (never YouTube audio)', async () => {
    const f = fakeNative();
    const port = createAudioPort(f.api);
    for (const uri of ['https://www.youtube.com/watch?v=abc', 'http://192.168.1.2:8787/api/charts/x/audio', 'blob:x']) {
      await expect(port.backing!.load(uri)).rejects.toThrow(LOCAL_FILES_ONLY);
    }
    expect(f.calls.backingLoad).toEqual([]);
  });

  it('a native load error rejects', async () => {
    const port = createAudioPort(fakeNative({ backingLoad: async () => { throw new Error("backing: can't open x.m4a"); } }).api);
    await expect(port.backing!.load('file:///x.m4a')).rejects.toThrow(/can't open/);
  });

  it('start and stop reach native; lastStart keeps the plan', () => {
    const log = vi.fn();
    const f = fakeNative();
    const port = createAudioPort(f.api, { log });
    port.backing!.start({ at: 1e9 + 2000, offsetMs: 500, rate: 0.75 });
    port.backing!.stop();
    expect(f.calls.backingStart).toEqual([[1e9 + 2000, 500, 0.75, Number.NaN]]); // no length: NaN = to the file's end
    expect(f.calls.backingStop).toBe(1);
    expect(port.backing!.lastStart()).toMatchObject({ ok: true, heardAtMs: 1e9 + 2000 });
    expect(log).not.toHaveBeenCalled();
  });

  it('a start with a length and queued segments reach native; a start clears lastQueue', () => {
    const log = vi.fn();
    const f = fakeNative();
    const port = createAudioPort(f.api, { log });
    expect(port.backing!.lastQueue()).toBeNull();
    port.backing!.start({ at: 1e9 + 2000, offsetMs: 500, rate: 0.75, durationMs: 2400 });
    port.backing!.queue({ at: 1e9 + 5200, offsetMs: 500, durationMs: 2400 });
    expect(f.calls.backingStart).toEqual([[1e9 + 2000, 500, 0.75, 2400]]);
    expect(f.calls.backingQueue).toEqual([[1e9 + 5200, 500, 2400]]);
    expect(port.backing!.lastQueue()).toMatchObject({ ok: true, playerFrame: 88_200, explicitTime: false });
    port.backing!.start({ at: 1e9 + 9000, offsetMs: 0, rate: 1 });
    expect(port.backing!.lastQueue()).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it('a failed or throwing queue is logged, never thrown', () => {
    const log = vi.fn();
    const failing = createAudioPort(fakeNative({ backingQueue: () => ({ ok: false, reason: 'backing queue() with nothing playing' }) }).api, { log });
    failing.backing!.queue({ at: 1, offsetMs: 0, durationMs: 1000 });
    expect(failing.backing!.lastQueue()).toEqual({ ok: false, reason: 'backing queue() with nothing playing' });
    expect(log).toHaveBeenCalledOnce();
    const throwing = createAudioPort(fakeNative({ backingQueue: () => { throw new Error('boom'); } }).api, { log });
    expect(() => throwing.backing!.queue({ at: 1, offsetMs: 0, durationMs: 1000 })).not.toThrow();
    expect(throwing.backing!.lastQueue()).toMatchObject({ ok: false, reason: 'native call failed' });
  });

  it('a failed or throwing start is logged, never thrown; a throwing anchor is null', () => {
    const log = vi.fn();
    const failing = createAudioPort(fakeNative({ backingStart: () => ({ ok: false, reason: 'backing start() before load()' }) }).api, { log });
    failing.backing!.start({ at: 1, offsetMs: 0, rate: 1 });
    expect(failing.backing!.lastStart()).toEqual({ ok: false, reason: 'backing start() before load()' });
    expect(log).toHaveBeenCalledOnce();
    log.mockClear();
    const throwing = createAudioPort(fakeNative({
      backingStart: () => { throw new Error('boom'); },
      backingAnchor: () => { throw new Error('boom'); },
    }).api, { log });
    expect(() => throwing.backing!.start({ at: 1, offsetMs: 0, rate: 1 })).not.toThrow();
    expect(throwing.backing!.lastStart()).toMatchObject({ ok: false });
    expect(throwing.backing!.anchor()).toBeNull();
    expect(log.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('anchor: {at, fileMs} while playing, null otherwise or when the numbers are not finite', () => {
    const f = fakeNative();
    const port = createAudioPort(f.api);
    expect(port.backing!.anchor()).toBeNull();
    f.setAnchor({ playing: true, at: 1e9 + 1234.5, fileMs: 987.25 });
    expect(port.backing!.anchor()).toEqual({ at: 1e9 + 1234.5, fileMs: 987.25 });
    f.setAnchor({ playing: true, at: Number.NaN, fileMs: 1 });
    expect(port.backing!.anchor()).toBeNull();
  });

  it('testTone resolves the file URI', async () => {
    const port = createAudioPort(fakeNative().api);
    expect(await port.backing!.testTone(120, 4, 130)).toBe('file:///cache/backing-test-12000-4.caf');
  });
});
