// The coach's voice, without the native modules (pure, tested; voice.ts wires expo-speech and the audio engine).
//
// Why each sentence waits for the audio session (the silent coach on the owner's first iPad test): expo-speech's
// synthesizer uses the app's audio session (usesApplicationAudioSession, its default), and drum-audio is that
// session's one owner (AUDIO-DESIGN §3.6). The session is only set up (.playback + mixWithOthers, so the Silent switch
// doesn't mute it and other apps keep playing, D6) and active while the engine runs. It doesn't run on a fresh launch
// until a play screen opens, nor after the app comes back from the background, nor after the idle suspend
// (setActive(false)). Speech then went into an inactive session (or the default solo-ambient one, which Silent mode
// mutes) and nothing was heard. So: start the engine first (a no-op while it runs), hold it while the sentence plays,
// let go when it's done. Sentences keep their order. The volume is the "Coach voice volume" setting, read per sentence.
import { speechVolume } from './voiceVolume';

export const RATE = 1.05; // the web's browser voice rate
/** Let go of the engine this long after a sentence started, if the synthesizer never says it's done. */
export const HOLD_MAX_MS = 30_000;

export type SpeakOptions = { rate: number; volume: number; voice?: string; onDone: () => void; onStopped: () => void; onError: () => void };

export type VoiceDeps = {
  speak(text: string, o: SpeakOptions): void;
  stop(): Promise<void>;
  /** The audio session set up and active (audio.start()); resolves at once while it runs. Rejects without a module. */
  ready(): Promise<unknown>;
  /** Keep the engine (and so the session) up; returns the release. */
  hold(): () => void;
  /** The "Coach voice volume" setting now. */
  volume(): number | undefined;
  /** The installed voice to speak with (voicePick.ts), or undefined for the system default. */
  voiceId?(): string | undefined;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(t: unknown): void;
};

export function createVoice(d: VoiceDeps) {
  let chain: Promise<void> = Promise.resolve();
  let generation = 0; // bumped by stop(): sentences queued before it are dropped

  function speakNow(text: string) {
    const release = d.hold();
    let done = false;
    const end = () => { if (done) return; done = true; d.clearTimer(timer); release(); };
    const timer = d.setTimer(end, HOLD_MAX_MS);
    try {
      const voice = d.voiceId?.();
      d.speak(text, { rate: RATE, volume: speechVolume(d.volume()), ...(voice && { voice }), onDone: end, onStopped: end, onError: end });
    } catch {
      end(); // no voice in this build: the words are on screen
    }
  }

  /** Says `text` after whatever the coach is already saying. */
  function sayNext(text: string): Promise<void> {
    const gen = generation;
    chain = chain.then(() => d.ready().catch(() => undefined)).then(() => { if (gen === generation) speakNow(text); });
    return chain;
  }

  /** Stops what's being said and anything queued. */
  function stop(): Promise<void> {
    generation++;
    return d.stop().catch(() => undefined);
  }

  /** Says something now, cutting off what was being said. */
  function sayNow(text: string): Promise<void> {
    const gen = ++generation;
    chain = chain.then(() => d.stop().catch(() => undefined)).then(() => d.ready().catch(() => undefined))
      .then(() => { if (gen === generation) speakNow(text); });
    return chain;
  }

  return { sayNext, sayNow, stop };
}
