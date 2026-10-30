// The pure part of KeepAwake (tested in Node): tag bookkeeping and the foreground rule. keepAwake.ts binds it to
// expo-keep-awake.
import type { KeepAwake } from './contracts';

export type KeepAwakeNative = {
  activate(tag: string): Promise<unknown> | void;
  deactivate(tag: string): Promise<unknown> | void;
};

type Log = (message: string, error: unknown) => void;

/**
 * A KeepAwake over a native keep-awake API. activate/deactivate are idempotent per tag, and native failures are
 * logged, never thrown (losing keep-awake must not stop a take).
 */
export function createKeepAwake(native: KeepAwakeNative, log: Log = (m, e) => console.warn(m, e)): KeepAwake & {
  active(): string[];
} {
  const tags = new Set<string>();
  const call = (what: 'activate' | 'deactivate', tag: string) => {
    try {
      const r = native[what](tag);
      if (r && typeof r.then === 'function') r.then(undefined, (e: unknown) => log(`keep-awake ${what}(${tag}) failed`, e));
    } catch (e) {
      log(`keep-awake ${what}(${tag}) failed`, e);
    }
  };
  return {
    activate(tag) {
      if (tags.has(tag)) return;
      tags.add(tag);
      call('activate', tag);
    },
    deactivate(tag) {
      if (!tags.delete(tag)) return;
      call('deactivate', tag);
    },
    active: () => [...tags],
  };
}

/** The bit of React Native's AppState this needs (so tests can pass a fake). */
export type AppStateLike = {
  currentState: string | null | undefined;
  addEventListener(type: 'change', fn: (state: string) => void): { remove(): void };
};

/** Holds `tag` while the app is in the foreground ('active'); releases it otherwise. Returns a stop function. */
export function keepAwakeWhileForeground(keepAwake: KeepAwake, tag: string, appState: AppStateLike): () => void {
  const apply = (state: string | null | undefined) => {
    if (state === 'active') keepAwake.activate(tag);
    else keepAwake.deactivate(tag);
  };
  apply(appState.currentState ?? 'active');
  const sub = appState.addEventListener('change', apply);
  return () => {
    sub.remove();
    keepAwake.deactivate(tag);
  };
}
