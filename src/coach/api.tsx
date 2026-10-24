import { useSyncExternalStore } from 'react';

export type Entry<T> = { status: 'thinking' | 'done' | 'error'; data?: T; error?: string; note?: string; cached?: boolean };

// Requests live outside React so an answer still arrives if you switch tabs or start playing meanwhile.
const entries = new Map<string, Entry<unknown>>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => { version++; listeners.forEach(l => l()); };

export function askCoach<T>(key: string, path: string, body: unknown = {}, onDone?: (data: T) => void) {
  const e = entries.get(key);
  if (e && e.status !== 'error') return;
  entries.set(key, { status: 'thinking' });
  notify();
  fetch(`/api/coach/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(async r => {
      const j = await r.json().catch(() => ({ error: `Server error ${r.status}` }));
      if (!r.ok) throw new Error(j.error ?? `Server error ${r.status}`);
      entries.set(key, { status: 'done', data: j.data ?? j, note: j.note, cached: j.cached });
      onDone?.(j.data ?? j);
    })
    .catch(err => entries.set(key, { status: 'error', error: err instanceof TypeError ? 'Cannot reach the local server. Is `npm run dev` running?' : String(err.message ?? err) }))
    .finally(notify);
}

export function useCoachEntry<T>(key: string | null): Entry<T> | undefined {
  useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => version);
  return key ? (entries.get(key) as Entry<T> | undefined) : undefined;
}

export function Thinking({ what = 'The coach is thinking' }: { what?: string }) {
  return <p className="thinking" role="status"><span className="spinner" aria-hidden /> {what}… this can take a minute. You can keep playing; the answer will wait here.</p>;
}
