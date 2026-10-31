// The kit components' arithmetic (Stepper, Field, Bars, Track, Dots, TempoLadder, the coach's host text), pure so
// Vitest can check it. The components are in groups.tsx, forms.tsx, charts.tsx, lessonBits.tsx and coachBits.tsx.

/** One − / + press: `step` away, kept inside [min, max]; floats are rounded to the step's decimals (0.05 + 0.1). */
export function stepValue(value: number, dir: -1 | 1, { min = -Infinity, max = Infinity, step = 1 }: { min?: number; max?: number; step?: number } = {}): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  const next = Number((value + dir * step).toFixed(decimals));
  return Math.max(min, Math.min(max, next));
}

/** Whether − and + can still move. */
export const stepBounds = (value: number, min = -Infinity, max = Infinity) => ({ down: value > min, up: value < max });

/** A numeric field's text: digits only, at most `maxDigits` (3 for minutes and days, as the coach's plan form). */
export const digitsOnly = (text: string, maxDigits = 3): string => text.replace(/\D/g, '').slice(0, maxDigits);

/** A bar's height for `value` on a scale topped at `max` (max below 1 counts as 1), clamped to [0, height]. */
export const barHeight = (value: number, max: number, height: number): number => Math.max(0, Math.min(1, value / Math.max(1, max))) * height;

/** A width in percent of a fraction, clamped to 0–100 %. */
export const percent = (f: number): `${number}%` => `${Math.max(0, Math.min(100, f * 100))}%`;

/** Where each dot of a sparkline sits (dots are 8 pt): left to right, higher is better; one dot is centred. */
export function dotPositions(values: readonly number[], { max = 100, width = 120, height = 30 } = {}): { left: number; bottom: number }[] {
  const n = values.length;
  return values.map((v, i) => ({
    left: n === 1 ? width / 2 - 4 : (i / (n - 1)) * (width - 8),
    bottom: (Math.max(0, Math.min(max, v)) / max) * (height - 8),
  }));
}

export type LadderRung = { bpm: number; at: boolean; start: boolean; goal: boolean };
export type RungLook = { bpm: number; height: number; fill: 'none' | 'done' | 'at' | 'goal'; dashed: boolean };

/** The tempo ladder's rungs: growing 9 → 27 pt, green below the one you're on, yellow on it, the goal white, the start dashed. */
export function rungLooks(rungs: readonly LadderRung[]): RungLook[] {
  const at = rungs.find(r => r.at)?.bpm;
  return rungs.map((r, k) => {
    const below = at !== undefined && r.bpm < at;
    return {
      bpm: r.bpm,
      height: 9 + (k * 18) / Math.max(1, rungs.length - 1),
      fill: r.at ? 'at' : below ? 'done' : r.goal ? 'goal' : 'none',
      dashed: r.start && !r.at && !below,
    };
  });
}

/** A line split around the server's host, so the host can be drawn in mono (plain text otherwise: no markup). */
export function splitHost(line: string, host?: string): { before: string; host: string; after: string } | null {
  if (!host || !line.includes(host)) return null;
  const [before, ...rest] = line.split(host);
  return { before: before ?? '', host, after: rest.join(host) };
}
