import { describe, expect, it } from 'vitest';
import { CoachReplySchema, TipsSchema } from './schemas';

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
