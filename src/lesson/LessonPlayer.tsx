import { useEffect, useState, useSyncExternalStore } from 'react';
import { Thinking, useCoachEntry } from '../coach/api';
import { summarizeRun } from '../coach/summary';
import { afterReview, checkPass, CLEAN_TAKES, ladderStep, starsFor, type LadderEvent } from '../engine/lesson';
import { checkpointsOf } from '../engine/planner';
import { MILESTONES } from '../content/curriculum';
import { Celebration } from './Celebration';
import type { SessionRole } from '../engine/planner';
import { getSettings, subscribeSettings } from '../input/settings';
import { NotesView } from '../play/NotesView';
import { player, playerVersion, start, stop, subscribePlayer, type Finished, type PlayOptions } from '../play/player';
import { Results, saveRun } from '../play/Results';
import { SheetMusic } from '../notation';
import { say } from '../voice/voice';
import { coachTake, onCoachAction } from '../coach/session';
import { allLessons, deleteCoachLesson, lessonById, requestCoachLesson } from './aiLessons';
import { progressOf, resetLesson, saveProgress, today } from './state';

const ROLE: Record<SessionRole, string> = { warmup: 'Warm-up', review: 'Review', skill: 'New skill', groove: 'Groove' };
type Outcome = { passed: boolean; text: string; reason?: string; event?: LadderEvent; itemDone: boolean; stars?: number; rankUp?: boolean };
const outcomes = new WeakMap<Finished, Outcome>(); // one outcome per take, survives StrictMode re-runs

/**
 * One lesson: what/why/how, then each step with Hear it → Play → one-line verdict → tempo ladder.
 * Warm-up and review items are a single take at the lesson's best tempo.
 */
export function LessonPlayer(props: Parameters<typeof Lesson>[0]) {
  return lessonById(props.lessonId) ? <Lesson {...props} />
    : <div className="today"><div className="card"><p>This lesson no longer exists.</p><button onClick={props.onBack}>Back to Journey</button></div></div>;
}

function Lesson({ lessonId, role, minutes, onNext, onBack, onItemDone }: {
  lessonId: string; role?: SessionRole; minutes?: number; onNext?: () => void; onBack: () => void; onItemDone?: () => void;
}) {
  const lesson = lessonById(lessonId)!;
  useSyncExternalStore(subscribePlayer, playerVersion);
  useSyncExternalStore(subscribeSettings, getSettings);
  const [details, setDetails] = useState(false);
  const [celebrated, setCelebrated] = useState<Finished>(); // the take whose celebration was closed
  const [secs, setSecs] = useState(0); // time spent playing this item
  const [, setVersion] = useState(0);

  const p = progressOf(lesson);
  const oneTake = role === 'warmup' || role === 'review';
  const stepIdx = oneTake ? lesson.steps.length - 1 : Math.min(p.step, lesson.steps.length - 1);
  const step = lesson.steps[stepIdx];
  const bpm = oneTake ? Math.max(step.bpm.start, p.bestBpm || step.bpm.target) : p.bpm;
  const fresh = !getSettings().lessons[lesson.id];
  const mine = player.options?.lesson?.id === lesson.id;
  const playing = mine && player.phase === 'playing';
  const f = mine && player.phase === 'done' ? player.finished : undefined;
  const outcome = f && outcomes.get(f);

  // Judge each finished take once: pass check, tempo ladder or review, save the run.
  useEffect(() => subscribePlayer(() => {
    const f = player.finished;
    if (player.phase !== 'done' || !f || f.options.lesson?.id !== lesson.id || outcomes.has(f)) return;
    const check = checkPass(f.stats, step.pass);
    const p = progressOf(lesson);
    let o: Outcome;
    if (oneTake) {
      if (role === 'review') saveProgress(lesson.id, afterReview(p, check.ok, today()));
      o = { passed: check.ok, itemDone: true, text: check.ok ? `${f.stats.accuracy}% · still solid.` : `${check.reason} It comes back tomorrow.` };
    } else {
      const { next, event } = ladderStep(p, lesson, check.ok, today());
      const stars = event === 'lessonDone' ? starsFor(f.stats) : undefined;
      saveProgress(lesson.id, stars ? { ...next, stars: Math.max(p.stars ?? 0, stars) } : next);
      // Rank up: this was the last open checkpoint of its stage.
      const stage = MILESTONES.find(m => m.checkpoints.includes(lesson.id)), s = getSettings();
      const rankUp = event === 'lessonDone' && !p.completedAt && !!stage && checkpointsOf(stage, allLessons(), s.profile).every(l => s.lessons[l.id]?.completedAt);
      const msg: Record<LadderEvent, string> = {
        hold: check.ok ? `Clean take (${next.clean}/${CLEAN_TAKES}). Once more at ${next.bpm} BPM.` : `${check.reason}`,
        up: `Two clean takes. Up to ${next.bpm} BPM!`,
        slowDown: `${check.reason} Let's slow down to ${next.bpm} BPM and lock it in.`,
        stepDone: `Step done! Next: ${lesson.steps[next.step].title}.`,
        lessonDone: `Lesson complete at ${next.bestBpm} BPM, ${stars} star${stars === 1 ? '' : 's'}!${rankUp ? ` Rank up: you're now a ${stage!.rank}!` : ''} It will come back for review in a few days.`,
      };
      o = { passed: check.ok, event, reason: check.reason, text: (check.ok ? 'Pass. ' : 'Not yet. ') + msg[event], itemDone: event === 'stepDone' || event === 'lessonDone', stars, rankUp };
    }
    outcomes.set(f, o);
    // The coach builds the path: once a lesson is done, it writes the next one in the background (unless one is waiting).
    if (o.event === 'lessonDone' && !allLessons().some(l => l.source === 'ai' && !getSettings().lessons[l.id]?.completedAt))
      requestCoachLesson(`after-${lesson.id}-${f.startedAt}`);
    if (getSettings().voice) void say(o.text);
    coachTake(f, { lesson: lesson.title, step: step.title, passed: check.ok, verdict: o.text, tempoNow: getSettings().lessons[lesson.id]?.bpm, target: step.bpm.target });
    if (o.itemDone) onItemDone?.();
    saveRun(f, { passed: check.ok });
    setSecs(s => s + f.durationS);
    setVersion(v => v + 1);
  }), [lesson, step, oneTake, role, onItemDone]);
  useEffect(() => () => stop(), []);

  const options = (demo: boolean): PlayOptions => ({
    fromBar: 1, toBar: step.chart.bars, repeats: Math.max(1, Math.round(4 / step.chart.bars)),
    speed: bpm / step.chart.bpm, metronome: true, subdivision: 1, countInBars: 1, wait: false,
    activeLanes: step.activeLanes, demo, gapBars: demo ? undefined : step.gapBars, count: lesson.level <= 1,
    lesson: { id: lesson.id, step: stepIdx + 1, title: lesson.title, goal: step.text },
  });
  const play = (demo: boolean, atBpm = bpm) => { setDetails(false); start(step.chart, { ...options(demo), speed: atBpm / step.chart.bpm }); };
  // The coach's suggested next step (a tap on its button, or "yes"): again / slower / faster here, next = next item.
  useEffect(() => onCoachAction(a => {
    if (a.kind === 'next') { onNext?.(); return !!onNext; }
    const cur = progressOf(lesson).bpm;
    const want = a.bpm ?? (a.kind === 'slower' ? cur - 5 : a.kind === 'faster' ? cur + 5 : cur);
    const nb = oneTake ? bpm : Math.max(step.bpm.start, Math.min(step.bpm.target, Math.round(want)));
    if (!oneTake && nb !== cur) saveProgress(lesson.id, { ...progressOf(lesson), bpm: nb });
    play(false, nb);
    return true;
  }));
  const timeUp = minutes !== undefined && secs >= minutes * 60;
  const itemDone = outcome?.itemDone || timeUp;
  const helpKey = f && outcome && !outcome.passed ? `help-${lesson.id}-${f.startedAt}` : null;
  const help = useCoachEntry<{ title: string }>(helpKey);
  const askHelp = () => f && helpKey && requestCoachLesson(helpKey, { lessonId: lesson.id, step: stepIdx + 1, reason: outcome?.reason ?? '', run: summarizeRun(f) });

  if (f && details) return <Results f={f} onAgain={() => play(false)} onBack={() => setDetails(false)} />;

  const stage = MILESTONES.find(m => m.checkpoints.includes(lesson.id)) ?? MILESTONES.find(m => m.level === lesson.level);
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
          {step.activeLanes && step.chart.notes.some(n => !step.activeLanes!.includes(n.drum)) && <p className="small">You play: {step.activeLanes.map(laneName).join(', ')}. The app plays the rest (dimmed).</p>}
          {step.gapBars && <p className="small">The click goes silent every {step.gapBars === 2 ? 'other' : `${step.gapBars}th`} bar.</p>}
          <details><summary>Notation</summary><SheetMusic notes={step.chart.notes} timeSignature={step.chart.timeSignature} /></details>
        </div>
        {outcome && (
          <div className={`card verdict ${outcome.passed ? 'pass' : 'fail'}`} aria-live="polite">
            <p>{outcome.text}</p>
            {timeUp && !outcome.itemDone && <p className="small">That's your {minutes} minutes for this one. Move on, or keep going if you're in the zone.</p>}
            <button className="link" onClick={() => setDetails(true)}>Details and coach</button>
            {helpKey && (help?.status === 'thinking' ? <Thinking what="Your coach is writing a lesson for this" />
              : help?.status === 'done' ? <p className="small">Your coach wrote "{help.data?.title}". It's on Journey.</p>
              : <>{help?.status === 'error' && <p className="warn">{help.error}</p>}
                <button className="link" onClick={askHelp}>Ask the coach for a lesson that fixes this</button></>)}
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
      <section className="highwayWrap"><NotesView idle={{ chart: step.chart, bpm, goal: step.text }} /></section>
    </div>
  );
}

const LANE_NAMES: Record<string, string> = { hihat: 'hi-hat', hhOpen: 'open hi-hat', hhPedal: 'hi-hat foot', tom1: 'tom 1', tom2: 'tom 2', floor: 'floor tom' };
const laneName = (d: string) => LANE_NAMES[d] ?? d;
