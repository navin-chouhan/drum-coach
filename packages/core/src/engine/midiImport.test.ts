import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { midiToChart } from './midiImport';

function makeMidi(channel = 9) {
  const m = new Midi();
  m.header.setTempo(100);
  m.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  m.header.update();
  m.name = 'Test Song';
  const tr = m.addTrack();
  tr.channel = channel;
  const beat = 60 / 100;
  [[36, 0, 0.9], [42, 0, 0.6], [38, 1, 0.6], [42, 1, 0.6], [46, 1.5, 0.6], [38, 1.75, 0.2], [56, 2, 0.6], [49, 4, 0.6]]
    .forEach(([midi, b, velocity]) => tr.addNote({ midi, time: b * beat, duration: 0.05, velocity }));
  return m.toArray();
}

describe('midiToChart', () => {
  it('converts the channel-10 track into chart notes in beats', () => {
    const { chart, ignored, drumTracks } = midiToChart(makeMidi());
    expect(chart).toMatchObject({ title: 'Test Song', bpm: 100, timeSignature: [4, 4], bars: 2, kind: 'song' });
    expect(drumTracks).toBe(1);
    expect(ignored).toBe(1); // cowbell (56)
    expect(chart.notes).toEqual([
      { t: 0, drum: 'kick', accent: true }, { t: 0, drum: 'hihat' },
      { t: 1, drum: 'snare' }, { t: 1, drum: 'hihat' }, { t: 1.5, drum: 'hhOpen' },
      { t: 1.75, drum: 'snare', ghost: true }, { t: 4, drum: 'crash' },
    ].sort((a, b) => a.t - b.t || 0).map(n => expect.objectContaining(n)));
  });
  it('fails clearly without a drum track', () => {
    expect(() => midiToChart(makeMidi(0))).toThrow(/channel 10/);
  });
});
