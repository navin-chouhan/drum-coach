import { describe, expect, it, vi } from 'vitest';
import type { CoachReply } from '@drum-coach/core/coach/schemas';
import { appVerdict, coachLine, createCoachSession, replyFor, screenAction, takeLabel, thinkingAbout, type CoachState, type SessionDeps } from './session';
import { errorEvent, fakeServer, fakeTake, replyEvent, sayEvent, unreachable } from './coach.testutil';

// The web's own cases (src/coach/session.test.ts), on the iPad's take type.
const take = (startedAt: string) => fakeTake({ startedAt });
const reply = { say: 'about the song' } as CoachReply;

describe('which take a coach reply belongs to', () => {
  const song = take('2026-10-25T18:00:00Z'), kick = take('2026-10-25T18:01:00Z');
  const st = (s: Partial<CoachState>): CoachState => ({ status: 'idle', at: 0, thread: [], ...s });
  it("a reply about the last lesson never shows under the next lesson's take", () => {
    const s = st({ reply, at: Date.parse('2026-10-25T18:02:00Z'), take: song });
    expect(replyFor(s, song, 0)).toBe(reply);
    expect(replyFor(s, kick, 0)).toBeUndefined();
  });
  it('while the coach thinks about a new take, the old reply stays with its own take', () => {
    const s = st({ status: 'thinking', reply, at: Date.parse('2026-10-25T18:02:00Z'), take: song, thinking: kick });
    expect(replyFor(s, kick, 0)).toBeUndefined();
    expect(thinkingAbout(s, kick)).toBe(true);
    expect(thinkingAbout(s, song)).toBe(false);
  });
  it('a typed answer (no take) shows if it came after the take started', () => {
    const s = st({ reply, at: Date.parse('2026-10-25T18:02:00Z') });
    expect(replyFor(s, kick, 0)).toBe(reply);
    expect(replyFor(s, take('2026-10-25T18:03:00Z'), 0)).toBeUndefined();
  });
});

describe('the big coach line', () => {
  it("shows the coach's answer over a plain verdict", () => {
    expect(coachLine('Same tempo, once more.', { say: 'Lift the foot sooner.' }, false)).toEqual({ line: 'Lift the foot sooner.' });
    expect(coachLine('Same tempo, once more.', undefined, false)).toEqual({ line: 'Same tempo, once more.' });
    expect(coachLine('Same tempo.', { say: 'That kick was a hair late. Lift the foot sooner.', show: 'Lift the foot sooner.' }, false)).toEqual({ line: 'Lift the foot sooner.' });
  });
  it('keeps a big moment and puts the coach under it', () => {
    expect(coachLine('🏆 NEW RECORD: 95 BPM!', { say: 'What a take.' }, true)).toEqual({ line: '🏆 NEW RECORD: 95 BPM!', under: 'What a take.' });
  });
});

describe("the coach's button", () => {
  const exists = (id: string) => id === 'rock-basic' || id === 'lesson/money-beat';
  it('"next" gets the screen\'s own label; a drill with an unknown target is dropped', () => {
    expect(screenAction({ kind: 'next', label: 'Next posture step' }, 'Next ▶', exists)).toEqual({ kind: 'next', label: 'Next ▶' });
    expect(screenAction({ kind: 'drill', label: 'Try this', chartId: 'made-up' }, 'Next ▶', exists)).toBeUndefined();
    expect(screenAction({ kind: 'drill', label: 'Try this' }, 'Next ▶', exists)).toBeUndefined();
    expect(screenAction({ kind: 'drill', label: 'Money beat', chartId: 'lesson/money-beat' }, 'Next ▶', exists)?.label).toBe('Money beat');
    expect(screenAction({ kind: 'slower', label: 'Slower' }, 'Next ▶', exists)).toEqual({ kind: 'slower', label: 'Slower' });
    expect(screenAction(undefined, 'Next ▶', exists)).toBeUndefined();
  });
});

function setup(over: Partial<SessionDeps> = {}) {
  const f = fakeServer();
  const nav = { openLesson: vi.fn(), openDrill: vi.fn() };
  const sayNext = vi.fn();
  let playing = false;
  const settings = { liveCoach: true, voice: true };
  const saveChart = vi.fn(() => ({ id: 'kick-with-the-hat-abcde' }));
  const s = createCoachSession({
    server: f.server, context: async () => ({ runs: [] }), settings: () => settings, isPlaying: () => playing, sayNext,
    saveChart, exists: id => id === 'rock-basic', nav, now: () => Date.parse('2026-10-30T19:45:00Z'), later: fn => fn(), ...over,
  });
  return { s, f, nav, sayNext, saveChart, settings, setPlaying: (p: boolean) => { playing = p; } };
}

describe('the live session over server-sent events', () => {
  it('tells a take once, with its summary and the iPad context, and shows and speaks the answer', async () => {
    const { s, f, sayNext } = setup();
    f.answerStreams(() => ({ events: [sayEvent('Nice: 46 of 48.'), sayEvent('Let the foot fall with the hat.'), replyEvent({ say: 'Nice: 46 of 48. Let the foot fall with the hat.', action: { kind: 'faster', label: 'Play at 75', bpm: 75 } })] }));
    const t = fakeTake();
    await s.coachTake(t, { chartId: 'lesson/money-beat', lesson: { lesson: 'The money beat', verdict: 'Clean!' } });
    await s.coachTake(t);
    expect(f.streams).toHaveLength(1);
    const body = f.streams[0].body;
    expect(f.streams[0].path).toBe('/api/coach/session');
    expect(body).toMatchObject({ type: 'take', accuracyPct: 96, tempo: { bpm: 70 }, exercise: { id: 'lesson/money-beat' }, lessonResult: { verdict: 'Clean!' }, context: { runs: [] } });
    expect(sayNext.mock.calls.map(c => c[0])).toEqual(['Nice: 46 of 48.', 'Let the foot fall with the hat.']);
    const st = s.get();
    expect(st.status).toBe('idle');
    expect(st.reply?.action?.label).toBe('Play at 75');
    expect(st.take).toBe(t);
    expect(st.thread.map(i => i.who)).toEqual(['ctx', 'coach']);
    expect(st.thread[0].text).toBe('The money beat · take 1 · 70 BPM');
  });

  it('never speaks over a take, and skips wait mode and empty takes', async () => {
    const { s, f, sayNext, setPlaying } = setup();
    f.answerStreams(() => ({ events: [sayEvent('Hi.'), replyEvent({ say: 'Hi.' })] }));
    setPlaying(true);
    await s.say('how am I doing?');
    expect(sayNext).not.toHaveBeenCalled();
    await s.coachTake(fakeTake({ total: 0 }));
    await s.coachTake(fakeTake(), { wait: true });
    expect(f.streams).toHaveLength(1);
    expect(f.streams[0].body).toMatchObject({ type: 'said', text: 'how am I doing?', doing: 'playing right now' });
  });

  it('a question between takes means the exercise on screen', async () => {
    const { s, f } = setup();
    f.answerStreams(() => ({ events: [replyEvent({ say: 'Sure.' })] }));
    s.coachOpen({ id: 'rock-basic', title: 'Rock basic' }, 92.4);
    await s.say('  Make my next lesson about the kick ');
    expect(f.streams[0].body).toMatchObject({ type: 'said', text: 'Make my next lesson about the kick', doing: 'between takes', exercise: 'Rock basic', bpm: 92 });
    expect(s.get().thread.map(i => [i.who, i.text])).toEqual([['me', 'Make my next lesson about the kick'], ['coach', 'Sure.']]);
  });

  it('only the student\'s own "yes" starts something: `now` after a take becomes a button', async () => {
    const { s, f, nav } = setup();
    const drill = { kind: 'drill', label: 'Try it', chartId: 'rock-basic', now: true };
    f.answerStreams(() => ({ events: [replyEvent({ say: 'Try this.', action: drill })] }));
    await s.coachTake(fakeTake());
    expect(s.get().reply?.action?.now).toBe(false);
    expect(nav.openDrill).not.toHaveBeenCalled();
    await s.say('yes');
    expect(nav.openDrill).toHaveBeenCalledWith({ chartId: 'rock-basic', bpm: undefined });
  });

  it('a drill with a new chart is saved, then opened; a lesson drill opens the lesson', () => {
    const { s, nav, saveChart } = setup();
    const chart = { title: 'Kick with the hat', bpm: 65, timeSignature: [4, 4] as [number, 4], bars: 1, notes: [{ t: 0, drum: 'kick' as const }] };
    s.runAction({ kind: 'drill', label: 'Play this drill', chart, bpm: 65 });
    expect(saveChart).toHaveBeenCalledWith(chart);
    expect(nav.openDrill).toHaveBeenCalledWith({ chartId: 'kick-with-the-hat-abcde', bpm: 65 });
    s.runAction({ kind: 'drill', label: 'Money beat', chartId: 'lesson/money-beat' });
    expect(nav.openLesson).toHaveBeenCalledWith('money-beat');
  });

  it('pad commands go to the newest screen; "yes" takes the suggestion, else the main move', async () => {
    const { s, f } = setup();
    const a = vi.fn(() => true), b = vi.fn(() => true);
    s.padAction('yes'); // nothing registered: nothing happens
    const offA = s.onCoachAction(a);
    const offB = s.onCoachAction(b);
    s.padAction('yes');
    expect(b).toHaveBeenCalledWith({ kind: 'main', label: 'Yes' });
    expect(a).not.toHaveBeenCalled();
    f.answerStreams(() => ({ events: [replyEvent({ say: 'Slower.', action: { kind: 'slower', label: 'Slower' } })] }));
    await s.coachTake(fakeTake());
    s.padAction('yes');
    expect(b).toHaveBeenLastCalledWith({ kind: 'slower', label: 'Slower' });
    offB();
    expect(s.get().reply?.action).toBeDefined(); // a screen is left
    offA();
    expect(s.get().reply?.action).toBeUndefined(); // the last screen left: the button goes, the words stay
    expect(s.get().reply?.say).toBe('Slower.');
  });

  it('an error event shows the server\'s words; nothing is queued for a take', async () => {
    const { s, f } = setup();
    f.answerStreams(() => ({ events: [errorEvent('The claude CLI was not found.')] }));
    await s.coachTake(fakeTake());
    expect(s.get().problem).toMatchObject({ kind: 'coach', lines: ['The claude CLI was not found.'] });
    expect(s.get().queued).toBeUndefined();
  });

  it('off: no calls at all ("The coach follows my practice" off)', async () => {
    const { s, f, settings } = setup();
    settings.liveCoach = false;
    await s.coachTake(fakeTake());
    await s.say('hello');
    expect(f.streams).toHaveLength(0);
  });

  it('a newer event takes over from a slower one', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const f = fakeServer();
    let n = 0;
    const server = { ...f.server, stream: async (_p: string, _b: unknown, on: (e: never) => void) => {
      const me = ++n;
      if (me === 1) await gate;
      on(replyEvent({ say: me === 1 ? 'old' : 'new' }) as never);
      return { ok: true as const, events: 1 };
    } };
    const { s } = setup({ server });
    const first = s.say('one');
    await s.say('two');
    release();
    await first;
    expect(s.get().reply?.say).toBe('new');
  });
});

describe('offline (mockup coach-offline)', () => {
  it("says what failed, gives the app's own verdict, and keeps the take's answer from being queued", async () => {
    const { s, f } = setup();
    f.answerStreams(() => ({ events: [], result: unreachable }));
    await s.coachTake(fakeTake(), { lesson: { verdict: 'Clean! 46 of 48 landed, 21 in a row.' } });
    const st = s.get();
    expect(st.problem).toMatchObject({ kind: 'offline', host: 'drum-laptop.local:8787', canQueue: true });
    expect(st.problem?.lines[0]).toBe('drum-laptop.local:8787 didn’t answer in 10 seconds. Is the laptop awake and on the same Wi-Fi (or Tailscale)?');
    expect(st.thread.at(-1)).toMatchObject({ who: 'app', text: 'Clean! 46 of 48 landed, 21 in a row.' });
    expect(st.queued).toBeUndefined();
  });

  it("reads the Keychain's API key (async) when a call fails; a throwing read counts as none", async () => {
    const { s, f } = setup({ hasFallbackKey: async () => true });
    f.answerStreams(() => ({ events: [], result: unreachable }));
    await s.coachTake(fakeTake(), {});
    expect(s.get().problem?.lines[1]).toBe('The API-key fallback couldn’t reach Anthropic either. Is the iPad online?');
    const none = setup({ hasFallbackKey: async () => { throw new Error('locked'); } });
    none.f.answerStreams(() => ({ events: [], result: unreachable }));
    await none.s.coachTake(fakeTake(), {});
    expect(none.s.get().problem?.lines[1]).toBe("No API key is set, so there's no fallback.");
  });

  it('keeps one question and sends it when the coach is back', async () => {
    const { s, f } = setup();
    f.answerStreams(() => ({ events: [], result: unreachable }));
    await s.say('first question');
    await s.say('Make my next lesson about the kick');
    let st = s.get();
    expect(st.queued).toBe('Make my next lesson about the kick');
    expect(st.thread.filter(i => i.who === 'me').map(i => [i.text, 'queued' in i && i.queued])).toEqual([['Make my next lesson about the kick', true]]);

    f.setHealth(unreachable);
    expect(await s.checkBack()).toBe(false);
    expect(f.streams).toHaveLength(2);

    f.setHealth({ ok: true, version: '1', coach: true, tts: false, stt: false, youtube: false });
    f.answerStreams(() => ({ events: [replyEvent({ say: 'Done: a kick lesson is next.' })] }));
    expect(await s.checkBack()).toBe(true);
    st = s.get();
    expect(f.streams.at(-1)?.body).toMatchObject({ type: 'said', text: 'Make my next lesson about the kick' });
    expect(st.queued).toBeUndefined();
    expect(st.problem).toBeUndefined();
    expect(st.thread.map(i => [i.who, 'queued' in i ? i.queued : undefined])).toEqual([['me', false], ['coach', undefined]]);
  });

  it('Try again re-sends the call that failed', async () => {
    const { s, f } = setup();
    f.answerStreams(() => ({ events: [errorEvent('busy')] }));
    await s.coachTake(fakeTake());
    f.answerStreams(() => ({ events: [replyEvent({ say: 'There.' })] }));
    await s.retry();
    expect(f.streams.map(x => x.body.type)).toEqual(['take', 'take']);
    expect(s.get().reply?.say).toBe('There.');
  });
});

describe('small lines', () => {
  it('the context chip and the app verdict', () => {
    expect(takeLabel('The money beat', 2, 70.2)).toBe('The money beat · take 2 · 70 BPM');
    expect(appVerdict({ notes: 48, perfect: 40, good: 6, meanOffsetMs: -18 })).toBe('46 of 48 landed. On average 18 ms early.');
    expect(appVerdict({ notes: 48, perfect: 40, good: 6, meanOffsetMs: 4 })).toBe('46 of 48 landed. Right on the beat on average.');
  });
});
