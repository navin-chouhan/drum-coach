import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { serverContext, take, runInput } from './fixtures.testutil';
import { KV_KEYS } from './kv';
import { openTestDb } from './nodeSqlite.testutil';
import { createDataStore } from './store';

describe('createDataStore', () => {
  it('persists across restarts on a database file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dc-store-'));
    const file = join(dir, 'drumcoach.db');
    try {
      const a = openTestDb(file);
      const s1 = createDataStore(() => a);
      s1.kv.set(KV_KEYS.noteMap('e-Drum'), '{"tom1":48}');
      const id = await s1.runs.add(runInput(1, { take: take() }));
      a.close();
      const b = openTestDb(file);
      const s2 = createDataStore(() => b);
      expect(s2.openError).toBeNull();
      expect(s2.kv.get(KV_KEYS.noteMap('e-Drum'))).toBe('{"tom1":48}');
      expect(await s2.runs.take(id)).toEqual(take());
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds a coach context from what is stored, and the server accepts it', async () => {
    const { splitContext } = await serverContext();
    const db = openTestDb();
    const s = createDataStore(() => db);
    s.kv.set(KV_KEYS.settings, JSON.stringify({ latencyMs: 4, profile: { goals: ['rock'], minutesPerDay: 20, onboarded: true }, lessons: { a: { step: 1, bpm: 70 } } }));
    for (let i = 0; i < 3; i++) await s.runs.add(runInput(i, { take: take() }));
    s.plans!.add({ title: 'Week', focus: 'Time', days: [] });
    s.settings!.put('teacherNotes', [{ date: '2026-10-01', text: 'Loose wrists' }]);
    s.aiLessons!.put({ id: 'ai-1', level: 1, kind: 'groove', title: 'T', steps: [{ title: 's', chart: { title: 'c', bpm: 90, timeSignature: [4, 4], bars: 1, notes: [{ t: 0, drum: 'kick' }] }, bpm: { start: 60, target: 80 } }] });
    const { context } = await s.coachContext('lesson');
    expect(splitContext({ context }).error).toBeUndefined();
    expect(context.runs!.map(r => r.durationS)).toEqual([62, 61, 60]);
    expect(context.plan).toEqual({ focus: 'Time' });
    expect(context.teacherNotes).toEqual([{ date: '2026-10-01', text: 'Loose wrists' }]);
    expect(context.aiLessons!.map(l => l.id)).toEqual(['ai-1']);
    expect(context.settings!.profile).toEqual({ goals: ['rock'], minutesPerDay: 20, onboarded: true });
  });

  it('falls back to a memory-only key-value store when the database cannot open', async () => {
    const log = vi.fn();
    const s = createDataStore(() => { throw new Error('ExpoSQLite native module missing'); }, log);
    expect(s.openError).toBe('ExpoSQLite native module missing');
    s.kv.set('k', 'v');
    expect(s.kv.get('k')).toBe('v');
    await expect(s.runs.add(runInput(1))).rejects.toThrow(/storage unavailable/);
    expect(await s.runs.list()).toEqual([]);
    expect(await s.runs.take('1')).toBeNull();
    expect((await s.coachContext('plan')).context).toEqual({});
    expect(log).toHaveBeenCalled();
  });
});
