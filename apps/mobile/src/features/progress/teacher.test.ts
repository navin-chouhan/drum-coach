import { CURRICULUM, MILESTONES } from '@drum-coach/core/content/curriculum';
import type { RunRow } from '@drum-coach/core/engine/progress';
import { DEFAULTS } from '@drum-coach/core/input/settings';
import { describe, expect, it } from 'vitest';
import { progressViewOf } from './path';
import { addTeacherNote, readTeacherNotes, teacherSheet, teacherText } from './teacher';

const NOW = new Date(2026, 9, 30, 19, 0);
const run = (day: number, over: Partial<RunRow> = {}): RunRow => ({
  chartId: 'singles', chartTitle: 'Singles', startedAt: new Date(2026, 9, day, 18).toISOString(), durationS: 600, bpm: 80, speed: 1, accuracy: 80,
  meanOffset: 12, spread: 15, notes: 60, perDrum: { snare: { n: 60, hit: 48, offset: 12 } }, ...over,
} as RunRow);

describe('for your teacher (web TeacherView)', () => {
  it('day one: goals, no ranks, working on stage 1, no lessons', () => {
    const s = teacherSheet({ runs: [], progress: {}, profile: DEFAULTS.profile, lessons: CURRICULUM, now: NOW });
    expect(s.title).toBe('Drum Coach progress · 2026-10-30');
    expect(s.rows).toEqual([
      ['Goals', 'not sure yet · 25 min a day'],
      ['Ranks', `none yet · working on: stage ${MILESTONES[0].level + 1}, ${MILESTONES[0].title}`],
      ['Lessons finished (0)', 'none yet'],
    ]);
    expect(s.perDrum).toEqual([]);
  });

  it('with history: the last 28 days, lessons finished newest first, left-handed', () => {
    const id = CURRICULUM[0].id;
    const progress = { [id]: { step: 0, bpm: 60, clean: 0, fails: 0, bestBpm: 70, reviewStage: 0, completedAt: '2026-10-29', stars: 2 } };
    const s = teacherSheet({ runs: [run(20), run(25), run(29)], progress, profile: { ...DEFAULTS.profile, goals: ['rock'] }, leftHanded: true, lessons: CURRICULUM, now: NOW });
    expect(s.rows[0]).toEqual(['Goals', 'rock · 25 min a day · left-handed']);
    expect(s.rows.find(r => r[0] === 'Last 28 days')?.[1]).toMatch(/^3 days, 30 minutes/);
    expect(s.rows.at(-1)).toEqual(['Lessons finished (1)', `${CURRICULUM[0].title} ★★ 70 BPM`]);
    const text = teacherText(s, [{ date: '2026-10-28', text: 'Relax the left wrist.' }]);
    expect(text.split('\n')[0]).toBe('Drum Coach progress · 2026-10-30');
    expect(text).toContain('Goals: rock · 25 min a day · left-handed');
    expect(text).toContain("The teacher's notes:\n2026-10-28: Relax the left wrist.");
  });

  it('notes: trimmed, 1000 characters, the last 20; junk in storage is dropped', () => {
    expect(addTeacherNote([], '  ', NOW)).toEqual([]);
    expect(addTeacherNote([], ' Heel down. ', NOW)).toEqual([{ date: '2026-10-30', text: 'Heel down.' }]);
    expect(addTeacherNote([], 'x'.repeat(1200), NOW)[0].text).toHaveLength(1000);
    const many = Array.from({ length: 20 }, (_, i) => ({ date: '2026-10-01', text: `n${i}` }));
    expect(addTeacherNote(many, 'new', NOW).map(n => n.text).slice(-2)).toEqual(['n19', 'new']);
    expect(addTeacherNote(many, 'new', NOW)).toHaveLength(20);
    expect(readTeacherNotes([{ date: '2026-10-01', text: 'ok' }, { text: 1 }, 'x'])).toEqual([{ date: '2026-10-01', text: 'ok' }]);
    expect(readTeacherNotes(null)).toEqual([]);
    expect([progressViewOf('teacher'), progressViewOf('coming'), progressViewOf('lessons')]).toEqual(['teacher', 'coming', 'lessons']);
  });
});
