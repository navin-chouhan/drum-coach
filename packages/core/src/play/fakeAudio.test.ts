import { describe, expect, it, vi } from 'vitest';
import { createFakeAudioPort, createFakeClock, SPEAKER } from './fakeAudio.ts';

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
