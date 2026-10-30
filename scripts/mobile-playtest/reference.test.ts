// The committed web references (T4) must match a fresh replay of the fixtures. Runs under root Vitest (npm test)
// and under `node --test` in this folder (Node type stripping), so both runtimes are checked.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const vitest = !!process.env.VITEST;
if (!vitest) await import('./resolve-ts.mjs'); // plain Node: src/ imports are extensionless
type Register = (name: string, fn: () => void) => void; // the part of describe/it both runners share
const { describe, it } = (vitest ? await import('vitest') : await import('node:test')) as unknown as { describe: Register; it: Register };
const { buildReferences, serialize, REFERENCE_DIR } = await import('./reference-lib.ts');

const refs = buildReferences(); // once, in file order: the same replay times as the CLI
const fix = 'regenerate with node scripts/mobile-playtest/reference.ts and commit it';

describe('mobile-playtest web references (T4)', () => {
  it('there is one per fixture and no stale ones', () => {
    assert.ok(refs.size > 0);
    assert.deepEqual(readdirSync(REFERENCE_DIR).filter(n => n.endsWith('.json')).sort(), [...refs.keys()], fix);
  });
  for (const [file, ref] of refs) it(`${file} has not drifted`, () => {
    assert.equal(readFileSync(REFERENCE_DIR + file, 'utf8'), serialize(ref), `${file} differs from a fresh replay: ${fix}`);
    assert.ok(ref.expectMet, `${file}: the web replay no longer meets the fixture's expect`);
  });
});
