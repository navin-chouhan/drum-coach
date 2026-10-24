import { describe, expect, it } from 'vitest';
import { TipsSchema } from './schemas';

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
