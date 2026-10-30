import { describe, expect, it } from 'vitest';
import type { MidiInputInfo, NativeMidiPacket } from '../platform/contracts';
import { createMidiPortFrom, type DrumMidiApi, type PacketBatch } from '../platform/midiCore';
import { createMidiDebugSession, LOG_SIZE } from './midiSession';

function fake(available = true) {
  let now = 10_000;
  let packetFn: ((p: NativeMidiPacket[], b: PacketBatch) => void) | null = null;
  const api: DrumMidiApi = {
    available,
    nowMs: () => now,
    listInputs: () => [{ id: '1', name: 'e-Drum', manufacturer: 'Medeli', online: true }],
    select: () => true,
    setPreferredNames: () => true,
    getSelection: () => ({ selectedId: '1', selectedName: 'e-Drum', connectedId: '1', preferredNames: ['e-Drum'], autoSelect: true }),
    setNetworkSessionEnabled: () => false,
    getDebugInfo: () => ({ batches: 1 }),
    onPackets: fn => { packetFn = fn; return () => { packetFn = null; }; },
    onInputsChanged: () => () => {},
  };
  const send = (packets: NativeMidiPacket[]) => packetFn?.(packets, { packets, sentMs: now, reason: 'noteOn', foregroundAtMs: 0, backgroundAtMs: 0 });
  return { api, send, setNow: (t: number) => { now = t; }, subscribed: () => packetFn != null };
}

const hit = (t: number, note: number, vel: number): NativeMidiPacket => ({ bytes: [0x99, note, vel], hostTimeMs: t, nativeReceivedMs: t });

describe('createMidiDebugSession', () => {
  it('logs kit hits newest first, with pad names and spacing', () => {
    const f = fake();
    const s = createMidiDebugSession(createMidiPortFrom(f.api));
    f.send([hit(10_100, 38, 100)]);
    f.send([hit(10_225, 36, 80), { bytes: [0xf8], hostTimeMs: 10_226, nativeReceivedMs: 10_226 }]);
    const snap = s.snapshot();
    expect(snap.log.map(h => [h.name, h.atMs, h.sinceLastMs, h.emulated])).toEqual([['Kick', 225, 125, false], ['Snare', 100, null, false]]);
    expect(snap.hits).toBe(2);
    expect(snap.counters).toMatchObject({ clock: 1, noteOns: 2 });
    expect(snap.inputs[0].name).toBe('e-Drum');
    expect(snap.selection?.connectedId).toBe('1');
    expect(snap.native).toMatchObject({ batches: 1 });
  });

  it('on-screen pads go through the same bus and are marked', () => {
    const f = fake(false); // no native module: the simulator, Maestro
    const s = createMidiDebugSession(createMidiPortFrom(f.api), { listInputs: () => [] as MidiInputInfo[] });
    s.tapPad('snare');
    expect(s.snapshot().log[0]).toMatchObject({ pad: 'snare', note: 38, emulated: true });
    expect(s.snapshot().available).toBe(false);
  });

  it('keeps the last LOG_SIZE hits; reset clears; stop unsubscribes', () => {
    const f = fake();
    const s = createMidiDebugSession(createMidiPortFrom(f.api));
    for (let i = 0; i < LOG_SIZE + 5; i++) f.send([hit(10_000 + i * 200, 38, 100)]);
    expect(s.snapshot().log).toHaveLength(LOG_SIZE);
    expect(s.report()).toMatchObject({ kind: 'drum-coach-midi-debug', hits: LOG_SIZE + 5 });
    s.reset();
    expect(s.snapshot()).toMatchObject({ hits: 0, log: [] });
    expect(s.snapshot().counters.batches).toBe(0);
    s.stop();
    expect(f.subscribed()).toBe(false);
  });

  it('a throwing native call does not break the snapshot', () => {
    const f = fake();
    f.api.getSelection = () => { throw new Error('CoreMIDI error -10830'); };
    const s = createMidiDebugSession(createMidiPortFrom(f.api));
    expect(s.snapshot().selection).toBeNull();
  });
});
