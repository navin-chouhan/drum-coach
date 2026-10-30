import { CURRICULUM, LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import { startProgress, type LessonProgress } from '@drum-coach/core/engine/lesson';
import type { RunRow } from '@drum-coach/core/engine/progress';
import { DEFAULTS, type Settings } from '@drum-coach/core/input/settings';
import { describe, expect, it } from 'vitest';
import { buildJourney, currentSession } from './model';
import { countWords, groovePreview, slotsPerBeat } from './preview';

const NOW = new Date(2026, 9, 30, 19, 42); // Fri 30 Oct, evening
const fresh = (): Settings => ({ ...DEFAULTS, profile: { goals: [], minutesPerDay: 25, onboarded: true }, lessons: {} });

const finished = (id: string, stars = 3): LessonProgress => ({ ...startProgress(LESSON_BY_ID[id]), completedAt: '2026-10-20', stars, reviewStage: 0 });

/** The mockups' student: three weeks in, Stage 3 "The money beat", step 3 "+ snare" at 70 BPM, a 6-day streak. */
function threeWeeksIn(): { settings: Settings; runs: RunRow[] } {
  const lessons: Record<string, LessonProgress> = {};
  for (const id of ['posture', 'first-jam', 'count-quarters', 'count-8ths', 'rests', 'singles', 'hh-8ths', 'hands-feet']) lessons[id] = finished(id);
  lessons['money-quarters'] = finished('money-quarters', 3);
  lessons['ear-kick'] = finished('ear-kick', 2);
  lessons['doubles'] = { ...finished('doubles', 2), reviewDue: '2026-10-30' };
  lessons['four-floor'] = finished('four-floor', 1);
  lessons['money-8ths'] = { ...startProgress(LESSON_BY_ID['money-8ths']), step: 2, bpm: 70 };
  const runs: RunRow[] = [];
  for (let d = 5; d >= 0; d--) {
    const day = new Date(NOW); day.setDate(day.getDate() - d); day.setHours(18, 0);
    runs.push({ chartId: 'lesson/money-8ths/2', chartTitle: 'The money beat · + kick', startedAt: day.toISOString(), durationS: 600, bpm: 70, speed: 1, accuracy: 82, meanOffset: 10, spread: 20, notes: 48 });
  }
  return { settings: { ...fresh(), lessons, setupDone: true }, runs };
}

describe('Journey on day one (the iPad starts fresh, D3)', () => {
  const v = buildJourney({ settings: fresh(), lessons: CURRICULUM, runs: [], now: NOW });
  it('is Stage 1 with an empty trail and a nudge to check the kit', () => {
    expect(v.trail?.title).toBe('Stage 1 · Ready to play');
    expect(v.trail?.stops.some(s => s.state === 'done')).toBe(false);
    expect(v.trail?.stops[0].state).toBe('now');
    expect(v.setupDue).toBe(true);
    expect(v.you.rank).toBe('New drummer');
    expect(v.you.nextRank).toBe('Stick Rookie');
    expect(v.you.streak).toBe(0);
    expect(v.you.landedPct).toBeNull();
    expect(v.you.ring).toMatchObject({ caption: 'stage 1', fraction: 0 });
    expect(v.you.ring?.value).toMatch(/^0\/\d+$/);
  });
  it('welcomes you and offers the first lesson from today\'s set, after the stretch', () => {
    expect(v.coachLine).toMatch(/^Evening! Welcome to the kit\./);
    expect(v.set.items[0]).toMatchObject({ title: 'Two-minute stretch', state: 'current' });
    expect(v.main).toMatchObject({ label: 'Start', item: 0 });
    expect(v.hero?.kicker).toBe(`Up next · Stretch · 1 of ${v.set.items.length} today`);
    expect(v.set.minutesDone).toBe(0);
  });
  it('the stage song closes the trail', () => {
    const last = v.trail!.stops[v.trail!.stops.length - 1];
    expect(last).toMatchObject({ title: 'First Steps', icon: '🎵' });
    expect(v.song).toMatchObject({ title: 'First Steps', ready: 0 });
  });
});

describe('Journey three weeks in (journey.png)', () => {
  const { settings, runs } = threeWeeksIn();
  // Today's stretch and review are done (the mockup's set: stretch ✓, review ✓, the money beat next).
  // The coach's plan for the week leads with the money beat (the planner otherwise starts the stage's exercises).
  const focusIds = ['money-8ths'];
  const today = currentSession(settings, CURRICULUM, '2026-10-30', focusIds);
  const moneyIdx = today.items.findIndex(i => i.lessonId === 'money-8ths');
  const s: Settings = { ...settings, session: { ...today, done: today.items.map((_, i) => i).filter(i => i < moneyIdx) } };
  const v = buildJourney({ settings: s, lessons: CURRICULUM, runs, now: NOW, focusIds });

  it('is Stage 3, The money beat, with the rank and the next one', () => {
    expect(v.trail?.title).toBe('Stage 3 · The money beat');
    expect(v.you.rank).toBe('Limb Wrangler');
    expect(v.you.nextRank).toBe('Groove Keeper');
    expect(v.you.ring?.caption).toBe('stage 3');
    expect(v.trail?.summary).toBe("4 of 9 lessons · 0 of 2 ★ checkpoints") // ear-kick is done too;
  });
  it('up next is the money beat at step 3, + snare, 70 → 90 BPM, a checkpoint', () => {
    expect(moneyIdx).toBeGreaterThan(0);
    expect(v.hero).toMatchObject({ lessonId: 'money-8ths', title: 'The money beat', step: 'Step 3 of 4 · + snare' });
    expect(v.hero?.meta).toMatch(/^\d+ min · 70 → 100 BPM$/);
    expect(v.hero?.kicker).toMatch(/^Up next · \d of \d today · ★ checkpoint$/);
    expect(v.hero?.preview?.caption).toBe('One bar · you play all three');
    expect(v.hero?.preview?.newLabel).toBe('new: snare');
  });
  it('today\'s set: done items ticked with stars, the money beat current, the song bite with its bars', () => {
    const cur = v.set.items.find(i => i.state === 'current');
    expect(cur?.lessonId).toBe('money-8ths');
    expect(v.set.items.find(i => i.lessonId === 'doubles')).toMatchObject({ state: 'done', detail: 'review', stars: 2 });
    expect(v.set.items.find(i => i.lessonId === 'bite-song-steady')).toMatchObject({ title: 'Steady Eight', detail: 'bars 1–4', state: 'todo' });
    expect(v.set.minutesDone).toBeGreaterThan(0);
  });
  it('the numbers: a 6-day streak, 82% landed, evening greeting with the streak', () => {
    expect(v.you.streak).toBe(6);
    expect(v.you.landedPct).toBe(82);
    expect(v.you.minutesToday).toBe(10);
    expect(v.coachLine).toMatch(/^Evening! 6 days in a row, love it\./);
  });
  it('the trail: done stops with stars, the money beat now, the ★ song last', () => {
    const stops = v.trail!.stops;
    const now = stops.findIndex(x => x.state === 'now');
    expect(stops[now]).toMatchObject({ lessonId: 'money-8ths', flag: 'checkpoint' });
    expect(stops.slice(0, now).every(x => x.state === 'done')).toBe(true);
    expect(stops.filter(x => x.state === 'done').map(x => x.stars)).toEqual(expect.arrayContaining([3, 2, 1]));
    expect(stops[stops.length - 1]).toMatchObject({ title: 'Steady Eight', flag: 'checkpoint' });
    expect(stops.length).toBeLessThanOrEqual(10);
  });
  it('Something else swaps the hero to another open lesson of the stage', () => {
    const w = buildJourney({ settings: s, lessons: CURRICULUM, runs, now: NOW, swap: 1, focusIds });
    expect(w.hero?.lessonId).not.toBe('money-8ths');
    expect(w.hero?.kicker.startsWith('Something else')).toBe(true);
    expect(w.hero?.item).toBe(-1);
  });
  it('set done: the next lesson on the trail leads', () => {
    const all: Settings = { ...s, session: { ...today, done: today.items.map((_, i) => i) } };
    const w = buildJourney({ settings: all, lessons: CURRICULUM, runs, now: NOW, focusIds });
    expect(w.set.done).toBe(true);
    expect(w.main?.label).toBe('Next lesson');
    expect(w.hero?.kicker.startsWith('Next on your trail')).toBe(true);
  });
});

describe('groovePreview', () => {
  const money = LESSON_BY_ID['money-8ths'];
  it('draws the money beat on an 8th grid with the count', () => {
    const p = groovePreview(money.steps[2], undefined, money.steps[1])!;
    expect(p.lanes.map(l => l.label)).toEqual(['Hi-hat', 'Snare', 'Kick']);
    expect(p.lanes[0].slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(p.lanes[1].slots).toEqual([2, 6]);
    expect(p.lanes[2].slots).toEqual([0, 4]);
    expect(p.count).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(p.lanes.map(l => l.isNew)).toEqual([false, true, false]);
  });
  it('says which limbs are yours when the app plays the rest', () => {
    const p = groovePreview(money.steps[0])!;
    expect(p.caption).toBe('One bar · you play the hi-hat');
    expect(p.lanes.find(l => l.drum === 'kick')?.yours).toBe(false);
    expect(p.newLabel).toBeNull();
  });
  it('follows the layer of a one-limb-at-a-time step', () => {
    const l = LESSON_BY_ID['money-quarters'];
    const p = groovePreview(l.steps[0], { ...startProgress(l), layer: 1 })!;
    expect(p.newLabel).toBe('new: kick');
    expect(p.caption).toBe('One bar · you play the hi-hat and kick');
    expect(p.count).toEqual(['1', '2', '3', '4']);
  });
  it('grids', () => {
    expect(slotsPerBeat([0, 0.5, 1])).toBe(2);
    expect(slotsPerBeat([0, 1 / 3, 2 / 3])).toBe(3);
    expect(slotsPerBeat([0, 0.25])).toBe(4);
    expect(countWords(2, 4)).toEqual(['1', 'e', '&', 'a', '2', 'e', '&', 'a']);
  });
  it('no preview for a rest or a stretch', () => {
    expect(groovePreview(LESSON_BY_ID['stretch'].steps[0])).toBeNull();
  });
});
