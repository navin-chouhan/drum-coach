import { describe, expect, it } from 'vitest';
import { armPoints, legPoints, PAD_Y, sample, tipCm, type ArmPose } from './demoPose';
import { ARM_POSES, DEMOS, DEMO_IDS, poseAt, SHOULDER, type Demo } from '../content/demos';

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
