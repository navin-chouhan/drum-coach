import { describe, expect, it, vi } from 'vitest';
import { createFakeAudioPort, createFakeBackingPort, createFakeClock, SPEAKER } from './fakeAudio.ts';

describe('the fake AudioPort', () => {
  it('starts, schedules (dropping late events), cancels and reports', async () => {
    const clock = createFakeClock(100), port = createFakeAudioPort(clock);
    const onRoute = vi.fn(), onInt = vi.fn();
    const offRoute = port.onRouteChange(onRoute), offInt = port.onInterruption(onInt);
    expect(port.route()).toBeNull();
    expect(await port.start()).toBe(SPEAKER);
    await port.start();
    expect(onRoute).toHaveBeenCalledOnce();
    expect(port.schedule([{ kind: 'sound', at: 100, sound: 'click.bar', gain: 1 }, { kind: 'sound', at: 500, sound: 'click.beat', gain: 1 }])).toEqual({ accepted: 1, late: 1 });
    port.schedule([{ kind: 'sound', at: 900, sound: 'drum.kick', gain: 0.5 }]);
    port.cancel(800);
    expect(port.events.map(e => e.at)).toEqual([500]);
    expect(port.playNow('drum.snare', 1)).toBe(100);
    port.setLevels({ click: 0.5 });
    port.emitInterruption({ type: 'began', at: 150 });
    expect(onInt).toHaveBeenCalledWith({ type: 'began', at: 150 });
    offRoute(); offInt();
    port.emitInterruption({ type: 'ended', at: 200, shouldResume: false });
    expect(onInt).toHaveBeenCalledOnce();
    port.suspend();
    expect(port.route()).toBeNull();
    expect(port.stats()).toEqual({ scheduled: 2, late: 1, dropped: 0, engineStarts: 1 });
    port.fail = 'engine down';
    await expect(port.start()).rejects.toThrow('engine down');
    expect(port.available).toBe(true);
    expect(createFakeAudioPort(clock, null).available).toBe(false);
    expect(await port.prepareWords(['one'])).toEqual({ missing: [] });
  });
});

describe('the fake backing player', () => {
  it('loads (or fails), plays a line from at, replaces it on a new start, ends at the file end or a stop', async () => {
    const clock = createFakeClock(1000), b = createFakeBackingPort(clock, { durationMs: 5000 });
    expect(createFakeAudioPort(clock, SPEAKER, b).backing).toBe(b);
    expect(await b.load('file:///a.m4a')).toEqual({ durationMs: 5000, sampleRate: 44100 });
    b.fail = 'bad file';
    await expect(b.load('file:///b.m4a')).rejects.toThrow('bad file');
    expect(b.loads).toEqual(['file:///a.m4a', 'file:///b.m4a']);
    expect(b.anchor()).toBeNull(); // not started
    b.start({ at: 1500, offsetMs: -200, rate: 0.5 }); // heard from 1500 + 200 / 0.5
    expect(b.heardAt(999)).toBeNull(); // before the start was called
    expect(b.heardAt(1800)).toBeNull(); // before it's heard
    expect(b.heardAt(2100)).toBe(100);
    clock.set(2100);
    expect(b.anchor()).toEqual({ at: 2100, fileMs: 100 });
    b.start({ at: 2200, offsetMs: 4000, rate: 1 });
    expect(b.heardAt(2050)).toBe(75); // the first line, before it was replaced
    expect(b.heardAt(2150)).toBeNull(); // replaced at once, the new one not heard yet
    expect(b.heardAt(2500)).toBe(4300);
    expect(b.heardAt(3300)).toBeNull(); // past the file's end
    clock.set(2600);
    b.stop();
    b.stop();
    expect(b.heardAt(2700)).toBeNull();
    expect(b.stops).toEqual([2600, 2600]);
    expect(b.starts.map(s => s.now)).toEqual([1000, 2100]);
  });

  it('queues segments behind the last one without cutting it: back to back, a lead waits, an overlap skips into the file', () => {
    const clock = createFakeClock(0), b = createFakeBackingPort(clock, { durationMs: 10_000 });
    b.queue({ at: 0, offsetMs: 0, durationMs: 1000 }); // nothing started: ignored
    expect(b.heard()).toEqual([]);
    b.start({ at: 100, offsetMs: 2000, rate: 0.5, durationMs: 1000 }); // heard 100…2100
    b.queue({ at: 2100, offsetMs: 2000, durationMs: 1000 }); // exactly where it ends
    b.queue({ at: 4100, offsetMs: -250, durationMs: 1000 }); // waits 500 ms, then file 0…750
    b.queue({ at: 5500, offsetMs: 3000, durationMs: 1000 }); // due 600 ms before the last ends: skips 300 file ms
    b.queue({ at: 7500, offsetMs: 9900, durationMs: 1000 }); // only 100 ms of file left
    b.queue({ at: 9000, offsetMs: 20_000, durationMs: 1000 }); // past the end: nothing
    b.queue({ at: 7200, offsetMs: 0, durationMs: 100 }); // overlapped entirely: nothing
    expect(b.queues).toHaveLength(7);
    expect(b.heard()).toEqual([
      { at: 100, offsetMs: 2000, rate: 0.5, until: 2100 },
      { at: 2100, offsetMs: 2000, rate: 0.5, until: 4100 },
      { at: 4600, offsetMs: 0, rate: 0.5, until: 6100 },
      { at: 6100, offsetMs: 3300, rate: 0.5, until: 7500 },
      { at: 7500, offsetMs: 9900, rate: 0.5, until: 7700 },
    ]);
    expect(b.heardAt(2099)).toBeCloseTo(2999.5, 9);
    expect(b.heardAt(2100)).toBe(2000);
    expect(b.heardAt(4300)).toBeNull(); // the lead
    expect(b.heardAt(4700)).toBe(50);
    expect(b.heardAt(7700)).toBeNull(); // after the last segment
    expect(b.starts[0]).toEqual({ now: 0, at: 100, offsetMs: 2000, rate: 0.5, durationMs: 1000 });
    clock.set(3000);
    b.start({ at: 3100, offsetMs: 0, rate: 1 }); // a start cuts the queued ones too
    expect(b.heardAt(4700)).toBe(1600);
    expect(b.heard().slice(1, 3).map(h => h.until)).toEqual([3000, 3000]);
    expect(b.starts[1]).toEqual({ now: 3000, at: 3100, offsetMs: 0, rate: 1 });
    b.start({ at: 4000, offsetMs: 12_000, rate: 1 }); // past the file's end: nothing plays…
    b.queue({ at: 4500, offsetMs: 500, durationMs: 200 }); // …and a queued segment still finds its place on the line
    expect(b.heardAt(4100)).toBeNull();
    expect(b.heardAt(4550)).toBe(550);
  });

  it('a rate error makes the file run fast or slow against the Clock', () => {
    const clock = createFakeClock(0), b = createFakeBackingPort(clock, { ppm: 100, durationMs: 2e6 });
    b.start({ at: 0, offsetMs: 0, rate: 1 });
    expect(b.heardAt(1_000_000)).toBeCloseTo(1_000_100, 6);
    expect(createFakeBackingPort(clock).ppm).toBe(0);
  });
});
