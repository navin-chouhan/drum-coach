#!/usr/bin/env node
// Supply-chain gate: only stable, aged, registry-signed dependencies get into this repo. No new dependency: Node's
// built-in fetch against the public npm registry. Runs in `npm run check`, the pre-push hook and CI.
//
//   node scripts/check-deps.mjs                     the web root (package.json, package-lock.json, packages/*)
//   node scripts/check-deps.mjs --project <dir>     a sub-project with its own lockfile (e.g. apps/mobile)
//   node scripts/check-deps.mjs --projects          every sub-project that has its own package-lock.json (CI's mobile job)
//   node scripts/check-deps.mjs --all               the root, then --projects
//   npm run deps:check                              = --all
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
//
// --project <dir>: the same checks against <dir>/package.json and <dir>/package-lock.json, with these differences:
//   - the allowlists come from <dir>/deps-allow.json: { prerelease, young, deprecated, zeroMajor, installScript }, each
//     exact name@version → reason. Every entry must still be needed (a stale one is a problem). zeroMajor lets a
//     listed 0.x spec through (react-native has no 1.0): the key is the name and the spec's version, e.g.
//     react-native@0.88.0 for "0.88.0" or "^0.88.0".
//   - a `file:` spec may link to one of the root's private workspaces (packages/*), like the root's own workspace links.
//   - <dir>/.npmrc must set ignore-scripts=true: npm reads the .npmrc next to the package.json it runs in, so the
//     root's doesn't protect a sub-project.
//   - the cache of verified versions is <dir>/node_modules/.cache/check-deps/verified.json (one per project, so one
//     project's allowlist never vouches for another's).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MIN_AGE_DAYS = 7;
const REGISTRY = 'https://registry.npmjs.org/';
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
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

// The lists a sub-project's deps-allow.json may have.
export const LISTS = ['prerelease', 'young', 'deprecated', 'zeroMajor', 'installScript'];
const EXACT_ID = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/i;
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const toPosix = p => p.split(sep).join('/');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The registry's document for one package; null if it isn't there. Throws on network or HTTP errors. */
export async function fetchPackument(name) {
  const r = await fetch(REGISTRY + name.replaceAll('/', '%2F'), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// This repo's own workspaces: directories named exactly in package.json "workspaces" (a trailing /* = its subfolders).
function findWorkspaces(base, pkg) {
  const workspaces = new Map(); // dir (e.g. packages/core) → its package.json
  for (const glob of pkg.workspaces ?? []) {
    const dirs = glob.endsWith('/*') ? readdirSync(join(base, glob.slice(0, -2)), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => `${glob.slice(0, -2)}/${d.name}`) : [glob];
    for (const dir of dirs) {
      try { workspaces.set(dir, readJson(join(base, dir, 'package.json'))); } catch { /* not a package */ }
    }
  }
  return workspaces;
}

// A sub-project's deps-allow.json: only the known lists, exact name@version keys, and a reason for each.
function loadAllowlists(file, where, problems) {
  const allow = Object.fromEntries(LISTS.map(list => [list, {}]));
  if (!existsSync(file)) return allow;
  let raw;
  try { raw = readJson(file); } catch (err) { problems.push(`${where}: not valid JSON (${err.message})`); return allow; }
  if (!isObject(raw)) { problems.push(`${where}: must be an object of lists (${LISTS.join(', ')})`); return allow; }
  for (const [list, entries] of Object.entries(raw)) {
    if (!LISTS.includes(list)) { problems.push(`${where}: unknown list "${list}" (the lists are ${LISTS.join(', ')})`); continue; }
    if (!isObject(entries)) { problems.push(`${where} ${list}: must be an object of name@version → reason`); continue; }
    for (const [id, why] of Object.entries(entries)) {
      if (!EXACT_ID.test(id)) problems.push(`${where} ${list}.${id}: use an exact name@version (a new version must be looked at again)`);
      else if (typeof why !== 'string' || !why.trim()) problems.push(`${where} ${list}.${id}: give the reason it is allowed`);
      else allow[list][id] = why;
    }
  }
  return allow;
}

/**
 * Runs every check for the root (no `project`) or for one sub-project. Never exits; returns what it found.
 * @param {{ root?: string, project?: string, getPackument?: (name: string) => Promise<any>, now?: number }} [options]
 *   root: the repo root; project: a sub-project dir, relative to root; getPackument: reads the registry (injectable for
 *   tests); now: the clock, in ms.
 */
export async function checkDeps({ root = REPO_ROOT, project, getPackument = fetchPackument, now = Date.now() } = {}) {
  const dir = project ? resolve(root, project) : root;
  const label = project ? toPosix(relative(root, dir)) || '.' : '';
  const at = file => (label ? `${label}/${file}` : file);
  const problems = [];
  const result = extra => ({ label, problems, offline: false, locked: 0, checkedOnline: 0, allowed: [], ...extra });
  if (project && (label === '.' || label.startsWith('../') || label === '..')) {
    problems.push(`--project ${project}: must be a sub-directory of this repo`);
    return result();
  }
  for (const file of ['package.json', 'package-lock.json']) {
    if (!existsSync(join(dir, file))) { problems.push(`${at(file)}: missing${file === 'package-lock.json' ? '; run npm install there' : ''}`); }
  }
  if (problems.length) return result();

  const cacheFile = join(dir, 'node_modules/.cache/check-deps/verified.json');
  const pkg = readJson(join(dir, 'package.json'));
  const lock = readJson(join(dir, 'package-lock.json'));
  const allow = project
    ? loadAllowlists(join(dir, 'deps-allow.json'), at('deps-allow.json'), problems)
    : { prerelease: ALLOW_PRERELEASE, young: ALLOW_YOUNG, deprecated: ALLOW_DEPRECATED, zeroMajor: {}, installScript: ALLOW_INSTALL_SCRIPT };
  const allowFile = project ? at('deps-allow.json') : 'scripts/check-deps.mjs';
  const used = Object.fromEntries(LISTS.map(list => [list, new Set()]));

  if (project) {
    let npmrc = '';
    try { npmrc = readFileSync(join(dir, '.npmrc'), 'utf8'); } catch { /* missing */ }
    if (!/^[ \t]*ignore-scripts[ \t]*=[ \t]*true[ \t]*$/m.test(npmrc)) {
      problems.push(`${at('.npmrc')}: must set ignore-scripts=true (npm reads the .npmrc next to the package.json it runs in, so the root's doesn't apply here)`);
    }
  }

  // --- package.json -----------------------------------------------------------------------------------------------
  // Packages that may be links, by their path relative to `dir` as the lockfile writes it → their package.json:
  // the project's own workspaces, and for a sub-project also the root's (packages/*, reached with a file: spec).
  const workspaces = findWorkspaces(dir, pkg);
  const rootWorkspaces = new Map();
  if (project) {
    for (const [wsDir, p] of findWorkspaces(root, readJson(join(root, 'package.json')))) {
      const rel = toPosix(relative(dir, join(root, wsDir)));
      rootWorkspaces.set(rel, p);
      workspaces.set(rel, p);
    }
  }
  const checkSpecs = (where, p) => {
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides']) {
      for (const [name, spec] of Object.entries(p[field] ?? {})) {
        if (project && typeof spec === 'string' && spec.startsWith('file:')) {
          const target = rootWorkspaces.get(toPosix(relative(dir, resolve(dir, spec.slice('file:'.length)))));
          if (!target || target.name !== name || field === 'overrides') problems.push(`${where} ${field}.${name}: ${JSON.stringify(spec)} links to something other than this repo's private workspace of that name (packages/*); only registry packages may be installed`);
          continue;
        }
        const m = typeof spec === 'string' && /^[\^~]?(.+)$/.exec(spec);
        if (!m || !STABLE.test(m[1])) problems.push(`${where} ${field}.${name}: ${JSON.stringify(spec)} is not a stable semver range (use ^x.y.z with a released version)`);
        else if (m[1].startsWith('0.')) {
          const id = `${name}@${m[1]}`;
          if (allow.zeroMajor[id]) used.zeroMajor.add(id);
          else problems.push(`${where} ${field}.${name}: ${spec} is a 0.x release (no stable API yet); pick a 1.0+ package${project ? `, or list ${id} in zeroMajor in ${allowFile} with a reason` : ''}`);
        }
      }
    }
  };
  checkSpecs(at('package.json'), pkg);
  for (const [wsDir, p] of workspaces) {
    const where = project ? toPosix(relative(root, join(dir, wsDir))) : wsDir;
    checkSpecs(`${where}/package.json`, p);
    if (p.private !== true) problems.push(`${where}/package.json: a workspace must be "private": true (it is never published)`);
    if (p.scripts && Object.keys(p.scripts).some(k => /^(pre|post)?install$|^prepare$/.test(k))) problems.push(`${where}/package.json: workspaces may not have install scripts`);
  }
  if (pkg.bundleDependencies || pkg.bundledDependencies) problems.push(`${at('package.json')}: bundled dependencies skip the lockfile checks; remove them`);

  // --- package-lock.json ------------------------------------------------------------------------------------------
  if (lock.lockfileVersion !== 3) problems.push(`${at('package-lock.json')}: lockfileVersion ${lock.lockfileVersion}, expected 3 (npm 9+)`);
  const rootEntry = lock.packages?.[''] ?? {};
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (JSON.stringify(rootEntry[field] ?? {}) !== JSON.stringify(pkg[field] ?? {})) problems.push(`${at('package-lock.json')} is out of date with ${at('package.json')} (${field}); run npm install`);
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
    if (!STABLE.test(e.version ?? '')) {
      if (allow.prerelease[id]) used.prerelease.add(id);
      else problems.push(`${id}: not a stable release (prerelease or build tag)`);
    }
    const tarball = `${REGISTRY}${name}/-/${name.split('/').pop()}-${e.version}.tgz`;
    if (e.resolved !== tarball) problems.push(`${id}: resolved from ${e.resolved}, expected ${tarball}`);
    if (!/^sha512-[A-Za-z0-9+/]+=*$/.test(e.integrity ?? '')) problems.push(`${id}: no sha512 integrity hash`);
    if (e.hasInstallScript) {
      // The root's list is by name (as it always was); a sub-project's is by exact name@version.
      const key = project ? id : name;
      if (allow.installScript[key]) used.installScript.add(key);
      else problems.push(`${id}: has an install script; review it, then add ${project ? `it to installScript in ${allowFile}` : `it to ALLOW_INSTALL_SCRIPT in ${allowFile}`}`);
    }
    locked.set(id, e.integrity);
  }
  if (project) {
    // Every entry must still be needed: a version that is no longer installed, or no longer needs the exception.
    for (const list of ['prerelease', 'young', 'deprecated']) {
      for (const id of Object.keys(allow[list])) if (!locked.has(id)) problems.push(`${allowFile} ${list} lists ${id}, which is no longer installed; remove it`);
    }
    for (const list of ['zeroMajor', 'installScript']) {
      for (const id of Object.keys(allow[list])) {
        if (!used[list].has(id)) problems.push(`${allowFile} ${list} lists ${id}, which ${list === 'zeroMajor' ? 'no package.json spec uses' : 'is not installed with an install script'}; remove it`);
      }
    }
  } else {
    for (const [list, allowed] of Object.entries({ ALLOW_PRERELEASE, ALLOW_DEPRECATED, ALLOW_YOUNG })) {
      for (const id of Object.keys(allowed)) if (!locked.has(id)) problems.push(`${list} lists ${id}, which is no longer installed; remove it`);
    }
  }

  // --- registry: age, deprecation, integrity ----------------------------------------------------------------------
  let verified = {};
  try { verified = readJson(cacheFile); } catch { /* first run */ }
  const todo = [...locked].filter(([id, integrity]) => verified[id] !== integrity);
  const byName = Map.groupBy(todo, ([id]) => id.slice(0, id.lastIndexOf('@')));
  let offline = false;
  async function checkName(name, entries) {
    let doc;
    for (let attempt = 0; ; attempt++) {
      try {
        doc = await getPackument(name);
        if (doc === null) { problems.push(`${name}: not on the registry`); return; }
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
      if (days < MIN_AGE_DAYS && !allow.young[id]) { ok = false; problems.push(`${id}: published ${days.toFixed(1)} days ago; wait until it is ${MIN_AGE_DAYS} days old (or pin the previous version${project ? `, or list it in young in ${allowFile} with a reason` : ''})`); }
      if (meta.deprecated && !allow.deprecated[id]) { ok = false; problems.push(`${id}: deprecated: ${meta.deprecated}`); }
      if (ok) verified[id] = integrity;
    }
  }
  const queue = [...byName];
  await Promise.all(Array.from({ length: 12 }, async () => { for (let next; (next = queue.shift());) await checkName(...next); }));
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(verified));

  const allowed = project
    ? [...new Set(LISTS.flatMap(list => Object.keys(allow[list])))]
    : Object.keys({ ...ALLOW_PRERELEASE, ...ALLOW_DEPRECATED, ...ALLOW_YOUNG });
  return result({ offline, locked: locked.size, checkedOnline: todo.length, allowed });
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'data', 'ios', 'android', 'Pods']);
/** Every directory under root (at most `depth` levels down, not root itself) that has its own package-lock.json. */
export function findProjects(root = REPO_ROOT, depth = 3) {
  const found = [];
  const walk = (rel, left) => {
    for (const d of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('.') || SKIP_DIRS.has(d.name)) continue;
      const sub = rel ? `${rel}/${d.name}` : d.name;
      if (existsSync(join(root, sub, 'package-lock.json'))) found.push(sub);
      if (left > 1) walk(sub, left - 1);
    }
  };
  walk('', depth);
  return found.sort();
}

/** One result as the console shows it. */
export function report({ label, problems, offline, locked, checkedOnline, allowed }) {
  const name = label ? `dependency check (${label})` : 'dependency check';
  if (problems.length) {
    const lines = [`✖ ${name}: ${problems.length} problem${problems.length === 1 ? '' : 's'}`, ...problems.map(p => `  - ${p}`)];
    if (offline) lines.push('  (offline? versions already verified are cached; only new ones need the registry)');
    return { ok: false, text: lines.join('\n') };
  }
  return { ok: true, text: `✓ ${name}: ${locked} packages are stable, from the npm registry, hash-matched and ≥ ${MIN_AGE_DAYS} days old (${checkedOnline} checked online${allowed.length ? `; allowlisted: ${allowed.join(', ')}` : ''})` };
}

async function main(args) {
  const usage = 'usage: node scripts/check-deps.mjs [--project <dir>]... | --projects | --all';
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') targets.push(undefined, ...findProjects());
    else if (args[i] === '--projects') targets.push(...findProjects());
    else if (args[i] === '--project' && args[i + 1] && !args[i + 1].startsWith('--')) targets.push(args[++i]);
    else { console.error(usage); process.exit(2); }
  }
  if (!args.length) targets.push(undefined); // the root
  if (!targets.length) console.log('dependency check: no sub-project has its own package-lock.json');
  let failed = false;
  for (const project of targets) {
    const { ok, text } = report(await checkDeps({ project }));
    if (ok) console.log(text);
    else { console.error(text); failed = true; }
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
