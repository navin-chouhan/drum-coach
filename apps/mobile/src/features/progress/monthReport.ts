// "This month's report" (N8): you vs you (an old take against a recent one), month by month, and the coach's monthly
// report. The first two are worked out on the iPad and always work; the report needs the home server (POST
// /api/coach/month with the iPad's context, D2), and the iPad keeps it (the `monthReport` setting, as the server did).
// Ported from the web's src/ui/YouVsYou.tsx.
import { MonthReportSchema, RunRecordSchema, type RunTake } from '@drum-coach/core/coach/schemas';
import { monthly, youVsYou } from '@drum-coach/core/engine/history';
import { PADS, type PadId } from '@drum-coach/core/engine/kit';
import { takeChart } from '@drum-coach/core/engine/transcribe';
import type { PracticeChart } from '../practice/catalog';
import type { RunRow } from '@drum-coach/core/engine/progress';
import { z } from 'zod';
import type { ApiFailure } from '../../platform/contracts';
import { dayKey, shortDateOf } from './dates';

export type MonthReport = z.infer<typeof MonthReportSchema>;
export const MONTH_REPORT_KEY = 'monthReport';
const KeptSchema = z.object({ month: z.string(), report: MonthReportSchema });
const AnswerSchema = z.object({ data: MonthReportSchema, month: z.string().optional() });

export const monthOf = (now: Date) => dayKey(now).slice(0, 7);

/** This month's report, if it's already written (no new call). */
export function keptReport(saved: unknown, now: Date): MonthReport | undefined {
  const p = KeptSchema.safeParse(saved);
  return p.success && p.data.month === monthOf(now) ? p.data.report : undefined;
}

/** A run whose hits weren't kept (older takes, or past the take cap). */
export const NO_TAKE_KEPT = "This take's notes weren't kept, so it can't be played back.";

/**
 * A kept take as a chart to play back (the web's YouVsYou hear()): only the student's own hits, as drum sounds, at the
 * take's own tempo. Pads the app doesn't know are dropped.
 */
export function keptTakeChart(raw: unknown, runId: number, title: string): PracticeChart | null {
  const p = RunRecordSchema.shape.take.safeParse(raw);
  const t: RunTake | undefined = p.success ? p.data : undefined;
  if (!t) return null;
  const hits = t.hits.filter(([, pad]) => (PADS as readonly string[]).includes(pad)).map(([time, pad, velocity]) => ({ time, pad: pad as PadId, velocity }));
  return { id: `take-${runId}`, ...takeChart(hits, { zero: 0, beatMs: t.beatMs, beats: t.beats, beatsPerBar: t.beatsPerBar, title, timeSignature: t.timeSignature }) };
}

/** You vs you and the month-by-month table, from the runs (offline). */
export function historyModel(runs: RunRow[], now: number) {
  const pair = youVsYou(runs, now);
  const months = monthly(runs, now).filter((m, i, all) => m.takes || all.slice(0, i).some(x => x.takes));
  const row = (label: string, r: RunRow) => ({ label, runId: r.id, accuracy: `${r.accuracy}%`, spread: `${Math.round(r.spread)} ms`, tempo: `${Math.round(r.bpm)} BPM`, title: `You, ${shortDateOf(r.startedAt)}` });
  return {
    pair: pair && {
      line: `${pair.now.chartTitle}: ${shortDateOf(pair.then.startedAt)} vs ${shortDateOf(pair.now.startedAt)}.`,
      rows: [row('A month ago', pair.then), row('Now', pair.now)],
    },
    months: months.length > 1 ? months.map(m => ({
      month: m.month, minutes: m.minutes, takes: m.takes,
      onTime: m.takes ? `${m.accuracy}%` : '—', spread: m.takes ? `${m.spread} ms` : '—', bestBpm: m.bestBpm ? String(m.bestBpm) : '—',
    })) : [],
  };
}

/** What the screen shows when the coach can't answer (the "server unreachable" state); everything else keeps working. */
export function coachUnavailable(f: Pick<ApiFailure, 'reason' | 'detail'>): string {
  switch (f.reason) {
    case 'not-configured': return 'The monthly report needs your coach: add the home server in Setup → Coach. Everything else here works without it.';
    case 'unreachable': return "Can't reach your coach's home server right now. Everything else here works without it; try again when it's on.";
    case 'unauthorized': case 'forbidden': return 'The home server turned the iPad away: check the coach settings in Setup → Coach.';
    case 'rate-limited': return 'The coach is busy: try again in a minute.';
    default: return f.detail ? `The coach is unavailable: ${f.detail}` : 'The coach is unavailable.';
  }
}

export type MonthDeps = {
  /** HomeServer.call. */
  call: (method: 'POST', path: '/api/coach/month', body: unknown, opts?: { timeoutMs?: number }) => Promise<{ ok: true; data: unknown } | ApiFailure>;
  /** storage.coachContext('month').context */
  context: () => Promise<unknown>;
  /** settings.put('monthReport', …) */
  keep: (value: { month: string; report: MonthReport }) => void;
};
export const COACH_TIMEOUT_MS = 200_000; // above the server's 180 s (QA4 M1)

/** Asks the coach for this month's report (`again` writes a new one) and keeps it. Never throws. */
export async function askMonthReport(deps: MonthDeps, again: boolean, now = new Date()): Promise<{ ok: true; report: MonthReport } | { ok: false; message: string }> {
  let context: unknown;
  try { context = await deps.context(); } catch { context = undefined; }
  const r = await deps.call('POST', '/api/coach/month', { again, ...(context !== undefined && { context }) }, { timeoutMs: COACH_TIMEOUT_MS });
  if (!r.ok) return { ok: false, message: coachUnavailable(r) };
  const p = AnswerSchema.safeParse(r.data);
  if (!p.success) return { ok: false, message: 'The coach answered in a way the app could not read. Try again.' };
  try { deps.keep({ month: p.data.month ?? monthOf(now), report: p.data.data }); } catch { /* shown anyway; asked again next time */ }
  return { ok: true, report: p.data.data };
}
