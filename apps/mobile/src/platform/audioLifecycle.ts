// The audio engine's life around the screens (AUDIO-DESIGN §3.4, §4), pure so it is tested in Node:
// - watchInterruptions: a call, Siri or an alarm (audio 'began'), the engine stopping (Home, a route or format change,
//   a media reset), or the app leaving the foreground. Takes end on these (D6: ≥ 2 whole bars kept, flagged).
// - the keeper: play screens hold the engine while they're shown (touch pads sound before the first take, and again
//   after the app comes back), and the engine is suspended after IDLE_MS with no holder and no sound (battery).
import type { AudioPort } from '@drum-coach/core/play/audioPort';

/** React Native's AppState, as far as this needs it. */
export type AppStateLike = { addEventListener(type: 'change', fn: (state: string) => void): { remove(): void } };

/** Calls `fn` (with the Clock time when the audio gives one) on every interruption until the returned stop. */
export function watchInterruptions(audio: Pick<AudioPort, 'onInterruption'>, appState: AppStateLike, fn: (at?: number) => void): () => void {
  const offAudio = audio.onInterruption(e => { if (e.type === 'began' || e.type === 'engine-stopped') fn(e.at); });
  const sub = appState.addEventListener('change', s => { if (s !== 'active') fn(); });
  return () => { offAudio(); sub.remove(); };
}

/** AUDIO-DESIGN §3.4: suspend after this long with no take and no touch-pad screen. */
export const IDLE_MS = 60_000;

type Timer = unknown;
export type KeeperDeps = {
  port: Pick<AudioPort, 'available' | 'start' | 'suspend'>;
  setTimer: (fn: () => void, ms: number) => Timer;
  clearTimer: (t: Timer) => void;
  idleMs?: number;
};

export type AudioKeeper = {
  /** A play screen is shown: start the engine now and keep it. Returns the release. */
  hold(): () => void;
  /** Any sound handed over or played (a take, the metronome, a tap): the idle time starts again. */
  activity(): void;
  /** The app is back in the foreground: start the engine again if a screen holds it (native stopped it). */
  foreground(): void;
  /** The keeper suspended the engine (a touch then starts it again). */
  readonly suspended: boolean;
  readonly holds: number;
};

export function createAudioKeeper(d: KeeperDeps): AudioKeeper {
  const idleMs = d.idleMs ?? IDLE_MS;
  let holds = 0, timer: Timer | undefined, suspended = false;
  const clear = () => { if (timer !== undefined) { d.clearTimer(timer); timer = undefined; } };
  const start = () => {
    if (!d.port.available) return;
    suspended = false;
    void d.port.start().catch(() => { /* the screens show their own audio errors when a take starts */ });
  };
  const arm = () => {
    clear();
    if (holds > 0 || suspended || !d.port.available) return;
    timer = d.setTimer(() => {
      timer = undefined;
      if (holds > 0) return;
      suspended = true;
      d.port.suspend();
    }, idleMs);
  };
  return {
    hold() {
      holds++;
      clear();
      start();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds--;
        arm();
      };
    },
    activity() {
      if (suspended) start();
      arm();
    },
    foreground() { if (holds > 0) start(); },
    get suspended() { return suspended; },
    get holds() { return holds; },
  };
}

/**
 * The port with the keeper in its path: start, schedule and playNow count as activity, and a sound played while the
 * keeper had suspended the engine starts it again (that one tap is silent; the next ones sound).
 */
export function withKeeper<P extends AudioPort>(port: P, keeper: AudioKeeper): P {
  return {
    ...port,
    start: () => { const p = port.start(); keeper.activity(); return p; },
    schedule: (events: Parameters<AudioPort['schedule']>[0]) => { keeper.activity(); return port.schedule(events); },
    playNow: (sound: Parameters<AudioPort['playNow']>[0], gain: number) => { keeper.activity(); return port.playNow(sound, gain); },
  };
}
