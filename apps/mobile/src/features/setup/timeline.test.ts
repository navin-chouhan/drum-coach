import { describe, expect, it } from 'vitest';
import { TIMELINE_LANES, TIMELINE_MAX, TIMELINE_WINDOW_MS, addTimelineHit, timelineDot, timelineX } from './timeline';

describe('Kit test timeline (web Timeline)', () => {
  it("keeps the web's lane order and names", () => {
    expect(TIMELINE_LANES.map(l => l.name)).toEqual(['Crash', 'Ride', 'Hi-hat', 'Tom 1', 'Tom 2', 'Floor tom', 'Snare', 'Kick']);
  });

  it('adds pad hits on their drum lane, drops unmapped notes and hits older than the window, keeps the newest', () => {
    let list = addTimelineHit([], { pad: 'hhPedal', time: 1000, velocity: 127 }, 1);
    expect(list).toEqual([{ key: 1, lane: 2, drum: 'hihat', t: 1000, v: 1 }]);
    expect(addTimelineHit(list, { time: 1100, velocity: 90 }, 2)).toBe(list);
    list = addTimelineHit(list, { pad: 'kick', time: 1000 + TIMELINE_WINDOW_MS + 1, velocity: 0 }, 3);
    expect(list.map(h => [h.key, h.lane])).toEqual([[3, 7]]);
    for (let i = 0; i < TIMELINE_MAX + 5; i++) list = addTimelineHit(list, { pad: 'snare', time: 6000 + i, velocity: 64 }, 10 + i);
    expect(list).toHaveLength(TIMELINE_MAX);
    expect(list.at(-1)?.key).toBe(10 + TIMELINE_MAX + 4);
  });

  it('slides from the now line to the labels over 4 s, louder is bigger, fades with age', () => {
    expect(timelineX(0, 1000)).toBe(986);
    expect(timelineX(TIMELINE_WINDOW_MS, 1000)).toBe(82);
    expect(timelineX(2000, 1000)).toBe(534);
    expect(timelineDot(0, 1)).toEqual({ r: 15, opacity: 1 });
    expect(timelineDot(1000, 0).r).toBe(3.5);
    expect(timelineDot(2000, 0).opacity).toBeCloseTo(0.675);
    expect(timelineDot(TIMELINE_WINDOW_MS + 1, 1).opacity).toBe(0);
  });
});
