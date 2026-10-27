import { describe, expect, it } from 'vitest';
import { estimateLatency, keepTaps, tapTestResult, TAP_TEST } from './latency';
import { tapTestFixture } from './results';
import { buildTapTestRun, planTapTest, tapTestEndMs } from './tapTest';

const audio = { outputLatencyMs: 12, ioBufferMs: 5.3, sampleRate: 48000 };

/** Synthetic run: clicks scheduled every 500 ms after the plan's start; taps `late` ms after each heard click. */
function synthetic(late: (i: number) => number, nowMs = 10_000) {
  const plan = planTapTest(nowMs);
  const scheduled = Array.from({ length: plan.total }, (_, i) => plan.startHostMs + i * 500);
  const heard = scheduled.slice(plan.countIn).map(t => t + audio.outputLatencyMs);
  const taps = heard.map((t, i) => t + late(i));
  return { plan, scheduled, taps };
}

describe('estimateLatency (copied from src/engine/scoring.ts)', () => {
  it('median of offsets within ±200 ms, needs 6', () => {
    const clicks = [0, 1000, 2000, 3000, 4000, 5000, 6000];
    expect(estimateLatency(clicks, [10, 1020, 2030, 3010, 4020, 5030, 6500])).toEqual({ latencyMs: 20, spread: 8.2, n: 6 });
    expect(estimateLatency(clicks, [10, 1020])).toBeNull();
  });
});

describe('tap-to-click test on the host clock', () => {
  it('plans 120 BPM, 4 count-in + 32 clicks, starting after a lead', () => {
    const p = planTapTest(1000);
    expect(p).toMatchObject({ bpm: 120, countIn: 4, clicks: 32, total: 36 });
    expect(p.startHostMs).toBeGreaterThan(1000);
    expect(tapTestEndMs(p)).toBe(p.startHostMs + 36 * 500 + 500);
    expect(TAP_TEST.bpm).toBe(120);
  });

  it('a steady player 25 ms late: median 25 vs the heard click, 37 vs the scheduled one', () => {
    const { plan, scheduled, taps } = synthetic(() => 25);
    const run = buildTapTestRun(plan, scheduled, audio, taps, new Date('2026-10-27T12:00:00Z'));
    expect(run.clickHeardMs).toHaveLength(32);
    expect(run.result).toMatchObject({ latencyMs: 25, meanMs: 25, spread: 0, n: 32, trusted: true });
    expect(run.resultVsScheduled).toMatchObject({ latencyMs: 37, n: 32 });
  });

  it('jitter shows as spread; too few taps is not trusted', () => {
    const { plan, scheduled, taps } = synthetic(i => (i % 2 ? 40 : -40));
    expect(buildTapTestRun(plan, scheduled, audio, taps).result).toMatchObject({ latencyMs: 0, spread: 40, trusted: true });
    const few = synthetic(() => 10);
    expect(buildTapTestRun(few.plan, few.scheduled, audio, few.taps.slice(0, 8)).result).toMatchObject({ n: 8, trusted: false });
  });

  it('count-in taps are ignored like the web card (only after the first scored click − 300 ms)', () => {
    const clicks = [1000, 1500];
    expect(keepTaps(clicks, [0, 500, 650, 701, 1010])).toEqual([701, 1010]);
    expect(tapTestResult(clicks, [1010, 1490, 1010, 1490, 1010, 1490])).toMatchObject({ n: 6, latencyMs: 0, meanMs: 0 });
  });

  it('exports a take as a src/input/fixtures fixture: beat 0 = the first heard click', () => {
    const { plan, scheduled, taps } = synthetic(() => 20);
    const run = buildTapTestRun(plan, scheduled, audio, taps);
    const capture = [[run.clickHeardMs[0] - 5000, 0xf8], ...taps.map(t => [t, 0x99, 38, 90]), [taps[0] + 1, 0xf8]];
    const f = tapTestFixture(run, capture, 'ios-tap-test');
    expect(f).toMatchObject({ source: 'MPS-150', speed: 1, fromBar: 1, toBar: 1, repeats: 8, latencyMs: 20 });
    expect(f.chart.notes).toHaveLength(4);
    expect(f.midi[0]).toEqual([20, 0x99, 38, 90]);
    expect(f.midi).toHaveLength(33); // the old clock is outside the take window
  });
});
