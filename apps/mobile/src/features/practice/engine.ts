// Practice's takes on the core take engine (createTake, @drum-coach/core/play/take): one take at a time, on the app's
// hit bus and the AudioPort, ticked ~10×/s, and a finished take saved to Storage in the web's run shape (the web's
// src/play/Results.tsx saveRun). Kept outside React so a take survives a re-render; screens subscribe.
import { createTake, type Finished, type Take } from '@drum-coach/core/play/take';
import { audio } from '../../platform/audio';
import { getMidiPort } from '../../platform/midi';
import { getStorage } from '../../platform/storage';
import { getAppHitBus, readSettings } from '../../ui';
import { createResultsFeed } from '../lesson/takePort';
import { runRecord, takeOptions, type TakeRequest } from './takeRecord';

export type { TakeRequest };

export type EngineState = { phase: 'idle' | 'starting' | 'playing' | 'done'; demo: boolean; chartId?: string; take?: Take; finished?: Finished; error?: string };

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
    take.onFinish(f => {
      const rec = runRecord(f, req.chart.id);
      set({ finished: f });
      if (rec) void getStorage().runs.add(rec).then(() => onSaved.forEach(l => l(f))).catch(() => set({ error: 'This take could not be saved.' }));
    });
    take.onEnd(() => { clearInterval(timer); timer = undefined; set({ phase: 'done' }); });
    set({ phase: 'starting', demo: !!req.demo, chartId: req.chart.id, take, finished: undefined, error: undefined });
    timer = setInterval(() => { const n = clock.now(); take.tick(n); feed.misses(take.state, n); }, 100);
    take.start().catch(e => { clearInterval(timer); set({ phase: 'idle', error: `The take could not start: ${e instanceof Error ? e.message : 'audio error'}` }); });
    return true;
  },
  stop() {
    const t = state.take;
    if (t && (t.state.phase === 'playing' || t.state.phase === 'starting')) t.stop('user');
    clearInterval(timer); timer = undefined;
  },
};
