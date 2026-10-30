// The coach's week plan (ported from src/coach/weekPlan.ts and CoachView.tsx PlanCard). The web's GET /api/plan and
// PUT /api/plan/:id/checks read and write its server; on the iPad the plan lives in its own storage (D3: the plans
// table, src/data/records.ts) and POST /api/coach/plan carries the iPad's context, so the server answers
// `{ plan, checks }` without an id and the iPad keeps it.
import { PlanSchema, type Plan } from '@drum-coach/core/coach/schemas';
import { isoWeek } from '@drum-coach/core/engine/progress';
import type { PlanRecord, PlansRepo } from '../../data/records';
import type { CoachAsks } from './asks';

export type SavedPlan = { id: number; plan: Plan; checks: Record<string, boolean> };
export type PlanForm = { goals: string; minutesPerDay: number; daysPerWeek: number };

/** The web form's starting values (PlanCard). */
export const DEFAULT_PLAN_FORM: PlanForm = { goals: 'Steady time on rock grooves and cleaner fills', minutesPerDay: 20, daysPerWeek: 5 };

/** The web form's rules: goals ≤ 500 characters, 5–180 minutes (20 when blank), 1–7 days (5 when blank). */
export function cleanPlanForm(f: { goals: string; minutesPerDay: number | string; daysPerWeek: number | string }): PlanForm {
  const minutes = Math.round(Number(f.minutesPerDay)) || 20, days = Math.round(Number(f.daysPerWeek)) || 5;
  return { goals: f.goals.slice(0, 500).trim() || DEFAULT_PLAN_FORM.goals, minutesPerDay: Math.min(180, Math.max(5, minutes)), daysPerWeek: Math.min(7, Math.max(1, days)) };
}

/** A stored plan as the screens use it (an unreadable one is none). */
export function savedPlanOf(r: PlanRecord | null): SavedPlan | null {
  if (!r) return null;
  const p = PlanSchema.safeParse(r.plan);
  if (!p.success) return null;
  const checks = Object.fromEntries(Object.entries(r.checks).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>;
  return { id: r.id, plan: p.data, checks };
}

/** A plan item's play link (PlanCard): a YouTube song ("yt-…") or a chart that exists; none otherwise. */
export type PlanItemTarget = { kind: 'song'; id: string } | { kind: 'play'; chartId: string; bpm?: number };
export function planItemTarget(it: { chartId?: string; bpm?: number }, exists: (chartId: string) => boolean): PlanItemTarget | undefined {
  if (!it.chartId) return undefined;
  if (it.chartId.startsWith('yt-')) return { kind: 'song', id: it.chartId };
  return exists(it.chartId) ? { kind: 'play', chartId: it.chartId, bpm: it.bpm } : undefined;
}

/** An item's line: "Money beat · 10 min · 70 BPM". */
export const planItemLine = (it: { title: string; minutes: number; bpm?: number }) => `${it.title} · ${it.minutes} min${it.bpm ? ` · ${it.bpm} BPM` : ''}`;

export function createWeekPlan(deps: { plans: Pick<PlansRepo, 'latest' | 'add' | 'setChecks'> | null; asks: Pick<CoachAsks, 'ask' | 'entry'> }) {
  let saved: SavedPlan | null = null, loaded = false, n = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());

  async function refresh() {
    if (!deps.plans) return;
    try { saved = savedPlanOf(await deps.plans.latest()); loaded = true; notify(); } catch { /* storage unreadable: no plan */ }
  }
  /** Keeps the plan the coach wrote (with its checks) and shows it. */
  async function keep(answer: { plan?: unknown; checks?: unknown }) {
    if (!deps.plans) throw new Error('This iPad can’t store the plan (storage unavailable)');
    const p = PlanSchema.safeParse(answer?.plan);
    if (!p.success) throw new Error('The coach’s plan didn’t match the expected format');
    const id = deps.plans.add(p.data as Record<string, unknown>);
    const checks = answer.checks && typeof answer.checks === 'object' ? answer.checks as Record<string, unknown> : {};
    if (Object.keys(checks).length) deps.plans.setChecks(id, checks);
    await refresh();
  }

  return {
    refresh,
    get: () => saved,
    loaded: () => loaded,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    /** The plan the coach wrote for this ISO week, if any. */
    thisWeeks: (now = new Date()) => (saved?.plan.week === isoWeek(now) ? saved.plan : undefined),
    /** Ticks or unticks item `k` ("day.item"). */
    toggle(k: string) {
      if (!saved || !deps.plans) return;
      const checks = { ...saved.checks, [k]: !saved.checks[k] };
      saved = { ...saved, checks };
      deps.plans.setChecks(saved.id, checks);
      notify();
    },
    /** "Make my plan" / "Make a new plan": a new key each time, as the web. Returns the key to read the entry by. */
    make(form: PlanForm): string {
      const key = `plan:${++n}`;
      void deps.asks.ask(key, 'plan', { ...cleanPlanForm(form) }, keep);
      return key;
    },
    /** On the first Journey visit of a week: ask the coach for this week's plan, once. */
    async ensure(now = new Date()) {
      if (!loaded) await refresh();
      const wk = isoWeek(now);
      if (loaded && saved?.plan.week !== wk) await deps.asks.ask(`plan-${wk}`, 'plan', { week: wk }, keep);
    },
  };
}
export type WeekPlan = ReturnType<typeof createWeekPlan>;
