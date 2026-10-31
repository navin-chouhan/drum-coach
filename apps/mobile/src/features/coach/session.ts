// The live coach (ported from src/coach/session.ts; the server side is server/ai/session.ts): every finished take and
// every question goes into one remembering conversation on the home server (POST /api/coach/session, server-sent
// events over HomeServer.stream). Replies stream sentence by sentence (spoken as they arrive, never over a take);
// the suggested next step is one tap, one "yes" from the kit (hi-hat pedal × 3 / crash × 2), or one typed "yes".
//
// iPad differences, all from the mockup (coach, coach-offline): the panel shows the conversation as a thread; when
// the server can't be reached, the panel says what failed and keeps ONE question to send when the coach is back
// (the web has no queue). Hands-free listening is left out: the iPad has no speech-to-text yet (RECON: later).
import { CoachReplySchema, type CoachReply, type SessionEvent } from '@drum-coach/core/coach/schemas';
import type { Chart } from '@drum-coach/core/engine/chart';
import type { TakeResult } from './summary';
import type { CoachContext } from '../../data/coachContext';
import type { HomeServer } from '../../platform/contracts';
import { coachError, coachProblem, readFallbackKey, type CoachProblem, type FallbackKeyRead } from './problem';
import { summarizeTake, type RunSummary, type TakeExtras } from './summary';

/** A take as the session tells it: the core take result (compared by identity, as the web compares `Finished`). */
export type SessionTake = Pick<TakeResult, 'stats' | 'run' | 'chart' | 'options' | 'cues' | 'startedAt'>;

export type Action = NonNullable<CoachReply['action']>;
// Play screens register how to carry out the coach's actions (again, slower, faster, next…), plus two moves from the
// kit: "main" (yes with no suggestion on the table: the screen's own next move) and "listen".
export type Act = Action | { kind: 'main' | 'listen'; label: string; bpm?: number; bar?: number };
type ActionHandler = (a: Act) => boolean;

export type ThreadItem =
  | { id: number; who: 'ctx'; text: string }
  | { id: number; who: 'coach'; text: string; show?: string; action?: Action }
  | { id: number; who: 'me'; text: string; via: 'typed' | 'kit'; queued?: boolean }
  | { id: number; who: 'app'; text: string };

type NewItem = ThreadItem extends infer T ? T extends ThreadItem ? Omit<T, 'id'> : never : never;

export type CoachState = {
  status: 'idle' | 'thinking';
  reply?: CoachReply;
  /** What the coach has said so far of the answer on its way (the `say` sentences). */
  streaming?: string;
  heard?: string;
  error?: string;
  problem?: CoachProblem;
  at: number;
  /** The take the reply is about / the take being thought about; none for a question. */
  take?: SessionTake;
  thinking?: SessionTake;
  thread: ThreadItem[];
  /** The one question waiting for the coach to be back. */
  queued?: string;
};

export const MAX_THREAD = 40;

/** The coach's answer to the take on screen `f` (a slow answer about an earlier take, e.g. the last lesson's, isn't). */
export const replyFor = (s: CoachState, f: SessionTake | undefined, openedAt: number) =>
  s.reply && (s.take ? s.take === f : s.at > Math.max(openedAt, f ? Date.parse(f.startedAt) : 0)) ? s.reply : undefined;

/**
 * The big coach line: the coach's answer to this take (its short screen line, else what it said), or the app's
 * verdict. A big moment (a record, a rank up, a finished lesson) keeps the app's verdict, with the coach's words under it.
 */
export function coachLine(verdict: string | undefined, reply: { say: string; show?: string } | undefined, big: boolean): { line?: string; under?: string } {
  if (!reply) return { line: verdict };
  const words = reply.show ?? reply.say;
  return big && verdict ? { line: verdict, under: words } : { line: words };
}

/** The coach is thinking about the take on screen. */
export const thinkingAbout = (s: CoachState, f: SessionTake | undefined) => s.status === 'thinking' && !!f && (!s.thinking || s.thinking === f);

/**
 * The coach's suggestion as the screen shows it. "next" gets the screen's own label (the coach once offered a
 * "Next posture step" that doesn't exist); a drill with no chart and no existing target is dropped (its words stay).
 */
export function screenAction(a: Action | undefined, nextLabel: string, exists: (chartId: string) => boolean): Action | undefined {
  if (!a) return undefined;
  if (a.kind === 'next') return { ...a, label: nextLabel };
  if (a.kind === 'drill' && !a.chart && !(a.chartId && exists(a.chartId))) return undefined;
  return a;
}

/** The thread's context chip, e.g. "The money beat · take 2 · 70 BPM" (mockup coach). */
export const takeLabel = (title: string, n: number, bpm: number) => `${title} · take ${n} · ${Math.round(bpm)} BPM`;

/** The app's own verdict when the coach can't answer (mockup coach-offline "From the app"): the lesson's, else the count. */
export function appVerdict(summary: Pick<RunSummary, 'notes' | 'perfect' | 'good' | 'meanOffsetMs'>, lessonVerdict?: string): string {
  if (lessonVerdict) return lessonVerdict;
  const landed = summary.perfect + summary.good, off = Math.round(summary.meanOffsetMs);
  const timing = Math.abs(off) < 10 ? 'Right on the beat on average.' : `On average ${Math.abs(off)} ms ${off < 0 ? 'early' : 'late'}.`;
  return `${landed} of ${summary.notes} landed. ${timing}`;
}

export type SessionDeps = {
  server: Pick<HomeServer, 'stream' | 'configured' | 'health'>;
  /** The session route's context (runs, settings, plan, teacher notes). May reject: an empty one is sent. */
  context(): Promise<CoachContext>;
  settings(): { liveCoach: boolean; voice: boolean };
  /** A take is running (the coach never talks over one, and "this" means what's playing). */
  isPlaying(): boolean;
  /** What's on screen while playing, for a question asked mid-take. */
  playing?(): { exercise?: string; bpm?: number; lesson?: string } | undefined;
  /** Says a streamed sentence after whatever is being said (the iPad's voice). */
  sayNext?(text: string): void;
  /** Saves a chart the coach wrote (charts.ts) and returns its id. */
  saveChart(chart: Chart): { id: string };
  exists: (chartId: string) => boolean;
  nav: { openLesson(id: string): void; openDrill(t: { chartId: string; bpm?: number }): void };
  /** Whether an Anthropic key is in the Keychain (the "no fallback" line); read when a call fails. */
  hasFallbackKey?: FallbackKeyRead;
  now?: () => number;
  /** Runs `fn` after the current task (queueMicrotask). */
  later?: (fn: () => void) => void;
};

export function createCoachSession(deps: SessionDeps) {
  const now = deps.now ?? (() => Date.now());
  const later = deps.later ?? ((fn: () => void) => { void Promise.resolve().then(fn); });
  let state: CoachState = { status: 'idle', at: 0, thread: [] };
  const listeners = new Set<() => void>();
  const set = (s: Partial<CoachState>) => { state = { ...state, ...s }; listeners.forEach(l => l()); };
  let nextId = 1;
  const push = (...items: NewItem[]) => {
    const thread = [...state.thread, ...items.map(i => ({ ...i, id: nextId++ }))];
    return thread.slice(-MAX_THREAD);
  };

  const handlers: ActionHandler[] = [];
  /** A screen that can carry out the coach's actions; the newest one is asked first. Returns the unregister. */
  function onCoachAction(fn: ActionHandler) {
    handlers.unshift(fn);
    return () => {
      const i = handlers.indexOf(fn);
      if (i >= 0) handlers.splice(i, 1);
      // The last screen that could carry out a suggestion closed (re-renders re-register before this runs).
      later(() => { if (!handlers.length) dropCoachAction(); });
    };
  }
  /** Leaving the screen a suggestion was for: keep the coach's words, drop its button (a drill can start anywhere, unless `all`). */
  function dropCoachAction(all = false) {
    if (state.reply?.action && (all || state.reply.action.kind !== 'drill')) set({ reply: { ...state.reply, action: undefined } });
  }
  /** Something on screen can carry this out (a drill opens its own exercise from anywhere). */
  const canRunAction = (a: Action) => a.kind === 'drill' || handlers.length > 0;

  function runAction(a: Act) {
    if (a.kind === 'drill' && a.chartId?.startsWith('lesson/')) { deps.nav.openLesson(a.chartId.split('/')[1]); return; } // lesson steps live on Journey
    if (a.kind === 'drill' && (a.chart || a.chartId)) {
      const id = a.chart ? deps.saveChart(a.chart).id : a.chartId!;
      deps.nav.openDrill({ chartId: id, bpm: a.bpm });
      return;
    }
    handlers.find(h => h(a));
  }

  /** A pad command between takes: "yes" takes the coach's suggestion (or the screen's main move). */
  function padAction(cmd: 'yes' | 'slower' | 'faster' | 'next' | 'listen') {
    if (!handlers.length) return; // e.g. hitting pads on the calibration screen
    runAction(cmd === 'yes' ? screenAction(state.reply?.action, 'Next', deps.exists) ?? { kind: 'main', label: 'Yes' } : { kind: cmd, label: cmd });
  }

  let seq = 0;
  let lastFailed: { event: SessionEvent; take?: SessionTake } | undefined;

  /** Tells the coach what just happened; speaks and shows its answer. Resolves when the answer is in (or failed). */
  async function coachEvent(event: SessionEvent, take?: SessionTake): Promise<void> {
    if (!deps.settings().liveCoach) return;
    const my = ++seq;
    // the reply on screen keeps its own take until the new one arrives
    set({ status: 'thinking', error: undefined, problem: undefined, streaming: undefined, at: now(), thinking: take });
    let context: CoachContext = {};
    try { context = await deps.context(); } catch { /* storage unreadable: an empty context, never the server's data */ }
    let reply: CoachReply | undefined, failed: string | undefined, said = '';
    const r = await deps.server.stream('/api/coach/session', { ...event, context }, e => {
      if (my !== seq) return;
      if (e.event === 'say' && typeof e.json === 'string') {
        said = said ? `${said} ${e.json}` : e.json;
        set({ streaming: said });
        if (deps.settings().voice && !deps.isPlaying()) deps.sayNext?.(e.json); // never over a take
      } else if (e.event === 'reply') {
        const p = CoachReplySchema.safeParse(e.json);
        if (p.success) reply = p.data; else failed = "The coach's answer didn't match the expected format.";
      } else if (e.event === 'error') {
        failed = (e.json as { error?: unknown } | undefined)?.error?.toString() || 'The coach couldn’t answer';
      }
    });
    if (my !== seq) return; // a newer event took over
    const failedTo = (problem: CoachProblem) => {
      lastFailed = { event, take };
      const queue = event.type === 'said' && problem.canQueue && typeof event.text === 'string';
      let thread = state.thread;
      if (queue) {
        // One question waits: the one just asked (its latest "me" item). An older waiting one is dropped.
        const text = event.text as string;
        let at = -1;
        for (let i = thread.length - 1; i >= 0; i--) { const it = thread[i]; if (it.who === 'me' && it.text === text) { at = i; break; } }
        thread = thread.flatMap((it, i) => (i === at && it.who === 'me' ? [{ ...it, queued: true }] : it.who === 'me' && it.queued ? [] : [it]));
      }
      set({ status: 'idle', streaming: undefined, error: problem.lines[0] ?? problem.title, problem, at: now(), thread, ...(queue && { queued: event.text as string }) });
    };
    if (!r.ok) {
      const hasKey = await readFallbackKey(deps.hasFallbackKey);
      if (my !== seq) return; // a newer event took over while the Keychain was read
      return failedTo(coachProblem(r, { url: deps.server.configured()?.url, hasFallbackKey: hasKey }));
    }
    if (r.cancelled) { set({ status: 'idle', streaming: undefined }); return; }
    if (failed || !reply) return failedTo(coachError(failed ?? 'The coach didn’t answer.'));
    lastFailed = undefined;
    // Only the student's own "yes" starts something; the model sometimes sets `now` after a plain take (then it's a button).
    if (reply.action?.now && event.type !== 'said') reply = { ...reply, action: { ...reply.action, now: false } };
    const wasQueued = event.type === 'said' && state.queued === event.text;
    set({
      status: 'idle', reply, streaming: undefined, at: now(), take, ...(wasQueued && { queued: undefined }),
      thread: push({ who: 'coach', text: reply.say, ...(reply.show && { show: reply.show }), ...(reply.action && { action: reply.action }) })
        .map(t => (wasQueued && t.who === 'me' && t.queued ? { ...t, queued: false } : t)),
    });
    if (reply.action?.now && screenAction(reply.action, 'Next', deps.exists)) runAction(reply.action);
  }

  let lastOpen = { id: '', at: 0, title: '', bpm: 0 }; // the exercise on screen (what "this" means between takes)
  let lastTake: { take: SessionTake; summary: RunSummary } | undefined;
  const toldTakes = new WeakSet<object>();
  const takesPer = new Map<string, number>();

  /** Something the student asked or answered (typed, or "yes" from the kit's words). */
  function say(text: string, via: 'typed' | 'kit' = 'typed') {
    const t = text.trim();
    if (!t) return Promise.resolve();
    const playing = deps.isPlaying(), p = playing ? deps.playing?.() : undefined;
    set({ heard: t, thread: push({ who: 'me', text: t, via }) });
    return coachEvent({
      type: 'said', text: t, doing: playing ? 'playing right now' : 'between takes',
      exercise: playing || !lastOpen.title ? p?.exercise ?? lastTake?.take.chart.title : lastOpen.title,
      bpm: playing || !lastOpen.title ? p?.bpm ?? lastTake?.summary.tempo.bpm : lastOpen.bpm,
      proposed: state.reply?.action, lastTakeAccuracyPct: lastTake?.take.stats.accuracy,
      lesson: p?.lesson ?? (lastTake?.summary.lesson?.lesson) ?? (lastOpen.id.startsWith('lesson/') ? lastOpen.title : undefined), // the coach's tool switches need a lesson
    });
  }

  /**
   * A finished take (once per take; lessons add their verdict as `lesson`, e.g. { lesson, step, passed, verdict }).
   * Wait mode and empty takes aren't real takes.
   */
  function coachTake(f: SessionTake, o: TakeExtras & { wait?: boolean } = {}) {
    if (toldTakes.has(f) || o.wait || !f.stats.total) return Promise.resolve();
    toldTakes.add(f);
    const summary = summarizeTake(f, o);
    lastTake = { take: f, summary };
    const key = summary.exercise.id ?? f.chart.title, n = (takesPer.get(key) ?? 0) + 1;
    takesPer.set(key, n);
    set({ thread: push({ who: 'ctx', text: takeLabel(f.chart.title, n, f.chart.bpm * f.options.speed) }) });
    const verdict = typeof o.lesson?.verdict === 'string' ? o.lesson.verdict : undefined;
    return coachEvent({ type: 'take', ...summary, ...(o.lesson && { lessonResult: o.lesson }) }, f).then(() => {
      // The coach couldn't answer this take: the app's own verdict stands in (mockup coach-offline "From the app").
      if (lastFailed?.take === f && state.problem) set({ thread: push({ who: 'app', text: appVerdict(summary, verdict) }) });
    });
  }

  /** Opened an exercise or lesson step: remembered so "this" in a question means it. No coach call (not worth one). */
  function coachOpen(chart: { id?: string; title: string }, bpm: number) {
    lastOpen = { id: chart.id ?? chart.title, at: now(), title: chart.title, bpm: Math.round(bpm) };
  }

  /** "Try again": the waiting question if there is one, else the call that failed. */
  function retry() {
    if (state.queued) return sendQueued();
    if (lastFailed) { const { event, take } = lastFailed; return coachEvent(event, take); }
    return Promise.resolve();
  }
  function sendQueued() {
    const text = state.queued;
    if (!text) return Promise.resolve();
    return coachEvent({ type: 'said', text, doing: 'between takes', ...(lastOpen.title && { exercise: lastOpen.title, bpm: lastOpen.bpm }), proposed: state.reply?.action });
  }
  /** Checks whether the coach is back (GET /api/health) and sends the waiting question if it is. */
  async function checkBack(): Promise<boolean> {
    if (state.status === 'thinking') return false;
    const h = await deps.server.health();
    if (!h.ok) return false;
    if (state.queued) await sendQueued();
    else if (state.problem?.canQueue) set({ problem: undefined, error: undefined });
    return true;
  }

  return {
    get: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    onCoachAction, dropCoachAction, canRunAction, runAction, padAction,
    coachEvent, coachTake, coachOpen, say, retry, checkBack,
    /** Drops the waiting question. */
    unqueue() { if (state.queued) set({ queued: undefined, thread: state.thread.filter(t => !(t.who === 'me' && t.queued)) }); },
    /** The suggestion as this screen shows it (exists from the deps). */
    screenAction: (a: Action | undefined, nextLabel: string) => screenAction(a, nextLabel, deps.exists),
  };
}
export type CoachSession = ReturnType<typeof createCoachSession>;
