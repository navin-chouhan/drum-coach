// Setup → Coach and voice (web: src/coach/CoachView.tsx CoachSettings, the "Voice" and "Claude and your plan" groups,
// and "How much the coach says"): the switches' titles and lines word for word, and the patches they save. A new goal
// or daily length plans today's set again (session cleared), as the web's setProfile does. Pure.
// Not on the iPad: "Talk back hands-free" (the iPad has no speech-to-text yet) and the Piper line under "Test the voice".
import type { Genre, Profile } from '@drum-coach/core/engine/lesson';
import type { Settings } from '@drum-coach/core/input/settings';

export type Line = { title: string; sub: string };
export const COACH_VOICE_LINES = {
  voice: { title: 'Speak the verdicts', sub: 'After each take you hear what the screen says.' },
  countIn: { title: 'Count me in out loud', sub: '"One, two, three, four" before each take.' },
  voiceVolume: { title: 'Coach voice volume', sub: 'Clear, but not louder than the kit.' },
  chattiness: { title: 'How much the coach says', sub: 'Short is easier to take in from the throne.' },
  liveCoach: { title: 'The coach follows my practice', sub: 'Greets each lesson, reacts to takes, suggests the next step. One Claude call each.' },
  aiTips: { title: 'The coach writes the tips', sub: 'Once per exercise, then saved.' },
  goals: { title: 'Goals', sub: 'What the coach plans towards. None picked: a bit of everything.' },
  minutes: { title: 'Minutes a day', sub: 'Your daily set and the goal line in Progress.' },
} satisfies Record<string, Line>;

/** CoachSettings' GOALS (shorter labels than the first run's). */
export const COACH_GOALS: { id: Genre; label: string }[] = [{ id: 'rock', label: 'Rock / pop' }, { id: 'funk', label: 'Funk' }, { id: 'jazz', label: 'Jazz' }, { id: 'latin', label: 'Latin' }];
export const COACH_MINUTES = [15, 20, 25, 30, 45];
export const VOICE_TEST_LINE = 'Ready when you are. One, two, three, four.';

/** The web's setProfile: a profile change also drops today's set, so it's planned again from the new goals/minutes. */
export const profilePatch = (profile: Profile, p: Partial<Profile>): Partial<Settings> => ({ profile: { ...profile, ...p }, session: undefined });
export const toggleGoalPatch = (profile: Profile, id: Genre): Partial<Settings> =>
  profilePatch(profile, { goals: profile.goals.includes(id) ? profile.goals.filter(x => x !== id) : [...profile.goals, id] });
export const minutesPatch = (profile: Profile, minutesPerDay: number): Partial<Settings> => profilePatch(profile, { minutesPerDay });

/** The Setup row's summary: what's on, in a few words. */
export function coachVoiceSummary(s: Pick<Settings, 'voice' | 'liveCoach' | 'profile'>): string {
  return [s.voice ? 'voice on' : 'voice off', s.liveCoach ? 'coach follows you' : 'coach off', `${s.profile.minutesPerDay} min a day`].join(' · ');
}
