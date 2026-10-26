import { useSyncExternalStore } from 'react';
import { isoWeek } from '../engine/progress';
import { askCoach } from './api';
import type { Plan } from './schemas';

// The coach's weekly plan (R6), kept outside React like the coach lessons: Journey leads with its lessons.
type Saved = { id: number; plan: Plan; checks: Record<string, boolean> } | null;
let saved: Saved = null, loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

export async function refreshWeekPlan() {
  try { const r = await fetch('/api/plan'); if (r.ok) { saved = await r.json(); loaded = true; notify(); } } catch { /* offline: no plan */ }
}
export const useWeekPlan = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => saved);
/** The plan the coach wrote for this ISO week, if any. */
export const thisWeeksPlan = (now = new Date()) => (saved?.plan.week === isoWeek(now) ? saved.plan : undefined);
/** On the first Journey visit of a week (once some playing is behind you): ask the coach for this week's plan, once. */
export async function ensureWeekPlan(now = new Date()) {
  if (!loaded) await refreshWeekPlan();
  const wk = isoWeek(now);
  if (loaded && saved?.plan.week !== wk) askCoach(`plan-${wk}`, 'plan', { week: wk }, () => void refreshWeekPlan());
}
