// The coach chat as a sheet (D10): a tap on the coach's bubble on any screen opens it, ✕ / Esc / a tap outside closes
// it. The sheet itself is drawn once per screen by app/_layout.tsx (CoachChatHost); this is only its open state.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => { if (open !== v) { open = v; listeners.forEach(l => l()); } };

export const openCoachChat = () => set(true);
export const closeCoachChat = () => set(false);
export const isCoachChatOpen = () => open;
export const subscribeCoachChat = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function useCoachChatOpen(): boolean {
  return useSyncExternalStore(subscribeCoachChat, isCoachChatOpen);
}
