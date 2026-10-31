import { DEFAULTS } from '@drum-coach/core/input/settings';
import { describe, expect, it } from 'vitest';
import { momentText } from '../coach/moments';
import { heroBpm, journeyMoments, momentKey } from './moments';

describe('what Journey says (D10 voice first)', () => {
  const hero = { lessonId: 'money-8ths', item: 2, icon: '🎯', kicker: 'Up next', title: 'The money beat', step: 'Step 3 of 4 · + snare', meta: '12 min · 70 → 90 BPM', what: '', preview: null, coachWrote: false };
  it('the notice first, then Up next with the step and the starting tempo', () => {
    const ms = journeyMoments({ kind: 'setup', text: '🛠 Two minutes to check your pads.' }, hero);
    expect(ms).toEqual([
      { kind: 'notice', text: '🛠 Two minutes to check your pads.' },
      { kind: 'upNext', title: 'The money beat', step: 'Step 3 of 4, + snare', bpm: 70 },
    ]);
    // the moments table cleans the emoji (one place) and says each as one line
    expect(ms.map(m => momentText(m, DEFAULTS))).toEqual(['Two minutes to check your pads.', 'Up next: The money beat, Step 3 of 4, + snare, 70.']);
  });
  it("every Journey notice's leading emoji is one the moments table cleans", () => {
    for (const e of ['🛠', '🩹', '🏅', '🎉']) expect(momentText({ kind: 'notice', text: `${e} Hello there` }, DEFAULTS)).toBe('Hello there');
  });
  it('the plain greeting is not said; no hero, no Up next', () => {
    expect(journeyMoments({ text: 'Evening!' }, null)).toEqual([]);
    expect(heroBpm('2 min')).toBeUndefined();
    expect(heroBpm('Practice · 80 BPM')).toBe(80);
  });
  it('each moment has a stable key', () => {
    expect(momentKey({ kind: 'notice', text: 'a' })).not.toBe(momentKey({ kind: 'upNext', title: 'a' }));
  });
});
