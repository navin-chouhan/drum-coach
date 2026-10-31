// Practice's takes on the core take engine (createTake, @drum-coach/core/play/take): one take at a time, on the app's
// hit bus and the AudioPort, ticked ~10×/s, and a finished take saved to Storage in the web's run shape (the web's
// src/play/Results.tsx saveRun). Kept outside React so a take survives a re-render; screens subscribe.
import { createTake, type Finished, type Take } from '@drum-coach/core/play/take';
import { AppState } from 'react-native';
import { audio } from '../../platform/audio';
import { startWithSpokenFallback } from '../../play/spokenFallback';
import { sayNow, speakMoment } from '../coach/voice';
import { scoreMoment } from '../coach/moments';
import { watchInterruptions } from '../../platform/audioLifecycle';
import { getMidiPort } from '../../platform/midi';
import { getStorage } from '../../platform/storage';
import { getAppHitBus, readSettings } from '../../ui';
import { createResultsFeed } from '../lesson/takePort';
import { runRecord, takeOptions, type TakeRequest } from './takeRecord';

export type { TakeRequest };

export type EngineState = {
  phase: 'idle' | 'starting' | 'playing' | 'done'; demo: boolean; chartId?: string; take?: Take; finished?: Finished; error?: string;
  /** An interruption ended the last take (D6): 'kept' with its whole bars (flagged, not for Climb), or 'dropped' under 2. */
  interrupted?: 'kept' | 'dropped';
};

/** What Practice says after an interrupted take (D6). */
export const interruptedNote = (i: EngineState['interrupted']) =>
  i === 'dropped' ? 'The take was interrupted before 2 whole bars, so it wasn\u2019t kept.'
    : i === 'kept' ? 'The take was interrupted: its whole bars are kept, marked interrupted (Climb ignores it).' : '';

let state: EngineState = { phase: 'idle', demo: false };
const listeners = new Set<() => void>();
const set = (s: Partial<EngineState>) => { state = { ...state, ...s }; listeners.forEach(l => l()); };
let timer: ReturnType<typeof setInterval> | undefined;
const onSaved = new Set<(f: Finished) => void>();
const latencyMs = () => readSettings(getStorage().kv).latencyMs;
// The take's results as events, for the sheet's colours (NotationView `results`, as in the lesson player).
const feed = createResultsFeed(latencyMs);

export const practiceEngine = {
  /** The take engine plays wherever the audio module is in the build. */
  get ready() { return audio.available; },
  notReady: 'Playing needs the iPad build with its audio engine.',
  get: () => state,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  /** After a scored take is saved (Climb and the screen's history read the runs then). */
  onSaved(fn: (f: Finished) => void) { onSaved.add(fn); return () => { onSaved.delete(fn); }; },
  /** Judged notes (index = the take's run note), extra strokes and misses of the take that's playing. */
  results: feed.subscribe,
  start(req: TakeRequest): boolean {
    if (!audio.available) return false;
    practiceEngine.stop();
    const clock = getMidiPort().clock;
    const take = createTake({
      clock, audio, onHit: fn => getAppHitBus().onHit(h => { fn(h); feed.afterHit(take.state, h); }),
      settings: () => { const s = readSettings(getStorage().kv); return { latencyMs: s.latencyMs, countIn: s.countIn, liveTips: s.liveTips, chattiness: s.chattiness }; },
    }, req.chart, takeOptions(req));
    feed.reset(take.state);
    take.onChange(() => set({ phase: take.state.phase }));
    take.onCue(c => speakMoment({ kind: 'tip', text: c.spoken })); // spoken by default (D10)
    take.onFinish(f => {
      if (!req.demo) speakMoment(scoreMoment(f.stats)); // voice first: the score after every take (D10)
      const rec = runRecord(f, req.chart.id);
      set({ finished: f });
      if (rec) void getStorage().runs.add(rec).then(() => onSaved.forEach(l => l(f))).catch(() => set({ error: 'This take could not be saved.' }));
    });
    // D6: a call, Siri, an alarm or the app going to the background ends the take at its last whole bar.
    // A route change ends it too (AUDIO-DESIGN §3.3); it ends where native says it began (QA2 m6).
    const interrupt = (at?: number) => { if (take.state.phase === 'playing' || take.state.phase === 'starting') take.stop('interrupted', at); };
    const offInt = watchInterruptions(audio, AppState, interrupt);
    take.onEnd(e => {
      clearInterval(timer); timer = undefined; offInt();
      set({ phase: 'done', ...(e.reason === 'interrupted' && !req.demo && { interrupted: e.finished ? 'kept' as const : 'dropped' as const }) });
    });
    set({ phase: 'starting', demo: !!req.demo, chartId: req.chart.id, take, finished: undefined, error: undefined, interrupted: undefined });
    timer = setInterval(() => { const n = clock.now(); take.tick(n); feed.misses(take.state, n); }, 100);
    // the count-in words the engine couldn't render are said live (play/spokenFallback.ts)
    startWithSpokenFallback(take, { countVoice: readSettings(getStorage().kv).countIn, now: () => clock.now(), say: w => sayNow(w), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: h => clearTimeout(h as ReturnType<typeof setTimeout>) }).catch(e => { clearInterval(timer); offInt(); set({ phase: 'idle', error: `The take could not start: ${e instanceof Error ? e.message : 'audio error'}` }); });
    return true;
  },
  stop() {
    const t = state.take;
    if (t && (t.state.phase === 'playing' || t.state.phase === 'starting')) t.stop('user');
    clearInterval(timer); timer = undefined;
  },
};
