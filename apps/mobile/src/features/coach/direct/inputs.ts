// What each coach route tells the model, built on the iPad for the API-key fallback: the same input the home server
// builds from the iPad's `context` (so the same prompt gives the same kind of answer).
//
// COPIED for a later move to core (with parity tests in direct.test.ts against the server's own functions):
// - contextData / runRowOf / weekFocus: server/coachContext.ts
// - lessonInput, canStandIn, standsInFor, applyBites, uniqueTitle, toLesson: server/ai/lessons.ts
// - catalog and the route bodies of /api/coach/{feedback,plan,lesson,month,session}: server/index.ts
// Change them together with the server (or move them to packages/core and import them from both).
import type { Plan } from '@drum-coach/core/coach/schemas';
import type { AiLesson } from '@drum-coach/core/coach/schemas';
import { CURRICULUM, LESSON_BY_ID, MILESTONES } from '@drum-coach/core/content/curriculum';
import { LIBRARY } from '@drum-coach/core/content/library';
import { beatsPerBar } from '@drum-coach/core/engine/chart';
import { soreActive } from '@drum-coach/core/engine/health';
import { monthly } from '@drum-coach/core/engine/history';
import { dayKey, passFor, toolOf, type Lesson, type LessonProgress, type Profile, type Step } from '@drum-coach/core/engine/lesson';
import { checkpointsOf, currentMilestone, studentRead, visibleLessons } from '@drum-coach/core/engine/planner';
import { studentProfile, type StudentProfile } from '@drum-coach/core/engine/profile';
import type { RunRow } from '@drum-coach/core/engine/progress';
import { skillMap } from '@drum-coach/core/engine/skills';
import { stageSong } from '@drum-coach/core/engine/stageSong';
import { cutBars } from '@drum-coach/core/engine/transcribe';
import type { YtSong } from '@drum-coach/core/youtube/schemas';
import type { CoachContext } from '../../../data/coachContext';

// ---------------- server/coachContext.ts ----------------
type Settings = { profile?: Profile; lessons?: Record<string, LessonProgress>; soreUntil?: string };
type CatalogEntry = { id: string; title: string; kind?: string; level?: number; bpm: number; timeSignature?: unknown; description?: string };
type RecentRun = { chart: string; at: string; bpm: number; accuracy: number; summary: Record<string, unknown> };
type ContextRun = NonNullable<CoachContext['runs']>[number];

export type CoachData = {
  runRows(limit?: number): RunRow[];
  settings(): Settings;
  plan(): CoachContext['plan'];
  teacherNotes(): { date: string; text: string }[];
  aiLessons(): Lesson[];
  songs(): YtSong[];
  song(id: string): YtSong | undefined;
  savedCharts(): CatalogEntry[];
  recentForLesson(): RecentRun[];
  pastTakes(chartId: string): { at: string; bpm: number; accuracyPct: number; meanOffsetMs: number; spreadMs: number }[];
  monthReport(): CoachContext['monthReport'];
};

export const weekFocus = (d: CoachData) => { const p = d.plan(); return p?.focus ? { focus: p.focus, why: p.why, drums: p.drums } : undefined; };

const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

export function runRowOf(r: ContextRun): RunRow {
  const s = (r.summary ?? {}) as Record<string, unknown>, section = obj(s.section), lesson = obj(s.lesson);
  return {
    hasTake: false, chartId: r.chartId, chartTitle: r.chartTitle, level: r.level, startedAt: r.startedAt, durationS: r.durationS,
    bpm: r.bpm, speed: r.speed, accuracy: r.accuracy, meanOffset: r.meanOffset, spread: r.spread, notes: num(s.notes),
    fromBar: num(section.fromBar), toBar: num(section.toBar), tips: Array.isArray(s.tipIds) ? s.tipIds as string[] : undefined,
    perDrum: s.perDrum ? s.perDrum as RunRow['perDrum'] : undefined, tool: typeof lesson.tool === 'string' ? lesson.tool : undefined,
    bite: lesson.bite ? lesson.bite as RunRow['bite'] : undefined,
  };
}

export function contextData(c: CoachContext): CoachData {
  const runs = [...(c.runs ?? [])].sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
  const songs: YtSong[] = ((c.songs ?? []) as { id: string; title: string; timeSignature?: YtSong['timeSignature']; notes?: YtSong['notes'] }[])
    .map(s => ({ id: s.id, title: s.title, originalId: '', drumlessId: null, coverId: null, timeSignature: s.timeSignature ?? [4, 4], notes: s.notes ?? [], grids: {}, verifiedAt: null }));
  const latest = (n: number) => (n > 0 ? runs.slice(-n) : []);
  return {
    runRows: (limit = 5000) => latest(limit).map(runRowOf),
    settings: () => (c.settings ?? {}) as Settings,
    plan: () => c.plan,
    teacherNotes: () => (c.teacherNotes ?? []).slice(-3),
    aiLessons: () => (c.aiLessons ?? []) as unknown as Lesson[],
    songs: () => songs,
    song: id => songs.find(s => s.id === id),
    savedCharts: () => (c.charts ?? []) as unknown as CatalogEntry[],
    recentForLesson: () => latest(15).map(r => {
      const { weakSpots, perDrum, velocity, meanOffsetMs, spreadMs, lesson } = (r.summary ?? {}) as Record<string, unknown>;
      return { chart: r.chartTitle, at: r.startedAt.slice(0, 16), bpm: Math.round(r.bpm), accuracy: r.accuracy, summary: { meanOffsetMs, spreadMs, perDrum, velocity, weakSpots, lesson } };
    }),
    pastTakes: chartId => runs.filter(r => r.chartId === chartId).slice(-5)
      .map(r => ({ at: r.startedAt.slice(0, 16), bpm: Math.round(r.bpm), accuracyPct: r.accuracy, meanOffsetMs: r.meanOffset, spreadMs: r.spread })),
    monthReport: () => c.monthReport,
  };
}

// ---------------- server/ai/lessons.ts ----------------
type State = { profile: Profile; progress: Record<string, LessonProgress>; aiLessons: Lesson[]; recent: RecentRun[]; struggle?: unknown; songs?: YtSong[];
  studentProfile?: StudentProfile; weekFocus?: { focus?: string; why?: string; drums?: string[] }; sore?: boolean; teacherNotes?: { date: string; text: string }[] };

export function lessonInput({ profile, progress, aiLessons, recent, struggle, songs = [], studentProfile: sp, weekFocus: wf, sore, teacherNotes }: State) {
  const all = [...CURRICULUM, ...aiLessons];
  const current = currentMilestone(MILESTONES, all, progress, profile);
  const m = current ?? MILESTONES.filter(x => checkpointsOf(x, all, profile).length).at(-1);
  if (!m) return null;
  const brief = (l: Lesson) => ({ id: l.id, title: l.title, kind: l.kind });
  const steps = (l: Lesson) => l.steps.map(s => ({ title: s.title, text: s.text, activeLanes: s.activeLanes, bpm: s.bpm, notes: s.chart.notes.length > 64 ? undefined : s.chart.notes }));
  return {
    milestone: {
      level: m.level, title: m.title, canDo: m.canDo,
      checkpoints: checkpointsOf(m, all, profile).map(l => ({ ...brief(l), passed: !!progress[l.id]?.completedAt, steps: l.steps.map(s => ({ title: s.title, bpm: s.bpm })) })),
    },
    passBar: passFor(m.level),
    student: { goals: profile.goals.length ? profile.goals : ['not sure yet'], minutesPerDay: profile.minutesPerDay,
      read: studentRead(progress, recent.map(r => ({ accuracy: r.accuracy, bpm: r.bpm, spread: typeof r.summary.spreadMs === 'number' ? r.summary.spreadMs : undefined }))) },
    progress: all.filter(l => progress[l.id]).map(l => {
      const p = progress[l.id];
      return { ...brief(l), level: l.level, byCoach: l.source === 'ai', step: p.step + 1, of: l.steps.length, bpm: p.bpm, passed: !!p.completedAt, bestBpm: p.bestBpm || undefined, stars: p.stars };
    }),
    recentRuns: recent.slice(-15),
    projectSong: profile.song?.stage === m.level ? profile.song : undefined,
    stageSong: (s => s && { id: s.id, title: s.title, bars: s.steps[s.steps.length - 1].chart.bars })(stageSong(m.level, CURRICULUM)),
    songs: songs.filter(s => s.notes.length).map(s => ({ id: s.id, title: s.title, bars: Math.floor(s.notes[s.notes.length - 1].t / beatsPerBar(s)) + 1 })),
    ...(struggle ? { struggle } : {}),
    ...(!current && { postPath: true }),
    ...(sp && { profile: sp }),
    ...(wf?.focus && { weekFocus: wf }),
    ...(sore && { sore: true }),
    ...(teacherNotes?.length && { teacherNotes: teacherNotes.slice(-3) }),
    skills: skillMap(all, progress, dayKey(new Date())).map(k => ({ skill: k.name, mastery: k.mastery, due: k.due })),
    examples: CURRICULUM.filter(l => l.level === m.level && l.kind !== 'song').slice(0, 4).map(l => ({ ...brief(l), what: l.what, how: l.how, steps: steps(l) })),
    yourEarlierLessons: aiLessons.filter(l => l.level === m.level).map(l => ({ title: l.title, tools: l.steps.map(toolOf), passed: !!progress[l.id]?.completedAt })),
  };
}

export const canStandIn = (end: Pick<Step, 'jam' | 'copy' | 'trade' | 'freeBars' | 'pass' | 'layers' | 'bite' | 'rest' | 'probe'>) =>
  !end.rest && !end.probe && ['drill', 'layers', 'bite'].includes(toolOf(end as Step));

export function standsInFor(end: Pick<Step, 'bpm' | 'chart'>, cp: Lesson) {
  const want = cp.steps[cp.steps.length - 1];
  const perBar = (s: Pick<Step, 'chart'>, drum: string) => s.chart.notes.filter(n => n.drum === drum).length / s.chart.bars;
  return end.bpm.target >= want.bpm.target && [...new Set(want.chart.notes.map(n => n.drum))].every(d => perBar(end, d) >= perBar(want, d));
}

const builtinSong = (id: string) => {
  const l = CURRICULUM.find(x => x.id === id && x.kind === 'song'), c = l?.steps[l.steps.length - 1].chart;
  return l && c && { title: l.title.replace(/^Song: /, ''), notes: c.notes, timeSignature: c.timeSignature };
};
export function applyBites(a: AiLesson, song: (id: string) => YtSong | undefined): AiLesson {
  return { ...a, steps: a.steps.map(st => {
    if (!st.bite) return st;
    const s = song(st.bite.songId) ?? builtinSong(st.bite.songId), notes = s ? cutBars(s.notes, beatsPerBar(s), st.bite.fromBar, st.bite.toBar) : [];
    if (!s || !notes.length) { const { bite: _bite, ...rest } = st; return rest; }
    return { ...st, bite: { ...st.bite, title: s.title }, chart: { ...st.chart, timeSignature: s.timeSignature, bars: st.bite.toBar - st.bite.fromBar + 1, notes } };
  }) };
}

export function uniqueTitle(title: string, focus: string, builtinTitles: string[]): string {
  const t = title.trim(), key = (s: string) => s.trim().toLowerCase();
  if (!builtinTitles.some(b => key(b) === key(t))) return title;
  const words = (focus.split(/[.,;:!?—–(]/)[0] ?? '').trim().split(/\s+/).slice(0, 6).join(' ');
  const tail = words && t.length + 2 + words.length <= 80 ? words : 'your version';
  return `${t}: ${tail}`.slice(0, 80);
}

export function toLesson(a: AiLesson, level: number, rand = Math.random().toString(36).slice(2, 7)): Lesson {
  const slug = a.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'lesson';
  const id = `ai-${slug}-${rand}`;
  return { ...a, id, level, source: 'ai', steps: a.steps.map((s, i) => ({ ...s, chart: { ...s.chart, id: `lesson/${id}/${i + 1}`, title: `${a.title} · ${s.title}` } })) } as Lesson;
}

// ---------------- server/index.ts route bodies ----------------
export function catalog(saved: CatalogEntry[]) {
  return [...LIBRARY, ...saved].map(c => ({ id: c.id, title: c.title, kind: c.kind, level: c.level, bpm: c.bpm, timeSignature: c.timeSignature, description: c.description }));
}

const profileOf = (s: Settings): Profile => s.profile ?? { goals: [], minutesPerDay: 25, onboarded: true };

/** POST /api/coach/feedback */
export const feedbackInput = (d: CoachData, summary: Record<string, unknown>) => ({ run: summary, library: catalog(d.savedCharts()) });

/** POST /api/coach/month: the input, or the kept report when this month's is written and not asked again. */
export function monthInput(d: CoachData, again: boolean, now = new Date()) {
  const month = dayKey(now).slice(0, 7);
  const last = d.monthReport();
  if (last?.month === month && !again) return { kept: last.report, month };
  const runs = d.runRows(), s = d.settings(), progress = s.lessons ?? {}, all = [...CURRICULUM, ...d.aiLessons()];
  return {
    month,
    input: {
      month, months: monthly(runs, now.getTime()), skills: skillMap(all, progress, dayKey(now)).map(k => ({ skill: k.name, mastery: k.mastery, due: k.due })),
      lessonsFinished: Object.values(progress).filter(p => p.completedAt?.startsWith(month)).length,
      teacherNotes: d.teacherNotes(), lastReport: last?.month !== month ? last?.report : undefined,
    },
  };
}

export type PlanBody = { goals?: string; minutesPerDay?: number; daysPerWeek?: number; week?: string };
/** POST /api/coach/plan: the input and the lessons the plan may pick (its lessonIds are filtered to them). */
export function planInput(d: CoachData, b: PlanBody, now = new Date()) {
  const recent = d.runRows(30).map(r => ({ chart: r.chartTitle, bpm: Math.round(r.bpm), accuracy: r.accuracy, at: r.startedAt.slice(0, 10) }));
  const s = d.settings(), profile = profileOf(s), progress = s.lessons ?? {};
  const all = [...CURRICULUM, ...d.aiLessons()];
  const m = currentMilestone(MILESTONES, all, progress, profile) ?? MILESTONES.filter(x => checkpointsOf(x, all, profile).length).at(-1);
  const level = m?.level ?? 0;
  const pickable = visibleLessons(all, profile).filter(l => l.level === level || (l.level < level && (progress[l.id]?.stars ?? 3) <= 2)).slice(-30);
  const last = d.plan();
  const songs = d.songs().map(x => ({ id: x.id, title: x.title }));
  return {
    pickable: new Set(pickable.map(l => l.id)),
    input: {
      ...b, goals: b.goals ?? (profile.goals.length ? profile.goals.join(', ') : 'not sure yet'), minutesPerDay: b.minutesPerDay ?? profile.minutesPerDay,
      student: { read: studentRead(progress, d.runRows(12)), profile: studentProfile(d.runRows()), ...(soreActive(s.soreUntil, dayKey(now)) && { sore: true }), teacherNotes: d.teacherNotes() },
      stage: m && { level, title: m.title, canDo: m.canDo },
      lessons: pickable.map(l => ({ id: l.id, title: l.title, level: l.level, kind: l.kind, checkpoint: !!m?.checkpoints.includes(l.id), done: !!progress[l.id]?.completedAt, stars: progress[l.id]?.stars })),
      lastWeek: last && { focus: last.focus, notes: last.notes, week: last.week },
      skills: skillMap(all, progress, dayKey(now)).map(k => ({ skill: k.name, mastery: k.mastery, due: k.due })),
      recent, library: catalog(d.savedCharts()), songs,
    },
  };
}
/** The plan as the route returns it to the iPad (`{ plan, checks: {} }`). */
export const planAnswer = (plan: Plan, pickable: Set<string>, week?: string) =>
  ({ plan: { ...plan, lessonIds: plan.lessonIds?.filter(id => pickable.has(id)), week: week ?? plan.week }, checks: {} });

/** POST /api/coach/lesson: the input (null: no stage fits the goals). */
export function lessonRouteInput(d: CoachData, struggle: unknown, now = new Date()) {
  const s = d.settings();
  return lessonInput({ profile: profileOf(s), progress: s.lessons ?? {}, aiLessons: d.aiLessons(), recent: d.recentForLesson(), struggle,
    songs: d.songs(), studentProfile: studentProfile(d.runRows()), weekFocus: weekFocus(d), sore: soreActive(s.soreUntil, dayKey(now)), teacherNotes: d.teacherNotes() });
}
/** The lesson answer as the route returns it to the iPad: `{ data, cached, replaces }`. */
export function lessonAnswer(d: CoachData, input: NonNullable<ReturnType<typeof lessonInput>>, a: AiLesson, cached: boolean) {
  const existing = d.aiLessons();
  a = { ...a, title: uniqueTitle(a.title, a.focus, [...Object.values(LESSON_BY_ID), ...existing.filter(l => l.level !== input.milestone.level)].map(l => l.title)) };
  const same = existing.find(l => l.title === a.title && l.level === input.milestone.level);
  if (same) return { data: same, cached: true };
  const end = a.steps[a.steps.length - 1], cpLesson = a.checkpoint ? LESSON_BY_ID[a.checkpoint] : undefined;
  const cp = input.milestone.checkpoints.some(c => c.id === a.checkpoint) && canStandIn(end) && cpLesson && standsInFor(end, cpLesson) ? a.checkpoint : undefined;
  const lesson = toLesson(applyBites({ ...a, checkpoint: cp }, id => d.song(id)), input.milestone.level);
  const progress = d.settings().lessons ?? {};
  return { data: lesson, cached, replaces: existing.filter(old => old.level === lesson.level && !progress[old.id]).map(old => old.id) };
}

/** POST /api/coach/session: the event as the coach sees it (history on this exercise, the student, the plan, the teacher). */
export function sessionEvent(d: CoachData, e: Record<string, unknown>, now = new Date()): Record<string, unknown> {
  const event: Record<string, unknown> = { ...e };
  if (event.type === 'open' && typeof event.chartId === 'string') event.pastTakes = d.pastTakes(event.chartId);
  if (event.type === 'open' || event.type === 'take') {
    const s = d.settings();
    event.student = studentRead(s.lessons ?? {}, d.runRows(12));
    const focus = weekFocus(d);
    if (focus) event.weekFocus = focus;
    if (soreActive(s.soreUntil, dayKey(now))) event.sore = true;
    const notes = d.teacherNotes();
    if (notes.length) event.teacherNotes = notes.map(n => ({ date: n.date, text: n.text.slice(0, 300) }));
  }
  return event;
}
