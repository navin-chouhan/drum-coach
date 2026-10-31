import { describe, expect, it } from 'vitest';
import { openTestDb } from '../../data/nodeSqlite.testutil';
import { migrate } from '../../data/schema';
import { createChartsRepo } from '../../data/songs';
import { createCoachCharts } from '../coach/charts';
import { chartExists, findChart, findStoredChart } from './findChart';

const chart = (title: string) => ({ title, bpm: 90, timeSignature: [4, 4] as [4, 4], bars: 1, notes: [{ t: 0, drum: 'kick' as const }] });

function sources() {
  const db = openTestDb();
  migrate(db);
  const charts = createChartsRepo(db, () => 0.25), coachCharts = createCoachCharts({ charts });
  const imported = charts.save(chart('My song'), 'import');
  charts.setAudio(imported.id, 'backing/my-song.mp3');
  charts.setSyncOffset(imported.id, 80);
  const coach = coachCharts.save(chart('Coach drill'));
  return { charts, coachCharts, imported, coach };
}

describe('findChart (QA m8): one lookup over the library and the charts table (imports and the coach exercises)', () => {
  it('a built-in exercise', () => {
    expect(findChart('rock-8ths', {})).toMatchObject({ id: 'rock-8ths', source: 'builtin', kind: 'groove' });
  });

  it('an imported song, with its backing audio for backingFor', () => {
    const s = sources();
    expect(findChart(s.imported.id, s)).toMatchObject({ id: s.imported.id, source: 'import', title: 'My song', hasAudio: true, audioFile: 'backing/my-song.mp3', syncOffsetMs: 80 });
  });

  it("a coach exercise, saved to the table with source 'ai'", () => {
    const s = sources();
    const f = findChart(s.coach.id, s)!;
    expect(f).toMatchObject({ id: s.coach.id, source: 'ai', title: 'Coach drill', kind: 'exercise' });
    expect(f).not.toHaveProperty('savedAt');
  });

  it('on the Storage, and unknown ids', () => {
    const s = sources();
    expect(findStoredChart(s.imported.id, { charts: s.charts })?.source).toBe('import');
    expect(findStoredChart(s.coach.id, { charts: s.charts })?.source).toBe('ai');
    expect(findStoredChart(s.coach.id, { charts: null })).toBeUndefined();
    expect(findStoredChart('rock-8ths', { charts: null })?.source).toBe('builtin');
    expect(findStoredChart('nope', { charts: s.charts })).toBeUndefined();
    expect(chartExists(s.coach.id, s)).toBe(true);
    expect(chartExists('nope', s)).toBe(false);
  });
});
