// Lets plain Node (type stripping) load the web app's src/ modules, which import each other without the `.ts`
// extension (Vite and Vitest resolve those; Node doesn't). Import this before importing anything from src/.
// Not needed under Vitest. Needs Node >= 22.15 (module.registerHooks).
import { registerHooks } from 'node:module';

const relative = /^\.{1,2}\//, hasExt = /\.[cm]?[jt]sx?$|\.json$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      const code = /** @type {{ code?: string }} */ (e).code;
      if (!relative.test(specifier) || hasExt.test(specifier) || (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'ERR_UNSUPPORTED_DIR_IMPORT')) throw e;
      for (const suffix of ['.ts', '.tsx', '/index.ts']) {
        try { return nextResolve(specifier + suffix, context); } catch { /* next */ }
      }
      throw e;
    }
  },
});
