import { describe, expect, it } from 'vitest';
import { speechVolume } from './voiceVolume';

describe('speechVolume (QA3 m4)', () => {
  it('passes the setting through, tops out at the system voice\'s 1, and defaults to 1', () => {
    expect(speechVolume(0.6)).toBe(0.6);
    expect(speechVolume(0.2)).toBe(0.2);
    expect(speechVolume(1.25)).toBe(1);
    expect(speechVolume(undefined)).toBe(1);
    expect(speechVolume(Number.NaN)).toBe(1);
    expect(speechVolume(-1)).toBe(0);
  });
});
