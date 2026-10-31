import type { AudioInterruption } from '@drum-coach/core/play/audioPort';
import { createFakeAudioPort, createFakeClock } from '@drum-coach/core/play/fakeAudio';
import { describe, expect, it, vi } from 'vitest';
import { jamKeepsInterrupted, watchInterruptions, type AppStateLike } from './interrupt';
import { jamRun } from './modes';

function fakeAppState() {
  const fns = new Set<(s: string) => void>();
  const app: AppStateLike & { emit(s: string): void; size(): number } = {
    addEventListener: (_t, fn) => { fns.add(fn); return { remove: () => { fns.delete(fn); } }; },
    emit: s => fns.forEach(f => f(s)),
    size: () => fns.size,
  };
  return app;
}

describe('watchInterruptions (QA m5, as the lesson player)', () => {
  it('a call, the engine stopping or the app leaving the foreground; not the end of a call or coming back', () => {
    const port = createFakeAudioPort(createFakeClock()), app = fakeAppState(), fn = vi.fn();
    const off = watchInterruptions(port, app, fn);
    port.emitInterruption({ type: 'began', at: 1234 });
    port.emitInterruption({ type: 'engine-stopped', at: 2000, cause: 'config-change' });
    port.emitInterruption({ type: 'ended', at: 3000, shouldResume: true } as AudioInterruption);
    app.emit('active');
    app.emit('background');
    app.emit('inactive');
    expect(fn.mock.calls).toEqual([[1234], [2000], [], []]);
    off();
    port.emitInterruption({ type: 'began', at: 5000 });
    app.emit('background');
    expect(fn).toHaveBeenCalledTimes(4);
    expect(app.size()).toBe(0);
  });
});

describe('an interrupted jam (D6)', () => {
  const s = { timeSignature: [4, 4] as [4, 4] }, g = { bpm: 120 };
  it('is kept after ≥ 2 whole bars of the song (at the playback rate)', () => {
    expect(jamKeepsInterrupted(s, g, 1, 3999)).toBe(false);
    expect(jamKeepsInterrupted(s, g, 1, 4000)).toBe(true);
    expect(jamKeepsInterrupted(s, g, 0.5, 4000)).toBe(false); // half speed: one bar in 4 s
    expect(jamKeepsInterrupted({ timeSignature: [3, 4] }, g, 1, 3000)).toBe(true);
  });

  it('is saved flagged', () => {
    const song = { id: 'yt-x', title: 'X', originalId: 'x', drumlessId: null, coverId: null, timeSignature: [4, 4] as [4, 4], notes: [], grids: {} };
    const stats = { hits: 10, onGridPct: 80, meanOffset: 3, spread: 9 } as unknown as Parameters<typeof jamRun>[3];
    expect(jamRun(song, { bpm: 100, offsetSec: 0 }, 1, stats, '2026-10-31T10:00:00Z', 30, true).summary).toMatchObject({ mode: 'jam', interrupted: true });
    expect(jamRun(song, { bpm: 100, offsetSec: 0 }, 1, stats, '2026-10-31T10:00:00Z', 30).summary).not.toHaveProperty('interrupted');
  });
});
