// What the coach panel draws, in order (mockups coach, coach-offline), from the session state. Pure, so the order and
// the offline state are tested without React Native.
import type { Action, CoachState } from './session';
import type { CoachProblem } from './problem';

export type PanelItem =
  | { kind: 'ctx'; key: string; text: string }
  | { kind: 'coach'; key: string; text: string }
  | { kind: 'app'; key: string; text: string }
  | { kind: 'me'; key: string; text: string; sub?: string; waiting: boolean }
  | { kind: 'next'; key: string; action: Action }
  | { kind: 'streaming'; key: string; text: string }
  | { kind: 'thinking'; key: string }
  | { kind: 'problem'; key: string; problem: CoachProblem }
  | { kind: 'keepsWorking'; key: string };

export const THINKING = { title: 'Your coach is thinking…', line: 'This can take a minute. Keep playing; the answer waits here.' } as const;
export const WAITING = 'waiting · sends when the coach is back';

/** The header pill: the home server answered / didn't / isn't set up. */
export function headerStatus(s: Pick<CoachState, 'problem'>, server: 'unknown' | 'reachable' | 'unreachable' | 'not-configured') {
  if (s.problem?.kind === 'offline' || server === 'unreachable') return { tone: 'orange' as const, text: 'can’t reach it' };
  if (s.problem?.kind === 'not-configured' || server === 'not-configured') return { tone: 'orange' as const, text: 'not set up' };
  if (server === 'reachable') return { tone: 'green' as const, text: 'home server' };
  return { tone: 'white' as const, text: 'checking…' };
}

export function panelItems(s: CoachState, o: { nextStep?: Action }): PanelItem[] {
  const out: PanelItem[] = [];
  const thread = s.thread;
  const lastCoach = thread.findLastIndex(t => t.who === 'coach');
  const waiting: PanelItem[] = [];
  let appLine: PanelItem | undefined;
  thread.forEach((t, i) => {
    const key = String(t.id);
    if (t.who === 'ctx') out.push({ kind: 'ctx', key, text: t.text });
    else if (t.who === 'coach') {
      out.push({ kind: 'coach', key, text: t.text });
      if (i === lastCoach && o.nextStep) out.push({ kind: 'next', key: `${key}-next`, action: o.nextStep });
    } else if (t.who === 'app') {
      if (s.problem && i === thread.length - 1) appLine = { kind: 'app', key, text: t.text }; // drawn under the problem card
      else out.push({ kind: 'app', key, text: t.text });
    } else {
      const item: PanelItem = { kind: 'me', key, text: t.text, waiting: !!t.queued, sub: t.queued ? WAITING : t.via === 'kit' ? 'from the kit' : undefined };
      (t.queued && s.problem ? waiting : out).push(item);
    }
  });
  if (s.status === 'thinking') {
    if (s.streaming) out.push({ kind: 'streaming', key: 'streaming', text: s.streaming });
    else out.push({ kind: 'thinking', key: 'thinking' });
  }
  if (s.problem) {
    out.push({ kind: 'problem', key: 'problem', problem: s.problem });
    if (appLine) out.push(appLine);
    if (s.problem.kind === 'offline' || s.problem.kind === 'not-configured') out.push({ kind: 'keepsWorking', key: 'keeps' });
    out.push(...waiting);
  } else if (waiting.length) out.push(...waiting);
  return out;
}

/** The composer's hint under the field when the coach is off or the server is down. */
export function composerNote(o: { liveCoach: boolean; problem?: CoachProblem; queued?: string }): string | undefined {
  if (!o.liveCoach) return '“The coach follows my practice” is off in Setup → Coach and voice, so questions aren’t sent.';
  if (o.queued) return 'Your question waits and goes out when the coach is back. A new one replaces it.';
  return undefined;
}
