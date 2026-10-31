import { summarizeTake } from '../../packages/core/src/coach/summary.ts';
import type { Finished } from '../play/player';

/** Compact, model-friendly summary of a run (no raw MIDI): core's summarizeTake (shared with the iPad). */
export const summarizeRun = (f: Finished) => summarizeTake(f, { lesson: f.options.lesson });
