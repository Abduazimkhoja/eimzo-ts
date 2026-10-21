import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs', 'iife'],
  globalName: 'EimzoClient',
  target: 'es2020',
  dts: true,
  sourcemap: true,
  clean: true,
  // JSON-каталоги сообщений публикуются как `eimzo-ts/locales/<язык>.json`.
  onSuccess: 'node scripts/copy-locales.mjs',
});
