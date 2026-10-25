import Fastify, { type FastifyReply } from 'fastify';
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { SessionEventSchema, AiLessonSchema, ChatReplySchema, FeedbackSchema, LessonRequestSchema, PlanRequestSchema, PlanSchema, RunRecordSchema, ShowoffRequestSchema, ShowoffSchema, TipsRequestSchema, TipsSchema } from '../src/coach/schemas.ts';
import { LIBRARY } from '../src/content/library.ts';
import { ChartSchema } from '../src/engine/chart.ts';
import type { RunRow } from '../src/engine/progress.ts';
import { ask, getProvider } from './ai/coach.ts';
import { applyBites, canStandIn, lessonInput, standsInFor, toLesson } from './ai/lessons.ts';
import { LESSON_BY_ID } from '../src/content/curriculum.ts';
import { studentRead } from '../src/engine/planner.ts';
import type { Lesson } from '../src/engine/lesson.ts';
import { AiError } from './ai/providers.ts';
import { coachTurn } from './ai/session.ts';
import { AUDIO_DIR, db } from './db.ts';
import { sameSong, searchYouTube, YtError } from './youtube.ts';
import { speech, ttsStatus } from './tts.ts';
import { sttStatus, transcribe } from './stt.ts';
import { GridSchema, GrooveRequestSchema, YtSongCreateSchema, YtSongPatchSchema, type YtSong } from '../src/youtube/schemas.ts';

const PORT = Number(process.env.PORT || 8787);
const app = Fastify({ logger: { level: 'info' }, bodyLimit: 1_000_000 });

// Only the local app may call this API: blocks DNS rebinding (Host) and other websites (Origin).
app.addHook('onRequest', async (req, reply) => {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  const origin = req.headers.origin;
  if (!['localhost', '127.0.0.1'].includes(host) || (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
    return reply.code(403).send({ error: 'Forbidden' });
  }
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

function catalog() {
  const saved = (db.prepare("SELECT id, json FROM charts WHERE source = 'ai'").all() as ChartRow[]).map(r => ({ ...JSON.parse(r.json), id: r.id }));
  return [...LIBRARY, ...saved].map(c => ({ id: c.id, title: c.title, kind: c.kind, level: c.level, bpm: c.bpm, timeSignature: c.timeSignature, description: c.description }));
}

app.get('/api/health', async () => ({ ok: true, provider: getProvider().name }));

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
  if (!p.success || !ext || !Buffer.isBuffer(req.body)) return bad(reply, 'Send an MP3, OGG, WAV, FLAC or M4A file');
  if (!db.prepare('SELECT 1 FROM charts WHERE id = ?').get(p.data.id)) return reply.code(404).send({ error: 'Not found' });
  const file = `${p.data.id}.${ext}`; // id is validated, so the path stays inside AUDIO_DIR
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
  SELECT * FROM (SELECT chart_id AS chartId, chart_title AS chartTitle, level, started_at AS startedAt, duration_s AS durationS,
    bpm, speed, accuracy, mean_offset AS meanOffset, spread, json_extract(summary_json, '$.notes') AS notes,
    json_extract(summary_json, '$.section.fromBar') AS fromBar, json_extract(summary_json, '$.section.toBar') AS toBar, json_extract(summary_json, '$.tipIds') AS tips FROM runs ORDER BY started_at DESC LIMIT ?) ORDER BY startedAt`).all(limit) as RunRow[])
  .map(r => ({ ...r, level: r.level ?? undefined, notes: r.notes ?? undefined, fromBar: r.fromBar ?? undefined, toBar: r.toBar ?? undefined, tips: r.tips ? JSON.parse(r.tips as unknown as string) : undefined }));

app.post('/api/runs', async (req, reply) => {
  const b = RunRecordSchema.safeParse(req.body);
  if (!b.success) return bad(reply, b.error);
  const r = b.data;
  const { lastInsertRowid } = db.prepare(`INSERT INTO runs (chart_id, chart_title, level, started_at, duration_s, bpm, speed, accuracy, mean_offset, spread, summary_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(r.chartId, r.chartTitle, r.level ?? null, r.startedAt, r.durationS, r.bpm, r.speed, r.accuracy, r.meanOffset, r.spread, JSON.stringify(r.summary));
  return { id: Number(lastInsertRowid) };
});
app.get('/api/runs', async () => runRows());

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
app.get('/api/coach/status', async () => {
  const name = getProvider().name;
  if (!name.startsWith('claude-cli')) return { provider: name, ready: true, message: `Using the Anthropic API (${process.env.CLAUDE_MODEL || 'claude-sonnet-5-5'}).` };
  if (!cliCheck?.ok) {
    const r = spawnSync(process.env.CLAUDE_BIN || 'claude', ['--version'], { timeout: 10_000, encoding: 'utf8' });
    cliCheck = r.status === 0 ? { ok: true, version: r.stdout.trim() } : { ok: false };
  }
  return cliCheck.ok
    ? { provider: name, ready: true, message: `Using your Claude subscription via ${cliCheck.version}, model ${process.env.CLAUDE_CLI_MODEL || 'your Claude Code default'}${process.env.CLAUDE_CLI_EFFORT ? `, ${process.env.CLAUDE_CLI_EFFORT} effort` : ''}.` }
    : { provider: name, ready: false, message: 'The claude CLI was not found. Install Claude Code and run `claude` once to log in. Everything else works without it.' };
});

app.post('/api/coach/feedback', async (req, reply) => {
  const b = z.object({ summary: z.record(z.string(), z.unknown()) }).safeParse(req.body);
  if (!b.success) return bad(reply, b.error);
  try { return await ask('feedback', FeedbackSchema, { run: b.data.summary, library: catalog() }); } catch (e) { return aiFail(reply, e); }
});

app.post('/api/coach/plan', async (req, reply) => {
  const b = PlanRequestSchema.safeParse(req.body);
  if (!b.success) return bad(reply, b.error);
  const recent = runRows(30).map(r => ({ chart: r.chartTitle, bpm: Math.round(r.bpm), accuracy: r.accuracy, at: r.startedAt.slice(0, 10) }));
  try {
    const songs = (db.prepare('SELECT id, title FROM yt_songs').all() as { id: string; title: string }[]); // so play-along items can link to them
    const r = await ask('plan', PlanSchema, { ...b.data, recent, library: catalog(), songs });
    const { lastInsertRowid } = db.prepare('INSERT INTO plans (json) VALUES (?)').run(JSON.stringify(r.data));
    return { id: Number(lastInsertRowid), plan: r.data, checks: {} };
  } catch (e) { return aiFail(reply, e); }
});
app.get('/api/plan', async () => {
  const row = db.prepare('SELECT * FROM plans ORDER BY id DESC LIMIT 1').get() as { id: number; json: string; checks_json: string } | undefined;
  return row ? { id: row.id, plan: JSON.parse(row.json), checks: JSON.parse(row.checks_json) } : null;
});
app.put('/api/plan/:id/checks', async (req, reply) => {
  const p = z.object({ id: z.coerce.number().int() }).safeParse(req.params), b = z.record(z.string().max(20), z.boolean()).safeParse(req.body);
  if (!p.success || !b.success) return bad(reply, 'Invalid request');
  db.prepare('UPDATE plans SET checks_json = ? WHERE id = ?').run(JSON.stringify(b.data), p.data.id);
  return { ok: true };
});

// ---------- the live coaching conversation (streams sentences as server-sent events) ----------
app.post('/api/coach/session', async (req, reply) => {
  const b = SessionEventSchema.safeParse(req.body);
  if (!b.success) return bad(reply, b.error);
  const event: Record<string, unknown> = { ...b.data };
  if (event.type === 'open' && typeof event.chartId === 'string') { // give the coach their history on this exercise
    event.pastTakes = (db.prepare('SELECT started_at, bpm, accuracy, mean_offset, spread FROM runs WHERE chart_id = ? ORDER BY started_at DESC LIMIT 5').all(event.chartId) as
      { started_at: string; bpm: number; accuracy: number; mean_offset: number; spread: number }[]).reverse()
      .map(r => ({ at: r.started_at.slice(0, 16), bpm: Math.round(r.bpm), accuracyPct: r.accuracy, meanOffsetMs: r.mean_offset, spreadMs: r.spread }));
  }
  if (event.type === 'open' || event.type === 'take') { // how they're doing overall, so the coach teaches this student, not a stereotype
    const row = db.prepare("SELECT value FROM settings WHERE key = 'app'").get() as { value: string } | undefined;
    event.student = studentRead(row ? JSON.parse(row.value).lessons ?? {} : {}, runRows(12));
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
  if (!Buffer.isBuffer(req.body) || req.body.length < 200 || req.body.length > 10_000_000) return bad(reply, 'Send a short WAV recording');
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

type YtRow = { id: string; title: string; original_id: string; drumless_id: string | null; cover_id: string | null; ts_num: number; ts_den: number; notes_json: string };
function ytSong(r: YtRow): YtSong {
  const ids = [r.original_id, r.drumless_id, r.cover_id].filter(Boolean) as string[];
  const grids = Object.fromEntries((db.prepare(`SELECT * FROM yt_grids WHERE video_id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { video_id: string; bpm: number; offset_sec: number }[])
    .map(g => [g.video_id, { bpm: g.bpm, offsetSec: g.offset_sec }]));
  return { id: r.id, title: r.title, originalId: r.original_id, drumlessId: r.drumless_id, coverId: r.cover_id,
    timeSignature: [r.ts_num, r.ts_den as 4], notes: JSON.parse(r.notes_json), grids };
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
  try { return await ask('groove', ChatReplySchema, b.data); } catch (e) { return aiFail(reply, e); }
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

app.post('/api/coach/lesson', async (req, reply) => {
  const b = LessonRequestSchema.safeParse(req.body ?? {});
  if (!b.success) return bad(reply, b.error);
  const row = db.prepare("SELECT value FROM settings WHERE key = 'app'").get() as { value: string } | undefined;
  const app = row ? JSON.parse(row.value) : {};
  const recent = (db.prepare('SELECT chart_title, started_at, bpm, accuracy, summary_json FROM runs ORDER BY started_at DESC LIMIT 15').all() as
    { chart_title: string; started_at: string; bpm: number; accuracy: number; summary_json: string }[]).reverse()
    .map(r => { const { weakSpots, perDrum, velocity, meanOffsetMs, spreadMs, lesson } = JSON.parse(r.summary_json); return { chart: r.chart_title, at: r.started_at.slice(0, 16), bpm: Math.round(r.bpm), accuracy: r.accuracy, summary: { meanOffsetMs, spreadMs, perDrum, velocity, weakSpots, lesson } }; });
  const existing = aiLessons();
  const input = lessonInput({ profile: app.profile ?? { goals: [], minutesPerDay: 25, onboarded: true }, progress: app.lessons ?? {}, aiLessons: existing, recent, struggle: b.data.struggle,
    songs: (db.prepare('SELECT * FROM yt_songs').all() as YtRow[]).map(ytSong) });
  if (!input) return bad(reply, 'You have finished every milestone. Hold V or the mic button and ask the coach for new challenges.');
  try {
    const r = await ask('lesson', AiLessonSchema, input);
    const now = aiLessons(); // re-read: another request may have saved a lesson while the coach was thinking
    const same = now.find(l => l.title === r.data.title && l.level === input.milestone.level);
    if (same) return { data: same, cached: true };
    // Only a checkpoint of this stage can be stood in for, and only by a lesson that ends in a drill.
    const end = r.data.steps[r.data.steps.length - 1], cpLesson = r.data.checkpoint ? LESSON_BY_ID[r.data.checkpoint] : undefined;
    const cp = input.milestone.checkpoints.some(c => c.id === r.data.checkpoint) && canStandIn(end) && cpLesson && standsInFor(end, cpLesson) ? r.data.checkpoint : undefined;
    const lesson = toLesson(applyBites({ ...r.data, checkpoint: cp }, id => { const row = ytById(id); return row && ytSong(row); }), input.milestone.level);
    // The new lesson replaces the coach's unstarted ones for this stage, so they don't pile up.
    const progress = app.lessons ?? {};
    for (const old of now) if (old.level === lesson.level && !progress[old.id]) db.prepare('DELETE FROM ai_lessons WHERE id = ?').run(old.id);
    db.prepare('INSERT INTO ai_lessons (id, json) VALUES (?, ?)').run(lesson.id, JSON.stringify(lesson));
    return { data: lesson, cached: r.cached };
  } catch (e) { return aiFail(reply, e); }
});

await app.listen({ port: PORT, host: '127.0.0.1' });
