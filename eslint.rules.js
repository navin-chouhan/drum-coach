// The lint rules every project in the repo shares: the web app and server (eslint.config.js) and the iPad app
// (apps/mobile/eslint.config.mjs, its own npm project, linted with the root's ESLint packages).

// Ways outside data (a song title, an AI answer, a request) could become markup or code. The apps render text through
// React and run their helpers (claude, Piper, Whisper) without a shell; these keep it that way.
export const UNSAFE = [
  { selector: 'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]', message: 'No HTML strings: build nodes (textContent, replaceChildren) or let React render.' },
  { selector: 'CallExpression[callee.property.name=/^(insertAdjacentHTML|createContextualFragment)$/]', message: 'No HTML strings: build nodes or let React render.' },
  { selector: "CallExpression[callee.object.name='document'][callee.property.name=/^write(ln)?$/]", message: 'No document.write.' },
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'No raw HTML in React: render text.' },
  { selector: "Property[key.name='shell'][value.value=true]", message: 'Spawn without a shell: pass the arguments as an array.' },
];

export const NO_EXEC = ['node:child_process', 'child_process'].map(name => ({ name, importNames: ['exec', 'execSync'], message: 'exec runs a shell: use spawn or execFile with an argument array.' }));

/** The rules for every file. */
export const SAFETY_RULES = {
  '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }], // `const { a: _, ...rest } = x` drops a key
  eqeqeq: ['error', 'smart'],
  'no-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-proto': 'error',
  'no-extend-native': 'error',
  'no-restricted-syntax': ['error', ...UNSAFE],
  'no-restricted-imports': ['error', { paths: NO_EXEC }],
};

/** With the types: promises that fail silently, code in strings, assertions TypeScript already knows. */
export const TYPED_RULES = {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-implied-eval': 'error',
  '@typescript-eslint/only-throw-error': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/unbound-method': 'error',
};
