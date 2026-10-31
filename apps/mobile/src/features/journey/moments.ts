// What Journey says out loud on a visit (D10 voice first; R6's speakMoment says it): the notice first (the recap, the
// setup nudge, the sore question, a badge, new stages, the health line), then Up next. The plain greeting isn't said.
import type { JourneyMoment } from './voiceShim';
import type { HeroView, NoticeKind } from './model';

/** Emoji at the start of a notice (🛠 🩹 🏅 🎉) are for the eye; the voice would read their names. */
const stripLead = (t: string) => t.replace(/^[^\p{L}\p{N}"'(]+/u, '').trim();

/** The tempo a hero starts at, from its meta ("12 min · 70 → 90 BPM" → 70). */
export function heroBpm(meta: string): number | undefined {
  const m = /(\d+)\s*(?:→\s*\d+\s*)?BPM/.exec(meta);
  return m ? Number(m[1]) : undefined;
}

export function journeyMoments(notice: { kind?: NoticeKind; text: string }, hero: HeroView | null): JourneyMoment[] {
  const out: JourneyMoment[] = [];
  if (notice.kind) out.push({ kind: 'notice', text: stripLead(notice.text) });
  if (hero) out.push({ kind: 'upNext', title: hero.title, step: hero.step.replace(/ · /g, ', ') || undefined, bpm: heroBpm(hero.meta) });
  return out;
}

/** A moment's identity, so each is said once per visit even when the view re-renders. */
export const momentKey = (m: JourneyMoment) => (m.kind === 'notice' ? `n:${m.text}` : `u:${m.title}|${m.step ?? ''}`);
