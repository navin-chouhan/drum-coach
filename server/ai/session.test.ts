import { describe, expect, it } from 'vitest';
import { sayStreamer } from './session';

describe('sayStreamer', () => {
  it('releases whole sentences of "say" while the JSON is still streaming', () => {
    const said: string[] = [];
    const feed = sayStreamer(s => said.push(s));
    feed('{"say": "Nice, the kick');
    expect(said).toEqual([]);
    feed('{"say": "Nice, the kick is on time now. Try');
    expect(said).toEqual(['Nice, the kick is on time now.']);
    feed('{"say": "Nice, the kick is on time now. Try 90 next.", "ask": true}');
    expect(said).toEqual(['Nice, the kick is on time now.', 'Try 90 next.']);
    feed('{"say": "Nice, the kick is on time now. Try 90 next.", "ask": true}', true);
    expect(said).toHaveLength(2); // nothing twice
  });
});
