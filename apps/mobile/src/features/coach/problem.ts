// What went wrong with a coach call, in the words the panel shows (mockup coach-offline: what failed, Try again,
// Coach settings, what keeps working). The web shows the server's error line; the iPad also has to say when the
// home server itself can't be reached, which the web never needed (its server runs next to the browser).
import type { ApiFailure } from '../../platform/contracts';

export type CoachProblem = {
  /** offline: no answer (or no server set up), so a question can wait; coach: the server answered with an error. */
  kind: 'offline' | 'not-configured' | 'refused' | 'coach';
  title: string;
  /** What failed, one line each. `host` is shown in mono where it appears. */
  lines: string[];
  host?: string;
  /** The question is kept and sent when the coach is back (only when the server can't be reached). */
  canQueue: boolean;
  /** Offer "Coach settings" first (the address or token needs fixing). */
  settingsFirst: boolean;
};

/** "Everything else keeps working" (mockup coach-offline). */
export const KEEPS_WORKING = [
  'Lessons, scoring and the tempo ladder',
  "Live tips while you play (they're rule-based)",
  'Your takes are saved on this iPad',
] as const;

/** host:port of a base URL, for the "didn't answer" line. */
export function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).host || undefined; } catch { return undefined; }
}

/**
 * Whether an Anthropic key is in the Keychain, read when a call fails (the Keychain read is async, so it's awaited
 * then, never guessed at start-up; a read that throws counts as no key).
 */
export type FallbackKeyRead = () => boolean | Promise<boolean>;
export async function readFallbackKey(read?: FallbackKeyRead): Promise<boolean> {
  try { return !!(await read?.()); } catch { return false; }
}

/** The API-key fallback (D2) isn't built: the line says why there's no fallback either way. */
const fallbackLine = (hasKey: boolean) => (hasKey
  ? "The API-key fallback isn't built yet, so there's no fallback."
  : "No API key is set, so there's no fallback.");

export function coachProblem(f: ApiFailure, o: { url?: string; hasFallbackKey?: boolean } = {}): CoachProblem {
  const host = hostOf(o.url);
  const detail = f.detail ?? '';
  switch (f.reason) {
    case 'not-configured':
      return { kind: 'not-configured', title: 'Your coach is not set up yet', canQueue: true, settingsFirst: true,
        lines: ['Add your home server (the laptop running `npm run server`) and its token in Setup → Coach.', fallbackLine(!!o.hasFallbackKey)] };
    case 'unreachable': {
      const secs = detail.match(/within (\d+) s/)?.[1];
      const who = host ?? 'Your home server';
      return { kind: 'offline', title: 'Can’t reach your coach', host, canQueue: true, settingsFirst: false,
        lines: [`${who} didn’t answer${secs ? ` in ${secs} seconds` : ''}. Is the laptop awake and on the same Wi-Fi (or Tailscale)?`, fallbackLine(!!o.hasFallbackKey)] };
    }
    case 'unauthorized':
      return { kind: 'refused', title: 'The server didn’t accept the token', host, canQueue: false, settingsFirst: true,
        lines: ['Copy APP_TOKEN from the server’s .env into Setup → Coach again.'] };
    case 'forbidden':
      return { kind: 'refused', title: 'The server refused this iPad', host, canQueue: false, settingsFirst: true,
        lines: [`Add the address this iPad uses${host ? ` (${host})` : ''} to ALLOWED_HOSTS in the server’s .env and restart it.`] };
    case 'rate-limited':
      return { kind: 'coach', title: 'The coach is busy', canQueue: false, settingsFirst: false,
        lines: ['Too many coach calls this minute. Try again in a moment.'] };
    case 'server-error':
    case 'bad-response':
    default:
      // A 503 from the coach routes is the server's AiError message (e.g. the claude CLI missing or logged out).
      return { kind: 'coach', title: 'The coach couldn’t answer', canQueue: false, settingsFirst: false,
        lines: [detail || 'Something went wrong on the server. Try again.'] };
  }
}

/** A coach answer that came back as an `error` event or a thrown message: the server's own words. */
export const coachError = (message: string): CoachProblem =>
  ({ kind: 'coach', title: 'The coach couldn’t answer', lines: [message], canQueue: false, settingsFirst: false });
