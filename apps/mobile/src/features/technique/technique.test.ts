import { describe, expect, it } from 'vitest';
import { DEMO_IDS } from '@drum-coach/core/content/demos';
import { demoOptions, FIRST, START_BPM, TEMPOS } from './technique';

describe('Stick technique (web src/ui/TechniqueView.tsx)', () => {
  it('every movement, the grip first at 60 BPM, the web\'s tempos', () => {
    const o = demoOptions();
    expect(o.map(x => x.value)).toEqual(DEMO_IDS);
    expect(o[0]).toEqual({ value: 'grip', label: 'The grip' });
    expect(o.find(x => x.value === 'kick')?.label).toBe('Kick: heel down / heel up');
    expect([FIRST, START_BPM]).toEqual(['grip', 60]);
    expect(TEMPOS).toEqual([40, 50, 60, 70, 80, 100]);
  });
});
