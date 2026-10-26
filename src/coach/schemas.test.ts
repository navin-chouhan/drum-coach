import { describe, expect, it } from 'vitest';
import { CoachReplySchema, GrooveSchema, PlanSchema, TipsSchema } from './schemas';

describe('TipsSchema', () => {
  it('drops a tip that is too long instead of failing the whole answer', () => {
    const r = TipsSchema.parse({ tips: {
      rushing: { text: 'Ease back.', spoken: 'Ease back' },
      dragging: { text: 'x'.repeat(71), spoken: 'Push it' },
      praise: { text: 'Nice!', spoken: 'y'.repeat(46) },
    } });
    expect(Object.keys(r.tips)).toEqual(['rushing']);
  });
});

describe('CoachReplySchema', () => {
  it('accepts the tools the coach can switch to for one take', () => {
    for (const kind of ['trade', 'count', 'layers', 'listen'])
      expect(CoachReplySchema.safeParse({ say: 'Trade bars with me', action: { kind, label: 'Go' } }).success).toBe(true);
  });
  it('drops an overlong "show" (the screen falls back to "say") instead of failing the reply', () => {
    expect(CoachReplySchema.parse({ say: 'Nice.', show: 'Lift the kick foot a hair sooner.' }).show).toBe('Lift the kick foot a hair sooner.');
    const long = CoachReplySchema.parse({ say: 'Nice.', show: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen' });
    expect(long.show).toBeUndefined();
    expect(long.say).toBe('Nice.');
  });
});

describe('GrooveSchema', () => {
  it('says how sure the coach is; an answer without it (or with a made-up value) is a style guess', () => {
    expect(GrooveSchema.parse({ reply: 'Eighths on the hat.', confidence: 'know' }).confidence).toBe('know');
    expect(GrooveSchema.parse({ reply: 'Eighths on the hat.' }).confidence).toBe('style-guess');
    expect(GrooveSchema.parse({ reply: 'Eighths on the hat.', confidence: 'sure' }).confidence).toBe('style-guess');
  });
});

describe('PlanSchema (R6)', () => {
  it('a weekly focus with lessons and the coach\'s notebook; old plans with only days still parse', () => {
    const p = PlanSchema.parse({ title: 'Left hand week', focus: 'your left hand on the hi-hat', why: 'the & notes land 30 ms late', lessonIds: ['hh-8ths', 'singles'], drums: ['hihat'], notes: 'Slow is working; try 75 next week.' });
    expect(p.lessonIds).toEqual(['hh-8ths', 'singles']);
    expect(PlanSchema.parse({ title: 'Old', days: [{ day: 'Day 1', items: [{ title: 'x', minutes: 10 }] }] }).days).toHaveLength(1);
    expect(PlanSchema.parse({ title: 'No days', focus: 'kick', days: null, notes: null }).days).toBeUndefined();
    expect(PlanSchema.safeParse({ title: 'Too many', lessonIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).success).toBe(false);
  });
});
