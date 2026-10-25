export type RunRow = {
  chartId: string; chartTitle: string; level?: number; startedAt: string; durationS: number;
  bpm: number; speed: number; accuracy: number; meanOffset: number; spread: number;
  notes?: number; // notes in the take (older rows may lack it)
  fromBar?: number; toBar?: number; // the bars the take covered
};
export type CatalogItem = { id: string; title: string; bpm: number; level?: number; kind?: string };
export type Suggestion = { chartId: string; bpm: number; reason: string };

export const MAX_SPEED = 1.25;

/**
 * Rule-based adaptive difficulty: two runs at ≥90% → +5 BPM (up to 125% of the chart tempo, then the next level);
 * last run <70% → −10 BPM (not below 50%); otherwise keep going. `runs` oldest first.
 */
export function suggestNext(runs: RunRow[], catalog: CatalogItem[]): Suggestion {
  const byLevel = [...catalog].sort((a, b) => (a.level ?? 5) - (b.level ?? 5));
  const last = runs[runs.length - 1];
  const chart = last && catalog.find(c => c.id === last.chartId);
  if (!last || !chart) {
    const first = byLevel[0];
    return { chartId: first.id, bpm: Math.round(first.bpm * 0.8), reason: `Start with "${first.title}" at 80% speed.` };
  }
  const atTempo = runs.filter(r => r.chartId === chart.id && Math.abs(r.bpm - last.bpm) < 1).slice(-2);
  const max = Math.round(chart.bpm * MAX_SPEED), min = Math.round(chart.bpm * 0.5);
  if (atTempo.length === 2 && atTempo.every(r => r.accuracy >= 90)) {
    if (last.bpm + 5 <= max) return { chartId: chart.id, bpm: Math.round(last.bpm + 5), reason: `Two runs above 90% at ${Math.round(last.bpm)} BPM: speed up by 5.` };
    const next = byLevel.find(c => (c.level ?? 5) > (chart.level ?? 5) && c.id !== chart.id) ?? byLevel.find(c => c.id !== chart.id) ?? chart;
    return { chartId: next.id, bpm: Math.round(next.bpm * 0.8), reason: `"${chart.title}" is solid at full speed. Next: "${next.title}" at 80%.` };
  }
  if (last.accuracy < 70) {
    const bpm = Math.max(min, Math.round(last.bpm - 10));
    return { chartId: chart.id, bpm, reason: `${last.accuracy}% last time: slow down to ${bpm} BPM and get it clean.` };
  }
  return { chartId: chart.id, bpm: Math.round(last.bpm), reason: `Keep working on "${chart.title}" at ${Math.round(last.bpm)} BPM until you hit 90% twice.` };
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type Dashboard = {
  streak: number; minutesToday: number; minutesWeek: number; totalRuns: number;
  landedWeek: number | null; landedLastWeek: number | null; // mean % of notes landed in the last 7 days / the 7 before
  days: { date: string; minutes: number }[]; // last 14 days, oldest first
  charts: { chartId: string; title: string; runs: number; lastAccuracy: number; best90Bpm: number | null; points: { date: string; accuracy: number; bpm: number }[] }[];
};

/** Practice stats from run rows (oldest first), in local time. */
export function dashboard(runs: RunRow[], now = new Date()): Dashboard {
  const minutesByDay = new Map<string, number>();
  for (const r of runs) {
    const k = dayKey(new Date(r.startedAt));
    minutesByDay.set(k, (minutesByDay.get(k) ?? 0) + r.durationS / 60);
  }
  const back = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return dayKey(d); };
  let streak = 0;
  for (let i = minutesByDay.has(back(0)) ? 0 : 1; minutesByDay.has(back(i)); i++) streak++;
  const days = Array.from({ length: 14 }, (_, i) => ({ date: back(13 - i), minutes: r1(minutesByDay.get(back(13 - i)) ?? 0) }));

  const groups = new Map<string, RunRow[]>();
  for (const r of runs) groups.set(r.chartId, [...(groups.get(r.chartId) ?? []), r]);
  const charts = [...groups.values()].map(rs => {
    const good = rs.filter(r => r.accuracy >= 90);
    return {
      chartId: rs[0].chartId, title: rs[rs.length - 1].chartTitle, runs: rs.length, lastAccuracy: rs[rs.length - 1].accuracy,
      best90Bpm: good.length ? Math.max(...good.map(r => Math.round(r.bpm))) : null,
      points: rs.map(r => ({ date: r.startedAt, accuracy: r.accuracy, bpm: Math.round(r.bpm) })),
    };
  }).sort((a, b) => Date.parse(b.points[b.points.length - 1].date) - Date.parse(a.points[a.points.length - 1].date));

  const DAY = 86_400_000, ago = (r: RunRow) => (now.getTime() - Date.parse(r.startedAt)) / DAY;
  const landed = (from: number, to: number) => { const rs = runs.filter(r => ago(r) >= from && ago(r) < to); return rs.length ? Math.round(rs.reduce((a, r) => a + r.accuracy, 0) / rs.length) : null; };
  return {
    streak, totalRuns: runs.length, landedWeek: landed(0, 7), landedLastWeek: landed(7, 14),
    minutesToday: r1(minutesByDay.get(back(0)) ?? 0),
    minutesWeek: r1(Array.from({ length: 7 }, (_, i) => minutesByDay.get(back(i)) ?? 0).reduce((a, b) => a + b, 0)),
    days, charts,
  };
}

/** Badges: a fixed list, earned from runs and lesson progress. Earned ids are kept in Settings.badges (announced once). */
export const BADGES = [
  { id: 'first-3star', name: 'First ★★★', how: 'Three stars on any lesson' },
  { id: 'fast-100', name: 'Clean at 100', how: '90% of notes landed at 100 BPM or faster' },
  { id: 'streak-7', name: '7-day streak', how: 'Play 7 days in a row' },
  { id: 'streak-30', name: '30-day streak', how: 'Play 30 days in a row' },
  { id: 'notes-1k', name: '1,000 notes', how: 'Land 1,000 notes' },
  { id: 'notes-10k', name: '10,000 notes', how: 'Land 10,000 notes' },
  { id: 'showoff', name: 'Show-off song', how: 'Play a real song at 85% or better' },
  { id: 'stage-3star', name: 'Perfect stage', how: 'Every challenge of a stage at three stars' },
] as const;

/** `stages`: each stage's checkpoint lesson ids. */
export function earnedBadges(runs: RunRow[], lessons: Record<string, { stars?: number; completedAt?: string }>, stages: string[][], now = new Date()): string[] {
  const streak = dashboard(runs, now).streak;
  const landed = runs.reduce((a, r) => a + Math.round(((r.notes ?? 0) * r.accuracy) / 100), 0);
  const got: Record<(typeof BADGES)[number]['id'], boolean> = {
    'first-3star': Object.values(lessons).some(p => p.stars === 3),
    'fast-100': runs.some(r => r.bpm >= 100 && r.accuracy >= 90),
    'streak-7': streak >= 7, 'streak-30': streak >= 30,
    'notes-1k': landed >= 1000, 'notes-10k': landed >= 10000,
    'showoff': runs.some(r => r.chartId.startsWith('yt-') && r.accuracy >= 85),
    'stage-3star': stages.some(ids => ids.length > 0 && ids.every(id => lessons[id]?.stars === 3)),
  };
  return BADGES.filter(b => got[b.id]).map(b => b.id);
}

/** Song project: which of a song's bars you've played at 85% or better (in any take covering them). */
export function barsReady(runs: RunRow[], songId: string, totalBars: number): number {
  const ok = new Set<number>();
  for (const r of runs) if (r.chartId === songId && r.accuracy >= 85 && r.fromBar && r.toBar)
    for (let b = r.fromBar; b <= Math.min(r.toBar, totalBars); b++) ok.add(b);
  return ok.size;
}
