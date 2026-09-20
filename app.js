const config = window.ULTRAHYPE_CONFIG || {};
const catalog = window.ULTRAHYPE_CATALOG || { products: [], hypeStacks: [] };

const shebavonovaPrice = { value: 275, currency: 'USD', label: '$275' };
for (const product of catalog.products || []) {
  if (product.id === 'shebavonova-strap-high-top' || product.id === 'shebavonova-spike-low-top') {
    product.price = { ...shebavonovaPrice };
    if (product.checkout) product.checkout.label = 'Buy on AliveShoes — $275';
  }
}

const strapHighTop = catalog.products?.find((item) => item.id === 'shebavonova-strap-high-top');
if (strapHighTop) {
  const version = '1749675927';
  strapHighTop.heroMedia = `https://s0.as-img.com/r/pic/2176854/1500/1500/side.jpg?bg=f5f5f5&u=${version}`;
  strapHighTop.gallery = [
    { src: `https://s0.as-img.com/r/pic/2176854/1500/1500/with_box.jpg?bg=f5f5f5&u=${version}`, alt: 'Shebavonova strap high-top with collector box' },
    { src: `https://s0.as-img.com/r/pic/2176854/1500/1500/over_box.jpg?bg=f5f5f5&u=${version}`, alt: 'Shebavonova strap high-top over-box view' },
    { src: `https://s0.as-img.com/r/pic/2176854/1500/1500/side.jpg?bg=f5f5f5&u=${version}`, alt: 'Shebavonova strap high-top side view' },
    { src: `https://s0.as-img.com/r/pic/2176854/1500/1500/double_quarter.jpg?bg=f5f5f5&u=${version}`, alt: 'Shebavonova strap high-top double-quarter view' },
    { src: `https://s0.as-img.com/r/pic/2176854/1500/1500/top_bottom.jpg?bg=f5f5f5&u=${version}`, alt: 'Shebavonova strap high-top top and sole view' },
    { src: `https://s0.as-img.com/r/2176854/1200/1200/detail.jpg?bg=f5f5f5&u=${version}`, alt: 'Shebavonova strap high-top detail view' },
    { src: `https://s0.as-img.com/r/2176854/700/600/tongue.jpg?bg=f5f5f5&u=${version}`, alt: 'Shebavonova strap high-top tongue detail' },
    { src: `https://s0.as-img.com/r/box/2176854/1000/1000/horizontal.jpg?bg=f5f5f5&u=${version}`, alt: 'Shebavonova collector packaging' }
  ];
}

function ensureMarketplaceStyles() {
  if (document.querySelector('link[data-ultrahype-marketplace]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'marketplace.css';
  link.dataset.ultrahypeMarketplace = 'v2.2';
  document.head.appendChild(link);
}
ensureMarketplaceStyles();

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

const CLEAN_BATCH_SIZE = 12;
const marketSearchState = {
  query: '',
  items: [],
  nextOffset: 0,
  hasMore: false,
  loading: false,
  candidatesScanned: 0,
  filteredOut: 0,
  sourceTotal: null,
  retrievableTotal: null
};

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

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function formatMoney(price) {
  if (!price || price.value == null) return 'Price unavailable';
  const currency = String(price.currency || 'USD').toUpperCase();
  const number = Number(price.value);
  if (Number.isFinite(number)) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(number);
    } catch {}
  }
  return `${currency} ${price.value}`;
}

function productUrl(product) {
  return `product.html?id=${encodeURIComponent(product.id)}`;
}

function marketItemUrl(item, query = '') {
  if (!item?.id) return 'index.html#ebay';
  const params = new URLSearchParams({ id: String(item.id) });
  if (query) params.set('q', query);
  return `market-item.html?${params.toString()}`;
}

function cacheMarketItem(item) {
  if (!item?.id) return;
  try {
    sessionStorage.setItem(`ultrahype.market-item.${item.id}`, JSON.stringify({ item, savedAt: Date.now() }));
  } catch {}
}

function cacheMarketBrowse(query, items) {
  if (!query || !Array.isArray(items) || !items.length) return;
  try {
    sessionStorage.setItem(
      `ultrahype.market-browse.${query.trim().toLowerCase()}`,
      JSON.stringify({
        query,
        items: items.filter((item) => item?.id).map((item) => ({ id: String(item.id), title: item.title || 'Connected item' })),
        nextOffset: marketSearchState.nextOffset,
        hasMore: marketSearchState.hasMore,
        savedAt: Date.now()
      })
    );
  } catch {}
}

function renderProducts(filter = 'all') {
  if (!productGrid) return;
  const items = catalog.products.filter((product) => filter === 'all' || product.type === filter || product.category?.toLowerCase() === filter);
  productGrid.innerHTML = items.map((product) => {
    const isDcd = product.theme === 'dcd';
    const media = isDcd
      ? '<div class="catalog-media dcd" aria-hidden="true"></div>'
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

function renderEbayCards() {
  if (!marketResult) return;
  const production = ebayMode() === 'production';
  const items = marketSearchState.items;
  items.forEach(cacheMarketItem);
  cacheMarketBrowse(marketSearchState.query, items);

  const cards = items.map((item, index) => {
    const imageUrl = safeExternalUrl(item.imageUrl || item.image);
    const detailUrl = marketItemUrl(item, marketSearchState.query);
    const sourceLabel = production ? 'EBAY' : 'EBAY SANDBOX';
    const condition = item.condition || 'Condition not supplied';
    const seller = item.seller?.username ? `Seller: ${item.seller.username}` : condition;
    const image = imageUrl
      ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title || `eBay item ${index + 1}`)}" loading="lazy" referrerpolicy="no-referrer" />`
      : '';

    return `<article class="ebay-card">
      <a class="ebay-card-media ${imageUrl ? '' : 'image-missing'}" href="${escapeHtml(detailUrl)}" aria-label="Open ${escapeHtml(item.title || 'connected item')} details"><span class="ebay-source-chip">${sourceLabel}</span>${image}</a>
      <div class="ebay-card-body">
        <div class="ebay-card-meta"><span>${escapeHtml(condition)}</span><span class="ebay-card-price">${escapeHtml(formatMoney(item.price))}</span></div>
        <h4><a href="${escapeHtml(detailUrl)}">${escapeHtml(item.title || 'Untitled eBay item')}</a></h4>
        <div class="ebay-card-sub">${escapeHtml(seller)}</div>
        <div class="ebay-card-actions"><a href="${escapeHtml(detailUrl)}">Open details →</a><a class="intel-link" href="${escapeHtml(detailUrl)}#opportunity">UltraHype it</a></div>
      </div>
    </article>`;
  }).join('');

  const sourceTotal = Number.isFinite(Number(marketSearchState.sourceTotal)) ? Number(marketSearchState.sourceTotal) : null;
  const retrievableTotal = Number.isFinite(Number(marketSearchState.retrievableTotal)) ? Number(marketSearchState.retrievableTotal) : null;
  const sourceStat = sourceTotal == null
    ? ''
    : ` · ${marketSearchState.candidatesScanned} candidates scanned${retrievableTotal != null && sourceTotal > retrievableTotal ? ` · first ${retrievableTotal.toLocaleString()} retrievable` : ''}`;
  const loadMore = marketSearchState.hasMore
    ? `<div class="market-load-more"><button id="market-load-more" type="button" ${marketSearchState.loading ? 'disabled' : ''}>${marketSearchState.loading ? 'Scanning…' : 'Load more clean listings'}</button><small>UltraHype continues after source offset ${marketSearchState.nextOffset ?? 0} and keeps the same quality filter.</small></div>`
    : (items.length ? '<div class="market-load-more done"><small>End of the clean retrievable results for this search.</small></div>' : '');

  marketResult.classList.remove('loading');
  marketResult.classList.add('active', 'market-results-mode');
  marketResult.innerHTML = `<div class="market-result-head"><span>${production ? 'Connected inventory' : 'Sandbox inventory'} · ${items.length} clean loaded${sourceStat}</span><small>Images remain source-hosted</small></div>${cards ? `<div class="ebay-result-grid">${cards}</div>` : '<p>No listings met the UltraHype clean-result requirements in the scanned range.</p>'}${loadMore}<p class="market-result-note">${production ? 'UltraHype progressively scans source results and keeps only listings with enough reliable information for the connected-item experience.' : 'Sandbox inventory is test data. The same clean-result pipeline is being exercised before production eBay access is enabled.'}</p>`;

  marketResult.querySelectorAll('.ebay-card-media img').forEach((img) => {
    img.addEventListener('error', () => {
      img.closest('.ebay-card-media')?.classList.add('image-missing');
      img.remove();
    }, { once: true });
  });

  document.getElementById('market-load-more')?.addEventListener('click', () => searchEbay({ append: true }));
}

function mergeUniqueItems(existing, incoming) {
  const map = new Map();
  for (const item of [...existing, ...incoming]) {
    if (item?.id && !map.has(String(item.id))) map.set(String(item.id), item);
  }
  return [...map.values()];
}

async function searchEbay({ append = false } = {}) {
  const typedQuery = marketInput?.value.trim() || '';
  const query = append ? marketSearchState.query : typedQuery;
  if (!query || !marketResult || marketSearchState.loading) {
    if (!query && marketInput) marketInput.focus();
    return;
  }

  const ebay = config.integrations?.ebay;
  const apiBase = String(config.apiBase || '').replace(/\/$/, '');
  if (!ebay?.enabled || !apiBase) {
    marketResult.classList.add('active');
    marketResult.classList.remove('market-results-mode');
    marketResult.innerHTML = `<span>Connector staged</span><p>“${escapeHtml(query)}” is ready to route through the protected marketplace adapter when the backend is enabled.</p>`;
    return;
  }

  if (!append) {
    marketSearchState.query = query;
    marketSearchState.items = [];
    marketSearchState.nextOffset = 0;
    marketSearchState.hasMore = false;
    marketSearchState.candidatesScanned = 0;
    marketSearchState.filteredOut = 0;
    marketSearchState.sourceTotal = null;
    marketSearchState.retrievableTotal = null;
    marketResult.classList.remove('market-results-mode');
    marketResult.classList.add('loading');
    marketResult.innerHTML = '<span>Searching</span><p>Scanning marketplace results and filtering for clean connected-item records…</p>';
  } else {
    marketSearchState.loading = true;
    renderEbayCards();
  }

  marketSearchState.loading = true;

  try {
    const url = new URL(`${apiBase}${ebay.searchPath}`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(CLEAN_BATCH_SIZE));
    url.searchParams.set('offset', String(append ? (marketSearchState.nextOffset || 0) : 0));

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Search failed (${response.status})`);
    const payload = await response.json();
    const incoming = Array.isArray(payload.items) ? payload.items : [];

    marketSearchState.items = append ? mergeUniqueItems(marketSearchState.items, incoming) : incoming;
    marketSearchState.nextOffset = payload.nextOffset ?? null;
    marketSearchState.hasMore = Boolean(payload.hasMore && payload.nextOffset != null);
    marketSearchState.candidatesScanned += Number(payload.candidatesChecked || 0);
    marketSearchState.filteredOut += Number(payload.filteredOut || 0);
    marketSearchState.sourceTotal = payload.total ?? marketSearchState.sourceTotal;
    marketSearchState.retrievableTotal = payload.retrievableTotal ?? marketSearchState.retrievableTotal;
    marketSearchState.loading = false;

    renderEbayCards();
  } catch (error) {
    marketSearchState.loading = false;
    if (append && marketSearchState.items.length) {
      renderEbayCards();
      showToast(`Could not load the next clean batch: ${error.message}`);
    } else {
      marketResult.classList.remove('loading', 'market-results-mode');
      marketResult.innerHTML = `<span>Connector unavailable</span><p>${escapeHtml(error.message)}. The public storefront remains isolated from marketplace credentials.</p>`;
    }
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

if (marketButton) marketButton.addEventListener('click', () => searchEbay());
if (marketInput) marketInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') searchEbay(); });

document.querySelectorAll('[data-toast]').forEach((button) => button.addEventListener('click', () => showToast(button.dataset.toast)));
