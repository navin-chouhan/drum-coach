import { drumName } from './liveCoach.ts';
export type RunRow = {
  id?: number; hasTake?: boolean; // N8: the take's hits are kept (replay it)
  chartId: string; chartTitle: string; level?: number; startedAt: string; durationS: number;
  bpm: number; speed: number; accuracy: number; meanOffset: number; spread: number;
  notes?: number; // notes in the take (older rows may lack it)
  fromBar?: number; toBar?: number; // the bars the take covered
  tips?: string[]; // ids of the live tips given during the take (engine/liveCoach.ts)
  perDrum?: Record<string, { notes: number; accuracyPct: number; meanOffsetMs: number }>; // from the take's summary
  bite?: { songId: string; fromBar: number; toBar: number }; // a take of a song bite: which bars of which song
  tool?: string; // the lesson tool (jam, drill, copy…), or flow / arcade; none for Practice and songs
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
  { id: 'showoff', name: 'Show-off song', how: 'Play 16 bars or more of a real song, every bar at 85% or better' },
  { id: 'stage-3star', name: 'Perfect stage', how: 'Every challenge of a stage at three stars' },
] as const;

type BadgeId = (typeof BADGES)[number]['id'];
/**
 * How far along each badge is (Progress shows the closest ones): `value` of `max`, in words, and whether it's earned.
 * `stages`: each stage's checkpoint lesson ids. `readySongs`: the ids of songs that pass songReady (the caller knows
 * each song's bar count); `bestSongBars`: the most bars ready of any song, for the show-off badge's progress.
 */
export function badgeProgress(runs: RunRow[], lessons: Record<string, { stars?: number; completedAt?: string }>, stages: string[][], now = new Date(), readySongs: string[] = [], bestSongBars = 0) {
  const streak = dashboard(runs, now).streak;
  const landed = runs.reduce((a, r) => a + Math.round(((r.notes ?? 0) * r.accuracy) / 100), 0);
  const best = Math.max(0, ...Object.values(lessons).map(x => (x.completedAt ? x.stars ?? 1 : 0))); // stars come with a finished lesson
  const fast = Math.max(0, ...runs.filter(r => r.accuracy >= 90).map(r => Math.round(r.bpm)));
  const stage3 = Math.max(0, ...stages.filter(ids => ids.length).map(ids => ids.filter(id => lessons[id]?.stars === 3).length / ids.length));
  const n = (v: number) => v.toLocaleString('en');
  const p: Record<BadgeId, { value: number; max: number; words: string; done: boolean }> = {
    'first-3star': { value: best, max: 3, words: best ? `best ${'★'.repeat(best)}${'☆'.repeat(3 - best)}` : 'finish a lesson first', done: Object.values(lessons).some(x => x.stars === 3) },
    'fast-100': { value: fast, max: 100, words: fast ? `best: ${fast} BPM` : 'not yet at 90%', done: runs.some(r => r.bpm >= 100 && r.accuracy >= 90) },
    'streak-7': { value: Math.min(streak, 7), max: 7, words: `${streak} / 7 days`, done: streak >= 7 },
    'streak-30': { value: Math.min(streak, 30), max: 30, words: `${streak} / 30 days`, done: streak >= 30 },
    'notes-1k': { value: Math.min(landed, 1000), max: 1000, words: `${n(landed)} / 1,000`, done: landed >= 1000 },
    'notes-10k': { value: Math.min(landed, 10000), max: 10000, words: `${n(landed)} / 10,000`, done: landed >= 10000 },
    'showoff': { value: Math.min(bestSongBars, SHOWOFF_MIN_BARS), max: SHOWOFF_MIN_BARS, words: `${bestSongBars} / ${SHOWOFF_MIN_BARS} bars`, done: readySongs.length > 0 },
    'stage-3star': { value: stage3, max: 1, words: `${Math.round(stage3 * 100)}% of a stage at ★★★`, done: stages.some(ids => ids.length > 0 && ids.every(id => lessons[id]?.stars === 3)) },
  };
  return BADGES.map(b => ({ ...b, ...p[b.id] }));
}

export const earnedBadges = (...a: Parameters<typeof badgeProgress>): string[] => badgeProgress(...a).filter(b => b.done).map(b => b.id);

/** Notes landed per day you played (weighted by the notes in each take), oldest first. */
export function landedByDay(runs: RunRow[]): { date: string; pct: number; takes: number }[] {
  const by = new Map<string, { hit: number; all: number; takes: number }>();
  for (const r of runs) {
    const k = dayKey(new Date(r.startedAt)), w = r.notes ?? 1, d = by.get(k) ?? { hit: 0, all: 0, takes: 0 };
    by.set(k, { hit: d.hit + (w * r.accuracy) / 100, all: d.all + w, takes: d.takes + 1 });
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, pct: Math.round((100 * d.hit) / Math.max(1, d.all)), takes: d.takes }));
}

/** "4 in 10" for a share of notes, the way you'd say it at the kit. */
export const inTen = (pct: number) => (pct >= 10 ? `${Math.round(pct / 10)} in 10` : pct > 0 ? `1 in ${Math.round(100 / pct)}` : 'no');
/** The coach's line over Getting better: your first day in the window against the latest, in plain words. */
export function progressLine(days: { date: string; pct: number }[]): string {
  if (!days.length) return 'Play your first take and this fills in.';
  const name = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en', { weekday: 'long' });
  const last = days[days.length - 1];
  if (days.length === 1) return `${name(last.date)}: ${inTen(last.pct)} notes landed. Your next day of playing goes next to it.`;
  const first = days[0], gap = Math.round((Date.parse(last.date) - Date.parse(first.date)) / 86_400_000);
  const span = gap <= 1 ? 'in one day' : gap <= 7 ? 'in a week' : `in ${Math.round(gap / 7)} weeks`;
  if (last.pct >= first.pct + 5) return `${name(first.date)} ${inTen(first.pct)} notes landed. ${name(last.date)} ${inTen(last.pct)}. That is a real jump ${span}.`;
  if (last.pct <= first.pct - 5) return `${name(last.date)} was harder than ${name(first.date)}: that happens. A slower tempo brings it back.`;
  return `Steady at about ${inTen(last.pct)} notes landing. Slow and even is how it sticks.`;
}

/** A show-off song is a real chunk of the song: at least this many bars, every one ready. */
export const SHOWOFF_MIN_BARS = 16;
export const songReady = (runs: RunRow[], songId: string, totalBars: number) => totalBars >= SHOWOFF_MIN_BARS && barsReady(runs, songId, totalBars) >= totalBars;

/** Song project: which of a song's bars you've played at 85% or better (in any take covering them). */
// shortcut: a take's whole accuracy marks every bar it covered ready; upgrade to per-bar accuracy (results per bar in summary_json) when bites are 4+ bars
export function barsReady(runs: RunRow[], songId: string, totalBars: number): number {
  const ok = new Set<number>();
  for (const r of runs) {
    if (r.accuracy < 85) continue;
    // the song itself (a YouTube song's id, or a built-in song lesson's chart), or a bite of it
    const range = r.bite?.songId === songId ? [r.bite.fromBar, r.bite.toBar]
      : (r.chartId === songId || r.chartId.startsWith(`lesson/${songId}/`)) && r.fromBar && r.toBar ? [r.fromBar, r.toBar] : undefined;
    if (range) for (let b = range[0]; b <= Math.min(range[1], totalBars); b++) ok.add(b);
  }
  return ok.size;
}

/** Practice's "For you": what you played lately, then the coach's drills, a warm-up rudiment, your level, a step up. */
export function forYou<C extends { id: string; kind?: string; level?: number; source?: string }>(charts: C[], runs: RunRow[], level: number, n = 8, pace?: string) {
  const out: { chart: C; why: string }[] = [], has = (c: C) => out.some(o => o.chart === c);
  const add = (c: C | undefined, why: string) => { if (c && !has(c) && out.length < n) out.push({ chart: c, why }); };
  const recent = [...new Set([...runs].reverse().map(r => r.chartId))];
  recent.slice(0, 3).forEach(id => add(charts.find(c => c.id === id), 'played lately'));
  charts.filter(c => c.source === 'ai').slice(-2).reverse().forEach(c => add(c, 'from your coach'));
  add(charts.find(c => c.kind === 'rudiment' && (c.level ?? 0) <= level && !has(c)), 'good warm-up');
  // The library can stop below the path's last stage: then the highest level under yours stands in.
  const at = Math.max(-1, ...charts.map(c => c.level ?? -1).filter(l => l <= level));
  charts.filter(c => c.level === at).forEach(c => add(c, 'at your level'));
  if (pace !== 'struggling') charts.filter(c => c.level === level + 1).forEach(c => add(c, 'a step up')); // D4: not while it's hard
  return out;
}

/**
 * Practice's first tempo for a chart: where you left off (10 slower if last time was rough); never played, a
 * struggling student starts at their comfortable tempo (or 20 under the chart), not at the chart's own (D4).
 */
export function practiceStart(chartBpm: number, last: Pick<RunRow, 'bpm' | 'accuracy'> | undefined, read: { pace: string; comfortableBpm?: number }) {
  if (last) return Math.max(40, Math.round(last.bpm) - (last.accuracy < 60 ? 10 : 0));
  if (read.pace !== 'struggling') return chartBpm;
  return Math.min(chartBpm, read.comfortableBpm ?? Math.max(40, chartBpm - 20));
}

const THEME_WORDS: Record<string, string> = {
  'lay-back': 'laying back behind the click', 'too-far-back': 'staying close to the click', 'swing-more': 'swinging the 8ths', straight: 'straight, even 8ths',
  'bring-up': 'playing the loud parts louder', 'bring-down': 'playing the soft parts softer',
  rushing: 'rushing ahead of the click', dragging: 'landing behind the click', unsteady: 'keeping the click steady',
  reacting: 'playing with the click, not after it', 'missing-kick': 'the kick', extras: 'playing only the notes shown',
  'hh-open': 'keeping the hi-hat pedal down', accents: 'louder accents', ghosts: 'softer ghost notes', even: 'even strokes',
};
/** A live tip id in plain words ("landing behind the click", "the snare"). */
export const tipWords = (cue: string) => THEME_WORDS[cue] ?? (cue.startsWith('missing-') ? `the ${drumName(cue.slice(8))}` : cue);

/**
 * This week's thing: the live tip given most in the last 7 days (3+ times, praise aside), in plain words. It must
 * also show up in the last 5 takes: a habit fixed since then is forgotten.
 */
export function weekTheme(runs: RunRow[], now = new Date()): { cue: string; count: number; words: string } | null {
  const lately = new Set([...runs].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)).slice(-5).flatMap(r => r.tips ?? []));
  const counts = new Map<string, number>();
  for (const r of runs) if ((now.getTime() - Date.parse(r.startedAt)) / 86_400_000 < 7)
    for (const id of r.tips ?? []) if (id !== 'praise' && lately.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const [cue, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!cue || count < 3) return null;
  return { cue, count, words: tipWords(cue) };
}

/** ISO week key ("2026-W43"), for "once a week" things like the Monday recap. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); // the week's Thursday decides its year
  const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The Monday recap: three plain sentences about the last 7 days (whole numbers only). `newBadge`: a badge name earned lately. */
export function weekRecap(d: Pick<Dashboard, 'minutesWeek' | 'landedWeek' | 'landedLastWeek'>, newBadge?: string): string {
  const mins = Math.round(d.minutesWeek);
  const first = mins ? `Last week you played ${mins} minute${mins === 1 ? '' : 's'}.` : "Last week was a quiet one, and that's fine.";
  const second = d.landedWeek === null ? 'Every take you play shows here.'
    : d.landedLastWeek !== null && d.landedWeek > d.landedLastWeek ? `Your notes landed ${d.landedWeek}% of the time, up from ${d.landedLastWeek}%.`
    : `Your notes landed ${d.landedWeek}% of the time.`;
  const third = newBadge ? `New on your shelf: ${newBadge}.` : 'This week, one small thing at a time.';
  return `${first} ${second} ${third}`;
}

/**
 * Your recent takes all leaning late by about the same amount: usually the speakers or headphones, not you (Setup's
 * latency check says so). At least 4 of the last 6 takes 60 ms or more behind; returns how many, and the typical lag.
 */
export function lateTakes(runs: RunRow[]): { takes: number; of: number; ms: number } | null {
  const last = runs.slice(-6), late = last.filter(r => r.meanOffset >= 60);
  if (last.length < 4 || late.length < 4) return null;
  const ms = [...late.map(r => r.meanOffset)].sort((a, b) => a - b)[Math.floor(late.length / 2)];
  return { takes: late.length, of: last.length, ms: Math.round(ms) };
}
