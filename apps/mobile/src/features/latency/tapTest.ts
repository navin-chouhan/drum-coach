// The latency tap test (web: src/ui/LatencyCard.tsx; AUDIO-DESIGN §5): 60 BPM, four count-in clicks with the spoken
// count, then 16 clicks to hit along with. The median offset (core estimateLatency) becomes the latency correction.
// Pure: plans the AudioPort events on the Clock (heard times), collects hits, and words the verdict as the web does.
import { estimateLatency } from '@drum-coach/core/engine/scoring';
import type { AudioEvent, AudioRoute } from '@drum-coach/core/play/audioPort';

export const BPM = 60, COUNT_IN = 4, CLICKS = 16; // one per second: easy to count along
/** Fewer or more scattered taps measure the player, not the latency (web MAX_SPREAD, MIN_TAPS). */
export const MAX_SPREAD = 50, MIN_TAPS = 10;
export const COUNT_WORDS = ['one', 'two', 'three', 'four'];
const BEAT_MS = 60_000 / BPM;
/** Taps this long before the first scored click still count (web: h.time > clicks[0] − 300). */
const EARLY_MS = 300;
/** The test ends this long after the last click (web: + 0.5 s). */
const TAIL_MS = 500;

export type Estimate = NonNullable<ReturnType<typeof estimateLatency>>;

export type TapTestPlan = { events: AudioEvent[]; clicks: number[]; zero: number; endsAt: number };

/**
 * The test's sounds from `now` (Clock ms): the first click at least 300 ms ahead (or the route's lead + 100). Clicks
 * accent beat 1 of each bar; the count-in also says "one … four" on its clicks (we hear a word's beat less exactly
 * than a click, so only clicks are scored).
 */
export function planTapTest(now: number, route: Pick<AudioRoute, 'minLeadMs'> | null): TapTestPlan {
  const zero = now + Math.max(300, (route?.minLeadMs ?? 0) + 100);
  const events: AudioEvent[] = [], clicks: number[] = [];
  for (let i = 0; i < COUNT_IN + CLICKS; i++) {
    const at = zero + i * BEAT_MS;
    events.push({ kind: 'sound', at, sound: i % 4 === 0 ? 'click.bar' : 'click.beat', gain: 1 });
    if (i < COUNT_IN) events.push({ kind: 'sound', at, sound: `word.${COUNT_WORDS[i]}`, gain: 1 });
    else clicks.push(at);
  }
  return { events, clicks, zero, endsAt: zero + (COUNT_IN + CLICKS - 1) * BEAT_MS + TAIL_MS };
}

export type TapTest = { plan: TapTestPlan; taps: number[] };
export const startTapTest = (plan: TapTestPlan): TapTest => ({ plan, taps: [] });

/** One hit (any pad, as on the web). */
export function addTap(t: TapTest, time: number): TapTest {
  return time > t.plan.clicks[0] - EARLY_MS ? { ...t, taps: [...t.taps, time] } : t;
}

export const tapTestOver = (t: TapTest, now: number) => now >= t.plan.endsAt;

/** The estimate so far (null until 6 taps sit near clicks). */
export const tapEstimate = (t: TapTest) => estimateLatency(t.plan.clicks, t.taps);

/** Saved only when steady and with enough taps (web). */
export const trustworthy = (e: Estimate | null): e is Estimate => !!e && e.spread <= MAX_SPREAD && e.n >= MIN_TAPS;

export type TapReadout = { hits: string; average: string; steady: string; steadyOk: boolean };

/** The three readout tiles while it runs (mockup first-run-4): hits so far, the average, how steady. */
export function tapReadout(t: TapTest): TapReadout {
  const e = tapEstimate(t);
  const hits = `${Math.min(t.taps.length, CLICKS)} of ${CLICKS}`;
  if (!e) return { hits, average: '–', steady: '–', steadyOk: false };
  return {
    hits,
    average: `${Math.abs(e.latencyMs)} ms`,
    steady: `±${Math.round(e.spread)} ms`,
    steadyOk: e.spread <= MAX_SPREAD,
  };
}

/** The verdict after the test, in the web's words. */
export function verdictText(e: Estimate | null): { text: string; warn: boolean } {
  if (!e) return { text: 'Not enough taps close to the clicks. Try again.', warn: true };
  const unsteady = e.spread > MAX_SPREAD || e.n < MIN_TAPS;
  return {
    text: `You hit on average ${Math.abs(e.latencyMs)} ms ${e.latencyMs >= 0 ? 'after' : 'before'} the click (${e.n} taps, spread ±${e.spread} ms).`
      + (unsteady ? ' Not steady enough to trust: try again, playing along with the clicks rather than reacting to them.' : ''),
    warn: unsteady,
  };
}

/** What the output adds (web: "Your speakers add N ms"), with the Bluetooth warning; null when it's small. */
export function outputNote(route: Pick<AudioRoute, 'outputLatencyMs' | 'kind'> | null, appDrumSounds: boolean): string | null {
  if (!route) return null;
  const ms = Math.round(route.outputLatencyMs);
  if (ms <= 20 && route.kind !== 'bluetooth') return null;
  const bt = ms > 100 || route.kind === 'bluetooth';
  return `This output adds ${ms} ms to every app sound.`
    + (bt ? " That's Bluetooth-size delay: every click and count reaches you late. Use wired headphones (or the module's PHONES with the iPad in its AUX IN)." : '')
    + (appDrumSounds ? " The kit's own sound is instant: plug headphones into the module and turn off the app's drum sounds." : '');
}

/** The instructions (web wording, iPad words). */
export const TAP_INTRO = `Press Start: the coach counts you in "1, 2, 3, 4", then hit the snare exactly with each of the next ${CLICKS} clicks `
  + '(one per second). Use the same headphones or speakers you practise with.';
