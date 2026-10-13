// Сборка сайта документации для GitHub Pages в _site/ (без зависимостей).
//
//   npm run build && node scripts/build-site.mjs
//
// site/pages/*.html — фрагменты страниц. Первая строка — JSON в комментарии:
//   <!-- {"title": "...", "description": "...", "path": "login/", "lang": "en", "type": "TechArticle"} -->
// Скрипт оборачивает их в общий шаблон (title, meta description, canonical, Schema.org, навигация),
// собирает sitemap.xml, llms-full.txt и копирует демо и dist/index.global.js.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');
const SITE = 'https://abduazimkhuja.github.io/eimzo-ts/';
const REPO = 'https://github.com/abduazimkhuja/eimzo-ts';
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const NAV = [
  ['', 'Overview'],
  ['login/', 'Login'],
  ['sign/', 'Signing'],
  ['api/', 'API'],
  ['faq/', 'FAQ'],
  ['troubleshooting/', 'Troubleshooting'],
  ['demo/', 'Demo'],
];

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function readPage(file) {
  const source = readFileSync(join(root, 'site/pages', file), 'utf8');
  const m = /^<!--\s*(\{[\s\S]*?\})\s*-->\n/.exec(source);
  if (!m) throw new Error(`${file}: no metadata comment`);
  return { ...JSON.parse(m[1]), body: source.slice(m[0].length) };
}

function jsonLd(page, url) {
  const author = { '@type': 'Person', name: 'Abduazimkhoja', url: 'https://github.com/abduazimkhuja' };
  const code = {
    '@type': 'SoftwareSourceCode',
    name: 'eimzo-ts',
    description: pkg.description,
    codeRepository: REPO,
    programmingLanguage: 'TypeScript',
    runtimePlatform: 'Web browser',
    license: 'https://opensource.org/licenses/MIT',
    url: SITE,
    author,
  };
  if (page.type === 'FAQPage') {
    // Вопросы — <details><summary>…</summary>…</details> на странице.
    const items = [...page.body.matchAll(/<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      url,
      mainEntity: items.map(([, q, a]) => ({
        '@type': 'Question',
        name: q.replace(/<[^>]+>/g, '').trim(),
        acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() },
      })),
    };
  }
  if (page.type === 'TechArticle') {
    return { '@context': 'https://schema.org', '@type': 'TechArticle', headline: page.title, description: page.description, url, inLanguage: page.lang, author, about: code };
  }
  return { '@context': 'https://schema.org', ...code, inLanguage: page.lang };
}

function render(page) {
  const url = SITE + page.path;
  const prefix = page.path ? '../'.repeat(page.path.split('/').filter(Boolean).length) : './';
  const nav = NAV.map(([path, label]) =>
    `<a href="${prefix}${path}"${path === page.path ? ' aria-current="page"' : ''}>${label}</a>`).join('\n      ');
  const alternates = page.lang === 'ru' || page.path === ''
    ? `\n  <link rel="alternate" hreflang="en" href="${SITE}">\n  <link rel="alternate" hreflang="ru" href="${SITE}ru/">`
    : '';
  return `<!doctype html>
<html lang="${page.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(page.title)}</title>
  <meta name="description" content="${escape(page.description)}">
  <link rel="canonical" href="${url}">${alternates}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escape(page.title)}">
  <meta property="og:description" content="${escape(page.description)}">
  <meta property="og:url" content="${url}">
  <link rel="stylesheet" href="${prefix}assets/style.css">
  <script type="application/ld+json">${JSON.stringify(jsonLd(page, url))}</script>
</head>
<body>
  <header>
    <a class="brand" href="${prefix}">eimzo-ts</a>
    <nav aria-label="Documentation">
      ${nav}
      <a href="${REPO}">GitHub</a>
    </nav>
  </header>
  <main>
${page.body.trim()}
  </main>
  <footer>
    <p>eimzo-ts ${pkg.version} · MIT · <a href="${REPO}">GitHub</a> · <a href="https://www.npmjs.com/package/eimzo-ts">npm</a> · <a href="${prefix}ru/">Русский</a></p>
    <p>Unofficial library, not affiliated with the developers of E-IMZO.</p>
  </footer>
</body>
</html>
`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const pages = readdirSync(join(root, 'site/pages')).filter((f) => f.endsWith('.html')).map(readPage);
for (const page of pages) {
  mkdirSync(join(out, page.path), { recursive: true });
  writeFileSync(join(out, page.path, 'index.html'), render(page));
}

const urls = [...pages.map((p) => p.path), 'demo/'].map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n');
writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

cpSync(join(root, 'site/assets'), join(out, 'assets'), { recursive: true });
cpSync(join(root, 'site/llms.txt'), join(out, 'llms.txt'));
cpSync(join(root, 'demo'), join(out, 'demo'), { recursive: true });
mkdirSync(join(out, 'dist'));
for (const f of ['index.global.js', 'index.global.js.map']) cpSync(join(root, 'dist', f), join(out, 'dist', f));

// llms-full.txt: вся документация одним файлом.
const full = [
  'README.md',
  'skills/eimzo-ts/references/api.md',
  'skills/eimzo-ts/references/examples.md',
  'skills/eimzo-ts/references/troubleshooting.md',
  'skills/eimzo-ts/references/backend.md',
  'CHANGELOG.md',
].map((f) => `<!-- Source: ${REPO}/blob/main/${f} -->\n\n${readFileSync(join(root, f), 'utf8').trim()}\n`);
writeFileSync(join(out, 'llms-full.txt'), `# eimzo-ts — full documentation (version ${pkg.version})\n\n${full.join('\n---\n\n')}`);

console.log(`_site: ${pages.length} pages, sitemap.xml, llms.txt, llms-full.txt, demo`);
