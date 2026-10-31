import { CURRICULUM, LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import { startProgress, type LessonProgress } from '@drum-coach/core/engine/lesson';
import { DEFAULTS, type Settings } from '@drum-coach/core/input/settings';
import { describe, expect, it } from 'vitest';
import { buildJourney, currentSession, type JourneyView } from './model';
import { afterSetMove, dotLabel, MORE_ROUTES, moreSections, stageLine } from './more';

const NOW = new Date(2026, 9, 30, 19, 42);
const fresh = (): Settings => ({ ...DEFAULTS, profile: { goals: [], minutesPerDay: 25, onboarded: true }, lessons: {} });
const finished = (id: string): LessonProgress => ({ ...startProgress(LESSON_BY_ID[id]), completedAt: '2026-10-20', stars: 3, reviewStage: 0 });
const keys = (v: JourneyView, thinking = false) => moreSections(v, { thinking }).flatMap(s => s.entries.map(e => e.key));

describe("Journey's ⋯ sheet (D10: everything Journey no longer shows stays reachable)", () => {
  const day1 = buildJourney({ settings: fresh(), lessons: CURRICULUM, runs: [], now: NOW });
  it('day one: Just jam, the stage song, a new song, Ask the coach, Find my level, Skill map, Full path, Check my kit, Stick technique', () => {
    expect(keys(day1)).toEqual(expect.arrayContaining(['jam', 'song-play', 'song-hear', 'newsong', 'ask', 'level', 'skills', 'path', 'kit', 'technique']));
    const where = moreSections(day1).find(s => s.key === 'where')!;
    expect(where.entries[0]).toMatchObject({ key: 'kit', action: { kind: 'route', href: MORE_ROUTES.setup } }); // setup first while it's due
    expect(where.entries.find(e => e.key === 'level')).toMatchObject({ testID: 'journey-find-level', action: { href: '/lesson/placement' } });
  });
  it('no kit check once the kit is set up; Ask the coach waits while the coach is writing', () => {
    const v = buildJourney({ settings: { ...fresh(), setupDone: true }, lessons: CURRICULUM, runs: [], now: NOW });
    expect(keys(v)).not.toContain('kit');
    expect(moreSections(v, { thinking: true }).flatMap(s => s.entries).find(e => e.key === 'ask')?.disabled).toBe(true);
  });
  it('this week and the coach lessons, with "a lesson for this" when the focus is a habit', () => {
    const v: JourneyView = { ...day1, week: { words: 'rushing ahead of the click', habit: { key: 'habit-1', reason: 'rushing' } }, coachLessons: [{ lessonId: 'ai-1', title: 'Even hats' }] };
    const coach = moreSections(v).find(s => s.key === 'coach')!.entries;
    expect(coach.find(e => e.key === 'week')).toMatchObject({ title: 'This week: rushing ahead of the click', action: { kind: 'askHabit' } });
    expect(coach.find(e => e.key === 'coach-ai-1')).toMatchObject({ action: { kind: 'lesson', lessonId: 'ai-1' } });
  });
  it('after the whole path: the coach challenge, Flow, the 2-minute challenge, Beat your best and show-off songs', () => {
    const all: Record<string, LessonProgress> = {};
    for (const l of CURRICULUM) all[l.id] = finished(l.id);
    const base = { ...fresh(), lessons: all, setupDone: true };
    const day = currentSession(base, CURRICULUM, '2026-10-30');
    const settings = { ...base, session: { ...day, done: day.items.map((_, i) => i) } };
    const v = buildJourney({ settings, lessons: CURRICULUM, runs: [], now: NOW, readySongs: [{ id: 'yt-abc', title: 'Seven Nation Army' }] });
    const k = keys(v);
    expect(k).toEqual(expect.arrayContaining(['challenge', 'newsong', 'showoff-yt-abc', 'level', 'skills', 'technique']));
    if (v.flow) expect(k).toContain('flow');
    expect(moreSections(v).flatMap(s => s.entries).find(e => e.key === 'challenge')?.action).toEqual({ kind: 'askChallenge' });
  });
});

describe('the 4th move and the stage strip', () => {
  const day1 = buildJourney({ settings: fresh(), lessons: CURRICULUM, runs: [], now: NOW });
  it('a 4th move only after the set: Beat your best first, else the 2-minute challenge', () => {
    const record = { lessonId: 'money-8ths', title: 'The money beat', sub: '', goal: 'beat 80' }, arcade = { lessonId: 'rock', title: 'Rock', sub: '', goal: '2 min' };
    expect(afterSetMove({ ...day1, afterSet: false, record, arcade })).toBeNull();
    expect(afterSetMove({ ...day1, afterSet: true, record, arcade })).toMatchObject({ key: 'record', action: { role: 'record' } });
    expect(afterSetMove({ ...day1, afterSet: true, record: null, arcade })).toMatchObject({ key: 'arcade', action: { mode: 'arcade' } });
  });
  it('one line for the stage: the trail summary and the song bars', () => {
    expect(stageLine(day1)).toBe(`${day1.trail!.summary} · song 0/${day1.song!.bars} bars`);
  });
  it('dots are labelled for VoiceOver', () => {
    expect(dotLabel({ id: 'a', title: 'Your first beat', icon: '🥁', state: 'done', stars: 2 })).toBe('Your first beat: done, 2 stars');
    expect(dotLabel({ id: 'b', title: 'The money beat', icon: '🎯', state: 'now', flag: 'checkpoint' })).toBe('The money beat, checkpoint: you are here');
  });
});
