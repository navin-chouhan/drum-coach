// The native player's events as the YtEvent shapes of src/youtube/ytController.ts (the module stays independent of
// the app: its own copy of the shapes, checked against the app's in contract.test.ts). Pure.

export type NativeYtEvent =
  | { type: 'ready'; raw: number; rate: number; at?: number; duration: number; title: string; rates: number[] }
  | { type: 'state'; state: number; raw: number; rate: number; at?: number; duration: number; title: string }
  | { type: 'rate'; raw: number; rate: number; at?: number }
  | { type: 'sample'; raw: number; rate: number; at?: number; duration: number }
  | { type: 'error'; code?: number; message?: string };

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * One `onPlayerEvent` payload (`{ event }`) as a YtEvent, or null for anything else. `loadError` is the app's text for
 * "the IFrame API didn't load" (the page sends `{ type: 'error', load: true }`).
 */
export function toYtEvent(payload: unknown, loadError: string): NativeYtEvent | null {
  const e = (payload as { event?: unknown } | null)?.event as Record<string, unknown> | undefined;
  if (!e || typeof e !== 'object') return null;
  const at = typeof e.at === 'number' && Number.isFinite(e.at) ? { at: e.at } : {};
  const base = { raw: num(e.raw), rate: num(e.rate, 1), ...at };
  switch (e.type) {
    case 'ready': return { type: 'ready', ...base, duration: num(e.duration), title: str(e.title), rates: Array.isArray(e.rates) ? e.rates.filter((r): r is number => typeof r === 'number') : [1] };
    case 'state': return { type: 'state', state: num(e.state, -1), ...base, duration: num(e.duration), title: str(e.title) };
    case 'rate': return { type: 'rate', ...base };
    case 'sample': return { type: 'sample', ...base, duration: num(e.duration) };
    case 'error':
      if (e.load === true) return { type: 'error', message: loadError };
      return typeof e.code === 'number' ? { type: 'error', code: e.code } : { type: 'error' };
    default: return null;
  }
}
