import { describe, expect, it } from 'vitest';
import { createKv, KV_KEYS } from './kv';
import { createAiLessonsRepo, createPlansRepo, createSettingsRepo } from './records';
import { migrate } from './schema';
import { openTestDb } from './nodeSqlite.testutil';

const setup = () => { const db = openTestDb(); migrate(db); return { db, kv: createKv(db) }; };

describe('settings repo', () => {
  it('keeps server-only keys and answers like GET /api/settings, with the kv mirrors', () => {
    const { db, kv } = setup();
    const settings = createSettingsRepo(db, kv);
    settings.put('teacherNotes', [{ date: '2026-10-01', text: 'Relax the left hand' }]);
    kv.set(KV_KEYS.settings, JSON.stringify({ latencyMs: 8 }));
    kv.set(KV_KEYS.noteMap('e-Drum'), JSON.stringify({ snare: 38 }));
    kv.set(KV_KEYS.padCal('e-Drum'), JSON.stringify({ snare: { soft: 15, loud: 127 } }));
    kv.set(KV_KEYS.midiInput, 'e-Drum'); // not a server setting
    expect(settings.get('teacherNotes')).toEqual([{ date: '2026-10-01', text: 'Relax the left hand' }]);
    expect(settings.get('missing')).toBeUndefined();
    expect(settings.all()).toEqual({
      teacherNotes: [{ date: '2026-10-01', text: 'Relax the left hand' }],
      app: { latencyMs: 8 }, 'noteMap.e-Drum': { snare: 38 }, 'padCal.e-Drum': { snare: { soft: 15, loud: 127 } },
    });
  });

  it('skips a kv value that is not JSON', () => {
    const { db, kv } = setup();
    kv.set(KV_KEYS.settings, '{broken');
    expect(createSettingsRepo(db, kv).all()).toEqual({});
  });
});

describe('plans repo', () => {
  it('returns the latest plan with its checks', async () => {
    const { db } = setup();
    const plans = createPlansRepo(db);
    expect(await plans.latest()).toBeNull();
    plans.add({ title: 'Week 1' });
    const id = plans.add({ title: 'Week 2', focus: 'Even eighths' });
    expect(plans.setChecks(id, { 'Mon-0': true })).toBe(true);
    expect(plans.setChecks(999, {})).toBe(false);
    expect(await plans.latest()).toEqual({ id, plan: { title: 'Week 2', focus: 'Even eighths' }, checks: { 'Mon-0': true } });
  });
});

describe('ai lessons repo', () => {
  it('lists oldest first, replaces and removes', async () => {
    const { db } = setup();
    const lessons = createAiLessonsRepo(db);
    lessons.put({ id: 'ai-a', title: 'A' });
    lessons.put({ id: 'ai-b', title: 'B' });
    lessons.put({ id: 'ai-c', title: 'C' });
    expect((await lessons.list()).map(l => l.id)).toEqual(['ai-a', 'ai-b', 'ai-c']);
    lessons.replace({ id: 'ai-d', title: 'D' }, ['ai-a', 'ai-c']);
    expect((await lessons.list()).map(l => l.id)).toEqual(['ai-b', 'ai-d']);
    expect(lessons.remove('ai-b')).toBe(true);
    expect(lessons.remove('ai-b')).toBe(false);
    expect(() => lessons.put({ id: '' })).toThrow(/lesson\.id/);
  });

  it('keeps the old lessons when the new one cannot be stored', async () => {
    const { db } = setup();
    const lessons = createAiLessonsRepo(db);
    lessons.put({ id: 'ai-a' });
    expect(() => lessons.replace({ id: '' }, ['ai-a'])).toThrow();
    expect((await lessons.list()).map(l => l.id)).toEqual(['ai-a']);
  });
});
