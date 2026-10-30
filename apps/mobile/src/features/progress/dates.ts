// Dates the way Practice and Progress say them, without Intl (Hermes' toLocaleDateString options vary by build):
// the web's `toLocaleDateString('en', { weekday })` names, and day-month dates in the mockups' style ("30 Oct").
import { dayKey } from '@drum-coach/core/engine/lesson';

export { dayKey };
export const DAY_MS = 86_400_000;

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A local day key (YYYY-MM-DD) at noon, so day arithmetic never trips over a clock change. */
export const noonOf = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00`);
/** "Mon" / "Monday" for a day key (the web's dayName). */
export const dayName = (day: string, style: 'short' | 'long' = 'short') => (style === 'long' ? LONG : SHORT)[noonOf(day).getDay()];
/** "Mon" for a timestamp, in local time. */
export const weekdayOf = (iso: string) => SHORT[new Date(iso).getDay()];
/** "30 Oct" for a day key. */
export const shortDate = (day: string) => { const d = noonOf(day); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
/** "30 Oct" for a timestamp, in local time. */
export const shortDateOf = (iso: string) => shortDate(dayKey(new Date(iso)));
/** Whole days from `a` to `b` (day keys). */
export const daysBetween = (a: string, b: string) => Math.round((noonOf(b).getTime() - noonOf(a).getTime()) / DAY_MS);
/** "today" / "yesterday" / "Mon" (within a week) / "30 Oct": when something was played (the web's `ago`). */
export function ago(date: string, today: string): string {
  const n = daysBetween(date.slice(0, 10), today);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 7 ? dayName(date.slice(0, 10)) : shortDate(date.slice(0, 10));
}
/** "6 h 40 min" / "25 min". */
export const minutesWords = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
/** "1,234" (the web's toLocaleString('en')). */
export const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
