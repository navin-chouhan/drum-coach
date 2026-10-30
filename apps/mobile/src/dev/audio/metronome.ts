// The audio debug screen's metronome, built only from AudioPort.schedule: the same hand-over pattern createTake will
// use (AUDIO-DESIGN §1.2): heard times computed as zero + k × tickMs (multiplication, never accumulation), at least
// `aheadMs` (2 s) always handed over, topped up in `chunkMs` (4 s) chunks from a ~10 Hz tick.
import type { AudioEvent, AudioPort, SoundId } from '@drum-coach/core/play/audioPort';

export type MetronomeSpec = {
  bpm: number;
  beatsPerBar: number;
  /** Clicks per beat: 1 quarters, 2 eighths, 4 sixteenths. */
  subdivision: 1 | 2 | 4;
  gain?: number;
};

/** Click k of the run (k = 0 is the first downbeat): its sound and heard time. */
export function clickAt(spec: MetronomeSpec, zero: number, k: number): { sound: SoundId; at: number } {
  const perBar = spec.beatsPerBar * spec.subdivision;
  const sound: SoundId = k % perBar === 0 ? 'click.bar' : k % spec.subdivision === 0 ? 'click.beat' : 'click.sub';
  return { sound, at: zero + (k * 60_000) / (spec.bpm * spec.subdivision) };
}

/** Clicks k in [from, to). */
export function planClicks(spec: MetronomeSpec, zero: number, from: number, to: number): AudioEvent[] {
  const out: AudioEvent[] = [];
  for (let k = from; k < to; k++) {
    const c = clickAt(spec, zero, k);
    out.push({ kind: 'sound', at: c.at, sound: c.sound, gain: spec.gain ?? 1 });
  }
  return out;
}

export type MetronomeOptions = { aheadMs?: number; chunkMs?: number; minStartLeadMs?: number };

export type Metronome = {
  /** Picks zero = now + max(300, minLead + 100) and hands the first chunk over. */
  start(now: number): void;
  /** Call about 10×/s: keeps ≥ aheadMs handed over. */
  tick(now: number): void;
  /** Cancels everything not yet sounding. */
  stop(): void;
  readonly running: boolean;
  readonly zero: number;
  /** Clicks handed over / accepted / reported late by the port. */
  readonly stats: { handed: number; accepted: number; late: number; calls: number };
};

export function createMetronome(port: Pick<AudioPort, 'schedule' | 'cancel' | 'route'>, spec: MetronomeSpec, opts: MetronomeOptions = {}): Metronome {
  const aheadMs = opts.aheadMs ?? 2000;
  const chunkMs = opts.chunkMs ?? 4000;
  const minStart = opts.minStartLeadMs ?? 300;
  let zero = 0;
  let next = 0; // the next click index not handed over
  let running = false;
  const stats = { handed: 0, accepted: 0, late: 0, calls: 0 };

  const topUp = (now: number) => {
    if (clickAt(spec, zero, next).at >= now + aheadMs) return;
    let to = next;
    while (clickAt(spec, zero, to).at < now + chunkMs) to++;
    const events = planClicks(spec, zero, next, to);
    next = to;
    const r = port.schedule(events);
    stats.handed += events.length;
    stats.accepted += r.accepted;
    stats.late += r.late;
    stats.calls++;
  };

  return {
    start(now) {
      const lead = Math.max(minStart, (port.route()?.minLeadMs ?? 0) + 100);
      zero = now + lead;
      next = 0;
      running = true;
      topUp(now);
    },
    tick(now) {
      if (running) topUp(now);
    },
    stop() {
      if (!running) return;
      running = false;
      port.cancel();
    },
    get running() {
      return running;
    },
    get zero() {
      return zero;
    },
    stats,
  };
}
