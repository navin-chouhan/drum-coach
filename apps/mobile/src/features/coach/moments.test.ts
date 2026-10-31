import { DEFAULTS } from '@drum-coach/core/input/settings';
import { describe, expect, it } from 'vitest';
import { kickAgain } from '../../ui/kitMoves';
import { createRepeat, momentText, scoreMoment, voiceFirstPatch, type VoiceGate } from './moments';
import { englishVoices, pickVoice, voiceLabel, voiceRank, type VoiceInfo } from './voicePick';

const on: VoiceGate = { voice: true, liveTips: 'voice', chattiness: 'normal' };

describe('voice moments: what the coach says when (D10 voice first)', () => {
  it('says the score, the verdict and what next after every take; quiet keeps the number and the verdict', () => {
    const m = { kind: 'take', landed: 46, total: 48, verdict: '🏆 Clean! One more and we go to 75', next: 'Ride for next' } as const;
    expect(momentText(m, on)).toBe('46 of 48. Clean! One more and we go to 75. Ride for next.');
    expect(momentText(m, { ...on, chattiness: 'quiet' })).toBe('46 of 48. Clean!');
    expect(momentText({ kind: 'take', verdict: 'Your tempo: 72 BPM.' }, on)).toBe('Your tempo: 72 BPM.');
  });

  it('a take\'s score is said as it ends even before the screen reports the take over; nothing else over a take', () => {
    expect(momentText(scoreMoment({ total: 48, miss: 2, accuracy: 96 }), on, true)).toBe('46 of 48. Clean.');
    expect(momentText({ kind: 'notice', text: 'Break time.' }, on, true)).toBeNull();
    expect(momentText({ kind: 'reply', text: 'Nice.' }, on, true)).toBeNull();
    expect(momentText({ kind: 'upNext', title: 'The money beat' }, on, true)).toBeNull();
  });

  it('live tips are spoken during the take when tips are "+ spoken", never when on the screen only', () => {
    expect(momentText({ kind: 'tip', text: '💡 Kick on one' }, on, true)).toBe('Kick on one');
    expect(momentText({ kind: 'tip', text: 'Kick on one' }, { ...on, liveTips: 'screen' }, true)).toBeNull();
    expect(momentText({ kind: 'tip', text: 'Kick on one' }, { ...on, liveTips: 'off' })).toBeNull();
  });

  it('the voice off says nothing at all', () => {
    for (const m of [{ kind: 'tip', text: 'x' }, { kind: 'take', verdict: 'x' }, { kind: 'notice', text: 'x' }, { kind: 'upNext', title: 'x' }] as const) {
      expect(momentText(m, { ...on, voice: false })).toBeNull();
    }
  });

  it('Up next, step intros and notices', () => {
    expect(momentText({ kind: 'upNext', title: 'The money beat', step: 'Step 3 of 5 · add the snare', bpm: 70 }, on))
      .toBe('Up next: The money beat, Step 3 of 5 · add the snare, 70.');
    const intro = { kind: 'stepIntro', title: 'The money beat', what: 'Hi-hat eighths. Snare on two and four', focus: 'Keep the hat even', bpm: 70 } as const;
    expect(momentText(intro, on)).toBe('Hi-hat eighths. Snare on two and four. Keep the hat even.');
    expect(momentText(intro, { ...on, chattiness: 'quiet' })).toBe('Hi-hat eighths.');
    expect(momentText(intro, { ...on, chattiness: 'talkative' })).toBe('The money beat at 70. Hi-hat eighths. Snare on two and four. Keep the hat even.');
    expect(momentText({ kind: 'notice', text: '🛠 Two minutes to check your pads. It makes every score fair.' }, on)).toBe('Two minutes to check your pads. It makes every score fair.');
    expect(momentText({ kind: 'notice', text: 'One. Two.' }, { ...on, chattiness: 'quiet' })).toBe('One.');
  });

  it('Practice and Songs verdicts by the 90 % line', () => {
    expect(scoreMoment({ total: 20, miss: 0, accuracy: 100 }).verdict).toBe('Clean.');
    expect(scoreMoment({ total: 20, miss: 4, accuracy: 80 }).verdict).toMatch(/^Nearly/);
    expect(scoreMoment({ total: 20, miss: 10, accuracy: 50 })).toMatchObject({ landed: 10, total: 20 });
  });

  it('say it again: the last line; kick × 2 between takes only', () => {
    const r = createRepeat();
    expect(r.last()).toBeNull();
    r.remember('46 of 48. Clean.');
    expect(r.last()).toBe('46 of 48. Clean.');
    const k = kickAgain();
    expect(k({ pad: 'kick', time: 0 }, false)).toBeUndefined();
    expect(k({ pad: 'kick', time: 200 }, false)).toBe('again');
    expect(k({ pad: 'kick', time: 300 }, false)).toBeUndefined(); // a third doesn't fire again
    const p = kickAgain();
    p({ pad: 'kick', time: 0 }, true);
    expect(p({ pad: 'kick', time: 200 }, true)).toBeUndefined(); // a groove's kick doubles during a take
    const s = kickAgain();
    s({ pad: 'kick', time: 0 }, false);
    expect(s({ pad: 'kick', time: 600 }, false)).toBeUndefined(); // too slow
  });

  it('spoken live tips by default on the iPad, once: a later choice is kept', () => {
    expect(DEFAULTS.liveTips).toBe('screen'); // the shared default (the web's) is unchanged
    expect(voiceFirstPatch({ liveTips: 'screen' }, false)).toEqual({ liveTips: 'voice' });
    expect(voiceFirstPatch({ liveTips: 'off' }, false)).toEqual({});
    expect(voiceFirstPatch({ liveTips: 'screen' }, true)).toBeNull();
  });
});

describe('the coach\'s voice: the best installed one', () => {
  const v = (identifier: string, name: string, language = 'en-US', quality = 'Default'): VoiceInfo => ({ identifier, name, language, quality });
  const voices = [
    v('com.apple.ttsbundle.siri_female_de-DE_compact', 'Helena', 'de-DE'),
    v('com.apple.voice.compact.en-US.Samantha', 'Samantha'),
    v('com.apple.voice.enhanced.en-GB.Daniel', 'Daniel', 'en-GB', 'Enhanced'),
    v('com.apple.voice.premium.en-US.Zoe', 'Zoe'), // expo-speech says "Default" for Premium
    v('com.apple.speech.synthesis.voice.Bubbles', 'Bubbles'),
    v('com.apple.voice.enhanced.en-US.Ava', 'Ava', 'en-US', 'Enhanced'),
  ];
  it('Premium, then Enhanced (en-US first), then compact; no novelty voices, no other languages', () => {
    expect(englishVoices(voices).map(x => x.name)).toEqual(['Zoe', 'Ava', 'Daniel', 'Samantha']);
    expect(voiceRank(voices[0])).toBeLessThan(0);
    expect(voiceLabel(voices[3])).toBe('Zoe (Premium)');
    expect(voiceLabel(voices[2])).toBe('Daniel (Enhanced) · en-GB');
  });
  it('a saved pick wins while it is installed; a gone one falls back to the best (never a voice expo-speech refuses)', () => {
    expect(pickVoice(voices, 'com.apple.voice.compact.en-US.Samantha')?.name).toBe('Samantha');
    expect(pickVoice(voices, 'com.apple.voice.premium.en-US.Gone')?.name).toBe('Zoe');
    expect(pickVoice([], null)).toBeUndefined();
  });
});
