#!/usr/bin/env node
/**
 * UltraHype Market Memory generator
 *
 * Goal: durable, low-compute SEO pages whose URLs persist while connected
 * marketplace inventory changes underneath them.
 *
 * This script intentionally does NOT generate one page per transient listing.
 * It generates durable entity/category pages from normalized input records.
 * Feed/Browse data can refresh the evidence block without changing the URL.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'market');
const BASE_URL = 'https://ultrahype.store';
const API_BASE = process.env.ULTRAHYPE_API_BASE || 'https://api.ultrahype.store';
const ENVIRONMENT = String(process.env.ULTRAHYPE_MARKET_ENV || 'sandbox').toLowerCase();
const INDEXABLE = ENVIRONMENT === 'production';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pageShell({ title, description, canonical, eyebrow, heading, body, jsonLd, categoryName = '' }) {
  const robots = INDEXABLE ? 'index,follow,max-image-preview:large' : 'noindex,follow';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="${robots}" />
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <link rel="icon" href="../../../favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="../../../styles.css" />
  <link rel="stylesheet" href="../../../v2.css" />
  <link rel="stylesheet" href="../../../marketplace.css" />
  <link rel="stylesheet" href="../../../marketplace-home.css" />
  <title>${esc(title)}</title>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="marketplace-page market-memory-page" data-category-name="${esc(categoryName)}">
  <header class="site-header shell">
    <a class="brand" href="../../../index.html"><span class="brand-glyph">UH</span><span class="brand-word">ULTRAHYPE</span></a>
    <nav class="site-nav"><a href="../../../marketplace.html">Marketplace</a><a href="../../../index.html#hypestacks">HypeStacks</a><a href="../../../index.html#fshack">FSHack</a></nav>
  </header>
  <main class="shell" style="padding-top:72px;padding-bottom:90px">
    <div class="eyebrow"><span class="live-dot"></span>${esc(eyebrow)}</div>
    <h1 style="font-size:clamp(3rem,8vw,7rem);line-height:.9;letter-spacing:-.065em;margin:22px 0">${esc(heading)}</h1>
    ${body}
    <section class="marketplace-section" style="padding-top:48px">
      <div class="marketplace-section-head"><div><span class="kicker">CONNECTED INVENTORY</span><h2>Current clean listings.</h2></div><p>Live inventory is refreshed from connected sources while this page and its canonical URL persist.</p></div>
      <div id="market-memory-results" class="market-result marketplace-full-results"><span>Loading</span><p>Resolving current connected inventory…</p></div>
    </section>
  </main>
  <footer class="site-footer shell"><a class="brand" href="../../../index.html"><span class="brand-glyph">UH</span><span class="brand-word">ULTRAHYPE</span></a><p>Durable market memory · live source data.</p></footer>
  <script src="../../../config.js"></script>
  <script src="../../../market-memory.js"></script>
</body>
</html>`;
}

async function fetchCategories() {
  const response = await fetch(`${API_BASE}/api/commerce/ebay/categories`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`category API failed (${response.status})`);
  const payload = await response.json();
  return Array.isArray(payload.categories) ? payload.categories : [];
}

async function generateCategoryPages(categories) {
  const urls = [];
  for (const category of categories) {
    const name = String(category.name || '').trim();
    const slug = slugify(name);
    if (!name || !slug) continue;
    const dir = path.join(OUT, 'category', slug);
    await fs.mkdir(dir, { recursive: true });
    const canonical = `${BASE_URL}/market/category/${slug}/`;
    const description = `Explore ${name} through UltraHype: connected marketplace inventory, product intelligence, capability relationships and evolving opportunity paths.`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${name} | UltraHype Marketplace`,
      description,
      url: canonical,
      isPartOf: { '@type': 'WebSite', name: 'UltraHype', url: `${BASE_URL}/` },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'UltraHype', item: `${BASE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Marketplace', item: `${BASE_URL}/marketplace.html` },
          { '@type': 'ListItem', position: 3, name }
        ]
      }
    };
    const body = `<p style="max-width:850px;color:#918b98;font-size:1rem;line-height:1.8">${esc(description)} UltraHype keeps this category URL stable while the underlying source listings change, so discovery, collection relationships, HypeStacks and future Item Intelligence can accumulate around a durable marketplace topic instead of a temporary listing.</p>
      <div class="hero-actions" style="margin-top:24px"><a class="button primary" href="../../../marketplace.html">Open full marketplace</a><a class="button ghost" href="../../../index.html#hypestacks">Explore HypeStacks</a></div>`;
    const html = pageShell({
      title: `${name} Marketplace & Product Discovery | UltraHype`,
      description,
      canonical,
      eyebrow: 'ULTRAHYPE MARKET MEMORY',
      heading: name,
      body,
      jsonLd,
      categoryName: name
    });
    await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
    urls.push(canonical);
  }
  return urls;
}

async function writeSitemap(urls) {
  const core = [
    `${BASE_URL}/`,
    `${BASE_URL}/marketplace.html`,
    `${BASE_URL}/marketplaceOS/`
  ];
  const all = [...new Set([...core, ...urls])];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${all.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`;
  await fs.writeFile(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
}

async function main() {
  const categories = await fetchCategories();
  if (!categories.length) throw new Error('No categories returned; refusing to generate empty market memory.');
  const urls = await generateCategoryPages(categories);
  await writeSitemap(urls);
  console.log(`Generated ${urls.length} durable category pages (${ENVIRONMENT}; indexable=${INDEXABLE}).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
