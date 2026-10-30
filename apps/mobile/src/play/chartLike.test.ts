// Pins the play surfaces' web look to the web app, which keeps its own copies: drum colours and names
// (src/ui/drums.ts) and the falling highway's lane order (src/play/Highway.tsx). Reads the source text, so it needs no
// web dependency. The chart and kit types come from @drum-coach/core, so they need no pinning.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DRUM_IDS, DRUM_NAME, PAD_DRUM } from './chartLike';
import { KIT_LANES } from './geometry';
import { WEB_THEME } from './theme';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (path: string, marker: string): string | null => {
  const p = resolve(repo, path);
  if (!existsSync(p)) return null;
  const text = readFileSync(p, 'utf8');
  return text.includes(marker) ? text : null;
};
const drumsTs = read('src/ui/drums.ts', 'DRUMS: DrumGfx[]');
const highwayTs = read('src/play/Highway.tsx', 'HIGHWAY_LANES');

describe('the web look', () => {
  it('src/ui/drums.ts and src/play/Highway.tsx are where this test expects them', () => {
    expect(drumsTs).not.toBeNull();
    expect(highwayTs).not.toBeNull();
  });
  it.skipIf(!drumsTs)('WEB_THEME drum colours and the lane names match src/ui/drums.ts', () => {
    for (const id of DRUM_IDS) {
      expect(drumsTs!).toMatch(new RegExp(`id: '${id}', name: '${DRUM_NAME[id]}',[^}]*color: '${WEB_THEME.drum[id]}'`));
    }
  });
  it.skipIf(!highwayTs)('KIT_LANES matches the web highway order', () => {
    const m = /HIGHWAY_LANES[^=]*=\s*\[([^\]]*)\]/.exec(highwayTs!);
    expect([...KIT_LANES]).toEqual([...m![1].matchAll(/'([^']+)'/g)].map(x => x[1]));
  });
});

describe('derived from the core', () => {
  it('puts the three hi-hat pads in the hi-hat lane', () => {
    expect([PAD_DRUM.hhClosed, PAD_DRUM.hhOpen, PAD_DRUM.hhPedal]).toEqual(['hihat', 'hihat', 'hihat']);
    expect(PAD_DRUM.floor).toBe('floor');
  });
});
