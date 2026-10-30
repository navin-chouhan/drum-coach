// Setup → While you play (web: src/coach/CoachView.tsx CoachSettings "While you play" and "Sticks in hand"), and
// "Which hand leads" (Calibrate). The options, the wording, and the gesture list the core's padCommands defines.
import type { Settings } from '@drum-coach/core/input/settings';

export const LIVE_TIPS: [Settings['liveTips'], string][] = [['off', 'Off'], ['screen', 'Screen'], ['voice', '+ spoken']];
export const LIVE_TIPS_SUB = 'One short tip during a take when something repeats.';
export const CHATTINESS: [Settings['chattiness'], string][] = [['quiet', 'Short'], ['normal', 'Normal'], ['talkative', 'More']];
export const GESTURES_TITLE = 'Kit gestures';
export const GESTURES_SUB = 'Answer the screen from the kit, between takes.';
export const AUTOPILOT_SUB = 'After a take, the next move starts by itself in 5 s. Any pad hit waits.';
export const HANDS: [boolean, string][] = [[false, 'Right-handed'], [true, 'Left-handed']];
export const HAND_SUB = 'Hints, intro slides and How it moves follow this. Scoring doesn\'t change.';

/** The web's gesture list (CoachSettings "Sticks in hand"), word for word. */
export const GESTURE_LIST: [string, string][] = [
  ['hi-hat pedal × 3', 'yes / the big blue move (or crash × 2)'],
  ['ride × 2', 'next / something else'],
  ['tom 2 × 2', 'listen'],
  ['floor × 2', 'slower'],
  ['tom 1 × 2', 'faster'],
  ['crash × 4', 'stop, during a take'],
];

export const liveTipsPatch = (liveTips: Settings['liveTips']): Partial<Settings> => ({ liveTips });
export const gesturesPatch = (padCommands: boolean): Partial<Settings> => ({ padCommands });
export const autopilotPatch = (autopilot: boolean): Partial<Settings> => ({ autopilot });
export const handPatch = (leftHanded: boolean): Partial<Settings> => ({ leftHanded });
