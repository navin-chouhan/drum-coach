// scripts/check-expo-versions.mjs against fake node_modules trees, including the Gate 0 crash.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../../../scripts/check-expo-versions.mjs', import.meta.url));
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Pkg = { version: string; name?: string; ios?: boolean; prebuilt?: boolean; at?: string };

function app(expoVersion: string, bundled: Record<string, string>, pkgs: Record<string, Pkg>) {
  const root = mkdtempSync(join(tmpdir(), 'check-expo-'));
  dirs.push(root);
  const put = (dir: string, name: string, p: Pkg) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: p.version }));
    if (p.ios) mkdirSync(join(dir, 'ios'));
    if (p.prebuilt) mkdirSync(join(dir, 'prebuilds'));
  };
  put(join(root, 'node_modules/expo'), 'expo', { version: expoVersion });
  writeFileSync(join(root, 'node_modules/expo/bundledNativeModules.json'), JSON.stringify(bundled));
  for (const [key, p] of Object.entries(pkgs)) {
    const name = p.name ?? key;
    put(join(root, p.at ?? 'node_modules', name), name, p);
  }
  const r = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

describe('check-expo-versions', () => {
  it('passes a consistent set', () => {
    const r = app('58.0.17', { 'expo-file-system': '~58.0.10', 'expo-modules-core': '~58.0.24', 'react-native': '0.88.0' }, {
      'expo-file-system': { version: '58.0.10', ios: true, prebuilt: true },
      'expo-modules-core': { version: '58.0.24', ios: true },
      'react-native': { version: '0.88.0', ios: true },
    });
    expect(r.out).toContain('OK');
    expect(r.code).toBe(0);
  });

  it('fails the Gate 0 crash: a prebuilt expo-file-system newer than the SDK patch names', () => {
    const r = app('58.0.19', { 'expo-file-system': '~58.0.11', 'expo-modules-core': '~58.0.26' }, {
      'expo-file-system': { version: '58.0.12', ios: true, prebuilt: true },
      'expo-modules-core': { version: '58.0.26', ios: true },
    });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/expo-file-system@58\.0\.12 .*prebuilt/);
  });

  it('fails a version outside the range, and a native package installed twice', () => {
    const r = app('58.0.17', { 'react-native-worklets': '0.13.0', 'expo-modules-core': '~58.0.24' }, {
      'react-native-worklets': { version: '0.13.1', ios: true },
      'expo-modules-core': { version: '58.0.24', ios: true },
      'expo-router': { version: '58.0.25' },
      nested: { name: 'expo-modules-core', version: '58.0.24', ios: true, at: 'node_modules/expo-router/node_modules' },
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('react-native-worklets@0.13.1');
    expect(r.out).toContain('expo-modules-core is installed more than once');
  });
});
