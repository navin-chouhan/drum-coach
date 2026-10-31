import { describe, expect, it, vi } from 'vitest';
import { createVoice, HOLD_MAX_MS, RATE, type SpeakOptions, type VoiceDeps } from './voiceCore';

function rig(o: { ready?: () => Promise<unknown>; volume?: number | undefined; speakThrows?: boolean } = {}) {
  const log: string[] = [];
  const spoken: { text: string; o: SpeakOptions }[] = [];
  let holds = 0;
  const timers: (() => void)[] = [];
  const deps: VoiceDeps = {
    speak: (text, so) => { if (o.speakThrows) throw new Error('no module'); log.push(`speak:${text}`); spoken.push({ text, o: so }); },
    stop: async () => { log.push('stop'); },
    ready: o.ready ?? (async () => { log.push('ready'); }),
    hold: () => { holds++; log.push('hold'); return () => { holds--; log.push('release'); }; },
    volume: () => ('volume' in o ? o.volume : 1),
    setTimer: fn => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
  };
  return { v: createVoice(deps), log, spoken, holds: () => holds, timers };
}

describe('the coach voice (the silent coach on the first iPad test)', () => {
  it('starts the audio session before every sentence, then holds the engine until the sentence is done', async () => {
    const r = rig();
    await r.v.sayNext('Nice take.');
    expect(r.log).toEqual(['ready', 'hold', 'speak:Nice take.']);
    expect(r.holds()).toBe(1);
    r.spoken[0].o.onDone();
    expect(r.holds()).toBe(0);
    r.spoken[0].o.onStopped(); // a second end doesn't release twice
    expect(r.holds()).toBe(0);
  });

  it('keeps the order of queued sentences, and sayNow cuts off what was queued before it', async () => {
    const r = rig();
    void r.v.sayNext('one');
    void r.v.sayNext('two');
    await r.v.sayNow('now');
    void r.v.sayNext('after');
    await r.v.sayNext('last');
    expect(r.spoken.map(s => s.text)).toEqual(['now', 'after', 'last']);
    expect(r.log.indexOf('stop')).toBeLessThan(r.log.indexOf('speak:now'));
  });

  it('still speaks when the audio engine is missing or fails to start (the words are on screen anyway)', async () => {
    const r = rig({ ready: async () => { throw new Error('no audio module'); } });
    await r.v.sayNext('hello');
    expect(r.spoken.map(s => s.text)).toEqual(['hello']);
  });

  it('speaks at the voice volume setting (0.2–1.25 → 0–1), never silently because the setting is missing', async () => {
    for (const [setting, want] of [[0.5, 0.5], [1.25, 1], [undefined, 1]] as const) {
      const r = rig({ volume: setting });
      await r.v.sayNext('x');
      expect(r.spoken[0].o).toMatchObject({ volume: want, rate: RATE });
    }
  });

  it('lets go of the engine if the synthesizer never reports the end, and when speaking throws', async () => {
    const r = rig();
    await r.v.sayNext('x');
    expect(HOLD_MAX_MS).toBeGreaterThan(5000);
    r.timers[0]();
    expect(r.holds()).toBe(0);
    const t = rig({ speakThrows: true });
    await t.v.sayNext('x');
    expect(t.holds()).toBe(0);
  });

  it('stop() drops sentences queued before it', async () => {
    const r = rig({ ready: () => new Promise(res => setTimeout(res, 5)) });
    const p = r.v.sayNext('late');
    await r.v.stop();
    await p;
    expect(r.spoken).toHaveLength(0);
    await r.v.sayNext('next');
    expect(r.spoken.map(s => s.text)).toEqual(['next']);
  });
});
