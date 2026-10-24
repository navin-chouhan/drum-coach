import { describe, expect, it } from 'vitest';
import { startProgress, type Lesson, type LessonKind, type LessonProgress, type Milestone } from './lesson';
import { buildSession, candidates, currentMilestone } from './planner';

const chart = { title: 't', bpm: 80, timeSignature: [4, 4] as [number, 4], bars: 1, notes: [{ t: 0, drum: 'snare' as const }] };
const L = (id: string, level: number, kind: LessonKind, o: Partial<Lesson> = {}): Lesson =>
  ({ id, level, kind, title: id, what: '', why: '', how: '', steps: [{ title: '', text: '', chart, bpm: { start: 60, target: 60 } }], ...o });
const lessons = [
  L('count', 0, 'exercise'), L('rests', 0, 'exercise'),
  L('singles', 1, 'rudiment'), L('hands-feet', 1, 'exercise'),
  L('money', 2, 'groove'), L('doubles', 2, 'rudiment'), L('rock-only', 2, 'groove', { tags: ['rock'] }), L('jazz-only', 2, 'groove', { tags: ['jazz'] }),
];
const milestones: Milestone[] = [
  { level: 0, title: 'Ready', rank: 'R', canDo: [], checkpoints: ['rests'] },
  { level: 1, title: 'Limbs', rank: 'R', canDo: [], checkpoints: ['hands-feet'] },
  { level: 2, title: 'Money', rank: 'R', canDo: [], checkpoints: ['money', 'jazz-only'] },
];
const done = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, { ...startProgress(lessons[0]), completedAt: '2026-10-01', reviewDue: '2026-12-01' }])) as Record<string, LessonProgress>;
const D = '2026-10-24';
const profile = { goals: [], minutesPerDay: 25, onboarded: true };
const ids = (s: { lessonId: string }[]) => s.map(i => i.lessonId);

describe('milestones and planner', () => {
  it('fresh student: only lessons of the first milestone, never a groove from level 2', () => {
    expect(buildSession(milestones, lessons, {}, profile, D)).toEqual([
      { role: 'skill', lessonId: 'count', minutes: 13 }, { role: 'skill', lessonId: 'rests', minutes: 13 },
    ]);
  });
  it('a milestone is done when its checkpoints pass, even if practice lessons were skipped', () => {
    expect(currentMilestone(milestones, lessons, done('rests'), profile)?.level).toBe(1);
  });
  it('coach lessons come first; tagged lessons follow the goals', () => {
    const ai = L('ai-kick-fix', 2, 'groove', { source: 'ai' });
    const p = done('rests', 'hands-feet');
    expect(candidates(milestones, [...lessons, ai], p, { ...profile, goals: ['jazz'] }).map(l => l.id)).toEqual(['ai-kick-fix', 'money', 'doubles', 'jazz-only']);
    expect(ids(buildSession(milestones, [...lessons, ai], p, profile, D))).toEqual(['doubles', 'ai-kick-fix']);
  });
  it('hidden checkpoints do not block a milestone', () => {
    expect(currentMilestone(milestones, lessons, done('rests', 'hands-feet', 'money'), { ...profile, goals: ['rock'] })).toBeUndefined();
  });
  it('adds a finished rudiment as warm-up and a due review; short days only learn', () => {
    const p = { ...done('rests', 'singles', 'hands-feet'), rests: { ...done('rests').rests, reviewDue: '2026-10-23' } };
    const s = buildSession(milestones, lessons, p, profile, D);
    expect(s.map(i => [i.role, i.lessonId])).toEqual([['warmup', 'singles'], ['review', 'rests'], ['skill', 'doubles'], ['groove', 'money']]);
    expect(buildSession(milestones, lessons, p, { ...profile, minutesPerDay: 15 }, D).map(i => i.role)).toEqual(['skill', 'groove']);
  });
});
