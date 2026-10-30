import { describe, expect, it } from 'vitest';

import { EventQueue, type Queued } from './eventQueue';
import { defaultLoopPolicy, minLeadMs } from './policy';

// ios/Core/Tests/DrumAudioCoreTests/EventQueueTests.swift runs the same scenarios against the Swift mirror.

const now = 1e9;
const io = 21.3;
const ev = (scheduleMs: number, at = scheduleMs + 5.7, item = String(scheduleMs - now)): Queued<string> => ({ scheduleMs, at, item });

describe('EventQueue', () => {
  it('keeps events sorted by schedule time, ties in insertion order', () => {
    const q = new EventQueue<string>();
    const r = q.insert([ev(now + 300, now + 305.7, 'c'), ev(now + 100, now + 105.7, 'a'), ev(now + 300, now + 305.7, 'd'), ev(now + 200, now + 205.7, 'b')], now, io);
    expect(r).toEqual({ accepted: 4, late: 0, dropped: 0 });
    expect(q.popDue(now + 1000).map(e => e.item)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops late events at insert (schedule time < now + io + 10)', () => {
    const q = new EventQueue<string>();
    const r = q.insert([ev(now + 31.29), ev(now + 31.3), ev(now - 500)], now, io);
    expect(r).toEqual({ accepted: 1, late: 2, dropped: 0 });
    expect(q.count).toBe(1);
  });

  it('pops only what is inside the 120 ms window', () => {
    const q = new EventQueue<string>();
    q.insert([ev(now + 50), ev(now + 119.9), ev(now + 120), ev(now + 500)], now, io);
    expect(q.popDue(now).map(e => e.item)).toEqual([String(now + 50 - now), String(now + 119.9 - now)]);
    expect(q.nextScheduleMs).toBe(now + 120);
    expect(q.popDue(now).length).toBe(0);
    expect(q.popDue(now + 10).length).toBe(1);
  });

  it('cancel(from) drops waiting events heard at or after from; cancel(null) drops all', () => {
    const q = new EventQueue<string>();
    q.insert([ev(now + 100, now + 1000), ev(now + 200, now + 2000), ev(now + 300, now + 3000)], now, io);
    expect(q.cancel(now + 2000)).toBe(2);
    expect(q.count).toBe(1);
    expect(q.cancel(null)).toBe(1);
    expect(q.count).toBe(0);
  });

  it('caps the queue at maxPending', () => {
    const q = new EventQueue<string>({ ...defaultLoopPolicy, maxPending: 2 });
    expect(q.insert([ev(now + 100), ev(now + 200), ev(now + 300)], now, io)).toEqual({ accepted: 2, late: 0, dropped: 1 });
  });

  it('a 5-minute metronome handed over in 4 s chunks with a 10 ms loop: every click popped once, in order, on time', () => {
    const q = new EventQueue<number>();
    const beatMs = 60_000 / 120, zero = now + 300, clicks = 600;
    const lead = minLeadMs(io, 5.7);
    const handed: number[] = [];
    let planned = 0;
    let lateAtPop = 0;
    for (let t = now; t < zero + clicks * beatMs + 1000; t += 10) {
      // the app's tick (every 100 ms) keeps ≥ 2 s handed over, in 4 s chunks
      if (Math.round(t - now) % 100 === 0 && planned < clicks && zero + planned * beatMs < t + 2000) {
        const chunk: Queued<number>[] = [];
        while (planned < clicks && zero + planned * beatMs < t + 4000) {
          const at = zero + planned * beatMs;
          chunk.push({ scheduleMs: at - 5.7, at, item: planned++ });
        }
        expect(q.insert(chunk, t, io).late).toBe(0);
      }
      for (const e of q.popDue(t)) {
        if (e.at < t + lead) lateAtPop++;
        handed.push(e.item);
      }
    }
    expect(handed).toEqual(Array.from({ length: clicks }, (_, i) => i));
    expect(lateAtPop).toBe(0);
  });
});
