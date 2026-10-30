import { describe, expect, it } from 'vitest';
import { DEFAULTS, type Settings } from '@drum-coach/core/input/settings';
import { itemDonePatch, lessonHref, nextItem, parseLessonParams, setItemOf } from './route';

const session = { date: '2026-10-30', items: [
  { role: 'stretch' as const, lessonId: 'stretch', minutes: 2 }, { role: 'skill' as const, lessonId: 'money-8ths', minutes: 12 }, { role: 'review' as const, lessonId: 'count-quarters', minutes: 5 },
], done: [0] };
const s: Settings = { ...DEFAULTS, session };

describe('lesson route', () => {
  it("parses Journey's params", () => {
    expect(parseLessonParams({ id: 'money-8ths', item: '1', mode: 'hear' })).toEqual({ id: 'money-8ths', item: 1, mode: 'hear' });
    expect(parseLessonParams({ id: ['x'], item: 'nope', mode: 'weird' })).toEqual({ id: 'x', item: -1, mode: 'play' });
    expect(parseLessonParams({ id: 'x', item: '-1' }).item).toBe(-1);
    expect(lessonHref('money-8ths', 2)).toBe('/lesson/money-8ths?item=2');
    expect(lessonHref('a b')).toBe('/lesson/a%20b');
  });

  it("today's set: role and minutes, next item, tick done", () => {
    expect(setItemOf(s, 1, 'money-8ths', '2026-10-30')).toEqual({ role: 'skill', minutes: 12 });
    expect(setItemOf(s, 1, 'other', '2026-10-30')).toBeUndefined();
    expect(setItemOf(s, 1, 'money-8ths', '2026-10-31')).toBeUndefined();
    expect(nextItem(session, 1, '2026-10-30', () => true)).toEqual({ index: 2, lessonId: 'count-quarters' });
    expect(nextItem({ ...session, done: [0, 2] }, 1, '2026-10-30', () => true)).toBeUndefined();
    expect(nextItem(session, -1, '2026-10-30', () => true)).toBeUndefined();
    expect(itemDonePatch(s, 1, '2026-10-30')).toEqual({ session: { ...session, done: [0, 1] } });
    expect(itemDonePatch(s, 0, '2026-10-30')).toEqual({});
  });
});
