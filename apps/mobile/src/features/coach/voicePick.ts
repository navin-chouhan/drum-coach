// The coach's voice on the iPad (D10 voice first, option A): the best English voice installed, or the one picked in
// Setup → Coach and voice. Premium and Enhanced voices are downloaded in iOS Settings → Accessibility → Spoken
// Content → Voices; expo-speech reports Premium as "Default", so the identifier ("…premium…") tells them apart.
// Pure (tested): voice.ts lists the voices and passes the id to expo-speech. A saved id that isn't installed any more
// is never used (expo-speech would throw and say nothing). Piper from the home server comes later (option B).

export type VoiceInfo = { identifier: string; name: string; quality: string; language: string };

export const VOICE_ID_KEY = 'drumcoach.coachVoiceId';

/** Higher is better: Premium, then Enhanced, then the compact default; en-US first among equals. */
export function voiceRank(v: VoiceInfo, lang = 'en-US'): number {
  const id = v.identifier.toLowerCase();
  const tier = id.includes('premium') ? 3 : id.includes('enhanced') || v.quality === 'Enhanced' ? 2 : 1;
  const local = v.language === lang ? 2 : v.language.slice(0, 2) === lang.slice(0, 2) ? 1 : 0;
  // the novelty voices (Bubbles, Zarvox, …) are no coach
  const novelty = /eloquence|bad news|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|bahh|fred|junior|kathy|ralph|speech\.synthesis\.voice/i.test(`${v.name} ${v.identifier}`);
  return local > 0 && !novelty ? tier * 10 + local : -100;
}

/** English voices, best first (the picker's list). */
export function englishVoices(voices: readonly VoiceInfo[], lang = 'en-US'): VoiceInfo[] {
  return voices.filter(v => voiceRank(v, lang) > -100).sort((a, b) => voiceRank(b, lang) - voiceRank(a, lang) || a.name.localeCompare(b.name));
}

/** The voice to speak with: the saved one when it's still installed, else the best English one, else none (system default). */
export function pickVoice(voices: readonly VoiceInfo[], savedId: string | null, lang = 'en-US'): VoiceInfo | undefined {
  const saved = savedId ? voices.find(v => v.identifier === savedId) : undefined;
  return saved ?? englishVoices(voices, lang)[0];
}

/** "Ava (Premium)", "Samantha (Enhanced)", "Daniel". */
export function voiceLabel(v: VoiceInfo): string {
  const id = v.identifier.toLowerCase();
  const q = id.includes('premium') ? 'Premium' : id.includes('enhanced') || v.quality === 'Enhanced' ? 'Enhanced' : '';
  return `${v.name}${q ? ` (${q})` : ''}${v.language !== 'en-US' ? ` · ${v.language}` : ''}`;
}
