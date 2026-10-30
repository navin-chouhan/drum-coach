import { describe, expect, it } from 'vitest';
import { take, runInput, webSchemas } from './fixtures.testutil';
import { createRunsRepo, InvalidRunError, RunInputSchema, runRowOf, type RunSqlRow } from './runs';
import { migrate } from './schema';
import { openTestDb } from './nodeSqlite.testutil';

const setup = () => { const db = openTestDb(); migrate(db); return { db, runs: createRunsRepo(db) }; };

describe('RunInputSchema', () => {
  it('is the schema the server checks POST /api/runs with (same JSON Schema)', async () => {
    const { RunRecordSchema } = await webSchemas();
    expect(RunInputSchema.toJSONSchema()).toEqual(RunRecordSchema.toJSONSchema());
  });

  it('accepts and refuses the same records as the web schema', async () => {
    const { RunRecordSchema } = await webSchemas();
    const cases: unknown[] = [
      runInput(1), runInput(2, { take: take() }), { ...runInput(3), level: undefined },
      { ...runInput(4), bpm: 5 }, { ...runInput(5), startedAt: 'yesterday' }, { ...runInput(6), take: { ...take(), beatMs: -1 } },
      { ...runInput(7), chartId: 'x'.repeat(81) }, {}, null, 'run',
    ];
    for (const c of cases) expect(RunInputSchema.safeParse(c).success).toBe(RunRecordSchema.safeParse(c).success);
  });
});

describe('runs repo', () => {
  it('adds a run and lists it in the GET /api/runs shape', async () => {
    const { runs } = setup();
    const id = await runs.add(runInput(1, { take: take() }));
    expect(id).toBe('1');
    const [row] = await runs.list();
    expect(row).toEqual({
      id: 1, hasTake: true, chartId: 'chart-1', chartTitle: 'Groove 1', level: 1, startedAt: runInput(1).startedAt, durationS: 61,
      bpm: 81, speed: 1, accuracy: 71, meanOffset: -3.4, spread: 12.25, notes: 32, fromBar: 1, toBar: 4, tips: ['rush'],
      perDrum: { snare: { notes: 16, accuracyPct: 90, meanOffsetMs: -2 } }, tool: 'drill', bite: undefined,
    });
  });

  it('maps absent summary fields to undefined, like the server', async () => {
    const { runs } = setup();
    await runs.add({ ...runInput(1), level: undefined, summary: {} });
    const [row] = await runs.list();
    expect(row).toMatchObject({ hasTake: false, level: undefined, notes: undefined, fromBar: undefined, tips: undefined, perDrum: undefined, tool: undefined });
  });

  it('rejects a bad run with the field name and stores nothing', async () => {
    const { runs } = setup();
    await expect(runs.add({ ...runInput(1), accuracy: 140 })).rejects.toThrow(InvalidRunError);
    await expect(runs.add({ ...runInput(1), accuracy: 140 })).rejects.toThrow(/run\.accuracy/);
    expect(await runs.list()).toEqual([]);
  });

  it('lists the latest N oldest first, and since a time', async () => {
    const { runs } = setup();
    for (const i of [3, 1, 2, 5, 4]) await runs.add(runInput(i));
    expect((await runs.list({ limit: 3 })).map(r => r.durationS)).toEqual([63, 64, 65]);
    expect((await runs.list({ since: Date.parse(runInput(4).startedAt) })).map(r => r.durationS)).toEqual([64, 65]);
    expect(await runs.list({ limit: 0 })).toEqual([]);
  });

  it('returns a take by id, and null for none or a bad id', async () => {
    const { runs } = setup();
    const withTake = await runs.add(runInput(1, { take: take(3) }));
    const without = await runs.add(runInput(2));
    expect(await runs.take(withTake)).toEqual(take(3));
    expect(await runs.take(without)).toBeNull();
    expect(await runs.take('99')).toBeNull();
    expect(await runs.take('1 OR 1=1')).toBeNull();
    expect(await runs.take('')).toBeNull();
  });

  it('caps kept takes like the server: the latest 300 plus the first of each exercise each month', async () => {
    const { db, runs } = setup();
    // 310 takes of one exercise in October, then the first November take: ids 1..311
    for (let i = 0; i < 310; i++) await runs.add(runInput(0, { chartId: 'groove', startedAt: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(), take: take(1) }));
    await runs.add(runInput(0, { chartId: 'groove', startedAt: '2026-11-01T09:00:00.000Z', take: take(1) }));
    const kept = db.getAllSync<{ run_id: number }>('SELECT run_id FROM run_hits ORDER BY run_id', []).map(r => r.run_id);
    expect(kept).toHaveLength(301);
    expect(kept[0]).toBe(1); // October's first take of "groove" stays
    expect(kept.slice(1, 3)).toEqual([12, 13]); // 2..11 dropped
    expect(kept.at(-1)).toBe(311);
    expect(await runs.take('5')).toBeNull();
    expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM runs', [])?.n).toBe(311); // runs themselves are never dropped
  });

  it('gives recent runs newest first with their summaries and no hits', async () => {
    const { runs } = setup();
    for (const i of [1, 2, 3]) await runs.add(runInput(i, { take: take() }));
    const recent = await runs.recent(2);
    expect(recent.map(r => r.durationS)).toEqual([63, 62]);
    expect(recent[0]).toMatchObject({ id: 3, chartId: 'chart-0', summary: runInput(3).summary });
    expect(recent[0]).not.toHaveProperty('take');
  });

  it('rolls back the insert when keeping the take fails', async () => {
    const { db, runs } = setup();
    db.execSync('DROP TABLE run_hits');
    await expect(runs.add(runInput(1, { take: take() }))).rejects.toThrow();
    expect(await db.getAllAsync('SELECT * FROM runs', [])).toEqual([]);
  });
});

describe('runRowOf', () => {
  it('survives a JSON column that is not JSON', () => {
    const row = { id: 1, hasTake: 0, chartId: 'c', chartTitle: 't', level: null, startedAt: 's', durationS: 1, bpm: 1, speed: 1, accuracy: 1, meanOffset: 0, spread: 0,
      notes: null, fromBar: null, toBar: null, tips: 'not json', perDrum: null, bite: null, tool: null } satisfies RunSqlRow;
    expect(runRowOf(row).tips).toBeUndefined();
  });
});
