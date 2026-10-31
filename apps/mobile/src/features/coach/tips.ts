// The live tips' wording, written by the coach ahead of time (ported from src/coach/aiTips.ts): once per exercise,
// via POST /api/coach/tips, and cached on the iPad so the rule-based live coach (core engine/liveCoach.ts) can use it
// offline in later sessions. The rules still decide when a tip fires; Claude is never in the real-time path.
import type { Chart } from '@drum-coach/core/engine/chart';
import type { Cue } from '@drum-coach/core/engine/liveCoach';
import type { KeyValueStore } from '@drum-coach/core/platform';
import type { CoachAsks } from './asks';

export type Tip = { text: string; spoken: string };
type Tips = Record<string, Tip>;

export const TIPS_KEY = 'drumcoach.coachTips';
/** Exercises whose wording is kept (the oldest asked is dropped first). */
export const MAX_TIP_SETS = 100;
/** The cue ids every exercise gets (src/coach/aiTips.ts BASE); `missing-<drum>` is added per drum in the chart. */
export const BASE_CUES = ['rushing', 'dragging', 'unsteady', 'extras', 'hh-open', 'accents', 'ghosts', 'even', 'praise'] as const;

export const chartKey = (c: { id?: string; title: string }) => c.id ?? c.title;
export const cueIdsFor = (chart: Pick<Chart, 'notes'>) => [...BASE_CUES, ...new Set(chart.notes.map(n => `missing-${n.drum}`))];

/** The coach's wording for a cue ("{ms}" filled in from the rule's measurement), or the cue as the rules wrote it. */
export function applyTip(t: Tip | undefined, cue: Cue): Cue {
  if (!t) return cue;
  const ms = cue.text.match(/(\d+) ms/)?.[1];
  const fill = (s: string) => (ms ? s.replace('{ms}', ms) : s.replace(/\s*\{ms\}\s*(ms)?/, ' ')).replace(/\s+/g, ' ').trim();
  return { ...cue, text: fill(t.text), spoken: fill(t.spoken).replace(/\d+\s*ms/, '').trim() || cue.spoken };
}

const isTip = (v: unknown): v is Tip => !!v && typeof v === 'object' && typeof (v as Tip).text === 'string' && typeof (v as Tip).spoken === 'string';

export type TipSettings = { aiTips: boolean; liveTips: 'off' | 'screen' | 'voice' };

export function createTipsCache(deps: {
  kv: KeyValueStore;
  asks: Pick<CoachAsks, 'ask'>;
  settings: () => TipSettings;
  /** Renders the spoken lines ahead of time (the voice's prepare), when there is one. */
  prepare?: (lines: string[]) => void;
}) {
  // insertion order = oldest first; the kv copy is read once
  let cache: Map<string, Tips> | undefined;
  const load = () => {
    if (cache) return cache;
    cache = new Map();
    try {
      const v: unknown = JSON.parse(deps.kv.get(TIPS_KEY) ?? '{}');
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k, tips] of Object.entries(v as Record<string, unknown>)) {
          if (!tips || typeof tips !== 'object') continue;
          const ok = Object.fromEntries(Object.entries(tips as Record<string, unknown>).filter(([, t]) => isTip(t))) as Tips;
          cache.set(k, ok);
        }
      }
    } catch { /* a broken copy: start empty */ }
    return cache;
  };
  const save = () => {
    const c = load();
    while (c.size > MAX_TIP_SETS) c.delete(c.keys().next().value!);
    deps.kv.set(TIPS_KEY, JSON.stringify(Object.fromEntries(c)));
  };

  const tipsFor = (chart: { id?: string; title: string } | undefined) => (chart ? load().get(chartKey(chart)) : undefined);
  return {
    tipsFor,
    has: (chart: { id?: string; title: string }) => load().has(chartKey(chart)),
    /** Asks for this exercise's tip wording once (saved for good), and pre-renders the spoken lines. */
    load(chart: Chart & { id?: string }, goal?: string) {
      const s = deps.settings(), key = chartKey(chart);
      if (!s.aiTips || s.liveTips === 'off' || load().has(key)) return Promise.resolve();
      return deps.asks.ask<{ tips: Tips }>(`tips:${key}`, 'tips',
        { title: chart.title, kind: chart.kind, level: chart.level, ...(goal && { goal: goal.slice(0, 400) }), cueIds: cueIdsFor(chart) },
        d => {
          const tips: Tips = Object.fromEntries(Object.entries(d?.tips ?? {}).filter((e): e is [string, Tip] => isTip(e[1])));
          load().delete(key);
          load().set(key, tips);
          save();
          deps.prepare?.(Object.values(tips).map(t => t.spoken.replace('{ms}', '').trim()));
        });
    },
    /** A cue in the coach's words, when it has written them for this exercise. */
    apply: (chart: { id?: string; title: string } | undefined, cue: Cue) => applyTip(tipsFor(chart)?.[cue.id], cue),
    /** For the take engine's `liveTips.wording` (core play/take TakeDeps). */
    wordingFor: (chart: { id?: string; title: string }) => (cue: Cue) => applyTip(tipsFor(chart)?.[cue.id], cue),
  };
}
export type TipsCache = ReturnType<typeof createTipsCache>;
