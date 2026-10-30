// The testable half of replay-fixture.mjs: load a src/input/fixtures/*.json fixture and turn it into a send
// schedule, then pace it against a clock. No MIDI here, so it runs in the Linux container's tests.

import { readFileSync } from 'node:fs';

/** Reads and checks a fixture: { name, midi: [[ms, status, ...data], ...] }. */
export function loadFixture(path) {
  const f = JSON.parse(readFileSync(path, 'utf8'));
  if (!f || !Array.isArray(f.midi)) throw new Error(`${path}: not a fixture (no "midi" array)`);
  for (const [i, m] of f.midi.entries()) {
    if (!Array.isArray(m) || m.length < 2 || typeof m[0] !== 'number' || !m.slice(1).every(b => Number.isInteger(b) && b >= 0 && b <= 255))
      throw new Error(`${path}: midi[${i}] is not [ms, ...bytes]`);
  }
  return f;
}

const isRealtime = status => status >= 0xf8;

/**
 * The send schedule: [{ atMs, bytes }] in time order, the first message at `leadMs`, times divided by `speed`.
 * `realtime: false` drops clock / active sensing (the kit sends them, so they are kept by default).
 */
export function toSchedule(fixture, { speed = 1, leadMs = 1000, realtime = true } = {}) {
  if (!(speed > 0)) throw new Error('speed must be > 0');
  const rows = fixture.midi.filter(([, status]) => realtime || !isRealtime(status));
  if (!rows.length) return [];
  const sorted = rows.map((m, i) => ({ t: m[0], i, bytes: m.slice(1) })).sort((a, b) => a.t - b.t || a.i - b.i); // stable
  const t0 = sorted[0].t;
  return sorted.map(({ t, bytes }) => ({ atMs: leadMs + (t - t0) / speed, bytes }));
}

/**
 * Sends each event at start + atMs on `clock` (ms). Waits on absolute targets, so lateness doesn't accumulate.
 * `sleep(ms)` waits roughly; the last `spinMs` are busy-waited for sub-ms accuracy.
 * Returns the lateness of each send (ms), for the report.
 */
export async function pace(schedule, send, { clock, sleep, spinMs = 2 }) {
  const start = clock(), late = [];
  for (const ev of schedule) {
    const target = start + ev.atMs;
    let wait = target - clock();
    if (wait > spinMs) await sleep(wait - spinMs);
    while ((wait = target - clock()) > 0) { /* spin */ }
    send(ev.bytes);
    late.push(clock() - target);
  }
  return late;
}

export function summary(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  return { n, median: s[n >> 1], p95: s[Math.min(n - 1, Math.ceil(0.95 * n) - 1)], max: s[n - 1] };
}
