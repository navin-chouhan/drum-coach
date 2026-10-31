import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { NO_EXEC, SAFETY_RULES, TYPED_RULES } from './eslint.rules.js';

// The web app, the server and the shared core. The iPad app (apps/mobile, its own npm project and tsconfig) has its
// own config with the same rules: apps/mobile/eslint.config.mjs (`npm run lint` there, part of `npm run mobile:test`).
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'prototype', 'data', '.claude', 'public', 'spikes', 'apps/mobile'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { rules: SAFETY_RULES },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: TYPED_RULES,
  },
  // @drum-coach/core is shared with the iPad app: no browser globals, no UI frameworks (each app injects them).
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'fetch', 'performance', 'AudioContext', 'requestAnimationFrame'],
      'no-restricted-imports': ['error',
        { paths: ['react', 'react-dom', 'react-native', ...NO_EXEC],
          patterns: ['react/*', 'react-dom/*', 'react-native/*', 'expo', 'expo-*', 'expo/*', '@expo/*'] }],
    },
  },
);
