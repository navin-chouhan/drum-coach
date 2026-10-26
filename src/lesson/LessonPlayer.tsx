import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Thinking, useCoachEntry } from '../coach/api';
import { summarizeRun } from '../coach/summary';
import { cleanBars, worstBars } from '../engine/scoring';
import { beatsPerBar } from '../engine/chart';
import { freeBarStats, inFreeBar, takeDrift } from '../engine/jam';
import { afterReview, autoProbe, floorLine, lateNote, proveOnAnotherDay, type LessonProgress, nextStepInfo, checkPass, CLEAN_TAKES, countPlan, passFor, pickVariant, probeTempo, playChart, recordTarget, toolOf, goodMsFor, ladderStep, lanesNow, MIN_BPM, starsFor, startProgress, type LadderEvent } from '../engine/lesson';
import { checkpointsOf, studentRead } from '../engine/planner';
import { praise } from '../engine/greeting';
import { bandFor } from '../engine/band';
import { LESSON_BY_ID, MILESTONES } from '../content/curriculum';
import { Celebration, flourish } from './Celebration';
import type { SessionRole } from '../engine/planner';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { NotesView } from '../play/NotesView';
import { KitView } from '../ui/KitView';
import { player, playerVersion, start, stop, subscribePlayer, type Finished, type PlayOptions } from '../play/player';
import { LatencyHint, Results, saveRun } from '../play/Results';
import { fillFromTake, takeChart } from '../engine/transcribe';
import { hearFill, keepFill } from '../play/fills';
import { requestSong } from '../ui/nav';
import { SheetMusic } from '../notation';
import { hush, say, voiceEngine } from '../voice/voice';
import { onHit } from '../input/hits';
import { canRunAction, coachLine, coachTake, screenAction, dropCoachAction, onCoachAction, replyFor, runAction, thinkingAbout, useCoach } from '../coach/session';
import { stepIcon, TOOL_LABEL } from './tools';
import { CoachLine, FlowMeter, LiveHint, Move } from '../play/AtKit';
import { IntroSlides } from '../play/IntroSlides';
import { SelfCheck } from '../ui/SelfCheck';
import { EarQuiz } from './EarQuiz';
import { TechniqueDemo } from '../ui/TechniqueDemo';
import { allLessons, deleteCoachLesson, lessonById, requestCoachLesson } from './aiLessons';
import { progressOf, resetLesson, saveProgress, today } from './state';

const ROLE: Record<SessionRole, string> = { warmup: 'Warm-up', review: 'Review', skill: 'New skill', groove: 'Groove', record: 'Beat your best' };
// text: the full verdict (spoken, sent to the coach); say: the short line for the screen; nums: the result card.
type Nums = { landed: number; total: number; streak: number; recoveries: number; onBeat?: number; better: boolean };
type Outcome = { passed: boolean; text: string; say?: string; slowly?: boolean; again?: boolean; nums?: Nums; reason?: string; fixBar?: number; zoomed?: boolean; event?: LadderEvent; itemDone: boolean; stars?: number; rankUp?: boolean };
// again: a finished lesson played through again (no second celebration)
const outcomes = new WeakMap<Finished, Outcome>(); // one outcome per take, survives StrictMode re-runs
let probeExplained = false; // the probe's sentence once per session; afterwards just the number
/** Clean takes a step needs at one tempo: a streak challenge is done on its first pass. */
const cleanNeeded = (s: { pass?: { streak?: number } }) => (s.pass?.streak ? 1 : CLEAN_TAKES);
const cleanCount = (clean: number, need: number, bpm: number) =>
  `${clean} of ${need} clean take${need === 1 ? '' : 's'} at ${bpm} BPM${need > 1 ? ' (one ★★★ take counts as both)' : ''}`;

/**
 * One lesson: what/why/how, then each step with Hear it → Play → one-line verdict → tempo ladder.
 * Warm-up and review items are a single take at the lesson's best tempo.
 */
export function LessonPlayer(props: Parameters<typeof Lesson>[0]) {
  return lessonById(props.lessonId) ? <Lesson {...props} />
    : <div className="today"><div className="card"><p>This lesson no longer exists.</p><button onClick={props.onBack}>Back to Journey</button></div></div>;
}

function Lesson({ lessonId, role, minutes, onNext, onBack, onItemDone, onOpen, flow, arcade }: {
  lessonId: string; role?: SessionRole; minutes?: number; onNext?: () => void; onBack: () => void; onItemDone?: () => void; onOpen?: (id: string) => void;
  flow?: boolean; // flow mode: the groove loops until you stop, the click fades out, nothing to pass
  arcade?: boolean; // beat the clock: 2 minutes at your best tempo, score = clean bars
}) {
  const lesson = lessonById(lessonId)!;
  useSyncExternalStore(subscribePlayer, playerVersion);
  useSyncExternalStore(subscribeSettings, getSettings);
  const [details, setDetails] = useState(false);
  const [checking, setChecking] = useState(false); // the camera self-check (R5)
  const [celebrated, setCelebrated] = useState<Finished>(); // the take whose celebration was closed
  const [secs, setSecs] = useState(0); // time spent playing this item
  const [, setVersion] = useState(0);
  const lastTake = useRef<Finished>(undefined);
  const probing = useRef<{ tempo: number; accs: number[] }>(undefined), probed = useRef<number>(undefined), probeTimer = useRef<ReturnType<typeof setTimeout>>(undefined); // find your tempo
  const [kept, setKept] = useState(new Set<string>()); // fills kept from a take: `${startedAt}/${bar}`
  const [engine, setEngine] = useState<'piper' | 'browser'>();
  useEffect(() => { void voiceEngine().then(setEngine); }, []);
  const lastAccuracy = useRef<number>(undefined); // for "better than last take"
  const stickyBar = useRef<number>(undefined); // the bar most notes slipped in, last take (for the coach's "zoom")
  const introShown = useRef(new Map<string, number>()); // step/layer → the tempo its intro slides were shown at

  const p = progressOf(lesson);
  const oneTake = role === 'warmup' || role === 'review' || role === 'record';
  const stepIdx = oneTake ? lesson.steps.length - 1 : Math.min(p.step, lesson.steps.length - 1);
  const step = lesson.steps[stepIdx];
  // Beat your best: a streak challenge asks for 4 more in a row than your best, anything else 5 BPM above it.
  const recordStreak = role === 'record' ? recordTarget(step, p) : undefined;
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
  // Shuffle the phrases: a new variant is picked when a real take starts (the sheet keeps the played one until then).
  const [takeNo, setTakeNo] = useState(0);
  const seedBase = useRef(p.clean + p.fails + p.step * 7).current;
  const chartFor = (n: number) => playChart(step.variants?.length ? { ...step, chart: { ...[step.chart, ...step.variants][pickVariant(step.variants.length + 1, n + seedBase)], id: step.chart.id } } : step);
  const { chart, freeBars: free } = useMemo(() => chartFor(takeNo), [step, takeNo]); // eslint-disable-line react-hooks/exhaustive-deps -- chartFor reads step
  const stitchedSong = lesson.id.startsWith('song-yt-'); // "Stitch the song" (aiLessons.ts), not the built-in song lessons

  // Judge each finished take once: pass check, tempo ladder or review, save the run.
  useEffect(() => subscribePlayer(() => {
    const f = player.finished;
    if (player.phase !== 'done' || !f || f.options.lesson?.id !== lesson.id || outcomes.has(f)) return;
    // Wait mode is for learning the pattern: no verdict, no ladder, not saved.
    if (f.options.wait) { const t = 'Nice and slow. When it feels easy, play it with the click.'; outcomes.set(f, { passed: false, itemDone: false, text: t, say: t }); setVersion(v => v + 1); return; }
    const p0 = progressOf(lesson);
    // A step's extra limits (flams, timing) are for the full groove, not its first layers.
    const fs = freeBarStats(f.hits, f.extras, { zero: f.zero, beatMs: 60000 / (f.chart.bpm * f.options.speed), beatsPerBar: beatsPerBar(f.chart), fromBar: f.options.fromBar, sectionBars: f.options.toBar - f.options.fromBar + 1 }, free);
    const st = f.stats; // strokes in your own bars never became extras (the player knows the free bars)
    const check = checkPass(st, recordStreak ? { ...step.pass, streak: recordStreak } : step.layers && (p0.layer ?? 0) < step.layers.length - 1 ? undefined : step.pass, lesson.level, fs?.stats);
    // A zoom loop is practice for the next real take: no ladder, not saved.
    // Beat the clock: clean bars in 2 minutes, best kept per lesson.
    if (f.options.seconds) {
      const score = cleanBars(f.run, f.results, f.extras.map(h => (h.time - f.zero) / (60000 / (f.chart.bpm * f.options.speed))));
      const best = getSettings().arcade?.[lesson.id] ?? 0;
      if (score > best) { setSettings({ arcade: { ...getSettings().arcade, [lesson.id]: score } }); flourish(false); }
      const say = score > best ? `🏆 ${score} clean bars! New best.` : `${score} clean bars. Your best is ${best}.`;
      outcomes.set(f, { passed: true, itemDone: false, zoomed: true, text: say, say, nums: { landed: f.stats.total - f.stats.miss, total: f.stats.total, streak: f.stats.streak, recoveries: f.stats.recoveries, better: false } });
      saveRun(f, { passed: true });
      setVersion(v => v + 1); return;
    }
    // Find your tempo: each clean bar goes 5 BPM faster; the first rough one sets the working tempo 10 below it.
    if (f.options.probe && probing.current) {
      const pr = probing.current, pass = passFor(lesson.level).accuracy;
      pr.accs.push(f.stats.accuracy);
      if (f.stats.accuracy >= pass && pr.tempo < step.bpm.target) {
        pr.tempo = Math.min(step.bpm.target, pr.tempo + 5);
        outcomes.set(f, { passed: true, itemDone: false, zoomed: true, text: `Clean. ${pr.tempo}…`, say: `Clean! Now ${pr.tempo}…` });
        probeTimer.current = setTimeout(probeBar, 0);
      } else {
        const working = probeTempo(pr.accs, step.bpm.start, pass, step.bpm.target);
        probing.current = undefined; probed.current = stepIdx;
        saveProgress(lesson.id, { ...progressOf(lesson), bpm: working, clean: 0, fails: 0 });
        // The probe's tempo jump isn't a reason to show slides already seen (a first-time step still gets them).
        const key = `${stepIdx}/${p0.layer ?? 0}`;
        if (introShown.current.has(key)) introShown.current.set(key, working);
        const say = probeExplained ? `Your tempo: ${working} BPM.` : `Your tempo today: ${working} BPM. That's where we practise.`;
        probeExplained = true;
        outcomes.set(f, { passed: true, itemDone: false, zoomed: true, text: say, say });
      }
      setVersion(v => v + 1); return;
    }
    // Flow: however long you played, it counts; no ladder.
    if (f.options.endless) {
      const bars = Math.round(f.run.beats / f.run.beatsPerBar), say = bars ? `${bars} bar${bars === 1 ? '' : 's'} in the flow. Nice.` : 'Whenever you are ready, just play.';
      outcomes.set(f, { passed: true, itemDone: false, zoomed: true, text: say, say, nums: { landed: f.stats.total - f.stats.miss, total: f.stats.total, streak: f.stats.streak, recoveries: f.stats.recoveries, better: false } });
      saveRun(f, { passed: true });
      setVersion(v => v + 1); return;
    }
    // A one-off take the coach asked for (trade, count along, one limb): for fun, no ladder.
    if (f.options.oneOff) {
      const fsx = freeBarStats(f.hits, f.extras, { zero: f.zero, beatMs: 60000 / (f.chart.bpm * f.options.speed), beatsPerBar: beatsPerBar(f.chart), fromBar: f.options.fromBar, sectionBars: f.options.toBar - f.options.fromBar + 1 }, f.options.freeBars ?? []);
      // (a take with no notes of yours isn't saved: saveRun skips empty scored runs)
      const say = fsx ? (fsx.stats.hits ? `Your bars: ${fsx.stats.onGridPct}% on the beat.` : 'Your bars were empty: play anything you like in them.') : `One for fun: ${f.stats.total - f.stats.miss} of ${f.stats.total} notes landed.`;
      outcomes.set(f, { passed: true, itemDone: false, zoomed: true, text: say, say: `${say} Back to the lesson when you're ready.`,
        nums: { landed: f.stats.total - f.stats.miss, total: f.stats.total, streak: f.stats.streak, recoveries: f.stats.recoveries, onBeat: fsx?.stats.hits ? fsx.stats.onGridPct : undefined, better: false } });
      saveRun(f, { passed: true });
      setVersion(v => v + 1); return;
    }
    if (f.options.zoom) {
      const again = `Now the whole thing again at ${progressOf(lesson).bpm} BPM.`;
      outcomes.set(f, { passed: check.ok, itemDone: false, zoomed: true, text: `Bar ${f.options.zoom}, four times: ${f.stats.total - f.stats.miss} of ${f.stats.total} notes landed. ${again}`, say: `Bar ${f.options.zoom} ${check.ok ? 'sounds better' : 'is getting there'}. ${again}`, // only praise it when it passed
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
    // Ranks are proven on another day: a finished lesson passed again at its target, on a later day (R7).
    const atTarget = check.ok && stepIdx === lesson.steps.length - 1 && f.chart.bpm * f.options.speed >= step.bpm.target - 0.5;
    const prove = (x: LessonProgress) => proveOnAnotherDay(x, atTarget, today());
    if (oneTake) {
      if (role === 'review') saveProgress(lesson.id, prove(afterReview(p, check.ok, today())));
      if (role === 'record') {
        if (check.ok) { saveProgress(lesson.id, prove(recordStreak ? { ...p, bestStreak: recordStreak } : { ...p, bestBpm: bpm })); flourish(false); }
        const say = check.ok ? `🏆 NEW RECORD: ${recordStreak ? `${recordStreak} in a row` : `${bpm} BPM`}!` : 'Not this time. Your record stays, try again any day.';
        o = { passed: check.ok, itemDone: true, nums, say, text: `${say} ${landed}` };
      } else { const say = check.ok ? 'Still solid.' : "We'll come back to this one tomorrow."; o = { passed: check.ok, itemDone: true, nums, say, text: `${landed} ${say}` }; }
    } else {
      // Your own bars count however you fill them, but they have to be filled: a silent answer isn't a take.
      const emptyBars = !!fs && !fs.stats.hits;
      // Every note landed and only the timing (or volume) failed: slower won't fix it, so the tempo holds.
      const notesLanded = st.accuracy >= Math.min(passFor(lesson.level).accuracy, step.pass?.accuracy ?? 100);
      const { next, event } = emptyBars ? { next: p, event: 'hold' as const } : ladderStep(p, lesson, check.ok, today(), st.accuracy, check.ok && starsFor(st) === 3, notesLanded);
      const stars = event === 'lessonDone' ? starsFor(f.stats) : undefined;
      // The checkpoint this lesson proves (itself, or the one a coach lesson stands in for) was it already passed?
      const provedBefore = !!getSettings().lessons[lesson.checkpoint ?? lesson.id]?.completedAt;
      saveProgress(lesson.id, prove(stars ? { ...next, stars: Math.max(p.stars ?? 0, stars) } : next));
      // A coach lesson standing in for a checkpoint passes it; the checkpoint itself comes back for review.
      const cp = lesson.checkpoint && LESSON_BY_ID[lesson.checkpoint];
      if (event === 'lessonDone' && cp && !getSettings().lessons[cp.id]?.completedAt)
        saveProgress(cp.id, { ...startProgress(cp), bestBpm: next.bestBpm, completedAt: next.completedAt, reviewDue: next.reviewDue, stars });
      // Rank up: this was the last open checkpoint of its stage (a coach lesson for an already passed checkpoint isn't).
      const stage = MILESTONES.find(m => m.checkpoints.includes(cp ? cp.id : lesson.id)), s = getSettings();
      const rankUp = event === 'lessonDone' && !provedBefore && !!stage && checkpointsOf(stage, allLessons(), s.profile).every(l => s.lessons[l.id]?.completedAt);
      const ok = !emptyBars && (check.ok || !!step.jam || (free.length > 0 && !step.pass));
      const msg: Record<LadderEvent, string> = {
        hold: emptyBars ? 'Once more, and fill your bars this time.' : ok ? `Clean take (${next.clean}/${cleanNeeded(step)}). Once more at ${next.bpm} BPM.` : notesLanded ? floorLine(true, check.reason) : 'Same tempo, once more. You are close.',
        up: `Up to ${next.bpm} BPM!`,
        slowDown: `Let's take it to ${next.bpm} BPM. Slower is how it sticks.`,
        layerUp: `Now add the ${(lanesNow(step, next) ?? []).filter(d => !(lanesNow(step, p) ?? []).includes(d)).map(laneName).join(' and ')}.`,
        atFloor: floorLine(notesLanded, check.reason),
        stepDone: `Step done! Next: ${lesson.steps[next.step].title}.`,
        lessonDone: p.completedAt ? `Still solid at ${next.bestBpm} BPM${stars ? `, ${stars} star${stars === 1 ? '' : 's'}` : ''}.` : `Lesson complete at ${next.bestBpm} BPM, ${stars} star${stars === 1 ? '' : 's'}!${cp ? ` That passes the "${cp.title}" checkpoint.` : ''}${rankUp ? ` Rank up: you're now a ${stage!.rank}!` : ''} It will come back for review in a few days.`,
      };
      // Keep time alone: say how the tempo held once the click went quiet (in words, no numbers).
      const drift = step.fadeClick ? takeDrift(f.hits, { zero: f.zero, beatMs: 60000 / (f.chart.bpm * f.options.speed) }) : undefined;
      const held = drift === undefined || drift === null ? '' : Math.abs(drift) >= 20 ? ` You ${drift < 0 ? 'sped up' : 'slowed down'} a little once the click went quiet.` : ' Tempo held on your own. That\'s the hard part.';
      o = { passed: ok, event, again: event === 'lessonDone' && !!p.completedAt, slowly: event === 'atFloor' && !notesLanded, nums, say: `${ok ? `${praise(p.clean + p.fails + takeNo)} ` : nums.recoveries >= 3 ? 'Nice comebacks! ' : ''}${msg[event]}${held}${ok ? lateNote(lesson.level, st.meanOffset) : ''}`, reason: ok ? undefined : check.reason, fixBar: ok ? undefined : sticky[0], text: `${ok ? 'Nice! ' : ''}${landed.trim()} ${msg[event]}`, itemDone: event === 'stepDone' || event === 'lessonDone', stars, rankUp };
    }
    outcomes.set(f, o);
    // The coach builds the path: once a lesson is done, it writes the next one in the background (unless one is waiting,
    // or you're flying through the stage: then its checkpoints are next, no lessons in between).
    if (o.event === 'lessonDone' && !o.again && studentRead(getSettings().lessons).pace !== 'flying' && !allLessons().some(l => l.source === 'ai' && !getSettings().lessons[l.id]?.completedAt))
      requestCoachLesson(`after-${lesson.id}-${f.startedAt}`);
    // Between takes of a step the verdict stays on screen; the coach speaks once the step or lesson is done.
    if (o.itemDone && getSettings().voice) void say(o.text);
    if (o.itemDone) coachTake(f, { lesson: lesson.title, step: step.title, passed: o.passed, verdict: o.text, event: o.event, tempoNow: getSettings().lessons[lesson.id]?.bpm, target: step.bpm.target, stickyBars: sticky,
      nextStep: nextStepInfo(lesson, progressOf(lesson), o.event) });
    if (o.itemDone) onItemDone?.();
    saveRun(f, { passed: o.passed });
    setSecs(s => s + f.durationS);
    setVersion(v => v + 1);
  }), [lesson, step, oneTake, role, onItemDone]);
  useEffect(() => () => { stop(); dropCoachAction(); clearTimeout(probeTimer.current); }, []);

  const lanes = oneTake ? step.layers?.at(-1) ?? step.activeLanes : lanesNow(step, p);
  const laneKey = lanes?.join();
  // The idle sheet: notes with their index, greyed where the app plays them (other lanes, copy-me calls).
  const idleSheet = useMemo(() => {
    const notes = chart.notes.map((n, i) => ({ ...n, i }));
    return { chart: { ...chart, notes }, dim: (i: number) => !!notes[i].auto || (!!lanes && !lanes.includes(notes[i].drum)) };
  }, [chart, laneKey]); // eslint-disable-line react-hooks/exhaustive-deps -- lanes by value
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'h') setSettings({ hints: getSettings().hints === false });
      if (e.key === 'b') setSettings({ band: getSettings().band === false }); // the band on / off
      if (e.key === 'c' && player.phase !== 'playing') setChecking(c => !c); // check yourself (camera)
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const bandSpec = bandFor(lesson, step); // on for grooves, songs and fills (engine/band.ts)
  const options = (demo: boolean, wait = false): PlayOptions => ({
    // Short takes so a rough one is over quickly: 4 bars; 8 for the proving take (last step at its target tempo),
    // a jam (long enough to enjoy) and copy-me (4 calls and 4 echoes).
    // A song plays through once; anything else loops to the take length.
    fromBar: 1, toBar: chart.bars, repeats: stitchedSong ? 1 : step.bars ? Math.max(1, Math.ceil(step.bars / chart.bars)) : Math.max(1, Math.ceil((step.copy || step.trade || step.jam || role === 'record' || (stepIdx === lesson.steps.length - 1 && bpm >= step.bpm.target) ? 8 : 4) / chart.bars)),
    speed: bpm / chart.bpm, metronome: true, subdivision: 1, countInBars: 1, wait,
    countAloud: step.countAloud && countPlan(16, beatsPerBar(chart), step.countAloud, chart.timeSignature),
    activeLanes: lanes, demo, gapBars: demo ? undefined : step.gapBars, count: lesson.level <= 1, goodMs: goodMsFor(lesson.level), hints: getSettings().hints !== false && !step.read, freeBars: free.length ? free : undefined, fadeClick: demo ? undefined : step.fadeClick, clickOn: step.clickOn,
    lesson: { id: lesson.id, step: stepIdx + 1, title: lesson.title, goal: step.text, tool: flow ? 'flow' : arcade ? 'arcade' : toolOf(step),
      ...(step.bite && { bite: { songId: step.bite.songId, fromBar: step.bite.fromBar, toBar: step.bite.toBar } }) }, // bars of a song: count towards it
    band: getSettings().band !== false ? bandSpec : undefined,
    feelTarget: step.pass?.offsetTarget && { ms: step.pass.offsetTarget.ms, tol: step.pass.offsetTarget.tol }, swingWant: step.pass?.swingPct,
  });
  // Intro slides before the first take of a step or layer (or after a tempo jump of more than 10 BPM).
  const [intro, setIntro] = useState<{ run: () => void }>();
  const play = (demo: boolean, atBpm = bpm, wait = false) => {
    setDetails(false);
    const next = !demo && !wait && step.variants?.length ? chartFor(takeNo + 1).chart : chart;
    const run = () => { if (next !== chart) setTakeNo(takeNo + 1); start(next, { ...options(demo, wait), speed: atBpm / next.bpm }); };
    const key = `${stepIdx}/${p.layer ?? 0}`, seen = introShown.current.get(key);
    if (!demo && !wait && getSettings().intro !== false && (seen === undefined || Math.abs(seen - atBpm) > 10)) {
      introShown.current.set(key, atBpm); setIntro({ run }); return;
    }
    run();
  };
  // Listen back: your own hits, at their real times, with the click.
  const hearTake = (t: Finished, then?: () => void) => start(takeChart(t.hits, { zero: t.zero, beatMs: 60000 / (t.chart.bpm * t.options.speed), beats: t.run.beats, beatsPerBar: t.run.beatsPerBar, title: 'Your take', timeSignature: t.chart.timeSignature }),
    { ...options(true), fromBar: 1, toBar: 999, repeats: 1, speed: 1, activeLanes: undefined, then });
  // One bar of find-your-tempo at the current probe tempo (count-in only before the first).
  // Four clicks, then one bar, every time: chained bars without a count-in didn't line up.
  const probeBar = () => start(chart, { ...options(false), toBar: 1, repeats: 1, speed: (probing.current?.tempo ?? bpm) / chart.bpm, countInBars: 1, probe: true, band: undefined });
  // Only an untouched step; a flying student probes every drill step with a ladder (autoProbe), not only probe steps.
  const canProbe = (!!step.probe || autoProbe(step, studentRead(getSettings().lessons).pace)) && !oneTake && probed.current !== stepIdx && p.bpm === step.bpm.start && !p.clean && !p.fails;
  // Zoom in: loop one bar 4 times, 10 BPM slower, with the app playing softly underneath.
  const zoomIn = (bar: number) => { setDetails(false); start(chart, { ...options(false), fromBar: bar, toBar: bar, repeats: 4, speed: Math.max(MIN_BPM, bpm - 10) / chart.bpm, guide: true, zoom: bar }); };
  // The coach's suggested next step (a tap on its button, or "yes"): again / slower / faster here, next = next item.
  useEffect(() => onCoachAction(a => {
    if (intro) return false; // the intro slides have the kit's taps
    if (a.kind === 'next') { (onNext ?? onBack)(); return true; } // opened outside today's session: back to the Journey
    // The coach switches tools for one take: trade bars, count along, or one limb while the app plays the rest.
    if (a.kind === 'trade' || a.kind === 'count' || a.kind === 'layers') {
      const t = a.kind === 'trade' ? playChart({ chart: step.chart, trade: true }) : { chart, freeBars: free };
      const first = step.layers?.[0] ?? [step.chart.notes[0].drum];
      setDetails(false);
      start(t.chart, { ...options(false), toBar: t.chart.bars, repeats: Math.max(1, Math.ceil(8 / t.chart.bars)), speed: bpm / t.chart.bpm, oneOff: true,
        freeBars: t.freeBars.length ? t.freeBars : undefined,
        ...(a.kind === 'count' && { countAloud: countPlan(16, beatsPerBar(chart), "8ths", chart.timeSignature) }), ...(a.kind === 'layers' && { activeLanes: first }) });
      return true;
    }
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
  const fresh2 = replyFor(coach, f, opened); // the coach's answer to this take
  const goNext = onNext ?? onBack;
  // A record, a rank up or a finished lesson keeps the app's verdict and its next move; the coach's words go under it.
  const big = !!outcome && (outcome.event === 'lessonDone' || !!outcome.rankUp || (role === 'record' && outcome.passed));
  const coachAct = big ? undefined : screenAction(fresh2?.action, onNext ? 'Next ▶' : '← Journey');
  useEffect(() => { if (big && fresh2?.action) dropCoachAction(true); }, [big, fresh2]); // the kit's "yes" moves on too
  // Shake it out: a rest step ends with "done", which moves the lesson on like a passed step.
  const resting = (!!step.rest || !!step.look || !!step.quiz) && !oneTake; // a look or quiz step ends like a rest: "done" moves on
  const demo = step.demo ?? lesson.demo; // how the body moves (R5)
  const arcadeBest = getSettings().arcade?.[lesson.id] ?? 0;
  const arcadeBpm = p.bestBpm || step.bpm.target;
  const finishRest = () => { saveProgress(lesson.id, ladderStep(progressOf(lesson), lesson, true, today()).next); setVersion(v => v + 1); };
  const main: { label: string; run: () => void } =
    arcade ? { label: outcome ? '⏱ Again, 2 minutes' : '⏱ Start the 2 minutes', run: () => { setDetails(false); start(chart, { ...options(false), endless: true, seconds: 120, speed: arcadeBpm / chart.bpm }); } }
    : canProbe ? { label: '🔍 Find my tempo', run: () => { probing.current = { tempo: step.bpm.start, accs: [] }; probeBar(); } }
    : resting ? { label: '✓ Done, next step', run: finishRest }
    : flow ? { label: '🌊 Flow ▶', run: () => { setDetails(false); start(chart, { ...options(false), endless: true, fadeClick: 8 }); } }
    : coachAct && canRunAction(coachAct) ? { label: coachAct.label, run: () => void runAction(coachAct) }
    : outcome?.fixBar && !outcome.zoomed ? { label: `🔍 Fix bar ${outcome.fixBar}`, run: () => zoomIn(outcome.fixBar!) }
    : outcome?.slowly ? { label: '🐢 Learn it slowly', run: () => play(false, bpm, true) }
    : itemDone && (oneTake || outcome?.event === 'lessonDone') ? { label: onNext ? 'Next ▶' : '← Journey', run: goNext }
    : { label: outcome ? '▶ Again' : '▶ Play', run: () => play(false) };
  const listen = () => (f && f.hits.length ? hearTake(f) : play(true));
  // Autopilot: after a verdict the main move starts by itself in 5 s; any pad hit (or the keyboard kit) waits.
  const mainRef = useRef(main); mainRef.current = main;
  const [autoIn, setAutoIn] = useState<number>();
  useEffect(() => {
    if (!getSettings().autopilot || !f || !outcome || playing || details || timeUp || resting || f.options.wait || outcome.zoomed || outcome.event === 'lessonDone') return;
    let left = 5, armed = false;
    setAutoIn(left);
    if (getSettings().voice) void say(`Next in five. Hit any pad to wait.`);
    const arm = setTimeout(() => { armed = true; }, 700); // the take's last strokes don't count as "wait"
    const off = onHit(() => { if (armed) { clearInterval(t); setAutoIn(undefined); hush(); } });
    const t = setInterval(() => { left--; if (left > 0) setAutoIn(left); else { clearInterval(t); setAutoIn(undefined); mainRef.current.run(); } }, 1000);
    return () => { clearTimeout(arm); clearInterval(t); off(); setAutoIn(undefined); };
  }, [f, !!outcome, playing]); // eslint-disable-line react-hooks/exhaustive-deps -- once per verdict
  // At the slowest tempo the move is wait mode, as its label says (it used to play a scored take below the floor).
  const atFloor = oneTake || p.bpm <= MIN_BPM;
  const slower = () => (atFloor ? play(false, bpm, true) : runAction({ kind: 'slower', label: 'Slower' }));
  useEffect(() => onCoachAction(a => {
    if (intro) return false;
    if (a.kind === 'main') { main.run(); return true; }
    if (a.kind === 'listen') { // the kit's tom 2 × 2 hears one thing; the coach's "listen" plays your take, then the right version
      if (a.label !== 'listen' && f?.hits.length) hearTake(f, () => play(true)); else listen();
      return true;
    }
    return false;
  }));

  if (f && details) return <Results f={f} onAgain={() => play(false)} onBack={() => setDetails(false)} />;

  const stage = MILESTONES.find(m => m.checkpoints.includes(lesson.checkpoint ?? lesson.id)) ?? MILESTONES.find(m => m.level === lesson.level);
  const stageChecks = stage ? checkpointsOf(stage, allLessons(), getSettings().profile) : [];
  const celebration = f && outcome?.event === 'lessonDone' && !outcome.again && celebrated !== f && (
    <Celebration lesson={lesson} stars={outcome.stars ?? 1} milestone={stage} rankUp={!!outcome.rankUp}
      next={stage && MILESTONES.find(m => m.level === stage.level + 1)}
      done={stageChecks.filter(l => getSettings().lessons[l.id]?.completedAt).length} total={stageChecks.length}
      nextLabel={stitchedSong ? 'Now with the real song →' : onNext ? "Next in today's session →" : 'Back to Journey'}
      onNext={stitchedSong ? () => requestSong(lesson.id.slice(5)) : onNext ?? onBack}
      onAgain={() => { setCelebrated(f); play(false); }} onClose={() => setCelebrated(f)} />
  );

  const hints = getSettings().hints !== false && !step.read; // a reading step is read without the hints
  const takeStats = f?.stats, feel = takeStats?.feel; // the feel row (R4)
  const behind = takeStats && step.pass?.offsetTarget ? takeStats.perDrum[step.pass.offsetTarget.drum ?? 'snare']?.meanOffset ?? takeStats.meanOffset : undefined;
  // Your fills: each free bar of the last take with 2+ strokes can be kept (up to 4 per take).
  const yourFills = f && f.options.freeBars && !playing ? Array.from({ length: Math.ceil(f.run.beats / f.run.beatsPerBar) }, (_, b) => b)
    .filter(b => inFreeBar(b * f.run.beatsPerBar, f.run.beatsPerBar, f.options.fromBar, f.options.toBar - f.options.fromBar + 1, f.options.freeBars!))
    .map(b => ({ bar: b, notes: fillFromTake(f.hits, { zero: f.zero, beatMs: 60000 / (f.chart.bpm * f.options.speed), beatsPerBar: f.run.beatsPerBar }, b) }))
    .filter(x => x.notes.length >= 2).slice(0, 4) : [];
  const layer = step.layers && !oneTake ? Math.min(p.layer ?? 0, step.layers.length - 1) : undefined;
  const dots = step.layers && !oneTake ? step.layers.map((_, i) => (i < layer! ? 'done' : i === layer ? 'on' : ''))
    : lesson.steps.map((_, i) => (i < stepIdx || p.completedAt ? 'done' : i === stepIdx ? 'on' : ''));
  const toTarget = Math.max(0, Math.min(1, (bpm - step.bpm.start) / Math.max(1, step.bpm.target - step.bpm.start)));
  // The verdict never turns into "…" while the coach thinks: the thinking shows as a small line under it.
  const said = coachLine(outcome?.say, fresh2, big);
  const line = said.line ?? (arcade ? `Two minutes at ${arcadeBpm} BPM: how many clean bars can you play? ${arcadeBest ? `Your best: ${arcadeBest}.` : ''}`
    : canProbe ? (probeExplained ? `Find your tempo from ${step.bpm.start} BPM.` : "Let's find your tempo: one bar at a time, 5 BPM faster after each clean bar, until it gets hard.")
    : flow ? 'Flow: just play. The click fades away and nothing is scored as pass or fail. Stop when you like (crash × 4 or Esc).' : step.text);
  const howHint = lesson.how.split(/(?<=\.)\s/)[0];

  return (
    <div className={`lessonScreen ${playing ? 'playing' : ''}`}>
      {celebration}
      {intro && <IntroSlides title={lesson.title} sub={step.title} bpm={bpm} what={step.text} notes={chart.notes.filter(n => !n.auto).map(n => ({ ...n, mine: !lanes || lanes.includes(n.drum) }))}
        beatsPerBar={beatsPerBar(chart)} focus={outcome?.reason ?? (hints ? howHint : undefined)} demo={demo} onDone={() => { const r = intro.run; setIntro(undefined); r(); }} onClose={() => setIntro(undefined)} />}
      <div className="lbar card">
        <button className="link back" onClick={() => { stop(); onBack(); }}>← Journey</button>
        <h2>{lesson.title}</h2>
        <span className="toolBadge">{stepIcon(step, lesson.kind)} {(role ? ROLE[role] : TOOL_LABEL[toolOf(step)]).toUpperCase()}</span>
        {dots.length > 1 && <span className="stepDots" aria-label={layer !== undefined ? `Layer ${layer + 1} of ${dots.length}` : `Step ${stepIdx + 1} of ${dots.length}`}>{dots.map((d, i) => <i key={i} className={d} />)}</span>}
        <span className="bigTempo">{arcade ? arcadeBpm : bpm} <small>BPM{!oneTake && ` → ${step.bpm.target}`}</small>{!oneTake && <span className="meter"><b style={{ width: `${toTarget * 100}%` }} /></span>}</span>
        <button className={`hintToggle ${hints ? 'on' : ''}`} aria-pressed={hints} onClick={() => setSettings({ hints: !hints })} title="Show the count and which hand or foot plays each note (key H)">💡 Hints {hints ? 'on' : 'off'}</button>
        {bandSpec ? <button className={`hintToggle ${getSettings().band !== false ? 'on' : ''}`} aria-pressed={getSettings().band !== false} onClick={() => setSettings({ band: getSettings().band === false })} title="Bass and keys play along (key B). Volume: Setup → Sound check">🎸 Band {getSettings().band !== false ? 'on' : 'off'}</button>
          : <span className="small" title="Counting, rudiments and find-your-tempo are just you and the click">🎸 just you and the click</span>}
      </div>

      {checking && demo && <SelfCheck demo={demo} bpm={bpm} onClose={() => setChecking(false)} />}
      {resting ? <>
        <CoachLine line={step.text} />
        {!step.quiz && <div className="moves"><Move go label="✓ Done, next step" onClick={finishRest} />{demo && <Move alt label="📷 Check yourself" gesture="key C" onClick={() => setChecking(true)} />}</div>}
        {step.quiz ? <EarQuiz key={stepIdx} kind={step.quiz} chart={chart} onDone={finishRest}
          play={(c, then) => start(c, { ...options(true), fromBar: 1, toBar: c.bars, repeats: 1, speed: bpm / c.bpm, activeLanes: undefined, band: undefined, then })} />
          : step.look && demo ? <div className="card lookStep"><TechniqueDemo id={demo} bpm={bpm} /></div> : <RestCountdown key={stepIdx} seconds={step.rest!} />}
      </> : playing ? (player.options?.endless ? <FlowMeter /> : <LiveHint />) : <>
        <CoachLine line={autoIn ? `${line} (${main.label.replace(/^\W+/, '')} in ${autoIn}… hit any pad to wait)` : line} under={said.under} thinking={!fresh2 && thinkingAbout(coach, f)} />
        <div className="moves">
          <Move go label={main.label} onClick={main.run} />
          <Move label={f && f.hits.length ? '🎧 Hear your take' : '👂 Hear it'} gesture="tom 2 × 2" onClick={listen} />
          <Move alt label={`🐢 ${atFloor ? 'Learn it slowly' : 'Slower'}`} gesture="floor × 2" onClick={slower} />
          <Move alt label={`⏭ ${onNext ? 'Skip to next' : 'Journey'}`} gesture="ride × 2" onClick={() => { stop(); goNext(); }} />
        </div>
      </>}

      {!resting && <div className="lessonMain">
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
              {/* the feel, when this step asks for it (R4) */}
              {step.pass?.swingPct && feel?.swing != null && <div><b>{Math.round(feel.swing)}%</b><span>swing (aim {step.pass.swingPct.join('–')})</span></div>}
              {step.pass?.minDynamicsR !== undefined && feel?.dynamics != null && <div><b>{feel.dynamics >= step.pass.minDynamicsR ? '✓' : '✗'}</b><span>soft / loud</span></div>}
              {step.pass?.offsetTarget && behind !== undefined && <div><b>{Math.round(behind)} ms</b><span>behind (aim {step.pass.offsetTarget.ms - step.pass.offsetTarget.tol}–{step.pass.offsetTarget.ms + step.pass.offsetTarget.tol})</span></div>}
            </div>
            {outcome.reason && <p className="tip">💡 {outcome.reason}</p>}
            <p className="small">{outcome.nums.better ? '↑ better than last take · ' : ''}{!oneTake && !step.jam && !outcome.itemDone && (layer === undefined || layer === step.layers!.length - 1) ? cleanCount(p.clean, cleanNeeded(step), p.bpm) : ''}</p>
            {f && <LatencyHint f={f} />}
            {yourFills.length > 0 && <div className="actions">{yourFills.map((fl, k) => kept.has(`${f!.startedAt}/${fl.bar}`)
              ? <span key={fl.bar} className="small">✓ fill {k + 1} kept</span>
              : <button key={fl.bar} onClick={() => { keepFill(fl.notes, f!.chart.bpm * f!.options.speed, f!.chart.timeSignature); setKept(new Set(kept).add(`${f!.startedAt}/${fl.bar}`)); }}>💾 Keep fill {k + 1}</button>)}</div>}
            {f && f.hits.length > 0 && <button className="link" onClick={() => play(true)}>👂 Hear it right</button>}
          </div> : <div className="card">
            <p><b>{lesson.what}</b></p>
            {layer !== undefined && <p>Layer {layer + 1} of {step.layers!.length}: a clean take adds {laneName(step.layers![layer + 1]?.find(d => !step.layers![layer].includes(d)) ?? 'speed')}.</p>}
            {hints && <p className="hintcard">💡 <b>Hint:</b> {howHint}</p>}
            <details open={fresh}><summary>Why and how</summary><p>{lesson.why}</p><p>{lesson.how}</p></details>
          </div>}
          {step.bite && <div className="card"><p>🎵 Bars {step.bite.fromBar}–{step.bite.toBar} of <b>{step.bite.title ?? 'your song'}</b></p>{step.bite.songId.startsWith('yt-') && <button onClick={() => requestSong(step.bite!.songId, { from: step.bite!.fromBar, to: step.bite!.toBar })}>Play it with the song →</button>}</div>}
          {(step.trade || step.read || free.length > 0 || step.pass?.streak || step.gapBars || step.countAloud || step.probe || step.fadeClick || step.clickOn || step.variants?.length || (lanes && step.chart.notes.some(n => !lanes.includes(n.drum)))) && <div className="card small">
            {step.probe && <p>Find your tempo: one bar at a time from {step.bpm.start} BPM, faster after each clean bar. Then we practise just below where it got hard.</p>}
            {step.fadeClick && <p>The click fades away over {step.fadeClick} bars. Keep the tempo on your own.</p>}
            {step.clickOn === '2and4' && <p>The click is only on 2 and 4, like a snare backbeat. Feel 1 and 3 yourself.</p>}
            {step.clickOn === '8ths' && <p>The click is on every 8th note.</p>}
            {!!step.variants?.length && <p>A different phrase each take: read it, don't memorise it.</p>}
            {step.read && <p>📖 Reading: no hints under the notes. Count it in your head first, then play what you see.</p>}
            {step.countAloud && <p>{engine === 'browser' ? "I'd count along here with the Piper voice (Setup → Coach and voice)." : 'I count along with you for the first bars, then you take over.'}</p>}
            {step.trade && <p>Trade bars: I play a bar, you answer with anything. No wrong notes, just stay on the beat.</p>}
            {!step.trade && free.length > 0 && <p>Bar {free.join(' and ')} is yours: play any fill you like.</p>}
            {free.length > 0 && !!getSettings().fills?.length && <button className="link" onClick={() => { const all = getSettings().fills!; hearFill(all[Math.floor(Math.random() * all.length)]); }}>🎧 Hear one of your fills</button>}
            {step.pass?.streak && <p>Challenge: {recordStreak ?? step.pass.streak} notes in a row. Missed one? The count just starts again.</p>}
            {lanes && step.chart.notes.some(n => !lanes.includes(n.drum)) && <p>You play: {lanes.map(laneName).join(', ')}. The app plays the rest (grey).</p>}
            {step.gapBars && <p>The click goes silent every {step.gapBars === 2 ? 'other' : `${step.gapBars}th`} bar.</p>}
          </div>}
          {lesson.needsLatency && !getSettings().latencyChecked && <div className="card"><p className="warn">This lesson is judged in milliseconds. Run the latency test first
            (⚙ Setup → Pads → Latency), or "behind the beat" may just be your speakers.</p></div>}
          {demo && <div className="card howItMoves">
            <h3>How it moves</h3>
            <TechniqueDemo id={demo} bpm={bpm} compact />
            <button className="primary" onClick={() => setChecking(true)}>📷 Check yourself <small>(key C)</small></button>
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
      </div>}
    </div>
  );
}

const LANE_NAMES: Record<string, string> = { hihat: 'hi-hat', hhOpen: 'open hi-hat', hhPedal: 'hi-hat foot', tom1: 'tom 1', tom2: 'tom 2', floor: 'floor tom' };
const laneName = (d: string) => LANE_NAMES[d] ?? d;

/** Shake it out: a big countdown while you loosen up. */
function RestCountdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => { const t = setInterval(() => setLeft(l => Math.max(0, l - 1)), 1000); return () => clearInterval(t); }, []);
  return <div className="card restCountdown" role="timer" aria-live="off">{left > 0 ? left : '🙂'}<p>{left > 0 ? 'Breathe out, let your shoulders drop.' : 'Ready when you are.'}</p></div>;
}
