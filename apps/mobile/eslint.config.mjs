// Lint for the iPad app with the repo's rules (../../eslint.rules.js: no HTML strings, no eval, no shell, promises
// handled…). The ESLint packages are the root's (Node finds them in ../../node_modules), so this project adds none.
// Run: `npm run lint` here (CI's Mobile job and the root's `npm run mobile:test`).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { SAFETY_RULES, TYPED_RULES } from '../../eslint.rules.js';

export default tseslint.config(
  { ignores: ['node_modules', 'ios', 'android', 'dist', '.expo', 'coverage', 'modules/*/ios', 'modules/*/android', 'e2e', 'assets'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  // React Native's globals (__DEV__), the DOM components' browser ('use dom'), and Node for the scripts and configs.
  { languageOptions: { globals: { ...globals.browser, ...globals.node, __DEV__: 'readonly' } } },
  { rules: SAFETY_RULES },
  // Metro loads its config with require() (CommonJS), so require is how that file imports.
  {
    files: ['metro.config.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: TYPED_RULES,
  },
);
