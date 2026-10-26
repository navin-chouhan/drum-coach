import { useEffect, useState, useSyncExternalStore } from 'react';
import { Thinking, useCoachEntry } from '../coach/api';
import { PlanCard } from '../coach/CoachView';
import { LESSON_BY_ID, MILESTONES } from '../content/curriculum';
import { greeting } from '../engine/greeting';
import { isProven, recordTarget, toolOf, type Genre, type Lesson } from '../engine/lesson';
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
  const line = greeting({ hour: new Date().getHours(), streak: dash?.streak ?? 0, runs: dash?.totalRuns ?? 0, landedWeek: dash?.landedWeek ?? null, landedLastWeek: dash?.landedLastWeek ?? null,
    next: hero && { title: hero.title, tool: toolOf(hero.steps[0]), minutes, focus: hero.focus }, setDone: !!hero && heroItem < 0 && setDone && !swap, pathDone: pathDone && !hero });
  const heroLabel = hero ? (heroItem < 0 && setDone && !swap ? `Next lesson: ${hero.title} ▶` : "Yes, let's go ▶") : pathDone ? '🎯 Coach challenge ▶' : 'Jam ▶';
  const trailDone = trail.filter(l => done(l.id)).length;
  const theme = weekTheme(runs), weekPlan = thisWeeksPlan(); // the coach's plan leads; the most-given tip is the fallback
  const project = s.profile.song?.stage === milestone?.level ? s.profile.song : undefined;
  const projectSong = songs.find(x => x.id === project?.id);
  const songBars = projectSong ? songBarCount(projectSong) : 0;
  // Beat your best: a finished lesson you haven't played for longest (improvising tools have no record to beat).
  const lastPlayed = (l: Lesson) => dash?.charts.filter(c => c.chartId.startsWith(`lesson/${l.id}/`)).flatMap(c => c.points.map(p => p.date)).sort().at(-1) ?? '';
  // Beat the clock: a finished groove, the one played longest ago.
  // The 2-minute challenge and Beat your best: the highest stage first, then the one played longest ago.
  const arcade = visible.filter(l => done(l.id) && l.kind === 'groove' && toolOf(l.steps[l.steps.length - 1]) === 'drill').sort((a, b) => b.level - a.level || lastPlayed(a).localeCompare(lastPlayed(b)))[0];
  // A streak record already as long as the whole take has nothing left to beat.
  const maxedOut = (l: Lesson) => { const t = recordTarget(l.steps[l.steps.length - 1], s.lessons[l.id]); return t !== undefined && t <= (s.lessons[l.id].bestStreak ?? 0); };
  const record = visible.filter(l => done(l.id) && l.level <= (milestone?.level ?? 99) && !['jam', 'trade', 'free', 'copy'].includes(toolOf(l.steps[l.steps.length - 1])) && !maxedOut(l))
    .sort((a, b) => b.level - a.level || lastPlayed(a).localeCompare(lastPlayed(b)))[0];
  const showoff = songs.filter(x => songVerified(x) && songReady(runs, x.id, songBarCount(x)));
  // Health (N10): lighter days after "a bit sore", practice-length advice, the weekly ear and wrist check-ins.
  const daysPlayed = new Set(runs.map(r => r.startedAt.slice(0, 10))).size, wk = isoWeek(new Date());
  const healthLine = soreActive(s.soreUntil, today()) ? `Easy days until ${s.soreUntil}: shorter sets, lighter playing. If something hurts, stop; if it lasts, see a doctor.`
    : dayAdvice(Math.round(dash?.minutesToday ?? 0), daysPlayed)
    ?? (played && s.hearingTipWeek !== wk ? 'Protect your ears: keep the headphones at a level you could talk over, and stop if your ears ring.' : undefined);
  const askSore = played && daysPlayed >= 3 && s.soreAskedWeek !== wk && !soreActive(s.soreUntil, today());
  // The trail ends at the stage's song: your real song if you picked one, else the built-in one, with how much is ready.
  const builtinBars = builtinSong ? builtinSong.steps[builtinSong.steps.length - 1].chart.bars : 0;
  // D6: a real song without its part yet can't be played: until it has its 16 bars, the built-in song stays the goal.
  const songStop = project && (songBars >= SHOWOFF_MIN_BARS || !builtinSong) ? { title: cleanSongTitle(project.title), ready: songBars ? barsReady(runs, project.id, songBars) / songBars : 0, onOpen: () => requestSong(project.id) }
    : builtinSong ? { title: builtinSong.title.replace(/^Song: /, ''), ready: done(builtinSong.id) ? 1 : barsReady(runs, builtinSong.id, builtinBars) / builtinBars, onOpen: () => setOpen({ lessonId: builtinSong.id }) } : undefined;
  return (
    <div className="today home">
      <div className="homeHero">
        <div className="avatar" aria-hidden>🥁</div>
        <div>
          <div className="bubble" aria-live="polite">
            {recap && <p className="recap">📅 {recap}</p>}
            {healthLine && <p className="recap">🌱 {healthLine}</p>}
            {askSore && <div className="recap">
              <p>Quick check: anything sore after drumming (wrists, forearms, back)?</p>
              <div className="actions"><button onClick={() => setSettings({ soreAskedWeek: isoWeek(new Date()) })}>All good</button>
                <button onClick={() => setSettings({ soreAskedWeek: isoWeek(new Date()), soreUntil: addDays(today(), 3) })}>A bit sore</button></div>
            </div>}
            {!s.setupDone && !s.setupNudged && <div className="recap">
              <p>Before your next lesson: two minutes to check your pads and latency? It makes the timing scores fair.</p>
              <div className="actions"><button className="primary" onClick={() => { setSettings({ setupNudged: true }); setKitStep(true); }}>Check my kit ▶</button>
                <button onClick={() => setSettings({ setupNudged: true })}>Not now</button></div>
            </div>}
            {newStages && <p className="newBadge">🎉 New stages open: <b>Groove at tempo</b>, <b>Linear and odd</b> and <b>Solo voice</b>.</p>}
            {newBadges.length > 0 && <p className="newBadge">🏅 New badge: <b>{newBadges.map(id => BADGES.find(b => b.id === id)?.name).join(', ')}</b>!</p>}
            <p>{line}</p>
            <div className="actions">
              <button className="primary big" autoFocus onClick={go} disabled={!hero && challenge?.status === 'thinking'}>{heroLabel}</button>
              {others.length > 0 && <button onClick={() => setSwap(swap + 1)}>Something else</button>}
              {jam && hero && hero !== jam && <button onClick={() => setOpen({ lessonId: jam.id })}>Just jam</button>}
              <button onClick={() => setTechnique(true)}>🥢 Stick technique</button>
              <button onClick={() => setSkills(true)}>🗺 Skill map</button>
              {flowLesson && <button onClick={() => setOpen({ lessonId: flowLesson.id, flow: true })}>🌊 Flow{flowLesson !== jam ? `: ${flowLesson.title}` : ''}</button>}
            </div>
          </div>
          {coach?.status === 'thinking' && <Thinking what="Your coach is writing your next lesson" />}
        </div>
        <div className="card youCard">
          {milestone && <div className="ring" style={{ '--p': `${trail.length ? (trailDone / trail.length) * 100 : 0}%` } as React.CSSProperties}>
            <div>Stage {path.indexOf(milestone) + 1}<br />{trailDone}/{trail.length}</div>
          </div>}
          <div>
            <div className="rankSticker small">{rank}{rankNow?.state === 'proven' && ' ✓'}</div>
            {rankNow?.state === 'earned' && <p className="small">Prove it on another day ({rankNow.proven} of {rankNow.total})</p>}
            <ul className="youStats">
              <li>🔥 <b>{dash?.streak ?? 0}-day</b> streak</li>
              {dash?.landedWeek != null && <li>🎯 <b>{dash.landedWeek}%</b> notes landed this week{dash.landedLastWeek != null && dash.landedWeek > dash.landedLastWeek ? `, up from ${dash.landedLastWeek}%` : ''}</li>}
              <li>⏱ <b>{Math.round(dash?.minutesToday ?? 0)}</b> min today</li>
              {weekPlan?.focus ? <li>🎯 This week: <b>{weekPlan.focus}</b>{weekPlan.why && <><br /><span className="small">{weekPlan.why}</span></>}</li>
              : theme && <li>🎯 This week: <b>{theme.words}</b> · {themeEntry?.status === 'thinking' ? 'your coach is on it…' : themeEntry?.status === 'done' ? 'lesson ready on your trail'
                : <button className="link" onClick={() => requestCoachLesson(themeKey, { lessonId: 'week', step: 1, reason: `This week's habit to work on: ${theme.words} (the live tip came ${theme.count} times).`, run: {} })}>lesson for this</button>}</li>}
              {project && <li>🎵 <button className="link" onClick={() => requestSong(project.id)}>{cleanSongTitle(project.title)}</button>: {songBars >= SHOWOFF_MIN_BARS ? `${barsReady(runs, project.id, songBars)} of ${songBars} bars ready${projectSong && !songVerified(projectSong) ? ' · check the part by ear in Songs' : ''}`
                : `${songBars ? `${songBars} of ${SHOWOFF_MIN_BARS} bars of its part are in` : 'its drum part isn\'t in yet'}: open it, set the tempo, and the coach can suggest the part.${builtinSong ? ` Until then your stage song is ${builtinSong.title.replace(/^Song: /, '')}.` : ''}`}</li>}
            </ul>
          </div>
        </div>
      </div>

      {session.items.length > 0 && <div className="card">
        <h3>Today's set · {total} min</h3>
        <div className="setTiles">
          {session.items.map((it, i) => {
            const l = lessonById(it.lessonId), isDone = session.done.includes(i);
            if (!l) return null;
            return (
              <button key={i} className={`setTile ${isDone ? 'done' : i === firstUndone ? 'cur' : ''}`} onClick={() => openItem(i)}>
                {i === firstUndone && <span className="tag">Up next</span>}
                <span className="ic" aria-hidden>{iconOf(l)}</span>
                <b>{isDone ? '✓ ' : ''}{it.role === 'review' && MILESTONES.some(m => m.checkpoints.includes(l.id)) && !isProven(s.lessons[l.id]) ? 'Prove it: ' : ''}{l.title}</b>
                <span className="small">{TOOL_LABEL[toolOf(l.steps[0])]} · {it.minutes} min</span>
              </button>
            );
          })}
          {pReady && pSong && <button className="setTile record" onClick={() => setOpen({ lessonId: `song-${pSong.id}` })}>
            <span className="ic" aria-hidden>🎵</span><b>Play {pSong.title} all the way through ▶</b><span className="small">every bar is ready</span>
          </button>}
          {arcade && <button className="setTile record" onClick={() => setOpen({ lessonId: arcade.id, arcade: true })}>
            <span className="ic" aria-hidden>⏱</span><b>2-minute challenge</b>
            <span className="small">{arcade.title} · {s.arcade?.[arcade.id] ? `this week: beat ${s.arcade[arcade.id] + 2} clean bars (best ${s.arcade[arcade.id]})` : 'how many clean bars?'}</span>
          </button>}
          {record && <button className="setTile record" onClick={() => setOpen({ lessonId: record.id, role: 'record' })}>
            <span className="ic" aria-hidden>🏆</span><b>Beat your best</b>
            <span className="small">{record.title} · {recordTarget(record.steps[record.steps.length - 1], s.lessons[record.id]) ? `${recordTarget(record.steps[record.steps.length - 1], s.lessons[record.id])} in a row` : s.lessons[record.id]?.bestBpm ? `${s.lessons[record.id].bestBpm + 5} BPM` : 'one take'}</span>
          </button>}
        </div>
      </div>}

      {milestone && !project && <ShowoffCard stage={milestone} profile={s.profile} builtin={builtinSong && { title: builtinSong.title.replace(/^Song: /, ''), open: () => setOpen({ lessonId: builtinSong.id }) }} />}

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

      {milestone && <div className="card">
        <h3>Stage {path.indexOf(milestone) + 1} · {milestone.title}</h3>
        <Trail song={songStop} lessons={trail} current={hero} done={done} isChallenge={l => milestone.checkpoints.includes(l.checkpoint ?? l.id)} onOpen={id => setOpen({ lessonId: id })} />
      </div>}

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
                <button onClick={() => { requestCoachLesson(coachKey.replace(/-\d+$/, `-${asks + 1}`)); setAsks(asks + 1); }}>Ask the coach for a new lesson</button>
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
          <button className="link danger" onClick={() => { if (confirm('Reset all lesson progress and redo the setup questions? Your run history in Trophies is kept.')) resetAllLessons(); }}>Reset all lesson progress</button>
        </div>
      </details>
    </div>
  );
}


/**
 * This stage as a winding trail of stops: done ones green, the next one big, the challenges as stars, a song at the end.
 * Kept to about ten stops: older finished lessons fold into one "done" stop, later ones into "+N more" (all are in Full path).
 */
function Trail({ song, lessons, current, done, isChallenge, onOpen }: { song?: { title: string; ready: number; onOpen: () => void }; lessons: Lesson[]; current?: Lesson; done: (id: string) => boolean; isChallenge: (l: Lesson) => boolean; onOpen: (id: string) => void }) {
  const c = Math.max(0, current ? lessons.indexOf(current) : lessons.findIndex(l => !done(l.id)));
  const before = lessons.slice(0, c), after = lessons.slice(c + 1);
  const finished = before.filter(l => done(l.id)); // the current stop can be a coach lesson ahead of unplayed ones
  const folded = finished.length > 2 ? finished.slice(0, -1) : [];
  const upcoming = after.filter(l => !isChallenge(l)), later = upcoming.slice(4);
  type Stop = { l?: Lesson; icon: string; name: string; cls: string };
  const stop = (l: Lesson): Stop => ({ l, name: l.title, icon: done(l.id) ? '✓' : isChallenge(l) ? '★' : iconOf(l),
    cls: l === current ? 'now' : done(l.id) ? 'done' : isChallenge(l) ? 'boss' : '' });
  const stops: Stop[] = [
    ...(folded.length ? [{ icon: '✓', name: `${folded.length} done`, cls: 'done' }] : []),
    ...before.filter(l => !folded.includes(l)).map(stop), ...(lessons[c] ? [stop(lessons[c])] : []),
    ...after.filter(l => !later.includes(l) && !isChallenge(l)).map(stop),
    ...(later.length ? [{ icon: `+${later.length}`, name: 'more', cls: 'more' }] : []),
    ...after.filter(isChallenge).map(stop),
    { icon: '🎵', name: song?.title ?? 'Unlock a real song', cls: 'song' },
  ];
  const pts = stops.map((_, i) => ({ x: 5 + (i * 90) / Math.max(1, stops.length - 1), y: 50 + 22 * Math.sin(i * 1.3) }));
  return (
    <div className="trail">
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
        {part === 'pads' ? <PadWizard device={device ?? 'keyboard'} autoStart={!!device} onSaved={() => setPart('latency')} />
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
