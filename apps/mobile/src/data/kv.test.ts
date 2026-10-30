import { describe, expect, it, vi } from 'vitest';
import { createKv, KV_KEYS } from './kv';
import { migrate } from './schema';
import type { SqlDb } from './sql';
import { openTestDb } from './nodeSqlite.testutil';

const fresh = () => { const db = openTestDb(); migrate(db); return db; };

describe('createKv', () => {
  it('keeps the web keys', () => {
    expect(KV_KEYS.settings).toBe('drumcoach.settings');
    expect(KV_KEYS.noteMap('e-Drum')).toBe('drumcoach.noteMap.e-Drum');
    expect(KV_KEYS.padCal('e-Drum')).toBe('drumcoach.padCal.e-Drum');
  });

  it('stores, reads back after reopening, and removes', () => {
    const db = fresh();
    createKv(db).set(KV_KEYS.settings, '{"latencyMs":12}');
    const again = createKv(db); // a new session on the same database
    expect(again.get(KV_KEYS.settings)).toBe('{"latencyMs":12}');
    again.remove(KV_KEYS.settings);
    expect(again.get(KV_KEYS.settings)).toBeNull();
    expect(createKv(db).get(KV_KEYS.settings)).toBeNull();
    expect(again.get('missing')).toBeNull();
  });

  it('lists keys by prefix, including % and _ in kit names', () => {
    const db = fresh();
    const kv = createKv(db);
    kv.set(KV_KEYS.noteMap('e-Drum'), '{}');
    kv.set(KV_KEYS.noteMap('kit_%1'), '{}');
    kv.set(KV_KEYS.padCal('e-Drum'), '{}');
    expect(kv.keys('drumcoach.noteMap.')).toEqual(['drumcoach.noteMap.e-Drum', 'drumcoach.noteMap.kit_%1']);
    kv.remove(KV_KEYS.noteMap('e-Drum'));
    expect(kv.keys('drumcoach.noteMap.')).toEqual(['drumcoach.noteMap.kit_%1']);
    expect(kv.keys('drumcoach.noteMap_')).toEqual([]);
  });

  it('never throws: a broken database keeps this session in memory and logs once, without the value', () => {
    const boom = () => { throw new Error('disk I/O error'); };
    const broken = { getFirstSync: boom, runSync: boom, getAllSync: boom } as unknown as SqlDb;
    const log = vi.fn();
    const kv = createKv(broken, log);
    expect(kv.get('a')).toBeNull();
    expect(() => kv.set('a', 'secret-ish value')).not.toThrow();
    expect(kv.get('a')).toBe('secret-ish value');
    kv.remove('a');
    expect(kv.get('a')).toBeNull();
    expect(kv.keys('a')).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).not.toContain('secret-ish');
  });

  it('works memory-only without a database', () => {
    const kv = createKv(null);
    kv.set('x', '1');
    expect(kv.get('x')).toBe('1');
    expect(kv.keys('')).toEqual(['x']);
  });
});
