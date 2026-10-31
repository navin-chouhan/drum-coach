// Stick technique (web src/ui/TechniqueView.tsx): every "How it moves" movement in one place, any time (not only
// inside a lesson). The words, the movements and the tempos are the web's. Pure: TechniqueScreen.tsx draws it.
import { DEMOS, DEMO_IDS, type DemoId } from '@drum-coach/core/content/demos';

export const TITLE = '🥢 Stick technique';
/** The web's line. Its "then check yourself with the camera" is cut: the iPad app has no camera self-check (v1). */
export const INTRO = 'How to hold the sticks, how each stroke moves and how the foot plays the kick. Watch it slowly, then try it in the air.';
export const TEMPOS = [40, 50, 60, 70, 80, 100] as const;
export const FIRST: DemoId = 'grip';
export const START_BPM = 60;

/** The movements to pick from, in the web's order, with their titles. */
export const demoOptions = () => DEMO_IDS.map(id => ({ value: id, label: DEMOS[id].title }));
