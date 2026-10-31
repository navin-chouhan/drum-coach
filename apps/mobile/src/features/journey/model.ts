// Journey's view model: everything the screen shows, from the core's rules and the student's data, as plain values.
// The logic is the web's (src/lesson/TodayView.tsx, src/lesson/state.ts) without what v1 leaves out on the iPad (Songs
// and real songs: D5). With "coach automatically" on, it names the once-a-day coach lesson to ask for (`coachAsk`).
// Pure: settings, lessons, runs and the time come in.
import { MILESTONES } from '@drum-coach/core/content/curriculum';
import { greeting } from '@drum-coach/core/engine/greeting';
import { dayAdvice, soreActive } from '@drum-coach/core/engine/health';
import { addDays, dayKey, isProven, toolOf, type Lesson, type Step, type Tool } from '@drum-coach/core/engine/lesson';
import { buildSession, checkpointsOf, currentMilestone, rankState, studentRead, visibleLessons, type SessionRole } from '@drum-coach/core/engine/planner';
import { BADGES, barsReady, dashboard, earnedBadges, isoWeek, weekRecap, type RunRow } from '@drum-coach/core/engine/progress';
import { skillMap } from '@drum-coach/core/engine/skills';
import { stageSong } from '@drum-coach/core/engine/stageSong';
import type { Session, Settings } from '@drum-coach/core/input/settings';
import { groovePreview, type GroovePreview } from './preview';

export const ROLE: Record<SessionRole, string> = { stretch: 'Stretch', warmup: 'Warm-up', review: 'Review', skill: 'New skill', groove: 'Groove', record: 'Beat your best' };
const KIND_ICON: Record<string, string> = { groove: '🥁', rudiment: '🥢', fill: '💥', song: '🎵', exercise: '🎯' };
const TOOL_ICON: Record<Tool, string> = { jam: '🎸', copy: '🔁', trade: '🤜', free: '✨', bite: '🎵', challenge: '🔥', layers: '🧱', drill: '' };
/** The web's lesson icon (src/lesson/tools.ts): the tool's, else the kind's. */
export const iconOf = (l: Lesson) => TOOL_ICON[toolOf(l.steps[0])] || KIND_ICON[l.kind] || '🎯';

export type JourneyInput = {
  settings: Settings;
  /** The built-in curriculum plus the coach's lessons. */
  lessons: Lesson[];
  /** Runs, oldest first (Storage.runs.list()). */
  runs: RunRow[];
  now: Date;
  /** "Something else" presses: steps through this stage's other open lessons. */
  swap?: number;
  /** This week's lessons from the coach's plan (R6), when there is one. */
  focusIds?: string[];
  /** The coach's lessons are read from storage (until then, "no coach lesson" isn't known: the web's aiLessonsLoaded). */
  aiLoaded?: boolean;
};

export type HeroView = {
  lessonId: string;
  /** Index into today's set, or -1 when the lesson isn't from it. */
  item: number;
  icon: string;
  kicker: string;
  title: string;
  /** "Step 3 of 4 · + snare" */
  step: string;
  /** "12 min · 70 → 90 BPM" */
  meta: string;
  what: string;
  preview: GroovePreview | null;
  coachWrote: boolean;
};

export type SetItemView = { index: number; lessonId: string; title: string; detail?: string; value: string; stars?: number; state: 'done' | 'current' | 'todo' };
export type TrailStopView = { id: string; lessonId?: string; title: string; icon: string; state: 'done' | 'now' | 'todo'; stars?: number; flag?: 'checkpoint' | 'coach'; started?: boolean };

export type JourneyView = {
  today: string;
  /** Today's set as stored or proposed (startSessionPatch saves it when an item starts). */
  session: Session;
  coachLine: string;
  /** Pads and latency haven't been checked yet: the title bar offers "Check my kit". */
  setupDue: boolean;
  /** A line about today's playing (a sore week, a long day), or null. */
  healthLine: string | null;
  hero: HeroView | null;
  /** The main move: Start (today's set), Next lesson (set done), Jam (nothing left), or none. */
  main: { label: string; lessonId: string; item: number; emoji: string } | null;
  somethingElse: boolean;
  /** The lesson Just jam opens (no score, with the band). */
  jamLessonId: string | null;
  you: {
    rank: string; proven: boolean; nextRank: string | null; rankNote: string | null;
    ring: { value: string; caption: string; fraction: number } | null;
    streak: number; landedPct: number | null; minutesToday: number; minutesGoal: number;
  };
  set: { items: SetItemView[]; minutesDone: number; minutesTotal: number; done: boolean };
  song: { lessonId: string; title: string; bars: number; ready: number; text: string } | null;
  trail: { title: string; summary: string; stops: TrailStopView[] } | null;
  /** The coach lesson's key for today and this stage (the screen shows "your coach is writing…" while it's asked). */
  coachKey: string;
  /** Ask the coach for a lesson now (once a day per stage: the key); null when not. */
  coachAsk: string | null;
  /** The setup nudge (pads and latency not checked, "Not now" not pressed): the web's notice with two buttons. */
  setupNudge: boolean;
  /** The weekly wrists check-in ("All good" / "A bit sore"), after three days of playing. */
  askSore: boolean;
  /** Make sure there's a plan for this week (the web's ensureWeekPlan: played, coach on, onboarded). */
  weekPlanDue: boolean;
  /** The ear tip is showing this week: the screen marks it seen after a minute (the web's hearingTipWeek). */
  hearingTipDue: boolean;
  /** The Monday recap (first visit of a week, with playing from before it), or null; the screen keeps and says it once. */
  recap: string | null;
  /** Badges earned and not announced yet (Settings.badges keeps the announced ones). */
  newBadges: string[];
  /** After today's set: the 2-minute challenge on the newest finished drill groove (the web's arcade move). */
  arcade: { lessonId: string; title: string; sub: string } | null;
};

export const SETUP_NUDGE = 'Two minutes to check your pads and latency makes every timing score fair.';
export const SORE_ASK = 'Quick check: anything sore after drumming (wrists, forearms, back)?';
/** "A bit sore": lighter days for three days (the web's addDays(today, 3)). */
export const sorePatch = (today: string, wk: string): Partial<Settings> => ({ soreAskedWeek: wk, soreUntil: addDays(today, 3) });
export const HEARING_TIP = 'Protect your ears: keep the headphones at a level you could talk over, and stop if your ears ring.';
export const badgeNames = (ids: string[]) => ids.map(id => BADGES.find(b => b.id === id)?.name ?? id).join(', ');

/**
 * The web's TodayView: with "coach automatically" on, once you've played something, ask once a day for a lesson when
 * there's none waiting for this stage (with no takes yet, the built-in first lessons are the right start), unless the
 * student is flying through. The key is the web's (`lesson-<day>-<stage>-<asks>`; the iPad has no "ask again" here).
 */
export const coachLessonKey = (now: Date, level: number | undefined) => `lesson-${now.toDateString()}-${level}-0`;

const stepOf = (l: Lesson, s: Settings) => l.steps[Math.min(s.lessons[l.id]?.step ?? 0, l.steps.length - 1)];
const stepIndex = (l: Lesson, s: Settings) => Math.min(s.lessons[l.id]?.step ?? 0, l.steps.length - 1);

/** Today's stored set, or a fresh proposal (saved only when it starts): src/lesson/state.ts currentSession. */
export function currentSession(settings: Settings, lessons: Lesson[], today: string, focusIds?: string[]): Session {
  if (settings.session?.date === today) return settings.session;
  return {
    date: today, done: [],
    items: buildSession(MILESTONES, lessons, settings.lessons, settings.profile, today, focusIds,
      { sore: soreActive(settings.soreUntil, today), skillReview: skillMap(lessons, settings.lessons, today).find(k => k.due)?.reviewLesson }),
  };
}

/** The trail's stops (the web's Trail): done, the one you're on, up to 4 more (+N), the ★ checkpoints, the stage song. */
export function trailStops(trail: Lesson[], current: Lesson | undefined, song: Lesson | undefined, s: Settings, isCheckpoint: (l: Lesson) => boolean, maxStops = 10): TrailStopView[] {
  const done = (id: string) => !!s.lessons[id]?.completedAt;
  const started = (id: string) => !!s.lessons[id] && !done(id);
  const cur = current && trail.includes(current) ? current : trail.find(l => !done(l.id));
  const finished = trail.filter(l => done(l.id) && l !== cur);
  const left = trail.filter(l => !done(l.id) && l !== cur);
  const upcoming = left.filter(l => !isCheckpoint(l)).sort((a, b) => Number(started(b.id)) - Number(started(a.id)));
  const shown = upcoming.slice(0, 4), later = upcoming.length - shown.length;
  const stop = (l: Lesson): TrailStopView => ({
    id: l.id, lessonId: l.id, title: l.title.replace(/^Song: /, ''), icon: iconOf(l), state: l === cur ? 'now' : done(l.id) ? 'done' : 'todo',
    stars: done(l.id) ? s.lessons[l.id]?.stars ?? 1 : undefined, flag: isCheckpoint(l) ? 'checkpoint' : l.source === 'ai' ? 'coach' : undefined,
    started: started(l.id) && l !== cur,
  });
  const tail: TrailStopView[] = [
    ...(cur ? [stop(cur)] : []), ...shown.map(stop),
    ...(later > 0 ? [{ id: 'more', title: 'more', icon: `+${later}`, state: 'todo' as const }] : []),
    ...left.filter(isCheckpoint).map(stop),
    ...(song ? [{ ...stop(song), flag: isCheckpoint(song) ? 'checkpoint' as const : undefined }] : []),
  ];
  // Done stops show one by one while they fit; older ones fold into "N done" (the web always folds past 2).
  const room = Math.max(1, maxStops - tail.length);
  const folded = finished.length > room ? finished.slice(0, finished.length - (room - 1)) : [];
  const head = [
    ...(folded.length ? [{ id: 'done', title: `${folded.length} done`, icon: '✓', state: 'done' as const }] : []),
    ...finished.filter(l => !folded.includes(l)).map(stop),
  ];
  return [...head, ...tail];
}

const hoursOf = (d: Date) => d.getHours();

export function buildJourney({ settings: s, lessons, runs, now, swap = 0, focusIds, aiLoaded = false }: JourneyInput): JourneyView {
  const today = dayKey(now);
  const dash = dashboard(runs, now);
  const lessonById = (id: string) => lessons.find(l => l.id === id);
  const done = (id: string) => !!s.lessons[id]?.completedAt;
  const milestone = currentMilestone(MILESTONES, lessons, s.lessons, s.profile);
  const visible = visibleLessons(lessons, s.profile);
  const path = MILESTONES.filter(m => checkpointsOf(m, lessons, s.profile).length);

  // Today's set
  const session = currentSession(s, lessons, today, focusIds);
  const playable = (i: number) => !!lessonById(session.items[i].lessonId);
  const firstUndone = session.items.findIndex((_, i) => playable(i) && !session.done.includes(i));
  const setItems = session.items.flatMap((it, i) => (playable(i) ? [{ it, i, l: lessonById(it.lessonId)! }] : []));
  const setDone = firstUndone < 0;

  // The stage and its trail
  const builtinSong = milestone && stageSong(milestone.level, visible);
  const isCheckpoint = (l: Lesson) => !!milestone?.checkpoints.includes(l.checkpoint ?? l.id);
  // The coach's unstarted lessons for this stage; the newest one is on the trail (as the web).
  const coachOpen = lessons.filter(l => l.source === 'ai' && l.level === milestone?.level && !s.lessons[l.id]?.completedAt);
  const trail = milestone ? visible.filter(l => l.level === milestone.level && l !== builtinSong && (l.source !== 'ai' || l.id in s.lessons || l === coachOpen[coachOpen.length - 1]))
    .sort((a, b) => Number(isCheckpoint(a)) - Number(isCheckpoint(b)) || Number(a.source === 'ai') - Number(b.source === 'ai')) : [];

  // The hero: today's first open item; "Something else" steps through the stage's other open lessons.
  const fromSet = firstUndone >= 0 ? lessonById(session.items[firstUndone].lessonId) : undefined;
  const others = trail.filter(l => !done(l.id) && l !== fromSet)
    .sort((a, b) => Number(toolOf(a.steps[0]) === toolOf(fromSet?.steps[0] ?? a.steps[0])) - Number(toolOf(b.steps[0]) === toolOf(fromSet?.steps[0] ?? b.steps[0])));
  const hero = swap && others.length ? others[(swap - 1) % others.length] : fromSet ?? others[0];
  const heroItem = hero && hero === fromSet ? firstUndone : -1;
  const afterSet = !!hero && heroItem < 0 && setDone && !swap;
  const jam = [...visible].reverse().find(l => l.level <= (milestone?.level ?? 99) && l.steps.some(st => st.jam));

  let heroView: HeroView | null = null;
  if (hero) {
    const st: Step = stepOf(hero, s), si = stepIndex(hero, s);
    const role = heroItem >= 0 ? session.items[heroItem].role : undefined;
    const setPos = setItems.findIndex(x => x.i === heroItem) + 1;
    const minutes = heroItem >= 0 ? session.items[heroItem].minutes : Math.round(s.profile.minutesPerDay / 3);
    const bpm = !st.rest && !st.look ? s.lessons[hero.id]?.bpm ?? st.bpm.start : undefined;
    const target = hero.steps[hero.steps.length - 1].bpm.target;
    const prove = role === 'review' && MILESTONES.some(m => m.checkpoints.includes(hero.id)) && !isProven(s.lessons[hero.id]);
    const kicker = [
      heroItem >= 0 ? 'Up next' : afterSet ? 'Next on your trail' : swap ? 'Something else' : 'Up next',
      ...(role && role !== 'skill' ? [ROLE[role]] : []),
      ...(heroItem >= 0 ? [`${setPos} of ${setItems.length} today`] : []),
      ...(isCheckpoint(hero) ? ['★ checkpoint'] : []),
    ].join(' · ');
    heroView = {
      lessonId: hero.id, item: heroItem, icon: iconOf(hero), kicker, title: `${prove ? 'Prove it: ' : ''}${hero.title.replace(/^Song: /, '')}`,
      step: hero.steps.length > 1 ? `Step ${si + 1} of ${hero.steps.length} · ${st.title}` : st.title,
      meta: [`${minutes} min`, ...(bpm !== undefined ? [`${bpm}${target !== bpm ? ` → ${target}` : ''} BPM`] : [])].join(' · '),
      what: hero.what, preview: groovePreview(st, s.lessons[hero.id], si > 0 ? hero.steps[si - 1] : undefined), coachWrote: hero.source === 'ai',
    };
  }
  const main = hero ? { label: afterSet ? 'Next lesson' : 'Start', lessonId: hero.id, item: heroItem, emoji: '▶' }
    : jam ? { label: 'Jam', lessonId: jam.id, item: -1, emoji: '🎸' } : null;

  // You: rank, streak, notes landed, minutes
  const passed = MILESTONES.filter(m => { const c = checkpointsOf(m, lessons, s.profile); return c.length > 0 && c.every(l => done(l.id)); });
  const rankNow = passed.length ? rankState(passed[passed.length - 1], lessons, s.lessons, s.profile) : undefined;
  const checks = milestone ? checkpointsOf(milestone, lessons, s.profile) : [];
  const checksOpen = checks.filter(l => !done(l.id)).length;
  const trailDone = trail.filter(l => done(l.id)).length;
  const stageNo = milestone ? path.indexOf(milestone) + 1 : 0;

  // The stage song: the built-in one (real songs come with Songs, D5).
  const songBars = builtinSong ? builtinSong.steps[builtinSong.steps.length - 1].chart.bars : 0;
  const song = builtinSong ? {
    lessonId: builtinSong.id, title: builtinSong.title.replace(/^Song: /, ''), bars: songBars,
    ready: done(builtinSong.id) ? songBars : barsReady(runs, builtinSong.id, songBars),
    text: `${songBars} bars with the band. Fill the ring, then play it for a friend.`,
  } : null;

  const minutesDone = setItems.filter(x => session.done.includes(x.i)).reduce((a, x) => a + x.it.minutes, 0);
  const daysPlayed = new Set(runs.map(r => r.startedAt.slice(0, 10))).size;
  const sore = soreActive(s.soreUntil, today);
  const wk = isoWeek(now), played = dash.totalRuns > 0;
  const newBadges = runs.length ? earnedBadges(runs, s.lessons, MILESTONES.map(m => m.checkpoints)).filter(id => !s.badges?.includes(id)) : [];
  // F2: only with playing from before this week, or "last week" means today.
  const recap = played && s.lastRecapWeek !== wk && runs.some(r => isoWeek(new Date(r.startedAt)) !== wk)
    ? weekRecap(dash, newBadges.length ? BADGES.find(b => b.id === newBadges[newBadges.length - 1])?.name : undefined) : null;
  // The 2-minute challenge: the highest stage first, then the one played longest ago.
  const lastPlayed = (l: Lesson) => dash.charts.filter(c => c.chartId.startsWith(`lesson/${l.id}/`)).flatMap(c => c.points.map(p => p.date)).sort().at(-1) ?? '';
  const arcadeLesson = visible.filter(l => done(l.id) && l.kind === 'groove' && toolOf(l.steps[l.steps.length - 1]) === 'drill')
    .sort((a, b) => b.level - a.level || lastPlayed(a).localeCompare(lastPlayed(b)))[0];
  const coachKey = coachLessonKey(now, milestone?.level);
  const coachAsk = s.liveCoach && s.profile.onboarded && dash.totalRuns > 0 && milestone && aiLoaded && !coachOpen.length
    && studentRead(s.lessons, runs).pace !== 'flying' ? coachKey : null;

  return {
    today, session,
    coachLine: greeting({
      hour: hoursOf(now), streak: dash.streak, runs: dash.totalRuns, landedWeek: dash.landedWeek, landedLastWeek: dash.landedLastWeek,
      next: hero && { tool: toolOf(hero.steps[0]) }, setDone: afterSet, minutesToday: dash.minutesToday, pathDone: !milestone && path.length > 0 && !hero,
    }),
    setupDue: !s.setupDone,
    healthLine: sore ? `Easy days until ${s.soreUntil}: shorter sets, lighter playing. If something hurts, stop; if it lasts, see a doctor.`
      : dayAdvice(Math.round(dash.minutesToday), daysPlayed) ?? (played && s.hearingTipWeek !== wk ? HEARING_TIP : null),
    hero: heroView, main, somethingElse: others.length > 0 && !!hero, jamLessonId: jam && jam !== hero ? jam.id : null,
    you: {
      rank: passed.length ? passed[passed.length - 1].rank : 'New drummer', proven: rankNow?.state === 'proven',
      nextRank: milestone?.rank ?? null,
      rankNote: rankNow?.state === 'earned' ? `Prove it on another day (${rankNow.proven} of ${rankNow.total}).`
        : checksOpen ? `Pass the ${checksOpen} ★ checkpoint${checksOpen === 1 ? '' : 's'} on the trail.` : null,
      ring: milestone ? { value: `${trailDone}/${trail.length}`, caption: `stage ${stageNo}`, fraction: trail.length ? trailDone / trail.length : 0 } : null,
      streak: dash.streak, landedPct: dash.landedWeek, minutesToday: Math.round(dash.minutesToday), minutesGoal: s.profile.minutesPerDay,
    },
    set: {
      items: setItems.map(({ it, i, l }) => {
        const isDone = session.done.includes(i), p = s.lessons[l.id];
        const st = stepOf(l, s);
        const detail = it.role === 'review' || it.role === 'warmup' || it.role === 'record' ? ROLE[it.role].toLowerCase() : st.bite ? `bars ${st.bite.fromBar}–${st.bite.toBar}` : undefined;
        return {
          index: i, lessonId: l.id, title: l.title.replace(/^Song: /, '').replace(/ in bites$/, ''), detail,
          value: isDone ? (p?.completedAt ? '' : 'done') : `${it.minutes} min`, stars: isDone && p?.completedAt ? p.stars ?? 1 : undefined,
          state: isDone ? 'done' as const : i === firstUndone ? 'current' as const : 'todo' as const,
        };
      }),
      minutesDone, minutesTotal: setItems.reduce((a, x) => a + x.it.minutes, 0), done: setDone,
    },
    song,
    trail: milestone ? {
      title: `Stage ${stageNo} · ${milestone.title}`,
      summary: `${trailDone} of ${trail.length} lessons · ${checks.length - checksOpen} of ${checks.length} ★ checkpoints`,
      stops: trailStops(trail, hero, builtinSong, s, isCheckpoint),
    } : null,
    coachKey, coachAsk,
    setupNudge: !s.setupDone && !s.setupNudged,
    askSore: played && daysPlayed >= 3 && s.soreAskedWeek !== wk && !sore,
    weekPlanDue: played && s.liveCoach && s.profile.onboarded,
    hearingTipDue: played && s.hearingTipWeek !== wk,
    recap, newBadges,
    arcade: afterSet && arcadeLesson ? {
      lessonId: arcadeLesson.id, title: arcadeLesson.title,
      sub: `${arcadeLesson.title} · ${s.arcade?.[arcadeLesson.id] ? `beat ${s.arcade[arcadeLesson.id] + 2} clean bars` : 'how many clean bars?'}`,
    } : null,
  };
}
