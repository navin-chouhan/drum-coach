// A compact, model-friendly summary of a take (no raw MIDI): what the coach routes read (POST /api/coach/feedback,
// the session's `take` event) and what a saved run keeps as summary_json. Core's summarizeTake, shared with the web.
import type { Finished } from '@drum-coach/core/play/take';

export { summarizeTake, type SummaryExtras as TakeExtras, type TakeSummary as RunSummary } from '@drum-coach/core/coach/summary';

/** The core take's finished result (the web player's `Finished`). */
export type TakeResult = Finished;
