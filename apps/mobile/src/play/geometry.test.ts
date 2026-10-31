import { describe, expect, it } from 'vitest';
import type { ChartLike } from './chartLike';
import { moneyBeat } from './dev/fixture';
import {
  beatOfStroke, beatPulse, buildPage, countInNumber, DOWNWARD_DEFAULTS, flashOpacity, highwayLayout, KIT_LANES, lanesFor,
  LEFTWARD_DEFAULTS, mainOf, markerPlace, markerSlot, msPerBeat, NOTATION_LANES, noteLabel, noteShape, pageSpan,
  positionAt, scrollFor, visiblePages,
} from './geometry';
import { drumColor } from '../ui/tokens';
import { IPAD_THEME, WEB_THEME } from './theme';

const money = moneyBeat(4, 70);

describe('lanes', () => {
  it('shows the chart lanes in notation order by default (cymbals on top, kick last)', () => {
    expect(lanesFor(money.notes, LEFTWARD_DEFAULTS)).toEqual(['hihat', 'snare', 'kick']);
  });
  it('puts open hi-hat and the pedal in the hi-hat lane', () => {
    const notes = [{ t: 0, drum: 'hhOpen' as const }, { t: 1, drum: 'hhPedal' as const }, { t: 2, drum: 'crash' as const }];
    expect(lanesFor(notes, LEFTWARD_DEFAULTS)).toEqual(['crash', 'hihat']);
  });
  it('can show every lane in the web order, or a chosen subset in the configured order', () => {
    expect(lanesFor(money.notes, DOWNWARD_DEFAULTS)).toEqual([...KIT_LANES]);
    expect(lanesFor(money.notes, { laneOrder: NOTATION_LANES, lanes: ['kick', 'ride', 'hihat'] })).toEqual(['hihat', 'ride', 'kick']);
  });
  it('never returns no lanes', () => {
    expect(lanesFor([], LEFTWARD_DEFAULTS)).toEqual(['snare']);
  });
});

describe('layout', () => {
  it('leftward: label column, lanes stacked between the head room and the count row, now a third in', () => {
    const l = highwayLayout(1146, 408, ['hihat', 'snare', 'kick'], LEFTWARD_DEFAULTS);
    expect(l.track).toEqual({ x: 132, y: 0, w: 1014, h: 408 });
    expect(l.nowAt).toBeCloseTo(338);
    const laneH = (408 - 28 - 56) / 3;
    expect(l.lanes.map(x => x.cross)).toEqual([28 + laneH / 2, 28 + laneH * 1.5, 28 + laneH * 2.5]);
    expect(l.count).toEqual({ cross: 408 - 28, size: 56 });
    expect(l.labels[1]).toMatchObject({ id: 'snare', x: 0, w: 132 });
    expect(l.pastBeats).toBeCloseTo(338 / 124);
    expect(l.futureBeats).toBeCloseTo((1014 - 338) / 124);
    expect(l.noteSize).toBeGreaterThanOrEqual(16);
    expect(l.noteSize).toBeLessThanOrEqual(44);
  });
  it('downward: lanes side by side, hit line near the bottom, labels under it', () => {
    const l = highwayLayout(800, 600, KIT_LANES, DOWNWARD_DEFAULTS);
    expect(l.track).toEqual({ x: 0, y: 0, w: 800, h: 536 });
    expect(l.lanes[0]).toEqual({ id: 'hihat', cross: 50, size: 100 });
    expect(l.nowAt).toBeCloseTo(536 * 0.94);
    expect(l.labels[7]).toMatchObject({ id: 'kick', y: 536, h: 64 });
    expect(l.sign).toBe(-1);
  });
});

describe('time → position', () => {
  it('puts the current position on the now line in both flows', () => {
    for (const o of [LEFTWARD_DEFAULTS, DOWNWARD_DEFAULTS]) {
      const l = highwayLayout(1000, 500, ['snare'], o);
      for (const pos of [-4, 0, 3.25, 17]) {
        expect(scrollFor(pos, l.nowAt, l.pxPerBeat, l.sign) + mainOf(pos, l.pxPerBeat, l.sign)).toBeCloseTo(l.nowAt);
      }
    }
  });
  it('leftward: later notes sit to the right; downward: later notes sit higher', () => {
    const left = highwayLayout(1000, 500, ['snare'], LEFTWARD_DEFAULTS);
    const down = highwayLayout(1000, 500, ['snare'], DOWNWARD_DEFAULTS);
    const screen = (l: typeof left, beat: number, pos: number) => scrollFor(pos, l.nowAt, l.pxPerBeat, l.sign) + mainOf(beat, l.pxPerBeat, l.sign);
    expect(screen(left, 3, 2) - left.nowAt).toBeCloseTo(124);
    expect(screen(down, 3, 2) - down.nowAt).toBeCloseTo(-160);
  });
  it('reads the position off the Clock: zero is heard beat 0', () => {
    const beatMs = msPerBeat(120);
    expect(beatMs).toBe(500);
    expect(positionAt(10_000, 10_000, beatMs)).toBe(0);
    expect(positionAt(9_000, 10_000, beatMs)).toBe(-2);
    expect(positionAt(11_250, 10_000, beatMs)).toBe(2.5);
  });
  it('places an extra stroke after removing the input latency', () => {
    expect(beatOfStroke(10_530, 30, 10_000, 500)).toBe(1);
  });
  it('a synthetic stream: a note crosses the line exactly when it is due', () => {
    const l = highwayLayout(1146, 408, ['hihat', 'snare', 'kick'], LEFTWARD_DEFAULTS), zero = 50_000, beatMs = msPerBeat(70);
    for (const n of money.notes) {
      const pos = positionAt(zero + n.t * beatMs, zero, beatMs);
      expect(scrollFor(pos, l.nowAt, l.pxPerBeat, l.sign) + mainOf(n.t, l.pxPerBeat, l.sign)).toBeCloseTo(l.nowAt, 6);
    }
  });
});

describe('count, pulse and flash', () => {
  it('counts 1 2 3 4 through the count-in bar', () => {
    expect([-4, -3, -2, -1].map(p => countInNumber(p + 0.1, 4))).toEqual([1, 2, 3, 4]);
    expect(countInNumber(-0.5, 3)).toBe(3);
  });
  it('pulses on the beat', () => {
    expect(beatPulse(2)).toBe(1);
    expect(beatPulse(2.125)).toBeCloseTo(0.5);
    expect(beatPulse(2.5)).toBe(0);
    expect(beatPulse(-1)).toBe(1);
  });
  it('fades a flash over its duration', () => {
    expect(flashOpacity(-1, 450)).toBe(0);
    expect(flashOpacity(0, 450)).toBe(1);
    expect(flashOpacity(225, 450)).toBe(0.5);
    expect(flashOpacity(451, 450)).toBe(0);
  });
});

describe('pages', () => {
  const span = pageSpan(money, LEFTWARD_DEFAULTS);
  it('splits the chart into 4-bar pages with the count-in on page −1', () => {
    expect(span).toEqual({ pageBeats: 16, totalBeats: 16, countInBeats: 4, bpb: 4, minPage: -1, maxPage: 0 });
    expect(pageSpan({ bars: 9, timeSignature: [6, 8] }, { pageBars: 4, countInBars: 0 })).toMatchObject({ pageBeats: 12, minPage: 0, maxPage: 2, totalBeats: 27 });
  });
  it('mounts only the pages around now', () => {
    const long = pageSpan({ bars: 100, timeSignature: [4, 4] }, LEFTWARD_DEFAULTS);
    expect(visiblePages(-4, 2.7, 5.5, long)).toEqual([-1, 0]);
    expect(visiblePages(40, 2.7, 5.5, long)).toEqual([2, 2]);
    expect(visiblePages(47, 2.7, 5.5, long)).toEqual([2, 3]);
    expect(visiblePages(10_000, 2.7, 5.5, long)).toEqual([24, 24]);
    expect(visiblePages(-100, 2.7, 5.5, long)).toEqual([-1, -1]);
  });
});

describe('page content', () => {
  const layout = highwayLayout(1146, 408, ['hihat', 'snare', 'kick'], LEFTWARD_DEFAULTS);
  const span = pageSpan(money, LEFTWARD_DEFAULTS);
  const page0 = buildPage(0, money, layout, span, IPAD_THEME, LEFTWARD_DEFAULTS);
  const countIn = buildPage(-1, money, layout, span, IPAD_THEME, LEFTWARD_DEFAULTS);

  it('draws every note once, in its lane, in the drum colour', () => {
    expect(page0.notes).toHaveLength(money.notes.length);
    const kick = page0.notes.find(n => n.lane === 'kick')!;
    expect(kick).toMatchObject({ shape: 'square', color: IPAD_THEME.drum.kick, label: 'K', cross: layout.lanes[2].cross });
    const snare = page0.notes.find(n => n.lane === 'snare')!;
    expect(snare).toMatchObject({ beat: 1, main: 124, label: 'L', color: drumColor.snare });
    expect(countIn.notes).toEqual([]);
  });
  it('bar lines with BAR n, beat lines in between, the final bar line on the last page', () => {
    const bars = page0.grid.filter(g => g.kind === 'bar');
    expect(bars.map(g => g.beat)).toEqual([0, 4, 8, 12, 16]);
    expect(bars.map(g => g.label)).toEqual(['BAR 1', 'BAR 2', 'BAR 3', 'BAR 4', undefined]);
    expect(page0.grid.filter(g => g.kind === 'beat')).toHaveLength(12);
    expect(countIn.grid.map(g => [g.beat, g.kind, g.label])).toEqual([[-4, 'bar', 'COUNT-IN'], [-3, 'beat', undefined], [-2, 'beat', undefined], [-1, 'beat', undefined]]);
  });
  it('counts "1 & 2 &" in the bars and only numbers in the count-in', () => {
    expect(page0.counts.slice(0, 5).map(c => c.text)).toEqual(['1', '&', '2', '&', '3']);
    expect(page0.counts).toHaveLength(32);
    expect(countIn.counts.map(c => c.text)).toEqual(['1', '2', '3', '4']);
    expect(countIn.counts.every(c => c.countIn)).toBe(true);
  });
  it('hides sticking letters without hints and skips lanes that are not shown', () => {
    const noHints = buildPage(0, money, layout, span, IPAD_THEME, { hints: false });
    expect(noHints.notes.every(n => n.label === '')).toBe(true);
    const onlyKick = highwayLayout(1146, 408, ['kick'], LEFTWARD_DEFAULTS);
    expect(buildPage(0, money, onlyKick, span, IPAD_THEME, LEFTWARD_DEFAULTS).notes.every(n => n.lane === 'kick')).toBe(true);
  });
  it('uses the web colours with the web theme, and grows downward (negative main) in that flow', () => {
    const down = highwayLayout(800, 600, KIT_LANES, DOWNWARD_DEFAULTS);
    const p = buildPage(0, money, down, span, WEB_THEME, DOWNWARD_DEFAULTS);
    const n = p.notes.find(x => x.beat === 2 && x.lane === 'kick')!;
    expect(n.color).toBe('#E8423F');
    expect(n.main).toBe(-320);
    expect(p.counts).toEqual([]);
  });
  it('shapes: open hi-hat ring, pedal bar, ghost notes smaller', () => {
    expect(noteShape({ t: 0, drum: 'hhOpen' })).toBe('ring');
    expect(noteShape({ t: 0, drum: 'hhPedal' })).toBe('bar');
    expect(noteLabel({ t: 0, drum: 'snare' })).toBe('');
    const ghosts: ChartLike = { bpm: 90, timeSignature: [4, 4], bars: 1, notes: [{ t: 0, drum: 'snare', ghost: true }, { t: 1, drum: 'snare', accent: true }] };
    const g = buildPage(0, ghosts, layout, pageSpan(ghosts, LEFTWARD_DEFAULTS), IPAD_THEME, LEFTWARD_DEFAULTS).notes;
    expect(g[0].size).toBeCloseTo(layout.noteSize * 0.65);
    expect(g[1]).toMatchObject({ accent: true, size: layout.noteSize });
  });
});

describe('markers', () => {
  const layout = highwayLayout(1146, 408, ['hihat', 'snare', 'kick'], LEFTWARD_DEFAULTS);
  it('marks a result over its note', () => {
    expect(markerPlace(2.5, 'snare', layout)).toEqual({ main: 310, cross: layout.lanes[1].cross, size: layout.noteSize });
    expect(markerPlace(1, 'ride', layout)).toBeNull();
  });
  it('reuses the oldest slot', () => {
    expect([0, 1, 95, 96, 97].map(n => markerSlot(n, 96))).toEqual([0, 1, 95, 0, 1]);
  });
});
