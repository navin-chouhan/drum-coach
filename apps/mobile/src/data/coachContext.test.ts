import { describe, expect, it } from 'vitest';
import {
  buildCoachContext, CONTEXT_MAX_BYTES, ContextRunSchema, KeptMonthReportSchema, MIN_RUNS, PlanNotesSchema, ROUTE_FIELDS, SettingsSchema,
  SUMMARY_KEYS, TeacherNoteSchema, utf8Length, type CoachRoute, type ContextSource,
} from './coachContext';
import { runInput, serverContext } from './fixtures.testutil';
import type { StoredRun } from './runs';

const stored = (i: number, over: Partial<StoredRun> = {}): StoredRun => {
  const { take: _t, ...r } = runInput(i);
  return { id: i + 1, ...r, ...over };
};
const chart = (title: string, notes = 4) => ({
  title, bpm: 90, timeSignature: [4, 4], bars: 1, kind: 'groove',
  notes: Array.from({ length: notes }, (_, k) => ({ t: (k * 4) / notes, drum: k % 2 ? 'snare' : 'kick' })),
});
const lesson = (i: number, notes = 8) => ({
  id: `ai-${i}`, level: 2, kind: 'groove', title: `Coach groove ${i}`, what: 'w', why: 'y', how: 'h', source: 'ai',
  steps: [{ title: 'Play it', text: 'Steady', chart: chart(`Coach groove ${i}`, notes), bpm: { start: 70, target: 90 }, pass: { accuracy: 85 } }],
});
const source = (over: Partial<ContextSource> = {}): ContextSource => ({
  runs: Array.from({ length: 30 }, (_, i) => stored(i)),
  appSettings: {
    latencyMs: 12, voice: true, // not sent
    profile: { goals: ['rock', 'funk'], minutesPerDay: 25, onboarded: true },
    lessons: { 'l1-quarters': { step: 2, bpm: 80, clean: 1, fails: 0, bestBpm: 85, reviewStage: 0, completedAt: '2026-10-02', stars: 3 } },
    soreUntil: '2026-10-31',
  },
  plan: { title: 'Week 44', focus: 'Even eighths', why: 'They rush', drums: ['hihat'], notes: 'Watch bar 2', week: '2026-W44', days: [{ day: 'Mon', items: [] }] },
  teacherNotes: [1, 2, 3, 4].map(d => ({ date: `2026-10-0${d}`, text: `Note ${d}` })),
  aiLessons: [lesson(1), lesson(2)],
  songs: [{ id: 'yt-abc', title: 'Song', timeSignature: [4, 4], notes: [{ t: 0, drum: 'kick' }] }],
  charts: [{ id: 'ex-1', title: 'Exercise', kind: 'groove', level: 1, bpm: 90, description: 'd' }],
  monthReport: { month: '2026-09', report: { headline: 'Steadier', better: ['time'], next: ['fills'], note: 'Good month' } },
  ...over,
});
const ROUTES = Object.keys(ROUTE_FIELDS) as CoachRoute[];

describe('parity with server/coachContext.ts', () => {
  const json = (s: { toJSONSchema(p?: object): unknown }) => s.toJSONSchema({ io: 'input', unrepresentable: 'any' });

  it('uses the same byte cap', async () => {
    expect(CONTEXT_MAX_BYTES).toBe((await serverContext()).CONTEXT_MAX_BYTES);
  });

  it('copies the server sub-schemas exactly', async () => {
    const { shape } = (await serverContext()).CoachContextSchema;
    expect(json(ContextRunSchema)).toEqual(json(shape.runs.unwrap().element));
    expect(json(SettingsSchema)).toEqual(json(shape.settings.unwrap()));
    expect(json(PlanNotesSchema)).toEqual(json(shape.plan.unwrap()));
    expect(json(TeacherNoteSchema)).toEqual(json(shape.teacherNotes.unwrap().element));
    expect(json(KeptMonthReportSchema)).toEqual(json(shape.monthReport.unwrap()));
  });
});

describe('buildCoachContext', () => {
  it('passes the server schema for every route', async () => {
    const { splitContext } = await serverContext();
    for (const route of ROUTES) {
      const { context, bytes } = buildCoachContext(source(), route);
      const r = splitContext({ context, other: 1 });
      expect(r.error, route).toBeUndefined();
      expect(r.rest).toEqual({ other: 1 });
      expect(bytes).toBe(Buffer.byteLength(JSON.stringify(context), 'utf8'));
    }
  });

  it('sends only what each route reads', () => {
    expect(Object.keys(buildCoachContext(source(), 'feedback').context)).toEqual(['charts']);
    expect(Object.keys(buildCoachContext(source(), 'session').context).sort()).toEqual(['plan', 'runs', 'settings', 'teacherNotes']);
    expect(Object.keys(buildCoachContext(source(), 'month').context).sort()).toEqual(['aiLessons', 'monthReport', 'runs', 'settings', 'teacherNotes']);
    expect(buildCoachContext(source(), 'plan').context.songs).toEqual([{ id: 'yt-abc', title: 'Song', timeSignature: [4, 4] }]); // no notes
    expect(buildCoachContext(source(), 'lesson').context.songs?.[0]).toHaveProperty('notes');
  });

  it('keeps only the settings, plan fields and summary keys the coach reads', () => {
    const { context } = buildCoachContext(source(), 'plan');
    expect(context.settings).toEqual({
      profile: { goals: ['rock', 'funk'], minutesPerDay: 25, onboarded: true },
      lessons: { 'l1-quarters': { step: 2, bpm: 80, clean: 1, fails: 0, bestBpm: 85, reviewStage: 0, completedAt: '2026-10-02', stars: 3 } },
      soreUntil: '2026-10-31',
    });
    expect(context.plan).toEqual({ focus: 'Even eighths', why: 'They rush', drums: ['hihat'], notes: 'Watch bar 2', week: '2026-W44' });
    expect(Object.keys(context.runs![0].summary!).sort()).toEqual([...SUMMARY_KEYS].sort());
    expect(context.runs![0]).not.toHaveProperty('id');
  });

  it('sends runs newest first and the latest 3 teacher notes oldest first', () => {
    const { context } = buildCoachContext(source({ runs: [stored(1), stored(5), stored(3)] }), 'session');
    expect(context.runs!.map(r => r.durationS)).toEqual([65, 63, 61]);
    expect(context.teacherNotes!.map(n => n.text)).toEqual(['Note 2', 'Note 3', 'Note 4']);
  });

  it('gives the server the same runs back (contextData.runRows equals the local list)', async () => {
    const { contextData } = await serverContext();
    const runs = Array.from({ length: 5 }, (_, i) => stored(i));
    const rows = contextData(buildCoachContext(source({ runs }), 'plan').context).runRows();
    expect(rows.map(r => r.startedAt)).toEqual(runs.map(r => r.startedAt)); // oldest first, like runRows
    expect(rows[0]).toMatchObject({ chartId: 'chart-0', notes: 32, fromBar: 1, toBar: 4, tips: ['rush'], tool: 'drill' });
  });

  it('drops invalid entries instead of failing the request', async () => {
    const { splitContext } = await serverContext();
    const bad = source({
      appSettings: { profile: { goals: ['polka'], minutesPerDay: 2 }, lessons: { ok: { step: 1, bpm: 60 }, broken: { step: 99, bpm: 60 } }, soreUntil: 7 },
      plan: { focus: 'x'.repeat(500) },
      monthReport: { month: 'September', report: {} },
      teacherNotes: [{ date: '2026-10-01', text: 'fine' }, { date: 3, text: 'bad' }],
      runs: [stored(1), stored(2, { accuracy: 140 })],
      aiLessons: [lesson(1), { title: 'no id' }],
    });
    for (const route of ROUTES) {
      const built = buildCoachContext(bad, route);
      expect(splitContext({ context: built.context }).error, route).toBeUndefined();
    }
    const plan = buildCoachContext(bad, 'plan');
    expect(plan.context.settings).toEqual({ lessons: { ok: { step: 1, bpm: 60, clean: 0, fails: 0, bestBpm: 0, reviewStage: 0 } } });
    expect(plan.dropped).toEqual(expect.arrayContaining(['settings.profile', 'settings.lessons.broken', 'settings.soreUntil', 'plan', 'runs: 1 invalid']));
    expect(plan.context.runs).toHaveLength(1);
    expect(plan.context.aiLessons!.map(l => l.id)).toEqual(['ai-1']);
    expect(buildCoachContext(bad, 'month').dropped).toContain('monthReport');
  });

  it('caps the context at 50 KB, keeping the most recent runs, and the server accepts it', async () => {
    const { splitContext } = await serverContext();
    const runs = Array.from({ length: 2000 }, (_, i) => stored(i, { chartTitle: `Groove ✓ ${i} ${'é'.repeat(40)}` })); // multi-byte text
    const built = buildCoachContext(source({ runs }), 'plan');
    expect(built.bytes).toBeLessThanOrEqual(CONTEXT_MAX_BYTES);
    expect(Buffer.byteLength(JSON.stringify(built.context), 'utf8')).toBe(built.bytes);
    expect(splitContext({ context: built.context }).error).toBeUndefined();
    const sent = built.context.runs!;
    expect(sent.length).toBeGreaterThan(MIN_RUNS);
    expect(sent.length).toBeLessThan(1000);
    expect(sent[0].startedAt).toBe(runs[1999].startedAt); // the newest
    expect(sent.map(r => r.startedAt)).toEqual(runs.slice(-sent.length).reverse().map(r => r.startedAt)); // a newest-first prefix
    expect(built.kept.runs).toEqual({ sent: sent.length, of: 1000 }); // the schema's 1000 first, then bytes
    // as full as it can be: one more run would not fit
    const more = { ...built.context, runs: [...sent, { ...sent.at(-1)! }] };
    expect(Buffer.byteLength(JSON.stringify(more), 'utf8')).toBeGreaterThan(CONTEXT_MAX_BYTES);
    // the rest went in whole
    expect(built.context.aiLessons).toHaveLength(2);
    expect(built.context.teacherNotes).toHaveLength(3);
  });

  it('drops the oldest coach lessons to keep at least MIN_RUNS runs', async () => {
    const { splitContext } = await serverContext();
    const aiLessons = Array.from({ length: 60 }, (_, i) => lesson(i, 64)); // about 4 KB each
    const built = buildCoachContext(source({ aiLessons, runs: Array.from({ length: 200 }, (_, i) => stored(i)) }), 'lesson');
    expect(built.bytes).toBeLessThanOrEqual(CONTEXT_MAX_BYTES);
    expect(splitContext({ context: built.context }).error).toBeUndefined();
    expect(built.context.runs!.length).toBe(MIN_RUNS);
    const ids = built.context.aiLessons!.map(l => l.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(60);
    expect(ids.at(-1)).toBe('ai-59'); // the newest kept, oldest first like the server's list
    expect(ids).toEqual(aiLessons.slice(-ids.length).map(l => l.id));
  });

  it('as a last resort drops fields so the context still fits', () => {
    const built = buildCoachContext(source(), 'session', 600);
    expect(built.bytes).toBeLessThanOrEqual(600);
    expect(buildCoachContext(source(), 'plan', 2).context).toEqual({});
  });

  it('works with nothing stored', async () => {
    const { splitContext } = await serverContext();
    for (const route of ROUTES) {
      const { context } = buildCoachContext({ runs: [] }, route);
      expect(context).toEqual({});
      expect(splitContext({ context }).error).toBeUndefined();
    }
  });
});

describe('utf8Length', () => {
  it('matches Buffer.byteLength', () => {
    for (const s of ['', 'abc', 'é', '✓', '🥁 drums', 'mixed é✓🥁', JSON.stringify('\ud800 lone'), '\ud800']) {
      expect(utf8Length(s), s).toBe(Buffer.byteLength(s, 'utf8'));
    }
  });
});
