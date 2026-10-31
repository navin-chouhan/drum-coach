import { describe, expect, it, vi } from 'vitest';
import { createCoachAsks } from '../coach/asks';
import { fakeServer } from '../coach/coach.testutil';
import { saveCoachLesson } from './coachLesson';

describe('a coach-written lesson (POST /api/coach/lesson with the iPad context)', () => {
  it('passes the server\'s replaces list to the saver, and drops only the still-unstarted ones', async () => {
    const f = fakeServer();
    f.answerCalls(async () => ({ ok: true, data: { data: { id: 'ai-new', title: 'New' }, cached: false, replaces: ['ai-old', 'ai-started', 7] } }));
    const asks = createCoachAsks({ server: f.server, context: async () => ({}) });
    const repo = { replace: vi.fn() };
    await asks.ask('lesson-k', 'lesson', { struggle: undefined }, (l: unknown, meta) => { saveCoachLesson(repo, l, meta, id => id === 'ai-started'); });
    expect(repo.replace).toHaveBeenCalledWith({ id: 'ai-new', title: 'New' }, ['ai-old']);
  });
  it('without replaces (an older server) it only saves; a non-lesson answer saves nothing', () => {
    const repo = { replace: vi.fn() };
    expect(saveCoachLesson(repo, { id: 'a' }, {}, () => false)).toBe(true);
    expect(repo.replace).toHaveBeenLastCalledWith({ id: 'a' }, []);
    expect(saveCoachLesson(repo, { title: 'no id' }, { replaces: ['x'] }, () => false)).toBe(false);
    expect(saveCoachLesson(null, { id: 'a' }, {}, () => false)).toBe(false);
    expect(repo.replace).toHaveBeenCalledTimes(1);
  });
  it('never drops the lesson it saves', () => {
    const repo = { replace: vi.fn() };
    saveCoachLesson(repo, { id: 'same' }, { replaces: ['same', 'other'] }, () => false);
    expect(repo.replace).toHaveBeenCalledWith({ id: 'same' }, ['other']);
  });
});
