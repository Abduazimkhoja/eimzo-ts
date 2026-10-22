// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', '_site/', 'node_modules/', 'coverage/', 'demo/', 'site/', 'examples/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['tsup.config.ts', 'vitest.config.ts', 'eslint.config.js', 'scripts/*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Promise без await/catch в асинхронной библиотеке — почти всегда ошибка.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // `signal.reason` и пойманные ошибки по стандарту `unknown` — пробрасываем их как есть.
      '@typescript-eslint/only-throw-error': ['error', { allowThrowingUnknown: true }],
      '@typescript-eslint/prefer-promise-reject-errors': ['error', { allowThrowingUnknown: true }],
    },
  },
  {
    // Тестам нужны заглушки и доступ к произвольным полям ответов E-IMZO.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
);
