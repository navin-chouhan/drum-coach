import { getSettings } from '../input/settings';
import { audio, playVoice, stopVoices } from '../play/audio';

// The coach's voice: Piper on the local server (offline, natural) when it's set up, else the browser's voice.
// Fixed phrases (count-in, tips) are decoded ahead of time so they can play exactly on a beat.
let engine: Promise<'piper' | 'browser'> | null = null;
const clips = new Map<string, Promise<AudioBuffer | null>>();
const ready = new Map<string, AudioBuffer>();
let busyUntil = 0;
// dev only: what the voice said, for headless tests (drumCoachVoiceLog in the console)
const log = (what: string) => { if (import.meta.env.DEV) ((window as unknown as { drumCoachVoiceLog?: string[] }).drumCoachVoiceLog ??= []).push(what); };

export const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];

/**
 * Seconds from a clip's start to where its word "lands": the first 10 ms where the loudness reaches half its peak,
 * which is the vowel (we hear a word's beat there, not at the "s" or "t" before it). Placing that on the beat makes
 * "two" and "five" land alike.
 */
const onsets = new WeakMap<AudioBuffer, number>();
export function onsetOf(buf: AudioBuffer) {
  let at = onsets.get(buf);
  if (at === undefined) {
    const x = buf.getChannelData(0), win = Math.max(1, Math.round(buf.sampleRate * 0.01)), env: number[] = [];
    for (let i = 0; i + win <= x.length; i += win) { let s = 0; for (let j = i; j < i + win; j++) s += x[j] * x[j]; env.push(Math.sqrt(s / win)); }
    const peak = Math.max(0, ...env), k = env.findIndex(e => e >= peak * 0.5);
    at = k > 0 ? (k * win) / buf.sampleRate : 0;
    onsets.set(buf, at);
  }
  return at;
}

export function voiceEngine() {
  engine ??= fetch('/api/tts/status').then(r => r.json()).then(s => (s.engine === 'piper' ? 'piper' : 'browser') as 'piper' | 'browser').catch(() => 'browser' as const);
  return engine;
}

function clip(text: string): Promise<AudioBuffer | null> {
  if (!clips.has(text)) {
    clips.set(text, fetch(`/api/tts?text=${encodeURIComponent(text)}`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then(b => audio().decodeAudioData(b))
      .then(buf => { ready.set(text, buf); return buf; })
      .catch(() => { clips.delete(text); return null; }));
  }
  return clips.get(text)!;
}

/** Renders and decodes phrases ahead of time (Piper only). */
export async function prepare(texts: string[]) {
  if (await voiceEngine() === 'piper') await Promise.all(texts.map(clip));
}

/** Plays a prepared phrase at an exact audio time (count-in). Returns false if it isn't ready yet. */
export function sayAt(text: string, when: number) {
  const buf = ready.get(text);
  if (!buf) return false;
  log(`at:${text}`);
  playVoice(buf, Math.max(audio().currentTime, when - onsetOf(buf))); // the word's vowel lands on the beat
  return true;
}

// Everything spoken plays back to back: the coach's streamed sentences queue after a verdict that's still playing.
let queueEnd = 0;

/** Says something now. `urgent` cuts in; otherwise it's skipped while the coach is still talking. */
export async function say(text: string, urgent = false) {
  const now = performance.now();
  if (!urgent && now < busyUntil) return;
  if (await voiceEngine() === 'piper') {
    const buf = await clip(text);
    if (buf) { busyUntil = performance.now() + buf.duration * 1000; log(`say:${text}`); queueEnd = Math.max(queueEnd, playVoice(buf)); return; }
  }
  log(`browser:${text}`);
  if (!('speechSynthesis' in window)) return;
  if (urgent) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05; u.volume = Math.min(1, getSettings().voiceVolume);
  busyUntil = now + 300 + text.length * 70; // rough length, the browser doesn't tell us
  speechSynthesis.speak(u);
}

/** Says `text` after whatever the coach is already saying. Resolves when it has been scheduled. */
export async function sayNext(text: string) {
  if (await voiceEngine() === 'piper') {
    const buf = await clip(text);
    if (buf) {
      const c = audio(), at = Math.max(c.currentTime + 0.02, queueEnd);
      log(`next:${text}`);
      queueEnd = playVoice(buf, at);
      busyUntil = performance.now() + (queueEnd - c.currentTime) * 1000;
      return;
    }
  }
  if (!('speechSynthesis' in window)) return;
  log(`browser:${text}`);
  speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { rate: 1.05, volume: Math.min(1, getSettings().voiceVolume) }));
  busyUntil = Math.max(busyUntil, performance.now()) + 300 + text.length * 70;
}
/** A take is starting: whatever the coach was saying stops, so it can't talk over the count-in. */
export function hush() {
  stopVoices(); queueEnd = 0; busyUntil = 0;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
/** Resolves when the coach has finished talking (for hands-free listening). */
export function untilQuiet(): Promise<void> {
  return new Promise(res => {
    const check = () => (performance.now() >= busyUntil && !(('speechSynthesis' in window) && speechSynthesis.speaking) ? res() : setTimeout(check, 150));
    check();
  });
}
