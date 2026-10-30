import { describe, expect, it } from 'vitest';
import { moneyBeat } from './dev/fixture';
import { highwayLayout, LEFTWARD_DEFAULTS } from './geometry';
import { addMarker, markerFor } from './markers';
import { IPAD_THEME } from './theme';

describe('markers', () => {
  const chart = moneyBeat(1, 120);
  const layout = highwayLayout(1146, 408, ['hihat', 'snare', 'kick'], LEFTWARD_DEFAULTS);
  const ctx = { notes: chart.notes, layout, theme: IPAD_THEME, zero: 1000, beatMs: 500, latencyMs: 20 };

  it('draws a late kick as an orange rounded square with its offset', () => {
    const m = markerFor({ kind: 'judged', index: 1, lane: 'kick', judgement: 'good', offsetMs: 48, at: 1048 }, ctx, 0)!;
    expect(m).toMatchObject({ kind: 'late', fill: '#FF9500', glyph: '›', caption: '+48 ms', width: layout.noteSize * 1.3, main: 0 });
  });
  it('covers a missed note with a dashed red outline and a red ✕', () => {
    const m = markerFor({ kind: 'judged', index: 4, lane: 'snare', judgement: 'miss', at: 1600 }, ctx, 0)!;
    expect(m).toMatchObject({ kind: 'missed', dashed: true, border: '#FF3B30', fill: IPAD_THEME.background, glyphColor: '#FF3B30', main: 124 });
  });
  it('places an extra stroke where it was played, latency removed', () => {
    const m = markerFor({ kind: 'extra', lane: 'snare', at: 1000 + 20 + 250 }, ctx, 7)!;
    expect(m).toMatchObject({ key: 'x7', kind: 'extra', beat: 0.5, main: 62, fill: 'transparent' });
    expect(markerFor({ kind: 'extra', lane: 'ride', at: 1500 }, ctx, 8)).toBeNull();
    expect(markerFor({ kind: 'judged', index: 999, lane: 'snare', judgement: 'perfect', at: 0 }, ctx, 9)).toBeNull();
  });
  it('keeps one marker per note and only the newest', () => {
    const a = markerFor({ kind: 'judged', index: 0, lane: 'hihat', judgement: 'miss', at: 0 }, ctx, 0)!;
    const b = markerFor({ kind: 'judged', index: 0, lane: 'hihat', judgement: 'perfect', at: 0 }, ctx, 1)!;
    expect(addMarker([a], b)).toEqual([b]);
    const many = Array.from({ length: 70 }, (_, i) => ({ ...a, key: `k${i}` }));
    expect(many.reduce((l, m) => addMarker(l, m, 64), [] as typeof many).map(m => m.key)[0]).toBe('k6');
  });
});
