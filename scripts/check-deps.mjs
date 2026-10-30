#!/usr/bin/env node
// Supply-chain gate: only stable, aged, registry-signed dependencies get into this repo. No new dependency: Node's
// built-in fetch against the public npm registry. Runs in `npm run check`, the pre-push hook and CI.
//
//   npm run deps:check
//
// package.json (and each workspace's): every spec is a plain semver range on a stable release (^1.2.3, ~1.2.3 or 1.2.3; major >= 1). No
// tags (latest, next), no *, no git/URL/file/alias specs, no prereleases.
// package-lock.json: every package comes from registry.npmjs.org as a tarball of exactly that name and version, with
// a sha512 hash that matches the one the registry publishes; no prereleases, no aliases, no links except this repo's
// own private workspaces (packages/*: first-party code, not downloaded; their dependencies are checked); only allowlisted
// packages may carry install scripts (and .npmrc has ignore-scripts=true anyway); every version is at least
// MIN_AGE_DAYS old (a hijacked package is usually caught and pulled within days) and not deprecated.
// Each name@version that passed is cached (a published version never changes), so only lockfile changes need the
// network. Exits 1 with a list of problems.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MIN_AGE_DAYS = 7;
const REGISTRY = 'https://registry.npmjs.org/';
// name@version → why it's allowed. Keep these exact: a new version must be looked at again.
const ALLOW_PRERELEASE = {
  'gensync@1.0.0-beta.2': "Babel's own dependency (via @vitejs/plugin-react, dev only); it is gensync's latest release, unchanged since 2020",
};
const ALLOW_DEPRECATED = {};
// Younger than MIN_AGE_DAYS on purpose (e.g. an urgent security fix). Same rule: exact versions, with a reason.
const ALLOW_YOUNG = {
  '@anthropic-ai/sdk@1.3.0': "Anthropic's official SDK; all of 1.x is younger than 7 days (1.0.0 is from 2026-10-21) and the code uses the 1.x API. Remove once Dependabot moves past it",
};
// Packages that declare install scripts. .npmrc sets ignore-scripts=true, so even these don't run; the list exists so
// a new package that needs a script (and would break, or wants to run code at install time) gets looked at.
const ALLOW_INSTALL_SCRIPT = {
  fsevents: 'macOS-only optional file watcher for Vite (dev only); ships a prebuilt binary, works without its script',
};

const root = new URL('..', import.meta.url).pathname;
const cacheFile = join(root, 'node_modules/.cache/check-deps/verified.json');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const problems = [];
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// --- package.json -------------------------------------------------------------------------------------------------
// This repo's own workspaces: directories named exactly in package.json "workspaces" (a trailing /* = its subfolders).
const workspaces = new Map(); // dir (e.g. packages/core) → its package.json
for (const glob of pkg.workspaces ?? []) {
  const dirs = glob.endsWith('/*') ? readdirSync(join(root, glob.slice(0, -2)), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => `${glob.slice(0, -2)}/${d.name}`) : [glob];
  for (const dir of dirs) {
    try { workspaces.set(dir, JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))); } catch { /* not a package */ }
  }
}
const checkSpecs = (where, p) => {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides']) {
    for (const [name, spec] of Object.entries(p[field] ?? {})) {
      const m = typeof spec === 'string' && /^[\^~]?(.+)$/.exec(spec);
      if (!m || !STABLE.test(m[1])) problems.push(`${where} ${field}.${name}: ${JSON.stringify(spec)} is not a stable semver range (use ^x.y.z with a released version)`);
      else if (m[1].startsWith('0.')) problems.push(`${where} ${field}.${name}: ${spec} is a 0.x release (no stable API yet); pick a 1.0+ package`);
    }
  }
};
checkSpecs('package.json', pkg);
for (const [dir, p] of workspaces) {
  checkSpecs(`${dir}/package.json`, p);
  if (p.private !== true) problems.push(`${dir}/package.json: a workspace must be "private": true (it is never published)`);
  if (p.scripts && Object.keys(p.scripts).some(k => /^(pre|post)?install$|^prepare$/.test(k))) problems.push(`${dir}/package.json: workspaces may not have install scripts`);
}
if (pkg.bundleDependencies || pkg.bundledDependencies) problems.push('package.json: bundled dependencies skip the lockfile checks; remove them');

// --- package-lock.json --------------------------------------------------------------------------------------------
if (lock.lockfileVersion !== 3) problems.push(`package-lock.json: lockfileVersion ${lock.lockfileVersion}, expected 3 (npm 9+)`);
const rootEntry = lock.packages?.[''] ?? {};
for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  if (JSON.stringify(rootEntry[field] ?? {}) !== JSON.stringify(pkg[field] ?? {})) problems.push(`package-lock.json is out of date with package.json (${field}); run npm install`);
}
const locked = new Map(); // name@version → integrity
for (const [path, e] of Object.entries(lock.packages ?? {})) {
  if (path === '') continue;
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const id = `${name}@${e.version}`;
  if (workspaces.has(path) && !e.link && !e.resolved) continue; // the workspace itself (its specs are checked above)
  if (e.link && workspaces.has(e.resolved) && path === `node_modules/${workspaces.get(e.resolved).name}`) continue; // its link
  if (e.link || !path.startsWith('node_modules/')) { problems.push(`${path}: linked/workspace package; only registry packages are allowed`); continue; }
  if (e.name && e.name !== name) problems.push(`${path}: npm alias for ${e.name}; aliases hide what is installed`);
  if (!STABLE.test(e.version ?? '') && !ALLOW_PRERELEASE[id]) problems.push(`${id}: not a stable release (prerelease or build tag)`);
  const tarball = `${REGISTRY}${name}/-/${name.split('/').pop()}-${e.version}.tgz`;
  if (e.resolved !== tarball) problems.push(`${id}: resolved from ${e.resolved}, expected ${tarball}`);
  if (!/^sha512-[A-Za-z0-9+/]+=*$/.test(e.integrity ?? '')) problems.push(`${id}: no sha512 integrity hash`);
  if (e.hasInstallScript && !ALLOW_INSTALL_SCRIPT[name]) problems.push(`${id}: has an install script; review it, then add it to ALLOW_INSTALL_SCRIPT in scripts/check-deps.mjs`);
  locked.set(id, e.integrity);
}
for (const [list, allowed] of Object.entries({ ALLOW_PRERELEASE, ALLOW_DEPRECATED, ALLOW_YOUNG })) {
  for (const id of Object.keys(allowed)) if (!locked.has(id)) problems.push(`${list} lists ${id}, which is no longer installed; remove it`);
}

// --- registry: age, deprecation, integrity ------------------------------------------------------------------------
let verified = {};
try { verified = JSON.parse(readFileSync(cacheFile, 'utf8')); } catch { /* first run */ }
const todo = [...locked].filter(([id, integrity]) => verified[id] !== integrity);
const byName = Map.groupBy(todo, ([id]) => id.slice(0, id.lastIndexOf('@')));
const now = Date.now();
let offline = false;
async function checkName(name, entries) {
  let doc;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(REGISTRY + name.replaceAll('/', '%2F'), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
      if (r.status === 404) { problems.push(`${name}: not on the registry`); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      doc = await r.json();
      break;
    } catch (err) {
      if (attempt < 2) continue;
      offline = true;
      problems.push(`${name}: couldn't read the registry (${err.message}); this check needs the network once per new version`);
      return;
    }
  }
  for (const [id, integrity] of entries) {
    const version = id.slice(id.lastIndexOf('@') + 1);
    const meta = doc.versions?.[version];
    const published = Date.parse(doc.time?.[version]);
    if (!meta || !published) { problems.push(`${id}: not on the registry (unpublished?)`); continue; }
    const days = (now - published) / 86400000;
    let ok = true;
    if (meta.dist?.integrity !== integrity) { ok = false; problems.push(`${id}: lockfile hash differs from the registry's; the lockfile may have been tampered with`); }
    if (days < MIN_AGE_DAYS && !ALLOW_YOUNG[id]) { ok = false; problems.push(`${id}: published ${days.toFixed(1)} days ago; wait until it is ${MIN_AGE_DAYS} days old (or pin the previous version)`); }
    if (meta.deprecated && !ALLOW_DEPRECATED[id]) { ok = false; problems.push(`${id}: deprecated: ${meta.deprecated}`); }
    if (ok) verified[id] = integrity;
  }
}
const queue = [...byName];
await Promise.all(Array.from({ length: 12 }, async () => { for (let next; (next = queue.shift());) await checkName(...next); }));
mkdirSync(dirname(cacheFile), { recursive: true });
writeFileSync(cacheFile, JSON.stringify(verified));

if (problems.length) {
  console.error(`✖ dependency check: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  for (const p of problems) console.error(`  - ${p}`);
  if (offline) console.error('  (offline? versions already verified are cached; only new ones need the registry)');
  process.exit(1);
}
const allowed = Object.keys({ ...ALLOW_PRERELEASE, ...ALLOW_DEPRECATED, ...ALLOW_YOUNG });
console.log(`✓ dependency check: ${locked.size} packages are stable, from the npm registry, hash-matched and ≥ ${MIN_AGE_DAYS} days old (${todo.length} checked online${allowed.length ? `; allowlisted: ${allowed.join(', ')}` : ''})`);
