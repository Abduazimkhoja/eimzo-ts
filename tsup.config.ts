import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs', 'iife'],
  globalName: 'EimzoClient',
  target: 'es2020',
  dts: true,
  sourcemap: true,
  clean: true,
});
