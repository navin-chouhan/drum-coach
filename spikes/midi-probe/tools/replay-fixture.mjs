#!/usr/bin/env node
// Gate 0, M8: plays a recorded fixture (src/input/fixtures/*.json) to a MIDI output on the Mac, e.g. the Network
// MIDI session connected to the iPad running the probe. Needs `npm install` in this folder (@julusian/midi, RtMidi).
//
//   node replay-fixture.mjs --list
//   node replay-fixture.mjs ../../../src/input/fixtures/emulated-ghost-groove.json --port "Session 1" [--loop 3]
//          [--speed 1] [--no-realtime] [--lead 1000]
//
// --port matches an output name (case-insensitive substring). Unverified here: the container has no MIDI ports.

import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadFixture, pace, summary, toSchedule } from './fixture-timing.mjs';

function args(argv) {
  const o = { file: undefined, port: undefined, loop: 1, speed: 1, realtime: true, lead: 1000, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') o.list = true;
    else if (a === '--port') o.port = argv[++i];
    else if (a === '--loop') o.loop = Number(argv[++i]);
    else if (a === '--speed') o.speed = Number(argv[++i]);
    else if (a === '--lead') o.lead = Number(argv[++i]);
    else if (a === '--no-realtime') o.realtime = false;
    else if (!a.startsWith('--')) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  const midi = await import('@julusian/midi');
  const out = new midi.Output();
  const names = Array.from({ length: out.getPortCount() }, (_, i) => out.getPortName(i));
  if (o.list || !o.file) {
    console.log(names.length ? names.map((n, i) => `${i}: ${n}`).join('\n') : 'No MIDI outputs. On the Mac: Audio MIDI Setup → Window → Show MIDI Studio → Network, connect to the iPad session.');
    if (!o.file) console.log('\nUsage: node replay-fixture.mjs <fixture.json> --port "<output name>" [--loop N] [--speed 1] [--no-realtime]');
    out.destroy?.();
    return;
  }
  const index = names.findIndex(n => n.toLowerCase().includes(String(o.port ?? '').toLowerCase()));
  if (!o.port || index < 0) throw new Error(`no output matching "${o.port}". Outputs: ${names.join(', ') || 'none'}`);
  const fixture = loadFixture(o.file);
  const schedule = toSchedule(fixture, { speed: o.speed, leadMs: o.lead, realtime: o.realtime });
  out.openPort(index);
  const notes = schedule.filter(e => (e.bytes[0] & 0xf0) === 0x90 && e.bytes[2] > 0).length;
  console.log(`${fixture.name}: ${schedule.length} messages (${notes} note-ons) → "${names[index]}", ${o.loop}×`);
  try {
    for (let k = 0; k < o.loop; k++) {
      const late = await pace(schedule, b => out.sendMessage(b), { clock: () => performance.now(), sleep });
      console.log(`pass ${k + 1}: send lateness ms`, summary(late));
    }
  } finally {
    out.closePort();
    out.destroy?.();
  }
  console.log(`Expect on the probe per pass: note-on +${notes}; compare hits/filtered with the web replay of the same fixture.`);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
