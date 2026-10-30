import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Ways outside data (a song title, an AI answer, a request) could become markup or code. The app renders text through
// React and runs its helpers (claude, Piper, Whisper) without a shell; these keep it that way.
const UNSAFE = [
  { selector: 'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]', message: 'No HTML strings: build nodes (textContent, replaceChildren) or let React render.' },
  { selector: 'CallExpression[callee.property.name=/^(insertAdjacentHTML|createContextualFragment)$/]', message: 'No HTML strings: build nodes or let React render.' },
  { selector: "CallExpression[callee.object.name='document'][callee.property.name=/^write(ln)?$/]", message: 'No document.write.' },
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'No raw HTML in React: render text.' },
  { selector: "Property[key.name='shell'][value.value=true]", message: 'Spawn without a shell: pass the arguments as an array.' },
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'prototype', 'data', '.claude', 'public', 'spikes', 'apps/mobile'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }], // `const { a: _, ...rest } = x` drops a key
      eqeqeq: ['error', 'smart'],
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-proto': 'error',
      'no-extend-native': 'error',
      'no-restricted-syntax': ['error', ...UNSAFE],
      'no-restricted-imports': ['error', { paths: ['node:child_process', 'child_process'].map(name => ({ name, importNames: ['exec', 'execSync'], message: 'exec runs a shell: use spawn or execFile with an argument array.' })) }],
    },
  },
  // With the types: promises that fail silently, code in strings, assertions TypeScript already knows.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/unbound-method': 'error',
    },
  },
  // @drum-coach/core is shared with the iPad app: no browser globals, no UI frameworks (each app injects them).
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'fetch', 'performance', 'AudioContext', 'requestAnimationFrame'],
      'no-restricted-imports': ['error',
        { paths: ['react', 'react-dom', 'react-native', ...['node:child_process', 'child_process'].map(name => ({ name, importNames: ['exec', 'execSync'], message: 'exec runs a shell: use spawn or execFile with an argument array.' }))],
          patterns: ['react/*', 'react-dom/*', 'react-native/*', 'expo', 'expo-*', 'expo/*', '@expo/*'] }],
    },
  },
);
