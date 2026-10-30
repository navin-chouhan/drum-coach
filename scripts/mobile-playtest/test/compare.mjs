// node --test: compare.mjs against synthetic results built from the fixtures and their web references.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { compare, readResults, report, windowRisks } from '../compare.mjs';
import { FIXTURE_DIR, loadFixture, loadReference } from '../fixture-timing.mjs';

const HOST0 = 123456.789; // the iPad's host time at beat 0
const fixturePath = name => join(FIXTURE_DIR, `${name}.json`);
const ref = name => loadReference(fixturePath(name));

/**
 * What the Gate 0 probe's "Copy results" would hold after one clean pass of a fixture: the noteLog (non-realtime
 * messages, oldest first, the last `keep`), with the web verdicts, and the counters. `jitter(i)` shifts message i;
 * `edit(entries)` can change the log before it's cut.
 */
function probeResults(name, { jitter = () => 0, keep = 300, edit = e => e } = {}) {
  const f = loadFixture(fixturePath(name)), r = ref(name);
  const verdicts = r.noteOns.map(n => n.verdict);
  let k = 0, seq = 0;
  let entries = f.midi.filter(([, s]) => s < 0xf8).map(([t, s, d1, d2], i) => {
    const type = s & 0xf0, on = type === 0x90 && d2 > 0;
    return { seq: ++seq, hostTimeMs: HOST0 + t + jitter(i), hex: '', kind: on ? 'noteOn' : type === 0xa0 ? 'polyAftertouch' : 'noteOff',
      channel: (s & 0x0f) + 1, note: d1, velocity: d2, ...(on && { verdict: verdicts[k++] }) };
  });
  entries = edit(entries); // the counters count the whole pass; the log keeps its last `keep` messages
  const ons = entries.filter(e => e.kind === 'noteOn'), hits = ons.filter(e => e.verdict === 'hit').length;
  const counters = { noteOn: ons.length, noteOff: entries.filter(e => e.kind === 'noteOff').length, clock: r.counts.clock,
    activeSensing: r.counts.activeSensing, hits, filtered: ons.length - hits };
  entries = entries.slice(-keep);
  return { kind: 'drum-coach-gate0-probe', version: 1, createdAt: '2026-10-30T00:00:00Z', counters, lastLog: [...entries].reverse().slice(0, 50), noteLog: entries };
}

describe('compare.mjs: Gate 0 probe results (Network MIDI)', () => {
  it('a clean, complete log is the same, at the right offset', () => {
    const c = compare(readResults(probeResults('emulated-ghost-groove', { keep: 1e6 })), ref('emulated-ghost-groove'), { mode: 'tolerant' });
    assert.equal(c.ok, true, report(c));
    assert.deepEqual(c.differences, []);
    assert.ok(Math.abs(c.offsetMs - HOST0) < 0.001);
    assert.deepEqual(c.hits, { reference: 136, results: 136, paired: 136, outsideLog: 0 });
    assert.equal(c.timingMs.maxAbs, 0);
  });

  it('the 300-message noteLog: earlier hits are outside the log, not missing', () => {
    const c = compare(readResults(probeResults('emulated-ghost-groove')), ref('emulated-ghost-groove'), { mode: 'tolerant' });
    assert.equal(c.ok, true, report(c));
    assert.ok(c.hits.outsideLog > 0);
    assert.equal(c.hits.reference + c.hits.outsideLog, 136);
    assert.match(report(c), /outside the log/);
  });

  it('falls back to lastLog (newest first) when there is no noteLog', () => {
    const p = probeResults('emulated-flam-taps');
    delete p.noteLog;
    const res = readResults(p);
    assert.equal(res.source, 'probe lastLog');
    assert.ok(res.hits.every((h, i) => i === 0 || h.t >= res.hits[i - 1].t));
  });

  it('Wi-Fi jitter within ±5 ms passes tolerant mode and fails exact mode', () => {
    const jitter = i => ((i * 7919) % 9) - 4; // −4…+4 ms, deterministic
    const res = readResults(probeResults('emulated-flam-taps', { jitter, keep: 1e6 }));
    const tolerant = compare(res, ref('emulated-flam-taps'), { mode: 'tolerant' });
    assert.equal(tolerant.ok, true, report(tolerant));
    assert.ok(tolerant.timingMs.maxAbs <= 5);
    const exact = compare(res, ref('emulated-flam-taps'), { mode: 'exact' });
    assert.equal(exact.ok, false);
    assert.ok(exact.differences.some(d => d.type === 'timing'));
  });

  it('lists the strokes near the bounce and crosstalk windows', () => {
    const risks = windowRisks(ref('emulated-ghost-groove'), 5);
    assert.deepEqual(risks.map(k => [k.t, k.window]), [[3821.9, 'bounce'], [7726.6, 'crosstalk'], [14836, 'crosstalk']]);
    assert.deepEqual(windowRisks(ref('emulated-ghost-groove'), 1), []);
  });

  it('a crosstalk echo pushed out of the window by jitter is an extra hit, explained', () => {
    const echo = 7726.6; // hi-hat 11.5 ms after a ghost snare: filtered on the web; +4 ms of Wi-Fi makes it 15.5 ms
    const edit = es => es.map(e => (Math.abs(e.hostTimeMs - HOST0 - echo) < 0.01 && e.kind === 'noteOn' ? { ...e, hostTimeMs: e.hostTimeMs + 4, verdict: 'hit' } : e));
    const c = compare(readResults(probeResults('emulated-ghost-groove', { edit, keep: 1e6 })), ref('emulated-ghost-groove'), { mode: 'tolerant' });
    assert.equal(c.ok, true, report(c));
    const extra = c.differences.find(d => d.type === 'extra');
    assert.match(extra.explainedBy, /crosstalk window \(gap 11\.5 ms vs 15\)/);
    assert.ok(c.differences.some(d => d.type === 'count' && d.field === 'hits' && d.explainedBy));
    assert.match(report(c), /SAME within tolerance/);
  });

  it('a lost stroke and a changed velocity away from any window are real differences', () => {
    const r = ref('emulated-ghost-groove'), lost = r.hits[60], changed = r.hits[80];
    const edit = es => es.filter(e => !(e.kind === 'noteOn' && Math.abs(e.hostTimeMs - HOST0 - lost.t) < 0.01 && e.note === lost.note))
      .map(e => (e.kind === 'noteOn' && Math.abs(e.hostTimeMs - HOST0 - changed.t) < 0.01 && e.note === changed.note ? { ...e, velocity: e.velocity + 1 } : e));
    const c = compare(readResults(probeResults('emulated-ghost-groove', { edit, keep: 1e6 })), r, { mode: 'tolerant' });
    assert.equal(c.ok, false);
    const unexplained = c.differences.filter(d => !d.explainedBy).map(d => d.type);
    assert.deepEqual(unexplained.sort(), ['count', 'missing', 'velocity']);
    assert.deepEqual(c.differences.find(d => d.type === 'count' && !d.explainedBy), { type: 'count', field: 'noteOn', ref: 153, got: 152 });
    assert.match(report(c), /DIFFERENT: 3 unexplained/);
  });
});

describe('compare.mjs: app take results (in-app replay)', () => {
  const app = (name, change = x => x) => change({ fixture: name, hits: ref(name).hits.map(({ t, pad, velocity }) => ({ t, pad, velocity })),
    summary: structuredClone(ref(name).summary) });

  it('an exact copy of the web result is the same', () => {
    const c = compare(readResults(app('emulated-flam-taps')), ref('emulated-flam-taps'), { mode: 'exact' });
    assert.equal(c.ok, true, report(c));
    assert.equal(c.offsetMs, 0);
    assert.match(report(c), /^emulated-flam-taps: exact/);
  });

  it('a summary field, a pad and a 0.01 ms shift are differences in exact mode', () => {
    const changed = app('emulated-flam-taps', a => {
      a.summary.accuracyPct = 99;
      a.hits[3].pad = 'tom1';
      a.hits[5].t += 0.01;
      return a;
    });
    const c = compare(readResults(changed), ref('emulated-flam-taps'), { mode: 'exact' });
    assert.equal(c.ok, false);
    const types = c.differences.map(d => d.type).sort();
    assert.deepEqual(types, ['pad', 'summary', 'timing']);
    assert.deepEqual(c.differences.find(d => d.type === 'summary'), { type: 'summary', field: 'accuracyPct', ref: 100, got: 99 });
  });

  it('rejects files that are not results', () => {
    assert.throws(() => readResults({ foo: 1 }), /not a results file/);
    assert.throws(() => readResults(null), /not a results file/);
  });
});

describe('compare.mjs CLI on a synthetic results file', () => {
  const cli = fileURLToPath(new URL('../compare.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'cmp-'));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

  it('exit 0 when the same, 1 when different, 2 on bad usage', () => {
    const good = join(dir, 'probe.json'), bad = join(dir, 'app.json');
    writeFileSync(good, JSON.stringify(probeResults('emulated-ghost-groove', { jitter: i => (i % 5) - 2 })));
    writeFileSync(bad, JSON.stringify({ fixture: 'emulated-flam-taps', hits: ref('emulated-flam-taps').hits.slice(1) }));
    const ok = run(good, '--fixture', 'emulated-ghost-groove');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /tolerant \(±5 ms\), probe noteLog/);
    const diff = run(bad); // the fixture name comes from the file; app results default to exact
    assert.equal(diff.status, 1, diff.stdout + diff.stderr);
    assert.match(diff.stdout, /DIFF missing/);
    const json = JSON.parse(run(bad, '--json').stdout);
    assert.equal(json.ok, false);
    assert.equal(run(good).status, 2); // which fixture?
    assert.equal(run().status, 2);
    assert.equal(run(good, '--fixture', 'emulated-ghost-groove', '--tol-ms', '0').status, 2);
  });
});
