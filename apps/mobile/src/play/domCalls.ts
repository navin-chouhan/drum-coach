// Calls from a DOM component (a WebView page) to native that may never answer. Expo's DOM bridge answers a native
// action by injecting JavaScript into the WebView; when that view isn't registered at that moment (it is still being
// mounted, or it's being replaced) the injection fails inside Expo ("Unable to find the 'DomWebView' view with tag")
// and the answer is dropped: an `await` on it would hang for good (a stalled clock sync, a results replay that never
// comes). Every awaited native action in src/notation/dom and src/youtube/dom goes through withTimeout. Pure.

/** Rejects with `DomCallTimeout` when `p` hasn't settled after `ms`. */
export class DomCallTimeout extends Error {
  constructor(ms: number) {
    super(`No answer from the app in ${ms} ms`);
    this.name = 'DomCallTimeout';
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout }): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = timers.set(() => reject(new DomCallTimeout(ms)), ms);
    p.then(v => { timers.clear(t); resolve(v); }, e => { timers.clear(t); reject(e); });
  });
}

/** A native action with a deadline: `fn` wrapped so each call rejects instead of hanging. */
export const deadline = <A extends unknown[], T>(fn: (...a: A) => Promise<T>, ms: number) => (...a: A) => withTimeout(fn(...a), ms);

/**
 * Asks again (up to `tries` times, `gapMs` apart) until an answer comes; resolves undefined when none did or the caller
 * gave up (`live()` false). For one-off asks whose answer matters (the results so far when a take starts).
 */
export async function askUntilAnswered<T>(ask: () => Promise<T>, o: { tries: number; gapMs: number; live: () => boolean; sleep?: (ms: number) => Promise<void> }): Promise<T | undefined> {
  const sleep = o.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  for (let i = 0; i < o.tries && o.live(); i++) {
    try { return await ask(); } catch { /* dropped or failed: ask again */ }
    if (i + 1 < o.tries) await sleep(o.gapMs);
  }
  return undefined;
}

/** The font the sheet waits for, but never for good: a failed or slow font load still draws (with the fallback). */
export const fontOrTimeout = (load: () => Promise<unknown>, ms: number): Promise<void> =>
  withTimeout(Promise.resolve().then(load), ms).then(() => undefined, () => undefined);
