import type { KeyValueStore } from '@drum-coach/core/platform';
import { describe, expect, it } from 'vitest';
import { openTestDb } from '../../data/nodeSqlite.testutil';
import { migrate } from '../../data/schema';
import { createChartsRepo } from '../../data/songs';
import { createCoachCharts } from '../coach/charts';
import { chartExists, findChart, findStoredChart } from './findChart';

const memKv = (): KeyValueStore => { const m = new Map<string, string>(); return { get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: k => void m.delete(k) }; };
const chart = (title: string) => ({ title, bpm: 90, timeSignature: [4, 4] as [4, 4], bars: 1, notes: [{ t: 0, drum: 'kick' as const }] });

function sources() {
  const db = openTestDb();
  migrate(db);
  const charts = createChartsRepo(db, () => 0.25), kv = memKv(), coachCharts = createCoachCharts(kv, { random: () => 0.5 });
  const imported = charts.save(chart('My song'), 'import');
  charts.setAudio(imported.id, 'backing/my-song.mp3');
  charts.setSyncOffset(imported.id, 80);
  const coach = coachCharts.save(chart('Coach drill'));
  return { charts, kv, coachCharts, imported, coach };
}

describe('findChart (QA m8): one lookup over the library, the charts table and the coach store', () => {
  it('a built-in exercise', () => {
    expect(findChart('rock-8ths', {})).toMatchObject({ id: 'rock-8ths', source: 'builtin', kind: 'groove' });
  });

  it('an imported song, with its backing audio for backingFor', () => {
    const s = sources();
    expect(findChart(s.imported.id, s)).toMatchObject({ id: s.imported.id, source: 'import', title: 'My song', hasAudio: true, audioFile: 'backing/my-song.mp3', syncOffsetMs: 80 });
  });

  it("a coach exercise from the key-value store (without its savedAt)", () => {
    const s = sources();
    const f = findChart(s.coach.id, s)!;
    expect(f).toMatchObject({ id: s.coach.id, source: 'ai', title: 'Coach drill', kind: 'exercise' });
    expect(f).not.toHaveProperty('savedAt');
  });

  it('on the Storage, and unknown ids', () => {
    const s = sources();
    expect(findStoredChart(s.imported.id, { charts: s.charts, kv: s.kv })?.source).toBe('import');
    expect(findStoredChart(s.coach.id, { charts: null, kv: s.kv })?.source).toBe('ai');
    expect(findStoredChart('nope', { charts: s.charts, kv: s.kv })).toBeUndefined();
    expect(chartExists(s.coach.id, s)).toBe(true);
    expect(chartExists('nope', s)).toBe(false);
  });
});
