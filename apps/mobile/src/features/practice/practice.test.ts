import { LIBRARY } from '@drum-coach/core/content/library';
import { CURRICULUM } from '@drum-coach/core/content/curriculum';
import { DEFAULTS } from '@drum-coach/core/input/settings';
import type { RunRow } from '@drum-coach/core/engine/progress';
import { describe, expect, it } from 'vitest';
import { bestClean, chartRow, listFor, practiceCharts, requestedChart, savedCharts, segments, startOf, type PracticeChart } from './catalog';
import { CHOOSER_GESTURES, chooserModel, focusedRow, initialFocus, playLabel, stepFocus, warmRepeats } from './chooser';
import { clampBpm, clickInBar, clicksPerBar, METERS, meterLabel, nudgeBpm, readMetronome, tapTempo, writeMetronome } from './metronome';
import {
  barPickKind, clampRepeats, climbAfterTake, climbCap, flipChip, historyLine, howItPlays, needsIntro, nextChartId, pickBar,
  PLAY_DEFAULTS, playGesture, playModel, readPlayOptions, sectionChart, sectionRange, speedFor, writePlayOptions,
} from './play';

describe('section chart', () => {
  it('cuts the looped bars out, starting at beat 0', () => {
    const c = practiceCharts().find(x => x.id === 'rock-8ths')!; // 4 bars of 4/4
    expect(sectionChart(c, null)).toBe(c);
    const s = sectionChart(c, { from: 2, to: 3 });
    expect(s.bars).toBe(2);
    expect(s.notes.length).toBe(c.notes.filter(n => n.t >= 4 && n.t < 12).length);
    expect(Math.min(...s.notes.map(n => n.t))).toBe(0);
    expect(Math.max(...s.notes.map(n => n.t))).toBeLessThan(8);
  });
});

const at = (day: number, hour = 18) => new Date(2026, 9, day, hour).toISOString();
const run = (chartId: string, accuracy: number, bpm: number, day = 20, over: Partial<RunRow> = {}): RunRow => ({
  chartId, chartTitle: LIBRARY.find(c => c.id === chartId)?.title ?? chartId, startedAt: at(day), durationS: 60, bpm, speed: 1, accuracy,
  meanOffset: 5, spread: 15, notes: 32, ...over,
});
const charts = practiceCharts();
const chart = (id: string) => charts.find(c => c.id === id)!;
const memKv = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); }, remove: (k: string) => { m.delete(k); } }; };
const base = { charts, progress: {}, profile: DEFAULTS.profile, lessons: CURRICULUM };

describe('catalog', () => {
  it('lists the built-ins with tabs and counts; exercises sit under Rudiments and drills', () => {
    expect(charts).toHaveLength(LIBRARY.length);
    expect(charts.every(c => c.source === 'builtin')).toBe(true);
    const segs = segments(charts);
    expect(segs[0]).toEqual({ id: 'foryou', label: 'For you', count: undefined });
    expect(segs.find(s => s.id === 'ai')).toBeUndefined(); // no coach exercises yet
    const total = segs.filter(s => s.id !== 'foryou').reduce((a, s) => a + (s.count ?? 0), 0);
    expect(total).toBe(charts.length); // every chart has exactly one tab
    const ai: PracticeChart = { ...chart('singles'), id: 'kick-hat-x1', title: 'Kick with the hat', source: 'ai', kind: 'exercise' };
    expect(segments([...charts, ai]).find(s => s.id === 'ai')?.count).toBe(1);
    expect(listFor([...charts, ai], 'rudiment', '').map(c => c.id)).toContain('kick-hat-x1');
  });
  it('searches every exercise by title, whatever the tab', () => {
    expect(listFor(charts, 'groove', ' SINGLE ').map(c => c.id)).toEqual(['singles', 'singles-toms']);
    expect(listFor(charts, 'foryou', '')).toEqual([]);
  });
  it('gives each exercise its tempo today and best clean tempo', () => {
    const runs = [run('singles', 95, 80), run('singles', 70, 85)];
    expect(bestClean(runs, 'singles')).toBe(80);
    expect(startOf(chart('singles'), runs, { pace: 'steady' })).toBe(85); // where you left off
    expect(startOf(chart('singles'), [run('singles', 50, 85)], { pace: 'steady' })).toBe(75); // rough: 10 slower
    expect(startOf(chart('disco'), [], { pace: 'struggling' })).toBe(80); // never played, struggling: 20 under
    const row = chartRow(chart('singles'), runs, { pace: 'steady' });
    expect(row).toMatchObject({ icon: '🥢', best: 80, bestWords: 'best clean 80', plays: 'starts at 85 today · best clean 80 · 2 bars' });
    expect(chartRow(chart('disco'), runs, { pace: 'steady' }).bestWords).toBe('not played');
  });
});

describe('chooser', () => {
  it('day one: no resume card, For you picks at level 1, the ring on the first card', () => {
    const m = chooserModel({ ...base, runs: [] });
    expect(m.resume).toBeUndefined();
    expect(m.level).toBe(1);
    expect(m.cards).toHaveLength(3);
    expect(m.cards[0].why).toBe('good warm-up');
    expect(initialFocus(m)).toBe(0);
    expect(playLabel(0, m)).toBe(`▶ Play ${m.cards[0].title}`);
    expect(m.warm?.items).toHaveLength(3);
    expect(m.warm?.title).toBe('3-minute warm-up');
    expect(m.allLine).toMatch(/^Grooves \d+ · Rudiments and drills \d+ · Fills \d+/);
    expect(m.total).toBe(charts.length);
  });
  it('picks up where you left off: the last exercise played, its takes and day', () => {
    const runs = [run('disco', 92, 100, 27), run('singles', 95, 80, 28), run('singles', 80, 85, 29), run('lesson/count-quarters/1', 90, 60, 30)];
    const m = chooserModel({ ...base, runs });
    expect(m.resume?.id).toBe('singles'); // lesson takes are not Practice's
    expect(m.resume?.kicker).toBe(`played ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(at(29)).getDay()]} · 2 takes`);
    expect(m.resume?.startsAt).toBe(85);
    expect(m.cards.map(c => c.id)).not.toContain('singles');
    expect(m.cards[0]).toMatchObject({ id: 'disco', why: 'played lately' });
    expect(m.warm?.items[0]).toEqual({ id: 'singles', title: 'Single strokes (16ths)', bpm: 85, minutes: 1 });
    expect(m.warm?.items.length).toBeLessThanOrEqual(4);
    expect(initialFocus(m)).toBe(-1);
    expect(playLabel(-1, m)).toBe('▶ Play it');
    // ride × 2 moves the ring through the cards and back to the resume card
    const seen = [initialFocus(m)];
    for (let i = 0; i < 4; i++) seen.push(stepFocus(seen.at(-1)!, m));
    expect(seen).toEqual([-1, 0, 1, 2, -1]);
    expect(focusedRow(1, m)?.id).toBe(m.cards[1].id);
  });
  it('maps the kit gestures as the web chooser does', () => {
    expect(CHOOSER_GESTURES).toEqual({ yes: 'play', next: 'step', listen: 'hear', faster: 'warm' });
  });
  it('a warm-up exercise lasts about a minute', () => {
    expect(warmRepeats(chart('singles'), 70)).toBe(Math.round(70 / 4 / 2)); // 2 bars of 4/4 at 70: 9 times
    expect(warmRepeats(chart('rock-8ths'), 40)).toBe(Math.max(1, Math.round(40 / 4 / 4)));
  });
});

describe('play screen', () => {
  const read = { pace: 'steady' };
  it('remembers its options in the web key and survives junk', () => {
    const kv = memKv();
    expect(readPlayOptions(kv)).toEqual(PLAY_DEFAULTS);
    const o = writePlayOptions(kv, PLAY_DEFAULTS, { chartId: 'disco', climb: true });
    expect(readPlayOptions(kv)).toEqual(o);
    expect(JSON.parse(kv.get('drumcoach.playOptions')!).chartId).toBe('disco');
    kv.set('drumcoach.playOptions', '[1,2');
    expect(readPlayOptions(kv)).toEqual(PLAY_DEFAULTS);
  });
  it('keeps the tempo between 50% and 125% of the chart', () => {
    expect(speedFor(20, 80)).toBe(0.5);
    expect(speedFor(200, 80)).toBe(1.25);
    expect(speedFor(85, 80)).toBeCloseTo(85 / 80);
  });
  it('before the first take: starts where you left off', () => {
    const c = chart('singles');
    expect(playModel({ chart: c, options: PLAY_DEFAULTS, runs: [], read, playing: false }).main).toEqual({ kind: 'play', label: '▶ Play', bpm: 70 });
    const m = playModel({ chart: c, options: PLAY_DEFAULTS, runs: [run('singles', 50, 70)], read, playing: false });
    expect(m.main).toEqual({ kind: 'play', label: '▶ Play at 60', bpm: 60 });
    expect(m.line).toBe("Last time 70 BPM was tricky. Let's warm up at 60.");
    expect(playModel({ chart: c, options: PLAY_DEFAULTS, runs: [run('singles', 80, 70)], read, playing: false }).line).toBe('Last time 70 BPM, 80% landed. Start there?');
    expect(playModel({ chart: c, options: PLAY_DEFAULTS, runs: [], read, playing: false }).line).toBe(c.description);
  });
  it('after takes: two clean → try +5, rough → try 10 slower, else again', () => {
    const c = chart('singles'), o = PLAY_DEFAULTS;
    const two = [run('singles', 95, 70), run('singles', 92, 70)];
    const up = playModel({ chart: c, options: o, runs: two, read, playing: false, take: { accuracy: 92, hits: 32, wait: false, demo: false } });
    expect(up.main).toEqual({ kind: 'play', label: '🐇 Try 75', bpm: 75 });
    expect(up.line).toBe('Two clean takes in a row! Ready for 75?');
    expect(up.moves.map(x => x.label)).toEqual(['🎧 Hear your take', '▶ Again at 70', '🐢 −5 BPM', '⏭ Next one']);
    const rough = playModel({ chart: c, options: o, runs: [run('singles', 50, 70)], read, playing: false, take: { accuracy: 50, hits: 32, wait: false, demo: false } });
    expect(rough.main.label).toBe('🐢 Try 60');
    expect(rough.line).toBe("Let's take it to 60 and lock it in.");
    const again = playModel({ chart: c, options: o, runs: [run('singles', 80, 70)], read, playing: false, take: { accuracy: 80, hits: 32, wait: false, demo: false } });
    expect(again.main.label).toBe('▶ Again at 70');
    expect(again.line).toBe('Good. Once more at 70?');
    expect(again.moves[1]).toEqual({ id: 'faster', label: '🐇 +5 BPM', gesture: 'tom 1 × 2', bpm: 75 }); // again is the main move
    const climbed = playModel({ chart: c, options: { ...o, speed: 75 / 70 }, runs: two, read, playing: false, take: { accuracy: 92, hits: 32, wait: false, demo: false, climbed: true } });
    expect(climbed.line).toBe('Two clean takes in a row! Up to 75.');
  });
  it('the warm-up and the coach take over the main move', () => {
    const c = chart('singles'), w = { i: 0, ids: ['singles', 'disco'], titles: ['Single strokes (16ths)', 'Disco (four on the floor)'], done: true };
    const m = playModel({ chart: c, options: PLAY_DEFAULTS, runs: [], read, playing: false, warm: w });
    expect(m.main).toEqual({ kind: 'stopWarm', label: '⏹ Stop the warm-up' });
    expect(m.line).toBe('Warm-up 1 of 2 done. Next: Disco (four on the floor)…');
    expect(playModel({ chart: c, options: PLAY_DEFAULTS, runs: [], read, playing: false, warm: { ...w, done: false } }).line).toBe('Warm-up 1 of 2: Single strokes (16ths) at 70.');
    const co = playModel({ chart: c, options: PLAY_DEFAULTS, runs: [], read, playing: false, reply: { line: 'Lean back a little.', move: { label: '▶ Play the drill' } } });
    expect(co.main).toEqual({ kind: 'coach', label: '▶ Play the drill' });
    expect(co.line).toBe('Lean back a little.');
  });
  it('Climb: 2 clean takes move it up 5, never past 5 above your best', () => {
    const c = chart('singles'); // 70 BPM
    expect(climbAfterTake(c, [run('singles', 95, 70), run('singles', 92, 70)], 1)).toBeCloseTo(75 / 70);
    expect(climbAfterTake(c, [run('singles', 95, 70), run('singles', 70, 70)], 1)).toBeUndefined();
    expect(climbAfterTake(c, [], 1)).toBeUndefined();
    // D6: an interrupted take is kept but never counts towards the 2 clean takes
    expect(climbAfterTake(c, [run('singles', 95, 70), { ...run('singles', 96, 70), interrupted: true as const }], 1)).toBeUndefined();
    expect(climbAfterTake(c, [run('singles', 95, 70), { ...run('singles', 96, 70), interrupted: true as const }, run('singles', 93, 70)], 1)).toBeCloseTo(75 / 70);
    expect(climbCap(c, [run('singles', 95, 80)])).toBe(85);
    expect(climbCap(c, [])).toBe(75);
  });
  it('loops picked bars and counts times round', () => {
    expect(sectionRange(null, 4)).toEqual({ from: 1, to: 4 });
    let s = pickBar(null, 3);
    expect(s).toEqual({ from: 3, to: 3 });
    s = pickBar(s, 1);
    expect(s).toEqual({ from: 1, to: 3 });
    expect(pickBar(s, 2)).toEqual({ from: 2, to: 2 });
    expect(sectionRange({ from: 3, to: 9 }, 4)).toEqual({ from: 3, to: 4 });
    expect([barPickKind(1), barPickKind(16), barPickKind(17)]).toEqual(['none', 'buttons', 'fields']);
    expect([clampRepeats(0), clampRepeats(51), clampRepeats(4)]).toEqual([1, 50, 4]);
  });
  it('kit gestures: yes = main, tom 1 / floor = 5 faster / slower and play, ride = next', () => {
    expect(playGesture('yes', 80)).toEqual({ kind: 'main' });
    expect(playGesture('faster', 80)).toEqual({ kind: 'playAt', bpm: 85 });
    expect(playGesture('slower', 80)).toEqual({ kind: 'playAt', bpm: 75 });
    expect(playGesture('next', 80)).toEqual({ kind: 'next' });
    expect(playGesture('listen', 80)).toEqual({ kind: 'listen' });
    expect(playGesture('stop', 80)).toBeUndefined();
    expect(nextChartId(charts, charts.at(-1)!.id)).toBe(charts[0].id);
    expect(nextChartId(charts, charts[0].id)).toBe(charts[1].id);
  });
  it('says how the takes went, and when they all land late', () => {
    expect(historyLine([])).toBe('Your takes of this one show up here.');
    expect(historyLine([run('singles', 80, 70), run('singles', 91, 75)])).toBe('2 takes here. Best: 91% landed at 75 BPM.');
    const late = Array.from({ length: 5 }, () => run('singles', 80, 70, 20, { meanOffset: 70 }));
    expect(historyLine(late)).toContain('check the latency in Setup first');
    const hard = Array.from({ length: 3 }, () => run('singles', 50, 70));
    expect(historyLine(hard)).toContain('a slower tempo helps it stick');
  });
  it('intro slides before the first take or after a big tempo jump', () => {
    const p = { wait: false, introOn: true, bpm: 80 };
    expect(needsIntro(p)).toBe(true);
    expect(needsIntro({ ...p, seenBpm: 85 })).toBe(false);
    expect(needsIntro({ ...p, seenBpm: 95 })).toBe(true);
    expect(needsIntro({ ...p, demo: true })).toBe(false);
    expect(needsIntro({ ...p, warm: true })).toBe(false);
    expect(needsIntro({ ...p, introOn: false })).toBe(false);
  });
  it('How it plays: chips flip options or app settings', () => {
    const chips = howItPlays(PLAY_DEFAULTS, {});
    expect(chips.map(c => [c.id, c.on])).toEqual([['click', true], ['eighths', false], ['countIn', true], ['guide', false], ['wait', false], ['hints', true], ['intro', true]]);
    expect(flipChip('eighths', PLAY_DEFAULTS, {})).toEqual({ options: { subdivision: 2 } });
    expect(flipChip('countIn', PLAY_DEFAULTS, {})).toEqual({ options: { countInBars: 0 } });
    expect(flipChip('hints', PLAY_DEFAULTS, {})).toEqual({ settings: { hints: false } });
    expect(flipChip('intro', PLAY_DEFAULTS, { intro: false })).toEqual({ settings: { intro: true } });
  });
});

describe('metronome mode', () => {
  it('keeps the tempo in range and remembers its settings', () => {
    expect([clampBpm(10), clampBpm(400), nudgeBpm(80, 5)]).toEqual([40, 240, 85]);
    const kv = memKv();
    expect(readMetronome(kv)).toEqual({ bpm: 80, timeSignature: [4, 4], subdivision: 1 });
    writeMetronome(kv, { bpm: 120, timeSignature: [6, 8], subdivision: 2 });
    expect(readMetronome(kv)).toEqual({ bpm: 120, timeSignature: [6, 8], subdivision: 2 });
    kv.set('drumcoach.metronome', '{"bpm":9999,"timeSignature":[9,7],"subdivision":3}');
    expect(readMetronome(kv)).toEqual({ bpm: 240, timeSignature: [4, 4], subdivision: 1 });
    kv.set('drumcoach.metronome', '{"bpm":90,"beatsPerBar":3}'); // saved before the /8 meters
    expect(readMetronome(kv).timeSignature).toEqual([3, 4]);
  });
  it('taps a tempo', () => {
    expect(tapTempo([0, 500])).toBeUndefined();
    expect(tapTempo([0, 500, 1000, 1510])).toBe(120);
    expect(tapTempo([0, 500, 5000, 5500])).toBeUndefined(); // a long pause starts over
  });
});

describe('the metronome\'s meters (the web\'s TempoMode list)', () => {
  it('offers the web\'s simple, compound and odd meters', () => {
    expect(METERS.map(meterLabel)).toEqual(['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '12/8']);
  });
  it('counts the clicks of a bar as core\'s planner clicks them', () => {
    expect(clicksPerBar([4, 4])).toBe(4);
    expect(clicksPerBar([6, 8])).toBe(3); // quarter beats, as a 6/8 lesson clicks
    expect(clicksPerBar([12, 8])).toBe(6);
    expect(clicksPerBar([7, 8])).toBe(7); // every 8th
    expect(clickInBar([6, 8], -0.5)).toBe(-1);
    expect(clickInBar([6, 8], 3.2)).toBe(0);
    expect(clickInBar([7, 8], 1.5)).toBe(3);
    expect(clickInBar([7, 8], 3.5)).toBe(0);
  });
});

describe('Practice\'s saved charts and ?chartId=', () => {
  const ch = (id: string, source: 'import' | 'ai' = 'import'): PracticeChart => ({ ...LIBRARY[0], id, title: id, source });
  it('lists Storage\'s charts oldest first, then the coach\'s kv drills (newest first there) it lacks', () => {
    const saved = savedCharts({ stored: () => [ch('song-a'), ch('drill-x', 'ai')], coach: () => [ch('drill-new', 'ai'), ch('drill-x', 'ai'), ch('drill-old', 'ai')] });
    expect(saved.map(c => c.id)).toEqual(['song-a', 'drill-x', 'drill-old', 'drill-new']);
    expect(savedCharts({ stored: () => { throw new Error('db'); }, coach: () => [ch('d', 'ai')] }).map(c => c.id)).toEqual(['d']);
  });
  it('finds an imported song by the id Songs\' Play pushes', () => {
    const all = practiceCharts(savedCharts({ stored: () => [ch('my-song-abcde')] }));
    expect(requestedChart(all, 'my-song-abcde')?.source).toBe('import');
    expect(requestedChart(all, ['my-song-abcde'])?.id).toBe('my-song-abcde');
    expect(requestedChart(all, 'gone')).toBeUndefined();
    expect(requestedChart(all, undefined)).toBeUndefined();
  });
});
