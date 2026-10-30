import type { SessionItem } from './planner.ts';

// Health and long-term habits (N10): warm up, take breaks, short daily beats long, mind your ears and wrists.

export const STRETCH_ID = 'stretch'; // the 2-minute stretch that opens every day's set (content/curriculum.ts)
export const BREAK_AFTER_S = 22 * 60;
/** Played this long in one sitting: time for a short break (shoulders, wrists, ears). */
export const breakDue = (playedSinceBreakS: number) => playedSinceBreakS >= BREAK_AFTER_S;

/** Practice-length advice for today, or nothing: no marathon days in the first week, and a nudge after an hour. */
export function dayAdvice(minutesToday: number, daysPlayed: number): string | undefined {
  if (daysPlayed <= 7 && minutesToday >= 40) return "That's plenty for your first week: short and daily beats long. Your hands learn while you rest.";
  if (minutesToday >= 60) return 'Over an hour today. Stop while it still feels good: tomorrow it sticks better.';
  return undefined;
}

/** "A bit sore" was answered: lighter days until this date (YYYY-MM-DD, inclusive). */
export const soreActive = (soreUntil: string | undefined, today: string) => !!soreUntil && today <= soreUntil;

/** A lighter day: the stretch, one review and one short lesson; no record attempts or extra warm-ups. */
export function lighten(items: SessionItem[]): SessionItem[] {
  const review = items.find(i => i.role === 'review'), learn = items.find(i => i.role === 'skill' || i.role === 'groove');
  return [...items.filter(i => i.role === 'stretch'), ...(review ? [review] : []), ...(learn ? [{ ...learn, minutes: Math.min(5, learn.minutes) }] : [])];
}
