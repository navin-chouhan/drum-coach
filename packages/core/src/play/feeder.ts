// Hands a plan to the AudioPort in chunks (AUDIO-DESIGN §1.2): called from tick (~10×/s), it keeps at least AHEAD_MS
// of sound handed over, topping up CHUNK_MS at a time. Shared by createTake and createMetronome.
import type { AudioPort } from './audioPort.ts';
import { planEvents, type PlanSpec } from './plan.ts';

/** Always keep at least this much of the plan in native (a JS stall shorter than this changes nothing). */
export const AHEAD_MS = 2000;
/** Each top-up plans up to this far ahead. */
export const CHUNK_MS = 4000;
/** The least time from planning beat 0 to hearing it (the web's 150 ms lead becomes 300 ms on iOS). */
export const MIN_LEAD_MS = 300;

/** The lead from now to the first sound: max(300, route.minLeadMs + 100). */
export const leadMs = (audio: Pick<AudioPort, 'route'>) => Math.max(MIN_LEAD_MS, (audio.route()?.minLeadMs ?? 0) + 100);

/** What the feeder handed over. `late` = events already too late (dropped here, plus what the port reported late). */
export type FeedStats = { chunks: number; events: number; accepted: number; late: number; plannedTo: number };

export function createFeeder(audio: Pick<AudioPort, 'schedule' | 'route'>, spec: PlanSpec, fromBeat: number) {
  const stats: FeedStats = { chunks: 0, events: 0, accepted: 0, late: 0, plannedTo: fromBeat };
  /** Plans up to CHUNK_MS ahead when less than AHEAD_MS is handed over; never past `endBeat`. */
  function topUp(now: number, endBeat = spec.endBeat) {
    const from = stats.plannedTo;
    if (from >= endBeat || spec.zero + from * spec.beatMs >= now + AHEAD_MS) return;
    const to = Math.min(endBeat, (now + CHUNK_MS - spec.zero) / spec.beatMs);
    if (!(to > from)) return;
    stats.plannedTo = to;
    const minAt = now + (audio.route()?.minLeadMs ?? 0);
    const all = planEvents(spec, from, to), events = all.filter(e => e.at >= minAt); // after a long stall: drop, never play late
    stats.chunks++;
    stats.events += all.length;
    stats.late += all.length - events.length;
    if (!events.length) return;
    const r = audio.schedule(events);
    stats.accepted += r.accepted;
    stats.late += r.late;
  }
  return { topUp, stats };
}
