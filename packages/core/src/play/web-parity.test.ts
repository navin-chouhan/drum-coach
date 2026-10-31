// T6-1 and B21 parity: the web's own take engine (src/play/player.ts, unchanged) runs next to createTake on the same
// hit stream. Web Audio, the voice, the hit bus and the settings are faked at their module boundary, so the web's
// scheduler calls are captured as heard-time AudioEvents. Both must plan the same sounds (times equal to 1e-6 ms,
// relative to each take's zero) and score the same: results, stats, extras, hits, live tips.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioEvent } from './audioPort.ts';
import { createFakeAudioPort, createFakeBackingPort, createFakeClock, SPEAKER, type HeardSegment } from './fakeAudio.ts';
import { COUNT_WORDS } from './plan.ts';
import { createTake, type Finished, type TakeOptions, type TakeSettings } from './take.ts';
import { DRUM_PAD, type Chart, type ChartDrum, type ChartNote } from '../engine/chart.ts';
import { countPlan } from '../engine/lesson.ts';
import type { Hit } from '../input/hits.ts';

const web = vi.hoisted(() => ({
  ctx: { currentTime: 0, state: 'running', baseLatency: 0, outputLatency: 0 },
  events: [] as AudioEvent[],
  interval: null as null | (() => void),
  hitFns: new Set<(h: unknown) => void>(),
  settings: {},
  missing: new Set<string>(),
  now: 0,
  /** The web's backing sources (playBuffer): heard-time ms, file ms, and when each was stopped. */
  backing: [] as { at: number; offsetMs: number; durMs: number; rate: number; stoppedAt?: number }[],
}));

vi.mock('../../../../src/play/audio', () => ({
  audio: () => web.ctx,
  audioToPerf: (t: number) => t * 1000,
  whenRunning: (fn: () => void) => fn(),
  click: (t: number, level: 0 | 1 | 2, volume = 1) => { web.events.push({ kind: 'sound', at: t * 1000, sound: ['click.bar', 'click.beat', 'click.sub'][level], gain: volume } as AudioEvent); },
  playDrum: (pad: string, vel: number, at: number) => { web.events.push({ kind: 'sound', at: at * 1000, sound: `drum.${pad}`, gain: vel / 127 } as AudioEvent); },
  playBand: (n: { part: string; midi: number[]; vel: number }, at: number, seconds: number) => { web.events.push({ kind: 'band', at: at * 1000, part: n.part, midi: n.midi, durMs: seconds * 1000, vel: n.vel } as AudioEvent); },
  playBuffer: (_b: unknown, when: number, offset: number, duration: number, rate: number) => {
    const src: (typeof web.backing)[number] = { at: when * 1000, offsetMs: offset * 1000, durMs: duration * 1000, rate };
    web.backing.push(src);
    return { stop() { src.stoppedAt ??= web.now; } };
  },
}));
vi.mock('../../../../src/voice/voice', async () => ({
  NUMBERS: (await import('./plan.ts')).COUNT_WORDS,
  hush: () => { /* nothing is speaking */ },
  sayAt: (text: string, when: number) => {
    if (web.missing.has(text)) return false;
    web.events.push({ kind: 'sound', at: when * 1000, sound: `word.${text}`, gain: 1 });
    return true;
  },
}));
vi.mock('../../../../src/coach/aiTips', () => ({ loadTips: () => { /* no coach */ }, applyTip: (_c: unknown, cue: unknown) => cue }));
vi.mock('../../../../src/input/settings', () => ({ getSettings: () => web.settings }));
vi.mock('../../../../src/input/hits', () => ({ onHit: (fn: (h: unknown) => void) => { web.hitFns.add(fn); return () => { web.hitFns.delete(fn); }; } }));

const player = await import('../../../../src/play/player.ts');
const tickWeb = () => web.interval?.();

// The web reads performance.now(); core source must never (vitest.setup.ts): the stand-in throws if core reads it.
const fromCore = (file = '') => /packages\/core\/src\//.test(file) && !/\.test\.ts\b/.test(file);
/**
 * The file of whoever called performance.now(). The web's player reads it on every tick, so this runs thousands of
 * times per case: read the raw call site (3 frames, no stack string, no source-map lookup of every frame), which is
 * what `new Error().stack` line 2 named, at a fraction of the cost.
 */
function callerFile(): string {
  const prepare = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace'), limit = Error.stackTraceLimit;
  try {
    Error.stackTraceLimit = 3; // 0: this function, 1: the performance.now stand-in, 2: its caller
    Error.prepareStackTrace = (_e, sites) => sites[2]?.getFileName() ?? '';
    const holder: { stack?: unknown } = {};
    Error.captureStackTrace(holder);
    return String(holder.stack ?? '');
  } finally {
    if (prepare) Object.defineProperty(Error, 'prepareStackTrace', prepare); else delete (Error as { prepareStackTrace?: unknown }).prepareStackTrace;
    Error.stackTraceLimit = limit;
  }
}
beforeEach(() => {
  vi.stubGlobal('performance', { now: () => { if (fromCore(callerFile())) throw new Error('core read performance'); return web.now; } });
  vi.stubGlobal('setInterval', (fn: () => void) => { web.interval = fn; return 1; });
  vi.stubGlobal('clearInterval', () => { web.interval = null; });
});
afterEach(() => { player.stop(); vi.unstubAllGlobals(); });

const SETTINGS: TakeSettings = { latencyMs: 0, countIn: true, liveTips: 'off', chattiness: 'normal' };
const BASE: TakeOptions = { fromBar: 1, toBar: 1, repeats: 4, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false };

const chartOf = (o: Partial<Chart> & { notes: ChartNote[] }): Chart => ({ title: 't', bpm: 100, timeSignature: [4, 4], bars: 1, ...o });
/** A 4/4 rock beat: 8th hi-hats, kick on 1 and 3 (and the "and" of 3), snare on 2 and 4. */
const rock = (bars = 1, extra: Partial<Chart> = {}): Chart => chartOf({
  bars, ...extra,
  notes: Array.from({ length: bars }, (_, b) => [
    ...Array.from({ length: 8 }, (_, i) => ({ t: b * 4 + i / 2, drum: 'hihat' as const, accent: i % 2 === 0 })),
    { t: b * 4, drum: 'kick' as const }, { t: b * 4 + 2, drum: 'kick' as const }, { t: b * 4 + 2.5, drum: 'kick' as const, ghost: true },
    { t: b * 4 + 1, drum: 'snare' as const }, { t: b * 4 + 3, drum: 'snare' as const },
  ]).flat(),
});

/** Seeded noise (mulberry32). */
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Script = {
  /** The student's strokes, ms from beat 0 (before latency), as a function of the run notes. */
  strokes?: (notes: { t: number; drum: ChartDrum; accent?: boolean; ghost?: boolean }[], beatMs: number) => { ms: number; pad: Hit['pad']; velocity: number }[];
  /** stop() this long after beat 0. */
  stopAtMs?: number;
  maxMs?: number;
};

/** Plays every note, with seeded timing noise, a few misses and a few extras. */
const sloppy = (seed: number, bias = 0, sigma = 12): NonNullable<Script['strokes']> => (notes, beatMs) => {
  const r = rng(seed), out: { ms: number; pad: Hit['pad']; velocity: number }[] = [];
  for (const n of notes) {
    const x = r();
    if (x < 0.06) continue; // a miss
    out.push({ ms: n.t * beatMs + bias + (r() + r() + r() - 1.5) * 2 * sigma, pad: DRUM_PAD[n.drum][0], velocity: n.accent ? 110 : n.ghost ? 35 : 80 });
    if (x > 0.96) out.push({ ms: n.t * beatMs + beatMs / 3, pad: 'tom1', velocity: 70 }); // an extra
  }
  return out;
};

/** A stretch of the backing file heard: from `at` (Clock ms), file ms `offsetMs` on, at `rate`, until `until`. */
type Segment = HeardSegment;
type Outcome = { zero: number; events: AudioEvent[]; finished?: Finished; endPhase: string; feedback: { lane: string; judgement: string; time: number }[]; extraBeats: number[]; cues: string[]; backing: Segment[] };

const T = 5000; // both clocks start here; web and core zeros differ (150 vs 300 ms lead), so everything is compared relative to zero

function strokesFor(chart: Chart, o: TakeOptions, s: Script, run: { notes: { t: number; drum: ChartDrum; accent?: boolean; ghost?: boolean; i: number }[] }, auto: boolean[], beatMs: number) {
  const mine = run.notes.filter((_, i) => !auto[i]);
  return (s.strokes ?? sloppy(1))(mine, beatMs).sort((a, b) => a.ms - b.ms);
}

function drive(step: (now: number) => void, zero: () => number, playing: () => boolean, strokes: { ms: number; pad: Hit['pad']; velocity: number }[], emit: (h: Hit) => void, s: Script, latency: number, stop: () => void) {
  let now = T, next = 0, stopped = false;
  const limit = s.maxMs ?? 120_000;
  while (playing() && now < zero() + limit) {
    now += 25;
    for (; next < strokes.length && zero() + strokes[next].ms + latency <= now; next++) {
      const st = strokes[next];
      emit({ note: 0, velocity: st.velocity, time: zero() + st.ms + latency, pad: st.pad });
    }
    if (s.stopAtMs !== undefined && !stopped && now >= zero() + s.stopAtMs) { stopped = true; stop(); continue; }
    step(now);
  }
}

function runWeb(chart: Chart, o: TakeOptions, s: Script = {}, settings = SETTINGS): Outcome {
  web.events = []; web.now = T; web.ctx.currentTime = T / 1000; web.settings = { ...settings }; web.hitFns.clear(); web.interval = null; web.backing = [];
  let finished: Finished | undefined;
  player.start(chart, o as Parameters<typeof player.start>[1]);
  const zero = player.player.zero, cues: string[] = [];
  const offCue = player.onCue(c => cues.push(c.id));
  const strokes = strokesFor(chart, o, s, player.player.run!, player.player.auto, player.player.beatMs);
  drive(now => { web.now = now; web.ctx.currentTime = now / 1000; tickWeb(); },
    () => zero, () => player.player.phase === 'playing', strokes,
    h => { web.now = Math.max(web.now, h.time); web.hitFns.forEach(f => f(h)); }, s, settings.latencyMs, () => player.stop());
  offCue();
  // (the web's Finished carries its AudioBuffer backing; the core's a file: the shapes differ only there)
  if (player.player.phase === 'done') finished = player.player.finished as unknown as Finished;
  const endPhase = player.player.phase;
  player.stop(); // (a finished take has already stopped its sources; this only clears the player)
  const backing = web.backing.map(b => ({ at: b.at, offsetMs: b.offsetMs, rate: b.rate, until: Math.min(b.at + b.durMs / b.rate, b.stoppedAt ?? Infinity) }));
  return { zero, events: web.events, finished, endPhase, feedback: [...player.player.feedback], extraBeats: [...player.player.extraBeats], cues, backing };
}

async function runCore(chart: Chart, o: TakeOptions, s: Script = {}, settings = SETTINGS, t0 = T): Promise<Outcome> {
  const clock = createFakeClock(t0), song = createFakeBackingPort(clock), port = createFakeAudioPort(clock, SPEAKER, song);
  port.missing = new Set(web.missing);
  const fns = new Set<(h: Hit) => void>();
  const take = createTake({ clock, audio: port, onHit: fn => { fns.add(fn); return () => { fns.delete(fn); }; }, settings: () => settings }, chart, o);
  const cues: string[] = [];
  take.onCue(c => cues.push(c.id));
  await take.start();
  const zero = take.state.zero, shift = t0 - T;
  const strokes = strokesFor(chart, o, s, take.state.run, take.state.auto, take.state.beatMs);
  drive(now => { clock.set(now + shift); take.tick(now + shift); }, () => zero - shift, () => take.state.phase === 'playing', strokes,
    h => { clock.set(Math.max(clock.t, h.time + shift)); fns.forEach(f => f({ ...h, time: h.time + shift })); }, s, settings.latencyMs, () => take.stop('user'));
  expect(take.state.backingError).toBeUndefined();
  expect(take.state.driftMs).toBe(0); // the fake song plays exactly on its line
  return { zero, events: port.events, finished: take.state.phase === 'done' ? take.state.finished : undefined, endPhase: take.state.phase, feedback: [...take.state.feedback], extraBeats: [...take.state.extraBeats], cues, backing: song.heard() };
}

const rel = (o: Outcome) => o.events.map(e => ({ ...e, at: e.at - o.zero })).sort((a, b) => Math.round(a.at * 1e4) - Math.round(b.at * 1e4) || key(a).localeCompare(key(b)));
const key = (e: AudioEvent) => (e.kind === 'sound' ? e.sound : `${e.part}${e.midi.join(',')}`);

/** `cut`: a stopped take cancels what it planned after the stop (the web had scheduled 200 ms of it). */
function expectSamePlan(w: Outcome, c: Outcome, cut = Infinity) {
  const a = rel(w).filter(e => e.at < cut - 1), b = rel(c).filter(e => e.at < cut - 1); // (an event at the cut itself may go either way)
  expect(b.length).toBe(a.length);
  a.forEach((e, i) => {
    const f = b[i];
    expect(key(f)).toBe(key(e));
    expect(Math.abs(f.at - e.at)).toBeLessThan(1e-6);
    if (e.kind === 'sound' && f.kind === 'sound') expect(f.gain).toBeCloseTo(e.gain, 12);
    if (e.kind === 'band' && f.kind === 'band') { expect(f.vel).toBeCloseTo(e.vel, 12); expect(f.durMs).toBeCloseTo(e.durMs, 9); }
  });
}

/** Deep equality, numbers to 1e-6 (a take at another absolute time rounds its offsets differently in the last bits). */
function expectApprox(a: unknown, b: unknown, path = '') {
  if (typeof a === 'number' && typeof b === 'number') { expect(Math.abs(a - b), path).toBeLessThan(1e-6); return; }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    expect(Object.keys(a).sort(), path).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(a)) expectApprox((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  expect(a, path).toEqual(b);
}

function expectSameScore(w: Outcome, c: Outcome) {
  expect(c.endPhase).toBe(w.endPhase);
  expect(c.cues).toEqual(w.cues);
  expect(c.extraBeats.length).toBe(w.extraBeats.length);
  c.extraBeats.forEach((b, i) => expect(b).toBeCloseTo(w.extraBeats[i], 9));
  const fb = (o: Outcome) => o.feedback.map(f => ({ ...f, time: 0 }));
  expect(fb(c)).toEqual(fb(w));
  expectCloseTimes(c.feedback, c.zero, w.feedback, w.zero);
  if (!w.finished) { expect(c.finished).toBeUndefined(); return; }
  const f = c.finished!, g = w.finished;
  expectApprox(f.results, g.results, 'results');
  expect(f.stats).toEqual(g.stats);
  expect(f.run).toEqual(g.run);
  const strip = (hs: { time: number }[]) => hs.map(h => ({ ...h, time: 0 }));
  expect(strip(f.hits)).toEqual(strip(g.hits));
  expect(strip(f.extras)).toEqual(strip(g.extras));
  expectCloseTimes(f.hits, f.zero, g.hits, g.zero);
  expectCloseTimes(f.extras, f.zero, g.extras, g.zero);
  expect(f.cues).toEqual(g.cues);
}

/** The same times relative to each take's zero, to 1e-6 ms. */
function expectCloseTimes(a: { time: number }[], za: number, b: { time: number }[], zb: number) {
  expect(a.length).toBe(b.length);
  a.forEach((h, i) => expect(Math.abs(h.time - za - (b[i].time - zb))).toBeLessThan(1e-6));
}

async function both(chart: Chart, o: Partial<TakeOptions>, s: Script = {}, settings = SETTINGS) {
  const opts = { ...BASE, ...o };
  // the core's lead is 300 ms, the web's 150 ms: starting the core clock 150 ms earlier gives both the same zero
  const w = runWeb(chart, opts, s, settings), c = await runCore(chart, opts, s, settings, T - 150);
  // and the same take on an iOS-like clock (+1e9 ms)
  const far = await runCore(chart, opts, s, settings, T + 1e9);
  return { w, c, far };
}

async function expectParity(chart: Chart, o: Partial<TakeOptions>, s: Script = {}, settings = SETTINGS) {
  const { w, c, far } = await both(chart, o, s, settings);
  expect(w.events.length).toBeGreaterThan(0);
  const opts = { ...BASE, ...o }, cut = s.stopAtMs ?? (opts.endless && opts.seconds ? opts.seconds * 1000 : Infinity);
  expectSamePlan(w, c, cut);
  expectSamePlan(w, far, cut);
  expect(Math.abs(c.zero - w.zero)).toBeLessThan(1e-9);
  expectSameScore(w, c);
  expectSameScore(w, far);
  expectSameBacking(w, c, s.stopAtMs !== undefined || !!opts.endless);
  expectSameBacking(w, far, s.stopAtMs !== undefined || !!opts.endless);
  return { w, c };
}

/**
 * The same stretches of the file at the same heard times, each ending where the web's does (to 1e-6 ms, relative to
 * zero): the core queues each repeat behind the one before it, with its length, so seams are exact. Only a stopped
 * take may cut one up to a tick (25 ms) apart.
 */
function expectSameBacking(w: Outcome, c: Outcome, stopped: boolean) {
  // the web starts every repeat up front and a stop cancels those not yet heard; the core queues one repeat ahead
  const heard = (o: Outcome) => o.backing.filter(b => b.until > b.at);
  const wb = heard(w), cb = heard(c);
  expect(cb.length).toBe(wb.length);
  wb.forEach((a, i) => {
    const b = cb[i];
    expect(Math.abs(b.at - c.zero - (a.at - w.zero))).toBeLessThan(1e-6);
    expect(Math.abs(b.offsetMs - a.offsetMs)).toBeLessThan(1e-6);
    expect(b.rate).toBe(a.rate);
    expect(Math.abs(b.until - c.zero - (a.until - w.zero))).toBeLessThanOrEqual(stopped ? 25 + 1e-6 : 1e-6);
  });
}

const count = (o: Outcome, sound: string) => o.events.filter(e => e.kind === 'sound' && e.sound === sound).length;

describe('createTake vs the web player (T6-1, B21)', () => {
  it('counts the voice words the web says', () => {
    expect(COUNT_WORDS.slice(0, 4)).toEqual(['one', 'two', 'three', 'four']);
  });

  it('4/4 with quarter clicks and a spoken count-in', async () => {
    const { w } = await expectParity(rock(), {});
    expect(count(w, 'word.one')).toBe(1);
    expect(count(w, 'click.bar')).toBe(5);
  });

  it('3/4 in 16ths, two bars of count-in', async () => {
    const waltz = chartOf({ timeSignature: [3, 4], notes: [{ t: 0, drum: 'kick' }, { t: 1, drum: 'snare' }, { t: 2, drum: 'snare' }] });
    const { w } = await expectParity(waltz, { subdivision: 4, countInBars: 2, repeats: 3 });
    expect(count(w, 'click.sub')).toBeGreaterThan(0);
  });

  it('7/8 in 2+2+3, counted "one … seven"', async () => {
    const odd = chartOf({ timeSignature: [7, 8], notes: [{ t: 0, drum: 'kick' }, { t: 1, drum: 'snare' }, { t: 2, drum: 'snare' }, { t: 3, drum: 'hihat' }] });
    const { w } = await expectParity(odd, { repeats: 4 });
    expect(count(w, 'word.seven')).toBe(1);
  });

  it('7/8 with the metronome off: words, no clicks', async () => {
    const odd = chartOf({ timeSignature: [7, 8], notes: [{ t: 0, drum: 'kick' }, { t: 2, drum: 'snare' }] });
    const { w } = await expectParity(odd, { metronome: false, repeats: 2 });
    expect(count(w, 'click.bar') + count(w, 'click.beat') + count(w, 'click.sub')).toBe(0);
  });

  it('subdivision 2, metronome off (count-in only)', async () => {
    await expectParity(rock(), { subdivision: 2, metronome: false });
  });

  for (const clickOn of ['quarters', '8ths', '2and4'] as const) {
    it(`clickOn ${clickOn}`, async () => { await expectParity(rock(), { clickOn, subdivision: 1 }); });
  }

  it('gap bars and a fading click', async () => {
    await expectParity(rock(), { gapBars: 2, repeats: 6 });
    await expectParity(rock(), { fadeClick: 3, repeats: 6, subdivision: 2 });
  });

  it('count aloud (8ths), with a missing word left out', async () => {
    web.missing = new Set(['and']);
    try {
      const { w } = await expectParity(rock(), { countAloud: countPlan(6, 4, '8ths'), repeats: 6 });
      expect(count(w, 'word.and')).toBe(0);
      expect(count(w, 'word.three')).toBeGreaterThan(0);
    } finally { web.missing = new Set(); }
  });

  it('the band with free bars', async () => {
    const chart = rock(2);
    await expectParity(chart, { toBar: 2, repeats: 2, band: { style: 'rock', chords: 'C G' }, freeBars: [2], fadeClick: 6 });
    await expectParity(rock(), { band: { style: 'funk' }, gapBars: 3, repeats: 4 });
  });

  it('layered practice: the app plays the lanes you don\'t', async () => {
    const { w } = await expectParity(rock(), { activeLanes: ['snare'] }, { strokes: notes => [...sloppy(4)(notes, 600), { ms: 300, pad: 'kick', velocity: 80 }] });
    expect(count(w, 'drum.kick')).toBeGreaterThan(0);
  });

  it('the guide plays every note at half velocity, still scored', async () => {
    await expectParity(rock(), { guide: true });
  });

  it('a demo plays and scores nothing', async () => {
    const { c } = await expectParity(rock(), { demo: true });
    expect(c.finished).toBeUndefined();
    expect(c.endPhase).toBe('idle');
  });

  it('latency is subtracted from every hit, and count-in noodling is ignored', async () => {
    await expectParity(rock(), { goodMs: 150 }, { strokes: (n, b) => [{ ms: -900, pad: 'snare', velocity: 50 }, ...sloppy(9, 30)(n, b)] }, { ...SETTINGS, latencyMs: 25 });
  });

  it('a road map chart is played whole', async () => {
    const roadmap = { ...rock(3), form: { repeat: [1, 2] as [number, number] }, dyn: [1, 2, 3] };
    await expectParity(roadmap, { toBar: 3, repeats: 1 });
  });

  it('free bars: your own strokes there are not extras', async () => {
    await expectParity(rock(2), { toBar: 2, repeats: 2, freeBars: [2] }, { strokes: (n, b) => [...sloppy(5)(n, b), { ms: 4.5 * b, pad: 'tom2', velocity: 80 }] });
  });

  it('live tips, with the same cues at the same bars', async () => {
    const tips: TakeSettings = { ...SETTINGS, liveTips: 'screen', chattiness: 'talkative' };
    const { c } = await expectParity(rock(), { repeats: 12, swingWant: [50, 60], feelTarget: { ms: 0, tol: 10 } }, { strokes: sloppy(7, -45, 20) }, tips);
    expect(c.cues.length).toBeGreaterThan(0);
    await expectParity(rock(1, { dyn: [3] }), { repeats: 12 }, { strokes: sloppy(8, 60, 5) }, tips);
  });

  it('an endless take keeps the whole bars played when stopped', async () => {
    const { c } = await expectParity(rock(), { endless: true }, { stopAtMs: 600 * 4 * 5 + 700 });
    expect(c.finished!.run.beats).toBe(20);
  });

  it('an endless take with seconds ends by itself', async () => {
    const { c } = await expectParity(rock(), { endless: true, seconds: 15 });
    expect(c.finished!.run.beats).toBe(24);
  });

  it('stopping a timed take drops it', async () => {
    const { c } = await expectParity(rock(), {}, { stopAtMs: 3000 });
    expect(c.endPhase).toBe('idle');
  });

  it('wait mode: no clicks, each group waits until it is played', async () => {
    const strokes: Script['strokes'] = notes => notes.flatMap((n, i) => [
      ...(i === 3 ? [{ ms: i * 400 - 5, pad: 'tom1' as const, velocity: 60 }] : []),
      { ms: i * 400, pad: DRUM_PAD[n.drum][0], velocity: 80 },
    ]);
    const { w, c } = await both(rock(), { wait: true, repeats: 1 }, { strokes });
    expect(w.events).toEqual([]);
    expect(c.events).toEqual([]);
    expectSameScore(w, c);
    expect(c.finished!.stats.extra).toBe(1);
  });
});

describe('backing audio (the web\'s options.backing)', () => {
  // the web's backing is an AudioBuffer, the core's a local file: a take carries both, each engine reads its own
  const song = (syncOffsetMs: number) => ({ backing: { uri: 'file:///songs/x.m4a', syncOffsetMs, buffer: {} } });

  it('the whole song once, from its sync offset', async () => {
    const { w, c } = await expectParity(rock(2), { toBar: 2, repeats: 1, ...song(120) });
    expect(w.backing).toHaveLength(1);
    expect(c.backing[0].offsetMs).toBe(120);
  });

  it('a section looped at 75 %: each repeat restarts the section in the file, at rate = speed', async () => {
    const { w, c } = await expectParity(rock(4), { fromBar: 2, toBar: 3, repeats: 3, speed: 0.75, ...song(250) });
    expect(w.backing.map(b => b.offsetMs)).toEqual([2650, 2650, 2650]); // bar 2 at 100 BPM = 2.4 s, + 250 ms
    expect(w.backing.every(b => b.rate === 0.75)).toBe(true);
    // seamless: each repeat is heard from the instant the one before it ends (one start, then queued segments)
    for (let i = 1; i < 3; i++) expect(c.backing[i].at).toBeCloseTo(c.backing[i - 1].until, 9);
  });

  it('a negative offset: the file starts after beat 0 of each repeat', async () => {
    const { w } = await expectParity(rock(), { repeats: 2, ...song(-300) });
    expect(w.backing.map(b => Math.round((b.at - w.zero) * 1e6) / 1e6)).toEqual([300, 2700]);
  });

  it('a demo plays it too; stopping a take stops it', async () => {
    await expectParity(rock(), { demo: true, repeats: 2, ...song(0) });
    const { c } = await expectParity(rock(), { repeats: 4, ...song(0) }, { stopAtMs: 3000 });
    expect(c.backing.filter(b => b.until > b.at)).toHaveLength(2);
    expect(c.backing).toHaveLength(3); // repeat 3 was queued and cut before it was heard; 4 was never handed over
  });

  it('with live tips, layered lanes and latency, it scores the same', async () => {
    const tips: TakeSettings = { ...SETTINGS, liveTips: 'screen', chattiness: 'talkative', latencyMs: 20 };
    await expectParity(rock(2), { toBar: 2, repeats: 4, activeLanes: ['snare', 'kick'], ...song(40) }, { strokes: sloppy(13, 25) }, tips);
  });

  it('wait mode has no backing (as the web)', async () => {
    const strokes: Script['strokes'] = notes => notes.map((n, i) => ({ ms: i * 400, pad: DRUM_PAD[n.drum][0], velocity: 80 }));
    const { w, c } = await both(rock(), { wait: true, repeats: 1, ...song(0) }, { strokes });
    expect(w.backing).toEqual([]);
    expect(c.backing).toEqual([]);
    expect(c.finished!.stats).toEqual(w.finished!.stats);
  });
});

describe('on an external clock (a song)', () => {
  it('scores beats × beatMs as the web does', async () => {
    const chart = rock(), beatMs = 600;
    const mk = () => {
      let base = 0;
      return { begin: vi.fn(() => { base = 0; }), end: vi.fn(), position: (now: number) => (now - T - 1000 - base) / beatMs };
    };
    const strokes = sloppy(11)(chart.notes.map(n => ({ ...n })), beatMs).map(s => ({ ...s, ms: s.ms + 1000 }));
    const extW = mk(), extC = mk();
    const o = { ...BASE, repeats: 1, external: extW };
    // the web
    web.events = []; web.now = T; web.settings = { ...SETTINGS }; web.hitFns.clear(); web.interval = null;
    player.start(chart, o as Parameters<typeof player.start>[1]);
    // the core
    const clock = createFakeClock(T), port = createFakeAudioPort(clock), fns = new Set<(h: Hit) => void>();
    const take = createTake({ clock, audio: port, onHit: fn => { fns.add(fn); return () => { fns.delete(fn); }; }, settings: () => SETTINGS }, chart, { ...o, external: extC });
    await take.start();
    expect(extC.begin).toHaveBeenCalledOnce();
    let next = 0;
    for (let now = T; now < T + 5000 && take.state.phase === 'playing'; now += 50) {
      for (; next < strokes.length && T + strokes[next].ms <= now; next++) {
        const h: Hit = { note: 0, velocity: strokes[next].velocity, time: T + strokes[next].ms, pad: strokes[next].pad };
        web.hitFns.forEach(f => f(h)); fns.forEach(f => f(h));
      }
      web.now = now; clock.set(now);
      tickWeb(); take.tick(now);
    }
    expect(take.state.phase).toBe('done');
    expect(player.player.phase).toBe('done');
    expect(extC.end).toHaveBeenCalledOnce();
    expect(port.calls).toEqual([]);
    const f = take.state.finished!, g = player.player.finished!;
    expect(f.results).toEqual(g.results);
    expect(f.stats).toEqual(g.stats);
    expect(f.extras).toEqual(g.extras);
    expect(take.state.extraBeats).toEqual(player.player.extraBeats);
    expect(take.state.feedback).toEqual(player.player.feedback);
    expect(take.position(T + 1600)).toBe(1);
  });
});
