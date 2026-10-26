import { dayKey } from './lesson.ts';
import { tipWords, type RunRow } from './progress.ts';

// The student profile (R6): who this student is, from the evidence of their last 28 days, beyond pace. Computed on the
// server from runs (nothing new in the settings blob) and given to the coach for lessons, plans and the live chat.

export type Trend = 'better' | 'worse' | 'same' | null;
export type StudentProfile = {
  days: number; minutes: number; // playing days and minutes in the window
  perDrum: Record<string, { notes: number; accuracy: number; offset: number; trend: Trend }>;
  timing: { offset: number; trend: Trend } | null; // mean ms (+ late) and whether it's closer to the click lately
  topTips: { id: string; count: number; words: string }[];
  tools: Record<string, number>; // minutes per tool: jam, drill, copy… flow, arcade, song, practice, lesson
  songs: { chartId: string; title: string; minutes: number }[];
  weakest: string | null; // the drum landing least often (40+ notes)
};

const WINDOW_DAYS = 28, HALF = 14, MIN_NOTES = 40, MIN_POINTS = 3, MIN_MS = 5;
const r1 = (x: number) => Math.round(x * 10) / 10;

export function studentProfile(runs: RunRow[], now = new Date()): StudentProfile {
  const age = (r: RunRow) => (now.getTime() - Date.parse(r.startedAt)) / 86_400_000;
  const inWindow = runs.filter(r => age(r) >= 0 && age(r) < WINDOW_DAYS);
  const recent = (r: RunRow) => age(r) < HALF;

  // per drum, weighted by notes; the trend compares the two halves of the window
  type Acc = { notes: number; acc: number; off: number };
  const sum = new Map<string, Acc[]>(); // [all, recent, before]
  for (const r of inWindow) for (const [d, v] of Object.entries(r.perDrum ?? {})) {
    if (!v.notes) continue;
    const a = sum.get(d) ?? [0, 1, 2].map(() => ({ notes: 0, acc: 0, off: 0 }));
    for (const k of [0, recent(r) ? 1 : 2]) { a[k].notes += v.notes; a[k].acc += v.accuracyPct * v.notes; a[k].off += v.meanOffsetMs * v.notes; }
    sum.set(d, a);
  }
  const perDrum: StudentProfile['perDrum'] = {};
  for (const [d, [all, now14, before]] of sum) {
    const avg = (x: Acc) => x.acc / x.notes;
    const trend: Trend = now14.notes < MIN_NOTES || before.notes < MIN_NOTES ? null
      : avg(now14) - avg(before) >= MIN_POINTS ? 'better' : avg(before) - avg(now14) >= MIN_POINTS ? 'worse' : 'same';
    perDrum[d] = { notes: all.notes, accuracy: r1(avg(all)), offset: r1(all.off / all.notes), trend };
  }
  const weakest = Object.entries(perDrum).filter(([, v]) => v.notes >= MIN_NOTES).sort((a, b) => a[1].accuracy - b[1].accuracy)[0]?.[0] ?? null;

  // timing: is the average offset closer to the click lately?
  const meanOff = (rs: RunRow[]) => (rs.length ? rs.reduce((a, r) => a + r.meanOffset, 0) / rs.length : null);
  const all = meanOff(inWindow), late = meanOff(inWindow.filter(recent)), early = meanOff(inWindow.filter(r => !recent(r)));
  const timing = all === null ? null : { offset: r1(all), trend: (late === null || early === null ? null
    : Math.abs(early) - Math.abs(late) >= MIN_MS ? 'better' : Math.abs(late) - Math.abs(early) >= MIN_MS ? 'worse' : 'same') as Trend };

  const tips = new Map<string, number>();
  for (const r of inWindow) for (const id of r.tips ?? []) if (id !== 'praise') tips.set(id, (tips.get(id) ?? 0) + 1);
  const topTips = [...tips].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, count]) => ({ id, count, words: tipWords(id) }));

  const tools: Record<string, number> = {}, songMin = new Map<string, { title: string; s: number }>();
  for (const r of inWindow) {
    const tool = r.tool ?? (r.chartId.startsWith('yt-') ? 'song' : r.chartId.startsWith('lesson/') ? 'lesson' : 'practice');
    tools[tool] = (tools[tool] ?? 0) + r.durationS;
    if (r.chartId.startsWith('yt-')) songMin.set(r.chartId, { title: r.chartTitle, s: (songMin.get(r.chartId)?.s ?? 0) + r.durationS });
  }
  for (const k of Object.keys(tools)) tools[k] = Math.round(tools[k] / 60);
  const songs = [...songMin].sort((a, b) => b[1].s - a[1].s).slice(0, 3).map(([chartId, v]) => ({ chartId, title: v.title, minutes: Math.round(v.s / 60) }));

  return {
    days: new Set(inWindow.map(r => dayKey(new Date(r.startedAt)))).size, // local days
    minutes: Math.round(inWindow.reduce((a, r) => a + r.durationS, 0) / 60),
    perDrum, timing, topTips, tools, songs, weakest,
  };
}
