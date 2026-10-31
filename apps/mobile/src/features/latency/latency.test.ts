import type { KeyValueStore } from '@drum-coach/core/platform';
import type { AudioRoute } from '@drum-coach/core/play/audioPort';
import { DEFAULT_NOTE_MAP } from '@drum-coach/core/engine/kit';
import { createHitBus } from '@drum-coach/core/input/hits';
import { describe, expect, it } from 'vitest';
import { clearRouteLatency, latencyRow, otherRoutes, readLatencyByRoute, routeLabel, saveRouteLatency, syncToRoute } from './latencyByRoute';
import { CLICKS, COUNT_IN, addTap, outputNote, planTapTest, startTapTest, tapEstimate, tapReadout, tapTestOver, trustworthy, verdictText } from './tapTest';

const memKv = (): KeyValueStore => { const d = new Map<string, string>(); return { get: k => d.get(k) ?? null, set: (k, v) => { d.set(k, v); }, remove: k => { d.delete(k); } }; };
const speaker: AudioRoute = { key: 'Speaker', kind: 'speaker', name: 'Speaker', outputLatencyMs: 5.7, ioBufferMs: 21.3, sampleRate: 48000, heardOffsetMs: 5.7, minLeadMs: 37 };
const hub: AudioRoute = { ...speaker, key: 'USBAudio:abc', kind: 'usb', name: 'USB-C to 3.5mm' };

describe('tap test', () => {
  it('plans 4 counted clicks then 16 scored ones, one a second, as heard times', () => {
    const p = planTapTest(10_000, speaker);
    expect(p.zero).toBe(10_300);
    expect(p.clicks).toHaveLength(CLICKS);
    expect(p.clicks[0]).toBe(10_300 + COUNT_IN * 1000);
    expect(p.clicks[1] - p.clicks[0]).toBe(1000);
    const words = p.events.filter(e => e.kind === 'sound' && e.sound.startsWith('word.'));
    expect(words.map(e => e.kind === 'sound' && e.sound)).toEqual(['word.one', 'word.two', 'word.three', 'word.four']);
    expect(p.events.filter(e => e.kind === 'sound' && e.sound === 'click.bar')).toHaveLength(5);
    expect(planTapTest(0, { minLeadMs: 500 }).zero).toBe(600);
  });

  it('measures a steady late player and words the verdict like the web', () => {
    const p = planTapTest(0, null);
    let t = startTapTest(p);
    t = addTap(t, p.clicks[0] - 1000); // during the count-in: ignored
    expect(t.taps).toHaveLength(0);
    p.clicks.forEach((c, i) => { t = addTap(t, c + 31 + (i % 3) - 1); });
    const e = tapEstimate(t)!;
    expect(e.latencyMs).toBe(31);
    expect(trustworthy(e)).toBe(true);
    expect(tapReadout(t)).toMatchObject({ hits: '16 of 16', average: '31 ms', steadyOk: true });
    expect(verdictText(e).text).toMatch(/^You hit on average 31 ms after the click \(16 taps, spread ±\d/);
    expect(tapTestOver(t, p.endsAt - 1)).toBe(false);
    expect(tapTestOver(t, p.endsAt)).toBe(true);
  });

  it('the tiles and the verdict agree (QA: "10 ms after" on the tile, "10 ms before" in the line, 17 taps of 16)', () => {
    const p = planTapTest(0, speaker);
    let t = startTapTest(p);
    p.clicks.forEach((c, i) => { t = addTap(t, c - 10 + (i % 3) - 1); });
    t = addTap(t, p.clicks[7] + 60); // a double hit on one click
    const r = tapReadout(t), e = tapEstimate(t)!;
    expect(r).toMatchObject({ hits: '16 of 16', average: '10 ms', when: 'before', steadyOk: true });
    expect(e.n).toBe(16);
    expect(verdictText(e).text).toMatch(/^You hit on average 10 ms before the click \(16 taps, spread ±/);
    expect(trustworthy(e)).toBe(true);
  });

  it('refuses too few or scattered taps', () => {
    const p = planTapTest(0, null);
    let t = startTapTest(p);
    expect(tapReadout(t).average).toBe('–');
    expect(verdictText(null)).toEqual({ text: 'Not enough taps close to the clicks. Try again.', warn: true });
    p.clicks.slice(0, 8).forEach((c, i) => { t = addTap(t, c + (i % 2 ? 120 : -100)); });
    const e = tapEstimate(t)!;
    expect(trustworthy(e)).toBe(false);
    expect(verdictText(e).text).toMatch(/Not steady enough to trust/);
  });

  it('warns about Bluetooth-size output delay', () => {
    expect(outputNote(speaker, false)).toBeNull();
    expect(outputNote({ kind: 'bluetooth', outputLatencyMs: 180 }, true)).toMatch(/adds 180 ms.*Bluetooth-size.*turn off the app's drum sounds/);
  });
});

describe('latency per route', () => {
  it('saves per route and switches latencyMs on route events', () => {
    const kv = memKv();
    expect(saveRouteLatency(kv, speaker, 31.4, new Date('2026-10-28T10:00:00Z'))).toEqual({ latencyMs: 31, latencyChecked: true });
    const all = readLatencyByRoute(kv);
    expect(all.Speaker).toMatchObject({ ms: 31, kind: 'speaker' });
    expect(syncToRoute(all, speaker, { latencyMs: 31, latencyChecked: true })).toBeNull();
    // a new output: not measured, with the web's default correction (0), not the speaker's 31 (QA2 m4)
    expect(syncToRoute(all, hub, { latencyMs: 31, latencyChecked: true })).toEqual({ latencyMs: 0, latencyChecked: false });
    expect(syncToRoute(all, hub, { latencyMs: 31, latencyChecked: false })).toEqual({ latencyMs: 0, latencyChecked: false });
    expect(syncToRoute(all, hub, { latencyMs: 0, latencyChecked: false })).toBeNull();
    saveRouteLatency(kv, hub, 12);
    expect(syncToRoute(readLatencyByRoute(kv), speaker, { latencyMs: 12, latencyChecked: true })).toEqual({ latencyMs: 31, latencyChecked: true });
    expect(syncToRoute(all, null, { latencyMs: 0, latencyChecked: false })).toBeNull();
    expect(latencyRow(readLatencyByRoute(kv), speaker, { latencyMs: 31, latencyChecked: true })).toEqual({ title: '31 ms', sub: 'iPad speakers · measured 28 Oct', measured: true });
    expect(otherRoutes(readLatencyByRoute(kv), 'Speaker')).toEqual(['USB-C to 3.5mm (USB) 12 ms']);
    expect(clearRouteLatency(kv, 'Speaker')).toEqual({ latencyMs: 0, latencyChecked: false });
    expect(latencyRow(readLatencyByRoute(kv), speaker, { latencyMs: 0, latencyChecked: false }).measured).toBe(false);
  });
  it('labels routes and survives bad storage', () => {
    expect(routeLabel(speaker)).toBe('iPad speakers');
    expect(routeLabel({ kind: 'bluetooth', name: 'AirPods' })).toBe('AirPods (Bluetooth)');
    const kv = memKv();
    kv.set('drumcoach.latencyByRoute', 'nope');
    expect(readLatencyByRoute(kv)).toEqual({});
  });
});

describe('the tap test end to end on the host clock (kit strokes through the real hit bus)', () => {
  // The iPad's numbers: clicks planned as heard times on the host clock (~1e9 ms after boot), MIDI strokes stamped on
  // the same clock, through the app's hit bus (note map, Note On only, velocity 0 = off, bounce filter).
  function run(offsets: (i: number) => number[], start = 1e9) {
    const p = planTapTest(start, speaker);
    let t = startTapTest(p);
    const bus = createHitBus({ now: () => start, getNoteMap: () => DEFAULT_NOTE_MAP, getPadCal: () => ({}) });
    bus.onHit(h => { t = addTap(t, h.time); });
    p.clicks.forEach((c, i) => offsets(i).forEach((d, k) => {
      bus.receiveMidi([0x99, 38, k ? 60 : 100], c + d); // snare, channel 10; a retrigger is softer
      bus.receiveMidi([0x99, 38, 0], c + d + 30); // the module's Note Off as velocity 0
    }));
    return { t, e: tapEstimate(t)! };
  }

  it('a steady player 25 ms late reads 25 ms after, steady', () => {
    const { e, t } = run(i => [25 + [-2, -1, 0, 1, 2][i % 5]]);
    expect(e).toMatchObject({ latencyMs: 25, n: 16 });
    expect(e.spread).toBeLessThan(10);
    expect(tapReadout(t)).toMatchObject({ hits: '16 of 16', when: 'after' });
  });

  it('pad retriggers and double hits count once per click', () => {
    // a soft retrigger 40 ms on (the bounce filter drops it) and a full second stroke 80 ms on (it doesn't)
    const { e, t } = run(i => (i === 4 ? [-12, 28] : i === 9 ? [-8, 72] : [-10]));
    expect(t.taps.length).toBe(17); // the bus let one double through
    expect(e).toMatchObject({ latencyMs: -10, n: 16 });
    expect(e.spread).toBeLessThan(5);
    expect(verdictText(e).warn).toBe(false);
  });
});
