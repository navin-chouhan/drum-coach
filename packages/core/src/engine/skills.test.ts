import { describe, expect, it } from 'vitest';
import { CURRICULUM, LESSON_BY_ID } from '../content/curriculum';
import { startProgress } from './lesson';
import { placementLadder, SKILLS, skillGroups, skillMap, skillsOf } from './skills';

describe('skills (N5)', () => {
  it('each lesson trains named skills, from its id or what it plays', () => {
    expect(skillsOf(LESSON_BY_ID['count-8ths'])).toContain('time');
    expect(skillsOf(LESSON_BY_ID['flam'])).toContain('rudiments');
    expect(skillsOf(LESSON_BY_ID['ghost-notes'])).toContain('dynamics');
    expect(skillsOf(LESSON_BY_ID['shuffle'])).toContain('triplets');
    expect(skillsOf(LESSON_BY_ID['hh-16ths'])).toContain('16ths');
    expect(skillsOf(LESSON_BY_ID['money-8ths'])).toContain('independence');
    expect(skillsOf(LESSON_BY_ID['read-1'])).toContain('reading');
    expect(skillsOf(LESSON_BY_ID['fill-8ths'])).toContain('fills');
    for (const l of CURRICULUM.filter(x => !x.routine)) expect(skillsOf(l).length, l.id).toBeGreaterThan(0);
  });
  it('only the lanes the student plays count, not the ones the app plays (D5)', () => {
    const money = LESSON_BY_ID['money-8ths'];
    expect(skillsOf({ ...money, steps: [money.steps[0]] })).not.toContain('independence'); // hi-hat only, app plays kick + snare
  });
  it('mastery from finished lessons and their stars; a mastered skill not played for a while is due for review', () => {
    const p = (stars: number, completedAt: string) => ({ ...startProgress(CURRICULUM[1]), completedAt, stars });
    const map = skillMap(CURRICULUM, { 'count-8ths': p(3, '2026-10-01'), 'count-quarters': p(3, '2026-10-01'), rests: p(2, '2026-10-01') }, '2026-10-26');
    const time = map.find(s => s.id === 'time')!;
    expect(time.mastery).toBeGreaterThan(0);
    expect(time.lessons.done).toBe(3);
    expect(time.due).toBe(true); // 25 days since
    expect(map.find(s => s.id === 'triplets')!.mastery).toBe(0);
    expect(map.map(s => s.id)).toEqual(SKILLS.map(s => s.id));
  });
  it('the placement ladder: one checkpoint per stage, in path order', () => {
    const ladder = placementLadder(CURRICULUM, [{ level: 0, checkpoints: ['count-8ths', 'rests'] }, { level: 1, checkpoints: ['hh-8ths'] }] as never);
    expect(ladder.map(x => x.lessonId)).toEqual(['count-8ths', 'hh-8ths']);
  });
});

describe('skillGrowth', () => {
  it('counts only lessons finished by each month', async () => {
    const { skillGrowth } = await import('./skills');
    const { CURRICULUM } = await import('../content/curriculum');
    const g = skillGrowth(CURRICULUM, { 'count-8ths': { step: 0, bpm: 60, completedAt: '2026-10-03', stars: 3 } as never }, ['2026-09', '2026-10']);
    expect(g.time[0]).toBe(0);
    expect(g.time[1]).toBeGreaterThan(0);
  });
});

describe('skillGroups', () => {
  it('working on now (played or started), next (this stage, untouched), later (the rest)', () => {
    const g = skillGroups(CURRICULUM, { 'count-8ths': { ...startProgress(LESSON_BY_ID['count-8ths']), bpm: 50 } }, '2026-10-26', { 'count-8ths': 12 }, 0);
    const time = g.now.find(k => k.id === 'time')!;
    expect(time).toMatchObject({ started: 1, takes: 12 });
    expect(g.next.every(k => k.here && !k.takes)).toBe(true);
    expect(g.later.some(k => k.id === 'triplets')).toBe(true);
    expect(g.now.length + g.next.length + g.later.length).toBe(SKILLS.length);
  });
});
