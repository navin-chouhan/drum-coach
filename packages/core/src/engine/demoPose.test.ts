import { describe, expect, it } from 'vitest';
import { armPoints, legPoints, PAD_Y, sample, tipCm, type ArmPose } from './demoPose';
import { ARM_POSES, DEMOS, DEMO_IDS, demoFor, poseAt, SHOULDER, type Demo } from '../content/demos';
import { pattern } from './chart';

describe('demo poses', () => {
  it('the named heights match the ruler: contact on the pad, low 3 cm, mid 15, high 30', () => {
    expect(tipCm(SHOULDER, ARM_POSES.contact)).toBeCloseTo(0, 0);
    expect(tipCm(SHOULDER, ARM_POSES.low)).toBeGreaterThan(2); expect(tipCm(SHOULDER, ARM_POSES.low)).toBeLessThan(5);
    expect(tipCm(SHOULDER, ARM_POSES.mid)).toBeGreaterThan(12); expect(tipCm(SHOULDER, ARM_POSES.mid)).toBeLessThan(19);
    expect(tipCm(SHOULDER, ARM_POSES.high)).toBeGreaterThan(26); expect(tipCm(SHOULDER, ARM_POSES.high)).toBeLessThan(33);
  });
  it('eases between keys and loops', () => {
    const keys = [{ t: 0, p: { up: 0, fa: 0, wr: 0, fg: 0 } }, { t: 1, p: { up: 0, fa: 0, wr: -40, fg: 0 }, ease: 'lin' as const, word: 'UP' }];
    expect(sample<ArmPose>(keys, 2, 0.5).pose.wr).toBeCloseTo(-20);
    expect(sample<ArmPose>(keys, 2, 2.5).pose.wr).toBeCloseTo(-20); // loops
    expect(sample<ArmPose>(keys, 2, 1.2).word).toBe('UP');
  });
  it('every demo strikes: the stick (or beater) reaches the pad (or head) once per loop at least, right and wrong', () => {
    for (const id of DEMO_IDS) for (const wrong of [false, true]) {
      const d: Demo = DEMOS[id]; if (!d.right && !d.leg) continue; // the grip is a still picture
      let hit = false;
      for (let b = 0; b < d.beats; b += 0.01) {
        const f = poseAt(id, b, wrong);
        if (f.leg ? legPoints(f.leg).beater[0] >= 746 : f.arms.some(a => armPoints(a.shoulder, a.pose).tip[1] >= PAD_Y - 3)) hit = true;
      }
      expect(hit, `${id}${wrong ? ' (wrong)' : ''}`).toBe(true);
    }
  });
});

describe('demoFor: every lesson has a movement to watch', () => {
  const chart = (lines: Parameters<typeof pattern>[0]) => ({ title: 't', bpm: 80, timeSignature: [4, 4] as [number, 4], bars: 1, notes: pattern(lines, 2) });
  it('picks one from what the step plays when the lesson names none', () => {
    expect(demoFor({}, { chart: chart({ snare: 'xxxxxxxx' }) })).toBe('rebound');
    expect(demoFor({}, { chart: chart({ snare: 'Xxx.Xxx.' }) })).toBe('accent-tap');
    expect(demoFor({}, { chart: chart({ snare: 'f.f.f.f.' }) })).toBe('flam');
    expect(demoFor({}, { chart: chart({ snare: 'd.d.d.d.' }) })).toBe('drag');
    expect(demoFor({}, { chart: chart({ kick: 'x.x.x.x.' }) })).toBe('kick');
  });
  it('the step\'s own, then the lesson\'s, win', () => {
    expect(demoFor({ demo: 'doubles' }, { chart: chart({ snare: 'xxxxxxxx' }) })).toBe('doubles');
    expect(demoFor({ demo: 'doubles' }, { chart: chart({ snare: 'xxxxxxxx' }), demo: 'grip' })).toBe('grip');
  });
});
