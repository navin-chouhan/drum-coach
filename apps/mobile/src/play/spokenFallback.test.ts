import { LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import { createFakeAudioPort, createFakeClock } from '@drum-coach/core/play/fakeAudio';
import { createTake } from '@drum-coach/core/play/take';
import { describe, expect, it } from 'vitest';
import { missingWordCues, speakAt, SPEECH_LEAD_MS, startWithSpokenFallback } from './spokenFallback';

const chart = LESSON_BY_ID['money-8ths'].steps[2].chart;
const OPTS = { fromBar: 1, toBar: 1, repeats: 2, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false } as const;

function timers() {
  const due: { fn: () => void; ms: number }[] = [];
  return { due, setTimer: (fn: () => void, ms: number) => { due.push({ fn, ms }); return due.length; }, clearTimer: (h: unknown) => { due[(h as number) - 1].fn = () => {}; } };
}

describe('the spoken count-in fallback (the silent coach: the engine rendered no words)', () => {
  it('finds the count-in words the engine is missing, on their beats', async () => {
    const clock = createFakeClock(1e9), audio = createFakeAudioPort(clock);
    audio.missing = new Set(['one', 'two', 'three', 'four']);
    const take = createTake({ clock, audio, onHit: () => () => {}, settings: () => ({ latencyMs: 0, countIn: true, liveTips: 'off', chattiness: 'normal' }) }, chart, OPTS);
    await take.start();
    const s = take.state;
    expect(s.missingWords.sort()).toEqual(['four', 'one', 'three', 'two']);
    const cues = missingWordCues({ chart: s.chart, run: s.run, auto: s.auto, options: s.options, zero: s.zero, beatMs: s.beatMs, countVoice: true, missingWords: s.missingWords });
    expect(cues.map(c => c.word)).toEqual(['one', 'two', 'three', 'four']);
    cues.forEach((c, i) => expect(c.at - s.zero).toBeCloseTo((i - 4) * s.beatMs, 3));
  });

  it('says them a little early, skips the past, and stops with the take', async () => {
    const clock = createFakeClock(1e9), audio = createFakeAudioPort(clock);
    audio.missing = new Set(['one', 'two', 'three', 'four']);
    const take = createTake({ clock, audio, onHit: () => () => {}, settings: () => ({ latencyMs: 0, countIn: true, liveTips: 'off', chattiness: 'normal' }) }, chart, OPTS);
    const t = timers(), said: string[] = [];
    await startWithSpokenFallback(take, { countVoice: true, now: () => clock.now(), say: w => said.push(w), ...t });
    expect(t.due).toHaveLength(4);
    const first = take.state.zero - 4 * take.state.beatMs;
    expect(t.due[0].ms).toBeCloseTo(first - SPEECH_LEAD_MS - clock.now(), 6);
    t.due[0].fn();
    expect(said).toEqual(['one']);
    take.stop('user'); // ends the take: the rest are cancelled
    t.due.slice(1).forEach(d => d.fn());
    expect(said).toEqual(['one']);
  });

  it('says nothing when the engine has the words, the count-in is off, or for a demo', async () => {
    for (const [missing, countVoice, demo] of [[[], true, false], [['one'], false, false], [['one'], true, true]] as const) {
      const clock = createFakeClock(0), audio = createFakeAudioPort(clock);
      audio.missing = new Set(missing);
      const take = createTake({ clock, audio, onHit: () => () => {}, settings: () => ({ latencyMs: 0, countIn: countVoice, liveTips: 'off', chattiness: 'normal' }) }, chart, { ...OPTS, demo });
      const t = timers();
      await startWithSpokenFallback(take, { countVoice, now: () => clock.now(), say: () => {}, ...t });
      expect(t.due).toHaveLength(0);
    }
  });

  it('speakAt drops words already well past', () => {
    const t = timers();
    speakAt([{ word: 'one', at: 0 }, { word: 'two', at: 1000 }], 600, () => {}, t);
    expect(t.due.map(d => d.ms)).toEqual([1000 - SPEECH_LEAD_MS - 600]);
  });
});
