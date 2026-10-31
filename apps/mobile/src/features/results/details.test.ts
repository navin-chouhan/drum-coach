import { describe, expect, it } from 'vitest';
import { detailsView, heatColor, latencyLine, timingText, type DetailsTake } from './details';

const heat = (n: number) => Array.from({ length: n }, (_, i) => (i % 4 === 0 ? { total: 4, miss: i === 4 ? 2 : 0, meanAbsOffset: i === 4 ? 30 : 6 } : { total: 0, miss: 0, meanAbsOffset: 0 }));

function take(over: Partial<DetailsTake['options']> = {}, results: DetailsTake['results'] = []): DetailsTake {
  return {
    chart: { title: 'Money beat', bpm: 100, timeSignature: [4, 4], bars: 1, notes: [] } as unknown as DetailsTake['chart'],
    options: { fromBar: 1, toBar: 2, repeats: 3, speed: 0.8, metronome: true, subdivision: 1, countInBars: 1, wait: false, ...over },
    run: { beats: 8, beatsPerBar: 4, notes: [] },
    results,
    cues: [{ text: 'Relax your shoulders' }] as DetailsTake['cues'],
    stats: {
      total: 16, perfect: 10, good: 4, miss: 2, extra: 1, accuracy: 88, meanOffset: -12.4, spread: 18.6,
      perDrum: { kick: { total: 4, hit: 4, accuracy: 100, meanOffset: 0 }, hhOpen: { total: 4, hit: 3, accuracy: 75, meanOffset: 0 }, hhPedal: { total: 4, hit: 2, accuracy: 50, meanOffset: 0 }, hihat: { total: 4, hit: 4, accuracy: 100, meanOffset: 0 } },
      velocity: { normalMean: 84, normalCv: 12, accentMean: 110, ghostMean: null, pairDrop: null },
      flam: null, heat: heat(16), streak: 9, recoveries: 1,
    },
  };
}

describe('results details (the web Results)', () => {
  it('words the head, accuracy, timing and dynamics as the web', () => {
    const v = detailsView(take());
    expect(v.title).toBe('Money beat');
    expect(v.sub).toBe('80 BPM (80%) · bars 1–2 × 3');
    expect(v.accuracy).toMatchObject({ big: '88%', perfect: 10, good: 4, miss: 2, extra: 1 });
    expect(v.timing).toEqual({ big: 'Rushing by 12 ms', small: 'Consistency: ±19 ms (lower is steadier)', latency: undefined });
    expect(v.dynamics).toEqual({ big: '84', small: 'Average velocity · variation 12% · accents 110' });
    expect(v.tips).toEqual(['Relax your shoulders']);
  });
  it('names the drums as the web (hi-hat open and foot apart)', () => {
    expect(detailsView(take()).perDrum.map(r => [r.name, r.lane, r.accuracy])).toEqual([
      ['Kick', 'kick', 100], ['Hi-hat open', 'hihat', 75], ['Hi-hat foot', 'hihat', 50], ['Hi-hat', 'hihat', 100],
    ]);
  });
  it('labels the heat cells by count and colours them green to red', () => {
    const v = detailsView(take(), '#eee');
    expect(v.heat.slice(0, 5).map(c => c.label)).toEqual(['1', 'e', '&', 'a', '2']);
    expect(v.heat[1]).toMatchObject({ total: 0, color: '#eee', detail: 'beat 1 e: no notes' });
    expect(v.heat[4].detail).toBe('beat 2: 4 notes · 2 missed · avg ±30 ms');
    expect(heatColor({ total: 4, miss: 0, meanAbsOffset: 0 }, '').color).toBe('hsl(140, 60%, 40%)');
    expect(heatColor({ total: 4, miss: 4, meanAbsOffset: 60 }, '')).toEqual({ bad: 1, color: 'hsl(0, 60%, 30%)' });
  });
  it('wait mode: no timing, per drum or heat; counts the wrong notes', () => {
    const v = detailsView(take({ wait: true, guide: true }));
    expect(v.sub).toBe('80 BPM (80%) · bars 1–2 × 3 · wait mode · play-along');
    expect(v.accuracy).toMatchObject({ big: '1 wrong', waitNote: "Wait mode doesn't score timing. 16 notes played." });
    expect(v.timing).toBeUndefined();
    expect(v.perDrum).toEqual([]);
    expect(v.heat).toEqual([]);
  });
  it('timing text and the latency hint', () => {
    expect(timingText(3)).toBe('Right on the grid');
    expect(timingText(22.6)).toBe('Dragging by 23 ms');
    const late = Array.from({ length: 10 }, () => ({ judgement: 'good' as const, offset: 60 }));
    expect(latencyLine(take({}, late as DetailsTake['results']))).toMatch(/^Almost every stroke landed about 60 ms late\./);
    expect(latencyLine(take({ wait: true }, late as DetailsTake['results']))).toBeUndefined();
  });
});
