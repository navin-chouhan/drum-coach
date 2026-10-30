// Pins the local mirrors (chartLike.ts, WEB_THEME) to the web's sources until A1 lands the core and they're swapped
// for imports. Reads the source text, so it needs no web dependency; once a file becomes a shim it is skipped.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHART_DRUMS, DRUM_IDS, PAD_DRUM, PADS } from './chartLike';
import { KIT_LANES } from './geometry';
import { WEB_THEME } from './theme';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
/** The first of the candidate files that still declares `marker`. */
function source(candidates: string[], marker: string): string | null {
  for (const c of candidates) {
    const p = resolve(repo, c);
    if (existsSync(p)) {
      const text = readFileSync(p, 'utf8');
      if (text.includes(marker)) return text;
    }
  }
  return null;
}
const list = (text: string, decl: string): string[] => {
  const m = new RegExp(`${decl}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(text);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
};

const chartTs = source(['packages/core/src/engine/chart.ts', 'src/engine/chart.ts'], 'CHART_DRUMS =');
const kitTs = source(['packages/core/src/engine/kit.ts', 'src/engine/kit.ts'], 'PADS =');
const drumsTs = source(['src/ui/drums.ts'], 'DRUMS: DrumGfx[]');
const highwayTs = source(['src/play/Highway.tsx'], 'HIGHWAY_LANES');

describe('mirrors of the web types', () => {
  it.skipIf(!chartTs)('CHART_DRUMS matches src/engine/chart.ts', () => {
    expect([...CHART_DRUMS]).toEqual(list(chartTs!, 'CHART_DRUMS'));
  });
  it.skipIf(!kitTs)('PADS, DrumId and the pad → drum map match src/engine/kit.ts', () => {
    expect([...PADS]).toEqual(list(kitTs!, 'export const PADS'));
    const drumIds = /export type DrumId = ([^;]+);/.exec(kitTs!)![1].match(/'([^']+)'/g)!.map(s => s.slice(1, -1));
    expect([...DRUM_IDS].sort()).toEqual(drumIds.sort());
    for (const pad of PADS) expect(kitTs!).toMatch(new RegExp(`${pad}: \\{ name: '[^']+', drum: '${PAD_DRUM[pad]}'`));
  });
  it.skipIf(!drumsTs)('WEB_THEME drum colours match src/ui/drums.ts', () => {
    for (const id of DRUM_IDS) expect(drumsTs!).toMatch(new RegExp(`id: '${id}',[^}]*color: '${WEB_THEME.drum[id]}'`));
  });
  it.skipIf(!highwayTs)('KIT_LANES matches the web highway order', () => {
    expect([...KIT_LANES]).toEqual(list(highwayTs!, 'HIGHWAY_LANES'));
  });
});
