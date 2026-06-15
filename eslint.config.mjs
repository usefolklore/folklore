// ESLint flat config — typescript-eslint with type-aware rules.
// Scope: src/ and tests/ only; generated output, vendored code, and
// site assets are never linted.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'vendor/**',
      'docs/**',
      'demo/**',
      'bin/**',
      'scripts/**',
      'folklore-rs/**',
      '.claude/**',
      '.planning/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The codebase is Result-monad based (neverthrow) — floating
      // promises silently swallow Err values, so this is load-bearing.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Interfaces over type aliases is convention, not law — leave off.
      // Underscore-prefixed args are the established unused-marker here.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Tests assert on shapes more loosely; keep the floor but allow
    // non-null assertions on fixtures the test itself constructed.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // node:test's describe()/it() return promises the runner itself
      // awaits — flagging them is pure noise in this suite.
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
);
