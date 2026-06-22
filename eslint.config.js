import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // Must come last: turns off stylistic rules that conflict with Prettier.
      eslintConfigPrettier,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Production hygiene: keep stray debug logging out of the bundle, but allow
      // intentional diagnostics (e.g. the error boundary) via warn/error.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Prefer type-only imports to keep runtime imports honest and tree-shakeable.
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      // Catch unhandled union/switch cases early in the geometry/domain code.
      'default-case-last': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
]);
