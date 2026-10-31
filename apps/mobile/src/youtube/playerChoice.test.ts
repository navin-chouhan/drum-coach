import { describe, expect, it } from 'vitest';
import { choosePlayer, NATIVE_YT_DEV_KEY, readDevNative, writeDevNative } from './playerChoice';

describe('which YouTube player (YOUTUBE-RELEASE.md option A)', () => {
  it('Release: the native player when the build has it, else the DOM one', () => {
    expect(choosePlayer({ nativeAvailable: true, dev: false, devNative: false })).toBe('native');
    expect(choosePlayer({ nativeAvailable: false, dev: false, devNative: true })).toBe('dom');
  });
  it('dev: the DOM player (Metro serves it over http) unless the dev toggle asks for the native one', () => {
    expect(choosePlayer({ nativeAvailable: true, dev: true, devNative: false })).toBe('dom');
    expect(choosePlayer({ nativeAvailable: true, dev: true, devNative: true })).toBe('native');
  });
  it('the dev switch writes it', () => {
    const m = new Map<string, string>();
    const kv = { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); } };
    expect(writeDevNative(kv, true)).toBe(true);
    expect(readDevNative(kv)).toBe(true);
    writeDevNative(kv, false);
    expect(readDevNative(kv)).toBe(false);
    expect(writeDevNative({ set: () => { throw new Error('closed'); } }, true)).toBe(false);
  });
  it('reads the toggle, never throws', () => {
    expect(readDevNative({ get: k => (k === NATIVE_YT_DEV_KEY ? '1' : null) })).toBe(true);
    expect(readDevNative({ get: () => null })).toBe(false);
    expect(readDevNative({ get: () => { throw new Error('closed'); } })).toBe(false);
  });
});
