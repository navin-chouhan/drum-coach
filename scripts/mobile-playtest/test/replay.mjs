// node --test: the loader, scheduler, pacing and options of replay-to-ipad.mjs. The MIDI-out part is unverified here
// (the Linux container has no MIDI ports).
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { beatZeroAt, FIXTURE_DIR, loadFixture, loadReference, pace, resolveFixtures, summary, toSchedule } from '../fixture-timing.mjs';
import { describePlan, parseArgs, plan } from '../replay-to-ipad.mjs';

const fixture = name => join(FIXTURE_DIR, `${name}.json`);
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

describe('fixture loading', () => {
  it('loads the repo fixtures', () => {
    for (const n of ['emulated-ghost-groove', 'emulated-flam-taps']) assert.ok(loadFixture(fixture(n)).midi.length > 10);
  });

  it('rejects a file that is not a fixture', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fx-'));
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ midi: [[0, 300]] }));
    writeFileSync(join(dir, 'none.json'), JSON.stringify({ name: 'x' }));
    assert.throws(() => loadFixture(join(dir, 'bad.json')), /midi\[0\]/);
    assert.throws(() => loadFixture(join(dir, 'none.json')), /not a fixture/);
  });

  it('resolves all, a name and a path', () => {
    const all = resolveFixtures('all');
    assert.deepEqual(all, [fixture('emulated-flam-taps'), fixture('emulated-ghost-groove')]);
    assert.deepEqual(resolveFixtures('emulated-ghost-groove'), [fixture('emulated-ghost-groove')]);
    assert.deepEqual(resolveFixtures('emulated-ghost-groove.json'), [fixture('emulated-ghost-groove')]);
    assert.deepEqual(resolveFixtures(fixture('emulated-flam-taps'), { cwd: '/' }), [fixture('emulated-flam-taps')]);
    assert.throws(() => resolveFixtures('nope'), /no fixture nope/);
    assert.throws(() => resolveFixtures(undefined), /required/);
  });

  it('finds the committed web reference of a fixture', () => {
    assert.equal(loadReference(fixture('emulated-ghost-groove')).counts.hits, 136);
    assert.equal(loadReference('/tmp/not-a-fixture.json'), null);
  });
});

describe('schedule', () => {
  const f = { midi: [[-515, 248], [-14.2, 153, 38, 33], [10.9, 153, 38, 87], [5.9, 248], [24.6, 153, 38, 0]] };

  it('starts at the first message, keeps order, scales by speed, can drop realtime', () => {
    const s = toSchedule(f, { leadMs: 1000 });
    assert.deepEqual(s.map(e => Math.round(e.atMs * 10) / 10), [1000, 1500.8, 1520.9, 1525.9, 1539.6]);
    assert.deepEqual(s[1].bytes, [153, 38, 33]);
    close(toSchedule(f, { leadMs: 0, speed: 2 }).at(-1).atMs, 269.8);
    const noRt = toSchedule(f, { realtime: false, leadMs: 0 });
    assert.equal(noRt.length, 3);
    assert.equal(noRt[0].atMs, 0);
    assert.throws(() => toSchedule(f, { speed: 0 }));
  });

  it('puts beat 0 where the fixture has t = 0', () => {
    close(beatZeroAt(f, { leadMs: 1000 }), 1515);
    close(beatZeroAt(f, { leadMs: 0, realtime: false }), 14.2);
    const real = loadFixture(fixture('emulated-ghost-groove'));
    const s = toSchedule(real, { leadMs: 500 }), zero = beatZeroAt(real, { leadMs: 500 });
    const firstNote = real.midi.find(m => m[1] === 0x99 && m[3] > 0);
    const sent = s.find(e => e.bytes[0] === 0x99 && e.bytes[2] > 0);
    close(sent.atMs - zero, firstNote[0]);
  });

  it('paces against absolute targets on a fake clock: no drift, sends in order', async () => {
    let now = 0;
    const sleep = async ms => { now += ms + 0.5; }; // every sleep overshoots by 0.5 ms
    const ticking = () => (now += 0.01); // the spin loop needs the clock to move
    const schedule = toSchedule(loadFixture(fixture('emulated-flam-taps')), { leadMs: 100 });
    const sent = [];
    const late = await pace(schedule, b => sent.push([now, ...b]), { clock: ticking, sleep });
    assert.equal(sent.length, schedule.length);
    assert.deepEqual(sent.map(s => s.slice(1)), schedule.map(e => e.bytes));
    assert.ok(Math.max(...late) < 0.6);
    assert.equal(summary(late).n, schedule.length);
    close(sent.at(-1)[0], schedule.at(-1).atMs, 1); // the last send is at its own target, not the sum of the waits
  });

  it('summarises lateness', () => {
    assert.equal(summary([]), null);
    assert.deepEqual(summary([3, 1, 2, 10]), { n: 4, median: 3, p95: 10, max: 10 });
  });
});

describe('replay-to-ipad options and plan', () => {
  it('parses the options', () => {
    assert.deepEqual(parseArgs(['--port', 'Session 1', '--fixture', 'all', '--repeat', '3', '--lead-ms', '2000', '--gap-ms', '0', '--no-realtime']),
      { list: false, port: 'Session 1', fixture: 'all', repeat: 3, leadMs: 2000, gapMs: 0, realtime: false, dryRun: false });
    assert.equal(parseArgs(['--list']).list, true);
    assert.equal(parseArgs(['--fixture', 'all', '--dry-run']).dryRun, true);
    assert.throws(() => parseArgs(['--fixture', 'all']), /--port is required/);
    assert.throws(() => parseArgs(['--port', 'x']), /--fixture is required/);
    assert.throws(() => parseArgs(['--port', 'x', '--fixture', 'all', '--repeat', '0']), />= 1/);
    assert.throws(() => parseArgs(['--port', 'x', '--fixture', 'all', '--repeat', '1.5']), /whole number/);
    assert.throws(() => parseArgs(['--port', 'x', '--fixture', 'all', '--lead-ms']), /number/);
    assert.throws(() => parseArgs(['--loop', '2']), /unknown option --loop/);
  });

  it('plans every fixture with what the iPad should count (the M8 numbers)', () => {
    const o = parseArgs(['--fixture', 'all', '--dry-run', '--repeat', '2']);
    const items = plan(o);
    assert.deepEqual(items.map(p => p.name), ['emulated-flam-taps', 'emulated-ghost-groove']);
    const groove = items[1];
    assert.equal(groove.noteOns, 153);
    assert.deepEqual(groove.expect, { noteOn: 153, noteOff: 153, hits: 136, filtered: 17, clock: 1192, activeSensing: 83 });
    assert.equal(plan({ ...o, realtime: false })[1].expect.clock, undefined);
    assert.match(describePlan(items, o), /emulated-ghost-groove: 1581 messages \(153 note-ons\).*2×/);
  });
});
