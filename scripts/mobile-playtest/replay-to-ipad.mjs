#!/usr/bin/env node
// The emulated kit over Network MIDI (M8 / T4): the Mac plays recorded fixtures (packages/core/src/input/fixtures/*.json) to a
// MIDI output, e.g. the Network MIDI session connected to the iPad. Needs `npm ci` in this folder (@julusian/midi).
//
//   node replay-to-ipad.mjs --list
//   node replay-to-ipad.mjs --port "Session 1" --fixture all [--repeat 3] [--lead-ms 2000] [--gap-ms 3000] [--no-realtime]
//   node replay-to-ipad.mjs --fixture emulated-ghost-groove --dry-run      (prints the plan, opens no MIDI port)
//
// --port matches an output name (case-insensitive substring). --fixture takes a path, a fixture name or `all`.
// Each pass starts with --lead-ms of silence before the fixture's first message; passes are --gap-ms apart.
// Unverified in the Linux container: it has no MIDI ports, so only the plan and the pacing are tested.

import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { beatZeroAt, loadFixture, loadReference, pace, resolveFixtures, summary, toSchedule } from './fixture-timing.mjs';

const USAGE = 'Usage: node replay-to-ipad.mjs --port "<output name>" --fixture <file|name|all> [--repeat N] [--lead-ms 1000] '
  + '[--gap-ms 2000] [--no-realtime] [--dry-run] | --list';

export function parseArgs(argv) {
  const o = { list: false, port: undefined, fixture: undefined, repeat: 1, leadMs: 1000, gapMs: 2000, realtime: true, dryRun: false };
  const num = (name, v, min) => {
    const n = Number(v);
    if (v === undefined || !Number.isFinite(n) || n < min) throw new Error(`${name} needs a number >= ${min}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') o.list = true;
    else if (a === '--port') o.port = argv[++i];
    else if (a === '--fixture') o.fixture = argv[++i];
    else if (a === '--repeat') { o.repeat = num(a, argv[++i], 1); if (!Number.isInteger(o.repeat)) throw new Error('--repeat needs a whole number'); }
    else if (a === '--lead-ms') o.leadMs = num(a, argv[++i], 0);
    else if (a === '--gap-ms') o.gapMs = num(a, argv[++i], 0);
    else if (a === '--no-realtime') o.realtime = false;
    else if (a === '--dry-run') o.dryRun = true;
    else throw new Error(`unknown option ${a}\n${USAGE}`);
  }
  if (!o.list && !o.fixture) throw new Error(`--fixture is required\n${USAGE}`);
  if (!o.list && !o.dryRun && !o.port) throw new Error(`--port is required (see --list)\n${USAGE}`);
  return o;
}

/** What will be sent: one entry per fixture, with its schedule and what the iPad should see per pass. */
export function plan(o, opts = {}) {
  return resolveFixtures(o.fixture, opts).map(path => {
    const fixture = loadFixture(path), ref = loadReference(path, opts.referenceDir);
    const schedule = toSchedule(fixture, { leadMs: o.leadMs, realtime: o.realtime });
    const noteOns = schedule.filter(e => (e.bytes[0] & 0xf0) === 0x90 && e.bytes[2] > 0).length;
    return {
      path, name: fixture.name ?? path, schedule, noteOns,
      beatZeroMs: beatZeroAt(fixture, { leadMs: o.leadMs, realtime: o.realtime }),
      durationMs: schedule.length ? schedule[schedule.length - 1].atMs : 0,
      expect: ref && { noteOn: ref.counts.noteOn, noteOff: ref.counts.noteOff, hits: ref.counts.hits, filtered: ref.counts.filtered,
        ...(o.realtime && { clock: ref.counts.clock, activeSensing: ref.counts.activeSensing }) },
    };
  });
}

const fmt = s => (s ? `median ${s.median.toFixed(3)} p95 ${s.p95.toFixed(3)} max ${s.max.toFixed(3)} ms (n ${s.n})` : 'no sends');

export function describePlan(items, o) {
  return items.map(p => `${p.name}: ${p.schedule.length} messages (${p.noteOns} note-ons), ${(p.durationMs / 1000).toFixed(1)} s a pass, `
    + `beat 0 at +${p.beatZeroMs.toFixed(1)} ms, ${o.repeat}×\n  expect on the iPad per pass: `
    + (p.expect ? Object.entries(p.expect).map(([k, v]) => `${k} ${v}`).join(', ') + ' (hits/filtered only if Wi-Fi keeps the timing)'
      : 'no reference committed (run node scripts/mobile-playtest/reference.ts)')).join('\n');
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.dryRun) {
    console.log(describePlan(plan(o), o));
    return;
  }
  const midi = await import('@julusian/midi');
  const out = new midi.Output();
  const names = Array.from({ length: out.getPortCount() }, (_, i) => out.getPortName(i));
  if (o.list) {
    console.log(names.length ? names.map((n, i) => `${i}: ${n}`).join('\n')
      : 'No MIDI outputs. On the Mac: Audio MIDI Setup → Window → Show MIDI Studio → Network, connect to the iPad session.');
    out.destroy?.();
    return;
  }
  const index = names.findIndex(n => n.toLowerCase().includes(String(o.port).toLowerCase()));
  if (index < 0) { out.destroy?.(); throw new Error(`no output matching "${o.port}". Outputs: ${names.join(', ') || 'none'}`); }
  const items = plan(o);
  console.log(`→ "${names[index]}"\n${describePlan(items, o)}`);
  out.openPort(index);
  const all = [];
  try {
    for (const p of items) {
      for (let k = 0; k < o.repeat; k++) {
        const startedAt = new Date(Date.now() + p.beatZeroMs).toISOString();
        const late = await pace(p.schedule, b => out.sendMessage(b), { clock: () => performance.now(), sleep });
        all.push(...late);
        console.log(`${p.name} pass ${k + 1}/${o.repeat} (beat 0 ≈ ${startedAt}): send lateness ${fmt(summary(late))}`);
        if (o.gapMs) await sleep(o.gapMs);
      }
    }
  } finally {
    out.closePort();
    out.destroy?.();
  }
  console.log(`all passes: send lateness ${fmt(summary(all))}`);
  console.log('Then copy the results from the iPad and run: node compare.mjs <results.json> --fixture <name> --tolerant');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(e => { console.error(e.message ?? e); process.exit(1); });
