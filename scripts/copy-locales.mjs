import { cpSync } from 'node:fs';

cpSync('src/locales', 'dist/locales', { recursive: true, filter: (src) => !src.endsWith('.ts') });
