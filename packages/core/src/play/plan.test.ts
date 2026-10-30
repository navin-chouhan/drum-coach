// planEvents on its own: chunk invariance, heard times by multiplication, words, and the edges. (The comparison with
// the web's scheduler, feature by feature, is web-parity.test.ts.)
import { describe, expect, it } from 'vitest';
import { COUNT_WORDS, planEvents, planWords, type PlanSpec } from './plan.ts';

const SPEC: PlanSpec = { zero: 1e9, beatMs: 500, timeSignature: [4, 4], countInBeats: 4, metronome: true, subdivision: 2, endBeat: 32, countVoice: true };

describe('planEvents', () => {
  it('builds the same plan in any chunks', () => {
    const spec: PlanSpec = {
      ...SPEC, gapBars: 3, fadeClick: 7, countAloud: [['one', 'and', 'two', 'and'], ['one', '', '', '']],
      notes: [{ t: 0.25, pad: 'kick', velocity: 80 }, { t: 7.75, pad: 'crash', velocity: 110 }],
      band: [{ t: 0, dur: 2, part: 'bass', midi: [40], vel: 95 }, { t: 30, dur: 2, part: 'keys', midi: [60, 64, 67], vel: 60 }],
    };
    const whole = planEvents(spec, -4, 32);
    let seed = 3;
    const cuts = [-4];
    while (cuts[cuts.length - 1] < 32) cuts.push(Math.min(32, cuts[cuts.length - 1] + ((seed = (seed * 16807) % 2147483647) / 2147483647) * 3));
    const chunked = cuts.slice(1).flatMap((to, i) => planEvents(spec, cuts[i], to));
    expect(chunked).toEqual(whole);
    expect(planEvents(spec, 32, 40)).toEqual([]); // nothing past the end
    expect(planEvents(spec, 5, 5)).toEqual([]);
    expect(planEvents(spec, 5, 2)).toEqual([]);
  });

  it('times every click as zero + k × beatMs / sub, far from the origin', () => {
    const clicks = planEvents(SPEC, -4, 32).filter(e => e.kind === 'sound' && e.sound.startsWith('click.'));
    expect(clicks).toHaveLength(36 * 2);
    clicks.forEach((e, k) => expect(e.at).toBe(1e9 + ((k - 8) / 2) * 500));
    expect(clicks.slice(0, 3).map(e => e.kind === 'sound' && e.sound)).toEqual(['click.bar', 'click.sub', 'click.beat']);
  });

  it('a metronome with no end plans only what is asked', () => {
    const spec: PlanSpec = { ...SPEC, countInBeats: 0, endBeat: Infinity, countVoice: false };
    const e = planEvents(spec, 1000, 1004);
    expect(e).toHaveLength(8);
    expect(e[0].at).toBe(1e9 + 1000 * 500);
  });

  it('leaves out missing words (also when the port normalises them)', () => {
    const spec: PlanSpec = { ...SPEC, countAloud: [['Two ', 'and']], missingWords: new Set(['one', 'two']) };
    const words = planEvents(spec, -4, 4).flatMap(e => (e.kind === 'sound' && e.sound.startsWith('word.') ? [e.sound] : []));
    expect(words).toEqual(['word.three', 'word.four', 'word.and']);
  });

  it('count aloud with empty bars says nothing', () => {
    expect(planEvents({ ...SPEC, countAloud: [[]], countVoice: false, metronome: false, countInBeats: 0 }, 0, 32)).toEqual([]);
  });
});

describe('planWords', () => {
  it('lists the count-in numbers and the count-aloud words once each', () => {
    expect(planWords(SPEC)).toEqual(['one', 'two', 'three', 'four']);
    expect(planWords({ ...SPEC, timeSignature: [7, 8] })).toEqual(COUNT_WORDS.slice(0, 7));
    expect(planWords({ ...SPEC, timeSignature: [6, 8] })).toEqual(['one', 'two', 'three']);
    expect(planWords({ ...SPEC, countVoice: false, countAloud: [['one', 'and', '', 'and']] })).toEqual(['one', 'and']);
    expect(planWords({ ...SPEC, countInBeats: 0 })).toEqual([]);
  });
});
