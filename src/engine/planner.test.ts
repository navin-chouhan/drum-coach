import { describe, expect, it } from 'vitest';
import { startProgress, type Lesson, type LessonKind, type LessonProgress, type Milestone, type Profile } from './lesson';
import { buildSession, candidates, checkpointsOf, currentMilestone, rankState, studentRead } from './planner';

const chart = { title: 't', bpm: 80, timeSignature: [4, 4] as [number, 4], bars: 1, notes: [{ t: 0, drum: 'snare' as const }] };
const L = (id: string, level: number, kind: LessonKind, o: Partial<Lesson> = {}): Lesson =>
  ({ id, level, kind, title: id, what: '', why: '', how: '', steps: [{ title: '', text: '', chart, bpm: { start: 60, target: 60 } }], ...o });
const lessons = [
  L('count', 0, 'exercise'), L('rests', 0, 'exercise'),
  L('singles', 1, 'rudiment'), L('hands-feet', 1, 'exercise'),
  L('money', 2, 'groove'), L('doubles', 2, 'rudiment'), L('rock-only', 2, 'groove', { tags: ['rock'] }), L('jazz-only', 2, 'groove', { tags: ['jazz'] }),
];
const milestones: Milestone[] = [
  { level: 0, title: 'Ready', rank: 'R', canDo: [], checkpoints: ['rests'] },
  { level: 1, title: 'Limbs', rank: 'R', canDo: [], checkpoints: ['hands-feet'] },
  { level: 2, title: 'Money', rank: 'R', canDo: [], checkpoints: ['money', 'jazz-only'] },
];
const done = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, { ...startProgress(lessons[0]), completedAt: '2026-10-01', reviewDue: '2026-12-01' }])) as Record<string, LessonProgress>;
const D = '2026-10-24';
const profile = { goals: [], minutesPerDay: 25, onboarded: true };
const ids = (s: { lessonId: string }[]) => s.map(i => i.lessonId);

describe('milestones and planner', () => {
  it('fresh student: only lessons of the first milestone, never a groove from level 2', () => {
    expect(buildSession(milestones, lessons, {}, profile, D)).toEqual([
      { role: 'skill', lessonId: 'count', minutes: 12 }, { role: 'skill', lessonId: 'rests', minutes: 12 }, // never over the daily goal
    ]);
  });
  it('a milestone is done when its checkpoints pass, even if practice lessons were skipped', () => {
    expect(currentMilestone(milestones, lessons, done('rests'), profile)?.level).toBe(1);
  });
  it('coach lessons come first; tagged lessons follow the goals', () => {
    const ai = L('ai-kick-fix', 2, 'groove', { source: 'ai' });
    const p = done('rests', 'hands-feet');
    expect(candidates(milestones, [...lessons, ai], p, { ...profile, goals: ['jazz'] }).map(l => l.id)).toEqual(['ai-kick-fix', 'money', 'doubles', 'jazz-only']);
    expect(ids(buildSession(milestones, [...lessons, ai], p, profile, D))).toEqual(['doubles', 'ai-kick-fix']);
  });
  it('only one coach lesson jumps the queue; built-in basics still get a slot', () => {
    const a1 = L('ai-1', 0, 'exercise', { source: 'ai' }), a2 = L('ai-2', 0, 'exercise', { source: 'ai' });
    expect(candidates(milestones, [...lessons, a1, a2], {}, profile).map(l => l.id)).toEqual(['ai-1', 'count', 'rests', 'ai-2']);
  });
  it('hidden checkpoints do not block a milestone', () => {
    expect(currentMilestone(milestones, lessons, done('rests', 'hands-feet', 'money'), { ...profile, goals: ['rock'] })).toBeUndefined();
  });
  it('adds a finished rudiment as warm-up and a due review; short days only learn', () => {
    const p = { ...done('rests', 'singles', 'hands-feet'), rests: { ...done('rests').rests, reviewDue: '2026-10-23' } };
    const s = buildSession(milestones, lessons, p, profile, D);
    expect(s.map(i => [i.role, i.lessonId])).toEqual([['warmup', 'singles'], ['review', 'rests'], ['skill', 'doubles'], ['groove', 'money']]);
    expect(buildSession(milestones, lessons, p, { ...profile, minutesPerDay: 15 }, D).map(i => i.role)).toEqual(['skill', 'groove']);
  });

  it('a flying student goes straight to the next checkpoint, ahead of coach and practice lessons', () => {
    const star3 = (...xs: string[]) => Object.fromEntries(Object.entries(done(...xs)).map(([k, v]) => [k, { ...v, stars: 3 }]));
    const ai = L('ai-1', 0, 'exercise', { source: 'ai' }), extra = L('echo', 0, 'exercise');
    const all = [extra, ...lessons, ai];
    expect(candidates(milestones, all, star3('count', 'echo'), profile).map(l => l.id)).toEqual(['rests', 'ai-1']);
    expect(candidates(milestones, all, done('count', 'echo'), profile).map(l => l.id)).toEqual(['ai-1', 'rests']); // 1 star: the usual order
  });
});

describe('student read', () => {
  const run = (accuracy: number, spread = 10, bpm = 80) => ({ accuracy, spread, bpm });
  const stars = (...n: number[]) => Object.fromEntries(n.map((s, i) => [`l${i}`, { ...startProgress(lessons[0]), completedAt: `2026-10-0${i + 1}`, stars: s }]));
  it('no history: new', () => expect(studentRead({}, []).pace).toBe('new'));
  it('★★★ lessons and near-perfect tight takes: flying, with the tempo they own', () => {
    expect(studentRead(stars(3, 3, 3), [run(100), run(98), run(100, 12, 90), run(99)])).toMatchObject({ pace: 'flying', comfortableBpm: 80 });
    expect(studentRead(stars(3, 3), []).pace).toBe('flying'); // the planner only has progress
    const sameDay = Object.fromEntries([3, 3, 3, 3, 3, 3, 1].map((n, i) => [`d${i}`, { ...startProgress(lessons[0]), completedAt: '2026-10-05', stars: n }]));
    expect(studentRead(sameDay, []).recentStars).toHaveLength(7); // one day's lessons all count, not 4 picked at random
  });
  it('low accuracy or 1-star lessons: struggling; in between: steady', () => {
    expect(studentRead(stars(3, 3), [run(60), run(70), run(65), run(72)]).pace).toBe('struggling');
    expect(studentRead(stars(1, 1, 2), []).pace).toBe('struggling');
    expect(studentRead(stars(2, 3), [run(90), run(88), run(92), run(85)]).pace).toBe('steady');
    expect(studentRead(stars(3, 3), [run(99, 30), run(99, 30), run(99, 30), run(99, 30)]).pace).toBe('steady'); // landing, but loose
    // A beginner landing three in four but all over the place (wider than any checkpoint allows), nothing finished yet
    expect(studentRead({}, [run(75, 75), run(80, 70), run(70, 80), run(76, 75)]).pace).toBe('struggling');
  });
});

describe('rankState (R7)', () => {
  const m = milestones[0]; // checkpoint: rests
  const p = (o: Partial<LessonProgress>) => ({ ...startProgress(lessons[1]), ...o });
  it('locked, earned, then proven on another day', () => {
    expect(rankState(m, lessons, {}, profile)).toEqual({ state: 'locked', proven: 0, total: 1 });
    expect(rankState(m, lessons, { rests: p({ completedAt: '2026-10-24' }) }, profile)).toEqual({ state: 'earned', proven: 0, total: 1 });
    expect(rankState(m, lessons, { rests: p({ completedAt: '2026-10-24', provenAt: '2026-10-26' }) }, profile)).toEqual({ state: 'proven', proven: 1, total: 1 });
  });
});

describe('buildSession follows the weekly focus (R6)', () => {
  const today = '2026-10-26';
  it('an open focus lesson at or below the current level leads the skill slot; unknown or later ids are ignored', () => {
    const progress = done('count', 'rests'); // stage 0 done → level 1 is current
    const focused = buildSession(milestones, lessons, progress, profile, today, ['nope', 'money', 'hands-feet']);
    expect(focused.find(i => i.role === 'skill' || i.role === 'groove')?.lessonId).toBe('hands-feet');
    expect(focused.map(i => i.lessonId)).not.toContain('money'); // level 2: ahead of the student
  });
  it('a finished focus lesson comes back as the review', () => {
    const progress = done('count', 'rests');
    const s = buildSession(milestones, lessons, progress, { ...profile, minutesPerDay: 30 }, today, ['rests']);
    expect(s.find(i => i.role === 'review')?.lessonId).toBe('rests');
  });
});

describe('buildSession: songs and after the path (R8)', () => {
  const today = '2026-10-26';
  it('the groove slot prefers the stage song\'s open bite lesson', () => {
    const withBite = [...lessons, L('bite-song-x', 1, 'song')];
    const s = buildSession(milestones, withBite, done('count', 'rests'), profile, today);
    expect(s.map(i => i.lessonId)).toContain('bite-song-x');
  });
  it('after the whole path the set is never empty: warm-up, a "prove it" review, and a show-off song', () => {
    const all = [...lessons, L('song-end', 2, 'song')];
    const progress = { ...done('count', 'rests', 'singles', 'hands-feet', 'money', 'jazz-only', 'doubles', 'song-end') };
    const s = buildSession(milestones, all, progress, { ...profile, minutesPerDay: 30 }, today);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s.some(i => i.role === 'review')).toBe(true);
    expect(s.map(i => i.lessonId)).toContain('song-end');
  });
});

describe('buildSession: health (N10)', () => {
  const today = '2026-10-26';
  const withStretch = [...lessons, L('stretch', 0, 'exercise', { routine: true })];
  it('every day opens with the stretch; it is never on the path', () => {
    const s = buildSession(milestones, withStretch, done('count'), profile, today);
    expect(s[0]).toEqual({ role: 'stretch', lessonId: 'stretch', minutes: 2 });
    expect(candidates(milestones, withStretch, {}, profile).map(l => l.id)).not.toContain('stretch');
  });
  it('a sore week: a lighter set', () => {
    const s = buildSession(milestones, withStretch, done('count'), { ...profile, minutesPerDay: 30 }, today, [], { sore: true });
    expect(s.reduce((a, i) => a + i.minutes, 0)).toBeLessThanOrEqual(12);
    expect(s.filter(i => i.role === 'skill' || i.role === 'groove')).toHaveLength(1);
  });
});

describe('buildSession: a skill due for a refresh (N5)', () => {
  it('becomes the review when nothing else is due', () => {
    const s = buildSession(milestones, lessons, done('count', 'rests'), { ...profile, minutesPerDay: 30 }, '2026-10-26', [], { skillReview: 'count' });
    expect(s.find(i => i.role === 'review')?.lessonId).toBe('count');
  });
});

describe('checkpointsOf: style tracks (N6)', () => {
  it('follows the student\'s style, and rock / pop when not sure yet', async () => {
    const { CURRICULUM, MILESTONES } = await import('../content/curriculum');
    const m = MILESTONES.find(x => x.level === 11)!, ids = (goals: Profile['goals']) => checkpointsOf(m, CURRICULUM, { ...profile, goals }).map(l => l.id);
    expect(ids([])).toEqual(['gospel-chops', 'song-gospel']);
    expect(ids(['latin'])).toEqual(['samba', 'song-gospel']);
    expect(ids(['jazz', 'funk'])).toEqual(['gospel-groove', 'jazz-waltz', 'song-gospel']);
  });
});
