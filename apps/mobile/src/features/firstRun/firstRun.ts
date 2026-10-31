// First run (web: src/lesson/TodayView.tsx Onboarding + KitSetup; mockup first-run-1…4): Welcome (goals, minutes a
// day, played before), Plug in, Your pads, Latency. The flags are the web's, in the settings under the web's key:
// profile.onboarded (the welcome step saved), setupDone (pads + latency done), setupNudged (the one reminder given).
// "Played before" queues the placement test as the web does (after the kit steps). Pure; screens hold the step.
import type { Genre } from '@drum-coach/core/engine/lesson';
import type { Settings } from '@drum-coach/core/input/settings';
import type { KeyValueStore } from '@drum-coach/core/platform';

export type FirstRunStep = 'welcome' | 'plug' | 'pads' | 'latency';
export const STEPS: { id: FirstRunStep; label: string }[] = [
  { id: 'welcome', label: 'Welcome' }, { id: 'plug', label: 'Plug in' }, { id: 'pads', label: 'Your pads' }, { id: 'latency', label: 'Latency' },
];

/** The first run shows until the welcome step is saved (web: !profile.onboarded). */
export const needsFirstRun = (s: Settings) => !s.profile.onboarded;

export type StepPill = { id: FirstRunStep; n: number; label: string; state: 'done' | 'cur' | 'todo' };
export function stepPills(cur: FirstRunStep): StepPill[] {
  const i = STEPS.findIndex(s => s.id === cur);
  return STEPS.map((s, k) => ({ id: s.id, n: k + 1, label: s.label, state: k < i ? 'done' : k === i ? 'cur' : 'todo' }));
}

// ---- 1 · Welcome ----
/** The web's goals and labels (Onboarding GOALS). "Not sure yet" is no goal picked. */
export const GOALS: { id: Genre; label: string }[] = [
  { id: 'rock', label: 'Rock / pop' }, { id: 'funk', label: 'Funk / R&B / gospel' }, { id: 'jazz', label: 'Jazz / swing' }, { id: 'latin', label: 'Latin' },
];
export const MINUTES = [15, 20, 25, 30, 45];
export const RECOMMENDED_MINUTES = 25;

export type WelcomeForm = { goals: Genre[]; minutes: number; playedBefore: boolean };
export const welcomeForm = (s: Settings): WelcomeForm => ({ goals: [...s.profile.goals], minutes: s.profile.minutesPerDay, playedBefore: false });
export const toggleGoal = (f: WelcomeForm, g: Genre): WelcomeForm => ({ ...f, goals: f.goals.includes(g) ? f.goals.filter(x => x !== g) : [...f.goals, g] });
export const notSureYet = (f: WelcomeForm): WelcomeForm => ({ ...f, goals: [] });

/** Continue on Welcome: the profile saved and today's set planned again (web Onboarding save). */
export function saveWelcome(s: Settings, f: WelcomeForm): Partial<Settings> {
  return { profile: { ...s.profile, goals: f.goals, minutesPerDay: f.minutes, onboarded: true }, session: undefined };
}

export const WELCOME = {
  title: 'Your drum teacher, at the kit.',
  lead: 'This app is your drum teacher. Each day it plans a short session from where you are: a warm-up, a review, one new skill and one groove. '
    + 'You build every groove one limb at a time while the app plays the rest, and it raises the tempo when you\'re ready.',
  goalsQ: 'What do you want to play?', goalsSub: 'Pick any, or none if you\'re not sure yet.',
  minutesQ: 'Minutes a day', minutesSub: 'Short and daily beats long and weekly.',
  playedQ: 'Played drums before?', playedSub: 'If you have, a short test finds your level after setup.',
};

// ---- 2–4 · the kit steps (web KitSetup) ----
/**
 * Leaving the kit steps: `done` when latency was saved (web finish(true)); skipping (Skip for now, touch pads, no kit)
 * is finish(false). Either way the one reminder counts as given; Setup and the sidebar keep nagging until both are done.
 */
export function finishKitSteps(s: Settings, done: boolean): Partial<Settings> {
  return { setupDone: done || !!s.setupDone, setupNudged: true };
}

/** The next step after a step's main action (web: pads saved → latency; latency saved → finish). */
export function nextStep(step: FirstRunStep): FirstRunStep | 'finish' {
  const i = STEPS.findIndex(s => s.id === step);
  return i + 1 < STEPS.length ? STEPS[i + 1].id : 'finish';
}

export const KIT_STEP_TEXT = {
  plugTitle: 'Plug in your kit',
  plugLead: 'Connect the drum module’s USB port to the iPad’s USB-C port. Then hit any pad.',
  plugTips: ['🔌 USB-C to USB-B cable, or a hub if you want to charge too', 'ℹ️ Other music apps can hold the kit: close them'],
  touchPads: '👆 No kit with me: use touch pads',
  padsLead: 'So I know your kit: hit the pad I name. If one is wrong you can fix it right here.',
  padsFine: 'Pads are fine → latency',
  padsFoot: '🥢 Hitting the pad is the answer: no need to touch the screen',
  padsList: 'If two pads send the same note, it stops and shows how to fix it on the module (VOICE, then PAGE to Nxx).',
  latencyTitle: 'Hit the snare with the click',
  latencyLead: '16 hits. The app learns how late your speakers are and corrects every score.',
  latencyWhy: "I'm measuring how late the sound reaches you, not how well you play. Then on time is on time.",
  noKit: 'No kit plugged in. Plug it in over USB-C, or use the touch pads for now.',
  skip: 'Skip for now',
};

// ---- Placement (web: "played before" → PlacementView after the kit steps) ----
/** Set when the student said they've played before; the placement test (Journey) clears it. */
export const PLACEMENT_KEY = 'drumcoach.firstRun.placement';
export const queuePlacement = (kv: KeyValueStore, on: boolean) => (on ? kv.set(PLACEMENT_KEY, '1') : kv.remove(PLACEMENT_KEY));
export const placementQueued = (kv: Pick<KeyValueStore, 'get'>) => kv.get(PLACEMENT_KEY) === '1';
