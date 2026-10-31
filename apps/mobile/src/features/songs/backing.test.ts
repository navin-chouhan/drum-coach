// The Songs backing helper Practice uses (backingFor / prepareBacking / Song sync), and a take that plays it through
// core's createTake with the fake ports, as the web's PlayView does with an imported chart's audio.
import { createFakeAudioPort, createFakeBackingPort, createFakeClock, SPEAKER } from '@drum-coach/core/play/fakeAudio';
import { createTake } from '@drum-coach/core/play/take';
import type { Chart } from '@drum-coach/core/engine/chart';
import { describe, expect, it, vi } from 'vitest';
import { createChartsRepo } from '../../data/songs';
import { openTestDb } from '../../data/nodeSqlite.testutil';
import { migrate } from '../../data/schema';

vi.mock('./files', () => ({ backingUri: (r: string) => `file:///Documents/${r}` }));
vi.mock('../../platform/audio', () => ({ audio: { backing: null } }));
const { BACKING_ERROR, backingFor, nudgeSync, prepareBacking, SYNC_NUDGES, syncLine } = await import('./backing');

const SONG = { hasAudio: true, audioFile: 'backing/my-song-ab12c.mp3', syncOffsetMs: 120 };

describe('backingFor', () => {
  it("gives the kept file's URI and the chart's sync offset", () => {
    expect(backingFor(SONG)).toEqual({ uri: 'file:///Documents/backing/my-song-ab12c.mp3', syncOffsetMs: 120 });
    expect(backingFor({ hasAudio: true, audioFile: 'backing/x.wav' }, r => `/abs/${r}`)).toEqual({ uri: '/abs/backing/x.wav', syncOffsetMs: 0 });
  });

  it('nothing for a chart without audio (built-in exercises, imports without a file)', () => {
    expect(backingFor({})).toBeUndefined();
    expect(backingFor({ hasAudio: false, audioFile: 'backing/x.mp3' })).toBeUndefined();
    expect(backingFor({ hasAudio: true })).toBeUndefined();
  });
});

describe("prepareBacking (the web's go())", () => {
  it('loads the file and hands back the option', async () => {
    const port = createFakeBackingPort(createFakeClock());
    expect(await prepareBacking(SONG, port)).toEqual({ backing: backingFor(SONG) });
    expect(port.loads).toEqual(['file:///Documents/backing/my-song-ab12c.mp3']);
  });

  it("a file that doesn't load, or no backing player: the web's message, and no backing", async () => {
    const port = createFakeBackingPort(createFakeClock());
    port.fail = "backing: can't open";
    expect(await prepareBacking(SONG, port)).toEqual({ error: BACKING_ERROR });
    expect(await prepareBacking(SONG)).toEqual({ error: BACKING_ERROR }); // the default port: none off the iPad build
    expect(BACKING_ERROR).toBe('Could not load the backing audio; playing without it.');
  });

  it('nothing to do without audio', async () => {
    const port = createFakeBackingPort(createFakeClock());
    expect(await prepareBacking({}, port)).toEqual({});
    expect(port.loads).toEqual([]);
  });
});

describe('Song sync', () => {
  it("the web's line and nudges, stored on the chart", () => {
    expect(syncLine(SONG)).toBe('Song sync: 120 ms. If the notes arrive before the music, increase it.');
    expect(syncLine({ hasAudio: true })).toBe('Song sync: 0 ms. If the notes arrive before the music, increase it.');
    expect(syncLine({})).toBe('');
    expect(SYNC_NUDGES).toEqual([-50, -10, 10, 50]);
    const db = openTestDb();
    migrate(db);
    const charts = createChartsRepo(db, () => 0.5);
    const c = charts.save({ title: 'My song', bpm: 100, timeSignature: [4, 4], bars: 1, notes: [{ t: 0, drum: 'kick' }] }, 'import');
    expect(nudgeSync(charts, c, 10)).toBe(10);
    expect(charts.get(c.id)!.syncOffsetMs).toBe(10);
    expect(nudgeSync(charts, { ...c, syncOffsetMs: 10 }, -50)).toBe(-40);
    expect(nudgeSync(charts, { ...c, syncOffsetMs: 60_000 }, 50)).toBeNull(); // out of range
    expect(nudgeSync(charts, { id: 'gone' }, 10)).toBeNull();
  });
});

describe('a take with an imported song', () => {
  it('plays the file from its sync offset at the take speed, and stops it at the end', async () => {
    const clock = createFakeClock(1e9), song = createFakeBackingPort(clock), port = createFakeAudioPort(clock, SPEAKER, song);
    const chart: Chart = { title: 'My song', bpm: 120, timeSignature: [4, 4], bars: 2, notes: [{ t: 0, drum: 'kick' }] };
    const take = createTake({ clock, audio: port, onHit: () => () => {}, settings: () => ({ latencyMs: 0, countIn: true, liveTips: 'off' as const, chattiness: 'normal' as const }) },
      chart, { fromBar: 1, toBar: 2, repeats: 1, speed: 0.75, metronome: true, subdivision: 1, countInBars: 1, wait: false, backing: backingFor(SONG) });
    await take.start();
    expect(song.loads).toEqual(['file:///Documents/backing/my-song-ab12c.mp3']);
    expect(song.starts).toEqual([{ now: 1e9, at: take.state.zero, offsetMs: 120, rate: 0.75 }]);
    for (let now = 1e9; take.state.phase === 'playing' && now < 1e9 + 20_000; now += 100) { clock.set(now); take.tick(now); }
    expect(take.state.phase).toBe('done');
    expect(song.stops).toHaveLength(1);
  });
});
