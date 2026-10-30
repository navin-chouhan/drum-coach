// The native pending-event queue (events handed over by JS, not yet given to a player node), as a pure class.
// ios/Core/Sources/DrumAudioCore/EventQueue.swift mirrors it: change both together; eventQueue.test.ts and the Swift
// tests share the vectors.
//
// Kept sorted by schedule time (ties keep insertion order), so the lookahead loop pops a prefix.

import { defaultLoopPolicy, isDue, isLate, type LoopPolicy } from './policy';

export type Queued<T> = { scheduleMs: number; at: number; item: T };

export type InsertResult = { accepted: number; late: number; dropped: number };

export class EventQueue<T> {
  private items: Queued<T>[] = [];

  constructor(private readonly policy: LoopPolicy = defaultLoopPolicy) {}

  get count(): number {
    return this.items.length;
  }

  /** The earliest schedule time waiting, or null. */
  get nextScheduleMs(): number | null {
    return this.items.length > 0 ? this.items[0].scheduleMs : null;
  }

  /**
   * Adds events (any order). Late ones (isLate at `nowMs`) are counted and not kept; past `maxPending` the rest are
   * dropped. Returns the counts.
   */
  insert(events: readonly Queued<T>[], nowMs: number, ioBufferMs: number): InsertResult {
    let accepted = 0, late = 0, dropped = 0;
    for (const e of events) {
      if (isLate(e.scheduleMs, nowMs, ioBufferMs, this.policy)) {
        late++;
        continue;
      }
      if (this.items.length >= this.policy.maxPending) {
        dropped++;
        continue;
      }
      this.items.splice(this.upperBound(e.scheduleMs), 0, e);
      accepted++;
    }
    return { accepted, late, dropped };
  }

  /** Removes and returns every event due at `nowMs` (schedule time before now + window), earliest first. */
  popDue(nowMs: number): Queued<T>[] {
    let n = 0;
    while (n < this.items.length && isDue(this.items[n].scheduleMs, nowMs, this.policy)) n++;
    return n === 0 ? [] : this.items.splice(0, n);
  }

  /** Drops every waiting event heard at or after `fromMs` (null = all). Returns how many. */
  cancel(fromMs: number | null): number {
    const before = this.items.length;
    this.items = fromMs == null ? [] : this.items.filter(e => e.at < fromMs);
    return before - this.items.length;
  }

  /** First index whose scheduleMs is greater than `ms` (insertion after equal times keeps their order). */
  private upperBound(ms: number): number {
    let lo = 0, hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.items[mid].scheduleMs <= ms) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
