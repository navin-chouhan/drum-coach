import { describe, expect, it } from 'vitest';
import type { PlayResult } from '../events';
import { createFixtureJudge, moneyBeat, replayHits } from './fixture';

describe('dev fixture', () => {
  const chart = moneyBeat(4, 70), beatMs = 60000 / 70, zero = 10_000;

  it('the money beat: 8 hi-hats, 2 snares, 2 kicks a bar', () => {
    expect(chart.notes).toHaveLength(48);
    expect(chart.notes.filter(n => n.drum === 'snare').map(n => n.t)).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
  });

  it('replays a deterministic student with misses, early/late strokes and one extra', () => {
    const hits = replayHits(chart, zero, beatMs);
    expect(hits).toEqual(replayHits(chart, zero, beatMs));
    expect(hits.filter(h => h.note === undefined)).toHaveLength(1);
    expect(hits.length).toBe(48 - 2 + 1);
    expect(hits.every((h, i) => i === 0 || h.at >= hits[i - 1].at)).toBe(true);
  });

  it('judges the replay: mostly on it, some early/late, the skipped notes missed, one extra', () => {
    const judge = createFixtureJudge(chart, zero, beatMs);
    const results: PlayResult[] = [];
    for (const h of replayHits(chart, zero, beatMs)) {
      results.push(...judge.tick(h.at), judge.hit(h.pad, h.at));
    }
    results.push(...judge.tick(zero + 17 * beatMs));
    const count = (f: (r: PlayResult) => boolean) => results.filter(f).length;
    expect(count(r => r.kind === 'extra')).toBe(1);
    expect(count(r => r.kind === 'judged' && r.judgement === 'miss')).toBe(2);
    expect(count(r => r.kind === 'judged' && r.judgement === 'good')).toBeGreaterThan(5);
    expect(count(r => r.kind === 'judged' && r.judgement === 'perfect')).toBeGreaterThan(30);
    expect(count(r => r.kind === 'judged')).toBe(48);
    expect(judge.openCount()).toBe(0);
  });

  it('a stroke far from every note is an extra; a stroke 150 ms off claims its note as a miss', () => {
    const judge = createFixtureJudge(chart, zero, beatMs);
    expect(judge.hit('ride', zero)).toMatchObject({ kind: 'extra', lane: 'ride' });
    expect(judge.hit('snare', zero + beatMs + 150)).toMatchObject({ kind: 'judged', judgement: 'miss', offsetMs: 150, index: 4 });
  });
});
