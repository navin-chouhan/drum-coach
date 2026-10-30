// scripts/check-deps.mjs --project: a throwaway repo in a temp dir, and a fake registry passed in (no network).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDeps, findProjects, report } from './check-deps.mjs';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const DAY = 86400000;
const hash = id => `sha512-${Buffer.from(id).toString('base64')}`;
const tarball = (name, version) => `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`;

let root;
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = undefined; });

const write = (file, data) => {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
};

/**
 * A repo with a root workspace (packages/core) and one sub-project (apps/app) that links to it.
 * installed: name → { version, ...extra lockfile fields }; the project's package.json depends on `deps`.
 */
function makeRepo({ deps, devDeps, installed, allow, npmrc = 'ignore-scripts=true\nmin-release-age=7\n', lockPatch } = {}) {
  root = mkdtempSync(join(tmpdir(), 'check-deps-'));
  write(join(root, 'package.json'), { name: 'repo', private: true, workspaces: ['packages/*'] });
  write(join(root, 'packages/core/package.json'), { name: '@repo/core', version: '0.1.0', private: true, dependencies: { zod: '^4.6.7' } });
  const dir = join(root, 'apps/app');
  const dependencies = deps ?? { '@repo/core': 'file:../../packages/core', 'react-native': '0.88.0', zod: '^4.6.7' };
  const pkg = { name: 'app', version: '0.1.0', private: true, dependencies, ...(devDeps ? { devDependencies: devDeps } : {}) };
  write(join(dir, 'package.json'), pkg);
  const packages = { '': { name: 'app', version: '0.1.0', dependencies, ...(devDeps ? { devDependencies: devDeps } : {}) } };
  if (dependencies['@repo/core']) {
    packages['../../packages/core'] = { name: '@repo/core', version: '0.1.0', dependencies: { zod: '^4.6.7' } };
    packages['node_modules/@repo/core'] = { resolved: '../../packages/core', link: true };
  }
  for (const [name, { version, ...extra }] of Object.entries(installed ?? { 'react-native': { version: '0.88.0' }, zod: { version: '4.6.7' } })) {
    packages[`node_modules/${name}`] = { version, resolved: tarball(name, version), integrity: hash(`${name}@${version}`), ...extra };
  }
  const lock = { name: 'app', lockfileVersion: 3, requires: true, packages };
  lockPatch?.(lock);
  write(join(dir, 'package-lock.json'), lock);
  if (npmrc !== null) write(join(dir, '.npmrc'), npmrc);
  if (allow !== undefined) write(join(dir, 'deps-allow.json'), allow);
  return dir;
}

/** A fake registry: name → version → { days (age), deprecated?, integrity? }. Counts the documents read. */
function fakeRegistry(versions = {}) {
  const calls = [];
  const getPackument = async name => {
    calls.push(name);
    const byVersion = versions[name] ?? { [name === 'zod' ? '4.6.7' : '0.88.0']: {} };
    const doc = { name, versions: {}, time: {} };
    for (const [version, { days = 30, deprecated, integrity } = {}] of Object.entries(byVersion)) {
      doc.versions[version] = { dist: { integrity: integrity ?? hash(`${name}@${version}`) }, ...(deprecated ? { deprecated } : {}) };
      doc.time[version] = new Date(NOW - days * DAY).toISOString();
    }
    return doc;
  };
  return { getPackument, calls };
}

const ZERO = { zeroMajor: { 'react-native@0.88.0': 'React Native has no 1.0' } };
const run = (registry = fakeRegistry()) => checkDeps({ root, project: 'apps/app', getPackument: registry.getPackument, now: NOW });

describe('check-deps --project', () => {
  it('passes a clean project: a link to a root workspace, a listed 0.x spec, aged registry packages', async () => {
    makeRepo({ allow: ZERO });
    const registry = fakeRegistry();
    const result = await run(registry);
    expect(result.problems).toEqual([]);
    expect(result).toMatchObject({ label: 'apps/app', locked: 2, checkedOnline: 2, allowed: ['react-native@0.88.0'] });
    expect(report(result)).toEqual({ ok: true, text: expect.stringContaining('✓ dependency check (apps/app): 2 packages') });
    // Verified versions are cached in the project: the next run needs no registry.
    const again = fakeRegistry();
    expect((await run(again)).problems).toEqual([]);
    expect(again.calls).toEqual([]);
  });

  it('rejects a 0.x spec that zeroMajor does not list, and a zeroMajor entry nothing uses', async () => {
    makeRepo({ allow: { zeroMajor: { 'react-native-worklets@0.13.0': 'stale' } } });
    const { problems } = await run();
    expect(problems).toEqual([
      expect.stringMatching(/^apps\/app\/package\.json dependencies\.react-native: 0\.88\.0 is a 0\.x release.*list react-native@0\.88\.0 in zeroMajor in apps\/app\/deps-allow\.json/),
      'apps/app/deps-allow.json zeroMajor lists react-native-worklets@0.13.0, which no package.json spec uses; remove it',
    ]);
  });

  it('allows file: links only to a root workspace of the same name', async () => {
    makeRepo({ deps: { '@repo/core': 'file:../../packages/core', other: 'file:../../../elsewhere', '@repo/fake': 'file:../../packages/core' }, installed: {} });
    const { problems } = await run();
    expect(problems.filter(p => p.includes('links to something other'))).toEqual([
      expect.stringMatching(/^apps\/app\/package\.json dependencies\.other: "file:\.\.\/\.\.\/\.\.\/elsewhere"/),
      expect.stringMatching(/^apps\/app\/package\.json dependencies\.@repo\/fake:/),
    ]);
  });

  it('checks the linked workspace too, and rejects links in the lockfile to anything else', async () => {
    makeRepo({
      allow: ZERO,
      lockPatch: lock => { lock.packages['node_modules/evil'] = { resolved: '../../../evil', link: true }; },
    });
    write(join(root, 'packages/core/package.json'), { name: '@repo/core', version: '0.1.0', dependencies: { zod: 'latest' } });
    const { problems } = await run();
    expect(problems).toEqual([
      'packages/core/package.json dependencies.zod: "latest" is not a stable semver range (use ^x.y.z with a released version)',
      'packages/core/package.json: a workspace must be "private": true (it is never published)',
      'node_modules/evil: linked/workspace package; only registry packages are allowed',
    ]);
  });

  it('rejects a version younger than 7 days unless young lists it, and a young entry no longer installed', async () => {
    makeRepo({ allow: ZERO });
    const young = fakeRegistry({ zod: { '4.6.7': { days: 3.2 } } });
    expect((await run(young)).problems).toEqual([
      'zod@4.6.7: published 3.2 days ago; wait until it is 7 days old (or pin the previous version, or list it in young in apps/app/deps-allow.json with a reason)',
    ]);
    makeRepo({ allow: { ...ZERO, young: { 'zod@4.6.7': 'urgent fix', 'zod@4.6.6': 'stale' } } });
    expect((await run(young)).problems).toEqual(['apps/app/deps-allow.json young lists zod@4.6.6, which is no longer installed; remove it']);
  });

  it('rejects deprecated versions and a lockfile hash that differs from the registry', async () => {
    makeRepo({ allow: ZERO });
    const registry = fakeRegistry({ zod: { '4.6.7': { deprecated: 'use 4.6.8' } }, 'react-native': { '0.88.0': { integrity: 'sha512-other' } } });
    expect((await run(registry)).problems.sort()).toEqual([
      'react-native@0.88.0: lockfile hash differs from the registry\'s; the lockfile may have been tampered with',
      'zod@4.6.7: deprecated: use 4.6.8',
    ]);
    const deprecatedOk = fakeRegistry({ zod: { '4.6.7': { deprecated: 'use 4.6.8' } } });
    makeRepo({ allow: { ...ZERO, deprecated: { 'zod@4.6.7': 'no replacement yet' } } });
    expect((await run(deprecatedOk)).problems).toEqual([]);
  });

  it('allowlists install scripts and prereleases by exact name@version only', async () => {
    const installed = { 'react-native': { version: '0.88.0' }, zod: { version: '4.6.7' }, fsevents: { version: '2.3.3', hasInstallScript: true, optional: true }, gensync: { version: '1.0.0-beta.2' } };
    const registry = fakeRegistry({ fsevents: { '2.3.3': {} }, gensync: { '1.0.0-beta.2': {} } });
    makeRepo({ allow: { ...ZERO, installScript: { fsevents: 'by name is not enough' } }, installed });
    expect((await run(registry)).problems).toEqual([
      'apps/app/deps-allow.json installScript.fsevents: use an exact name@version (a new version must be looked at again)',
      'fsevents@2.3.3: has an install script; review it, then add it to installScript in apps/app/deps-allow.json',
      'gensync@1.0.0-beta.2: not a stable release (prerelease or build tag)',
    ]);
    makeRepo({ allow: { ...ZERO, installScript: { 'fsevents@2.3.3': 'prebuilt', 'esbuild@0.25.0': 'stale' }, prerelease: { 'gensync@1.0.0-beta.2': 'babel' } }, installed });
    expect((await run(registry)).problems).toEqual(['apps/app/deps-allow.json installScript lists esbuild@0.25.0, which is not installed with an install script; remove it']);
  });

  it('rejects an unknown list, a missing reason and invalid JSON in deps-allow.json', async () => {
    makeRepo({ allow: { ...ZERO, youngs: {}, young: { 'zod@4.6.7': '' } } });
    expect((await run()).problems).toEqual([
      'apps/app/deps-allow.json: unknown list "youngs" (the lists are prerelease, young, deprecated, zeroMajor, installScript)',
      'apps/app/deps-allow.json young.zod@4.6.7: give the reason it is allowed',
    ]);
    makeRepo({ allow: '{ not json' });
    expect((await run()).problems[0]).toMatch(/^apps\/app\/deps-allow\.json: not valid JSON/);
  });

  it('requires ignore-scripts=true in the project\'s own .npmrc', async () => {
    makeRepo({ allow: ZERO, npmrc: null });
    expect((await run()).problems).toEqual([expect.stringMatching(/^apps\/app\/\.npmrc: must set ignore-scripts=true/)]);
    makeRepo({ allow: ZERO, npmrc: '# ignore-scripts=true\nignore-scripts=false\n' });
    expect((await run()).problems).toHaveLength(1);
  });

  it('reports a lockfile out of date with package.json, and a missing lockfile', async () => {
    makeRepo({ allow: ZERO, lockPatch: lock => { lock.packages[''].dependencies = { zod: '^4.6.7' }; } });
    expect((await run()).problems).toEqual(['apps/app/package-lock.json is out of date with apps/app/package.json (dependencies); run npm install']);
    rmSync(join(root, 'apps/app/package-lock.json'));
    expect((await run()).problems).toEqual(['apps/app/package-lock.json: missing; run npm install there']);
  });

  it('retries the registry three times, then reports it as offline without caching', async () => {
    makeRepo({ allow: ZERO });
    let calls = 0;
    const down = async () => { calls++; throw new Error('getaddrinfo ENOTFOUND'); };
    const result = await checkDeps({ root, project: 'apps/app', getPackument: down, now: NOW });
    expect(calls).toBe(6); // two packages × three attempts
    expect(result.offline).toBe(true);
    expect(result.problems).toContain("zod: couldn't read the registry (getaddrinfo ENOTFOUND); this check needs the network once per new version");
    expect(report(result).text).toContain('(offline? versions already verified are cached');
    const missing = await checkDeps({ root, project: 'apps/app', getPackument: async () => null, now: NOW });
    expect(missing.problems).toEqual(['react-native: not on the registry', 'zod: not on the registry']);
  });

  it('refuses a project dir outside the repo, or the root itself', async () => {
    makeRepo({ allow: ZERO });
    expect((await checkDeps({ root, project: '..', getPackument: fakeRegistry().getPackument })).problems).toEqual(['--project ..: must be a sub-directory of this repo']);
    expect((await checkDeps({ root, project: '.', getPackument: fakeRegistry().getPackument })).problems).toEqual(['--project .: must be a sub-directory of this repo']);
  });

  it('root mode keeps its rules: no file: links, deps-allow.json is not read', async () => {
    makeRepo();
    write(join(root, 'package.json'), { name: 'repo', private: true, workspaces: ['packages/*'], dependencies: { app: 'file:apps/app' } });
    write(join(root, 'deps-allow.json'), ZERO);
    write(join(root, 'package-lock.json'), { lockfileVersion: 3, packages: { '': { dependencies: { app: 'file:apps/app' } } } });
    const { problems, label } = await checkDeps({ root, getPackument: fakeRegistry().getPackument, now: NOW });
    expect(label).toBe('');
    expect(problems[0]).toBe('package.json dependencies.app: "file:apps/app" is not a stable semver range (use ^x.y.z with a released version)');
  });
});

describe('findProjects', () => {
  it('finds sub-directories with their own lockfile, skipping node_modules and dot dirs', () => {
    makeRepo();
    write(join(root, 'spikes/probe/tools/package-lock.json'), {});
    write(join(root, 'apps/app/node_modules/dep/package-lock.json'), {});
    write(join(root, '.claude/worktrees/x/package-lock.json'), {});
    write(join(root, 'package-lock.json'), {});
    expect(findProjects(root)).toEqual(['apps/app', 'spikes/probe/tools']);
  });
});
