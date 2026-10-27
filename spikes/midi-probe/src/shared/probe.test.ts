import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createProbe } from './probe';

const fixture = (name: string): { midi: number[][] } =>
  JSON.parse(readFileSync(new URL(`../../../../src/input/fixtures/${name}.json`, import.meta.url), 'utf8'));

describe('probe: counters are computed in JS from raw bytes', () => {
  it('counts a synthetic stream as packets would arrive from CoreMIDI', () => {
    const p = createProbe();
    const ev = (t: number, ...bytes: number[]) => p.ingest({ bytes, hostTimeMs: t, nativeReceivedMs: t + 0.2 }, t + 3);
    ev(0, 0xf8); ev(24, 0xf8, 0xfe);
    expect(ev(100, 0x99, 38, 90, 0xf8)).toHaveLength(1); // a hit and a clock in one packet
    ev(140, 0x99, 38, 30); // bounce: < 60 ms, < 70 %
    ev(200, 0x99, 38, 0); ev(210, 0x89, 38, 0);
    ev(300, 0xa9, 44, 127, 0xa9, 46, 127, 0xa9, 42, 127); // the pedal choke
    ev(400, 0x99, 44, 70); // pedal note: a hit (hhPedal)
    ev(500, 0x90, 38, 90); // channel 1: still a hit (any channel), counted as off-channel
    expect(p.counters).toMatchObject({
      events: 9, clock: 3, activeSensing: 1, noteOn: 4, hits: 3, filtered: 1, noteOff: 2, noteOnVel0: 1,
      polyAftertouch: 3, choke: 3, offChannel: 1, droppedBytes: 0,
    });
    expect(p.bridge.summary()).toMatchObject({ n: 9, min: 3, max: 3 });
    expect(p.native.summary()).toMatchObject({ median: 0.2 });
    expect(p.log[0]).toMatchObject({ kind: 'noteOn', channel: 1, verdict: 'hit', padName: 'Snare' });
    expect(p.log.find(e => e.verdict === 'filtered')).toMatchObject({ velocity: 30 });
    expect(p.log.some(e => e.kind === 'clock')).toBe(false); // realtime is counted, not logged by default
  });

  it('keeps the log to its size, newest first, and resets', () => {
    const p = createProbe({ logSize: 5 });
    for (let i = 0; i < 20; i++) p.ingest({ bytes: [0x99, 36, 100], hostTimeMs: i * 200, nativeReceivedMs: i * 200 }, i * 200);
    expect(p.log).toHaveLength(5);
    expect(p.log[0].hostTimeMs).toBe(3800);
    p.resetCounters(); p.resetDelay();
    expect(p.counters.hits).toBe(0);
    expect(p.log).toHaveLength(0);
    expect(p.bridge.summary()).toBeNull();
  });

  it('flags a packet timestamp that goes backwards', () => {
    const p = createProbe();
    p.ingest({ bytes: [0xf8], hostTimeMs: 100, nativeReceivedMs: 100 }, 100);
    p.ingest({ bytes: [0xf8], hostTimeMs: 90, nativeReceivedMs: 101 }, 101);
    expect(p.counters.timeWentBack).toBe(1);
  });

  it('the emulated ghost-groove fixture: every clock counted, retriggers and crosstalk filtered', () => {
    const { midi } = fixture('emulated-ghost-groove');
    const p = createProbe();
    for (const [t, ...bytes] of midi) p.ingest({ bytes, hostTimeMs: t, nativeReceivedMs: t }, t);
    const c = p.counters;
    expect(c.clock).toBe(midi.filter(m => m[1] === 0xf8).length);
    expect(c.activeSensing).toBe(midi.filter(m => m[1] === 0xfe).length);
    expect(c.noteOn).toBe(midi.filter(m => (m[1] & 0xf0) === 0x90 && m[3] > 0).length);
    expect(c.filtered).toBeGreaterThan(0);
    expect(c.hits + c.filtered).toBe(c.noteOn);
    expect(c.offChannel).toBe(0);
  });

  it('notifies hit listeners', () => {
    const p = createProbe(), got: number[] = [];
    const off = p.onHit(h => got.push(h.note));
    p.ingest({ bytes: [0x99, 36, 100, 0x99, 38, 100], hostTimeMs: 0, nativeReceivedMs: 0 }, 0);
    off();
    p.ingest({ bytes: [0x99, 36, 100], hostTimeMs: 500, nativeReceivedMs: 500 }, 500);
    expect(got).toEqual([36, 38]);
  });
});
