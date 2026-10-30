// T4 parity: writes scripts/mobile-playtest/reference/<fixture>.json, the web score of every recorded fixture.
//   node scripts/mobile-playtest/reference.ts           regenerate (commit the result)
//   node scripts/mobile-playtest/reference.ts --check   exit 1 if a committed reference is missing or differs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import './resolve-ts.mjs'; // before the src/ imports below (they're loaded dynamically, after the hook is in place)

const { buildReferences, serialize, REFERENCE_DIR } = await import('./reference-lib.ts');

const check = process.argv.includes('--check');
const refs = buildReferences();
let bad = 0;
for (const [file, ref] of refs) {
  const path = REFERENCE_DIR + file, text = serialize(ref);
  const line = `${ref.fixture}: ${ref.hits.length} hits, ${ref.counts.filtered} filtered, landed ${ref.landed}/${ref.take.notes}, `
    + `extras ${ref.extras}, accuracy ${ref.summary.accuracyPct}%, mean ${ref.summary.meanOffsetMs} ms, spread ${ref.summary.spreadMs} ms`
    + (ref.expectMet ? '' : '  (EXPECT NOT MET)');
  if (!check) { writeFileSync(path, text); console.log(`wrote ${line}`); continue; }
  const same = existsSync(path) && readFileSync(path, 'utf8') === text;
  if (!same) bad++;
  console.log(`${same ? 'ok   ' : 'DRIFT'} ${line}`);
}
for (const stale of readdirSync(REFERENCE_DIR).filter(n => n.endsWith('.json') && !refs.has(n))) {
  bad++;
  console.log(`STALE ${stale}: no fixture of that name in src/input/fixtures/`);
}
if (check && bad) {
  console.error(`${bad} reference(s) out of date: run node scripts/mobile-playtest/reference.ts and commit the result`);
  process.exit(1);
}
