import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Thinking, useCoachEntry } from '../coach/api';
import { summarizeRun } from '../coach/summary';
import { worstBars } from '../engine/scoring';
import { beatsPerBar } from '../engine/chart';
import { freeBarStats } from '../engine/jam';
import { afterReview, checkPass, CLEAN_TAKES, copyChart, countPlan, goodMsFor, ladderStep, lanesNow, MIN_BPM, starsFor, startProgress, type LadderEvent } from '../engine/lesson';
import { checkpointsOf } from '../engine/planner';
import { LESSON_BY_ID, MILESTONES } from '../content/curriculum';
import { Celebration, flourish } from './Celebration';
import type { SessionRole } from '../engine/planner';
import { getSettings, subscribeSettings } from '../input/settings';
import { NotesView } from '../play/NotesView';
import { KitView } from '../ui/KitView';
import { player, playerVersion, start, stop, subscribePlayer, type Finished, type PlayOptions } from '../play/player';
import { LatencyHint, Results, saveRun } from '../play/Results';
import { takeChart } from '../engine/transcribe';
import { requestSong } from '../ui/nav';
import { SheetMusic } from '../notation';
import { say } from '../voice/voice';
import { coachTake, dropCoachAction, onCoachAction } from '../coach/session';
import { allLessons, deleteCoachLesson, lessonById, requestCoachLesson } from './aiLessons';
import { progressOf, resetLesson, saveProgress, today } from './state';

const ROLE: Record<SessionRole, string> = { warmup: 'Warm-up', review: 'Review', skill: 'New skill', groove: 'Groove', record: 'Beat your best' };
type Outcome = { passed: boolean; text: string; reason?: string; fixBar?: number; event?: LadderEvent; itemDone: boolean; stars?: number; rankUp?: boolean };
const outcomes = new WeakMap<Finished, Outcome>(); // one outcome per take, survives StrictMode re-runs

/**
 * One lesson: what/why/how, then each step with Hear it → Play → one-line verdict → tempo ladder.
 * Warm-up and review items are a single take at the lesson's best tempo.
 */
export function LessonPlayer(props: Parameters<typeof Lesson>[0]) {
  return lessonById(props.lessonId) ? <Lesson {...props} />
    : <div className="today"><div className="card"><p>This lesson no longer exists.</p><button onClick={props.onBack}>Back to Journey</button></div></div>;
}

function Lesson({ lessonId, role, minutes, onNext, onBack, onItemDone, onOpen }: {
  lessonId: string; role?: SessionRole; minutes?: number; onNext?: () => void; onBack: () => void; onItemDone?: () => void; onOpen?: (id: string) => void;
}) {
  const lesson = lessonById(lessonId)!;
  useSyncExternalStore(subscribePlayer, playerVersion);
  useSyncExternalStore(subscribeSettings, getSettings);
  const [details, setDetails] = useState(false);
  const [celebrated, setCelebrated] = useState<Finished>(); // the take whose celebration was closed
  const [secs, setSecs] = useState(0); // time spent playing this item
  const [, setVersion] = useState(0);
  const lastTake = useRef<Finished>(undefined);
  const lastAccuracy = useRef<number>(undefined); // for "better than last take"
  const stickyBar = useRef<number>(undefined); // the bar most notes slipped in, last take (for the coach's "zoom")

  const p = progressOf(lesson);
  const oneTake = role === 'warmup' || role === 'review' || role === 'record';
  const stepIdx = oneTake ? lesson.steps.length - 1 : Math.min(p.step, lesson.steps.length - 1);
  const step = lesson.steps[stepIdx];
  // Beat your best: a streak challenge asks for 4 more in a row than your best, anything else 5 BPM above it.
  const recordStreak = role === 'record' && step.pass?.streak ? Math.max(step.pass.streak, p.bestStreak ?? 0) + 4 : undefined;
  const bpm = role === 'record' && !recordStreak ? (p.bestBpm || step.bpm.target) + 5 : oneTake ? Math.max(step.bpm.start, p.bestBpm || step.bpm.target) : p.bpm;
  const fresh = !getSettings().lessons[lesson.id];
  const mine = player.options?.lesson?.id === lesson.id;
  const playing = mine && player.phase === 'playing';
  const justDone = mine && player.phase === 'done' ? player.finished : undefined;
  if (justDone) lastTake.current = justDone;
  // The last take's verdict stays up while you listen to a demo or your own take.
  const f = justDone ?? (playing ? undefined : lastTake.current);
  const outcome = f && outcomes.get(f);
  const base = step.copy || step.trade ? copyChart(step.chart) : step.chart;
  const free = step.trade ? Array.from({ length: step.chart.bars }, (_, i) => 2 * i + 2) : step.freeBars ?? []; // trade: every echo bar is yours
  const chart = free.length ? { ...base, notes: base.notes.filter(n => !free.includes(Math.floor(n.t / beatsPerBar(base) + 1e-6) + 1)) } : base;

  // Judge each finished take once: pass check, tempo ladder or review, save the run.
  useEffect(() => subscribePlayer(() => {
    const f = player.finished;
    if (player.phase !== 'done' || !f || f.options.lesson?.id !== lesson.id || outcomes.has(f)) return;
    // Wait mode is for learning the pattern: no verdict, no ladder, not saved.
    if (f.options.wait) { outcomes.set(f, { passed: false, itemDone: false, text: 'Nice and slow. When it feels easy, press Play to go with the click.' }); setVersion(v => v + 1); return; }
    const p0 = progressOf(lesson);
    // A step's extra limits (flams, timing) are for the full groove, not its first layers.
    const fs = freeBarStats(f.hits, f.extras, { zero: f.zero, beatMs: 60000 / (f.chart.bpm * f.options.speed), beatsPerBar: beatsPerBar(f.chart), fromBar: f.options.fromBar, sectionBars: f.options.toBar - f.options.fromBar + 1 }, free);
    const st = fs ? { ...f.stats, extra: f.stats.extra - fs.extras } : f.stats; // strokes in your own bars aren't extras
    const check = checkPass(st, recordStreak ? { ...step.pass, streak: recordStreak } : step.layers && (p0.layer ?? 0) < step.layers.length - 1 ? undefined : step.pass, lesson.level);
    // A zoom loop is practice for the next real take: no ladder, not saved.
    if (f.options.zoom) {
      outcomes.set(f, { passed: check.ok, itemDone: false, text: `Bar ${f.options.zoom}, four times: ${f.stats.total - f.stats.miss} of ${f.stats.total} notes landed. Now the whole thing again at ${progressOf(lesson).bpm} BPM.` });
      setVersion(v => v + 1); return;
    }
    const sticky = worstBars(f.run, f.results, f.options.toBar - f.options.fromBar + 1, f.options.fromBar);
    stickyBar.current = sticky[0];
    const p = p0;
    const prev = lastAccuracy.current;
    lastAccuracy.current = st.accuracy;
    // What went right first: notes landed, best run, comebacks, better than last take.
    const landed = (st.total ? `${st.total - st.miss} of ${st.total} notes landed, best run ${st.streak} in a row`
      + (prev !== undefined && st.accuracy > prev + 2 ? ', better than last take' : st.recoveries >= 3 ? `, and you got back in ${st.recoveries} times without stopping` : '') + '.' : '')
      + (!fs ? '' : fs.stats.hits ? ` Your bars: ${fs.stats.onGridPct}% on the beat${fs.stats.spread <= 35 ? ', nice and even' : ''}.` : ' Your bars were empty: play anything you like in them.');
    let o: Outcome;
    if (oneTake) {
      if (role === 'review') saveProgress(lesson.id, afterReview(p, check.ok, today()));
      if (role === 'record') {
        if (check.ok) { saveProgress(lesson.id, recordStreak ? { ...p, bestStreak: recordStreak } : { ...p, bestBpm: bpm }); flourish(false); }
        o = { passed: check.ok, itemDone: true, text: check.ok ? `🏆 NEW RECORD: ${recordStreak ? `${recordStreak} in a row` : `${bpm} BPM`}! ${landed}` : `${landed} Not this time. Your record stays, try again any day.` };
      } else o = { passed: check.ok, itemDone: true, text: check.ok ? `${landed} Still solid.` : `${landed} We'll come back to this one tomorrow.` };
    } else {
      const { next, event } = ladderStep(p, lesson, check.ok, today(), st.accuracy);
      const stars = event === 'lessonDone' ? starsFor(f.stats) : undefined;
      saveProgress(lesson.id, stars ? { ...next, stars: Math.max(p.stars ?? 0, stars) } : next);
      // A coach lesson standing in for a checkpoint passes it; the checkpoint itself comes back for review.
      const cp = lesson.checkpoint && LESSON_BY_ID[lesson.checkpoint];
      if (event === 'lessonDone' && cp && !getSettings().lessons[cp.id]?.completedAt)
        saveProgress(cp.id, { ...startProgress(cp), bestBpm: next.bestBpm, completedAt: next.completedAt, reviewDue: next.reviewDue, stars });
      // Rank up: this was the last open checkpoint of its stage.
      const stage = MILESTONES.find(m => m.checkpoints.includes(cp ? cp.id : lesson.id)), s = getSettings();
      const rankUp = event === 'lessonDone' && !p.completedAt && !!stage && checkpointsOf(stage, allLessons(), s.profile).every(l => s.lessons[l.id]?.completedAt);
      const ok = check.ok || !!step.jam || (free.length > 0 && !step.pass);
      const msg: Record<LadderEvent, string> = {
        hold: ok ? `Clean take (${next.clean}/${CLEAN_TAKES}). Once more at ${next.bpm} BPM.` : 'Same tempo, once more. You are close.',
        up: `Up to ${next.bpm} BPM!`,
        slowDown: `Let's take it to ${next.bpm} BPM. Slower is how it sticks.`,
        layerUp: `Now add the ${(lanesNow(step, next) ?? []).filter(d => !(lanesNow(step, p) ?? []).includes(d)).map(laneName).join(' and ')}.`,
        atFloor: 'This one is tricky. Try "Learn it slowly": the music waits for each note.',
        stepDone: `Step done! Next: ${lesson.steps[next.step].title}.`,
        lessonDone: `Lesson complete at ${next.bestBpm} BPM, ${stars} star${stars === 1 ? '' : 's'}!${cp ? ` That passes the "${cp.title}" checkpoint.` : ''}${rankUp ? ` Rank up: you're now a ${stage!.rank}!` : ''} It will come back for review in a few days.`,
      };
      o = { passed: ok, event, reason: ok ? undefined : check.reason, fixBar: ok ? undefined : sticky[0], text: `${ok ? 'Nice! ' : ''}${landed.trim()} ${msg[event]}`, itemDone: event === 'stepDone' || event === 'lessonDone', stars, rankUp };
    }
    outcomes.set(f, o);
    // The coach builds the path: once a lesson is done, it writes the next one in the background (unless one is waiting).
    if (o.event === 'lessonDone' && !allLessons().some(l => l.source === 'ai' && !getSettings().lessons[l.id]?.completedAt))
      requestCoachLesson(`after-${lesson.id}-${f.startedAt}`);
    // Between takes of a step the verdict stays on screen; the coach speaks once the step or lesson is done.
    if (o.itemDone && getSettings().voice) void say(o.text);
    if (o.itemDone) coachTake(f, { lesson: lesson.title, step: step.title, passed: o.passed, verdict: o.text, tempoNow: getSettings().lessons[lesson.id]?.bpm, target: step.bpm.target, stickyBars: sticky });
    if (o.itemDone) onItemDone?.();
    saveRun(f, { passed: o.passed });
    setSecs(s => s + f.durationS);
    setVersion(v => v + 1);
  }), [lesson, step, oneTake, role, onItemDone]);
  useEffect(() => () => { stop(); dropCoachAction(); }, []);

  const lanes = oneTake ? step.layers?.at(-1) ?? step.activeLanes : lanesNow(step, p);
  const options = (demo: boolean, wait = false): PlayOptions => ({
    // Short takes so a rough one is over quickly: 4 bars; 8 for the proving take (last step at its target tempo),
    // a jam (long enough to enjoy) and copy-me (4 calls and 4 echoes).
    fromBar: 1, toBar: chart.bars, repeats: Math.max(1, Math.ceil((step.copy || step.trade || step.jam || (stepIdx === lesson.steps.length - 1 && bpm >= step.bpm.target) ? 8 : 4) / chart.bars)),
    speed: bpm / chart.bpm, metronome: true, subdivision: 1, countInBars: 1, wait,
    countAloud: step.countAloud && countPlan(16, beatsPerBar(chart), step.countAloud),
    activeLanes: lanes, demo, gapBars: demo ? undefined : step.gapBars, count: lesson.level <= 1, goodMs: goodMsFor(lesson.level),
    lesson: { id: lesson.id, step: stepIdx + 1, title: lesson.title, goal: step.text },
  });
  const play = (demo: boolean, atBpm = bpm, wait = false) => { setDetails(false); start(chart, { ...options(demo, wait), speed: atBpm / chart.bpm }); };
  // Listen back: your own hits, at their real times, with the click.
  const hearTake = (t: Finished) => start(takeChart(t.hits, { zero: t.zero, beatMs: 60000 / (t.chart.bpm * t.options.speed), beats: t.run.beats, beatsPerBar: t.run.beatsPerBar, title: 'Your take', timeSignature: t.chart.timeSignature }),
    { ...options(true), fromBar: 1, toBar: 999, repeats: 1, speed: 1, activeLanes: undefined });
  // Zoom in: loop one bar 4 times, 10 BPM slower, with the app playing softly underneath.
  const zoomIn = (bar: number) => { setDetails(false); start(chart, { ...options(false), fromBar: bar, toBar: bar, repeats: 4, speed: Math.max(MIN_BPM, bpm - 10) / chart.bpm, guide: true, zoom: bar }); };
  // The coach's suggested next step (a tap on its button, or "yes"): again / slower / faster here, next = next item.
  useEffect(() => onCoachAction(a => {
    if (a.kind === 'next') { (onNext ?? onBack)(); return true; } // opened outside today's session: back to the Journey
    const bar = a.kind === 'zoom' ? (a.bar && a.bar <= chart.bars ? a.bar : stickyBar.current) : undefined;
    if (bar) { zoomIn(bar); return true; }
    const cur = progressOf(lesson).bpm;
    const want = a.bpm ?? (a.kind === 'slower' ? cur - 5 : a.kind === 'faster' ? cur + 5 : cur);
    const nb = oneTake ? bpm : Math.max(30, Math.min(step.bpm.target, Math.round(want))); // the coach may go below the start tempo when you struggle
    if (!oneTake && nb !== cur) saveProgress(lesson.id, { ...progressOf(lesson), bpm: nb });
    play(false, nb);
    return true;
  }));
  const timeUp = minutes !== undefined && secs >= minutes * 60;
  const itemDone = outcome?.itemDone || timeUp;
  const helpKey = f && outcome && !outcome.passed ? `help-${lesson.id}-${f.startedAt}` : null;
  const help = useCoachEntry<{ id: string; title: string }>(helpKey);
  const askHelp = () => f && helpKey && requestCoachLesson(helpKey, { lessonId: lesson.id, step: stepIdx + 1, reason: outcome?.reason ?? '', run: summarizeRun(f) });

  if (f && details) return <Results f={f} onAgain={() => play(false)} onBack={() => setDetails(false)} />;

  const stage = MILESTONES.find(m => m.checkpoints.includes(lesson.checkpoint ?? lesson.id)) ?? MILESTONES.find(m => m.level === lesson.level);
  const stageChecks = stage ? checkpointsOf(stage, allLessons(), getSettings().profile) : [];
  const celebration = f && outcome?.event === 'lessonDone' && celebrated !== f && (
    <Celebration lesson={lesson} stars={outcome.stars ?? 1} milestone={stage} rankUp={!!outcome.rankUp}
      next={stage && MILESTONES.find(m => m.level === stage.level + 1)}
      done={stageChecks.filter(l => getSettings().lessons[l.id]?.completedAt).length} total={stageChecks.length}
      nextLabel={onNext ? "Next in today's session →" : 'Back to Journey'} onNext={onNext ?? onBack}
      onAgain={() => { setCelebrated(f); play(false); }} onClose={() => setCelebrated(f)} />
  );

  return (
    <div className="play">
      {celebration}
      <div className="playSide">
        <div className="card">
          <p className="small">{role ? `${ROLE[role]} · ` : ''}Level {lesson.level}{minutes ? ` · ${minutes} min` : ''}</p>
          <h2 className="lessonTitle">{lesson.title}{lesson.source === 'ai' && <span className="badge">by your coach</span>}</h2>
          {lesson.focus && <p className="focus">{lesson.focus}</p>}
          <details open={fresh}>
            <summary>About this lesson</summary>
            <p><b>What.</b> {lesson.what}</p>
            <p><b>Why.</b> {lesson.why}</p>
            <p><b>How.</b> {lesson.how}</p>
          </details>
        </div>
        <div className="card">
          <h3>{oneTake ? 'One take' : `Step ${stepIdx + 1} of ${lesson.steps.length}`} · {step.title}</h3>
          <p>{step.text}</p>
          {!oneTake && lesson.steps.length > 1 && (
            <ol className="steps">
              {lesson.steps.map((s, i) => <li key={i} className={i < stepIdx || p.completedAt ? 'done' : i === stepIdx ? 'on' : ''}>{s.title}</li>)}
            </ol>
          )}
          <p className="tempo"><b>{bpm} BPM</b>{!oneTake && <> · target {step.bpm.target}</>}
            {!oneTake && <span className="dots" aria-label={`${p.clean} of ${CLEAN_TAKES} clean takes`}>{Array.from({ length: CLEAN_TAKES }, (_, i) => <i key={i} className={i < p.clean ? 'on' : ''} />)}</span>}
          </p>
          {step.jam && <p className="small">Jam: just play along and enjoy. Every take counts.</p>}
          {step.copy && <p className="small">Copy me: the app plays a bar, you play it back. Then the next one.</p>}
          {step.bite && <p>🎵 Bars {step.bite.fromBar}–{step.bite.toBar} of <b>{step.bite.title ?? 'your song'}</b>. <button className="link" onClick={() => requestSong(step.bite!.songId, { from: step.bite!.fromBar, to: step.bite!.toBar })}>Play it with the song →</button></p>}
          {step.trade && <p className="small">Trade bars: the app plays a bar, you answer with anything you like. No wrong notes, just stay on the beat.</p>}
          {!step.trade && free.length > 0 && <p className="small">Bar {free.join(' and ')} is yours: play any fill you like. No wrong notes, just stay on the beat.</p>}
          {step.pass?.streak && <p className="small">Challenge: {step.pass.streak} notes in a row. Missed one? Keep going, the count starts again.</p>}
          {lanes && step.chart.notes.some(n => !lanes.includes(n.drum)) && <p className="small">You play: {lanes.map(laneName).join(', ')}. The app plays the rest (dimmed).</p>}
          {step.layers && step.layers.length > 1 && <p className="small">Layer {Math.min(p.layer ?? 0, step.layers.length - 1) + 1} of {step.layers.length}: a clean take adds the next limb.</p>}
          {step.gapBars && <p className="small">The click goes silent every {step.gapBars === 2 ? 'other' : `${step.gapBars}th`} bar.</p>}
          <details><summary>Notation</summary><SheetMusic notes={step.chart.notes} timeSignature={step.chart.timeSignature} /></details>
        </div>
        {outcome && (
          <div className={`card verdict ${outcome.passed ? 'pass' : ''}`} aria-live="polite">
            <p>{outcome.text}</p>
            {outcome.reason && <p className="small">Tip: {outcome.reason}</p>}
            <LatencyHint f={f} />
            {!playing && f.hits.length > 0 && <div className="actions"><button onClick={() => hearTake(f)}>🎧 Hear your take</button><button onClick={() => play(true)}>Hear it right</button></div>}
            {timeUp && !outcome.itemDone && <p className="small">That's your {minutes} minutes for this one. Move on, or keep going if you're in the zone.</p>}
            <button className="link" onClick={() => setDetails(true)}>Details and coach</button>
            {helpKey && (help?.status === 'thinking' ? <Thinking what="Your coach is writing a lesson for this" />
              : help?.status === 'done' ? <p className="small">Your coach wrote "{help.data?.title}".{' '}
                {onOpen && help.data?.id ? <button className="primary" onClick={() => onOpen(help.data!.id)}>Open it</button> : "It's on Journey."}</p>
              : <>{help?.status === 'error' && <p className="warn">{help.error}</p>}
                <button className="link" onClick={askHelp}>Ask the coach for something different</button></>)}
            {outcome.fixBar && !playing && <button onClick={() => zoomIn(outcome.fixBar!)}>Fix bar {outcome.fixBar}</button>}
            {!outcome.passed && !playing && <button onClick={() => play(false, bpm, true)}>Learn it slowly</button>}
          </div>
        )}
        <div className="actions inFocus">
          {playing ? <button className="primary big" onClick={stop}>Stop (Esc)</button> : <>
            <button onClick={() => play(true)}>Hear it</button>
            {!(oneTake && outcome) && <button className="primary big" autoFocus onClick={() => play(false)}>{outcome ? 'Next take' : 'Play'}</button>}
          </>}
        </div>
        <div className="actions">
          {itemDone && onNext && <button className="primary" onClick={onNext}>Next in today's session →</button>}
          <button onClick={onBack}>Back to Journey</button>
 {lesson.source === 'ai' && <button className="link danger" onClick={() => { if (confirm(`Delete the coach's lesson "${lesson.title}"?`)) { stop(); void deleteCoachLesson(lesson.id).then(onBack); } }}>Delete this lesson</button>}
          {!fresh && !oneTake && <button className="link" onClick={() => { if (confirm(`Reset "${lesson.title}" to step 1 at the starting tempo? Your saved runs stay in Trophies.`)) { stop(); resetLesson(lesson.id); } }}>Reset this lesson</button>}
        </div>
      </div>
      <section className="highwayWrap practiceSplit"><NotesView idle={{ chart, bpm, goal: step.text }} /><KitView /></section>
    </div>
  );
}

const LANE_NAMES: Record<string, string> = { hihat: 'hi-hat', hhOpen: 'open hi-hat', hhPedal: 'hi-hat foot', tom1: 'tom 1', tom2: 'tom 2', floor: 'floor tom' };
const laneName = (d: string) => LANE_NAMES[d] ?? d;
