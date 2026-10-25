import { describe, expect, it } from 'vitest';
import { AiLessonSchema, RunRecordSchema } from '../../src/coach/schemas';
import { CURRICULUM } from '../../src/content/curriculum';
import { startProgress } from '../../src/engine/lesson';
import { applyBites, canStandIn, lessonInput, toLesson } from './lessons';

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
  it('takes of a stage-1 coach lesson with the longest titles can be saved', () => {
    const l = CURRICULUM.find(x => x.id === 'money-8ths')!;
    const out = toLesson({ ...l, focus: 'f', title: 'x'.repeat(80), steps: l.steps.map(s => ({ ...s, title: 'y'.repeat(60) })) }, 0);
    const c = out.steps[0].chart;
    expect(RunRecordSchema.safeParse({ chartId: c.id, chartTitle: c.title, level: out.level, startedAt: '2026-10-24T20:00:00.000Z',
      durationS: 20, bpm: 60, speed: 1, accuracy: 90, meanOffset: 0, spread: 10, summary: {} }).success).toBe(true);
  });
  it('a song bite gets the song bars as its chart; an unknown song drops the bite', () => {
    const l = CURRICULUM.find(x => x.id === 'money-8ths')!, step = { ...l.steps[0], bite: { songId: 'yt1', fromBar: 2, toBar: 2 } };
    const song = { id: 'yt1', title: 'Song', originalId: 'a', drumlessId: null, coverId: null, timeSignature: [4, 4] as [number, 4], grids: {},
      notes: [{ t: 0, drum: 'kick' as const }, { t: 4, drum: 'snare' as const }, { t: 5.5, drum: 'hihat' as const }] };
    const out = applyBites({ ...l, focus: '', steps: [step] }, id => (id === 'yt1' ? song : undefined));
    expect(out.steps[0]).toMatchObject({ bite: { title: 'Song' }, chart: { bars: 1, notes: [{ t: 0, drum: 'snare' }, { t: 1.5, drum: 'hihat' }] } });
    expect(applyBites({ ...l, focus: '', steps: [step] }, () => undefined).steps[0].bite).toBeUndefined();
  });
  it('only a lesson that ends by playing written notes can stand in for a checkpoint', () => {
    expect([{}, { layers: [['hihat' as const]] }, { bite: { songId: 'x', fromBar: 1, toBar: 2 } }].map(canStandIn)).toEqual([true, true, true]);
    expect([{ jam: true }, { copy: true }, { trade: true }, { freeBars: [4] }, { pass: { streak: 8 } }].map(canStandIn)).toEqual([false, false, false, false, false]);
  });
});
