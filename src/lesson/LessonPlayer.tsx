import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Thinking, useCoachEntry } from '../coach/api';
import { summarizeRun } from '../coach/summary';
import { worstBars } from '../engine/scoring';
import { beatsPerBar } from '../engine/chart';
import { freeBarStats } from '../engine/jam';
import { afterReview, checkPass, CLEAN_TAKES, copyChart, countPlan, toolOf, goodMsFor, ladderStep, lanesNow, MIN_BPM, starsFor, startProgress, type LadderEvent } from '../engine/lesson';
import { checkpointsOf } from '../engine/planner';
import { LESSON_BY_ID, MILESTONES } from '../content/curriculum';
import { Celebration, flourish } from './Celebration';
import type { SessionRole } from '../engine/planner';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { NotesView } from '../play/NotesView';
import { KitView } from '../ui/KitView';
import { player, playerVersion, start, stop, subscribePlayer, type Finished, type PlayOptions } from '../play/player';
import { LatencyHint, Results, saveRun } from '../play/Results';
import { takeChart } from '../engine/transcribe';
import { requestSong } from '../ui/nav';
import { SheetMusic } from '../notation';
import { say } from '../voice/voice';
import { canRunAction, coachTake, dropCoachAction, onCoachAction, runAction, useCoach } from '../coach/session';
import { stepIcon, TOOL_LABEL } from './tools';
import { CoachLine, LiveHint, Move } from '../play/AtKit';
import { allLessons, deleteCoachLesson, lessonById, requestCoachLesson } from './aiLessons';
import { progressOf, resetLesson, saveProgress, today } from './state';

const ROLE: Record<SessionRole, string> = { warmup: 'Warm-up', review: 'Review', skill: 'New skill', groove: 'Groove', record: 'Beat your best' };
// text: the full verdict (spoken, sent to the coach); say: the short line for the screen; nums: the result card.
type Nums = { landed: number; total: number; streak: number; recoveries: number; onBeat?: number; better: boolean };
type Outcome = { passed: boolean; text: string; say?: string; nums?: Nums; reason?: string; fixBar?: number; zoomed?: boolean; event?: LadderEvent; itemDone: boolean; stars?: number; rankUp?: boolean };
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
  // Built once per step: a new chart object each render would redraw the sheet on every update.
  const { chart, free } = useMemo(() => {
    const base = step.copy || step.trade ? copyChart(step.chart) : step.chart;
    const free = step.trade ? Array.from({ length: step.chart.bars }, (_, i) => 2 * i + 2) : step.freeBars ?? []; // trade: every echo bar is yours
    return { free, chart: free.length ? { ...base, notes: base.notes.filter(n => !free.includes(Math.floor(n.t / beatsPerBar(base) + 1e-6) + 1)) } : base };
  }, [step]);

  // Judge each finished take once: pass check, tempo ladder or review, save the run.
  useEffect(() => subscribePlayer(() => {
    const f = player.finished;
    if (player.phase !== 'done' || !f || f.options.lesson?.id !== lesson.id || outcomes.has(f)) return;
    // Wait mode is for learning the pattern: no verdict, no ladder, not saved.
    if (f.options.wait) { const t = 'Nice and slow. When it feels easy, play it with the click.'; outcomes.set(f, { passed: false, itemDone: false, text: t, say: t }); setVersion(v => v + 1); return; }
    const p0 = progressOf(lesson);
    // A step's extra limits (flams, timing) are for the full groove, not its first layers.
    const fs = freeBarStats(f.hits, f.extras, { zero: f.zero, beatMs: 60000 / (f.chart.bpm * f.options.speed), beatsPerBar: beatsPerBar(f.chart), fromBar: f.options.fromBar, sectionBars: f.options.toBar - f.options.fromBar + 1 }, free);
    const st = fs ? { ...f.stats, extra: f.stats.extra - fs.extras } : f.stats; // strokes in your own bars aren't extras
    const check = checkPass(st, recordStreak ? { ...step.pass, streak: recordStreak } : step.layers && (p0.layer ?? 0) < step.layers.length - 1 ? undefined : step.pass, lesson.level);
    // A zoom loop is practice for the next real take: no ladder, not saved.
    if (f.options.zoom) {
      const again = `Now the whole thing again at ${progressOf(lesson).bpm} BPM.`;
      outcomes.set(f, { passed: check.ok, itemDone: false, zoomed: true, text: `Bar ${f.options.zoom}, four times: ${f.stats.total - f.stats.miss} of ${f.stats.total} notes landed. ${again}`, say: `Bar ${f.options.zoom} sounds better. ${again}`,
        nums: { landed: f.stats.total - f.stats.miss, total: f.stats.total, streak: f.stats.streak, recoveries: f.stats.recoveries, better: false } });
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
    const nums: Nums = { landed: st.total - st.miss, total: st.total, streak: st.streak, recoveries: st.recoveries, onBeat: fs?.stats.hits ? fs.stats.onGridPct : undefined, better: prev !== undefined && st.accuracy > prev + 2 };
    let o: Outcome;
    if (oneTake) {
      if (role === 'review') saveProgress(lesson.id, afterReview(p, check.ok, today()));
      if (role === 'record') {
        if (check.ok) { saveProgress(lesson.id, recordStreak ? { ...p, bestStreak: recordStreak } : { ...p, bestBpm: bpm }); flourish(false); }
        const say = check.ok ? `🏆 NEW RECORD: ${recordStreak ? `${recordStreak} in a row` : `${bpm} BPM`}!` : 'Not this time. Your record stays, try again any day.';
        o = { passed: check.ok, itemDone: true, nums, say, text: `${say} ${landed}` };
      } else { const say = check.ok ? 'Still solid.' : "We'll come back to this one tomorrow."; o = { passed: check.ok, itemDone: true, nums, say, text: `${landed} ${say}` }; }
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
      o = { passed: ok, event, nums, say: `${ok ? 'Nice! ' : nums.recoveries >= 3 ? 'Nice comebacks! ' : ''}${msg[event]}`, reason: ok ? undefined : check.reason, fixBar: ok ? undefined : sticky[0], text: `${ok ? 'Nice! ' : ''}${landed.trim()} ${msg[event]}`, itemDone: event === 'stepDone' || event === 'lessonDone', stars, rankUp };
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
  const laneKey = lanes?.join();
  // The idle sheet: notes with their index, greyed where the app plays them (other lanes, copy-me calls).
  const idleSheet = useMemo(() => {
    const notes = chart.notes.map((n, i) => ({ ...n, i }));
    return { chart: { ...chart, notes }, dim: (i: number) => !!notes[i].auto || (!!lanes && !lanes.includes(notes[i].drum)) };
  }, [chart, laneKey]); // eslint-disable-line react-hooks/exhaustive-deps -- lanes by value
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'h' && !(e.target instanceof HTMLInputElement)) setSettings({ hints: getSettings().hints === false }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const options = (demo: boolean, wait = false): PlayOptions => ({
    // Short takes so a rough one is over quickly: 4 bars; 8 for the proving take (last step at its target tempo),
    // a jam (long enough to enjoy) and copy-me (4 calls and 4 echoes).
    fromBar: 1, toBar: chart.bars, repeats: Math.max(1, Math.ceil((step.copy || step.trade || step.jam || (stepIdx === lesson.steps.length - 1 && bpm >= step.bpm.target) ? 8 : 4) / chart.bars)),
    speed: bpm / chart.bpm, metronome: true, subdivision: 1, countInBars: 1, wait,
    countAloud: step.countAloud && countPlan(16, beatsPerBar(chart), step.countAloud),
    activeLanes: lanes, demo, gapBars: demo ? undefined : step.gapBars, count: lesson.level <= 1, goodMs: goodMsFor(lesson.level), hints: getSettings().hints !== false,
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

  // The moves, each with its kit gesture (engine/padCommands.ts). The main one is also "yes" (hi-hat pedal × 3, crash × 2).
  const coach = useCoach(), opened = useRef(Date.now()).current;
  const fresh2 = coach.reply && coach.at > Math.max(opened, f ? Date.parse(f.startedAt) : 0) ? coach.reply : undefined; // the coach's answer to this take
  const goNext = onNext ?? onBack;
  const main: { label: string; run: () => void } =
    fresh2?.action && canRunAction(fresh2.action) ? { label: fresh2.action.label, run: () => void runAction(fresh2.action!) }
    : outcome?.fixBar && !outcome.zoomed ? { label: `🔍 Fix bar ${outcome.fixBar}`, run: () => zoomIn(outcome.fixBar!) }
    : itemDone && (oneTake || outcome?.event === 'lessonDone') ? { label: onNext ? 'Next ▶' : '← Journey', run: goNext }
    : { label: outcome ? '▶ Again' : '▶ Play', run: () => play(false) };
  const listen = () => (f && f.hits.length ? hearTake(f) : play(true));
  const slower = () => (oneTake ? play(false, bpm, true) : runAction({ kind: 'slower', label: 'Slower' }));
  useEffect(() => onCoachAction(a => {
    if (a.kind === 'main') { main.run(); return true; }
    if (a.kind === 'listen') { listen(); return true; }
    return false;
  }));

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

  const hints = getSettings().hints !== false;
  const layer = step.layers && !oneTake ? Math.min(p.layer ?? 0, step.layers.length - 1) : undefined;
  const dots = step.layers && !oneTake ? step.layers.map((_, i) => (i < layer! ? 'done' : i === layer ? 'on' : ''))
    : lesson.steps.map((_, i) => (i < stepIdx || p.completedAt ? 'done' : i === stepIdx ? 'on' : ''));
  const toTarget = Math.max(0, Math.min(1, (bpm - step.bpm.start) / Math.max(1, step.bpm.target - step.bpm.start)));
  const line = fresh2?.say ?? (coach.status === 'thinking' && f ? '…' : outcome?.say ?? step.text);
  const howHint = lesson.how.split(/(?<=\.)\s/)[0];

  return (
    <div className={`lessonScreen ${playing ? 'playing' : ''}`}>
      {celebration}
      <div className="lbar card">
        <button className="link back" onClick={() => { stop(); onBack(); }}>← Journey</button>
        <h2>{lesson.title}</h2>
        <span className="toolBadge">{stepIcon(step, lesson.kind)} {(role ? ROLE[role] : TOOL_LABEL[toolOf(step)]).toUpperCase()}</span>
        {dots.length > 1 && <span className="stepDots" aria-label={layer !== undefined ? `Layer ${layer + 1} of ${dots.length}` : `Step ${stepIdx + 1} of ${dots.length}`}>{dots.map((d, i) => <i key={i} className={d} />)}</span>}
        <span className="bigTempo">{bpm} <small>BPM{!oneTake && ` → ${step.bpm.target}`}</small>{!oneTake && <span className="meter"><b style={{ width: `${toTarget * 100}%` }} /></span>}</span>
        <button className={`hintToggle ${hints ? 'on' : ''}`} aria-pressed={hints} onClick={() => setSettings({ hints: !hints })} title="Show the count and which hand or foot plays each note (key H)">💡 Hints {hints ? 'on' : 'off'}</button>
      </div>

      {playing ? <LiveHint /> : <>
        <CoachLine line={line} />
        <div className="moves">
          <Move go label={main.label} onClick={main.run} />
          <Move label={f && f.hits.length ? '🎧 Hear your take' : '👂 Hear it'} gesture="tom 2 × 2" onClick={listen} />
          <Move alt label={`🐢 ${oneTake || p.bpm <= MIN_BPM ? 'Learn it slowly' : 'Slower'}`} gesture="floor × 2" onClick={slower} />
          <Move alt label={`⏭ ${onNext ? 'Skip to next' : 'Journey'}`} gesture="ride × 2" onClick={() => { stop(); goNext(); }} />
        </div>
      </>}

      <div className="lessonMain">
        <section className="lessonMusic">
          {playing && <button className="primary big stopBtn" onClick={stop}>Stop <small>(crash × 4, Esc)</small></button>}
          <NotesView idle={{ chart: idleSheet.chart, bpm, goal: step.text, hints, dim: idleSheet.dim, zoom: 1.6 }} />
          {hints && <p className="hintLegend">R right hand · L left hand · K kick · H hi-hat foot</p>}
        </section>
        {!playing && <aside className="lessonSide">
          {outcome?.nums ? <div className={`card result ${outcome.passed ? 'pass' : ''}`}>
            <div className="nums">
              {outcome.nums.total > 0 && <div><b>{outcome.nums.landed}/{outcome.nums.total}</b><span>landed</span></div>}
              {outcome.nums.total > 0 && <div><b>{outcome.nums.streak}</b><span>in a row</span></div>}
              {outcome.nums.onBeat !== undefined && <div><b>{outcome.nums.onBeat}%</b><span>on the beat</span></div>}
              {outcome.nums.total > 0 && <div><b>{outcome.nums.recoveries}</b><span>comebacks</span></div>}
            </div>
            {outcome.reason && <p className="tip">💡 {outcome.reason}</p>}
            <p className="small">{outcome.nums.better ? '↑ better than last take · ' : ''}{!oneTake && !step.jam && (layer === undefined || layer === step.layers!.length - 1) ? `${p.clean} of ${CLEAN_TAKES} clean takes at ${p.bpm} BPM` : ''}</p>
            {f && <LatencyHint f={f} />}
            {f && f.hits.length > 0 && <button className="link" onClick={() => play(true)}>👂 Hear it right</button>}
          </div> : <div className="card">
            <p><b>{lesson.what}</b></p>
            {layer !== undefined && <p>Layer {layer + 1} of {step.layers!.length}: a clean take adds {laneName(step.layers![layer + 1]?.find(d => !step.layers![layer].includes(d)) ?? 'speed')}.</p>}
            {hints && <p className="hintcard">💡 <b>Hint:</b> {howHint}</p>}
            <details open={fresh}><summary>Why and how</summary><p>{lesson.why}</p><p>{lesson.how}</p></details>
          </div>}
          {step.bite && <div className="card"><p>🎵 Bars {step.bite.fromBar}–{step.bite.toBar} of <b>{step.bite.title ?? 'your song'}</b></p><button onClick={() => requestSong(step.bite!.songId, { from: step.bite!.fromBar, to: step.bite!.toBar })}>Play it with the song →</button></div>}
          {(step.trade || free.length > 0 || step.pass?.streak || step.gapBars || (lanes && step.chart.notes.some(n => !lanes.includes(n.drum)))) && <div className="card small">
            {step.trade && <p>Trade bars: I play a bar, you answer with anything. No wrong notes, just stay on the beat.</p>}
            {!step.trade && free.length > 0 && <p>Bar {free.join(' and ')} is yours: play any fill you like.</p>}
            {step.pass?.streak && <p>Challenge: {recordStreak ?? step.pass.streak} notes in a row. Missed one? The count just starts again.</p>}
            {lanes && step.chart.notes.some(n => !lanes.includes(n.drum)) && <p>You play: {lanes.map(laneName).join(', ')}. The app plays the rest (grey).</p>}
            {step.gapBars && <p>The click goes silent every {step.gapBars === 2 ? 'other' : `${step.gapBars}th`} bar.</p>}
          </div>}
          <div className="lessonKit"><KitView /></div>
          <div className="actions small">
            {timeUp && !outcome?.itemDone && <span>That's your {minutes} minutes for this one.</span>}
            {f && <button className="link" onClick={() => setDetails(true)}>Details and history</button>}
            {helpKey && (help?.status === 'thinking' ? <Thinking what="Your coach is writing something different" />
              : help?.status === 'done' ? <>Your coach wrote "{help.data?.title}". {onOpen && help.data?.id && <button className="link" onClick={() => onOpen(help.data!.id)}>Open it</button>}</>
              : <>{help?.status === 'error' && <span className="warn">{help.error}</span>}<button className="link" onClick={askHelp}>Ask the coach for something different</button></>)}
            {lesson.source === 'ai' && <button className="link danger" onClick={() => { if (confirm(`Delete the coach's lesson "${lesson.title}"?`)) { stop(); void deleteCoachLesson(lesson.id).then(onBack); } }}>Delete this lesson</button>}
            {!fresh && !oneTake && <button className="link" onClick={() => { if (confirm(`Reset "${lesson.title}" to step 1 at the starting tempo? Your saved runs stay in Trophies.`)) { stop(); resetLesson(lesson.id); } }}>Reset this lesson</button>}
          </div>
        </aside>}
      </div>
    </div>
  );
}

const LANE_NAMES: Record<string, string> = { hihat: 'hi-hat', hhOpen: 'open hi-hat', hhPedal: 'hi-hat foot', tom1: 'tom 1', tom2: 'tom 2', floor: 'floor tom' };
const laneName = (d: string) => LANE_NAMES[d] ?? d;
