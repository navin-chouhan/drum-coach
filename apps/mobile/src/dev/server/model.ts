// The home-server debug screen's words (app/dev/server.tsx): what a health answer or a failure means, and what to try.
// Pure, so it is tested in Node. Nothing here ever sees the token.
import type { ApiFailure, ServerHealth } from '../../platform/contracts';

export type Line = { label: string; value: string; tone: 'ok' | 'warn' | 'plain' };

/** One line per thing the server can do. */
export function healthLines(h: ServerHealth): Line[] {
  const line = (label: string, v: boolean, yes: string, no: string): Line => ({ label, value: v ? yes : no, tone: v ? 'ok' : 'warn' });
  return [
    { label: 'Server', value: `Drum Coach ${h.version}`, tone: 'ok' },
    line('Coach', h.coach, 'ready (Claude via this server)', 'not ready: run `claude` once on the server to log in'),
    line('Voice (Piper)', h.tts, 'installed', 'not installed (the iPad can use its own voice)'),
    line('Listening (Whisper)', h.stt, 'installed', 'not installed'),
    line('YouTube search', h.youtube, 'on', 'off (no YOUTUBE_API_KEY)'),
  ];
}

const HINTS: Record<ApiFailure['reason'], string> = {
  'not-configured': 'Enter the server address and APP_TOKEN, then Save.',
  unreachable: 'Check the iPad and the server are on the same network (or Tailscale), `npm run server` is running with APP_HOST set, the firewall allows the port, and Local Network is allowed for Drum Coach in iPad Settings.',
  unauthorized: 'The token does not match APP_TOKEN in the server\'s .env. Paste it again and Save.',
  forbidden: 'The token is right but the server does not accept this address: add it to ALLOWED_HOSTS in .env and restart the server.',
  'rate-limited': 'Too many requests in a minute; wait a moment and try again.',
  'bad-response': 'Something answered, but not like the Drum Coach server. Check the address and port (8787 by default).',
  'server-error': 'The server hit an error; its terminal shows what happened.',
};

/** A failure as a headline plus what to try. */
export function failureText(f: ApiFailure): { title: string; hint: string } {
  const status = f.status !== undefined ? ` (HTTP ${f.status})` : '';
  const title = {
    'not-configured': 'Not set up yet',
    unreachable: 'Can\'t reach the server',
    unauthorized: 'Wrong token',
    forbidden: 'Address not allowed',
    'rate-limited': 'Slow down',
    'bad-response': 'Unexpected answer',
    'server-error': 'Server error',
  }[f.reason];
  return { title: `${title}${status}${f.detail ? `: ${f.detail}` : ''}`, hint: HINTS[f.reason] };
}
