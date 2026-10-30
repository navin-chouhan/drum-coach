import { Midi } from '@tonejs/midi';
import type { YtSong } from '@drum-coach/core/youtube/schemas';
import { describe, expect, it } from 'vitest';
import { openTestDb } from '../../data/nodeSqlite.testutil';
import { RunInputSchema } from '../../data/runs';
import { migrate, MIGRATIONS } from '../../data/schema';
import { createDataStore } from '../../data/store';
import type { ApiFailure, HomeServer } from '../../platform/contracts';
import { chartToSave, importSummary, libraryRow, parseMidiFile } from './importModel';
import {
  addMissing, addTap, clampRange, clickDue, GRID_ADJUST, gridToSave, jamBand, jamLive, jamOffset, jamResultTiles, jamRun, keepTake, loopFrame,
  loopSpan, scoreJamTake, songPart, songTakeOptions, tapFit, tileGroove, timing, type SongPlayer,
} from './modes';
import { findVersions, searchYt, songsFailureText } from './songsApi';
import {
  barsParam, concert, initialMode, modeTabs, searchAction, shownMode, songBarCount, songHref, songRow, startConcert, tempoLine, versionButtons,
} from './songsModel';
import { createChartsRepo, createSongsRepo, songsTablesReady, SONGS_MIGRATION, SongInputError } from '../../data/songs';

const ID = 'dQw4w9WgXcQ', DL = 'abcdefghijk';
function db() {
  const d = openTestDb();
  migrate(d);
  expect(songsTablesReady(d)).toBe(true);
  return d;
}

describe('migration 2 (songs)', () => {
  it('takes a version 1 database to 2, keeping its rows', () => {
    const d = openTestDb();
    d.execSync(MIGRATIONS[0]);
    d.execSync('PRAGMA user_version = 1');
    d.runSync('INSERT INTO kv (key, value) VALUES (?, ?)', ['a', '1']);
    expect(songsTablesReady(d)).toBe(false);
    expect(migrate(d)).toEqual({ from: 1, to: 2 });
    expect(songsTablesReady(d)).toBe(true);
    expect(d.getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', ['a'])?.value).toBe('1');
    expect(MIGRATIONS[1]).toBe(SONGS_MIGRATION);
  });
});
const song = (o: Partial<YtSong> = {}): YtSong => ({
  id: `yt-${ID}`, title: 'Billie Jean', originalId: ID, drumlessId: null, coverId: null, timeSignature: [4, 4], notes: [], grids: {}, verifiedAt: null, ...o,
});

describe('songs repo (the server routes on the iPad)', () => {
  it('adds, lists newest first, ignores a second add of the same video', () => {
    const r = createSongsRepo(db());
    const a = r.add({ title: 'One', originalId: ID });
    expect(a).toMatchObject({ id: `yt-${ID}`, title: 'One', drumlessId: null, timeSignature: [4, 4], notes: [], grids: {}, verifiedAt: null });
    r.add({ title: 'Two', originalId: DL });
    expect(r.add({ title: 'Again', originalId: ID }).title).toBe('One');
    expect(r.list().map(s => s.title)).toEqual(['Two', 'One']);
    expect(() => r.add({ title: 'x', originalId: 'not-an-id' })).toThrow(SongInputError);
  });

  it('patches like PATCH /api/ytsongs: changed notes clear "checked by ear"', () => {
    const r = createSongsRepo(db());
    r.add({ title: 'S', originalId: ID });
    const notes = [{ t: 0, drum: 'kick' as const }];
    r.patch(`yt-${ID}`, { notes, drumlessId: DL, timeSignature: [3, 4] });
    expect(r.patch(`yt-${ID}`, { verified: true }, () => '2026-10-30')?.verifiedAt).toBe('2026-10-30');
    expect(r.patch(`yt-${ID}`, { notes }, () => 'x')?.verifiedAt).toBe('2026-10-30'); // same notes: still checked
    const s = r.patch(`yt-${ID}`, { notes: [...notes, { t: 1, drum: 'snare' }] })!;
    expect(s).toMatchObject({ verifiedAt: null, drumlessId: DL, timeSignature: [3, 4] });
    expect(r.patch(`yt-${ID}`, { drumlessId: null })?.drumlessId).toBeNull();
    expect(r.patch('yt-nope', { title: 'x' })).toBeNull();
    expect(() => r.patch(`yt-${ID}`, { timeSignature: [4, 3] })).toThrow(SongInputError);
  });

  it('keeps grids per video and returns them with the song', () => {
    const r = createSongsRepo(db());
    r.add({ title: 'S', originalId: ID, drumlessId: DL });
    r.saveGrid(ID, { bpm: 117, offsetSec: 0.42 });
    r.saveGrid(DL, { bpm: 117, offsetSec: 1.1 });
    r.saveGrid(ID, { bpm: 118, offsetSec: 0.4 });
    expect(r.get(`yt-${ID}`)?.grids).toEqual({ [ID]: { bpm: 118, offsetSec: 0.4 }, [DL]: { bpm: 117, offsetSec: 1.1 } });
    expect(() => r.saveGrid(ID, { bpm: 10, offsetSec: 0 })).toThrow(SongInputError);
    r.remove(`yt-${ID}`);
    expect(r.list()).toEqual([]);
  });

  it('charts: save (slug id, kind song), sync offset, audio, delete', () => {
    const c = createChartsRepo(db(), () => 0.123456789);
    const saved = c.save({ title: 'My Song!', bpm: 100, timeSignature: [4, 4], bars: 1, notes: [{ t: 0, drum: 'kick' }] }, 'import');
    expect(saved).toMatchObject({ id: expect.stringMatching(/^my-song-\w{5}$/), kind: 'song', source: 'import', hasAudio: false, syncOffsetMs: 0 });
    expect(c.setSyncOffset(saved.id, 120)).toBe(true);
    expect(c.setAudio(saved.id, 'backing/my-song.mp3')).toBe(true);
    expect(c.list()[0]).toMatchObject({ syncOffsetMs: 120, hasAudio: true, audioFile: 'backing/my-song.mp3' });
    expect(c.remove(saved.id)).toEqual({ audioFile: 'backing/my-song.mp3' });
    expect(c.remove(saved.id)).toBeNull();
    expect(() => c.save({ title: '' }, 'import')).toThrow(SongInputError);
  });
});

describe('songs list and song view', () => {
  it('rows show the web line', () => {
    expect(songRow(song()).detail).toBe('tempo not set');
    expect(songRow(song({ drumlessId: DL, grids: { [ID]: { bpm: 117.4, offsetSec: 0 } }, notes: [{ t: 0, drum: 'kick' }] })).detail)
      .toBe('117 BPM · drumless ✓ · 1 notes transcribed');
  });
  it('a pasted link adds the video, text searches', () => {
    expect(searchAction('  ')).toEqual({ kind: 'none' });
    expect(searchAction(`https://youtu.be/${ID}`)).toEqual({ kind: 'add', videoId: ID, title: `YouTube video ${ID}` });
    expect(searchAction('billie jean')).toEqual({ kind: 'search', q: 'billie jean' });
  });
  it('opens in Set tempo until there is a grid; modes need this version\'s tempo', () => {
    const g = { [ID]: { bpm: 120, offsetSec: 0 } };
    expect(initialMode(song())).toBe('tempo');
    expect(initialMode(song({ grids: g }))).toBe('learn');
    expect(initialMode(song({ grids: g }), { from: 1, to: 4 })).toBe('play');
    expect(modeTabs(song(), ID).filter(t => !t.disabled).map(t => t.id)).toEqual(['tempo']);
    expect(shownMode(song({ grids: g, drumlessId: DL }), DL, 'jam')).toBe('tempo');
    expect(versionButtons(song({ grids: g, drumlessId: DL })).map(v => [v.label, v.disabled])).toEqual([['Original', false], ['Drumless (no tempo)', false], ['Drum cover', true]]);
    expect(tempoLine(song({ grids: g }), ID, 0.75)).toBe('90 BPM · 4/4');
  });
  it('routes, bars and the concert queue', () => {
    expect(songHref('yt-a', { from: 2, to: 5 })).toBe('/song/yt-a?from=2&to=5');
    expect(barsParam('2', '5')).toEqual({ from: 2, to: 5 });
    expect(barsParam('5', '2')).toBeUndefined();
    expect(startConcert([{ id: 'a', bars: { from: 1, to: 2 } }, { id: 'b', bars: { from: 1, to: 3 } }])?.id).toBe('a');
    expect(concert.queue.map(s => s.id)).toEqual(['b']);
    expect(songBarCount(song({ notes: [{ t: 0, drum: 'kick' }, { t: 9, drum: 'kick' }] }))).toBe(3);
  });
});

describe('search through the home server', () => {
  const server = (r: { ok: true; data: unknown } | ApiFailure) => ({ call: async () => r }) as unknown as HomeServer;
  it('validates results and explains an unreachable server', async () => {
    const hit = { id: ID, title: 't', channel: 'c', thumbnail: 'https://i.ytimg.com/x.jpg', durationSec: 200 };
    expect(await searchYt(server({ ok: true, data: [hit] }), 'q')).toEqual({ ok: true, data: [hit] });
    const down = await searchYt(server({ ok: false, reason: 'unreachable' }), 'q');
    expect(down).toMatchObject({ ok: false, unreachable: true });
    expect(await findVersions(server({ ok: true, data: { drumless: 'x' } }), 't')).toMatchObject({ ok: false, unreachable: false });
    expect(songsFailureText({ ok: false, reason: 'server-error', detail: 'YouTube search is not set up' })).toBe('YouTube search is not set up');
  });
});

describe('Set tempo', () => {
  it('taps restart after a 3 s pause; fit from 8 taps, phase from 2 with a known tempo', () => {
    let taps: number[] = [];
    for (const t of [1, 2, 6, 6.5]) taps = addTap(taps, t);
    expect(taps).toEqual([6, 6.5]);
    expect(tapFit(taps, 4, undefined, undefined)).toBeNull();
    expect(tapFit([1.3, 1.8], 4, { bpm: 120, offsetSec: 0 }, undefined)?.bpm).toBe(120);
    const eight = Array.from({ length: 8 }, (_, i) => 1.3 + i * 0.5);
    expect(tapFit(eight, 4, undefined, undefined)?.bpm).toBeCloseTo(120, 1);
  });
  it('save keeps the offset inside the first bar; nudges as the web', () => {
    expect(gridToSave({ bpm: 120, offsetSec: 5.3 }, 4).offsetSec).toBeCloseTo(1.3, 6);
    expect(gridToSave({ bpm: 120, offsetSec: -0.2 }, 4).offsetSec).toBeCloseTo(1.8, 6);
    const later = GRID_ADJUST.find(a => a.label === '"1" is later')!;
    expect(later.f({ bpm: 120, offsetSec: 1 }).offsetSec).toBeCloseTo(1.5, 6);
  });
  it('clicks once per beat, accent on the 1', () => {
    const g = { bpm: 60, offsetSec: 0 };
    expect(clickDue(-1, 0.01, g, 4)).toEqual({ beat: 0, click: 'accent' });
    expect(clickDue(0, 0.5, g, 4).click).toBeNull();
    expect(clickDue(0, 1.01, g, 4)).toEqual({ beat: 1, click: 'beat' });
  });
});

describe('Learn by ear', () => {
  const g = { bpm: 120, offsetSec: 1 };
  it('loops with a bar of pre-roll and sounds your part between frames', () => {
    expect(loopSpan(g, 4, 8, 4)).toEqual({ preroll: 1, end: 5 });
    const draft = [{ t: 4, drum: 'kick' as const }, { t: 5, drum: 'snare' as const }];
    expect(loopFrame({ prev: 2.9, t: 3.05, end: 5, draft, hear: true, playing: true, grid: g }).sound).toEqual([draft[0]]);
    expect(loopFrame({ prev: 2.9, t: 3.05, end: 5, draft, hear: false, playing: true, grid: g }).sound).toEqual([]);
    expect(loopFrame({ prev: 5, t: 5.06, end: 5, draft, hear: true, playing: true, grid: g }).passEnded).toBe(true);
  });
  it('keeps a fuller take over a pass you mostly listened to', () => {
    const full = Array.from({ length: 8 }, (_, i) => ({ t: i / 2, drum: 'hihat' as const }));
    expect(keepTake(full, full.slice(0, 3))).toBe(full);
    expect(keepTake(full, full.slice(0, 4))).toHaveLength(4);
    expect(keepTake(full, [])).toBe(full);
  });
  it('tiles the coach groove over the bars and adds only missing notes', () => {
    const groove = { bars: 1, timeSignature: [4, 4] as [4, 4], notes: [{ t: 0, drum: 'kick' as const }, { t: 1, drum: 'snare' as const }] };
    expect(tileGroove(groove, 4, 12).map(n => n.t)).toEqual([4, 5, 8, 9]);
    expect(addMissing([{ t: 4, drum: 'kick' }], [{ t: 4, drum: 'kick' }, { t: 5, drum: 'snare' }])).toEqual([{ t: 4, drum: 'kick' }, { t: 5, drum: 'snare' }]);
    expect(clampRange(0, -1)).toEqual({ from: 1, to: 1 });
  });
});

describe('Jam', () => {
  const g = { bpm: 120, offsetSec: 0 };
  it('scores against the song grid in real ms', () => {
    expect(jamOffset(0.51, g, 2, 1)).toBeCloseTo(10, 6);
    expect(jamOffset(0.51, g, 2, 0.5)).toBeCloseTo(20, 6);
    expect([jamBand(undefined), jamBand(20), jamBand(-50), jamBand(80)]).toEqual(['none', 'good', 'ok', 'bad']);
    expect(jamLive(12.4)).toBe('+12 ms');
    expect(timing(-12)).toBe('rushing by 12 ms');
  });
  it('needs 8 hits; saves a valid run', () => {
    const hits = Array.from({ length: 10 }, (_, i) => ({ songSec: i * 0.25 + 0.005, pad: 'snare' as const, velocity: 90 }));
    expect(scoreJamTake(hits.slice(0, 7), g, 2, 1)).toBeNull();
    const stats = scoreJamTake(hits, g, 2, 1)!;
    expect(stats.onGridPct).toBe(100);
    expect(jamResultTiles(stats)[2].big).toBe('—');
    const run = jamRun({ ...song(), grids: { [ID]: g } }, g, 1, stats, '2026-10-30T20:00:00.000Z', 30);
    expect(RunInputSchema.safeParse(run).success).toBe(true);
    expect(run.chartId).toBe(`jam-yt-${ID}`);
  });
});

describe('Play (scored)', () => {
  it('the song is the clock: position in run beats, begin a bar early', () => {
    const g = { bpm: 120, offsetSec: 1 };
    const s = song({ grids: { [ID]: g }, notes: [{ t: 4, drum: 'kick' }, { t: 15, drum: 'snare' }] });
    expect(songPart(s, g)).toMatchObject({ firstBar: 2, lastBar: 4 });
    const calls: string[] = [];
    let t = 0;
    const yt: SongPlayer = { playing: true, duration: 100, songTime: () => t, seek: x => calls.push(`seek ${x}`), play: () => calls.push('play'), pause: () => calls.push('pause') };
    const o = songTakeOptions({ s, g, yt, range: { from: 2, to: 3 }, rate: 1, latencyMs: 20 });
    t = 3; // song 3 s = beat 4 = bar 2 beat 0
    expect(o.external.position(0)).toBeCloseTo(0, 6);
    o.external.begin(); o.external.end();
    expect(calls).toEqual(['seek 1', 'play', 'pause']);
    expect(o).toMatchObject({ fromBar: 2, toBar: 3, metronome: false, countInBars: 1, bpm: 120 });
  });
});

describe('Import files', () => {
  function midiFile() {
    const m = new Midi();
    m.header.setTempo(100);
    m.name = 'Groove';
    const tr = m.addTrack();
    tr.channel = 9;
    [36, 42, 38, 42, 56].forEach((n, i) => tr.addNote({ midi: n, time: i * 0.3, duration: 0.1, velocity: 0.7 }));
    return m.toArray();
  }
  it('parses a drum MIDI file and summarises it', () => {
    const r = parseMidiFile(midiFile(), 'groove.mid');
    if (!r.ok) throw new Error(r.error);
    const s = importSummary(r.parsed);
    expect(s.line).toMatch(/^100 BPM · 4\/4 · 1 bars · 4 notes · 1 notes skipped/);
    expect(s.counts).toBe('kick 1 · snare 1 · hihat 2');
    expect(chartToSave(r.parsed, '  ').title).toBe('Groove');
    expect(chartToSave(r.parsed, 'Mine').title).toBe('Mine');
  });
  it('explains a bad file', () => {
    const r = parseMidiFile(new Uint8Array([1, 2, 3]), 'x.mid');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Couldn't read x\.mid: /);
  });
  it('library rows', () => {
    const d = libraryRow({ id: 'a', title: 'A', bpm: 90, bars: 8, timeSignature: [4, 4], notes: [], source: 'ai', hasAudio: true, syncOffsetMs: 0 });
    expect(d.detail).toBe('coach exercise · 90 BPM · 8 bars · 🔊 audio');
  });
});

describe('storage: songs and charts in the coach context', () => {
  it('sends the songs and the coach exercises (not imports, no file paths)', async () => {
    const st = createDataStore(() => openTestDb(), () => {});
    st.songs!.add({ title: 'S', originalId: ID });
    st.charts!.save({ title: 'Mine', bpm: 90, timeSignature: [4, 4], bars: 1, notes: [{ t: 0, drum: 'kick' }] }, 'import');
    const ai = st.charts!.save({ title: 'Drill', bpm: 90, timeSignature: [4, 4], bars: 1, notes: [{ t: 0, drum: 'snare' }] }, 'ai');
    const src = await st.contextSource();
    expect(src.songs).toHaveLength(1);
    expect(src.charts).toEqual([expect.objectContaining({ id: ai.id, title: 'Drill', kind: 'exercise' })]);
    expect(src.charts![0]).not.toHaveProperty('source');
  });
});
