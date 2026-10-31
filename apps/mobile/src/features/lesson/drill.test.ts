import { describe, expect, it } from 'vitest';
import { LIBRARY } from '@drum-coach/core/content/library';
import { startProgress } from '@drum-coach/core/engine/lesson';
import { drillLesson, findDrillChart, parseBpm } from './drill';
import { frameOf, goalOf } from './lessonView';

describe('/lesson/chart (a coach drill)', () => {
  it('finds the chart in the library or the coach charts, and plays it as one take', () => {
    const c = LIBRARY[0];
    expect(findDrillChart(c.id, () => undefined)).toBe(c);
    const saved = { ...c, id: 'ai-kick-hat' };
    expect(findDrillChart('ai-kick-hat', id => (id === saved.id ? saved : undefined))).toBe(saved);
    expect(findDrillChart('nope', () => undefined)).toBeUndefined();
    const l = drillLesson(c, 65), setup = { lesson: l, hasNext: false, drill: true };
    const f = frameOf(setup, startProgress(l));
    expect(f.oneTake).toBe(true);
    expect(f.bpm).toBe(65);
    expect(goalOf(setup, f, c, [])).toEqual({ bold: 'One take', text: ' at 65 BPM.' });
    expect(drillLesson(c, 999).steps[0].bpm.start).toBe(Math.round(c.bpm));
    expect(parseBpm('72')).toBe(72);
    expect(parseBpm(undefined)).toBeUndefined();
  });
});
