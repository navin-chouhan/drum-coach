// Metro for apps/mobile. The app is its own npm project (not a root workspace, see docs/mobile/BOARD.md "Layout"),
// so @drum-coach/core arrives as a symlink: node_modules/@drum-coach/core -> ../../packages/core.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const coreRoot = path.resolve(projectRoot, '../../packages/core');
const appNodeModules = path.resolve(projectRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);

// Metro must watch the core's real folder (it follows the symlink to it).
config.watchFolders = [...new Set([...(config.watchFolders ?? []), coreRoot])];

// The core's own imports (zod, @tonejs/midi, ...) come from this app's node_modules, so no root install is needed.
config.resolver.nodeModulesPaths = [...new Set([appNodeModules, ...(config.resolver.nodeModulesPaths ?? [])])];
// `@drum-coach/core/engine/kit` -> `src/engine/kit.ts` through the core's package.json "exports".
config.resolver.unstable_enablePackageExports = true;

// Resolve every bare import made by a core file as if this app made it, so there is one copy of each (zod, ...).
// Metro can't see the repo root's node_modules today (it isn't watched), but hierarchical lookup from packages/core
// would reach it first (the web app's React 19.3.1, another zod) if anyone ever watches the repo root.
// vitest.config.ts has the same rule, and there it matters: Vite does look in the root's node_modules.
const isBare = name => !name.startsWith('.') && !path.isAbsolute(name);
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  if (isBare(moduleName) && context.originModulePath.startsWith(coreRoot + path.sep)) {
    return resolve({ ...context, originModulePath: path.join(projectRoot, 'package.json') }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
