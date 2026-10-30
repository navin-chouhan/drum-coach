// The lesson player's state machine: before → count-in → take → results, the moves and their kit gestures, the
// coach's suggestions, find-your-tempo, rest steps, the break reminder, celebrations, fills. A port of the `Lesson`
// component of src/lesson/LessonPlayer.tsx without React: the screen subscribes, reads `view()` and calls the moves.
// Everything platform-specific is injected (the take engine through TakePort, storage, the coach, the voice).
import { beatsPerBar, type Chart } from '@drum-coach/core/engine/chart';
import { countPlan, ladderStep, MIN_BPM, playChart, type Lesson, type Milestone } from '@drum-coach/core/engine/lesson';
import type { PadCommand } from '@drum-coach/core/engine/padCommands';
import { checkpointsOf, studentRead } from '@drum-coach/core/engine/planner';
import { breakDue } from '@drum-coach/core/engine/health';
import { takeChart } from '@drum-coach/core/engine/transcribe';
import type { CoachReply } from '@drum-coach/core/coach/schemas';
import type { RunInput } from '../../data/runs';
import { coachLine, replyFor, screenAction, thinkingAbout, type CoachSession, type CoachState } from './coach';
import { judge, type Outcome, type Probe } from './judge';
import {
  boxesOf, canProbe, chartFor, frameOf, goalOf, headerOf, introLine, lessonCardOf, myPadsOf, seedBaseOf, takeOptions,
  type Frame, type LessonSetup,
} from './lessonView';
import { progressOf, saveProgress, resetLesson } from './progress';
import { fixBar, latencyHint, takeCard, takeMarks, timingLine, yourFills } from './results';
import { runInputOf, shouldSave, summarizeRun } from './runRecord';
import type { SettingsStore } from './settings';
import { canShare } from './share';
import type { Finished, PlayOptions, TakePort } from './types';

/** Seconds played since the last break in this app session (N10), shared by every lesson screen. */
let playedS = 0;
export const sitting = { played: () => playedS, add: (s: number) => { playedS += s; }, rest: () => { playedS = 0; } };
let probeExplained = false; // the probe's sentence once per app session; afterwards just the number

export type LessonDeps = {
  setup: LessonSetup;
  take: TakePort;
  settings: SettingsStore;
  /** Built-in + coach-written lessons. */
  lessons: () => Lesson[];
  lessonById: (id: string) => Lesson | undefined;
  milestones: Milestone[];
  today: () => string;
  /** Wall clock (Date.now): coach answer timing. */
  wallNow?: () => number;
  saveRun: (run: RunInput) => Promise<unknown>;
  coach?: CoachSession;
  /** Speak a verdict (settings.voice is checked by the judge). */
  say?: (text: string) => void;
  /** A drum flourish through the speakers (a lesson done, a record). */
  flourish?: (big: boolean) => void;
  /** Ask the coach to write a lesson (after a finished lesson, or "something different" for a struggle). */
  requestCoachLesson?: (key: string, struggle?: { lessonId: string; step: number; reason: string; run: Record<string, unknown> }) => void;
  /** Open the coach's drill (a lesson or a chart). Without it, drill suggestions aren't shown as a move. */
  openDrill?: (a: NonNullable<CoachReply['action']>) => void;
  /** Whether a drill's target exists (a lesson "lesson/<id>" or a saved chart). */
  drillExists?: (chartId: string) => boolean;
  /** Run soon, outside the current call (the probe's next bar). Default setTimeout 0. */
  defer?: (fn: () => void) => void;
  onBack: () => void;
  onNext?: () => void;
  onItemDone?: () => void;
  /** The in-lesson latency test (D2: "Check my latency"). */
  openLatency?: () => void;
};

export type MoveId = 'main' | 'listen' | 'slower' | 'skip';
export type MoveView = { id: MoveId; label: string; gesture: 'yes' | 'tom2' | 'floor' | 'ride'; run: () => void };

export type Celebration = {
  title: string; lessonTitle: string; stars: number; rankUp: boolean;
  milestone?: Milestone; next?: Milestone; done: number; total: number;
  nextLabel: string; canGoForMore: boolean;
};

export class LessonController {
  private readonly d: LessonDeps;
  private listeners = new Set<() => void>();
  private outcomes = new WeakMap<Finished, Outcome>();
  private saved = new WeakSet<Finished>();
  private lastTake?: Finished;
  private takeNo = 0;
  private readonly seedBase: number;
  private routineStep = 0;
  private lastAccuracy?: number;
  private stickyBar?: number;
  private probe?: Probe;
  private probedStep?: number;
  private kept = new Set<string>();
  private secs = 0;
  private celebrated?: Finished;
  private onBreak = false;
  private readonly openedAt: number;
  private chartCache?: { key: string; step: unknown; value: { chart: Chart; freeBars: number[] } };
  private unsub: (() => void)[] = [];
  private disposed = false;

  constructor(deps: LessonDeps) {
    this.d = deps;
    this.seedBase = seedBaseOf(progressOf(deps.settings, deps.setup.lesson));
    this.openedAt = (deps.wallNow ?? Date.now)();
    this.unsub.push(deps.take.subscribe(() => { this.judgeFinished(); this.notify(); }));
    this.unsub.push(deps.settings.subscribe(() => this.notify()));
    if (deps.coach) this.unsub.push(deps.coach.subscribe(() => this.notify()));
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private notify() { if (!this.disposed) this.listeners.forEach(l => l()); }

  /** Leaving the screen: the take stops and the coach's suggestion button goes. */
  dispose() {
    if (this.disposed) return;
    this.d.take.stop();
    this.d.coach?.dropAction();
    this.unsub.forEach(u => u());
    this.disposed = true;
  }

  // ---------- derived state ----------
  private get lesson() { return this.d.setup.lesson; }
  private progress() { return progressOf(this.d.settings, this.lesson); }
  frame(): Frame { return frameOf(this.d.setup, this.progress(), this.routineStep); }
  private chartOf(f: Frame, n = this.takeNo) {
    const key = `${f.stepIdx}/${n}`;
    if (this.chartCache?.key === key && this.chartCache.step === f.step) return this.chartCache.value;
    const value = chartFor(f.step, n, this.seedBase);
    if (n === this.takeNo) this.chartCache = { key, step: f.step, value };
    return value;
  }
  private options(demo: boolean, wait = false): PlayOptions {
    const f = this.frame(), { chart, freeBars } = this.chartOf(f);
    return takeOptions(this.d.setup, f, chart, freeBars, this.d.settings.get(), demo, wait);
  }
  private get mine() { return this.d.take.state.options?.lesson?.id === this.lesson.id; }
  get playing() { return this.mine && this.d.take.state.phase === 'playing'; }
  /** The take on screen: the one just finished, else (between takes, or while listening) the last one. */
  private shownTake() {
    const s = this.d.take.state;
    const justDone = this.mine && s.phase === 'done' ? s.finished : undefined;
    return justDone ?? (this.playing ? undefined : this.lastTake);
  }

  // ---------- judging ----------
  private judgeFinished() {
    const s = this.d.take.state, f = s.finished;
    if (s.phase !== 'done' || !f || f.options.lesson?.id !== this.lesson.id || this.outcomes.has(f)) return;
    const frame = this.frame(), { freeBars } = this.chartOf(frame);
    const out = judge({
      f, setup: this.d.setup, frame, free: freeBars, settings: this.d.settings.get(), lessons: this.d.lessons(), milestones: this.d.milestones,
      lessonById: this.d.lessonById, takeNo: this.takeNo, prevAccuracy: this.lastAccuracy, probe: this.probe, explainProbe: !probeExplained, today: this.d.today(),
    });
    this.outcomes.set(f, out.outcome);
    this.lastTake = f;
    if (out.patch) this.d.settings.set(out.patch);
    if (out.probe !== undefined) {
      this.probe = out.probe ?? undefined;
      if (out.probe) (this.d.defer ?? (fn => setTimeout(fn, 0)))(() => this.probeBar());
    }
    if (out.probed) { this.probedStep = frame.stepIdx; probeExplained = true; }
    if (out.stickyBar !== undefined || out.accuracy !== undefined) { this.stickyBar = out.stickyBar; this.lastAccuracy = out.accuracy; }
    if (out.flourish) this.d.flourish?.(out.flourish.big);
    if (out.coachLesson) this.d.requestCoachLesson?.(out.coachLesson);
    if (out.speak) this.d.say?.(out.speak);
    if (out.coachTake) void this.d.coach?.take(f, out.coachTake);
    if (out.itemDone) this.d.onItemDone?.();
    if (out.save && shouldSave(f) && !this.saved.has(f)) {
      this.saved.add(f);
      this.d.saveRun(runInputOf(f, out.save)).catch(() => { /* the verdict stays; Storage logs its own failure */ });
    }
    this.secs += out.playedS;
    sitting.add(out.playedS);
  }

  // ---------- playing ----------
  /** A take (or a demo, or wait mode) at `atBpm`. A shuffled step picks its next phrase for a real take. */
  play(demo: boolean, atBpm = this.frame().bpm, wait = false) {
    const f = this.frame(), cur = this.chartOf(f).chart;
    let chart = cur;
    if (!demo && !wait && f.step.variants?.length) { this.takeNo++; chart = this.chartOf(f).chart; }
    this.d.take.start(chart, { ...this.options(demo, wait), speed: atBpm / chart.bpm });
  }
  /** Listen back: your own hits at their real times, with the click (then `then`). */
  hearTake(t: Finished, then?: () => void) {
    const chart = takeChart(t.hits, { zero: t.zero, beatMs: 60000 / (t.chart.bpm * t.options.speed), beats: t.run.beats, beatsPerBar: t.run.beatsPerBar, title: 'Your take', timeSignature: t.chart.timeSignature });
    this.d.take.start(chart, { ...this.options(true), fromBar: 1, toBar: 999, repeats: 1, speed: 1, activeLanes: undefined, then });
  }
  /** Zoom in: loop one bar 4 times, 10 BPM slower, with the app playing softly underneath. */
  zoomIn(bar: number) {
    const f = this.frame(), { chart } = this.chartOf(f);
    this.d.take.start(chart, { ...this.options(false), fromBar: bar, toBar: bar, repeats: 4, speed: fixBar(bar, f.bpm).bpm / chart.bpm, guide: true, zoom: bar });
  }
  private probeBar() {
    if (this.disposed) return;
    const f = this.frame(), { chart } = this.chartOf(f);
    this.d.take.start(chart, { ...this.options(false), toBar: 1, repeats: 1, speed: (this.probe?.tempo ?? f.bpm) / chart.bpm, countInBars: 1, probe: true, band: undefined });
  }
  findTempo() { this.probe = { tempo: this.frame().step.bpm.start, accs: [] }; this.probeBar(); }
  /** Stop (the Stop button, crash × 4, Esc): an endless take keeps its whole bars. */
  stop() { this.d.take.stop('user'); }
  /** D6: a call, Siri, the app in the background. */
  interrupt() { if (this.playing) this.d.take.stop('interrupted'); }
  private goNext() { this.d.take.stop(); (this.d.onNext ?? this.d.onBack)(); }
  back() { this.d.take.stop(); this.d.onBack(); }

  /** A rest / look / listen step: "done" moves the lesson on like a passed step. */
  finishRest() {
    if (this.d.setup.role === 'stretch') {
      if (this.routineStep < this.lesson.steps.length - 1) this.routineStep++;
      else { this.d.onItemDone?.(); (this.d.onNext ?? this.d.onBack)(); }
      this.notify();
      return;
    }
    saveProgress(this.d.settings, this.lesson.id, ladderStep(this.progress(), this.lesson, true, this.d.today()).next);
  }
  endBreak() { sitting.rest(); this.onBreak = false; this.notify(); }
  closeCelebration() { this.celebrated = this.shownTake(); this.notify(); }
  celebrationAgain() { this.celebrated = this.shownTake(); this.play(false); }
  celebrationNext() { this.celebrated = this.shownTake(); this.goNext(); }
  keepFill(bar: number) {
    const f = this.shownTake();
    const fill = yourFills(f, this.playing).find(x => x.bar === bar);
    if (!f || !fill) return;
    const s = this.d.settings.get();
    const kept = { id: `${Date.now()}`, at: new Date().toISOString(), bpm: Math.round(f.chart.bpm * f.options.speed), timeSignature: f.chart.timeSignature, notes: fill.notes };
    this.d.settings.set({ fills: [...(s.fills ?? []), kept].slice(-20) });
    this.kept.add(`${f.startedAt}/${bar}`);
    this.notify();
  }
  toggleHints() { const s = this.d.settings.get(); this.d.settings.set({ hints: s.hints === false }); }
  toggleBand() { const s = this.d.settings.get(); this.d.settings.set({ band: s.band === false }); }
  /** Sheet | Highway (D8: Sheet by default), remembered in the settings as on the web. */
  setPlayView(v: 'sheet' | 'highway') { this.d.settings.set({ playView: v }); }
  resetLesson() { this.d.take.stop(); resetLesson(this.d.settings, this.lesson.id); }
  askHelp() {
    const f = this.shownTake(), o = f && this.outcomes.get(f), key = this.helpKey();
    if (!f || !key) return;
    this.d.requestCoachLesson?.(key, { lessonId: this.lesson.id, step: this.frame().stepIdx + 1, reason: o?.reason ?? '', run: summarizeRun(f) });
  }
  private helpKey() {
    const f = this.shownTake(), o = f && this.outcomes.get(f);
    return f && o && !o.passed ? `help-${this.lesson.id}-${f.startedAt}` : null;
  }

  /**
   * A coach suggestion or a kit move (again / slower / faster / next / zoom / trade / count / layers / listen / drill),
   * or 'main' (the big move). Returns false when nothing here can do it.
   */
  runAction(a: { kind: string; label?: string; bpm?: number; bar?: number; chartId?: string; chart?: unknown }): boolean {
    const f = this.frame(), { chart, freeBars } = this.chartOf(f), step = f.step;
    if (a.kind === 'main') { this.moves()[0].run(); return true; }
    if (a.kind === 'listen') {
      const t = this.shownTake();
      if (a.label !== 'listen' && t?.hits.length) this.hearTake(t, () => this.play(true)); else this.listen();
      return true;
    }
    if (a.kind === 'drill') { if (!this.d.openDrill) return false; this.d.take.stop(); this.d.openDrill(a as NonNullable<CoachReply['action']>); return true; }
    if (a.kind === 'next') { this.goNext(); return true; }
    if (a.kind === 'trade' || a.kind === 'count' || a.kind === 'layers') {
      const t = a.kind === 'trade' ? playChart({ chart: step.chart, trade: true }) : { chart, freeBars };
      const first = step.layers?.[0] ?? [step.chart.notes[0].drum];
      const o = this.options(false);
      this.d.take.start(t.chart, {
        ...o, toBar: t.chart.bars, repeats: Math.max(1, Math.ceil(8 / t.chart.bars)), speed: f.bpm / t.chart.bpm, oneOff: true,
        freeBars: t.freeBars.length ? t.freeBars : undefined,
        ...(a.kind === 'count' && { countAloud: countAlong(chart) }), ...(a.kind === 'layers' && { activeLanes: first }),
      });
      return true;
    }
    const bar = a.kind === 'zoom' ? (a.bar && a.bar <= chart.bars ? a.bar : this.stickyBar) : undefined;
    if (bar) { this.zoomIn(bar); return true; }
    if (a.kind === 'zoom') return false;
    const cur = this.progress().bpm;
    const want = a.bpm ?? (a.kind === 'slower' ? cur - 5 : a.kind === 'faster' ? cur + 5 : cur);
    const nb = f.oneTake ? f.bpm : Math.max(30, Math.min(step.bpm.target, Math.round(want))); // the coach may go below the start tempo
    if (!f.oneTake && nb !== cur) saveProgress(this.d.settings, this.lesson.id, { ...this.progress(), bpm: nb });
    this.play(false, nb);
    return true;
  }

  /** A kit gesture (engine/padCommands.ts). 'yes' takes the coach's suggestion, else the big move. */
  padCommand(cmd: PadCommand) {
    if (cmd === 'stop') { if (this.playing) this.stop(); return; }
    if (this.playing) return;
    if (cmd === 'yes') {
      const c = this.coachAct();
      if (c && this.runAction(c)) return;
      this.runAction({ kind: 'main' });
      return;
    }
    if (cmd === 'slower') { this.slower(); return; }
    if (cmd === 'next') { this.goNext(); return; }
    this.runAction({ kind: cmd, label: cmd });
  }

  listen() { const t = this.shownTake(); if (t && t.hits.length) this.hearTake(t); else this.play(true); }
  slower() { const f = this.frame(); if (f.oneTake || this.progress().bpm <= MIN_BPM) this.play(false, f.bpm, true); else this.runAction({ kind: 'slower', label: 'Slower' }); }
  skip() { this.goNext(); }

  // ---------- the coach ----------
  private coachState(): CoachState | undefined { return this.d.coach?.get(); }
  private reply() { const c = this.coachState(); return c ? replyFor(c, this.shownTake(), this.openedAt) : undefined; }
  private big(o: Outcome | undefined) { return !!o && (o.event === 'lessonDone' || !!o.rankUp || (this.d.setup.role === 'record' && o.passed)); }
  private coachAct() {
    const t = this.shownTake(), o = t && this.outcomes.get(t), r = this.reply();
    const appMove = this.big(o) || (o?.event === 'stepDone' && r?.action?.kind === 'next');
    if (appMove) return undefined;
    const a = screenAction(r?.action, this.d.onNext ? 'Next ▶' : '← Journey', this.d.drillExists ?? (() => false));
    return a && (a.kind !== 'drill' || this.d.openDrill) ? a : undefined;
  }

  // ---------- the moves ----------
  /** The four moves: the big one (also "yes"), hear, slower, skip. */
  moves(): MoveView[] {
    const f = this.frame(), p = this.progress(), t = this.shownTake(), o = t && this.outcomes.get(t), { setup } = this.d;
    const timeUp = setup.minutes !== undefined && this.secs >= setup.minutes * 60;
    const itemDone = o?.itemDone || timeUp;
    const breakNow = this.breakNow();
    const coachAct = this.coachAct(), helpKey = this.helpKey();
    const pace = studentRead(this.d.settings.get().lessons).pace;
    const probeOk = canProbe(f, p, pace, this.probedStep);
    const main: { label: string; run: () => void } =
      breakNow ? { label: '☕ 2-minute break', run: () => { this.onBreak = true; this.notify(); } }
      : setup.arcade ? { label: o ? '⏱ Again, 2 minutes' : '⏱ Start the 2 minutes', run: () => { const { chart } = this.chartOf(f); this.d.take.start(chart, { ...this.options(false), endless: true, seconds: 120, speed: f.arcadeBpm / chart.bpm }); } }
      : probeOk ? { label: '🔍 Find my tempo', run: () => this.findTempo() }
      : f.resting ? { label: '✓ Done, next step', run: () => this.finishRest() }
      : setup.flow ? { label: '🌊 Flow ▶', run: () => { const { chart } = this.chartOf(f); this.d.take.start(chart, { ...this.options(false), endless: true, fadeClick: 8 }); } }
      : o?.stuck === 'latency' && this.d.openLatency ? { label: '⏱ Check my latency', run: () => this.d.openLatency!() }
      : o?.stuck === 'count' ? { label: '🗣 Count with me, one take', run: () => void this.runAction({ kind: 'count', label: 'count' }) }
      : o?.stuck === 'listen' && t?.hits.length ? { label: '🎧 Hear mine, then the right way', run: () => this.hearTake(t, () => this.play(true)) }
      : o?.stuck === 'coach' && helpKey && this.d.requestCoachLesson ? { label: '🧑‍🏫 Something different', run: () => this.askHelp() }
      : coachAct ? { label: coachAct.label, run: () => void this.runAction(coachAct) }
      : o?.slowly ? { label: '🐢 Learn it slowly', run: () => this.play(false, f.bpm, true) }
      : o?.fixBar && !o.zoomed ? { label: fixBar(o.fixBar, f.bpm).label, run: () => this.zoomIn(o.fixBar!) }
      : itemDone && (f.oneTake || o?.event === 'lessonDone') ? { label: this.d.onNext ? 'Next ▶' : '← Journey', run: () => this.goNext() }
      // The mockup's "Play at 75" after the ladder went up; the web's "Again" plays at that same new tempo.
      : { label: o?.event === 'stepDone' ? '▶ Next step' : o?.event === 'up' ? `▶ Play at ${f.bpm}` : o ? '▶ Again' : '▶ Play', run: () => this.play(false) };
    const atFloor = f.oneTake || p.bpm <= MIN_BPM;
    // After the ladder went up, Slower goes back to the tempo you just played clean (the mockup's "Stay at 70").
    const slowerLabel = atFloor ? '🐢 Learn it slowly' : o?.event === 'up' ? `🐢 Stay at ${Math.max(30, p.bpm - 5)}` : '🐢 Slower';
    return [
      { id: 'main', label: main.label, gesture: 'yes', run: main.run },
      { id: 'listen', label: t && t.hits.length ? '🎧 Hear your take' : '👂 Hear it', gesture: 'tom2', run: () => this.listen() },
      { id: 'slower', label: slowerLabel, gesture: 'floor', run: () => this.slower() },
      { id: 'skip', label: `⏭ ${this.d.onNext ? 'Skip to next' : 'Journey'}`, gesture: 'ride', run: () => this.skip() },
    ];
  }
  private breakNow() {
    const t = this.shownTake(), o = t && this.outcomes.get(t), f = this.frame();
    return !!t && !!o && !this.playing && !f.resting && !this.d.setup.arcade && !this.d.setup.flow && breakDue(sitting.played());
  }

  /** Everything the screen draws, as of now. */
  view() {
    const { setup } = this.d, s = this.d.settings.get();
    const f = this.frame(), p = this.progress(), { chart, freeBars } = this.chartOf(f);
    const t = this.shownTake(), o = t && this.outcomes.get(t), playing = this.playing;
    const coach = this.coachState(), reply = this.reply();
    const big = this.big(o);
    const breakNow = this.breakNow();
    const said = breakNow ? { line: `${o?.say ?? ''} You've played over 20 minutes: time for a 2-minute break.`, under: undefined } : coachLine(o?.say, reply, big);
    const pace = studentRead(s.lessons).pace;
    const line = said.line ?? introLine(setup, f, { can: canProbe(f, p, pace, this.probedStep), explained: probeExplained }, s.arcade?.[this.lesson.id] ?? 0);
    const marks = takeMarks(t, chart, playing);
    const timeUp = setup.minutes !== undefined && this.secs >= setup.minutes * 60;
    const fills = yourFills(t, playing);
    const stage = this.d.milestones.find(m => m.checkpoints.includes(this.lesson.checkpoint ?? this.lesson.id)) ?? this.d.milestones.find(m => m.level === this.lesson.level);
    const showCelebration = !!t && o?.event === 'lessonDone' && !o.again && this.celebrated !== t;
    const stageChecks = stage ? checkpointsOf(stage, this.d.lessons(), s.profile) : [];
    const celebration: Celebration | undefined = showCelebration ? {
      title: o.rankUp ? 'RANK UP!' : 'LESSON COMPLETE!', lessonTitle: this.lesson.title, stars: o.stars ?? 1, rankUp: !!o.rankUp,
      milestone: stage, next: stage && this.d.milestones.find(m => m.level === stage.level + 1),
      done: stageChecks.filter(l => s.lessons[l.id]?.completedAt).length, total: stageChecks.length,
      nextLabel: this.d.onNext ? "Next in today's session →" : 'Back to Journey', canGoForMore: (o.stars ?? 1) < 3,
    } : undefined;
    const autoNext = !!s.autopilot && !!t && !!o && !playing && !timeUp && !f.resting && !t.options.wait && !o.zoomed && o.event !== 'lessonDone';
    return {
      lesson: this.lesson, frame: f, chart, freeBars, playing,
      header: headerOf(setup, f, p),
      hints: s.hints !== false && !f.step.read,
      band: { available: !!takeOptions(setup, f, chart, freeBars, { ...s, band: true }, false).band, on: s.band !== false },
      playView: s.playView === 'highway' ? 'highway' as const : 'sheet' as const,
      line, under: said.under, thinking: !reply && !!coach && thinkingAbout(coach, t),
      coachError: coach?.status === 'idle' && !reply && t && coach.error ? coach.failure ?? 'error' : undefined,
      moves: this.moves(),
      goal: goalOf(setup, f, chart, freeBars),
      boxes: boxesOf(setup, f, p),
      myPads: myPadsOf(f, chart),
      lessonCard: lessonCardOf(setup, f, freeBars, s),
      take: t, outcome: o,
      results: t && o && !playing ? {
        card: takeCard(setup, f, chart, p, t, o),
        marks, timing: marks && timingLine(marks.offsets, marks.missed, t.stats.extra),
        latencyHint: latencyHint(t),
        fix: o.fixBar && !o.zoomed ? fixBar(o.fixBar, f.bpm) : undefined,
        fills: fills.map((x, k) => ({ bar: x.bar, n: k + 1, kept: this.kept.has(`${t.startedAt}/${x.bar}`) })),
        canShare: canShare(t),
        canHearRight: t.hits.length > 0,
        helpKey: this.helpKey(),
      } : undefined,
      timeUp: timeUp && !o?.itemDone,
      onBreak: this.onBreak,
      resting: f.resting ? { step: f.step, seconds: f.step.rest, listen: f.step.listen } : undefined,
      celebration,
      autoNext,
      canReset: !!s.lessons[this.lesson.id] && !f.oneTake,
      needsLatency: !!this.lesson.needsLatency && !s.latencyChecked,
    };
  }
}

/** "Count with me": the voice counts 8ths with you for the take (engine/lesson.ts countPlan). */
const countAlong = (chart: Chart) => countPlan(16, beatsPerBar(chart), '8ths', chart.timeSignature);

export type LessonView = ReturnType<LessonController['view']>;
