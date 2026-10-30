// The streams the play surfaces listen to. Pure TypeScript: no React Native, so the take engine (A1/A4's createTake)
// can produce them on any platform and tests can drive them.
import type { DrumId, PadId } from './chartLike';
import type { ResultKind } from './theme';

/** Subscribe to a stream; returns the unsubscribe function (the same shape as the web's onHit). */
export type Subscribe<T> = (listener: (event: T) => void) => () => void;

/** A stroke on a pad (kit, touch pads or replay). `at` is Clock ms of the stroke as played (latency not removed). */
export type PadHit = { pad: PadId; velocity: number; at: number };

/** The scoring judgements of src/engine/scoring.ts (Judgement). */
export type Judgement = 'perfect' | 'good' | 'miss';

/**
 * A judged chart note or an extra stroke, as the take engine decides it.
 * - judged: `index` into the chart's notes (the order NoteHighway was given); `offsetMs` < 0 = early; `at` = Clock ms
 *   of the stroke (or of the miss decision).
 * - extra: a stroke that belongs to no note; `at` = Clock ms of the stroke as played (NoteHighway removes latencyMs).
 */
export type PlayResult =
  | { kind: 'judged'; index: number; lane: DrumId; judgement: Judgement; offsetMs?: number; at: number; pad?: PadId }
  | { kind: 'extra'; lane: DrumId; at: number; pad?: PadId };

/** What a result looks like: perfect = on it, good = early or late by its sign, miss = missed. */
export function resultKind(r: PlayResult): ResultKind {
  if (r.kind === 'extra') return 'extra';
  if (r.judgement === 'perfect') return 'onIt';
  if (r.judgement === 'miss') return 'missed';
  return (r.offsetMs ?? 0) < 0 ? 'early' : 'late';
}

/** "+48 ms" / "−62 ms" under an early or late note; empty for the rest. */
export function offsetLabel(kind: ResultKind, offsetMs: number | undefined): string {
  if ((kind !== 'early' && kind !== 'late') || offsetMs === undefined) return '';
  const ms = Math.round(offsetMs);
  return `${ms < 0 ? '−' : '+'}${Math.abs(ms)} ms`;
}

/** A tiny synchronous event stream (dev fixtures, adapters). Listener errors don't stop the others. */
export function createStream<T>(): { emit(event: T): void; subscribe: Subscribe<T>; size(): number } {
  const listeners = new Set<(event: T) => void>();
  return {
    emit(event) {
      for (const l of [...listeners]) {
        try {
          l(event);
        } catch (e) {
          console.warn('play stream listener failed', e);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    size: () => listeners.size,
  };
}
