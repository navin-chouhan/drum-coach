// PLACEHOLDER until R6's voice moments land: the same call as `speakMoment` from '../coach/voice' (R6 owns it).
// Swap the import in JourneyScreen.tsx and delete this file once R6 is merged. Gated on the voice setting, never throws.
import { getStorage } from '../../platform/storage';
import { readSettings } from '../../ui/appSettings';
import { sayNext } from '../coach/voice';

export type JourneyMoment = { kind: 'upNext'; title: string; step?: string; bpm?: number } | { kind: 'notice'; text: string };

export function speakMoment(m: JourneyMoment) {
  try {
    if (!readSettings(getStorage().kv).voice) return;
    sayNext(m.kind === 'notice' ? m.text : `Up next: ${m.title}${m.step ? `, ${m.step}` : ''}${m.bpm ? `, at ${m.bpm}` : ''}.`);
  } catch { /* the words are on screen */ }
}
