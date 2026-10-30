import { describe, expect, it } from 'vitest';
import { LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import type { HomeServerEvent, StreamResult } from '../../platform/contracts';
import { coachLine, createCoachSession, replyFor } from './coach';
import { playAll, rig } from './fakes.testutil';
import { barCounter, countInAt, liveTip } from './live';

function finishedTake() {
  const r = rig();
  r.take.start(LESSON_BY_ID['money-8ths'].steps[2].chart, { fromBar: 1, toBar: 1, repeats: 4, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false });
  playAll(r);
  return r.take.state.finished!;
}

function server(events: HomeServerEvent[], result: StreamResult = { ok: true, events: events.length }, configured = true) {
  const bodies: unknown[] = [];
  return {
    bodies,
    configured: () => (configured ? { url: 'http://mac.local:8787' } : null),
    stream: async (_p: string, body: unknown, on: (e: HomeServerEvent) => void) => { bodies.push(body); events.forEach(on); return result; },
  };
}

describe('the coach after a take', () => {
  it('sends the take with the context and shows the reply about it', async () => {
    const f = finishedTake();
    const said: string[] = [];
    const s = server([{ event: 'say', data: '"Nice."', json: 'Nice.' }, { event: 'reply', data: '', json: { say: 'Nice and steady. Up you go.', show: 'Steady! Up you go.', action: { kind: 'faster', label: 'Faster', now: true } } }]);
    const c = createCoachSession({ server: s, context: async () => ({ runs: [] }), enabled: () => true, now: () => 5, onSay: t => said.push(t) });
    await c.take(f, { lesson: 'The money beat' });
    expect(s.bodies[0]).toMatchObject({ type: 'take', lessonResult: { lesson: 'The money beat' }, context: { runs: [] }, accuracyPct: 100 });
    const reply = replyFor(c.get(), f, 0)!;
    expect(reply.action).toMatchObject({ kind: 'faster', now: false }); // only the student's own "yes" starts something
    expect(coachLine('Up to 75 BPM!', reply, false)).toEqual({ line: 'Steady! Up you go.' });
    expect(coachLine('Lesson complete!', reply, true)).toEqual({ line: 'Lesson complete!', under: 'Steady! Up you go.' });
    expect(said).toEqual(['Nice.']);
    await c.take(f); // once per take
    expect(s.bodies).toHaveLength(1);
  });

  it('server unreachable: the verdict stays, the failure is kept', async () => {
    const c = createCoachSession({ server: server([], { ok: false, reason: 'unreachable' }), context: async () => ({}), enabled: () => true });
    await c.take(finishedTake());
    expect(c.get()).toMatchObject({ status: 'idle', failure: 'unreachable' });
    expect(coachLine('Clean take.', undefined, false)).toEqual({ line: 'Clean take.' });
  });

  it('not configured or switched off: nothing is sent', async () => {
    const s = server([], undefined, false);
    await createCoachSession({ server: s, context: async () => ({}), enabled: () => true }).take(finishedTake());
    expect(s.bodies).toHaveLength(0);
  });
});

describe('live lines', () => {
  it('count-in number, bar counter, tip for 3 s', () => {
    expect(countInAt(-4, 4)).toBe(1);
    expect(countInAt(-1, 4)).toBe(4);
    expect(countInAt(0, 4)).toBeUndefined();
    const run = { notes: [], beats: 16, beatsPerBar: 4 };
    expect(barCounter({ run }, -1).text).toBe('Get ready…');
    expect(barCounter({ run }, 5).text).toBe('Bar 2 of 4');
    const cue = { cue: { id: 'hh-open', text: 'Hi-hat foot down (it sounds open)', spoken: '', priority: 90 }, at: 1000 };
    expect(liveTip({ cue }, 2000)).toBe('💡 Hi-hat foot down (it sounds open)');
    expect(liveTip({ cue }, 4001)).toBe('');
  });
});
