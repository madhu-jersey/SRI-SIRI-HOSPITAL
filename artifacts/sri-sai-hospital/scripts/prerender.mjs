// After `vite build`: writes a ready-made HTML file for every public page
// (title, description, canonical link, link-preview tags, structured data and
// the page's own content), plus sitemap.xml. Private pages (dashboard, patient
// links) fall back to the plain app shell.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'dist', 'public');
const template = readFileSync(path.join(outDir, 'index.html'), 'utf8');

// A tiny stand-in for the browser, enough for the app to render once.
function fakeBrowser(pathname, siteUrl) {
  const noop = () => {};
  const storage = { getItem: () => null, setItem: noop, removeItem: noop };
  const media = () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
  globalThis.window = {
    location: { pathname, hash: '', search: '', origin: siteUrl, href: siteUrl + pathname },
    matchMedia: media, addEventListener: noop, removeEventListener: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, setTimeout, clearTimeout, setInterval, clearInterval,
    innerWidth: 1280, innerHeight: 800, scrollY: 0, localStorage: storage, sessionStorage: storage,
  };
  globalThis.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop, documentElement: { style: {} }, head: { appendChild: noop }, title: '',
  };
}

const escapeAttr = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');

fakeBrowser('/', 'https://example.invalid');
const ssr = await import(pathToFileURL(path.join(root, 'dist', 'ssr', 'prerender.js')).href);
const siteUrl = (process.env.PUBLIC_SITE_URL || ssr.SITE_URL).replace(/\/+$/, '');

function setMeta(html, attr, name, content) {
  const pattern = new RegExp(`<meta ${attr}="${name}" content="[^"]*"\\s*/?>`);
  const tag = `<meta ${attr}="${name}" content="${escapeAttr(content)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

// The plain shell for pages that are not pre-built (dashboard, patient links).
writeFileSync(path.join(outDir, 'app-shell.html'), template);

const pages = Object.entries(ssr.PAGE_META).filter(([, meta]) => meta.indexable);
const today = new Date().toISOString().slice(0, 10);
for (const [key, meta] of pages) {
  fakeBrowser(meta.path, siteUrl);
  let body = '';
  try {
    body = ssr.render();
  } catch (error) {
    console.error(`Could not pre-render ${meta.path}: ${error.message}. It will load normally in the browser.`);
  }
  const url = siteUrl + (meta.path === '/' ? '/' : meta.path);
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${escapeText(meta.title)}</title>`);
  html = setMeta(html, 'name', 'description', meta.description);
  html = setMeta(html, 'property', 'og:title', meta.title);
  html = setMeta(html, 'property', 'og:description', meta.description);
  html = setMeta(html, 'property', 'og:url', url);
  html = setMeta(html, 'property', 'og:image', `${siteUrl}/assets/hero-building.jpg`);
  html = setMeta(html, 'property', 'og:site_name', 'Sri Siri Hospital');
  html = setMeta(html, 'name', 'twitter:title', meta.title);
  html = setMeta(html, 'name', 'twitter:description', meta.description);
  const head = [
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    `<script type="application/ld+json">${JSON.stringify(ssr.structuredData(key)).replace(/</g, '\\u003c')}</script>`,
  ].map((line) => `    ${line}`).join('\n');
  html = html.replace('</head>', `${head}\n  </head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  const file = meta.path === '/' ? path.join(outDir, 'index.html') : path.join(outDir, meta.path.slice(1), 'index.html');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`pre-built ${meta.path.padEnd(12)} ${Math.round(body.length / 1024)} KB of content`);
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(([, meta]) => `  <url><loc>${siteUrl}${meta.path}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap);
console.log(`sitemap.xml: ${pages.length} pages`);
