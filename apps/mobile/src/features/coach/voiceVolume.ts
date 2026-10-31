// The coach voice's volume (pure, tested): the "Coach voice volume" setting is 0.2–1.25 (the web scales its own voice
// with it); the system voice (expo-speech) takes 0–1, so anything above 1 is the loudest it gets.
export const speechVolume = (setting: number | undefined): number =>
  typeof setting === 'number' && Number.isFinite(setting) ? Math.max(0, Math.min(1, setting)) : 1;
