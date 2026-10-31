import { describe, expect, it } from 'vitest';
import { pattern } from '@drum-coach/core/engine/chart';
import { introContent, introTap, TAP_GAP_MS } from './introSlides';

const money = pattern({ hihat: 'xxxxxxxx', snare: '..x...x.', kick: 'x...x...' }, 2);

describe('intro slides (web src/play/IntroSlides.tsx)', () => {
  it('who plays what and the first bar\'s count, as the web works them out', () => {
    const c = introContent({ title: 'Money beat', sub: 'Eighths', bpm: 70, what: 'w', notes: money, beatsPerBar: 4 });
    expect(c.kicker).toBe('MONEY BEAT · 70 BPM');
    expect(c.big).toBe('Eighths');
    expect(c.plan.map(p => p.limb)).toEqual(['R', 'L', 'K']);
    expect(c.plan[0]).toMatchObject({ name: 'right hand', drums: ['hi-hat'], when: 'every 8th' });
    expect(c.firstBar.map(h => h.count)).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(c.firstBar[0]).toMatchObject({ limbs: 'R+K', beat: true });
    expect(c.firstBar[1].beat).toBe(false);
    expect(c.pedalDown).toBe(true);
  });

  it('a left-handed player\'s hands mirror; without a sub the title is the big line', () => {
    const c = introContent({ title: 'Money beat', bpm: 70, what: 'w', notes: money, beatsPerBar: 4, leftHanded: true });
    expect(c.big).toBe('Money beat');
    expect(c.firstBar[0].limbs).toBe('L+K');
  });

  it('the kit turns them: hi-hat forward, snare back, bounces ignored', () => {
    expect(introTap(-Infinity, { pad: 'hhClosed', time: 1000 })).toEqual({ move: 'next', at: 1000 });
    expect(introTap(-Infinity, { pad: 'hhOpen', time: 1000 })).toEqual({ move: 'next', at: 1000 });
    expect(introTap(1000, { pad: 'snare', time: 1000 + TAP_GAP_MS - 1 })).toEqual({ move: null, at: 1000 });
    expect(introTap(1000, { pad: 'snare', time: 1000 + TAP_GAP_MS })).toEqual({ move: 'back', at: 1250 });
    expect(introTap(1000, { pad: 'kick', time: 5000 })).toEqual({ move: null, at: 1000 });
  });
});
