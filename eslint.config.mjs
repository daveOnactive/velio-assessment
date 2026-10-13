import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.node, ...globals.browser } }, plugins: { import: importPlugin, 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks, 'react-refresh': reactRefresh }, rules: { ...reactHooks.configs.recommended.rules, 'import/order': ['error', { alphabetize: { order: 'asc', caseInsensitive: true }, 'newlines-between': 'always' }], '@typescript-eslint/no-explicit-any': 'warn' } },
  { files: ['web/**/*.{ts,tsx}'], rules: { 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] } },
  prettier,
];
