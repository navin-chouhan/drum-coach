#!/usr/bin/env node
// Checks an Expo app's installed packages against the installed `expo`'s bundledNativeModules.json.
// Usage: node scripts/check-expo-versions.mjs [appDir]   (apps/mobile runs it as `npm run check:versions`)
//
// Why: Gate 0 crashed at launch (dyld "Symbol not found" in ExpoModulesCore) because expo 58.0.19 named
// expo-file-system ~58.0.11, npm resolved 58.0.12, and 58.0.12's prebuilt iOS framework needed a newer
// expo-modules-core than 58.0.19 allowed. A plain semver range check passes that case, so packages that ship
// prebuilt iOS frameworks (a `prebuilds/` folder) and expo-modules-core must be exactly the version the SDK names.
//
// Fails (exit 1) when:
//   1. a package listed in bundledNativeModules.json is installed (anywhere in node_modules) at a version its
//      range doesn't allow;
//   2. a prebuilt package or expo-modules-core is newer than the version the SDK names (the Gate 0 crash);
//   3. a native package (expo-modules-core, react-native, any expo-* with iOS code) is installed twice.
// It lists (without failing) native expo-* helpers the SDK doesn't name, e.g. expo-dev-launcher: their versions come
// from the named package that depends on them (expo-dev-client), so the named package's pin covers them.
// No network, no dependencies: it reads node_modules only.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const appDir = resolve(process.argv[2] ?? '.');
const nm = join(appDir, 'node_modules');

/** @param {string} file */
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));

/** @param {string} v */
function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(v);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? '' };
}

/** @param {NonNullable<ReturnType<typeof parse>>} a @param {NonNullable<ReturnType<typeof parse>>} b */
function cmp(a, b) {
  for (const k of /** @type {const} */ (['major', 'minor', 'patch'])) if (a[k] !== b[k]) return a[k] - b[k];
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre < b.pre ? -1 : 1;
}

/**
 * The range forms bundledNativeModules.json uses: `~x.y.z`, `^x.y.z` and exact `x.y.z`.
 * Returns null for a form this script doesn't understand (reported, not guessed).
 * @param {string} version @param {string} range
 */
export function satisfies(version, range) {
  const v = parse(version);
  const m = /^([~^]?)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(range.trim());
  const base = m && parse(m[2]);
  if (!v || !m || !base) return null;
  if (v.pre && !base.pre) return false;
  if (cmp(v, base) < 0) return false;
  if (m[1] === '') return cmp(v, base) === 0;
  if (m[1] === '~') return v.major === base.major && v.minor === base.minor;
  if (base.major > 0) return v.major === base.major;
  if (base.minor > 0) return v.major === 0 && v.minor === base.minor;
  return v.major === 0 && v.minor === 0 && v.patch === base.patch;
}

/** @param {string} range */
const baseOf = range => range.replace(/^[~^]/, '');

/**
 * Every installed package under node_modules, nested copies included.
 * @param {string} dir @returns {{ name: string, version: string, dir: string }[]}
 */
function walk(dir) {
  /** @type {{ name: string, version: string, dir: string }[]} */
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.name.startsWith('@')) {
      for (const sub of readdirSync(full, { withFileTypes: true })) visit(join(full, sub.name), sub.isSymbolicLink());
    } else {
      visit(full, entry.isSymbolicLink());
    }
  }
  return out;

  /** @param {string} pkgDir @param {boolean} link */
  function visit(pkgDir, link) {
    const pj = join(pkgDir, 'package.json');
    if (!existsSync(pj)) return;
    const { name, version } = readJson(pj);
    out.push({ name, version, dir: pkgDir });
    if (!link) out.push(...walk(join(pkgDir, 'node_modules')));
  }
}

function main() {
  const expoPj = join(nm, 'expo', 'package.json');
  if (!existsSync(expoPj)) {
    console.error(`check-expo-versions: no expo in ${relative(process.cwd(), nm) || nm}. Run npm ci first.`);
    process.exit(1);
  }
  const expoVersion = readJson(expoPj).version;
  /** @type {Record<string, string>} */
  const bundled = readJson(join(nm, 'expo', 'bundledNativeModules.json'));
  const installed = walk(nm);
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const notes = [];
  /** @type {string[]} */ const unnamed = [];
  let checked = 0;

  /** @type {Map<string, Set<string>>} */
  const copies = new Map();
  for (const p of installed) {
    const where = relative(appDir, p.dir);
    const hasIos = existsSync(join(p.dir, 'ios')) || existsSync(join(p.dir, 'expo-module.config.json'));
    const prebuilt = existsSync(join(p.dir, 'prebuilds'));
    const isNative = p.name === 'react-native' || p.name === 'expo-modules-core' || (p.name.startsWith('expo-') && hasIos);
    if (isNative) copies.set(p.name, (copies.get(p.name) ?? new Set()).add(`${p.version} (${where})`));

    const range = bundled[p.name];
    if (range === undefined) {
      if (p.name.startsWith('expo-') && hasIos) unnamed.push(`${p.name}@${p.version}`);
      continue;
    }
    checked++;
    const ok = satisfies(p.version, range);
    if (ok === null) {
      notes.push(`${p.name}: can't read range "${range}" or version "${p.version}"; check it by hand`);
    } else if (!ok) {
      errors.push(`${p.name}@${p.version} (${where}) is outside expo ${expoVersion}'s range ${range}`);
    } else if ((prebuilt || p.name === 'expo-modules-core') && p.version !== baseOf(range)) {
      const base = parse(baseOf(range));
      const v = parse(p.version);
      if (base && v && cmp(v, base) > 0) {
        errors.push(
          `${p.name}@${p.version} (${where}) ships prebuilt iOS frameworks and is newer than the ${baseOf(range)} ` +
            `expo ${expoVersion} names; it may need a newer expo-modules-core (the Gate 0 crash). ` +
            `Pin ${p.name} to ${baseOf(range)} or move expo to the patch that names ${p.version}.`,
        );
      }
    }
  }
  for (const [name, set] of copies) {
    if (set.size > 1) errors.push(`${name} is installed more than once: ${[...set].join(', ')}`);
  }

  console.log(`expo ${expoVersion}: ${checked} installed packages checked against bundledNativeModules.json`);
  if (unnamed.length) console.log(`not named by the SDK (versioned by their parent package): ${unnamed.join(', ')}`);
  for (const n of notes) console.log(`note: ${n}`);
  if (errors.length) {
    for (const e of errors) console.error(`FAIL: ${e}`);
    process.exit(1);
  }
  console.log('OK: every bundled native module matches this SDK patch');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
