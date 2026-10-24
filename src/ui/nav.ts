// Tiny cross-tab navigation: "play this exercise" from the coach, plan or songs.
export type PlayRequest = { chartId: string; bpm?: number };
const listeners = new Set<(r: PlayRequest) => void>();
export const onPlayRequest = (fn: (r: PlayRequest) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const requestPlay = (r: PlayRequest) => listeners.forEach(l => l(r));
