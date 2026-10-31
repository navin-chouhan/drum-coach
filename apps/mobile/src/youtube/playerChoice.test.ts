import { describe, expect, it } from 'vitest';
import { choosePlayer, NATIVE_YT_DEV_KEY, readDevNative } from './playerChoice';

describe('which YouTube player (YOUTUBE-RELEASE.md option A)', () => {
  it('Release: the native player when the build has it, else the DOM one', () => {
    expect(choosePlayer({ nativeAvailable: true, dev: false, devNative: false })).toBe('native');
    expect(choosePlayer({ nativeAvailable: false, dev: false, devNative: true })).toBe('dom');
  });
  it('dev: the DOM player (Metro serves it over http) unless the dev toggle asks for the native one', () => {
    expect(choosePlayer({ nativeAvailable: true, dev: true, devNative: false })).toBe('dom');
    expect(choosePlayer({ nativeAvailable: true, dev: true, devNative: true })).toBe('native');
  });
  it('reads the toggle, never throws', () => {
    expect(readDevNative({ get: k => (k === NATIVE_YT_DEV_KEY ? '1' : null) })).toBe(true);
    expect(readDevNative({ get: () => null })).toBe(false);
    expect(readDevNative({ get: () => { throw new Error('closed'); } })).toBe(false);
  });
});
