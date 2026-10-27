import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Thinking, useCoachEntry } from '../coach/api';
import { PlanCard } from '../coach/CoachView';
import { LESSON_BY_ID, MILESTONES } from '../content/curriculum';
import { greeting } from '../engine/greeting';
import { isProven, playChart, recordTarget, toolOf, type Genre, type Lesson } from '../engine/lesson';
import { bandFor } from '../engine/band';
import { player, playerVersion, start, stop, subscribePlayer } from '../play/player';
import { Move } from '../play/AtKit';
import { onCoachAction } from '../coach/session';
import { iconOf, TOOL_LABEL } from './tools';
import { checkpointsOf, currentMilestone, rankState, studentRead, visibleLessons, type SessionRole } from '../engine/planner';
import { stageSong } from '../engine/stageSong';
import { cleanSongTitle } from '../engine/youtube';
import { BADGES, barsReady, dashboard, earnedBadges, isoWeek, SHOWOFF_MIN_BARS, songReady, weekRecap, weekTheme, type Dashboard, type RunRow } from '../engine/progress';
import { flourish } from './Celebration';
import { say } from '../voice/voice';
import { songBarCount, songVerified, useYtSongs } from '../youtube/api';
import { requestSong } from '../ui/nav';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { ensureWeekPlan, refreshWeekPlan, thisWeeksPlan, useWeekPlan } from '../coach/weekPlan';
import { aiLessonsLoaded, lessonById, requestCoachLesson, setStitched, stitchLesson, useLessons } from './aiLessons';
import { LessonPlayer } from './LessonPlayer';
import { TechniqueView } from '../ui/TechniqueView';
import { PlacementView, SkillMapView } from '../ui/SkillMapView';
import { PadWizard } from '../ui/Calibrate';
import { LatencyCard } from '../ui/LatencyCard';
import { ShowoffCard } from './ShowoffCard';
import { currentSession, markDone, rebuildToday, resetAllLessons, startSession, today } from './state';
import { dayAdvice, soreActive } from '../engine/health';
import { addDays } from '../engine/lesson';

const ROLE: Record<SessionRole, string> = { stretch: 'Stretch', warmup: 'Warm-up', review: 'Review', skill: 'New skill', groove: 'Groove', record: 'Beat your best' };
type Open = { lessonId: string; item?: number; role?: SessionRole; flow?: boolean; arcade?: boolean };

export function TodayView({ openLessonId, device }: { openLessonId?: string; device?: string }) {
  const s = useSyncExternalStore(subscribeSettings, getSettings);
  const lessons = useLessons();
  const [open, setOpen] = useState<Open | undefined>(openLessonId ? { lessonId: openLessonId } : undefined);
  const [editing, setEditing] = useState(false);
  const [kitStep, setKitStep] = useState(false); // onboarding step 2 (or Journey's "check my kit")
  const [technique, setTechnique] = useState(false); // the stick technique page
  const [skills, setSkills] = useState(false), [placing, setPlacing] = useState(false); // N5: the skill map, the placement test
  // Finished the old path (stages 1–7)? Say once that new stages are open (R3).
  const [newStages] = useState(() => !getSettings().newStagesSeen && ['song-swing', 'song-shuffle'].some(id => getSettings().lessons[id]?.completedAt) && !Object.keys(getSettings().lessons).some(id => LESSON_BY_ID[id]?.level >= 7));
  useEffect(() => { if (newStages) setSettings({ newStagesSeen: true }); }, [newStages]);
  const [dash, setDash] = useState<Dashboard>();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [songs] = useYtSongs();
  useWeekPlan(); // the coach's weekly plan steers today's set (state.ts) and names the week's focus
  useEffect(() => { void refreshWeekPlan(); }, []);
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const [recap, setRecap] = useState<string>();
  const [asks, setAsks] = useState(0); // each "new lesson" click is a new request
  const [swap, setSwap] = useState(0); // "Something else" steps through other lessons of this stage
  useSyncExternalStore(subscribePlayer, playerVersion); // "Hear it" shows Stop while it plays
  // Journey's moves from the kit, as on the lesson screen: hi-hat pedal × 3 starts, ride × 2 is something else, tom 2 × 2 hears it.
  const homeMoves = useRef<Partial<Record<'main' | 'next' | 'listen', () => void>>>({});
  const atHome = s.profile.onboarded && !editing && !kitStep && !technique && !placing && !skills && !open;
  useEffect(() => (atHome ? onCoachAction(a => { const run = homeMoves.current[a.kind as 'main']; run?.(); return !!run; }) : undefined), [atHome]);
  useEffect(() => { fetch('/api/runs').then(r => r.json()).then((runs: RunRow[]) => { setRuns(runs); setDash(dashboard(runs)); }).catch(() => {}); }, [open]);
  useEffect(() => { if (dash?.totalRuns && getSettings().hearingTipWeek !== isoWeek(new Date())) { const w = isoWeek(new Date()); const t = setTimeout(() => setSettings({ hearingTipWeek: w }), 60_000); return () => clearTimeout(t); } }, [dash]); // the ear tip shows for a minute, once a week

  const milestone = currentMilestone(MILESTONES, lessons, s.lessons, s.profile);
  const coachKey = `lesson-${new Date().toDateString()}-${milestone?.level}-${asks}`;
  const coach = useCoachEntry<Lesson>(coachKey);
  const themeKey = `theme-${new Date().toDateString()}`, themeEntry = useCoachEntry<Lesson>(themeKey);
  const challengeKey = `challenge-${new Date().toDateString()}-${asks}`, challenge = useCoachEntry<Lesson>(milestone ? null : challengeKey); // after the whole path
  const coachOpen = lessons.filter(l => l.source === 'ai' && l.level === milestone?.level && !s.lessons[l.id]?.completedAt);
  // With "coach automatically" on, ask once a day for a lesson when there's none waiting for this milestone,
  // once you've played something (with no takes yet, the built-in first lessons are the right start).
  const played = !!dash?.totalRuns;
  useEffect(() => { if (played && s.liveCoach && s.profile.onboarded) void ensureWeekPlan(); }, [played, s.liveCoach, s.profile.onboarded]);
  useEffect(() => {
    if (s.liveCoach && s.profile.onboarded && played && milestone && aiLessonsLoaded() && !coachOpen.length && studentRead(s.lessons, runs).pace !== 'flying') requestCoachLesson(coachKey);
  }, [s.liveCoach, s.profile.onboarded, played, milestone, coachOpen.length, coachKey, lessons, runs]);

  // The Monday recap: on the first visit of a week (with some playing behind you), once, spoken if the voice is on.
  useEffect(() => {
    const wk = isoWeek(new Date());
    // F2: only with playing from before this week, or "last week" means today
    if (!dash?.totalRuns || getSettings().lastRecapWeek === wk || !runs.some(r => isoWeek(new Date(r.startedAt)) !== wk)) return;
    const text = weekRecap(dash, newBadges.length ? BADGES.find(b => b.id === newBadges[newBadges.length - 1])?.name : undefined); // only a badge earned just now
    setSettings({ lastRecapWeek: wk }); setRecap(text);
    if (getSettings().voice) void say(text);
  }, [dash]);

  // A badge earned since last time is announced once on Journey (with a fill), then kept in settings.
  useEffect(() => {
    if (!runs.length) return;
    const ready = songs.filter(x => songVerified(x) && songReady(runs, x.id, songBarCount(x))).map(x => x.id); // N4: checked by ear
    const earned = earnedBadges(runs, s.lessons, MILESTONES.map(m => m.checkpoints), undefined, ready), fresh = earned.filter(id => !s.badges?.includes(id));
    if (!fresh.length) return;
    setSettings({ badges: [...(s.badges ?? []), ...fresh] });
    setNewBadges(fresh); flourish(false);
  }, [runs, s.lessons, s.badges, songs]);

  // The stage's song becomes a lesson once every bar is ready (so the trail and the lesson player know it).
  const pSong = songs.find(x => x.id === (s.profile.song?.stage === milestone?.level ? s.profile.song?.id : undefined));
  const pBars = pSong ? songBarCount(pSong) : 0;
  const pReady = !!pSong && songReady(runs, pSong.id, pBars);
  useEffect(() => { setStitched(pReady && pSong ? stitchLesson(pSong, s.profile.song!.stage) : undefined); }, [pReady, pSong, s.profile.song]);

  if (!s.profile.onboarded || editing) return <Onboarding onDone={(first, place) => { setEditing(false); if (first) setKitStep(true); if (place) setPlacing(true); }} />;
  if (kitStep) return <KitSetup device={device} onDone={() => setKitStep(false)} />;
  if (technique) return <TechniqueView onBack={() => setTechnique(false)} />;
  if (placing) return <PlacementView onDone={() => { setPlacing(false); rebuildToday(); }} />;
  if (skills) return <SkillMapView onBack={() => setSkills(false)} onOpen={id => { setSkills(false); setOpen({ lessonId: id }); }} />;

  const session = currentSession();
  // A coach lesson can be deleted after today's session froze; skip it (kept in storage: AI lessons may still be loading).
  const playable = (i: number) => !!lessonById(session.items[i].lessonId);
  const firstUndone = session.items.findIndex((_, i) => playable(i) && !session.done.includes(i));
  const done = (id: string) => !!s.lessons[id]?.completedAt;
  const passed = MILESTONES.filter(m => { const c = checkpointsOf(m, lessons, s.profile); return c.length > 0 && c.every(l => done(l.id)); });
  const rank = passed.length ? passed[passed.length - 1].rank : 'New drummer';
  const rankNow = passed.length ? rankState(passed[passed.length - 1], lessons, s.lessons, s.profile) : undefined; // ✓ once proven on another day
  // One "next": today's first open item. The coach's lessons reach you through the session (the planner puts them first).
  const openItem = (i: number) => { startSession(); setOpen({ lessonId: session.items[i].lessonId, item: i }); };

  if (open) {
    const item = open.item !== undefined ? session.items[open.item] : undefined;
    const nextIdx = session.items.findIndex((_, i) => i !== open.item && playable(i) && !session.done.includes(i));
    return <LessonPlayer key={`${open.lessonId}/${open.item}`} lessonId={open.lessonId} role={item?.role ?? open.role} minutes={item?.minutes} flow={open.flow} arcade={open.arcade}
      onBack={() => setOpen(undefined)} onOpen={id => setOpen({ lessonId: id })}
      onItemDone={open.item === undefined ? undefined : () => markDone(open.item!)}
      onNext={open.item === undefined ? undefined : () => { markDone(open.item!); setOpen(nextIdx >= 0 ? { lessonId: session.items[nextIdx].lessonId, item: nextIdx } : undefined); }} />;
  }

  const visible = visibleLessons(lessons, s.profile);
  const path = MILESTONES.filter(m => checkpointsOf(m, lessons, s.profile).length); // stages for these goals (e.g. no Swing for rock only)
  const total = session.items.reduce((a, it, i) => a + (playable(i) ? it.minutes : 0), 0);
  // The trail: this stage's lessons in path order (the coach's after the built-ins), checkpoints as the challenges.
  const builtinSong = milestone && stageSong(milestone.level, visible); // the stage's song: the end of the trail (R8)
  const trail = milestone ? visible.filter(l => l.level === milestone.level && l !== builtinSong && (l.source !== 'ai' || l.id in s.lessons || l === coachOpen[coachOpen.length - 1]))
    .sort((a, b) => Number(milestone.checkpoints.includes(a.id)) - Number(milestone.checkpoints.includes(b.id)) || Number(a.source === 'ai') - Number(b.source === 'ai')) : [];
  const fromSet = firstUndone >= 0 ? lessonById(session.items[firstUndone].lessonId) : undefined;
  // "Something else": another open lesson of this stage, a different kind of activity first.
  const others = trail.filter(l => !done(l.id) && l !== fromSet).sort((a, b) => Number(toolOf(a.steps[0]) === toolOf(fromSet?.steps[0] ?? a.steps[0])) - Number(toolOf(b.steps[0]) === toolOf(fromSet?.steps[0] ?? b.steps[0])));
  // After the whole path: the coach's review / stretch lessons at the last stage are what's next.
  const pathDone = !milestone && path.length > 0, lastStage = path[path.length - 1];
  const challenges = pathDone ? lessons.filter(l => l.source === 'ai' && l.level === lastStage.level && !done(l.id)) : [];
  // Today's set done: the next lesson on the path leads (Jam is the second button), so a student on a roll keeps going.
  const setDone = firstUndone < 0;
  const hero = swap && others.length ? others[(swap - 1) % others.length] : fromSet ?? others[0] ?? challenges[0];
  const heroItem = hero && hero === fromSet ? firstUndone : -1;
  const jam = [...visible].reverse().find(l => l.level <= (milestone?.level ?? 99) && l.steps.some(st => st.jam));
  // Flow on the newest finished groove (the highest stage, the latest finished), not the first jam forever.
  const flowLesson = visible.filter(l => done(l.id) && l.kind === 'groove').sort((a, b) => b.level - a.level || s.lessons[b.id].completedAt!.localeCompare(s.lessons[a.id].completedAt!))[0] ?? jam;
  const askChallenge = () => requestCoachLesson(challengeKey);
  const go = () => (heroItem >= 0 ? openItem(heroItem) : hero ? setOpen({ lessonId: hero.id }) : pathDone ? askChallenge() : jam && setOpen({ lessonId: jam.id }));
  const minutes = heroItem >= 0 ? session.items[heroItem].minutes : Math.round(s.profile.minutesPerDay / 3);
  const trailDone = trail.filter(l => done(l.id)).length;
  const theme = weekTheme(runs), weekPlan = thisWeeksPlan(); // the coach's plan leads; the most-given tip is the fallback
  const project = s.profile.song?.stage === milestone?.level ? s.profile.song : undefined;
  const projectSong = songs.find(x => x.id === project?.id);
  const songBars = projectSong ? songBarCount(projectSong) : 0;
  // Beat your best: a finished lesson you haven't played for longest (improvising tools have no record to beat).
  const lastPlayed = (l: Lesson) => dash?.charts.filter(c => c.chartId.startsWith(`lesson/${l.id}/`)).flatMap(c => c.points.map(p => p.date)).sort().at(-1) ?? '';
  // The 2-minute challenge and Beat your best: the highest stage first, then the one played longest ago.
  const arcade = visible.filter(l => done(l.id) && l.kind === 'groove' && toolOf(l.steps[l.steps.length - 1]) === 'drill').sort((a, b) => b.level - a.level || lastPlayed(a).localeCompare(lastPlayed(b)))[0];
  // A streak record already as long as the whole take has nothing left to beat.
  const maxedOut = (l: Lesson) => { const t = recordTarget(l.steps[l.steps.length - 1], s.lessons[l.id]); return t !== undefined && t <= (s.lessons[l.id].bestStreak ?? 0); };
  const record = visible.filter(l => done(l.id) && l.level <= (milestone?.level ?? 99) && !['jam', 'trade', 'free', 'copy'].includes(toolOf(l.steps[l.steps.length - 1])) && !maxedOut(l))
    .sort((a, b) => b.level - a.level || lastPlayed(a).localeCompare(lastPlayed(b)))[0];
  const recordGoal = record && (recordTarget(record.steps[record.steps.length - 1], s.lessons[record.id]) ? `${recordTarget(record.steps[record.steps.length - 1], s.lessons[record.id])} in a row`
    : s.lessons[record.id]?.bestBpm ? `${s.lessons[record.id].bestBpm + 5} BPM` : 'one take');
  const showoff = songs.filter(x => songVerified(x) && songReady(runs, x.id, songBarCount(x)));
  // Health (N10): lighter days after "a bit sore", practice-length advice, the weekly ear and wrist check-ins.
  const daysPlayed = new Set(runs.map(r => r.startedAt.slice(0, 10))).size, wk = isoWeek(new Date());
  const healthLine = soreActive(s.soreUntil, today()) ? `Easy days until ${s.soreUntil}: shorter sets, lighter playing. If something hurts, stop; if it lasts, see a doctor.`
    : dayAdvice(Math.round(dash?.minutesToday ?? 0), daysPlayed)
    ?? (played && s.hearingTipWeek !== wk ? 'Protect your ears: keep the headphones at a level you could talk over, and stop if your ears ring.' : undefined);
  const askSore = played && daysPlayed >= 3 && s.soreAskedWeek !== wk && !soreActive(s.soreUntil, today());
  // D9: one notice at a time, as a slim strip above the lesson (the weekly recap shows once, so it goes first).
  const notice = recap ? 'recap' : !s.setupDone && !s.setupNudged ? 'setup' : askSore ? 'sore' : healthLine ? 'health' : undefined;
  // The stage's song: your real song if you picked one and its part is in, else the built-in one, with how much is ready.
  const builtinBars = builtinSong ? builtinSong.steps[builtinSong.steps.length - 1].chart.bars : 0;
  // D6: a real song without its part yet can't be played: until it has its 16 bars, the built-in song stays the goal.
  const projectIsStop = !!project && (songBars >= SHOWOFF_MIN_BARS || !builtinSong);
  const songStop = project && projectIsStop ? { title: cleanSongTitle(project.title), bars: songBars, readyBars: songBars ? barsReady(runs, project.id, songBars) : 0, onOpen: () => requestSong(project.id) }
    : builtinSong ? { title: builtinSong.title.replace(/^Song: /, ''), bars: builtinBars, readyBars: done(builtinSong.id) ? builtinBars : barsReady(runs, builtinSong.id, builtinBars), onOpen: () => setOpen({ lessonId: builtinSong.id }), lesson: builtinSong } : undefined;
  const songReadyFrac = songStop?.bars ? songStop.readyBars / songStop.bars : 0;

  // Hear it: the lesson's current step at your tempo, once, with the band where it has one.
  const hearing = player.phase === 'playing' && !!player.options?.demo;
  const hear = (l: Lesson) => {
    if (hearing) { stop(); return; }
    const st = l.steps[Math.min(s.lessons[l.id]?.step ?? 0, l.steps.length - 1)], { chart } = playChart(st);
    const bpm = s.lessons[l.id]?.bpm ?? st.bpm.start;
    start(chart, { fromBar: 1, toBar: chart.bars, repeats: 1, speed: bpm / chart.bpm, metronome: true, subdivision: 1, countInBars: 1, wait: false, demo: true,
      activeLanes: st.activeLanes, band: s.band !== false ? bandFor(l, st) : undefined });
  };
  const askNew = () => { requestCoachLesson(coachKey.replace(/-\d+$/, `-${asks + 1}`)); setAsks(asks + 1); };
  // Today's set done: the next lesson on the trail leads, and the 2-minute challenge and Beat your best join the moves.
  const afterSet = !!hero && heroItem < 0 && setDone && !swap;
  homeMoves.current = { main: go, next: others.length ? () => setSwap(swap + 1) : undefined, listen: hero ? () => hear(hero) : undefined };
  const heroStep = hero && hero.steps[Math.min(s.lessons[hero.id]?.step ?? 0, hero.steps.length - 1)];
  const heroBpm = hero && heroStep && !heroStep.rest && !heroStep.look ? s.lessons[hero.id]?.bpm ?? heroStep.bpm.start : undefined;
  const heroTarget = hero?.steps[hero.steps.length - 1].bpm.target;
  const heroRole = heroItem >= 0 ? session.items[heroItem].role : undefined;
  const proveIt = (l: Lesson, role?: SessionRole) => role === 'review' && MILESTONES.some(m => m.checkpoints.includes(l.id)) && !isProven(s.lessons[l.id]);
  const setItems = session.items.flatMap((it, i) => (playable(i) ? [{ it, i, l: lessonById(it.lessonId)! }] : []));
  const minutesDone = setItems.filter(x => session.done.includes(x.i)).reduce((a, x) => a + x.it.minutes, 0);
  const checks = milestone ? checkpointsOf(milestone, lessons, s.profile) : [];
  const checksOpen = checks.filter(l => !done(l.id)).length;
  const stars = (n = 1) => '★'.repeat(n) + '☆'.repeat(3 - n);
  const moves = !hero ? [<Move key="go" go label={pathDone ? '🎯 Coach challenge ▶' : 'Jam ▶'} onClick={go} />]
    : afterSet ? [
      <Move key="go" go label="▶ Next lesson" onClick={go} />,
      arcade && <Move key="arcade" dark label="⏱ 2-minute challenge" sub={`${arcade.title} · ${s.arcade?.[arcade.id] ? `beat ${s.arcade[arcade.id] + 2} clean bars` : 'how many clean bars?'}`} onClick={() => setOpen({ lessonId: arcade.id, arcade: true })} />,
      record && <Move key="record" dark label="🏆 Beat your best" sub={`${record.title} · ${recordGoal}`} onClick={() => setOpen({ lessonId: record.id, role: 'record' })} />,
      others.length > 0 && <Move key="swap" alt label="↻ Something else" gesture="ride × 2" onClick={() => setSwap(swap + 1)} />,
    ] : [
      <Move key="go" go label="▶ Start" onClick={go} />,
      others.length > 0 && <Move key="swap" alt label="↻ Something else" gesture="ride × 2" onClick={() => setSwap(swap + 1)} />,
      <Move key="hear" alt label={hearing ? '■ Stop' : '👂 Hear it'} gesture="tom 2 × 2" onClick={() => hear(hero)} />,
      jam && hero !== jam && <Move key="jam" alt label="🎸 Just jam" sub="no score" onClick={() => setOpen({ lessonId: jam.id })} />,
    ];
  const moveCount = moves.filter(Boolean).length;
  const line = greeting({ hour: new Date().getHours(), streak: dash?.streak ?? 0, runs: dash?.totalRuns ?? 0, landedWeek: dash?.landedWeek ?? null, landedLastWeek: dash?.landedLastWeek ?? null,
    next: hero && { tool: toolOf(hero.steps[0]) }, setDone: afterSet, minutesToday: dash?.minutesToday, pathDone: pathDone && !hero });
  return (
    <div className="today home2">
      {notice === 'recap' && <div className="notice"><span className="ic" aria-hidden>📅</span><p>{recap}</p></div>}
      {notice === 'health' && <div className="notice"><span className="ic" aria-hidden>🌱</span><p>{healthLine}</p></div>}
      {notice === 'sore' && <div className="notice"><span className="ic" aria-hidden>🩹</span><p>Quick check: anything sore after drumming (wrists, forearms, back)?</p>
        <button onClick={() => setSettings({ soreAskedWeek: isoWeek(new Date()) })}>All good</button>
        <button onClick={() => setSettings({ soreAskedWeek: isoWeek(new Date()), soreUntil: addDays(today(), 3) })}>A bit sore</button></div>}
      {notice === 'setup' && <div className="notice"><span className="ic" aria-hidden>🛠</span><p>Two minutes to check your pads and latency makes every timing score fair.</p>
        <button className="primary" onClick={() => { setSettings({ setupNudged: true }); setKitStep(true); }}>Check my kit ▶</button>
        <button onClick={() => setSettings({ setupNudged: true })}>Not now</button></div>}
      {newStages && <div className="notice"><span className="ic" aria-hidden>🎉</span><p>New stages open: <b>Groove at tempo</b>, <b>Linear and odd</b> and <b>Solo voice</b>.</p></div>}
      {newBadges.length > 0 && <div className="notice"><span className="ic" aria-hidden>🏅</span><p>New badge: <b>{newBadges.map(id => BADGES.find(b => b.id === id)?.name).join(', ')}</b>!</p></div>}

      <div className="hero2">
        <div className="nextCard">
          <div className="coachSays"><div className="avatar" aria-hidden>🥁</div><p aria-live="polite">{line}</p></div>
          {hero && <div className={`lessonBig ${afterSet ? 'after' : ''}`}>
            <span className="ic" aria-hidden>{iconOf(hero)}</span>
            <div className="kicker"><span>{heroItem >= 0 ? `Up next${heroRole && heroRole !== 'skill' ? ` · ${ROLE[heroRole]}` : ''} · ${setItems.findIndex(x => x.i === heroItem) + 1} of ${setItems.length} today` : afterSet ? 'Next on your trail' : swap ? 'Something else' : 'Up next'}</span>
              {hero.source === 'ai' && '✍ your coach wrote this one for you'}</div>
            <h2>{proveIt(hero, heroRole) ? 'Prove it: ' : ''}{hero.title}</h2>
            <div><p>{hero.what}</p>
              {hero.source === 'ai' && hero.focus && <details className="why"><summary>why this one?</summary><p>{hero.focus}</p></details>}
              <div className="meta"><span className="pill">{TOOL_LABEL[toolOf(hero.steps[0])]}</span><span className="pill">{minutes} min</span>
                <span className="pill">{hero.steps.length} step{hero.steps.length === 1 ? '' : 's'}</span>
                {heroBpm !== undefined && <span className="pill">{heroBpm}{heroTarget && heroTarget !== heroBpm ? ` → ${heroTarget}` : ''} BPM</span>}</div></div>
          </div>}
          <div className="moves" style={{ '--n': Math.max(1, moveCount - 1) } as React.CSSProperties}>{moves}</div>
          {(coach?.status === 'thinking' || challenge?.status === 'thinking') && <Thinking what="Your coach is writing your next lesson" />}
          {challenge?.status === 'error' && <p className="warn">{challenge.error}</p>}
        </div>

        <div className="card you2">
          <div className="you2Top">
            {milestone && <div className="ring sm" style={{ '--p': `${trail.length ? (trailDone / trail.length) * 100 : 0}%` } as React.CSSProperties}>
              <div>Stage {path.indexOf(milestone) + 1}<br />{trailDone}/{trail.length}</div></div>}
            <div><div className="rankSticker small">{rank}{rankNow?.state === 'proven' && ' ✓'}</div>
              <p className="small">{rankNow?.state === 'earned' ? `Prove it on another day (${rankNow.proven} of ${rankNow.total}).`
                : milestone ? <>Next rank: <b>{milestone.rank}</b>.{checksOpen ? ` Pass the ${checksOpen} ★ challenge${checksOpen === 1 ? '' : 's'} on the trail.` : ''}</> : null}</p></div>
          </div>
          <div className="statTiles">
            <div><b>{dash?.streak ?? 0}</b><span>🔥 day streak</span></div>
            <div><b>{dash?.landedWeek != null ? `${dash.landedWeek}%` : '–'}</b><span>🎯 landed this week{dash?.landedWeek != null && dash.landedLastWeek != null && dash.landedWeek > dash.landedLastWeek ? `, up from ${dash.landedLastWeek}%` : ''}</span></div>
            <div><b>{Math.round(dash?.minutesToday ?? 0)}<small>/{s.profile.minutesPerDay}</small></b><span>⏱ min today</span>
              <div className="minBar"><i style={{ width: `${Math.min(100, ((dash?.minutesToday ?? 0) / s.profile.minutesPerDay) * 100)}%` }} /></div></div>
          </div>
          {weekPlan?.focus ? <div className="weekFocus">🎯 This week: <b>{weekPlan.focus}</b>{weekPlan.why && <details><summary>why?</summary><p>{weekPlan.why}</p></details>}</div>
            : theme && <div className="weekFocus">🎯 This week: <b>{theme.words}</b> · {themeEntry?.status === 'thinking' ? 'your coach is on it…' : themeEntry?.status === 'done' ? 'lesson ready on your trail'
              : <button className="link" onClick={() => requestCoachLesson(themeKey, { lessonId: 'week', step: 1, reason: `This week's habit to work on: ${theme.words} (the live tip came ${theme.count} times).`, run: {} })}>lesson for this</button>}</div>}
          <button className="link" onClick={() => setSkills(true)}>🗺 Skill map →</button>
        </div>
      </div>

      {setItems.length > 0 && <div className="card todayStrip">
        <div className="head"><h3>Today's set · {setDone ? 'done ✓' : `${total} min`}</h3>
          <div className="segBar" aria-hidden>{setItems.map(x => <i key={x.i} className={session.done.includes(x.i) ? 'done' : x.i === firstUndone ? 'cur' : ''} style={{ '--m': x.it.minutes } as React.CSSProperties} />)}</div>
          <span className="small">{minutesDone} of {total} min</span></div>
        <div className="strip">
          {setItems.map(({ it, i, l }, k) => {
            const isDone = session.done.includes(i), p = s.lessons[l.id];
            return <Fragment key={i}>{k > 0 && <span className="arrowSep" aria-hidden>→</span>}
              <button className={`stripItem ${isDone ? 'done' : i === firstUndone ? 'cur' : ''}`} onClick={() => openItem(i)}>
                <span className="ic" aria-hidden>{isDone ? '✓' : iconOf(l)}</span>
                <span><b>{proveIt(l, it.role) ? 'Prove it: ' : ''}{l.title}</b>
                  <span className="small">{isDone ? (p?.completedAt ? `${stars(p.stars)}${p.bestBpm ? ` · ${p.bestBpm} BPM` : ''}` : 'done') : `${it.role && it.role !== 'skill' ? ROLE[it.role] : TOOL_LABEL[toolOf(l.steps[0])]} · ${it.minutes} min${i === firstUndone ? ' · up next' : ''}`}</span></span>
              </button></Fragment>;
          })}
          {pReady && pSong && <button className="stripItem bonus" onClick={() => setOpen({ lessonId: `song-${pSong.id}` })}>
            <span className="ic" aria-hidden>🎵</span><span><b>Play {pSong.title} all the way through ▶</b><span className="small">every bar is ready</span></span></button>}
        </div>
      </div>}

      {pathDone && <div className="card">
        <h3>All stages done</h3>
        <div className="setTiles">
          <button className="setTile cur" onClick={() => (challenges[0] ? setOpen({ lessonId: challenges[0].id }) : askChallenge())} disabled={challenge?.status === 'thinking'}>
            <span className="ic" aria-hidden>🎯</span><b>Coach challenge</b>
            <span className="small">{challenges[0] ? challenges[0].title : challenge?.status === 'thinking' ? 'your coach is writing it…' : challenge?.status === 'error' ? challenge.error : 'a review or stretch lesson aimed at your weakest spot'}</span>
          </button>
          {flowLesson && <button className="setTile" onClick={() => setOpen({ lessonId: flowLesson.id, flow: true })}><span className="ic" aria-hidden>🌊</span><b>Flow</b><span className="small">{flowLesson.title}</span></button>}
          {arcade && <button className="setTile record" onClick={() => setOpen({ lessonId: arcade.id, arcade: true })}><span className="ic" aria-hidden>⏱</span><b>2-minute challenge</b>
            <span className="small">{arcade.title}{s.arcade?.[arcade.id] ? ` · best ${s.arcade[arcade.id]} clean bars` : ''}</span></button>}
          {record && <button className="setTile record" onClick={() => setOpen({ lessonId: record.id, role: 'record' })}><span className="ic" aria-hidden>🏆</span><b>Beat your best</b><span className="small">{record.title}</span></button>}
          <button className="setTile" onClick={() => requestSong('')}><span className="ic" aria-hidden>🎵</span><b>Learn a new song</b><span className="small">from YouTube, a few bars at a time</span></button>
          {showoff.map(x => <button key={x.id} className="setTile" onClick={() => requestSong(x.id)}><span className="ic" aria-hidden>🎤</span><b>Show-off: {x.title}</b><span className="small">Stage mode is under Play</span></button>)}
        </div>
      </div>}

      {milestone && <div className="stageRow">
        <div className="card">
          <div className="stageHead"><h3>Stage {path.indexOf(milestone) + 1} · {milestone.title}</h3>
            <span className="small">{trailDone} of {trail.length} lessons · {checks.length - checksOpen} of {checks.length} ★ challenges</span></div>
          <p className="canDo2"><b>When you finish:</b> {milestone.canDo.join(' · ')}</p>
          <Trail song={songStop && { title: songStop.title, ready: songReadyFrac, onOpen: songStop.onOpen }} lessons={trail} current={hero} done={done}
            started={id => !!s.lessons[id] && !done(id)} isChallenge={l => milestone.checkpoints.includes(l.checkpoint ?? l.id)} onOpen={id => setOpen({ lessonId: id })} />
        </div>
        <div className="card songCard">
          <h3>Stage song</h3>
          {songStop && <>
            <div className="songTop"><div className="ring" style={{ '--p': `${Math.round(songReadyFrac * 100)}%` } as React.CSSProperties}><div>{songStop.readyBars} / {songStop.bars}<br />bars</div></div>
              <div><b>{songStop.title}</b><p className="small">{songStop.bars} bars{'lesson' in songStop ? ' with the band' : ''}. Fill the ring, then play it for a friend.</p></div></div>
            <div className="actions">{'lesson' in songStop && songStop.lesson && <button onClick={() => hear(songStop.lesson!)}>{hearing ? '■ Stop' : '👂 Hear it'}</button>}
              <button onClick={songStop.onOpen}>▶ Play it</button></div>
            {projectIsStop && projectSong && !songVerified(projectSong) && <p className="small">Check the part by ear in Songs before you show it off.</p>}
          </>}
          {!projectIsStop && <div className="yourSong">
            {project ? <><span className="small">Your song</span><b>{cleanSongTitle(project.title)}</b>
              <p className="small">{songBars ? `${songBars} of ${SHOWOFF_MIN_BARS} bars of its part are in.` : "Its drum part isn't in yet."} In Songs: tap the tempo, and the coach suggests the part (about 5 minutes).</p>
              <button onClick={() => requestSong(project.id)}>Set it up in Songs ▶</button></>
              : <ShowoffCard inline stage={milestone} profile={s.profile} />}
          </div>}
        </div>
      </div>}

      <div className="moreRow"><span className="lbl">More ways to play</span>
        {flowLesson && <button className="tileS" onClick={() => setOpen({ lessonId: flowLesson.id, flow: true })}><span className="ic" aria-hidden>🌊</span><span><b>Flow</b> · {flowLesson !== jam ? flowLesson.title : 'play along, no score'}</span></button>}
        <button className="tileS" onClick={() => setTechnique(true)}><span className="ic" aria-hidden>🥢</span><span><b>Stick technique</b> · how it moves</span></button>
        <button className="tileS" onClick={() => requestSong('')}><span className="ic" aria-hidden>🎵</span><span><b>Learn a new song</b></span></button>
        {milestone && <button className="tileS" onClick={askNew} disabled={coach?.status === 'thinking'}><span className="ic" aria-hidden>✍</span><span><b>Ask the coach</b> for a different lesson</span></button>}
      </div>

      <details className="planFold">
        <summary>Full path, coach lessons, weekly plan, settings</summary>
        {milestone && (
          <div className="card">
            <h3>Your coach</h3>
            {coach?.status === 'thinking' ? <Thinking what="Your coach is writing a lesson from your recent playing" />
              : <>
                {coach?.status === 'error' && <p className="warn">{coach.error}</p>}
                {coachOpen.length > 0
                  ? <p>Lessons written for you: {coachOpen.map(l => <button key={l.id} className="lessonChip next" onClick={() => setOpen({ lessonId: l.id })}>{l.title}</button>)}</p>
                  : <p className="small">The coach looks at your recent takes and writes the next lesson for this stage: a jam, an echo game, a challenge or a drill.</p>}
                <button onClick={askNew}>Ask the coach for a new lesson</button>
              </>}
          </div>
        )}
        <div className="card">
          <h3>Weekly plan from your coach</h3>
          <PlanCard />
        </div>

        <div className="card">
          <h3>Your path</h3>
          {MILESTONES.map(m => {
            const checks = checkpointsOf(m, lessons, s.profile);
            if (!checks.length) return null;
            const passed = checks.every(l => s.lessons[l.id]?.completedAt);
            const extra = visible.filter(l => l.level === m.level && !m.checkpoints.includes(l.id));
            const chip = (l: Lesson, cls = '') => {
              const p = s.lessons[l.id];
              const state = p?.completedAt ? 'done' : p ? 'started' : '';
              return <button key={l.id} className={`lessonChip ${state} ${cls}`} onClick={() => setOpen({ lessonId: l.id })}
                title={p?.completedAt ? `Done · ${p.stars ?? 1} of 3 stars · best ${p.bestBpm} BPM` : p ? `Step ${p.step + 1} · ${p.bpm} BPM` : 'Not started'}>
                {l.title}{p?.completedAt && <span className="stars" aria-label={`${p.stars ?? 1} of 3 stars`}>{'★'.repeat(p.stars ?? 1)}{'☆'.repeat(3 - (p.stars ?? 1))}</span>}</button>;
            };
            return (
              <div key={m.level} className={`milestone ${passed ? 'passed' : m === milestone ? 'current' : 'later'}`}>
                <div>
                  <b>{passed ? '✓ ' : ''}{m.level + 1}. {m.title}</b>
                  {m === milestone && <ul className="canDo">{m.canDo.map(c => <li key={c}>{c}</li>)}</ul>}
                  {m === milestone && m.track && <p className="small">Your style track: {Object.entries(m.track).filter(([g]) => !s.profile.goals.length || s.profile.goals.includes(g as Genre)).map(([, t]) => t).join(' · ')}</p>}
                </div>
                <div className="chips">
                  <span className="small">Challenges:</span>{checks.map(l => chip(l, 'checkpoint'))}
                  {extra.length > 0 && <><span className="small">Lessons:</span>{extra.map(l => chip(l, l.source === 'ai' ? 'ai' : ''))}</>}
                </div>
              </div>
            );
          })}
          <p className="small">Pass a stage's challenges to move on. You can open any lesson; today's mix sticks to your current stage.</p>
        </div>

        <div className="actions">
          <button className="link" onClick={() => { if (!session.done.length || confirm('Plan today again from your current progress?')) rebuildToday(); }}>Rebuild today's mix</button>
          <button className="link" onClick={() => setPlacing(true)}>Find my level (a short placement test)</button>
          <button className="link" onClick={() => setEditing(true)}>Goals: {s.profile.goals.length ? s.profile.goals.join(', ') : 'not sure yet'} · {s.profile.minutesPerDay} min/day (change)</button>
          <button className="link danger" onClick={() => { if (confirm('Reset all lesson progress and redo the setup questions? Your run history in Progress is kept.')) resetAllLessons(); }}>Reset all lesson progress</button>
        </div>
      </details>
    </div>
  );
}


/**
 * This stage as a winding trail of stops, read left to right: what's done (older ones folded into one stop), the one
 * you're on now, what's left (later ones fold into "+N more"), the ★ challenges, the song. A coach lesson has a ✍,
 * a lesson you tried but didn't finish a dashed ring. Kept to about ten stops (all are in Full path).
 */
function Trail({ song, lessons, current, done, started, isChallenge, onOpen }: { song?: { title: string; ready: number; onOpen: () => void }; lessons: Lesson[]; current?: Lesson; done: (id: string) => boolean; started: (id: string) => boolean; isChallenge: (l: Lesson) => boolean; onOpen: (id: string) => void }) {
  const cur = current && lessons.includes(current) ? current : lessons.find(l => !done(l.id));
  const finished = lessons.filter(l => done(l.id) && l !== cur);
  const folded = finished.length > 2 ? finished.slice(0, -1) : [];
  const left = lessons.filter(l => !done(l.id) && l !== cur);
  const upcoming = left.filter(l => !isChallenge(l)).sort((a, b) => Number(started(b.id)) - Number(started(a.id))), later = upcoming.slice(4); // what you've started comes first
  type Stop = { l?: Lesson; icon: string; name: string; cls: string };
  const stop = (l: Lesson): Stop => ({ l, name: l.title, icon: done(l.id) ? '✓' : isChallenge(l) ? '★' : iconOf(l),
    cls: `${l === current ? 'now' : done(l.id) ? 'done' : isChallenge(l) ? 'boss' : ''}${started(l.id) && l !== current ? ' started' : ''}${l.source === 'ai' ? ' coach' : ''}` });
  const stops: Stop[] = [
    ...(folded.length ? [{ icon: '✓', name: `${folded.length} done`, cls: 'done' }] : []),
    ...finished.filter(l => !folded.includes(l)).map(stop), ...(cur ? [stop(cur)] : []),
    ...upcoming.slice(0, 4).map(stop),
    ...(later.length ? [{ icon: `+${later.length}`, name: 'more', cls: 'more' }] : []),
    ...left.filter(isChallenge).map(stop),
    { icon: '🎵', name: song?.title ?? 'Unlock a real song', cls: 'song' },
  ];
  const pts = stops.map((_, i) => ({ x: 5 + (i * 90) / Math.max(1, stops.length - 1), y: 50 + 22 * Math.sin(i * 1.3) }));
  return (
    <div className="trail" style={{ '--gap': 90 / Math.max(1, stops.length - 1) } as React.CSSProperties}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} /></svg>
      {stops.map((st, i) => {
        const style = { left: `${pts[i].x}%`, top: `${pts[i].y}%` }, cls = `stop ${st.cls} ${pts[i].y < 50 ? 'up' : ''}`;
        const inner = <><span className="dot" aria-hidden>{st.icon}</span><span className="name">{st.name}</span></>;
        if (st.cls === 'song' && song) return ( // the stage song: a button with a ring of bars ready
          <button key="song" className={`${cls} songStop`} style={{ ...style, '--p': `${Math.round(song.ready * 100)}%` } as React.CSSProperties} onClick={song.onOpen}
            aria-label={`${song.title}, ${Math.round(song.ready * 100)}% ready`} title={`${Math.round(song.ready * 100)}% of the bars ready`}>{inner}</button>);
        return st.l
          ? <button key={st.l.id} className={cls} style={style} onClick={() => onOpen(st.l!.id)} title={st.l.title}
            aria-label={`${st.l.title}${done(st.l.id) ? ', done' : ''}${isChallenge(st.l) ? ', stage challenge' : ''}`}>{inner}</button>
          : <div key={st.name} className={cls} style={style}>{inner}</div>;
      })}
    </div>
  );
}

const GOALS: { id: Genre; label: string }[] = [{ id: 'rock', label: 'Rock / pop' }, { id: 'funk', label: 'Funk / R&B / gospel' }, { id: 'jazz', label: 'Jazz / swing' }, { id: 'latin', label: 'Latin' }];

function Onboarding({ onDone }: { onDone: (first: boolean, place?: boolean) => void }) {
  const profile = getSettings().profile;
  const [goals, setGoals] = useState<Genre[]>(profile.goals);
  const [minutes, setMinutes] = useState(profile.minutesPerDay);
  const [played, setPlayed] = useState(false); // N5: played before → a short placement test after setup
  const save = () => { setSettings({ profile: { ...profile, goals, minutesPerDay: minutes, onboarded: true }, session: undefined }); onDone(!profile.onboarded, played); };
  return (
    <div className="today">
      <div className="card form onboarding">
        <h2>{profile.onboarded ? 'Your goals' : 'Welcome to Drum Coach'}</h2>
        {!profile.onboarded && <p>This app is your drum teacher. Each day it plans a short session from where you are: a warm-up, a review, one new skill and one groove. You build every groove one limb at a time while the app plays the rest, and it raises the tempo when you're ready.</p>}
        <fieldset>
          <legend>What do you want to play? Pick any, or none if you're not sure yet.</legend>
          {GOALS.map(g => (
            <label key={g.id} className="check"><input type="checkbox" checked={goals.includes(g.id)}
              onChange={e => setGoals(e.target.checked ? [...goals, g.id] : goals.filter(x => x !== g.id))} /> {g.label}</label>
          ))}
        </fieldset>
        {!profile.onboarded && <label className="check"><input type="checkbox" checked={played} onChange={e => setPlayed(e.target.checked)} /> I've played drums before: find my level with a short test</label>}
        <label>Minutes a day
          <select value={minutes} onChange={e => setMinutes(+e.target.value)}>
            {[15, 20, 25, 30, 45].map(m => <option key={m} value={m}>{m} minutes{m === 25 ? ' (recommended)' : ''}</option>)}
          </select>
        </label>
        <div className="actions"><button className="primary big" onClick={save}>{profile.onboarded ? 'Save' : 'Next: check your kit ▶'}</button>
          {profile.onboarded && <button onClick={() => onDone(false)}>Cancel</button>}</div>
      </div>
    </div>
  );
}

/**
 * Onboarding step 2 (and Journey's "check my kit"): hit each pad once, then tap 8+ times for latency. Each part can be
 * skipped ("No kit yet → use the keyboard"); `setupDone` is set once both are done, so Journey nudges only once.
 */
function KitSetup({ device, onDone }: { device?: string; onDone: () => void }) {
  const [part, setPart] = useState<'pads' | 'latency'>('pads');
  const finish = (done: boolean) => { setSettings({ setupDone: done || getSettings().setupDone, setupNudged: true }); onDone(); };
  return (
    <div className="today">
      <div className="card form onboarding kitSetup">
        <p className="steps"><span className="pill on">1 · Your goals ✓</span> <span className="pill">2 · Your kit</span></p>
        <h2>{part === 'pads' ? 'Hit each pad once' : 'Tap with the click'}</h2>
        <p>{part === 'pads' ? 'So I know your kit: hit the pad I name. If one is wrong you can fix it right here.'
          : "I'm measuring how late the sound reaches you, not how well you play. Then on time is on time."}</p>
        {!device && <p className="warn">No kit plugged in. Plug it in over USB, or use the keyboard for now.</p>}
        {part === 'pads' ? <PadWizard big device={device ?? 'keyboard'} autoStart={!!device} onSaved={() => setPart('latency')} />
          : <LatencyCard onSaved={() => finish(true)} />}
        <div className="actions">
          {part === 'pads' && <button onClick={() => setPart('latency')}>Pads are fine → latency</button>}
          <button className="link" onClick={() => finish(false)}>No kit yet → use the keyboard</button>
          <button className="link" onClick={() => finish(false)}>Skip this for now</button>
        </div>
      </div>
    </div>
  );
}
