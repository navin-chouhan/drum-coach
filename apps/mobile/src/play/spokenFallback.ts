// The spoken count-in when the audio engine couldn't render its words (pure, tested). The count ("one, two, three,
// four") and counting along are words drum-audio renders offline with the system voice and plays sample-exact
// (AUDIO-DESIGN §1.3). When that rendering fails on a device, prepareWords reports them `missing` and the take used to
// play the clicks alone: the coach never said a word, while Setup's "Test the voice" (the live system voice) worked.
// Then the same words are said live, a little ahead of their beat (the system voice takes a moment to start), so the
// count is heard: not sample-exact, as the web's browser voice isn't either.
import type { AudioEvent } from '@drum-coach/core/play/audioPort';
import { planEvents, planSpecFor, type PlanOptions } from '@drum-coach/core/play/plan';
import type { Chart } from '@drum-coach/core/engine/chart';
import type { Run, RunNote } from '@drum-coach/core/engine/run';

/** How long before its beat a live word is started (the system voice's start-up). */
export const SPEECH_LEAD_MS = 150;

export type SpokenWord = { word: string; at: number };

/** The words the plan wanted but the engine didn't have, at their heard times (the take's own plan, words only). */
export function missingWordCues(x: {
  chart: Chart; run: Run; auto: readonly boolean[]; options: PlanOptions; zero: number; beatMs: number;
  countVoice: boolean; missingWords: readonly string[];
}): SpokenWord[] {
  if (!x.missingWords.length) return [];
  const autoNotes: RunNote[] = x.run.notes.filter((_, i) => x.auto[i]);
  const spec = planSpecFor(x.chart, x.run, autoNotes, x.options, { zero: x.zero, beatMs: x.beatMs, countVoice: x.countVoice, missingWords: new Set() });
  const missing = new Set(x.missingWords);
  return planEvents(spec, -spec.countInBeats, x.run.beats)
    .flatMap((e: AudioEvent) => (e.kind === 'sound' && e.sound.startsWith('word.') && missing.has(e.sound.slice(5)) ? [{ word: e.sound.slice(5), at: e.at }] : []))
    .sort((a, b) => a.at - b.at);
}

/** Says each word SPEECH_LEAD_MS before its time (now = the Clock); words already past are skipped. Returns cancel. */
export function speakAt(words: readonly SpokenWord[], now: number, say: (w: string) => void,
  t: { setTimer: (fn: () => void, ms: number) => unknown; clearTimer: (h: unknown) => void }): () => void {
  const handles = words.flatMap(w => {
    const ms = w.at - SPEECH_LEAD_MS - now;
    return ms < -SPEECH_LEAD_MS ? [] : [t.setTimer(() => say(w.word), Math.max(0, ms))];
  });
  return () => handles.forEach(h => t.clearTimer(h));
}

/** What a core take shows the fallback (core Take, structurally). */
type TakeLike = {
  start(): Promise<void>;
  onEnd(fn: () => void): () => void;
  readonly state: { phase: string; chart: Chart; run: Run; auto: boolean[]; options: PlanOptions & { demo?: boolean }; zero: number; beatMs: number; missingWords: string[] };
};

/**
 * Starts the take, then says the words the engine is missing at their beats (the count-in, counting along); stops
 * them when the take ends. `countVoice` is the setting the take used (settings.countIn); demos say nothing.
 */
export function startWithSpokenFallback(take: TakeLike, d: {
  countVoice: boolean; now: () => number; say: (w: string) => void;
  setTimer: (fn: () => void, ms: number) => unknown; clearTimer: (h: unknown) => void;
}): Promise<void> {
  return take.start().then(() => {
    const s = take.state;
    if (s.phase !== 'playing' || !d.countVoice || s.options.demo || !s.missingWords.length) return;
    const cancel = speakAt(missingWordCues({ chart: s.chart, run: s.run, auto: s.auto, options: s.options, zero: s.zero, beatMs: s.beatMs, countVoice: d.countVoice, missingWords: s.missingWords }),
      d.now(), d.say, d);
    const off = take.onEnd(() => { cancel(); off(); });
  });
}
