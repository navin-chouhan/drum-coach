// The core must work without a `performance` global (the clock is injected: platform.ts Clock). Vitest itself needs
// performance.now() to time module imports, so the global can't simply be deleted for the whole run. Instead, from here
// on, `performance` reads as undefined whenever core source (packages/core/src, not a test file) reads it: at import
// time and in every call. Test code and Vitest still see the real one.
const real = Object.getOwnPropertyDescriptor(globalThis, 'performance');
if (!real) throw new Error('expected a performance global to hide');
const realValue: unknown = real.get ? real.get.call(globalThis) : real.value;

/** The code reading `performance` is core source (not a test). Only the direct caller counts: Vitest's module runner
 * reads it too while a core module is importing another, with that module further up the stack. */
const fromCore = (stack: string) => {
  const caller = stack.split('\n')[2] ?? '';
  return /packages\/core\/src\//.test(caller) && !/\.test\.ts\b/.test(caller);
};

Object.defineProperty(globalThis, 'performance', {
  configurable: true,
  enumerable: real.enumerable,
  get: () => (fromCore(new Error().stack ?? '') ? undefined : realValue),
});
