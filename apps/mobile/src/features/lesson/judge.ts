// Judge each finished take once: the verdict, the tempo ladder or review, what to save, what to say. A pure port of
// src/lesson/LessonPlayer.tsx `judge` (and the Outcome type): it returns the writes and effects instead of doing them,
// so the controller applies them and tests can check them. D6 adds interrupted takes (AUDIO-DESIGN §4).
import { beatsPerBar } from '@drum-coach/core/engine/chart';
import { praise } from '@drum-coach/core/engine/greeting';
import { freeBarStats, takeDrift } from '@drum-coach/core/engine/jam';
import {
  afterReview, checkPass, floorLine, freeStars, ladderStep, lanesNow, lateNote, nextStepInfo, passFor, probeTempo, proveOnAnotherDay,
  startProgress, starsFor, stuckLine, stuckMove, type LadderEvent, type Lesson, type LessonProgress, type Milestone, type StuckMove,
} from '@drum-coach/core/engine/lesson';
import { rankedUp, studentRead } from '@drum-coach/core/engine/planner';
import { cleanBars, worstBars } from '@drum-coach/core/engine/scoring';
import type { Settings } from '@drum-coach/core/input/settings';
import { cleanNeeded, laneName, type Frame, type LessonSetup } from './lessonView';
import type { Finished } from './types';

/** The result card's numbers. */
export type Nums = { landed: number; total: number; streak: number; recoveries: number; onBeat?: number; better: boolean };
/** text: the full verdict (spoken, sent to the coach); say: the short line for the screen; nums: the result card. */
export type Outcome = {
  passed: boolean; text: string; say?: string; slowly?: boolean; stuck?: StuckMove; again?: boolean; nums?: Nums; reason?: string;
  fixBar?: number; zoomed?: boolean; event?: LadderEvent; itemDone: boolean; stars?: number; rankUp?: boolean;
  /** D6: the take was interrupted (kept: whole bars ≥ 2, not on the ladder). */
  interrupted?: boolean;
};

/** Find your tempo, between its one-bar takes. */
export type Probe = { tempo: number; accs: number[] };

export type JudgeInput = {
  f: Finished;
  setup: LessonSetup;
  frame: Frame;
  free: number[];
  settings: Settings;
  /** Every lesson (built-in + the coach's), for ranks and "a coach lesson is waiting". */
  lessons: Lesson[];
  milestones: Milestone[];
  lessonById: (id: string) => Lesson | undefined;
  takeNo: number;
  /** The last take's accuracy, for "better than last take". */
  prevAccuracy?: number;
  probe?: Probe;
  /** First probe result this session: the long sentence. */
  explainProbe: boolean;
  today: string;
};

export type JudgeOutput = {
  outcome: Outcome;
  /** Settings to write (lessons progress, arcade best), applied in one set. */
  patch?: Partial<Settings>;
  /** Save the run with this extra summary (none: not saved). */
  save?: { passed: boolean; onBeatPct?: number; interrupted?: boolean };
  /** The next probe state: a Probe to play its next bar, null when the probe is over. */
  probe?: Probe | null;
  /** The probe finished on this step (its tempo is found). */
  probed?: boolean;
  flourish?: { big: boolean };
  /** The verdict to speak (the item is done and the voice is on). */
  speak?: string;
  /** Tell the coach about this take (lessonResult), once the item is done. */
  coachTake?: Record<string, unknown>;
  /** Ask the coach to write the next lesson (its request key). */
  coachLesson?: string;
  itemDone: boolean;
  stickyBar?: number;
  /** This take's accuracy, the next take's "last take". */
  accuracy?: number;
  /** Seconds played (for the item's minutes and the break reminder). */
  playedS: number;
};

const numsOf = (f: Finished, onBeat?: number, better = false): Nums =>
  ({ landed: f.stats.total - f.stats.miss, total: f.stats.total, streak: f.stats.streak, recoveries: f.stats.recoveries, onBeat, better });

/** An interrupted take (D6) is kept only with at least this many whole bars and some scored notes. */
export const MIN_KEPT_BARS = 2;
export const keepInterrupted = (f: Finished) => Math.floor(f.run.beats / f.run.beatsPerBar + 1e-6) >= MIN_KEPT_BARS && f.stats.total > 0;

export function judge(x: JudgeInput): JudgeOutput {
  const { f, setup, frame, free, settings: s0 } = x;
  const { lesson, role } = setup, { step, stepIdx, oneTake, recordStreak, bpm } = frame;
  const p0 = s0.lessons[lesson.id] ?? startProgress(lesson);
  const beatMs = 60000 / (f.chart.bpm * f.options.speed);
  // Wait mode is for learning the pattern: no verdict, no ladder, not saved.
  if (f.options.wait) {
    const t = 'Nice and slow. When it feels easy, play it with the click.';
    return { outcome: { passed: false, itemDone: false, text: t, say: t }, itemDone: false, playedS: 0 };
  }
  // D6: a call or the app going to the background: keep it (flagged) only with 2+ whole bars; never on the ladder.
  if (f.interrupted) {
    const bars = Math.floor(f.run.beats / f.run.beatsPerBar + 1e-6);
    if (!keepInterrupted(f)) {
      const t = 'Take stopped. It was too short to keep: press Play when you are ready.';
      return { outcome: { passed: false, itemDone: false, zoomed: true, interrupted: true, text: t, say: t }, itemDone: false, playedS: 0 };
    }
    const t = `Take stopped${f.interrupted.reason ? ` (${f.interrupted.reason})` : ''}. ${bars} bars kept: ${f.stats.total - f.stats.miss} of ${f.stats.total} notes landed. It doesn't count for the tempo ladder.`;
    return { outcome: { passed: false, itemDone: false, zoomed: true, interrupted: true, text: t, say: t, nums: numsOf(f) }, save: { passed: false, interrupted: true }, itemDone: false, playedS: f.durationS };
  }
  // A step's extra limits (flams, timing) are for the full groove, not its first layers.
  const fs = freeBarStats(f.hits, f.extras, { zero: f.zero, beatMs, beatsPerBar: beatsPerBar(f.chart), fromBar: f.options.fromBar, sectionBars: f.options.toBar - f.options.fromBar + 1 }, free);
  const st = f.stats;
  const check = checkPass(st, recordStreak ? { ...step.pass, streak: recordStreak } : step.layers && (p0.layer ?? 0) < step.layers.length - 1 ? undefined : step.pass, lesson.level, fs?.stats);

  // Beat the clock: clean bars in 2 minutes, best kept per lesson.
  if (f.options.seconds) {
    const score = cleanBars(f.run, f.results, f.extras.map(h => (h.time - f.zero) / beatMs));
    const best = s0.arcade?.[lesson.id] ?? 0;
    const say = score > best ? `🏆 ${score} clean bars! New best.` : `${score} clean bars. Your best is ${best}.`;
    return {
      outcome: { passed: true, itemDone: false, zoomed: true, text: say, say, nums: numsOf(f) },
      ...(score > best && { patch: { arcade: { ...s0.arcade, [lesson.id]: score } }, flourish: { big: false } }),
      save: { passed: true }, itemDone: false, playedS: 0,
    };
  }
  // Find your tempo: each clean bar goes 5 BPM faster; the first rough one sets the working tempo 10 below it.
  if (f.options.probe && x.probe) {
    const pr = { tempo: x.probe.tempo, accs: [...x.probe.accs, st.accuracy] }, pass = passFor(lesson.level).accuracy;
    if (st.accuracy >= pass && pr.tempo < step.bpm.target) {
      pr.tempo = Math.min(step.bpm.target, pr.tempo + 5);
      return { outcome: { passed: true, itemDone: false, zoomed: true, text: `Clean. ${pr.tempo}…`, say: `Clean! Now ${pr.tempo}…` }, probe: pr, itemDone: false, playedS: 0 };
    }
    const working = probeTempo(pr.accs, step.bpm.start, pass, step.bpm.target);
    const say = x.explainProbe ? `Your tempo today: ${working} BPM. That's where we practise.` : `Your tempo: ${working} BPM.`;
    return {
      outcome: { passed: true, itemDone: false, zoomed: true, text: say, say },
      patch: { lessons: { ...s0.lessons, [lesson.id]: { ...p0, bpm: working, clean: 0, fails: 0 } } },
      probe: null, probed: true, itemDone: false, playedS: 0,
    };
  }
  // Flow: however long you played, it counts; no ladder.
  if (f.options.endless) {
    const bars = Math.round(f.run.beats / f.run.beatsPerBar), say = bars ? `${bars} bar${bars === 1 ? '' : 's'} in the flow. Nice.` : 'Whenever you are ready, just play.';
    return { outcome: { passed: true, itemDone: false, zoomed: true, text: say, say, nums: numsOf(f) }, save: { passed: true }, itemDone: false, playedS: 0 };
  }
  // A one-off take the coach asked for (trade, count along, one limb): for fun, no ladder.
  if (f.options.oneOff) {
    const fsx = freeBarStats(f.hits, f.extras, { zero: f.zero, beatMs, beatsPerBar: beatsPerBar(f.chart), fromBar: f.options.fromBar, sectionBars: f.options.toBar - f.options.fromBar + 1 }, f.options.freeBars ?? []);
    const say = fsx ? (fsx.stats.hits ? `Your bars: ${fsx.stats.onGridPct}% on the beat.` : 'Your bars were empty: play anything you like in them.') : `One for fun: ${f.stats.total - f.stats.miss} of ${f.stats.total} notes landed.`;
    const onBeat = fsx?.stats.hits ? fsx.stats.onGridPct : undefined;
    return { outcome: { passed: true, itemDone: false, zoomed: true, text: say, say: `${say} Back to the lesson when you're ready.`, nums: numsOf(f, onBeat) }, save: { passed: true, onBeatPct: onBeat }, itemDone: false, playedS: 0 };
  }
  if (f.options.zoom) {
    const again = `Now the whole thing again at ${p0.bpm} BPM.`;
    return {
      outcome: { passed: check.ok, itemDone: false, zoomed: true, text: `Bar ${f.options.zoom}, four times: ${f.stats.total - f.stats.miss} of ${f.stats.total} notes landed. ${again}`,
        say: `Bar ${f.options.zoom} ${check.ok ? 'sounds better' : 'is getting there'}. ${again}`, nums: numsOf(f) },
      itemDone: false, playedS: 0,
    };
  }

  const sticky = worstBars(f.run, f.results, f.options.toBar - f.options.fromBar + 1, f.options.fromBar);
  const p = p0, prev = x.prevAccuracy;
  // What went right first: notes landed, best run, comebacks, better than last take.
  const landed = (st.total ? `${st.total - st.miss} of ${st.total} notes landed, best run ${st.streak} in a row`
    + (prev !== undefined && st.accuracy > prev + 2 ? ', better than last take' : st.recoveries >= 3 ? `, and you got back in ${st.recoveries} times without stopping` : '') + '.' : '')
    + (!fs ? '' : fs.stats.hits ? ` Your bars: ${fs.stats.onGridPct}% on the beat${fs.stats.spread <= 35 ? ', nice and even' : ''}.` : ' Your bars were empty: play anything you like in them.');
  const onBeat = fs?.stats.hits ? fs.stats.onGridPct : undefined;
  const nums = numsOf(f, onBeat, prev !== undefined && st.accuracy > prev + 2);
  // Ranks are proven on another day: a finished lesson passed again at its target, on a later day (R7).
  const atTarget = check.ok && stepIdx === lesson.steps.length - 1 && f.chart.bpm * f.options.speed >= step.bpm.target - 0.5;
  const prove = (q: LessonProgress) => proveOnAnotherDay(q, atTarget, x.today);
  let lessons = s0.lessons, o: Outcome, flourish: JudgeOutput['flourish'];
  const put = (id: string, q: LessonProgress) => { lessons = { ...lessons, [id]: q }; };
  if (oneTake) {
    if (role === 'review') put(lesson.id, prove(afterReview(p, check.ok, x.today)));
    if (role === 'record') {
      if (check.ok) { put(lesson.id, prove(recordStreak ? { ...p, bestStreak: recordStreak } : { ...p, bestBpm: bpm })); flourish = { big: false }; }
      const say = check.ok ? `🏆 NEW RECORD: ${recordStreak ? `${recordStreak} in a row` : `${bpm} BPM`}!` : 'Not this time. Your record stays, try again any day.';
      o = { passed: check.ok, itemDone: true, nums, say, text: `${say} ${landed}` };
    } else {
      const say = check.ok ? 'Still solid.' : "We'll come back to this one tomorrow.";
      o = { passed: check.ok, itemDone: true, nums, say, text: `${landed} ${say}` };
    }
  } else {
    // Your own bars count however you fill them, but they have to be filled: a silent answer isn't a take.
    const emptyBars = !!fs && !fs.stats.hits;
    // Every note landed and only the timing (or volume) failed: slower won't fix it, so the tempo holds.
    const notesLanded = st.accuracy >= Math.min(passFor(lesson.level).accuracy, step.pass?.accuracy ?? 100);
    const { next, event } = emptyBars ? { next: p, event: 'hold' as const } : ladderStep(p, lesson, check.ok, x.today, st.accuracy, check.ok && starsFor(st) === 3, notesLanded);
    // A take that is all your own bars has no written notes to score: its stars come from staying on the beat (D3).
    const stars = event !== 'lessonDone' ? undefined : !st.total && fs?.stats.hits ? freeStars(fs.stats.onGridPct) : starsFor(f.stats);
    const before = lessons;
    put(lesson.id, prove(stars ? { ...next, stars: Math.max(p.stars ?? 0, stars) } : next));
    // A coach lesson standing in for a checkpoint passes it; the checkpoint itself comes back for review.
    const cp = lesson.checkpoint ? x.lessonById(lesson.checkpoint) : undefined;
    if (event === 'lessonDone' && cp && !lessons[cp.id]?.completedAt)
      put(cp.id, { ...startProgress(cp), bestBpm: next.bestBpm, completedAt: next.completedAt, reviewDue: next.reviewDue, stars });
    // Rank up: this take earned its stage.
    const stage = x.milestones.find(m => m.checkpoints.includes(cp ? cp.id : lesson.id));
    const rankUp = event === 'lessonDone' && !!stage && rankedUp(stage, x.lessons, before, lessons, s0.profile);
    const ok = !emptyBars && (check.ok || !!step.jam || (free.length > 0 && !step.pass));
    const msg: Record<LadderEvent, string> = {
      hold: emptyBars ? 'Once more, and fill your bars this time.' : ok ? `Clean take (${next.clean}/${cleanNeeded(step)}). Once more at ${next.bpm} BPM.` : notesLanded ? floorLine(true, check.reason) : 'Same tempo, once more. You are close.',
      up: `Up to ${next.bpm} BPM!`,
      slowDown: `Let's take it to ${next.bpm} BPM. Slower is how it sticks.`,
      layerUp: `Now add the ${(lanesNow(step, next) ?? []).filter(d => !(lanesNow(step, p) ?? []).includes(d)).map(laneName).join(' and ')}.`,
      atFloor: floorLine(notesLanded, check.reason),
      stepDone: `Step done! Next: ${lesson.steps[next.step].title}.`,
      lessonDone: p.completedAt ? `Still solid at ${next.bestBpm} BPM${stars ? `, ${stars} star${stars === 1 ? '' : 's'}` : ''}.`
        : `Lesson complete at ${next.bestBpm} BPM, ${stars} star${stars === 1 ? '' : 's'}!${cp ? ` That passes the "${cp.title}" checkpoint.` : ''}${rankUp ? ` Rank up: you're now a ${stage.rank}!` : ''} It will come back for review in a few days.`,
    };
    // Keep time alone: say how the tempo held once the click went quiet (in words, no numbers).
    const drift = step.fadeClick ? takeDrift(f.hits, { zero: f.zero, beatMs }) : undefined;
    const held = drift === undefined || drift === null ? '' : Math.abs(drift) >= 20 ? ` You ${drift < 0 ? 'sped up' : 'slowed down'} a little once the click went quiet.` : " Tempo held on your own. That's the hard part.";
    // Stuck on this step: after 3 failed takes in a row the big move changes and the line says why (D2).
    const stuckOn = ok ? undefined : stuckMove(next.stuck ?? 0, check.reason, !!s0.latencyChecked);
    o = {
      passed: ok, event, again: event === 'lessonDone' && !!p.completedAt, slowly: event === 'atFloor' && !notesLanded, stuck: stuckOn, nums,
      say: `${ok ? `${praise(p.clean + p.fails + x.takeNo)} ` : nums.recoveries >= 3 ? 'Nice comebacks! ' : ''}${msg[event]}${held}${ok ? lateNote(lesson.level, st.meanOffset) : ''}${stuckOn ? ` ${stuckLine(stuckOn)}` : ''}`,
      reason: ok ? undefined : check.reason, fixBar: ok ? undefined : sticky[0], text: `${ok ? 'Nice! ' : ''}${landed.trim()} ${msg[event]}`,
      itemDone: event === 'stepDone' || event === 'lessonDone', stars, rankUp,
    };
  }
  const after = { ...s0, lessons };
  // The coach builds the path: once a lesson is done, it writes the next one in the background (unless one is
  // waiting, or you're flying through the stage).
  const coachLesson = o.event === 'lessonDone' && !o.again && studentRead(lessons).pace !== 'flying' && !x.lessons.some(l => l.source === 'ai' && !lessons[l.id]?.completedAt)
    ? `after-${lesson.id}-${f.startedAt}` : undefined;
  const pNow = lessons[lesson.id] ?? startProgress(lesson);
  return {
    outcome: o,
    patch: lessons !== s0.lessons ? { lessons } : undefined,
    save: { passed: o.passed, onBeatPct: onBeat },
    flourish,
    speak: o.itemDone && after.voice ? o.text : undefined,
    coachTake: o.itemDone ? { lesson: lesson.title, step: step.title, passed: o.passed, verdict: o.text, event: o.event, tempoNow: lessons[lesson.id]?.bpm,
      target: step.bpm.target, stickyBars: sticky, nextStep: nextStepInfo(lesson, pNow, o.event) } : undefined,
    coachLesson,
    itemDone: o.itemDone,
    stickyBar: sticky[0],
    accuracy: st.accuracy,
    playedS: f.durationS,
  };
}
