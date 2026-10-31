// The coach's one-off questions (feedback on a take, the week plan, tip wording), ported from src/coach/api.tsx:
// one entry per key, asked once (again only on request, never while one is on its way), kept outside React so an
// answer still arrives if you switch screens or start playing meanwhile.
//
// Every question goes to the home server first (HomeServer.call; coach.ts wraps it with the API-key fallback, direct/). Routes that read the student
// carry the iPad's own `context` (D2, D3); it is always sent for them, empty if storage can't be read, so the server
// never answers from its own database instead.
import type { ApiFailure, HomeServer } from '../../platform/contracts';
import type { CoachContext, CoachRoute } from '../../data/coachContext';
import { coachProblem, readFallbackKey, type CoachProblem, type FallbackKeyRead } from './problem';

export type Entry<T> = {
  status: 'thinking' | 'done' | 'error';
  data?: T;
  /** The error line (the web's `error`). */
  error?: string;
  /** What failed, for the panel's offline / error card. */
  problem?: CoachProblem;
  note?: string;
  cached?: boolean;
};

/** What came with an answer besides its data: the server's note, whether it was cached, and for a coach lesson asked
 * with the iPad's context the coach's unstarted lessons of that stage it `replaces` (server/index.ts /api/coach/lesson). */
export type AnswerMeta = { note?: string; cached?: boolean; replaces?: string[] };

/** The routes the panel asks (POST /api/coach/<path>). */
export type AskPath = 'feedback' | 'plan' | 'tips' | 'lesson' | 'month';
const CONTEXT_ROUTES: Partial<Record<AskPath, CoachRoute>> = { feedback: 'feedback', plan: 'plan', lesson: 'lesson', month: 'month' };

export type CoachServer = Pick<HomeServer, 'call' | 'configured'>;
export type CoachAsksDeps = {
  server: CoachServer;
  /** The context for one route (src/data/coachContext.ts through Storage). May reject: an empty one is sent then. */
  context(route: CoachRoute): Promise<CoachContext>;
  /** Whether an Anthropic key is in the Keychain (only for the "no fallback" line); read when a call fails. */
  hasFallbackKey?: FallbackKeyRead;
};

export type CoachAsks = ReturnType<typeof createCoachAsks>;

export function createCoachAsks(deps: CoachAsksDeps) {
  const entries = new Map<string, Entry<unknown>>();
  const listeners = new Set<() => void>();
  let version = 0;
  const notify = () => { version++; listeners.forEach(l => l()); };

  const problemOf = async (f: ApiFailure) => coachProblem(f, { url: deps.server.configured()?.url, hasFallbackKey: await readFallbackKey(deps.hasFallbackKey) });

  /**
   * Asks once per key; `again` asks anew even after an answer (not while one is on its way). Resolves when the entry
   * is settled (screens don't need to wait: they read the entry).
   */
  async function ask<T>(key: string, path: AskPath, body: Record<string, unknown> = {}, onDone?: (data: T, meta: AnswerMeta) => void | Promise<void>, again = false): Promise<void> {
    const e = entries.get(key);
    if (e && (e.status === 'thinking' || (e.status === 'done' && !again))) return;
    entries.set(key, { status: 'thinking' });
    notify();
    try {
      const route = CONTEXT_ROUTES[path];
      let payload = body;
      if (route) {
        let context: CoachContext = {};
        try { context = await deps.context(route); } catch { /* storage unreadable: an empty context, never the server's data */ }
        payload = { ...body, context };
      }
      const r = await deps.server.call<{ data?: T; note?: string; cached?: boolean } | null>('POST', `/api/coach/${path}`, payload);
      if (!r.ok) {
        const problem = await problemOf(r);
        entries.set(key, { status: 'error', error: problem.lines[0] ?? problem.title, problem });
        return;
      }
      const j = (r.data ?? {}) as { data?: T; note?: string; cached?: boolean; replaces?: unknown };
      const data = (j.data ?? j) as T;
      entries.set(key, { status: 'done', data, note: j.note, cached: j.cached });
      const replaces = Array.isArray(j.replaces) ? j.replaces.filter((id): id is string => typeof id === 'string') : undefined;
      try { await onDone?.(data, { note: j.note, cached: j.cached, ...(replaces && { replaces }) }); } catch (err) { entries.set(key, { status: 'error', error: err instanceof Error ? err.message : String(err) }); }
    } finally {
      notify();
    }
  }

  return {
    ask,
    entry: <T>(key: string | null) => (key ? (entries.get(key) as Entry<T> | undefined) : undefined),
    /** Forget an entry (e.g. "Try again" after an error asks anew). */
    clear(key: string) { if (entries.delete(key)) notify(); },
    /** For useSyncExternalStore. */
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    version: () => version,
  };
}
