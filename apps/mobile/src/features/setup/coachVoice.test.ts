import { DEFAULTS } from '@drum-coach/core/input/settings';
import { describe, expect, it } from 'vitest';
import { COACH_GOALS, COACH_MINUTES, COACH_VOICE_LINES, coachStatusLine, coachVoiceSummary, minutesPatch, toggleGoalPatch } from './coachVoice';

describe('Coach and voice (web CoachSettings)', () => {
  it("a goal or minutes change saves the profile and plans today's set again", () => {
    const profile = { ...DEFAULTS.profile, goals: ['rock' as const] };
    expect(toggleGoalPatch(profile, 'funk')).toEqual({ profile: { ...profile, goals: ['rock', 'funk'] }, session: undefined });
    expect(toggleGoalPatch(profile, 'rock')).toEqual({ profile: { ...profile, goals: [] }, session: undefined });
    expect(minutesPatch(profile, 45)).toEqual({ profile: { ...profile, minutesPerDay: 45 }, session: undefined });
  });

  it("keeps the web's options and words", () => {
    expect(COACH_GOALS.map(g => g.label)).toEqual(['Rock / pop', 'Funk', 'Jazz', 'Latin']);
    expect(COACH_MINUTES).toEqual([15, 20, 25, 30, 45]);
    expect(COACH_VOICE_LINES.liveCoach).toEqual({ title: 'The coach follows my practice', sub: 'Greets each lesson, reacts to takes, suggests the next step. One Claude call each.' });
    expect(COACH_VOICE_LINES.countIn.sub).toBe('"One, two, three, four" before each take.');
  });

  it('says whether the coach is ready, as the web\'s status line', () => {
    expect(coachStatusLine('checking')).toEqual({ ready: false, text: 'Checking…' });
    expect(coachStatusLine('none').text).toMatch(/^No home server yet/);
    expect(coachStatusLine({ ok: true, text: 'Connected · 40 ms', ms: 40, lines: ['Coach ready (Claude via this server)'] }))
      .toEqual({ ready: true, text: '✓ Coach ready (Claude via this server)' });
    expect(coachStatusLine({ ok: true, text: 'Connected · 40 ms', ms: 40, lines: ['Coach not ready: run `claude` once on the server to log in'] }).ready).toBe(false);
    expect(coachStatusLine({ ok: false, title: 'The server didn’t answer', hint: 'Is it running?' })).toEqual({ ready: false, text: 'The server didn’t answer. Is it running?' });
  });

  it("sums it up on Setup's row", () => {
    expect(coachVoiceSummary(DEFAULTS)).toBe('voice on · coach follows you · 25 min a day');
    expect(coachVoiceSummary({ ...DEFAULTS, voice: false, liveCoach: false })).toBe('voice off · coach off · 25 min a day');
  });
});
