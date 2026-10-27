// Tests never touch your practice data: any test file that opens the database (server/db.ts, even through an import of
// an import) gets its own empty DATA_DIR, whatever your shell or .env says. A test can still pick its own folder.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'drum-coach-test-'));
process.env.DATA_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));
