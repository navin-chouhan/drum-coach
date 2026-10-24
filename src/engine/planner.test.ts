import { describe, expect, it } from 'vitest';
import { startProgress, type Lesson, type LessonKind, type LessonProgress } from './lesson';
import { buildSession } from './planner';

const chart = { title: 't', bpm: 80, timeSignature: [4, 4] as [number, 4], bars: 1, notes: [{ t: 0, drum: 'snare' as const }] };
const L = (id: string, kind: LessonKind, tags?: Lesson['tags']): Lesson =>
  ({ id, level: 0, kind, title: id, what: '', why: '', how: '', tags, steps: [{ title: '', text: '', chart, bpm: { start: 60, target: 60 } }] });
const lessons = [L('count', 'exercise'), L('singles', 'rudiment'), L('money', 'groove'), L('rock-only', 'groove', ['rock']), L('jazz-ride', 'groove', ['jazz']), L('doubles', 'rudiment')];
const done = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, { ...startProgress(lessons[0]), completedAt: '2026-10-01', reviewDue: '2026-12-01' }])) as Record<string, LessonProgress>;
const D = '2026-10-24';
const profile = { goals: [], minutesPerDay: 25, onboarded: true };

describe('buildSession', () => {
  it('fresh student: first skill and first groove, no warm-up or review yet', () => {
    expect(buildSession(lessons, {}, profile, D)).toEqual([
      { role: 'skill', lessonId: 'count', minutes: 13 },
      { role: 'groove', lessonId: 'money', minutes: 13 },
    ]);
  });
  it('goals hide other genres; "not sure" shows everything', () => {
    const p = done('count', 'singles', 'money', 'doubles');
    expect(buildSession(lessons, p, { ...profile, goals: ['jazz'] }, D).find(i => i.role === 'groove')?.lessonId).toBe('jazz-ride');
    expect(buildSession(lessons, p, profile, D).find(i => i.role === 'groove')?.lessonId).toBe('rock-only');
  });
  it('adds a finished rudiment as warm-up and a due review', () => {
    const p = { ...done('count', 'singles'), count: { ...done('count').count, reviewDue: '2026-10-23' } };
    const s = buildSession(lessons, p, profile, D);
    expect(s.map(i => [i.role, i.lessonId])).toEqual([['warmup', 'singles'], ['review', 'count'], ['skill', 'doubles'], ['groove', 'money']]);
    expect(s.reduce((a, i) => a + i.minutes, 0)).toBeGreaterThanOrEqual(24);
  });
  it('under 20 minutes a day: only skill and groove', () => {
    const p = { ...done('count', 'singles'), count: { ...done('count').count, reviewDue: '2026-10-23' } };
    expect(buildSession(lessons, p, { ...profile, minutesPerDay: 15 }, D).map(i => i.role)).toEqual(['skill', 'groove']);
  });
});
