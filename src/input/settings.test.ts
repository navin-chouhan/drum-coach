import { describe, expect, it } from 'vitest';
import { serverIsNewer } from './settings';

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
