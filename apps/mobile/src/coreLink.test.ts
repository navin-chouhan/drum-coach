import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Clock } from '@drum-coach/core/platform';

const kitFile = fileURLToPath(new URL('../../../packages/core/src/engine/kit.ts', import.meta.url));

describe('@drum-coach/core link', () => {
  it('resolves @drum-coach/core/platform (package exports -> src/platform.ts)', async () => {
    const platform: object = await import('@drum-coach/core/platform');
    expect(platform).toBeTypeOf('object');
    const clock: Clock = { now: () => 42 };
    expect(clock.now()).toBe(42);
  });

  // Activates once A1 has moved the engine into packages/core.
  it.skipIf(!existsSync(kitFile))('reads DEFAULT_NOTE_MAP.snare from @drum-coach/core/engine/kit', async () => {
    const id = '@drum-coach/core/engine/kit';
    const kit = (await import(/* @vite-ignore */ id)) as { DEFAULT_NOTE_MAP: { snare: number } };
    expect(kit.DEFAULT_NOTE_MAP.snare).toBe(38);
  });
});
