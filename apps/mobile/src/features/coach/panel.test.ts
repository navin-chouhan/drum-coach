import { describe, expect, it } from 'vitest';
import { composerNote, headerStatus, panelItems, WAITING } from './panel';
import { coachProblem } from './problem';
import type { CoachState } from './session';
import { unreachable } from './coach.testutil';

const base: CoachState = { status: 'idle', at: 0, thread: [] };

describe('the panel, in the mockup order', () => {
  it('online (mockup coach): context, the coach, its next step, my question, thinking', () => {
    const s: CoachState = { ...base, status: 'thinking', thread: [
      { id: 1, who: 'ctx', text: 'The money beat · take 2 · 70 BPM' },
      { id: 2, who: 'coach', text: 'Nice: 46 of 48 landed.' },
      { id: 3, who: 'me', text: 'Make my next lesson about the kick', via: 'kit' },
    ] };
    const items = panelItems(s, { nextStep: { kind: 'faster', label: 'Play at 75' } });
    expect(items.map(i => i.kind)).toEqual(['ctx', 'coach', 'next', 'me', 'thinking']);
    expect(items[3]).toMatchObject({ sub: 'from the kit', waiting: false });
    expect(panelItems({ ...s, streaming: 'Nice.' }, {}).at(-1)).toEqual({ kind: 'streaming', key: 'streaming', text: 'Nice.' });
  });
  it("offline (mockup coach-offline): what failed, the app's verdict, what keeps working, then the waiting question", () => {
    const problem = coachProblem(unreachable, { url: 'http://drum-laptop.local:8787' });
    const s: CoachState = { ...base, problem, queued: 'Make my next lesson about the kick', thread: [
      { id: 1, who: 'ctx', text: 'The money beat · take 2 · 70 BPM' },
      { id: 2, who: 'me', text: 'Make my next lesson about the kick', via: 'typed', queued: true },
      { id: 3, who: 'app', text: '46 of 48 landed, 21 in a row.' },
    ] };
    const items = panelItems(s, {});
    expect(items.map(i => i.kind)).toEqual(['ctx', 'problem', 'app', 'keepsWorking', 'me']);
    expect(items.at(-1)).toMatchObject({ waiting: true, sub: WAITING });
    expect(headerStatus(s, 'reachable')).toEqual({ tone: 'orange', text: 'can’t reach it' });
    expect(headerStatus(base, 'reachable')).toEqual({ tone: 'green', text: 'home server' });
    expect(composerNote({ liveCoach: true, queued: 'x' })).toMatch(/waits/);
    expect(composerNote({ liveCoach: false })).toMatch(/off in Setup/);
    expect(composerNote({ liveCoach: true })).toBeUndefined();
  });
  it('a coach error is not offline: no "keeps working" list', () => {
    const s: CoachState = { ...base, problem: coachProblem({ ok: false, reason: 'server-error', detail: 'The claude CLI was not found.' }) };
    expect(panelItems(s, {}).map(i => i.kind)).toEqual(['problem']);
  });
});
