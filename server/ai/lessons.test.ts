import { describe, expect, it } from 'vitest';
import { AiLessonSchema } from '../../src/coach/schemas';
import { CURRICULUM } from '../../src/content/curriculum';
import { startProgress } from '../../src/engine/lesson';
import { lessonInput, toLesson } from './lessons';

const profile = { goals: [], minutesPerDay: 25, onboarded: true };
const done = () => ({ ...startProgress(CURRICULUM[0]), completedAt: '2026-10-01' });

describe('coach lessons', () => {
  it('a built-in lesson (minus ids) is a valid coach answer', () => {
    const l = CURRICULUM.find(x => x.id === 'money-8ths')!;
    expect(AiLessonSchema.safeParse({ ...l, focus: 'x', steps: l.steps.map(s => ({ ...s, chart: { ...s.chart, id: undefined } })) }).success).toBe(true);
  });
  it('rejects a lesson whose active lane has no notes, or start above target', () => {
    const l = CURRICULUM.find(x => x.id === 'money-8ths')!, s = l.steps[0];
    const bad = (step: object) => AiLessonSchema.safeParse({ ...l, focus: '', steps: [{ ...s, ...step }] }).success;
    expect(bad({ activeLanes: ['ride'] })).toBe(false);
    expect(bad({ bpm: { start: 90, target: 80 } })).toBe(false);
  });
  it('input targets the current milestone and includes the evidence', () => {
    const input = lessonInput({ profile, progress: { 'count-8ths': done(), rests: done() }, aiLessons: [], recent: [{ chart: 'x', at: '2026-10-24', bpm: 60, accuracy: 70, summary: {} }] })!;
    expect(input.milestone.level).toBe(1);
    expect(input.milestone.checkpoints.map(c => c.id)).toEqual(['singles', 'hh-8ths', 'hands-feet']);
    expect(input.examples.every(e => CURRICULUM.find(l => l.id === e.id)!.level === 1)).toBe(true);
    expect(input.recentRuns).toHaveLength(1);
  });
  it('stored lessons get an ai- id, the milestone level and chart ids', () => {
    const l = CURRICULUM.find(x => x.id === 'money-8ths')!;
    const out = toLesson({ ...l, focus: 'f' }, 2, 'abcde');
    expect(out).toMatchObject({ id: 'ai-the-money-beat-abcde', level: 2, source: 'ai' });
    expect(out.steps[1].chart.id).toBe('lesson/ai-the-money-beat-abcde/2');
  });
});
