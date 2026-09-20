const config = window.ULTRAHYPE_CONFIG || {};
const catalog = window.ULTRAHYPE_CATALOG || { products: [], hypeStacks: [] };

const year = document.getElementById('year');
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.site-nav');
const toast = document.getElementById('toast');
const marketInput = document.getElementById('market-search');
const marketButton = document.getElementById('market-search-btn');
const marketResult = document.getElementById('market-result');
const marketStatus = document.querySelector('.market-terminal .status-chip');
const productGrid = document.getElementById('product-grid');
const categoryTabs = document.getElementById('category-tabs');
const dcdGrid = document.getElementById('dcd-grid');
const hypeStackGrid = document.getElementById('hype-stack-grid');

if (year) year.textContent = new Date().getFullYear();

if (navToggle && nav) {
  navToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }));
}

let toastTimer;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3600);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function productUrl(product) {
  return `product.html?id=${encodeURIComponent(product.id)}`;
}

function renderProducts(filter = 'all') {
  if (!productGrid) return;
  const items = catalog.products.filter((product) => filter === 'all' || product.type === filter || product.category?.toLowerCase() === filter);
  productGrid.innerHTML = items.map((product) => {
    const isDcd = product.theme === 'dcd';
    const media = isDcd
      ? `<div class="catalog-media dcd" aria-hidden="true"></div>`
      : `<div class="catalog-media"><img src="${escapeHtml(product.heroMedia || '')}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>`;
    const price = product.price?.label || (isDcd ? 'SCOPED DEPLOYMENT' : product.type.toUpperCase());
    return `<article class="catalog-card">
      ${media}
      <div class="catalog-card-body">
        <div class="catalog-meta"><span>${escapeHtml(product.brand)}</span><span>${escapeHtml(price)}</span></div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.headline)}</p>
        <a class="catalog-link" href="${productUrl(product)}">Open product <span>↗</span></a>
      </div>
    </article>`;
  }).join('');
  wireReveal();
}

function renderCategoryTabs() {
  if (!categoryTabs) return;
  const filters = [
    ['all', 'All products'],
    ['physical', 'Physical'],
    ['software', 'Software'],
    ['service', 'Managed services']
  ];
  categoryTabs.innerHTML = filters.map(([value, label], index) => `<button class="category-tab ${index === 0 ? 'active' : ''}" type="button" data-filter="${value}">${label}</button>`).join('');
  categoryTabs.querySelectorAll('.category-tab').forEach((button) => {
    button.addEventListener('click', () => {
      categoryTabs.querySelectorAll('.category-tab').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      renderProducts(button.dataset.filter || 'all');
    });
  });
}

function renderDcdFamily() {
  if (!dcdGrid) return;
  const items = catalog.products.filter((product) => product.theme === 'dcd');
  dcdGrid.innerHTML = items.map((product, index) => `<article class="dcd-mini-card"><small>LANE ${String(index + 1).padStart(2, '0')}</small><h4>${escapeHtml(product.name)}</h4><p>${escapeHtml(product.description)}</p><a href="${productUrl(product)}">Open lane →</a></article>`).join('');
}

function renderHypeStacks() {
  if (!hypeStackGrid) return;
  const chips = {
    '3d-printing-business': ['3D printer', 'CATIAAgent', 'ManufacturingOS', 'Quoting', 'Customer acquisition'],
    'window-cleaning-business': ['Squeegee + tools', 'Voice Agent', 'SEO Agent', 'Scheduling', 'BusinessOS'],
    'smart-lab': ['Lab equipment', 'ChemistryOS', 'LabOS', 'Experiment logging', 'Analysis'],
    'robotics-cell': ['Robot hardware', 'Robotics AI', 'Vision / ML', 'Automation', 'Workflows']
  };
  hypeStackGrid.innerHTML = (catalog.hypeStacks || []).map((stack) => `<article class="stack-card"><span class="stack-kicker">${escapeHtml(stack.kicker)}</span><h3>${escapeHtml(stack.name)}</h3><p>${escapeHtml(stack.description)}</p><div class="stack-flow">${(chips[stack.id] || []).map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}</div></article>`).join('');
}

function ebayMode() {
  return String(config.integrations?.ebay?.environment || 'sandbox').toLowerCase();
}

function initializeMarketConnector() {
  const ebay = config.integrations?.ebay;
  if (!marketStatus || !marketResult || !ebay?.enabled) return;
  const production = ebayMode() === 'production';
  marketStatus.textContent = production ? 'LIVE' : 'SANDBOX LIVE';
  marketResult.classList.add('active');
  marketResult.innerHTML = production
    ? '<span>API lane live</span><p>Protected eBay discovery is online through the UltraHype backend.</p>'
    : '<span>Sandbox API lane live</span><p>The protected connector is online with eBay Sandbox test inventory. Production inventory remains disabled until production access is approved and installed.</p>';
}

async function searchEbay() {
  const query = marketInput?.value.trim();
  if (!query || !marketResult) {
    if (marketInput) marketInput.focus();
    return;
  }

  const ebay = config.integrations?.ebay;
  const apiBase = String(config.apiBase || '').replace(/\/$/, '');
  if (!ebay?.enabled || !apiBase) {
    marketResult.classList.add('active');
    marketResult.innerHTML = `<span>Connector staged</span><p>“${escapeHtml(query)}” is ready to route through the protected marketplace adapter when the backend is enabled.</p>`;
    return;
  }

  marketResult.classList.add('loading');
  marketResult.innerHTML = '<span>Searching</span><p>Routing query through the protected marketplace adapter…</p>';

  try {
    const url = new URL(`${apiBase}${ebay.searchPath}`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '8');
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Search failed (${response.status})`);
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    const production = ebayMode() === 'production';
    const visible = items.slice(0, 5);
    const rows = visible.length ? visible.map((item) => {
      const price = item.price?.value != null ? ` · ${escapeHtml(item.price.currency || '')} ${escapeHtml(item.price.value)}` : '';
      const condition = item.condition ? ` · ${escapeHtml(item.condition)}` : '';
      return `<p><strong>${escapeHtml(item.title || 'Untitled item')}</strong>${price}${condition}</p>`;
    }).join('') : '<p>No matching items were returned for this query.</p>';
    marketResult.classList.remove('loading');
    marketResult.classList.add('active');
    marketResult.innerHTML = `<span>${production ? 'Connected result' : 'Sandbox result'} · ${items.length} returned</span>${rows}`;
  } catch (error) {
    marketResult.classList.remove('loading');
    marketResult.innerHTML = `<span>Connector unavailable</span><p>${escapeHtml(error.message)}. The public storefront remains isolated from marketplace credentials.</p>`;
  }
}

function wireReveal() {
  if (!('IntersectionObserver' in window)) return;
  const targets = document.querySelectorAll('.catalog-card:not([data-revealed]), .stack-card:not([data-revealed]), .dcd-mini-card:not([data-revealed]), .intel-lab:not([data-revealed]), .market-terminal:not([data-revealed]), .b2b-card:not([data-revealed])');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.dataset.revealed = 'true';
      entry.target.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      observer.unobserve(entry.target);
    });
  }, { threshold: .08 });
  targets.forEach((target) => observer.observe(target));
}

renderCategoryTabs();
renderProducts();
renderDcdFamily();
renderHypeStacks();
initializeMarketConnector();
wireReveal();

if (marketButton) marketButton.addEventListener('click', searchEbay);
if (marketInput) marketInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') searchEbay(); });

document.querySelectorAll('[data-toast]').forEach((button) => button.addEventListener('click', () => showToast(button.dataset.toast)));
