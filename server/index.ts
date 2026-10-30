import Fastify, { type FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { SessionEventSchema, AiLessonSchema, FeedbackSchema, GrooveSchema, LessonRequestSchema, MonthReportRequestSchema, MonthReportSchema, PlanRequestSchema, PlanSchema, RunRecordSchema, ShowoffRequestSchema, ShowoffSchema, TipsRequestSchema, TipsSchema } from '../src/coach/schemas.ts';
import { LIBRARY } from '../src/content/library.ts';
import { ChartSchema } from '../src/engine/chart.ts';
import type { RunRow } from '../src/engine/progress.ts';
import { studentProfile } from '../src/engine/profile.ts';
import { soreActive } from '../src/engine/health.ts';
import { skillMap } from '../src/engine/skills.ts';
import { dayKey, type LessonProgress } from '../src/engine/lesson.ts';
import { monthly } from '../src/engine/history.ts';
import type { Plan } from '../src/coach/schemas.ts';
import { ask, getProvider, lessonModel } from './ai/coach.ts';
import { applyBites, canStandIn, lessonInput, standsInFor, toLesson, uniqueTitle } from './ai/lessons.ts';
import { CURRICULUM, LESSON_BY_ID, MILESTONES } from '../src/content/curriculum.ts';
import { checkpointsOf, currentMilestone, studentRead, visibleLessons } from '../src/engine/planner.ts';
import type { Lesson } from '../src/engine/lesson.ts';
import { AiError } from './ai/providers.ts';
import { coachTurn } from './ai/session.ts';
import { AUDIO_DIR, db } from './db.ts';
import { accessConfig, accessSummary, childEnv, guardHook, health, looksLikeAudio } from './guard.ts';
import { contextData, splitContext, weekFocus, type CoachData, type Settings } from './coachContext.ts';
import { sameSong, searchYouTube, YtError } from './youtube.ts';
import { speech, ttsStatus } from './tts.ts';
import { sttStatus, transcribe } from './stt.ts';
import { GridSchema, GrooveRequestSchema, YtSongCreateSchema, YtSongPatchSchema, type YtSong } from '../src/youtube/schemas.ts';

const PORT = Number(process.env.PORT || 8787);
const app = Fastify({ logger: { level: 'info' }, bodyLimit: 1_000_000 });

// Only the local app may call this API (guard.ts): not other websites, not pages on other local ports, no DNS rebinding.
// With HOST/APP_TOKEN/ALLOWED_HOSTS set (home-server mode, docs/mobile/HOME-SERVER.md) the iPad may too, with the token.
// A setting that would expose the API without a strong token stops the server here, before it listens.
const access = (() => {
  try { return accessConfig(process.env); } catch (e) { console.error(`\n${(e as Error).message}\n`); process.exit(1); }
})();
app.addHook('onRequest', guardHook(access)); // first: a refused request never reaches the rate limits below
// These are totals for every caller (this machine's app and the iPad): plenty for the app, a stop for a runaway loop.
// What spends your Claude usage, the YouTube quota or a speech model's CPU gets its own, smaller budget.
const COSTLY = /^\/api\/(coach\/(?!status)|stt$|youtube\/)/;
await app.register(rateLimit, {
  timeWindow: '1 minute',
  keyGenerator: req => (COSTLY.test(req.url) ? 'costly' : 'all'),
  max: (_req, key) => (key === 'costly' ? 60 : 1200),
});

const bad = (reply: FastifyReply, error: z.ZodError | string) =>
  reply.code(400).send({ error: typeof error === 'string' ? error : `${error.issues[0]?.path.join('.')}: ${error.issues[0]?.message}` });
const aiFail = (reply: FastifyReply, e: unknown) => {
  if (e instanceof AiError) return reply.code(503).send({ error: e.message, code: e.code });
  throw e;
};

// ---------- charts (imported songs, AI exercises) ----------
type ChartRow = { id: string; json: string; source: string; audio_file: string | null; sync_offset_ms: number };
const chartOut = (r: ChartRow) => ({ ...JSON.parse(r.json), id: r.id, source: r.source, hasAudio: !!r.audio_file, syncOffsetMs: r.sync_offset_ms });
const IdParam = z.object({ id: z.string().regex(/^[\w-]{1,80}$/) });

const savedAiCharts = () => (db.prepare("SELECT id, json FROM charts WHERE source = 'ai'").all() as ChartRow[]).map(r => ({ ...JSON.parse(r.json), id: r.id }));
function catalog(saved: { id: string; title: string; kind?: string; level?: number; bpm: number; timeSignature?: unknown; description?: string }[] = savedAiCharts()) {
  return [...LIBRARY, ...saved].map(c => ({ id: c.id, title: c.title, kind: c.kind, level: c.level, bpm: c.bpm, timeSignature: c.timeSignature, description: c.description }));
}

// The iPad's "Test connection" (home-server mode): what works here. `provider` is the coach's kind, as before.
app.get('/api/health', async () => ({
  ...health({ coach: coachCheck().ready, tts: ttsStatus().engine !== null, stt: sttStatus().available, youtube: !!process.env.YOUTUBE_API_KEY }),
  provider: getProvider().name,
}));

app.get('/api/charts', async () => (db.prepare('SELECT * FROM charts ORDER BY created_at').all() as ChartRow[]).map(chartOut));

app.post('/api/charts', async (req, reply) => {
  const body = z.object({ chart: ChartSchema, source: z.enum(['import', 'ai']) }).safeParse(req.body);
  if (!body.success) return bad(reply, body.error);
  const { chart, source } = body.data;
  const slug = chart.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'chart';
  const id = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
  const kind = chart.kind ?? (source === 'import' ? 'song' : 'exercise');
  db.prepare('INSERT INTO charts (id, json, source) VALUES (?, ?, ?)').run(id, JSON.stringify({ ...chart, id: undefined, kind }), source);
  return chartOut(db.prepare('SELECT * FROM charts WHERE id = ?').get(id) as ChartRow);
});

app.patch('/api/charts/:id', async (req, reply) => {
  const p = IdParam.safeParse(req.params), b = z.object({ syncOffsetMs: z.number().min(-60_000).max(60_000) }).safeParse(req.body);
  if (!p.success || !b.success) return bad(reply, 'Invalid request');
  const r = db.prepare('UPDATE charts SET sync_offset_ms = ? WHERE id = ?').run(b.data.syncOffsetMs, p.data.id);
  return r.changes ? { ok: true } : reply.code(404).send({ error: 'Not found' });
});

app.delete('/api/charts/:id', async (req, reply) => {
  const p = IdParam.safeParse(req.params);
  if (!p.success) return bad(reply, p.error);
  const row = db.prepare('SELECT audio_file FROM charts WHERE id = ?').get(p.data.id) as ChartRow | undefined;
  if (!row) return reply.code(404).send({ error: 'Not found' });
  if (row.audio_file) rmSync(join(AUDIO_DIR, row.audio_file), { force: true });
  db.prepare('DELETE FROM charts WHERE id = ?').run(p.data.id);
  return { ok: true };
});

const AUDIO_TYPES: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm' };
const MIME = Object.fromEntries(Object.entries(AUDIO_TYPES).map(([m, e]) => [e, m]));
app.addContentTypeParser(/^audio\//, { parseAs: 'buffer', bodyLimit: 80_000_000 }, (_req, body, done) => done(null, body));

app.put('/api/charts/:id/audio', async (req, reply) => {
  const p = IdParam.safeParse(req.params);
  const ext = AUDIO_TYPES[(req.headers['content-type'] ?? '').split(';')[0]];
  if (!p.success || !ext || !Buffer.isBuffer(req.body) || !looksLikeAudio(req.body, ext)) return bad(reply, 'Send an MP3, OGG, WAV, FLAC or M4A file');
  if (!db.prepare('SELECT 1 FROM charts WHERE id = ?').get(p.data.id)) return reply.code(404).send({ error: 'Not found' });
  const file = `${p.data.id}.${ext}`; // id is validated, so the path stays inside AUDIO_DIR
  // codeql[js/http-to-file-access] Saving your backing track is the feature: checked to be audio, under a name we chose.
  writeFileSync(join(AUDIO_DIR, file), req.body);
  db.prepare('UPDATE charts SET audio_file = ? WHERE id = ?').run(file, p.data.id);
  return { ok: true };
});

app.get('/api/charts/:id/audio', async (req, reply) => {
  const p = IdParam.safeParse(req.params);
  if (!p.success) return bad(reply, p.error);
  const row = db.prepare('SELECT audio_file FROM charts WHERE id = ?').get(p.data.id) as ChartRow | undefined;
  if (!row?.audio_file || !existsSync(join(AUDIO_DIR, row.audio_file))) return reply.code(404).send({ error: 'No audio' });
  return reply.type(MIME[row.audio_file.split('.').pop()!] ?? 'application/octet-stream').send(createReadStream(join(AUDIO_DIR, row.audio_file)));
});

// ---------- runs & settings ----------
const runRows = (limit = 5000): RunRow[] => (db.prepare(`
  SELECT * FROM (SELECT id, EXISTS(SELECT 1 FROM run_hits h WHERE h.run_id = runs.id) AS hasTake, chart_id AS chartId, chart_title AS chartTitle, level, started_at AS startedAt, duration_s AS durationS,
    bpm, speed, accuracy, mean_offset AS meanOffset, spread, json_extract(summary_json, '$.notes') AS notes,
    json_extract(summary_json, '$.section.fromBar') AS fromBar, json_extract(summary_json, '$.section.toBar') AS toBar, json_extract(summary_json, '$.tipIds') AS tips,
    json_extract(summary_json, '$.perDrum') AS perDrum, json_extract(summary_json, '$.lesson.tool') AS tool, json_extract(summary_json, '$.lesson.bite') AS bite FROM runs ORDER BY started_at DESC LIMIT ?) ORDER BY startedAt`).all(limit) as RunRow[])
  .map(r => ({ ...r, hasTake: !!r.hasTake, level: r.level ?? undefined, notes: r.notes ?? undefined, fromBar: r.fromBar ?? undefined, toBar: r.toBar ?? undefined, tips: r.tips ? JSON.parse(r.tips as unknown as string) : undefined,
    perDrum: r.perDrum ? JSON.parse(r.perDrum as unknown as string) : undefined, tool: r.tool ?? undefined, bite: r.bite ? JSON.parse(r.bite as unknown as string) : undefined }));
const appSettings = () => { const row = db.prepare("SELECT value FROM settings WHERE key = 'app'").get() as { value: string } | undefined; return row ? JSON.parse(row.value) : {}; };
const latestPlan = () => {
  const row = db.prepare('SELECT * FROM plans ORDER BY id DESC LIMIT 1').get() as { id: number; json: string; checks_json: string } | undefined;
  return row ? { id: row.id, plan: JSON.parse(row.json) as Plan, checks: JSON.parse(row.checks_json) } : null;
};
/** The latest notes from the student's human teacher (N2), for the coach. */
const teacherNotes = (): { date: string; text: string }[] => { const v = (db.prepare("SELECT value FROM settings WHERE key = 'teacherNotes'").get() as { value: string } | undefined)?.value; try { return v ? JSON.parse(v).slice(-3) : []; } catch { return []; } };
/** What the coach routes read about the student: this server's SQLite (the web app), or the iPad's `context` (B22). */
const dbData: CoachData = {
  fromDevice: false,
  runRows,
  settings: () => appSettings() as Settings,
  plan: () => latestPlan()?.plan,
  teacherNotes,
  aiLessons: () => aiLessons(),
  songs: () => (db.prepare('SELECT * FROM yt_songs').all() as YtRow[]).map(ytSong),
  song: id => { const row = ytById(id); return row && ytSong(row); },
  savedCharts: savedAiCharts,
  recentForLesson: () => (db.prepare('SELECT chart_title, started_at, bpm, accuracy, summary_json FROM runs ORDER BY started_at DESC LIMIT 15').all() as
    { chart_title: string; started_at: string; bpm: number; accuracy: number; summary_json: string }[]).reverse()
    .map(r => { const { weakSpots, perDrum, velocity, meanOffsetMs, spreadMs, lesson } = JSON.parse(r.summary_json); return { chart: r.chart_title, at: r.started_at.slice(0, 16), bpm: Math.round(r.bpm), accuracy: r.accuracy, summary: { meanOffsetMs, spreadMs, perDrum, velocity, weakSpots, lesson } }; }),
  pastTakes: chartId => (db.prepare('SELECT started_at, bpm, accuracy, mean_offset, spread FROM runs WHERE chart_id = ? ORDER BY started_at DESC LIMIT 5').all(chartId) as
    { started_at: string; bpm: number; accuracy: number; mean_offset: number; spread: number }[]).reverse()
    .map(r => ({ at: r.started_at.slice(0, 16), bpm: Math.round(r.bpm), accuracyPct: r.accuracy, meanOffsetMs: r.mean_offset, spreadMs: r.spread })),
  monthReport: () => { const kept = (db.prepare("SELECT value FROM settings WHERE key = 'monthReport'").get() as { value: string } | undefined)?.value; return kept ? JSON.parse(kept) as { month: string; report: unknown } : undefined; },
};
/** A coach route's body: `context` taken out and checked (400 if bad), the rest for the route's own schema. */
function coachInput(body: unknown): { error: string } | { rest: unknown; d: CoachData } {
  const { rest, context, error } = splitContext(body);
  return error ? { error } : { rest, d: context ? contextData(context) : dbData };
}
app.get('/api/profile', async () => studentProfile(runRows()));

app.post('/api/runs', async (req, reply) => {
  const b = RunRecordSchema.safeParse(req.body);
  if (!b.success) return bad(reply, b.error);
  const r = b.data;
  const { lastInsertRowid } = db.prepare(`INSERT INTO runs (chart_id, chart_title, level, started_at, duration_s, bpm, speed, accuracy, mean_offset, spread, summary_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(r.chartId, r.chartTitle, r.level ?? null, r.startedAt, r.durationS, r.bpm, r.speed, r.accuracy, r.meanOffset, r.spread, JSON.stringify(r.summary));
  if (r.take) {
    db.prepare('INSERT OR REPLACE INTO run_hits (run_id, json) VALUES (?, ?)').run(lastInsertRowid, JSON.stringify(r.take));
    // size cap: the latest 300 takes, plus the first take of each exercise each month (for "you a month ago")
    db.exec(`DELETE FROM run_hits WHERE run_id NOT IN (SELECT id FROM runs ORDER BY id DESC LIMIT 300)
      AND run_id NOT IN (SELECT MIN(r.id) FROM runs r JOIN run_hits h ON h.run_id = r.id GROUP BY r.chart_id, substr(r.started_at, 1, 7))`);
  }
  return { id: Number(lastInsertRowid) };
});
app.get('/api/runs', async () => runRows());
app.get('/api/runs/:id/take', async (req, reply) => {
  const p = z.object({ id: z.coerce.number().int() }).safeParse(req.params);
  if (!p.success) return bad(reply, p.error);
  const row = db.prepare('SELECT json FROM run_hits WHERE run_id = ?').get(p.data.id) as { json: string } | undefined;
  return row ? JSON.parse(row.json) : reply.code(404).send({ error: 'Not found' });
});

// N8: the coach's monthly report, written once a month (or on "ask again") and kept in settings.
// With the iPad's context, its last report comes in `context.monthReport` and the new one goes back only in the answer.
app.post('/api/coach/month', async (req, reply) => {
  const ci = coachInput(req.body);
  if ('error' in ci) return bad(reply, ci.error);
  const { d } = ci;
  const b = MonthReportRequestSchema.safeParse(ci.rest ?? {});
  if (!b.success) return bad(reply, b.error);
  const month = dayKey(new Date()).slice(0, 7);
  const last = d.monthReport();
  if (last?.month === month && !b.data.again) return { data: last.report, cached: true, month };
  const runs = d.runRows(), s = d.settings(), progress: Record<string, LessonProgress> = s.lessons ?? {}, all = [...CURRICULUM, ...d.aiLessons()];
  const input = {
    month, months: monthly(runs, Date.now()), skills: skillMap(all, progress, dayKey(new Date())).map(k => ({ skill: k.name, mastery: k.mastery, due: k.due })),
    lessonsFinished: Object.values(progress).filter(p => p.completedAt?.startsWith(month)).length,
    teacherNotes: d.teacherNotes(), lastReport: last?.month !== month ? last?.report : undefined,
  };
  try {
    const r = await ask('month', MonthReportSchema, input, { noCache: b.data.again });
    if (!d.fromDevice) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('monthReport', ?)").run(JSON.stringify({ month, report: r.data }));
    return { ...r, month };
  } catch (e) { return aiFail(reply, e); }
});

app.get('/api/settings', async () => Object.fromEntries((db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]).map(r => [r.key, JSON.parse(r.value)])));
app.put('/api/settings/:key', async (req, reply) => {
  const p = z.object({ key: z.string().regex(/^[\w. -]{1,100}$/) }).safeParse(req.params);
  if (!p.success || req.body === undefined) return bad(reply, 'Invalid setting');
  const value = JSON.stringify(req.body);
  if (value.length > 64_000) return bad(reply, 'Setting too large');
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(p.data.key, value);
  return { ok: true };
});

// ---------- AI coach ----------
let cliCheck: { ok: boolean; version?: string } | undefined;
/** Whether the coach can answer: the API provider, or a claude CLI that runs (checked until it does, then remembered). */
function coachCheck() {
  const name = getProvider().name;
  if (!name.startsWith('claude-cli')) return { name, api: true, ready: true };
  if (!cliCheck?.ok) {
    const r = spawnSync(process.env.CLAUDE_BIN || 'claude', ['--version'], { timeout: 10_000, encoding: 'utf8', env: childEnv() });
    cliCheck = r.status === 0 ? { ok: true, version: r.stdout.trim() } : { ok: false };
  }
  return { name, api: false, ready: cliCheck.ok };
}
app.get('/api/coach/status', async () => {
  const { name, api } = coachCheck();
  if (api) return { provider: name, ready: true, message: `Using the Anthropic API (${process.env.CLAUDE_MODEL || 'claude-sonnet-5-5'}).` };
  return cliCheck?.ok
    ? { provider: name, ready: true, message: `Using your Claude subscription via ${cliCheck.version}, model ${process.env.CLAUDE_CLI_MODEL || 'your Claude Code default'}${process.env.CLAUDE_CLI_EFFORT ? `, ${process.env.CLAUDE_CLI_EFFORT} effort` : ''}; lessons and plans are written by ${lessonModel().model} on ${lessonModel().effort} effort.` }
    : { provider: name, ready: false, message: 'The claude CLI was not found. Install Claude Code and run `claude` once to log in. Everything else works without it.' };
});

// Coach routes take an optional `context` (the iPad's data, server/coachContext.ts); without it they read this server's
// SQLite as before. With it, nothing is written to this server's tables: plans and lessons come back in the answer.
app.post('/api/coach/feedback', async (req, reply) => {
  const ci = coachInput(req.body);
  if ('error' in ci) return bad(reply, ci.error);
  const b = z.object({ summary: z.record(z.string(), z.unknown()) }).safeParse(ci.rest);
  if (!b.success) return bad(reply, b.error);
  try { return await ask('feedback', FeedbackSchema, { run: b.data.summary, library: catalog(ci.d.savedCharts()) }); } catch (e) { return aiFail(reply, e); }
});

// The weekly plan (R6): written from the student profile, the stage and last week's notes; its lessons lead the Journey.
app.post('/api/coach/plan', async (req, reply) => {
  const ci = coachInput(req.body);
  if ('error' in ci) return bad(reply, ci.error);
  const { d } = ci;
  const b = PlanRequestSchema.safeParse(ci.rest ?? {});
  if (!b.success) return bad(reply, b.error);
  const recent = d.runRows(30).map(r => ({ chart: r.chartTitle, bpm: Math.round(r.bpm), accuracy: r.accuracy, at: r.startedAt.slice(0, 10) }));
  const s = d.settings(), profile = s.profile ?? { goals: [], minutesPerDay: 25, onboarded: true }, progress = s.lessons ?? {};
  const all = [...CURRICULUM, ...d.aiLessons()];
  const m = currentMilestone(MILESTONES, all, progress, profile) ?? MILESTONES.filter(x => checkpointsOf(x, all, profile).length).at(-1);
  const level = m?.level ?? 0;
  // the lessons it may pick: this stage's, plus finished ones from earlier stages that came out shaky (1–2 stars)
  const pickable = visibleLessons(all, profile).filter(l => l.level === level || (l.level < level && (progress[l.id]?.stars ?? 3) <= 2)).slice(-30);
  const last = d.plan();
  try {
    const songs = d.songs().map(x => ({ id: x.id, title: x.title })); // so play-along items can link to them
    const r = await ask('plan', PlanSchema, {
      ...b.data, goals: b.data.goals ?? (profile.goals.length ? profile.goals.join(', ') : 'not sure yet'), minutesPerDay: b.data.minutesPerDay ?? profile.minutesPerDay,
      student: { read: studentRead(progress, d.runRows(12)), profile: studentProfile(d.runRows()), ...(soreActive(s.soreUntil, dayKey(new Date())) && { sore: true }), teacherNotes: d.teacherNotes() },
      stage: m && { level, title: m.title, canDo: m.canDo },
      lessons: pickable.map(l => ({ id: l.id, title: l.title, level: l.level, kind: l.kind, checkpoint: !!m?.checkpoints.includes(l.id), done: !!progress[l.id]?.completedAt, stars: progress[l.id]?.stars })),
      lastWeek: last && { focus: last.focus, notes: last.notes, week: last.week },
      skills: skillMap(all, progress, dayKey(new Date())).map(k => ({ skill: k.name, mastery: k.mastery, due: k.due })), // N5: plan from the skill map
      recent, library: catalog(d.savedCharts()), songs,
    });
    const ids = new Set(pickable.map(l => l.id));
    const plan = { ...r.data, lessonIds: r.data.lessonIds?.filter(id => ids.has(id)), week: b.data.week ?? r.data.week };
    if (d.fromDevice) return { plan, checks: {} }; // the iPad keeps it
    const { lastInsertRowid } = db.prepare('INSERT INTO plans (json) VALUES (?)').run(JSON.stringify(plan));
    return { id: Number(lastInsertRowid), plan, checks: {} };
  } catch (e) { return aiFail(reply, e); }
});
app.get('/api/plan', async () => latestPlan());
app.put('/api/plan/:id/checks', async (req, reply) => {
  const p = z.object({ id: z.coerce.number().int() }).safeParse(req.params), b = z.record(z.string().max(20), z.boolean()).safeParse(req.body);
  if (!p.success || !b.success) return bad(reply, 'Invalid request');
  db.prepare('UPDATE plans SET checks_json = ? WHERE id = ?').run(JSON.stringify(b.data), p.data.id);
  return { ok: true };
});

// ---------- the live coaching conversation (streams sentences as server-sent events) ----------
app.post('/api/coach/session', async (req, reply) => {
  const ci = coachInput(req.body); // the context stays here: the coach gets what's derived from it, not the payload
  if ('error' in ci) return bad(reply, ci.error);
  const { d } = ci;
  const b = SessionEventSchema.safeParse(ci.rest);
  if (!b.success) return bad(reply, b.error);
  const event: Record<string, unknown> = { ...b.data };
  if (event.type === 'open' && typeof event.chartId === 'string') { // give the coach their history on this exercise
    event.pastTakes = d.pastTakes(event.chartId);
  }
  if (event.type === 'open' || event.type === 'take') { // how they're doing overall, so the coach teaches this student, not a stereotype
    const s = d.settings();
    event.student = studentRead(s.lessons ?? {}, d.runRows(12));
    const focus = weekFocus(d);
    if (focus) event.weekFocus = focus; // this week's plan, so the coach's tips point the same way
    if (soreActive(s.soreUntil, dayKey(new Date()))) event.sore = true; // N10: go easy
    const notes = d.teacherNotes();
    if (notes.length) event.teacherNotes = notes.map(n => ({ date: n.date, text: n.text.slice(0, 300) })); // N2: what their teacher said (trimmed: it goes with every take)
  }
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const sse = (name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  try { sse('reply', await coachTurn(event, s => sse('say', s))); }
  catch (e) { sse('error', { error: e instanceof AiError ? e.message : String(e) }); }
  res.end();
});

// ---------- coach: live-tip wording (written once per exercise) ----------
app.post('/api/coach/tips', async (req, reply) => {
  const b = TipsRequestSchema.safeParse(req.body);
  if (!b.success) return bad(reply, b.error);
  try {
    const r = await ask('tips', TipsSchema, b.data);
    return { data: { tips: Object.fromEntries(Object.entries(r.data.tips).filter(([id]) => b.data.cueIds.includes(id))) }, cached: r.cached };
  } catch (e) { return aiFail(reply, e); }
});

// ---------- coach voice (Piper, offline) ----------
app.get('/api/tts/status', async () => ttsStatus());
app.get('/api/tts', async (req, reply) => {
  const p = z.object({ text: z.string().trim().min(1).max(600) }).safeParse(req.query);
  if (!p.success) return bad(reply, 'Text must be 1–600 characters');
  try {
    const file = await speech(p.data.text.replace(/\s+/g, ' '));
    return reply.type('audio/wav').header('cache-control', 'max-age=31536000, immutable').send(createReadStream(file));
  } catch (e) { return reply.code(503).send({ error: (e as Error).message }); }
});

// ---------- talk to the coach (offline speech-to-text) ----------
app.get('/api/stt/status', async () => sttStatus());
app.post('/api/stt', async (req, reply) => {
  if (!Buffer.isBuffer(req.body) || req.body.length < 200 || req.body.length > 10_000_000 || !looksLikeAudio(req.body, 'wav')) return bad(reply, 'Send a short WAV recording');
  try { return { text: await transcribe(req.body) }; } catch (e) { return reply.code(503).send({ error: (e as Error).message }); }
});

// ---------- YouTube songs ----------
const ytFail = (reply: FastifyReply, e: unknown) => {
  if (e instanceof YtError) return reply.code(e.status).send({ error: e.message });
  throw e;
};
const Q = z.object({ q: z.string().trim().min(1).max(200) });
app.get('/api/youtube/search', async (req, reply) => {
  const p = Q.safeParse(req.query);
  if (!p.success) return bad(reply, 'Type something to search for');
  try { return await searchYouTube(p.data.q); } catch (e) { return ytFail(reply, e); }
});
const DRUMLESS = /drumless|no drums|without drums|drum ?less|minus drums|drums? removed/i;
const COVER = /drum (cover|playthrough|tutorial|lesson)|drumcam|drum cam/i;
app.get('/api/youtube/versions', async (req, reply) => {
  const p = z.object({ title: z.string().trim().min(1).max(200) }).safeParse(req.query);
  if (!p.success) return bad(reply, 'Missing title');
  const title = p.data.title.replace(/\(official.*?\)|\[official.*?\]|\b(official (music )?video|lyrics?|audio|hd|4k)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  try {
    const [drumless, covers] = await Promise.all([searchYouTube(`${title} drumless`), searchYouTube(`${title} drum cover`)]);
    const first = (xs: typeof drumless, re: RegExp) => [...xs.filter(x => re.test(x.title)), ...xs.filter(x => !re.test(x.title))];
    return { drumless: first(sameSong(title, drumless), DRUMLESS), covers: first(sameSong(title, covers), COVER) };
  } catch (e) { return ytFail(reply, e); }
});

type YtRow = { id: string; title: string; original_id: string; drumless_id: string | null; cover_id: string | null; ts_num: number; ts_den: number; notes_json: string; verified_at: string | null };
function ytSong(r: YtRow): YtSong {
  const ids = [r.original_id, r.drumless_id, r.cover_id].filter(Boolean) as string[];
  const grids = Object.fromEntries((db.prepare(`SELECT * FROM yt_grids WHERE video_id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { video_id: string; bpm: number; offset_sec: number }[])
    .map(g => [g.video_id, { bpm: g.bpm, offsetSec: g.offset_sec }]));
  return { id: r.id, title: r.title, originalId: r.original_id, drumlessId: r.drumless_id, coverId: r.cover_id,
    timeSignature: [r.ts_num, r.ts_den as 4], notes: JSON.parse(r.notes_json), grids, verifiedAt: r.verified_at ?? null };
}
const ytById = (id: string) => db.prepare('SELECT * FROM yt_songs WHERE id = ?').get(id) as YtRow | undefined;

app.get('/api/ytsongs', async () => (db.prepare('SELECT * FROM yt_songs ORDER BY created_at DESC').all() as YtRow[]).map(ytSong));
app.post('/api/ytsongs', async (req, reply) => {
  const b = YtSongCreateSchema.safeParse(req.body);
  if (!b.success) return bad(reply, b.error);
  const id = `yt-${b.data.originalId}`;
  db.prepare('INSERT OR IGNORE INTO yt_songs (id, title, original_id, drumless_id, cover_id) VALUES (?, ?, ?, ?, ?)')
    .run(id, b.data.title, b.data.originalId, b.data.drumlessId ?? null, b.data.coverId ?? null);
  return ytSong(ytById(id)!);
});
app.patch('/api/ytsongs/:id', async (req, reply) => {
  const p = IdParam.safeParse(req.params), b = YtSongPatchSchema.safeParse(req.body);
  if (!p.success || !b.success) return bad(reply, b.success ? 'Invalid id' : b.error);
  const row = ytById(p.data.id);
  if (!row) return reply.code(404).send({ error: 'Not found' });
  const d = b.data;
  db.prepare('UPDATE yt_songs SET title = ?, drumless_id = ?, cover_id = ?, ts_num = ?, ts_den = ?, notes_json = ? WHERE id = ?').run(
    d.title ?? row.title, d.drumlessId === undefined ? row.drumless_id : d.drumlessId, d.coverId === undefined ? row.cover_id : d.coverId,
    d.timeSignature?.[0] ?? row.ts_num, d.timeSignature?.[1] ?? row.ts_den, d.notes ? JSON.stringify(d.notes) : row.notes_json, p.data.id);
  // N4: "checked by ear" is set by the student; changed notes need checking again
  const verified = d.verified === true ? new Date().toISOString().slice(0, 10) : d.verified === false || (d.notes && JSON.stringify(d.notes) !== row.notes_json) ? null : row.verified_at;
  db.prepare('UPDATE yt_songs SET verified_at = ? WHERE id = ?').run(verified, p.data.id);
  return ytSong(ytById(p.data.id)!);
});
app.delete('/api/ytsongs/:id', async (req, reply) => {
  const p = IdParam.safeParse(req.params);
  if (!p.success) return bad(reply, p.error);
  db.prepare('DELETE FROM yt_songs WHERE id = ?').run(p.data.id);
  return { ok: true };
});
app.put('/api/ytgrids/:videoId', async (req, reply) => {
  const p = z.object({ videoId: z.string().regex(/^[\w-]{11}$/) }).safeParse(req.params), b = GridSchema.safeParse(req.body);
  if (!p.success || !b.success) return bad(reply, 'Invalid grid');
  db.prepare('INSERT OR REPLACE INTO yt_grids (video_id, bpm, offset_sec) VALUES (?, ?, ?)').run(p.data.videoId, b.data.bpm, b.data.offsetSec);
  return { ok: true };
});
app.post('/api/coach/groove', async (req, reply) => {
  const b = GrooveRequestSchema.safeParse(req.body);
  if (!b.success) return bad(reply, b.error);
  const { again, ...input } = b.data; // "Ask again" skips the cached answer (same key, so the new one replaces it)
  try { return await ask('groove', GrooveSchema, input, { noCache: again }); } catch (e) { return aiFail(reply, e); }
});

app.post('/api/coach/showoff', async (req, reply) => {
  const b = ShowoffRequestSchema.safeParse(req.body);
  if (!b.success) return bad(reply, b.error);
  try {
    const r = await ask('showoff', ShowoffSchema, b.data);
    // The coach can't know video ids, so look each song up (no API key: the student searches by name).
    const songs = await Promise.all(r.data.songs.map(async s => ({ ...s, video: (await searchYouTube(`${s.artist} ${s.title}`).catch(() => []))[0] })));
    return { data: { songs }, cached: r.cached };
  } catch (e) { return aiFail(reply, e); }
});

// ---------- coach-written lessons ----------
const aiLessons = () => (db.prepare('SELECT json FROM ai_lessons ORDER BY created_at').all() as { json: string }[]).map(r => JSON.parse(r.json) as Lesson);
app.get('/api/lessons', async () => aiLessons());
app.delete('/api/lessons/:id', async (req, reply) => {
  const p = IdParam.safeParse(req.params);
  if (!p.success) return bad(reply, p.error);
  return db.prepare('DELETE FROM ai_lessons WHERE id = ?').run(p.data.id).changes ? { ok: true } : reply.code(404).send({ error: 'Not found' });
});

// With the iPad's context, the lesson comes back with `replaces`: the coach's unstarted lessons for this stage, which the
// iPad drops (for the web app this server does that in its own table).
app.post('/api/coach/lesson', async (req, reply) => {
  const ci = coachInput(req.body);
  if ('error' in ci) return bad(reply, ci.error);
  const { d } = ci;
  const b = LessonRequestSchema.safeParse(ci.rest ?? {});
  if (!b.success) return bad(reply, b.error);
  const s = d.settings();
  const existing = d.aiLessons();
  const input = lessonInput({ profile: s.profile ?? { goals: [], minutesPerDay: 25, onboarded: true }, progress: s.lessons ?? {}, aiLessons: existing, recent: d.recentForLesson(), struggle: b.data.struggle,
    songs: d.songs(), studentProfile: studentProfile(d.runRows()), weekFocus: weekFocus(d), sore: soreActive(s.soreUntil, dayKey(new Date())), teacherNotes: d.teacherNotes() });
  if (!input) return bad(reply, 'No stage fits your goals yet. Change them under Journey → Goals.');
  try {
    const r = await ask('lesson', AiLessonSchema, input);
    // Never a built-in's title, nor a coach lesson's from another stage (F8; the same stage's twin is caught below).
    r.data = { ...r.data, title: uniqueTitle(r.data.title, r.data.focus, [...Object.values(LESSON_BY_ID), ...existing.filter(l => l.level !== input.milestone.level)].map(l => l.title)) };
    const now = d.aiLessons(); // re-read: another request may have saved a lesson while the coach was thinking
    const same = now.find(l => l.title === r.data.title && l.level === input.milestone.level);
    if (same) return { data: same, cached: true };
    // Only a checkpoint of this stage can be stood in for, and only by a lesson that ends in a drill.
    const end = r.data.steps[r.data.steps.length - 1], cpLesson = r.data.checkpoint ? LESSON_BY_ID[r.data.checkpoint] : undefined;
    const cp = input.milestone.checkpoints.some(c => c.id === r.data.checkpoint) && canStandIn(end) && cpLesson && standsInFor(end, cpLesson) ? r.data.checkpoint : undefined;
    const lesson = toLesson(applyBites({ ...r.data, checkpoint: cp }, id => d.song(id)), input.milestone.level);
    // The new lesson replaces the coach's unstarted ones for this stage, so they don't pile up.
    const progress = s.lessons ?? {};
    const replaced = now.filter(old => old.level === lesson.level && !progress[old.id]).map(old => old.id);
    if (d.fromDevice) return { data: lesson, cached: r.cached, replaces: replaced };
    for (const id of replaced) db.prepare('DELETE FROM ai_lessons WHERE id = ?').run(id);
    db.prepare('INSERT INTO ai_lessons (id, json) VALUES (?, ?)').run(lesson.id, JSON.stringify(lesson));
    return { data: lesson, cached: r.cached };
  } catch (e) { return aiFail(reply, e); }
});

// Listen only when started as a program (npm run server); the route tests import `app` and call it with inject.
if (import.meta.main) {
  await app.listen({ port: PORT, host: access.host });
  app.log.info(accessSummary(access));
}
export { app };
