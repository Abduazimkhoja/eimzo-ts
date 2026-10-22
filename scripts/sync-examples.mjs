// Копирует examples/_shared/* в каждый пример (StackBlitz открывает одну подпапку, общий код ей недоступен).
// node scripts/sync-examples.mjs          — скопировать
// node scripts/sync-examples.mjs --check  — упасть, если копии разошлись (для npm run check)
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// пример -> папка для общих файлов
const TARGETS = {
  'vanilla-ts': 'src',
  react: 'src',
  vue: 'src',
  svelte: 'src/lib',
  nextjs: 'src/lib',
  nuxt: 'app/utils',
  angular: 'src/app',
};

const check = process.argv.includes('--check');
const shared = 'examples/_shared';
const stale = [];

for (const [example, dir] of Object.entries(TARGETS)) {
  if (!existsSync(join('examples', example))) continue;
  for (const file of readdirSync(shared)) {
    const from = join(shared, file);
    const to = join('examples', example, dir, file);
    const same = existsSync(to) && readFileSync(from, 'utf8') === readFileSync(to, 'utf8');
    if (same) continue;
    if (check) stale.push(to);
    else copyFileSync(from, to);
  }
}

if (stale.length) {
  console.error(`Копии разошлись с examples/_shared, запустите npm run examples:sync:\n  ${stale.join('\n  ')}`);
  process.exit(1);
}
