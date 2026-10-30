// A fake take for app/dev/play.tsx: a chart, a replayed "student" and a tiny judge. Core-agnostic on purpose: it is
// NOT the core's scoring (src/engine/scoring.ts); A1/A4's createTake replaces it once it lands.
import { laneOf, PAD_DRUM, type ChartDrum, type ChartLike, type ChartNoteLike, type PadId } from '../chartLike';
import type { Judgement, PadHit, PlayResult } from '../events';

/** "The money beat" (iPad mockups): hi-hat eighths, snare on 2 and 4, kick on 1 and 3. */
export function moneyBeat(bars = 4, bpm = 70): ChartLike {
  const notes: ChartNoteLike[] = [];
  for (let b = 0; b < bars; b++) {
    for (let e = 0; e < 8; e++) {
      const t = b * 4 + e / 2;
      notes.push({ t, drum: 'hihat', stick: 'R' });
      if (e === 0 || e === 4) notes.push({ t, drum: 'kick' });
      if (e === 2 || e === 6) notes.push({ t, drum: 'snare', stick: 'L' });
    }
  }
  return { title: 'The money beat', bpm, timeSignature: [4, 4], bars, notes };
}

/** A pad that plays a chart drum (the hi-hat lane plays closed unless the note asks for open). */
export function padFor(drum: ChartDrum): PadId {
  if (drum === 'hihat') return 'hhClosed';
  return drum;
}

export type ReplayHit = PadHit & { note?: number };

/**
 * A deterministic student: mostly within ±15 ms, every 7th stroke 48 ms late, every 11th 62 ms early, every 17th note
 * skipped, and one extra snare on the "e" of 3 in bar 2. `zero` = Clock ms of beat 0.
 */
export function replayHits(chart: ChartLike, zero: number, beatMs: number): ReplayHit[] {
  const hits: ReplayHit[] = [];
  chart.notes.forEach((n, i) => {
    if (n.auto || i % 17 === 16) return;
    const jitter = ((i * 37) % 31) - 15;
    const offset = i % 7 === 6 ? 48 : i % 11 === 10 ? -62 : jitter;
    hits.push({ pad: padFor(n.drum), velocity: n.accent ? 120 : n.ghost ? 40 : 96, at: zero + n.t * beatMs + offset, note: i });
  });
  if (chart.bars >= 2) hits.push({ pad: 'snare', velocity: 70, at: zero + 6.25 * beatMs });
  return hits.sort((a, b) => a.at - b.at);
}

export type JudgeWindows = { perfect: number; good: number; near: number };
/** src/engine/scoring.ts WINDOWS; touch can widen Good (mockup: "touch timing: scored a little looser"). */
export const FIXTURE_WINDOWS: JudgeWindows = { perfect: 40, good: 100, near: 250 };

/**
 * Nearest-note judge: a stroke takes the closest open note on its lane within `near`; within `good` it's a hit
 * (perfect within `perfect`), else that note is missed. No note in reach = an extra. `tick` misses notes whose
 * window has passed. Times are Clock ms with latency already removed.
 */
export function createFixtureJudge(chart: ChartLike, zero: number, beatMs: number, w: JudgeWindows = FIXTURE_WINDOWS) {
  const due = chart.notes.map(n => zero + n.t * beatMs);
  const open = chart.notes.map(n => !n.auto);
  const judged = (index: number, judgement: Judgement, at: number, offsetMs?: number, pad?: PadId): PlayResult => {
    open[index] = false;
    return { kind: 'judged', index, lane: laneOf(chart.notes[index].drum), judgement, at, offsetMs, pad };
  };
  return {
    hit(pad: PadId, at: number): PlayResult {
      const lane = PAD_DRUM[pad];
      let best = -1, bestAbs = Infinity;
      chart.notes.forEach((n, i) => {
        if (!open[i] || laneOf(n.drum) !== lane) return;
        const d = Math.abs(at - due[i]);
        if (d <= w.near && d < bestAbs) {
          best = i;
          bestAbs = d;
        }
      });
      if (best < 0) return { kind: 'extra', lane, at, pad };
      const offset = at - due[best];
      const j: Judgement = bestAbs <= w.perfect ? 'perfect' : bestAbs <= w.good ? 'good' : 'miss';
      return judged(best, j, at, offset, pad);
    },
    tick(now: number): PlayResult[] {
      const out: PlayResult[] = [];
      due.forEach((t, i) => {
        if (open[i] && now - t > w.near) out.push(judged(i, 'miss', now));
      });
      return out;
    },
    openCount: () => open.filter(Boolean).length,
  };
}
