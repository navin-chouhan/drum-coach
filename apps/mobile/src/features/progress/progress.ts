// Progress: are you getting better (notes landed per day played, in the coach's words), this week against your goal,
// the skill map, trophies with the closest ones, your time against the daily goal and your lessons in plain words.
// Ported from the web's src/ui/ProgressView.tsx; the numbers are the core's (dashboard, landedByDay, progressLine,
// badgeProgress, skillGroups, rankState, weekTheme, songReady, barsReady) and the show-off set (songs checked by ear
// with every bar ready).
import { MILESTONES } from '@drum-coach/core/content/curriculum';
import type { Lesson, LessonProgress, Profile } from '@drum-coach/core/engine/lesson';
import { checkpointsOf, currentMilestone, rankState } from '@drum-coach/core/engine/planner';
import { badgeProgress, barsReady, dashboard, isoWeek, landedByDay, progressLine, songReady, weekTheme, type RunRow } from '@drum-coach/core/engine/progress';
import { skillGroups } from '@drum-coach/core/engine/skills';
import { cleanSongTitle } from '@drum-coach/core/engine/youtube';
import type { YtSong } from '@drum-coach/core/youtube/schemas';
import type { Settings } from '@drum-coach/core/input/settings';
import type { PracticeChart } from '../practice/catalog';
import { songBarCount, songVerified, type ConcertSong } from '../songs/songsModel';
import { ago, dayKey, dayName, daysBetween, minutesWords, noonOf, plural, shortDate, thousands } from './dates';

export type ProgressInput = {
  /** Every run, oldest first. */
  runs: RunRow[];
  progress: Record<string, LessonProgress>;
  profile: Profile;
  /** Settings.badges: badge ids already earned (a badge stays earned). */
  badges?: string[];
  lessons: Lesson[];
  /** The coach's latest week plan (PlansRepo.latest().plan), if any. */
  plan?: { week?: string; focus?: string };
  /** The saved YouTube songs (SongsRepo.list()), for the show-off set and the show-off trophy. */
  songs?: YtSong[];
  /** Settings.fills: the fills kept from free bars (last 20), oldest first. */
  fills?: Settings['fills'];
  now?: Date;
};

const r = Math.round;
const lessonIdOf = (chartId: string) => chartId.split('/')[1];

export function progressModel(input: ProgressInput) {
  const { runs, progress, profile, lessons, plan } = input;
  const now = input.now ?? new Date();
  const today = dayKey(now);
  const d = dashboard(runs, now);
  const goal = profile.minutesPerDay;

  // The head line: since your first take
  const first = runs[0] && dayKey(new Date(runs[0].startedAt));
  const playedDays = new Set(runs.map(x => dayKey(new Date(x.startedAt)))).size;
  const totalMin = r(runs.reduce((a, x) => a + x.durationS, 0) / 60);
  const since = first ? `Since ${dayName(first)} ${shortDate(first)} · ${plural(playedDays, 'day')} · ${plural(runs.length, 'take')} · ${minutesWords(totalMin)}` : undefined;

  // Getting better: the last 10 days you played
  const days = landedByDay(runs).slice(-10).map(x => ({
    ...x, label: dayName(x.date), dayOfMonth: noonOf(x.date).getDate(),
    title: `${dayName(x.date)} ${shortDate(x.date)}: ${x.pct}% of notes landed, ${plural(x.takes, 'take')}`,
  }));
  const notes = runs.reduce((a, x) => a + (x.notes ?? 0), 0);
  const landed = runs.reduce((a, x) => a + r(((x.notes ?? 0) * x.accuracy) / 100), 0);
  const bestRun = runs.reduce<RunRow | undefined>((b, x) => (!b || x.accuracy > b.accuracy ? x : b), undefined);
  const stars = Object.values(progress).reduce((a, p) => a + (p.completedAt ? p.stars ?? 1 : 0), 0);
  const better = {
    line: progressLine(days),
    days,
    landed: thousands(landed), notes: thousands(notes),
    best: bestRun ? { pct: `${r(bestRun.accuracy)}%`, of: bestRun.chartTitle.split(' · ').at(-1) ?? bestRun.chartTitle } : undefined,
    stars,
  };

  // This week, Monday to Sunday
  const mon = noonOf(today); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return dayKey(x); });
  const runDays = new Set(runs.map(x => dayKey(new Date(x.startedAt))));
  const weekMin = r(runs.filter(x => weekDays.includes(dayKey(new Date(x.startedAt)))).reduce((a, x) => a + x.durationS, 0) / 60);
  const milestone = currentMilestone(MILESTONES, lessons, progress, profile);
  const passed = MILESTONES.filter(m => { const c = checkpointsOf(m, lessons, profile); return c.length > 0 && c.every(l => progress[l.id]?.completedAt); });
  const path = MILESTONES.filter(m => checkpointsOf(m, lessons, profile).length);
  const week = {
    dots: weekDays.map((day, i) => ({ day, letter: 'MTWTFSS'[i], on: runDays.has(day), today: day === today, title: `${dayName(day, 'long')}${runDays.has(day) ? ': played' : ''}` })),
    streak: d.streak, streakWords: `day${d.streak === 1 ? '' : 's'} in a row`,
    minutes: weekMin, goalMinutes: goal * 7, goal,
    fraction: Math.min(1, weekMin / Math.max(1, goal * 7)),
    focus: (plan?.week === isoWeek(now) ? plan.focus : undefined) ?? weekTheme(runs, now)?.words,
    rank: `${passed.length ? passed[passed.length - 1].rank : 'New drummer'}${milestone ? ` · Stage ${path.indexOf(milestone) + 1} · ${milestone.title}` : ''}`,
  };

  // Skill map
  const takes: Record<string, number> = {};
  for (const x of runs) if (x.chartId.startsWith('lesson/')) { const id = lessonIdOf(x.chartId); takes[id] = (takes[id] ?? 0) + 1; }
  const groups = skillGroups(lessons, progress, today, takes, milestone?.level);
  const skillRow = (k: (typeof groups.now)[number]) => ({
    id: k.id, name: k.name, what: k.what, done: k.lessons.done, all: k.lessons.all, started: k.started,
    doneFraction: k.lessons.done / Math.max(1, k.lessons.all), startedFraction: k.started / Math.max(1, k.lessons.all),
    count: `${k.lessons.done} of ${k.lessons.all} lessons${k.started ? ` · ${k.started} started` : ''}`,
    takes: k.takes ? plural(k.takes, 'take') + ' so far' : 'not started',
    label: `${k.lessons.done} of ${k.lessons.all} lessons done, ${k.started} started`,
    refresh: k.due && k.reviewLesson ? k.reviewLesson : undefined,
  });
  const skills = {
    now: groups.now.map(skillRow), next: groups.next.map(skillRow),
    later: groups.later.map(k => ({ id: k.id, name: k.name, count: `${k.lessons.done} of ${k.lessons.all}` })),
  };

  // Trophies: ranks earned (✓ proven) and badges, then the closest with how far you are
  const songs = input.songs ?? [];
  const ready = songs.filter(s => songVerified(s) && songReady(runs, s.id, songBarCount(s))); // N4: checked by ear
  const bestSongBars = Math.max(0, ...songs.map(s => barsReady(runs, s.id, songBarCount(s))));
  const badges = badgeProgress(runs, progress, MILESTONES.map(m => m.checkpoints), now, ready.map(s => s.id), bestSongBars);
  const got = badges.filter(b => b.done || input.badges?.includes(b.id));
  const open = badges.filter(b => !got.includes(b)).sort((a, b) => b.value / b.max - a.value / a.max);
  const ranks = MILESTONES.map(m => ({ m, s: rankState(m, lessons, progress, profile) })).filter(x => x.s.state !== 'locked');
  const trophies = {
    ranks: ranks.map(({ m, s }) => ({ level: m.level, name: m.rank, proven: s.state === 'proven',
      title: `Stage ${m.level + 1}: ${m.title}${s.state === 'proven' ? ' · proven on another day' : ` · prove it on another day (${s.proven} of ${s.total})`}` })),
    badges: got.map(b => ({ id: b.id, name: b.name, how: b.how })),
    earned: ranks.length + got.length,
    closest: open.slice(0, 3).map(b => ({ id: b.id, name: b.name, how: b.how, words: b.words, fraction: b.value / b.max })),
    later: [...open.slice(3).map(b => b.name), ...(MILESTONES.length > ranks.length ? [`+ ${MILESTONES.length - ranks.length} rank trophies`] : [])],
  };

  // Your time: the last 14 days against the daily goal
  const top = Math.max(goal + 10, Math.ceil(Math.max(0, ...d.days.map(x => x.minutes)) / 10) * 10);
  const time = {
    goal, top,
    days: d.days.map(x => ({ ...x, atGoal: x.minutes >= goal, dayOfMonth: noonOf(x.date).getDate(), title: `${dayName(x.date)} ${shortDate(x.date)}: ${x.minutes} min` })),
    from: shortDate(d.days[0].date),
  };

  // Your lessons, newest first, in plain words
  const lessonById = (id: string) => lessons.find(l => l.id === id);
  const lessonRows = d.charts.filter(c => c.chartId.startsWith('lesson/')).map(c => {
    const id = lessonIdOf(c.chartId), l = lessonById(id), p = progress[id], lastDate = c.points.at(-1)?.date ?? '';
    const best = r(Math.max(...c.points.map(x => x.accuracy)));
    const bpm = p && !p.completedAt ? p.bpm : c.points.at(-1)?.bpm;
    const started = l?.steps[0]?.bpm.start;
    return {
      chartId: c.chartId, lessonId: id, title: c.title, takes: c.runs, best, last: r(c.lastAccuracy), bpm, lastDate,
      stars: p?.completedAt ? p.stars ?? 1 : undefined,
      words: lessonWords(p, l?.steps.length ?? 0, { bpm, started, takes: c.runs, best }, today),
      played: lastDate ? ago(dayKey(new Date(lastDate)), today) : '',
      practise: { kind: 'lesson' as const, lessonId: id },
    };
  }).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  const exercises = d.charts.filter(c => !c.chartId.startsWith('lesson/')).map(c => ({ chartId: c.chartId, title: c.title, practise: practiseTarget(c.chartId, c.best90Bpm) }));

  // Show-off set (the web's Coming up): each ready song with ▶ Play it, and a concert of the whole set from two songs
  const showoff = {
    songs: ready.map(s => ({ id: s.id, title: cleanSongTitle(s.title) })),
    concert: ready.length > 1 ? ready.map((s): ConcertSong => ({ id: s.id, bars: { from: 1, to: songBarCount(s) } })) : undefined,
    empty: 'Pass a stage, then play 16 bars or more of its song with every bar at 85% or better. It lands here, ready to play for a friend.',
  };

  // Your fills (the web's Coming up): newest first, each with 🎧 Hear it
  const fills = {
    rows: [...(input.fills ?? [])].reverse().map(f => ({
      id: f.id, line: `${shortDate(f.at.slice(0, 10))} · ${f.notes.length} notes · ${f.bpm} BPM`, chart: fillChart(f),
    })),
    empty: 'Fills you make up in free bars can be kept after the take. They land here.',
  };

  return { empty: runs.length === 0, since, better, week, skills, trophies, showoff, fills, time, lessons: lessonRows, exercises };
}
export type ProgressModel = ReturnType<typeof progressModel>;

/**
 * A lesson row in plain words (the mockup's "step 3, 75 next" / "★★☆ · back for review in 5 days" / "shaky: worth one
 * more go"), from the web table's columns and the lesson's progress. One star means shaky (docs/LEARNING.md).
 */
export function lessonWords(p: LessonProgress | undefined, steps: number, c: { bpm?: number; started?: number; takes: number; best: number }, today: string): string {
  if (p?.completedAt) {
    if ((p.stars ?? 1) <= 1) return 'shaky: worth one more go';
    if (p.reviewDue && p.reviewDue > today) { const n = daysBetween(today, p.reviewDue); return `back for review in ${plural(n, 'day')}`; }
    if (p.reviewDue) return 'due for a review';
    return `done at ${p.bestBpm} BPM`;
  }
  if (p) return `step ${Math.min(p.step + 1, Math.max(1, steps))}, ${p.bpm} next${c.started && c.started !== p.bpm ? ` (started at ${c.started})` : ''}`;
  return `${plural(c.takes, 'take')}, best ${c.best}%`;
}

/** Each row goes back to where it was played: a lesson, or an exercise on Practice (a bit above your best clean tempo). */
export type PractiseTarget = { kind: 'lesson'; lessonId: string } | { kind: 'practice'; chartId: string; bpm?: number } | { kind: 'song'; songId: string };
export function practiseTarget(chartId: string, best90Bpm?: number | null): PractiseTarget {
  if (chartId.startsWith('yt-') || chartId.startsWith('jam-yt-')) return { kind: 'song', songId: chartId.replace(/^jam-/, '') };
  if (chartId.startsWith('lesson/')) return { kind: 'lesson', lessonId: lessonIdOf(chartId) };
  return { kind: 'practice', chartId, ...(best90Bpm ? { bpm: best90Bpm + 5 } : {}) };
}

type Fill = NonNullable<Settings['fills']>[number];
/** A kept fill as a one-bar chart (the web's hearFill: played twice with a bar of count-in; older fills are 4/4). */
export const fillChart = (f: Fill): PracticeChart =>
  ({ id: `fill-${f.id}`, title: 'Your fill', bpm: f.bpm, timeSignature: f.timeSignature ?? [4, 4], bars: 1, notes: f.notes });

/** One star string for 1–3 stars: "★★☆". */
export const starString = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(Math.max(0, 3 - n))}`;
