import { describe, expect, it } from 'vitest';
import { layoutMeasures } from '@drum-coach/core/engine/notation';
import { IPAD_THEME, WEB_THEME } from '../play/theme';
import { resultColor } from '../ui/tokens';
import type { PlayResult } from '../play/events';
import { markShowcase, moneyBeat } from './dev/fixtures';
import {
  barAt, countText, createResultLog, cursorAt, emptyMarks, hintBarMin, measureClockOffset, mergeBatch, pageBars, pageCount, pageOf,
  positionFromPerf, sheetColors, sheetGeometry, totalBarsOf, worstKind, type MeasureBox, type SheetChart,
} from './sheetModel';

const asSheet = (c: ReturnType<typeof moneyBeat>): SheetChart => ({ notes: [...c.notes], timeSignature: [c.timeSignature[0], c.timeSignature[1]], bars: c.bars });
const judged = (index: number, judgement: 'perfect' | 'good' | 'miss', offsetMs?: number): PlayResult => ({ kind: 'judged', index, lane: 'snare', judgement, offsetMs, at: 0 });

describe('chart and pages', () => {
  it('counts bars from the chart, or from a note past them', () => {
    expect(totalBarsOf(asSheet(moneyBeat(4)))).toBe(4);
    expect(totalBarsOf({ notes: [{ t: 9, drum: 'snare' }], timeSignature: [4, 4], bars: 1 })).toBe(3);
    expect(totalBarsOf({ notes: [], timeSignature: [3, 4], bars: 0 })).toBe(1);
  });

  it('zooms the iPad lesson card down from 1.6× just until two hinted bars fit side by side', () => {
    const chart = moneyBeat(4);
    // 1160 pt wide: 1.6× fits one hinted bar per row; 1.55× fits two.
    expect(sheetGeometry(1160, 520, { hints: true, notes: chart.notes, bpb: 4, scale: 1.6 }).perRow).toBe(1);
    const g = sheetGeometry(1160, 520, { hints: true, notes: chart.notes, bpb: 4 });
    expect(g.scale).toBe(1.55);
    expect(g.barMin).toBe(320);
    expect(g.perRow).toBe(2);
    expect(g.rows).toBe(1);
    expect(g.perPage).toBe(2);
    expect(pageCount(4, g.perPage)).toBe(2);
    // A taller card: two rows, the four bars on one page.
    expect(sheetGeometry(1160, 700, { hints: true, notes: chart.notes, bpb: 4 })).toMatchObject({ rows: 2, perPage: 4 });
    // Without hints, bars are narrower: 1.6× already fits two.
    expect(sheetGeometry(1160, 520, { hints: false, notes: chart.notes, bpb: 4 })).toMatchObject({ scale: 1.6, perRow: 2 });
    // Too narrow for two even at 1.2×: back to 1.6×, one bar per row. Narrow views use 1.1×; never fewer than one bar.
    expect(sheetGeometry(800, 520, { hints: true, notes: chart.notes, bpb: 4 })).toMatchObject({ scale: 1.6, perRow: 1 });
    expect(sheetGeometry(400, 100, { hints: true, notes: chart.notes, bpb: 4 })).toMatchObject({ scale: 1.1, perRow: 1, rows: 1, perPage: 1 });
  });

  it('widens hinted bars for busy counts (16ths need a syllable each)', () => {
    expect(hintBarMin(moneyBeat(1).notes, 4)).toBe(300);
    expect(hintBarMin(markShowcase().notes, 4)).toBe(24 * 16);
  });

  it('maps positions to bars and pages, count-in on page 0', () => {
    expect(barAt(-3, 4, 4)).toBe(0);
    expect(barAt(5, 4, 4)).toBe(1);
    expect(barAt(99, 4, 4)).toBe(3);
    expect(pageOf(barAt(9, 4, 4), 2)).toBe(1);
    expect(pageBars(1, 2, 5)).toEqual({ fromBar: 3, toBar: 4 });
    expect(pageBars(2, 2, 5)).toEqual({ fromBar: 5, toBar: 5 });
  });

  it('places the cursor between the drawn beats of the bar it is in', () => {
    const measures: MeasureBox[] = [
      { index: 3, x0: 0, x1: 400, y: 10, points: [{ beat: 8, x: 100 }, { beat: 10, x: 200 }, { beat: 12, x: 400 }] },
      { index: 4, x0: 400, x1: 800, y: 10, points: [{ beat: 12, x: 420 }, { beat: 16, x: 780 }] },
    ];
    expect(cursorAt(measures, 9, 4, 3)).toMatchObject({ x: 150, box: { index: 3 } });
    expect(cursorAt(measures, 14, 4, 3)).toMatchObject({ x: 600, box: { index: 4 } });
    expect(cursorAt(measures, 16, 4, 3)).toBeNull();
    expect(cursorAt(measures, 7.9, 4, 3)).toBeNull();
  });

  it('shows the count-in big and the count in the bar small', () => {
    expect(countText(-5, 4)).toEqual({ text: '', countIn: true });
    expect(countText(-4, 4)).toEqual({ text: '1', countIn: true });
    expect(countText(-0.2, 4)).toEqual({ text: '4', countIn: true });
    expect(countText(0, 4)).toEqual({ text: '1', countIn: false });
    expect(countText(6.5, 4)).toEqual({ text: '3 &', countIn: false });
    expect(countText(2.25, 3)).toEqual({ text: '3', countIn: false });
    expect(countText(16, 4, 16)).toEqual({ text: '', countIn: false }); // the take is over
    expect(countText(-Infinity, 4)).toEqual({ text: '', countIn: true }); // the Clock isn't synced yet
  });

  it('keeps the chart order the results index (the core lays out the same notes)', () => {
    const notes = markShowcase().notes.map((n, i) => ({ ...n, i }));
    const heads = layoutMeasures(notes, 4).flatMap(m => [...m.hands, ...m.feet]).flatMap(e => e.heads);
    const seen = new Set(heads.map(h => h.i));
    // Every note but a duplicate key on one spot gets a head with its index.
    expect(seen.size).toBe(notes.length);
  });
});

describe('colours', () => {
  it('uses the paper result colours of each theme (the approved tokens on the iPad theme, the web sheet tones on the web)', () => {
    expect(sheetColors(IPAD_THEME).result).toEqual(resultColor);
    const web = sheetColors(WEB_THEME);
    expect(web.result.onIt).toBe('#1E9E5A'); // the web's yellow "good" can't be read on paper
    expect(web.result.early).toBe('#C77700');
    expect(web.result.missed).toBe('#E8423F');
    expect(web.cursor).toBe('#FFE14D');
    expect(sheetColors(IPAD_THEME).cursor).toBe(IPAD_THEME.nowLine);
  });
});

describe('results across the bridge', () => {
  const timing = { zero: 1000, beatMs: 500, latencyMs: 20 };

  it('logs a take and replays it to a WebView that loads late', () => {
    const log = createResultLog();
    log.reset(1000);
    log.add(judged(0, 'perfect', 3));
    const b = log.add(judged(1, 'good', 60));
    expect(b).toEqual({ take: 1000, results: [{ seq: 1, r: judged(1, 'good', 60) }] });
    expect(log.since(1000).results.map(e => e.seq)).toEqual([0, 1]);
    expect(log.since(1000, 1).results.map(e => e.seq)).toEqual([1]);
    expect(log.since(999).results).toEqual([]);
    log.reset(5000);
    expect(log.since(5000).results).toEqual([]);
    expect(log.take).toBe(5000);
  });

  it('merges replays and live pushes without doubles, ignoring another take', () => {
    const log = createResultLog();
    log.reset(1000);
    const live1 = log.add(judged(0, 'perfect'));
    const live2 = log.add({ kind: 'extra', lane: 'snare', at: 1000 + 20 + 3.25 * 500 });
    const live3 = log.add(judged(0, 'miss')); // a later result for the same note wins
    const m = emptyMarks(1000);
    expect(mergeBatch(m, live2, timing)).toEqual({ notes: [], extras: [{ seq: 1, beat: 3.25 }] }); // ahead of the replay
    expect(mergeBatch(m, log.since(1000), timing).notes).toEqual([0]); // seq 0 is new; 1 already seen
    expect(mergeBatch(m, live1, timing)).toEqual({ notes: [], extras: [] });
    expect(m.notes.get(0)).toBe('missed');
    expect(m.extras).toEqual([{ seq: 1, beat: 3.25 }]);
    expect(mergeBatch(m, live3, timing).notes).toEqual([]);
    expect(mergeBatch(emptyMarks(2000), log.since(1000), timing)).toEqual({ notes: [], extras: [] });
  });

  it('turns judgements into the result kinds and picks the worst of a chord', () => {
    const m = emptyMarks(0);
    mergeBatch(m, { take: 0, results: [{ seq: 0, r: judged(4, 'good', -30) }, { seq: 1, r: judged(5, 'good', 30) }, { seq: 2, r: judged(6, 'perfect') }] }, { zero: 0, beatMs: 500, latencyMs: 0 });
    expect([m.notes.get(4), m.notes.get(5), m.notes.get(6)]).toEqual(['early', 'late', 'onIt']);
    expect(worstKind(['onIt', 'late', undefined])).toBe('late');
    expect(worstKind(['early', 'missed'])).toBe('missed');
    expect(worstKind([undefined])).toBeUndefined();
  });
});

describe('the Clock inside the WebView', () => {
  it('takes the tightest round trip, so a slow bridge reply does not skew the cursor', async () => {
    // WebView perf time t; the Clock is t + 50000. Replies take 2 ms, except one that took 30 ms one way.
    let t = 100;
    const delays = [[1, 1], [25, 5], [1, 1], [3, 3], [1, 1]];
    let k = 0;
    const perfNow = () => t;
    const clockNow = async () => {
      const [there, back] = delays[k++];
      t += there;
      const c = t + 50000;
      t += back;
      return c;
    };
    expect(await measureClockOffset(clockNow, perfNow)).toBe(50000);
  });

  it('turns the WebView frame time into the take position', () => {
    // beat 0 at Clock 60000; perf 9000 + offset 50000 = Clock 59000 → one beat (1000 ms at 60 BPM) before beat 0.
    expect(positionFromPerf(9000, 50000, 60000, 1000)).toBe(-1);
    expect(positionFromPerf(9000, 50000, 60000, 1000, 500)).toBe(-0.5);
  });
});
