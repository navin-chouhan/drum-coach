// Tests for the small pure modules: events, clockSync, kitLayout, touch.
import { describe, expect, it, vi } from 'vitest';
import { estimateOffset, nextOffset, sampleOffset } from './clockSync';
import { createStream, offsetLabel, resultKind, type PlayResult } from './events';
import { edgeDistance, fitLayout, hitTest, MINI_KIT, minTargetPt, partBox, partForPad, toLayout, TOUCH_KIT } from './kitLayout';
import { hihatPad, padForPart, padSound, strokeTime, touchVelocity, velocityGain } from './touch';

describe('results', () => {
  const judged = (judgement: 'perfect' | 'good' | 'miss', offsetMs?: number): PlayResult => ({ kind: 'judged', index: 0, lane: 'snare', judgement, offsetMs, at: 0 });
  it('maps judgements to the mockup result colours', () => {
    expect(resultKind(judged('perfect', 12))).toBe('onIt');
    expect(resultKind(judged('good', -62))).toBe('early');
    expect(resultKind(judged('good', 48))).toBe('late');
    expect(resultKind(judged('miss'))).toBe('missed');
    expect(resultKind({ kind: 'extra', lane: 'snare', at: 0 })).toBe('extra');
  });
  it('labels early and late offsets only', () => {
    expect(offsetLabel('late', 47.6)).toBe('+48 ms');
    expect(offsetLabel('early', -62)).toBe('−62 ms');
    expect(offsetLabel('onIt', 5)).toBe('');
    expect(offsetLabel('late', undefined)).toBe('');
  });
  it('streams to every listener until unsubscribed, even when one throws', () => {
    const s = createStream<number>(), got: number[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    s.subscribe(() => { throw new Error('boom'); });
    const off = s.subscribe(n => got.push(n));
    s.emit(1);
    off();
    s.emit(2);
    expect(got).toEqual([1]);
    expect(s.size()).toBe(1);
    expect(warn).toHaveBeenCalledTimes(2); // the throwing listener stays subscribed
    warn.mockRestore();
  });
});

describe('clock sync', () => {
  it('takes the tightest bracket', () => {
    expect(estimateOffset([
      { before: 0, clock: 1000, after: 10 },   // wide: 995
      { before: 20, clock: 1021, after: 21 },  // tight: 1000.5
      { before: 30, clock: NaN, after: 30 },
    ])).toBeCloseTo(1000.5);
    expect(estimateOffset([])).toBeNaN();
  });
  it('measures a synthetic Clock that runs 1e6 ms ahead of performance.now()', () => {
    let t = 500;
    const perf = () => (t += 0.01);
    const clock = () => t + 1e6;
    expect(sampleOffset(clock, perf)).toBeCloseTo(1e6, 1);
  });
  it('smooths jitter and takes jumps at once', () => {
    expect(nextOffset(NaN, 100)).toBe(100);
    expect(nextOffset(100, 105)).toBe(101);
    expect(nextOffset(100, 500)).toBe(500);
    expect(nextOffset(100, NaN)).toBe(100);
  });
});

describe('kit layout', () => {
  it('scales to fit and centres', () => {
    const f = fitLayout(TOUCH_KIT, 1194, 872);
    expect(f).toEqual({ scale: 1, dx: 0, dy: 218 });
    expect(toLayout(150, 262 + 218, f)).toEqual([150, 262]);
    expect(partBox(TOUCH_KIT.parts[1], f)).toEqual({ left: 54, top: 166 + 218, width: 192, height: 192 });
  });
  it('finds the pad under a finger, with a little slop, and nothing in the gaps', () => {
    expect(hitTest(TOUCH_KIT, 400, 292)?.id).toBe('snare');
    expect(hitTest(TOUCH_KIT, 400 + 104 + 5, 292)?.id).toBe('snare');
    expect(hitTest(TOUCH_KIT, 660, 360)?.id).toBe('kick');
    expect(hitTest(TOUCH_KIT, 140, 400)?.id).toBe('hhPedal');
    expect(hitTest(TOUCH_KIT, 140, 370)?.id).toBe('hhPedal'); // the strip's top edge, just under the hi-hat
    expect(hitTest(TOUCH_KIT, 560, 200)).toBeNull();
    expect(hitTest(MINI_KIT, 191, 127)?.id).toBe('kick');
  });
  it('measures distance to the edge', () => {
    const snare = TOUCH_KIT.parts.find(p => p.id === 'snare')!;
    expect(edgeDistance(snare, 400, 292)).toBe(0);
    expect(edgeDistance(snare, 452, 292)).toBeCloseTo(0.5);
  });
  it('keeps every touch target at least 44 pt on an iPad (pad area down to 800 × 290, two thirds of the design)', () => {
    expect(minTargetPt(TOUCH_KIT, fitLayout(TOUCH_KIT, 1194, 436).scale)).toBe(66);
    expect(minTargetPt(TOUCH_KIT, fitLayout(TOUCH_KIT, 800, 380).scale)).toBeGreaterThanOrEqual(44);
    expect(minTargetPt(TOUCH_KIT, fitLayout(TOUCH_KIT, 1194, 292).scale)).toBeGreaterThanOrEqual(44);
  });
  it('lights the pedal strip for the foot when there is one, else the hi-hat', () => {
    expect(partForPad(TOUCH_KIT, 'hhPedal')).toBe('hhPedal');
    expect(partForPad(MINI_KIT, 'hhPedal')).toBe('hihat');
    expect(partForPad(MINI_KIT, 'hhOpen')).toBe('hihat');
    expect(partForPad(MINI_KIT, 'floor')).toBe('floor');
  });
  it('keeps pads from overlapping', () => {
    const circles = TOUCH_KIT.parts.filter(p => p.kind === 'circle') as Extract<(typeof TOUCH_KIT.parts)[number], { kind: 'circle' }>[];
    for (const a of circles) for (const b of circles) if (a !== b) expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThan(a.r + b.r);
  });
});

describe('touch', () => {
  it('velocity: force when reported, else fixed; or from the centre', () => {
    expect(touchVelocity('auto', { force: 0, edge: 0.5 })).toBe(96);
    expect(touchVelocity('auto', { force: 1, edge: 0.5 })).toBe(127);
    expect(touchVelocity('auto', { force: 0.5, edge: 0.5 })).toBe(84);
    expect(touchVelocity('centre', { edge: 0 })).toBe(127);
    expect(touchVelocity('centre', { edge: 1 })).toBe(40);
    expect(touchVelocity('centre', { edge: 3 })).toBe(40);
    expect(touchVelocity('fixed', { force: 1, edge: 0, fixed: 110 })).toBe(110);
  });
  it('hi-hat: closed by default; like the kit, open unless the pedal is held', () => {
    expect(hihatPad('closed', false)).toBe('hhClosed');
    expect(hihatPad('kit', false)).toBe('hhOpen');
    expect(hihatPad('kit', true)).toBe('hhClosed');
    const part = (id: string) => TOUCH_KIT.parts.find(p => p.id === id)!;
    expect(padForPart(part('hhPedal'), 'kit', false)).toBe('hhPedal');
    expect(padForPart(part('hihat'), 'kit', true)).toBe('hhClosed');
    expect(padForPart(part('floor'), 'closed', false)).toBe('floor');
  });
  it('uses the touch timestamp when it is plausibly on the Clock', () => {
    expect(strokeTime(9_990, 10_000)).toBe(9_990);
    expect(strokeTime(10_010, 10_000)).toBe(10_000); // from the future: another clock
    expect(strokeTime(1_000, 10_000)).toBe(10_000); // too old: another clock
    expect(strokeTime(undefined, 10_000)).toBe(10_000);
  });
  it('names the AudioPort sound and gain', () => {
    expect(padSound('hhPedal')).toBe('drum.hhPedal');
    expect(velocityGain(127)).toBe(1);
    expect(velocityGain(200)).toBe(1);
  });
});
