import { describe, expect, it } from 'vitest';
import { LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import { DEFAULTS } from '@drum-coach/core/input/settings';
import { startProgress, type LessonProgress } from '@drum-coach/core/engine/lesson';
import { chartFor, frameOf, goalOf, headerOf, ladderRungs, lessonCardOf, takeOptions, boxesOf, youtubeSearch, type LessonSetup } from './lessonView';

const money = LESSON_BY_ID['money-8ths'];
const setup: LessonSetup = { lesson: money, hasNext: true };
const at = (o: Partial<LessonProgress>): LessonProgress => ({ ...startProgress(money), ...o });

describe('lesson view (LessonPlayer derived values)', () => {
  it('step 3 at 70: the mockup example (2 clean takes → 75, clean = 39 of 48 at level 2)', () => {
    const p = at({ step: 2, bpm: 70, clean: 1 });
    const f = frameOf(setup, p);
    const { chart, freeBars } = chartFor(f.step, 0, 0);
    expect(f.stepIdx).toBe(2);
    expect(f.bpm).toBe(70);
    expect(goalOf(setup, f, chart, freeBars)).toEqual({ bold: '2 clean takes in a row', text: ' and the tempo goes up to 75.', small: 'Clean = 39 of 48 notes land.' });
    expect(boxesOf(setup, f, p)).toEqual({ n: 2, ok: 1 });
    const h = headerOf(setup, f, p);
    expect(h.stepOf).toBe('Step 3 of 4');
    expect(h.pills.map(x => x.state)).toEqual(['done', 'done', 'now', '']);
    expect(h.sub).toContain('Practice');
  });

  it('builds the take options as the web does', () => {
    const p = at({ step: 2, bpm: 70 });
    const f = frameOf(setup, p), { chart, freeBars } = chartFor(f.step, 0, 0);
    const o = takeOptions(setup, f, chart, freeBars, DEFAULTS, false);
    expect(o).toMatchObject({ fromBar: 1, toBar: 1, repeats: 4, speed: 70 / chart.bpm, countInBars: 1, metronome: true, goodMs: 100, wait: false, hints: true });
    expect(o.lesson).toMatchObject({ id: 'money-8ths', step: 3, tool: 'drill' });
    expect(o.activeLanes).toEqual(['hihat', 'kick', 'snare']);
    // the proving take (last step at its target) is 8 bars
    const last = frameOf(setup, at({ step: 3, bpm: 100 })), lc = chartFor(last.step, 0, 0);
    expect(takeOptions(setup, last, lc.chart, lc.freeBars, DEFAULTS, false).repeats).toBe(4); // 2-bar chart × 4 = 8 bars
  });

  it('one-take items play the last step at the best tempo', () => {
    const p = at({ step: 3, bpm: 80, bestBpm: 95, completedAt: '2026-10-01' });
    const f = frameOf({ ...setup, role: 'review' }, p);
    expect(f.oneTake).toBe(true);
    expect(f.stepIdx).toBe(3);
    expect(f.bpm).toBe(95);
    expect(goalOf({ ...setup, role: 'review' }, f, f.step.chart, [])).toEqual({ bold: 'One take', text: ' at 95 BPM: does it still sit?' });
    expect(headerOf({ ...setup, role: 'review' }, f, p).ladder).toBeUndefined();
  });

  it('the tempo ladder: one rung per 5 BPM, the one you are on marked', () => {
    const { rungs, caption } = ladderRungs(70, 60, 90);
    expect(rungs.map(r => r.bpm)).toEqual([60, 65, 70, 75, 80, 85, 90]);
    expect(rungs.find(r => r.at)?.bpm).toBe(70);
    expect(rungs[0].start && rungs[6].goal).toBe(true);
    expect(caption).toBe('start 60 · goal 90');
    expect(ladderRungs(60, 60, 200).rungs.length).toBeLessThanOrEqual(13);
  });

  it('a layers step: the goal adds the next limb', () => {
    const l = LESSON_BY_ID['money-quarters'], s: LessonSetup = { lesson: l, hasNext: false };
    const p = { ...startProgress(l), layer: 0 };
    const f = frameOf(s, p);
    expect(f.layer).toBe(0);
    const g = goalOf(s, f, f.step.chart, []);
    expect(g.bold).toBe('A clean take');
    expect(headerOf(s, f, p).stepOf).toMatch(/^Layer 1 of /);
    expect(lessonCardOf(s, f, [], DEFAULTS).lines[0]).toMatch(/^Layer 1 of \d: a clean take adds /);
  });

  it('a rest step is resting; a trade step has free bars', () => {
    const stretch = LESSON_BY_ID.stretch;
    expect(frameOf({ lesson: stretch, role: 'stretch', hasNext: true }, startProgress(stretch)).resting).toBe(true);
    const trade = LESSON_BY_ID['trade-bars'], f = frameOf({ lesson: trade, hasNext: true }, startProgress(trade));
    const { freeBars } = chartFor(f.step, 0, 0);
    expect(freeBars).toEqual([2, 4, 6]);
    expect(goalOf({ lesson: trade, hasNext: true }, f, chartFor(f.step, 0, 0).chart, freeBars).bold).toBe('Your bars:');
  });
});

describe('a listening step', () => {
  it('finds the song on YouTube as the web does', () => {
    expect(youtubeSearch("Moanin' Art Blakey")).toBe("https://www.youtube.com/results?search_query=Moanin'%20Art%20Blakey");
  });
});
