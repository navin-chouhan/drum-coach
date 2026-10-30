import { describe, expect, it } from 'vitest';
import { migrate, serverIsNewer, type Settings } from './settings';

describe('settings start-up merge', () => {
  it('keeps progress made while the server was down', () => {
    expect(serverIsNewer({ updatedAt: 2000 }, { updatedAt: 1000 })).toBe(false);
  });
  it('takes the server copy when it is newer, the same, or the browser has none', () => {
    expect(serverIsNewer({ updatedAt: 1000 }, { updatedAt: 2000 })).toBe(true);
    expect(serverIsNewer({}, {})).toBe(true);
    expect(serverIsNewer({}, undefined)).toBe(false);
  });
});

describe('settings migration', () => {
  it('v3 quiets the coach: voice tips go on screen, hands-free listening off', () => {
    expect(migrate({ v: 2, liveTips: 'voice', handsFree: true } as Settings)).toMatchObject({ v: 3, liveTips: 'screen', handsFree: false });
    expect(migrate({ v: 2, liveTips: 'off', handsFree: true } as Settings).liveTips).toBe('off');
    expect(migrate({ v: 3, liveTips: 'voice', handsFree: true } as Settings)).toMatchObject({ liveTips: 'voice', handsFree: true }); // a choice made after v3 stays
  });
});
