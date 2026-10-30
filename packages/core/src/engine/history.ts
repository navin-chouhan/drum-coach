import type { RunRow } from './progress.ts';

// You vs you, over months (N8): pick an old take and a recent take of the same exercise, and sum up each month.

type Kept = RunRow & { id?: number; hasTake?: boolean };
const DAY = 86_400_000;
const sameBars = (a: Kept, b: Kept) => a.chartId === b.chartId && (a.fromBar ?? 1) === (b.fromBar ?? 1) && (a.toBar ?? 0) === (b.toBar ?? 0);

/**
 * "You a month ago" vs "you now": among exercises with a kept take 28+ days old and one from the last 14 days, the one
 * played most. Both takes must cover the same bars, so the comparison is fair.
 */
export function youVsYou(runs: Kept[], now: number) {
  const kept = runs.filter(r => r.hasTake && r.id !== undefined);
  let best: { then: Kept; now: Kept; count: number } | undefined;
  for (const recent of kept.filter(r => now - Date.parse(r.startedAt) <= 14 * DAY)) {
    const old = kept.filter(r => sameBars(r, recent) && now - Date.parse(r.startedAt) >= 28 * DAY).at(-1); // the newest old one
    if (!old) continue;
    const count = runs.filter(r => sameBars(r, recent)).length;
    if (!best || count > best.count || (count === best.count && recent.startedAt > best.now.startedAt)) best = { then: old, now: recent, count };
  }
  return best && { then: best.then, now: best.now };
}

/** The last `n` months (oldest first): minutes, takes, average accuracy and spread (0 when there were no takes). */
export function monthly(runs: RunRow[], now: number, n = 6) {
  const d = new Date(now);
  const months = Array.from({ length: n }, (_, i) => new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1))
    .map(m => `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  return months.map(month => {
    const rs = runs.filter(r => localMonth(r.startedAt) === month);
    const avg = (f: (r: RunRow) => number) => (rs.length ? Math.round(rs.reduce((a, r) => a + f(r), 0) / rs.length) : 0);
    return { month, takes: rs.length, minutes: Math.round(rs.reduce((a, r) => a + r.durationS, 0) / 60), accuracy: avg(r => r.accuracy), spread: avg(r => r.spread),
      bestBpm: Math.round(Math.max(0, ...rs.filter(r => r.accuracy >= 90).map(r => r.bpm))) };
  });
}
const localMonth = (iso: string) => { const t = new Date(iso); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; };
