// Voice first (D10, docs/mobile/REORG-PROPOSAL.md "Voice first"): what the coach says out loud, and when. Pure
// (tested): screens call speakMoment(moment) (voice.ts) at the moment; this table turns it into the words, or
// nothing, from the settings. The count-in and counting along stay in the take engine (sample-exact words).
import type { Settings } from '@drum-coach/core/input/settings';

export type Moment =
  /** Journey: the Up next line, once per visit (the caller decides "once"). */
  | { kind: 'upNext'; title: string; step?: string; bpm?: number }
  /** A lesson step or an exercise opens: what to play, and the one thing to watch. */
  | { kind: 'stepIntro'; title: string; what: string; focus?: string; bpm?: number }
  /** After every scored take (lesson, Practice, Songs): the score, the verdict, and what's next. */
  | { kind: 'take'; landed?: number; total?: number; verdict: string; next?: string }
  /** A live tip during a take. */
  | { kind: 'tip'; text: string }
  /** The recap, a badge, new stages, the setup nudge, a latency hint, break time, the wrists question. */
  | { kind: 'notice'; text: string }
  /** The coach's own words (its replies and feedback). */
  | { kind: 'reply'; text: string };

export type VoiceGate = Pick<Settings, 'voice' | 'liveTips' | 'chattiness'>;

const clean = (s: string) => s.replace(/[🏆✓★🎉🏅🛠🩹💡]/gu, '').replace(/\s+/g, ' ').trim();
/** The first sentence (Short: "46 of 48. Clean." without the rest). */
const firstSentence = (s: string) => /^.*?[.!?](?=\s|$)/.exec(s)?.[0] ?? s;
const end = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/**
 * The words for a moment, or null when nothing is said: the voice is off ("Speak the verdicts" in Setup), a live tip
 * while tips are on the screen only, or anything but a tip during a take (the coach never talks over the playing;
 * the short tips are made to be heard while you play; a take's own score is said as it ends). Chattiness sets the length: quiet = the number and the verdict.
 */
export function momentText(m: Moment, s: VoiceGate, playing = false): string | null {
  if (!s.voice) return null;
  if (m.kind === 'tip') return s.liveTips === 'voice' ? clean(m.text) || null : null;
  if (playing && m.kind !== 'take') return null; // a take moment comes as the take ends, before the screen says so
  const quiet = s.chattiness === 'quiet', talkative = s.chattiness === 'talkative';
  switch (m.kind) {
    case 'upNext':
      return `Up next: ${clean(m.title)}${m.step ? `, ${clean(m.step)}` : ''}${m.bpm ? `, ${m.bpm}` : ''}.`;
    case 'stepIntro': {
      const what = clean(m.what);
      if (quiet) return what ? end(firstSentence(what)) : `${clean(m.title)}.`;
      const head = talkative ? `${clean(m.title)}${m.bpm ? ` at ${m.bpm}` : ''}. ` : '';
      return `${head}${what ? end(what) : ''}${m.focus ? ` ${end(clean(m.focus))}` : ''}`.trim() || null;
    }
    case 'take': {
      const score = m.total ? `${m.landed ?? 0} of ${m.total}. ` : '';
      const verdict = clean(m.verdict);
      if (quiet) return `${score}${verdict ? end(firstSentence(verdict)) : ''}`.trim() || null;
      return `${score}${verdict ? end(verdict) : ''}${m.next ? ` ${end(clean(m.next))}` : ''}`.trim() || null;
    }
    case 'notice':
    case 'reply': {
      const t = clean(m.text);
      return t ? (quiet && m.kind === 'notice' ? end(firstSentence(t)) : t) : null;
    }
  }
}

/**
 * The take moment for a take without a lesson's verdict (Practice, Songs): the notes landed and a word on how it
 * went, by the same 90 % line the cards use for "clean".
 */
export function scoreMoment(stats: { total: number; miss: number; accuracy: number }): Extract<Moment, { kind: 'take' }> {
  const verdict = stats.accuracy >= 90 ? 'Clean.' : stats.accuracy >= 75 ? 'Nearly there: once more.' : 'Keep at it: slower is fine.';
  return { kind: 'take', landed: stats.total - stats.miss, total: stats.total, verdict };
}

/** Kit gesture kick × 2 between takes, key G: say the last spoken moment again. */
export function createRepeat() {
  let last: string | null = null;
  return { remember(text: string) { last = text; }, last: () => last };
}

/**
 * Voice first on the iPad (D10, approved: "spoken live tips by default"): a device that still has the old default
 * (tips on the screen only) moves to spoken tips once. A choice made afterwards is kept: this runs once per install.
 */
export const VOICE_FIRST_KEY = 'drumcoach.voiceFirst';
export function voiceFirstPatch(s: Pick<Settings, 'liveTips'>, done: boolean): Partial<Settings> | null {
  if (done) return null;
  return s.liveTips === 'screen' ? { liveTips: 'voice' } : {};
}
