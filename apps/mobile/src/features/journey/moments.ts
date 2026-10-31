// What Journey says out loud on a visit (D10 voice first; coach/voice.ts speakMoment says it, and its moments table
// cleans the emoji and gates on the settings): the notice first (the recap, the setup nudge, the sore question, a
// badge, new stages, the health line), then Up next. The plain greeting isn't said.
import type { Moment } from '../coach/moments';
import type { HeroView, NoticeKind } from './model';

/** The tempo a hero starts at, from its meta ("12 min · 70 → 90 BPM" → 70). */
export function heroBpm(meta: string): number | undefined {
  const m = /(\d+)\s*(?:→\s*\d+\s*)?BPM/.exec(meta);
  return m ? Number(m[1]) : undefined;
}

export function journeyMoments(notice: { kind?: NoticeKind; text: string }, hero: HeroView | null): Moment[] {
  const out: Moment[] = [];
  if (notice.kind) out.push({ kind: 'notice', text: notice.text });
  if (hero) out.push({ kind: 'upNext', title: hero.title, step: hero.step.replace(/ · /g, ', ') || undefined, bpm: heroBpm(hero.meta) });
  return out;
}

/** A moment's identity, so each is said once per visit even when the view re-renders. */
export const momentKey = (m: Moment) => (m.kind === 'notice' ? `n:${m.text}` : m.kind === 'upNext' ? `u:${m.title}|${m.step ?? ''}` : m.kind);
