import { useSyncExternalStore } from 'react';
import { saveChart } from '../content/charts';
import { getSettings } from '../input/settings';
import { player } from '../play/player';
import { requestLesson, requestPlay } from '../ui/nav';
import { listenForAnswer, transcribe } from '../voice/listen';
import { sayNext, untilQuiet } from '../voice/voice';
import type { Chart } from '../engine/chart';
import type { Finished } from '../play/player';
import { summarizeRun } from './summary';
import type { CoachReply, SessionEvent } from './schemas';

// The live coach (server/ai/session.ts): every open / take / spoken answer goes into one remembering conversation.
// Replies stream sentence by sentence (spoken as they arrive); the suggested next step is one tap or one "yes".

export type CoachState = { status: 'idle' | 'thinking' | 'listening' | 'hearing'; reply?: CoachReply; heard?: string; error?: string; at: number };
let state: CoachState = { status: 'idle', at: 0 };
const listeners = new Set<() => void>();
const set = (s: Partial<CoachState>) => { state = { ...state, ...s }; listeners.forEach(l => l()); };
export const useCoach = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);

// Play screens register how to carry out the coach's actions (again, slower, faster, next).
type ActionHandler = (a: NonNullable<CoachReply['action']>) => boolean;
const handlers: ActionHandler[] = [];
export function onCoachAction(fn: ActionHandler) {
  handlers.unshift(fn);
  return () => {
    handlers.splice(handlers.indexOf(fn), 1);
    // The last screen that could carry out a suggestion closed (re-renders re-register before the microtask).
    queueMicrotask(() => { if (!handlers.length) dropCoachAction(); });
  };
}

/** Leaving the screen a suggestion was for: keep the coach's words, drop its button (a drill can start anywhere). */
export function dropCoachAction() {
  if (state.reply?.action && state.reply.action.kind !== 'drill') set({ reply: { ...state.reply, action: undefined } });
}

export async function runAction(a: NonNullable<CoachReply['action']>) {
  if (a.kind === 'drill' && a.chartId?.startsWith('lesson/')) { requestLesson(a.chartId.split('/')[1]); return; } // lesson steps live on Journey
  if (a.kind === 'drill' && (a.chart || a.chartId)) {
    const id = a.chart ? (await saveChart(a.chart, 'ai')).id : a.chartId!;
    requestPlay({ chartId: id, bpm: a.bpm });
    return;
  }
  handlers.find(h => h(a));
}

let seq = 0;
/** Tells the coach what just happened; speaks and shows its answer. */
export async function coachEvent(event: SessionEvent) {
  if (!getSettings().liveCoach) return;
  const my = ++seq;
  set({ status: 'thinking', error: undefined, at: Date.now() });
  try {
    const res = await fetch('/api/coach/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `Coach unavailable (${res.status})`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '', reply: CoachReply | undefined;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const name = block.match(/^event: (\w+)/m)?.[1], data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? 'null');
        if (name === 'say' && getSettings().voice) void sayNext(data);
        if (name === 'reply') reply = data;
        if (name === 'error') throw new Error(data.error);
      }
    }
    if (my !== seq) return; // a newer event took over
    // Only the student's own "yes" starts something; the model sometimes sets `now` after a plain take (then it's a button).
    if (reply?.action?.now && event.type !== 'said') reply = { ...reply, action: { ...reply.action, now: false } };
    set({ status: 'idle', reply, at: Date.now() });
    if (reply?.action?.now) void runAction(reply.action);
    else if (reply?.ask && getSettings().handsFree && player.phase !== 'playing') void handsFree();
  } catch (e) {
    if (my === seq) set({ status: 'idle', error: (e as Error).message, at: Date.now() });
  }
}

/** After the coach asks something: listen for a few seconds (no button needed), then answer. */
async function handsFree() {
  await untilQuiet();
  if (player.phase === 'playing') return;
  try {
    set({ status: 'listening' });
    const blob = await listenForAnswer();
    if (!blob) { set({ status: 'idle' }); return; }
    set({ status: 'hearing' });
    const text = await transcribe(blob);
    set({ status: 'idle' });
    if (text) void say(text);
  } catch { set({ status: 'idle' }); }
}

/** Something the student said to the coach. */
export function say(text: string) {
  set({ heard: text });
  const f = player.finished;
  const playing = player.phase === 'playing', played = player.chart && player.options ? Math.round(player.chart.bpm * player.options.speed) : undefined;
  return coachEvent({ type: 'said', text, doing: playing ? 'playing right now' : 'between takes',
    exercise: playing || !lastOpen.title ? player.chart?.title : lastOpen.title, bpm: playing || !lastOpen.title ? played : lastOpen.bpm,
    proposed: state.reply?.action, lastTakeAccuracyPct: f?.stats.accuracy });
}

const toldTakes = new WeakSet<Finished>();
let lastOpen = { id: '', at: 0, title: '', bpm: 0 }; // the exercise on screen (what "this" means between takes)
/** A finished take (once per take; lessons add their verdict). Wait mode isn't a real take. */
export function coachTake(f: Finished, lesson?: Record<string, unknown>) {
  if (toldTakes.has(f) || f.options.wait || !f.stats.total) return;
  toldTakes.add(f);
  void coachEvent({ type: 'take', ...summarizeRun(f), ...(lesson && { lessonResult: lesson }) });
}
/** Opened an exercise or lesson step. Re-opening the same one within 3 minutes isn't news; switching back to it is. */
export function coachOpen(chart: Chart & { id?: string }, bpm: number, goal?: string) {
  const id = chart.id ?? chart.title;
  if (id === lastOpen.id && Date.now() - lastOpen.at < 180_000) return;
  lastOpen = { id, at: Date.now(), title: chart.title, bpm: Math.round(bpm) };
  void coachEvent({ type: 'open', chartId: id, title: chart.title, kind: chart.kind, level: chart.level, bpm: Math.round(bpm), goal: goal ?? chart.description });
}
