import { describe, expect, it } from 'vitest';
import { createSongClock, PLAYING, YT_STATE } from './songClock';
import { createYtController, isRefused, nearestRate, watchUrl, ytErrorText, ytPlayerVars, measureOffset, type YtCommand } from './ytController';

// A synthetic player: the video advances at `rate` from `start` (Clock ms), and getCurrentTime() only updates every
// `stepMs` (YouTube's postMessage granularity), with the poll every 50 ms.
function run(o: { rate?: number; stepMs?: number; ms: number; jitterMs?: number }) {
  const rate = o.rate ?? 1, stepMs = o.stepMs ?? 200, c = createSongClock();
  const start = 10_000;
  c.setState(PLAYING, 0, rate, start);
  const errs: number[] = [];
  for (let t = start; t <= start + o.ms; t += 50) {
    const jitter = o.jitterMs ? ((t / 50) % 3 - 1) * o.jitterMs : 0;
    const shown = Math.floor((t - start) / stepMs) * stepMs; // what getCurrentTime() reports
    c.sample(((shown + jitter) / 1000) * rate, rate, t);
    const truth = ((t - start) / 1000) * rate;
    if (t - start > 1000) errs.push(Math.abs(c.songTime(t) - truth) * 1000);
  }
  return { c, errs, start };
}

describe('song clock (the web yt.ts smoothing on the Clock)', () => {
  it('interpolates between coarse getCurrentTime() updates', () => {
    const { errs } = run({ ms: 10_000 });
    // the raw value is up to 200 ms stale; the smoothed clock stays within a fraction of that
    expect(Math.max(...errs)).toBeLessThan(200);
    expect(errs.reduce((a, b) => a + b, 0) / errs.length).toBeLessThan(120);
  });

  it('runs at the playback rate', () => {
    const { c, start } = run({ rate: 0.5, ms: 4000 });
    expect(c.rate).toBe(0.5);
    const a = c.songTime(start + 5000), b = c.songTime(start + 6000);
    expect(b - a).toBeCloseTo(0.5, 2);
  });

  it('re-anchors at once on a jump (seek elsewhere, stall)', () => {
    const c = createSongClock();
    c.setState(PLAYING, 0, 1, 0);
    c.sample(0.2, 1, 200);
    c.sample(30, 1, 250); // > 250 ms from the prediction
    expect(c.songTime(250)).toBeCloseTo(30, 5);
    expect(c.songTime(1250)).toBeCloseTo(31, 5);
  });

  it('nudges by 15 % of a small error', () => {
    const c = createSongClock();
    c.setState(PLAYING, 0, 1, 0);
    c.sample(1.1, 1, 1000); // predicted 1.0, error 0.1
    expect(c.songTime(1000)).toBeCloseTo(1.015, 5);
  });

  it('stands still while paused and follows samples exactly', () => {
    const c = createSongClock();
    c.setState(YT_STATE.paused, 12, 1, 0);
    expect(c.songTime(5000)).toBe(12);
    c.sample(13, 1, 6000);
    expect(c.songTime(9000)).toBe(13);
    expect(c.playing).toBe(false);
  });

  it('ignores a sample that has not moved', () => {
    const c = createSongClock();
    c.setState(PLAYING, 5, 1, 0);
    c.sample(5, 1, 1000);
    expect(c.songTime(1000)).toBeCloseTo(6, 5);
  });

  it('seek moves the anchor before the player confirms', () => {
    const c = createSongClock();
    c.setState(PLAYING, 40, 1, 0);
    c.seek(-3, 1000);
    expect(c.songTime(1000)).toBe(0);
    expect(c.songTime(1500)).toBeCloseTo(0.5, 5);
  });

  it('heard delay shifts the song time by delay × rate', () => {
    const c = createSongClock();
    c.setState(PLAYING, 10, 2, 0);
    c.heardDelaySec = 0.1;
    expect(c.songTime(0)).toBeCloseTo(9.8, 5);
  });
});

describe('YouTube controller', () => {
  const make = () => {
    let now = 0;
    const sent: YtCommand[] = [];
    const yt = createYtController({ now: () => now, send: c => sent.push(c) });
    return { yt, sent, setNow: (t: number) => { now = t; } };
  };

  it('drops commands until ready, then sends them', async () => {
    const { yt, sent } = make();
    yt.play();
    expect(sent).toEqual([]);
    yt.handle({ type: 'ready', raw: 0, rate: 1, at: 0, duration: 200, title: 'Song', rates: [0.25, 0.5, 0.75, 1, 1.25] });
    await yt.ready;
    yt.play(); yt.pause(); yt.seek(-2);
    expect(sent).toEqual([{ type: 'play' }, { type: 'pause' }, { type: 'seek', sec: 0 }]);
    expect(yt.duration).toBe(200);
    expect(yt.title).toBe('Song');
  });

  it('setRate picks the nearest offered rate', () => {
    const { yt, sent } = make();
    yt.handle({ type: 'ready', raw: 0, rate: 1, duration: 1, title: '', rates: [0.5, 0.75, 1] });
    expect(yt.setRate(0.7)).toBe(0.75);
    expect(sent.at(-1)).toEqual({ type: 'rate', rate: 0.75 });
    expect(nearestRate([], 0.5)).toBe(0.5);
  });

  it('keeps the song clock from stamped events, and falls back to its own now', () => {
    const { yt, setNow } = make();
    yt.handle({ type: 'ready', raw: 0, rate: 1, at: 0, duration: 1, title: '', rates: [1] });
    yt.handle({ type: 'state', state: PLAYING, raw: 2, rate: 1, at: 1000, duration: 100, title: 'T' });
    expect(yt.playing).toBe(true);
    expect(yt.songTime(2000)).toBeCloseTo(3, 5);
    setNow(5000);
    yt.handle({ type: 'state', state: YT_STATE.paused, raw: 6, rate: 1, duration: 100, title: 'T' }); // no `at`
    expect(yt.songTime()).toBe(6);
  });

  it('shows the web error texts and clears them on load', () => {
    const { yt } = make();
    let changes = 0;
    yt.onChange(() => changes++);
    yt.handle({ type: 'ready', raw: 0, rate: 1, duration: 1, title: '', rates: [1] });
    yt.handle({ type: 'error', code: 150 });
    expect(yt.error).toMatch(/doesn't allow this video to be embedded/);
    yt.load('dQw4w9WgXcQ');
    expect(yt.error).toBe('');
    expect(changes).toBe(3);
    expect(ytErrorText({ code: 999 })).toBe('YouTube error 999');
    expect(ytErrorText({ code: 101 })).toBe(ytErrorText({ code: 150 }));
  });

  it('a refused video (101, 150, 152, 153): the web wording, its code, and the watch URL for "Open in YouTube"', () => {
    const { yt } = make();
    yt.handle({ type: 'ready', raw: 0, rate: 1, duration: 1, title: '', rates: [1] });
    yt.handle({ type: 'error', code: 153 });
    expect(yt.error).toBe("The owner doesn't allow this video to be embedded. Try another upload of the song.");
    expect(yt.errorCode).toBe(153);
    expect([101, 150, 152, 153].every(isRefused)).toBe(true);
    expect(isRefused(100) || isRefused(undefined)).toBe(false);
    expect(watchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    yt.load('abc');
    expect(yt.errorCode).toBeUndefined();
  });

  it('playerVars: playsinline, origin only when real', () => {
    expect(ytPlayerVars('http://192.168.1.5:8081')).toEqual({ playsinline: 1, rel: 0, modestbranding: 1, origin: 'http://192.168.1.5:8081' });
    expect(ytPlayerVars('null')).toEqual({ playsinline: 1, rel: 0, modestbranding: 1 });
    expect(ytPlayerVars(undefined)).not.toHaveProperty('origin');
  });

  it('measures the WebView clock offset from round trips', async () => {
    let perf = 100;
    const off = await measureOffset(async () => { perf += 1; return perf + 5000; }, () => perf);
    expect(Math.abs(off - 5000)).toBeLessThanOrEqual(1); // half a bracket at most
  });
});
