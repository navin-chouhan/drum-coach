import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_MAP } from '@drum-coach/core/engine/kit';
import { createHitBus, type Hit } from '@drum-coach/core/input/hits';
import type { MidiFixture } from '@drum-coach/core/input/fixtures';
import { classifyPacket, flushReason, nextDeadline, type FlushReason } from '../../modules/drum-midi/src/batchPolicy';
import type { MidiInputInfo, NativeMidiPacket } from './contracts';
import {
  connectMidiToHitBus, createMidiPortFrom, DEFAULT_PREFERRED_NAMES, isStale, RESUME_WINDOW_MS, STALE_AGE_MS,
  type AppStateLike, type DrumMidiApi, type MidiSelection, type PacketBatch,
} from './midiCore';
import { summarize } from './samples';

// ---- A fake native module: tests push batches and move its clock ----

function fakeModule(opts: { available?: boolean } = {}) {
  let now = 1_000_000;
  const packetFns = new Set<(p: NativeMidiPacket[], b: PacketBatch) => void>();
  const inputFns = new Set<(i: MidiInputInfo[], s: MidiSelection) => void>();
  const calls = { setPreferredNames: [] as string[][], select: [] as (string | null)[], nativeSubs: 0 };
  const selection: MidiSelection = { selectedId: '', selectedName: '', connectedId: '', preferredNames: [], autoSelect: false };
  const api: DrumMidiApi = {
    available: opts.available ?? true,
    nowMs: () => now,
    listInputs: () => [{ id: '101', name: 'e-Drum', manufacturer: 'Medeli', online: true }],
    select: id => { calls.select.push(id); return id != null; },
    setPreferredNames: names => { calls.setPreferredNames.push(names); return true; },
    getSelection: () => selection,
    setNetworkSessionEnabled: on => on,
    getDebugInfo: () => ({ batches: 3 }),
    onPackets: fn => { packetFns.add(fn); calls.nativeSubs++; return () => { packetFns.delete(fn); }; },
    onInputsChanged: fn => { inputFns.add(fn); return () => { inputFns.delete(fn); }; },
  };
  const send = (b: Partial<PacketBatch> & { packets: NativeMidiPacket[] }) => {
    const batch: PacketBatch = { sentMs: now, reason: 'deadline', foregroundAtMs: 0, backgroundAtMs: 0, ...b };
    packetFns.forEach(f => f(batch.packets, batch));
  };
  return {
    api, calls, send, packetFns,
    setNow: (t: number) => { now = t; },
    get now() { return now; },
    inputsChanged: (inputs: MidiInputInfo[]) => inputFns.forEach(f => f(inputs, selection)),
  };
}

const pkt = (hostTimeMs: number, ...bytes: number[]): NativeMidiPacket => ({ bytes, hostTimeMs, nativeReceivedMs: hostTimeMs });

function rig() {
  const m = fakeModule();
  const port = createMidiPortFrom(m.api);
  const bus = createHitBus({ now: port.clock.now, getNoteMap: () => DEFAULT_NOTE_MAP, getPadCal: () => ({}) });
  const hits: Hit[] = [];
  bus.onHit(h => hits.push(h));
  const link = connectMidiToHitBus(port, bus);
  return { m, port, bus, hits, link };
}

describe('createMidiPortFrom', () => {
  it("sets the contract's default preferred names (e-Drum) once", () => {
    const m = fakeModule();
    createMidiPortFrom(m.api);
    expect(m.calls.setPreferredNames).toEqual([DEFAULT_PREFERRED_NAMES]);
    expect(DEFAULT_PREFERRED_NAMES).toEqual(['e-Drum']);
  });

  it('fans one native subscription out to every listener, and drops it with the last one', () => {
    const m = fakeModule();
    const port = createMidiPortFrom(m.api);
    const a: number[] = [], b: number[] = [];
    const offA = port.onPackets(p => a.push(p.length));
    const offB = port.onBatch(x => b.push(x.packets.length));
    expect(m.calls.nativeSubs).toBe(1);
    m.send({ packets: [pkt(1, 0xf8), pkt(2, 0xf8)] });
    expect([a, b]).toEqual([[2], [2]]);
    offA(); offB();
    expect(m.packetFns.size).toBe(0);
    port.onPackets(() => {});
    expect(m.calls.nativeSubs).toBe(2);
  });

  it('keeps the latest lifecycle marks from the batches and from AppState', () => {
    const m = fakeModule();
    let appListener: (s: string) => void = () => {};
    const appState: AppStateLike = { addEventListener: (_t, fn) => { appListener = fn; return { remove() {} }; } };
    const port = createMidiPortFrom(m.api, appState);
    port.onBatch(() => {});
    m.send({ packets: [], foregroundAtMs: 500, backgroundAtMs: 400 });
    expect(port.lifecycle()).toEqual({ foregroundAtMs: 500, backgroundAtMs: 400 });
    m.setNow(2000);
    appListener('active');
    expect(port.lifecycle().foregroundAtMs).toBe(2000);
    m.send({ packets: [], foregroundAtMs: 300, backgroundAtMs: 0 }); // older marks never move it back
    expect(port.lifecycle()).toEqual({ foregroundAtMs: 2000, backgroundAtMs: 400 });
  });

  it('forwards inputs and selection calls', () => {
    const m = fakeModule();
    const port = createMidiPortFrom(m.api);
    const seen: string[][] = [];
    port.onInputsChanged(i => seen.push(i.map(x => x.name)));
    m.inputsChanged([{ id: '1', name: 'e-Drum', manufacturer: 'Medeli', online: true }]);
    expect(seen).toEqual([['e-Drum']]);
    expect(port.select('101')).toBe(true);
    expect(port.listInputs()[0].name).toBe('e-Drum');
    expect(port.debugInfo()).toMatchObject({ available: true, batches: 3 });
  });

  it('is a safe no-op without the native module', () => {
    const m = fakeModule({ available: false });
    const port = createMidiPortFrom(m.api);
    expect(m.calls.setPreferredNames).toEqual([]);
    expect(port.available).toBe(false);
    expect(port.listInputs()).toEqual([]);
    expect(port.select('1')).toBe(false);
    expect(port.setNetworkSessionEnabled(true)).toBe(false);
    expect(port.selection()).toBeNull();
    const off = port.onPackets(() => {});
    off();
    expect(m.calls.nativeSubs).toBe(0);
  });
});

describe('connectMidiToHitBus', () => {
  it('frames packets and turns note-ons into hits at their host times', () => {
    const { m, hits, link } = rig();
    m.send({
      reason: 'noteOn',
      packets: [
        pkt(1000, 0xf8),
        pkt(1001, 0x99, 38, 100), // snare
        pkt(1002, 0xf8, 0x99, 36, 0xfe, 90), // kick, realtime bytes inside it
      ],
    });
    m.send({ packets: [pkt(1100, 0x99, 38, 0), pkt(1101, 0xa9, 46, 127), pkt(1102, 0x89, 36, 64)] }); // offs and a choke
    m.send({ packets: [pkt(1200, 0x99, 42, 50, 46, 70)] }); // running status: closed then open hi-hat
    expect(hits.map(h => [h.pad, h.time])).toEqual([['snare', 1001], ['kick', 1002], ['hhClosed', 1200], ['hhOpen', 1200]]);
    expect(link.counters).toMatchObject({ batches: 3, packets: 7, clock: 2, activeSensing: 1, noteOns: 4, staleDropped: 0, timeWentBack: 0 });
    expect(link.counters.batchReasons).toEqual({ noteOn: 1, deadline: 2 });
  });

  it('a message split across packets still becomes one hit', () => {
    const { m, hits } = rig();
    m.send({ packets: [pkt(500, 0x99, 38), pkt(501, 110)] });
    expect(hits.map(h => [h.note, h.time])).toEqual([[38, 501]]);
  });

  it('clock-only batches give no hits, only counts', () => {
    const { m, hits, link } = rig();
    for (let i = 0; i < 40; i++) m.send({ packets: [pkt(i * 24.3, 0xf8), pkt(i * 24.3 + 1, 0xf8)] });
    m.send({ packets: [pkt(1000, 0xfe)] });
    expect(hits).toEqual([]);
    expect(link.counters).toMatchObject({ clock: 80, activeSensing: 1, noteOns: 0, messages: 81 });
    expect(link.delays.hit.values()).toEqual([]);
  });

  it('measures the hit, bridge and hold delays', () => {
    const { m, link } = rig();
    m.setNow(1010);
    m.send({ sentMs: 1006, packets: [{ bytes: [0xf8], hostTimeMs: 1000, nativeReceivedMs: 1000.1 }, { bytes: [0x99, 38, 90], hostTimeMs: 1005, nativeReceivedMs: 1005 }] });
    expect(link.delays.hit.values()).toEqual([5]);
    expect(link.delays.bridge.values()).toEqual([4]);
    expect(link.delays.hold.values()[0]).toBeCloseTo(5.9);
    link.reset();
    expect(link.counters.batches).toBe(0);
    expect(link.delays.hit.values()).toEqual([]);
  });

  it('counts host time going back', () => {
    const { m, link } = rig();
    m.send({ packets: [pkt(10, 0xf8), pkt(5, 0xf8)] });
    expect(link.counters.timeWentBack).toBe(1);
  });

  it('unsubscribe stops the hits', () => {
    const { m, hits, link } = rig();
    link.unsubscribe();
    m.send({ packets: [pkt(1, 0x99, 38, 100)] });
    expect(hits).toEqual([]);
  });
});

describe('stale drop after a resume (B25)', () => {
  it('isStale: old packets only right after a foreground or while backgrounded', () => {
    const fg = { foregroundAtMs: 10_000, backgroundAtMs: 5_000 };
    expect(isStale(10_000, 10_000 + STALE_AGE_MS, fg)).toBe(false); // exactly 250 ms old: kept
    expect(isStale(5_000, 10_100, fg)).toBe(true); // queued in the background, delivered 100 ms after resuming
    expect(isStale(5_000, 10_000 + RESUME_WINDOW_MS, fg)).toBe(false); // the window is over: a busy JS thread, kept
    expect(isStale(5_000, 6_000, { foregroundAtMs: 1_000, backgroundAtMs: 5_500 })).toBe(true); // still backgrounded
    expect(isStale(5_000, 6_000, { foregroundAtMs: 0, backgroundAtMs: 0 })).toBe(false); // never backgrounded
  });

  it('drops the queued strokes on resume, counts them, and keeps the fresh ones', () => {
    const { m, hits, link } = rig();
    // Backgrounded at 50 000, foreground at 98 000; CoreMIDI then hands over what it queued (48 s old) and a new stroke.
    m.setNow(98_040);
    m.send({
      foregroundAtMs: 98_000, backgroundAtMs: 50_000,
      packets: [pkt(50_100, 0x99, 38, 100), pkt(50_200, 0x99, 38, 0), pkt(98_030, 0x99, 36, 90)],
    });
    expect(hits.map(h => [h.pad, h.time])).toEqual([['kick', 98_030]]);
    expect(link.counters.staleDropped).toBe(2);
    expect(link.counters.staleMaxAgeMs).toBeCloseTo(47_940);
    expect(link.counters.noteOns).toBe(1);
  });

  it('keeps a late packet when there was no resume', () => {
    const { m, hits, link } = rig();
    m.setNow(5_400);
    m.send({ packets: [pkt(5_000, 0x99, 38, 100)] });
    expect(hits).toHaveLength(1);
    expect(link.counters.staleDropped).toBe(0);
  });
});

// ---- Parity with the web input path on the recorded fixtures, on a shifted (mach host) clock ----

const FIXTURES = new URL('../../../../packages/core/src/input/fixtures/', import.meta.url);
const fixtures: MidiFixture[] = readdirSync(FIXTURES).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(new URL(f, FIXTURES), 'utf8')) as MidiFixture);

/** The web app: Web MIDI hands each message to receiveMidi at its timeStamp (src/input/hits.ts is this same bus). */
function webHits(f: MidiFixture, zero: number): Hit[] {
  const bus = createHitBus({ now: () => zero, getNoteMap: () => f.noteMap, getPadCal: () => ({}) });
  const out: Hit[] = [];
  bus.onHit(h => out.push(h));
  for (const [t, ...data] of f.midi) bus.receiveMidi(data, zero + t);
  return out;
}

/** The fixture as native batches: one packet per message at `zero + t`, batched by the native policy (perfect timer). */
function nativeBatches(f: MidiFixture, zero: number): PacketBatch[] {
  const out: PacketBatch[] = [];
  let pending: NativeMidiPacket[] = [], deadline: number | null = null;
  const send = (sentMs: number, reason: FlushReason) => {
    out.push({ packets: pending, sentMs, reason, foregroundAtMs: 0, backgroundAtMs: 0 });
    pending = []; deadline = null;
  };
  for (const [t, ...bytes] of f.midi) {
    const at = zero + t;
    if (deadline != null && deadline <= at && pending.length) send(deadline, 'deadline');
    const kind = classifyPacket(bytes);
    pending.push({ bytes, hostTimeMs: at, nativeReceivedMs: at });
    deadline = nextDeadline(deadline, kind, at);
    const reason = flushReason(kind, pending.length, deadline, at);
    if (reason) send(at, reason);
  }
  if (pending.length && deadline != null) send(deadline, 'deadline');
  return out;
}

describe('fixture replay on the mach host clock = the web hits', () => {
  it('has the ghost-groove fixture', () => expect(fixtures.map(f => f.name)).toContain('emulated-ghost-groove'));

  for (const f of fixtures) it(`${f.name}`, () => {
    const webZero = 1_000_000, hostZero = 734_512_345.678; // performance.now() vs mach host ms: different bases
    const web = webHits(f, webZero);
    expect(web.length).toBeGreaterThan(10);

    const m = fakeModule();
    const port = createMidiPortFrom(m.api);
    const bus = createHitBus({ now: port.clock.now, getNoteMap: () => f.noteMap, getPadCal: () => ({}) });
    const got: Hit[] = [];
    bus.onHit(h => got.push(h));
    const link = connectMidiToHitBus(port, bus);
    const batches = nativeBatches(f, hostZero);
    for (const b of batches) { m.setNow(b.sentMs + 0.5); m.send(b); }

    const shift = (hs: Hit[], zero: number) => hs.map(h => ({ ...h, time: Math.round((h.time - zero) * 1000) / 1000 }));
    expect(shift(got, hostZero)).toEqual(shift(web, webZero));
    expect(link.counters.staleDropped).toBe(0);
    expect(batches.length).toBeLessThan(f.midi.length); // batching did batch
    expect(link.delays.hit.summary()?.max).toBe(0.5); // every hit was sent the moment it arrived
  });
});

describe('summarize', () => {
  it('median, nearest-rank p95, null when empty', () => {
    expect(summarize([])).toBeNull();
    expect(summarize([4, 1, 3, 2])).toMatchObject({ n: 4, min: 1, median: 2.5, p95: 4, max: 4, mean: 2.5 });
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(summarize(xs)?.p95).toBe(95);
  });
});
