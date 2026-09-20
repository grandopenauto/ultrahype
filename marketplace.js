const config = window.ULTRAHYPE_CONFIG || {};
const apiBase = String(config.apiBase || '').replace(/\/$/, '');
const ebay = config.integrations?.ebay || {};

const searchInput = document.getElementById('marketplace-search');
const searchButton = document.getElementById('marketplace-search-btn');
const resultsRoot = document.getElementById('marketplace-results');
const resultsTitle = document.getElementById('results-title');
const resultsCopy = document.getElementById('results-copy');
const categoriesRoot = document.getElementById('marketplace-categories');
const trendingRoot = document.getElementById('trending-grid');
const liveRoot = document.getElementById('live-grid');
const sellerRoot = document.getElementById('seller-grid');
const freshRoot = document.getElementById('fresh-grid');
const environmentLabel = document.getElementById('marketplace-environment');
const providerLabel = document.getElementById('marketplace-provider');
const toast = document.getElementById('toast');
const navToggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('marketplace-nav');
const year = document.getElementById('year');

const CLEAN_BATCH_SIZE = 12;
const state = {
  query: '',
  categoryId: '',
  categoryName: '',
  seller: '',
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
    const open = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
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
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function formatMoney(price) {
  if (!price || price.value == null) return 'Price unavailable';
  const currency = String(price.currency || 'USD').toUpperCase();
  const value = Number(price.value);
  if (!Number.isFinite(value)) return `${currency} ${price.value}`;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function getSessionId() {
  const key = 'ultrahype.activity-session';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const generated = crypto.randomUUID ? crypto.randomUUID() : `uh-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(key, generated);
    return generated;
  } catch {
    return `uh-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

const sessionId = getSessionId();

async function apiFetch(path, options = {}) {
  if (!apiBase) throw new Error('Marketplace API is not configured');
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `Request failed (${response.status})`);
  return payload;
}

function sendActivity(type, data = {}) {
  if (!apiBase) return;
  const body = JSON.stringify({ type, sessionId, ...data });
  fetch(`${apiBase}/api/commerce/activity/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
    keepalive: true
  }).catch(() => {});
}

function cacheItem(item) {
  if (!item?.id) return;
  try {
    sessionStorage.setItem(`ultrahype.market-item.${item.id}`, JSON.stringify({ item, savedAt: Date.now() }));
  } catch {}
}

function cacheBrowse(items) {
  const label = state.query || state.categoryName || state.seller || 'connected';
  if (!items.length) return;
  try {
    sessionStorage.setItem(`ultrahype.market-browse.${label.trim().toLowerCase()}`, JSON.stringify({
      query: state.query,
      categoryId: state.categoryId,
      categoryName: state.categoryName,
      seller: state.seller,
      items: items.filter((item) => item?.id).map((item) => ({ id: String(item.id), title: item.title || 'Connected item' })),
      savedAt: Date.now()
    }));
  } catch {}
}

function detailUrl(item, context = {}) {
  const id = item?.id || item?.itemId;
  if (!id) return '#';
  const params = new URLSearchParams({ id: String(id) });
  const query = context.query ?? state.query;
  const categoryId = context.categoryId ?? state.categoryId;
  const categoryName = context.categoryName ?? state.categoryName;
  const seller = context.seller ?? state.seller;
  if (query) params.set('q', query);
  if (categoryId) params.set('category_id', categoryId);
  if (categoryName) params.set('category_name', categoryName);
  if (seller) params.set('seller', seller);
  return `market-item.html?${params.toString()}`;
}

function itemCard(item, index = 0) {
  const imageUrl = safeExternalUrl(item.imageUrl || item.image);
  const href = detailUrl(item);
  const environment = String(ebay.environment || 'sandbox').toLowerCase();
  const sourceLabel = environment === 'production' ? 'EBAY' : 'EBAY SANDBOX';
  const condition = item.condition || 'Condition not supplied';
  const seller = item.seller?.username ? `Seller: ${item.seller.username}` : condition;
  return `<article class="ebay-card">
    <a class="ebay-card-media ${imageUrl ? '' : 'image-missing'}" href="${escapeHtml(href)}" aria-label="Open ${escapeHtml(item.title || `item ${index + 1}`)} details">
      <span class="ebay-source-chip">${sourceLabel}</span>
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title || 'Connected item')}" loading="lazy" referrerpolicy="no-referrer" />` : ''}
    </a>
    <div class="ebay-card-body">
      <div class="ebay-card-meta"><span>${escapeHtml(condition)}</span><span class="ebay-card-price">${escapeHtml(formatMoney(item.price))}</span></div>
      <h4><a href="${escapeHtml(href)}">${escapeHtml(item.title || 'Untitled connected item')}</a></h4>
      <div class="ebay-card-sub">${escapeHtml(seller)}</div>
      <div class="ebay-card-actions"><a href="${escapeHtml(href)}">Open details →</a><a class="intel-link" href="${escapeHtml(href)}#opportunity">UltraHype it</a></div>
    </div>
  </article>`;
}

function signalCard(item, chip, context = {}) {
  const imageUrl = safeExternalUrl(item.imageUrl);
  const href = detailUrl({ itemId: item.itemId }, { query: item.query || context.query || '' });
  const stats = [];
  if (item.viewers != null) stats.push(`<span>${item.viewers} recent viewer${item.viewers === 1 ? '' : 's'}</span>`);
  if (item.views != null) stats.push(`<span>${item.views} view${item.views === 1 ? '' : 's'}</span>`);
  if (item.price) stats.push(`<span>${escapeHtml(formatMoney(item.price))}</span>`);
  return `<article class="marketplace-signal-card">
    <a class="marketplace-signal-image" href="${escapeHtml(href)}">
      <span class="marketplace-signal-chip">${escapeHtml(chip)}</span>
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title || 'Connected item')}" loading="lazy" />` : ''}
    </a>
    <div class="marketplace-signal-body">
      <small>${escapeHtml(item.seller || item.condition || 'CONNECTED ITEM')}</small>
      <h3>${escapeHtml(item.title || 'Connected item')}</h3>
      <div class="marketplace-signal-stats">${stats.join('')}</div>
      <a class="marketplace-signal-link" href="${escapeHtml(href)}">Open UltraHype view →</a>
    </div>
  </article>`;
}

function renderResults() {
  if (!resultsRoot) return;
  state.items.forEach(cacheItem);
  cacheBrowse(state.items);
  const cards = state.items.map(itemCard).join('');
  const sourceTotal = Number.isFinite(Number(state.sourceTotal)) ? Number(state.sourceTotal) : null;
  const sourceStat = sourceTotal == null ? '' : ` · ${state.candidatesScanned} candidates scanned`;
  const loadMore = state.hasMore
    ? `<div class="market-load-more"><button id="marketplace-load-more" type="button" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Scanning…' : 'Load more clean listings'}</button><small>Continue from source candidate ${state.nextOffset ?? 0} with the same quality filter.</small></div>`
    : (state.items.length ? '<div class="market-load-more done"><small>End of the clean retrievable results for this browse path.</small></div>' : '');

  resultsRoot.classList.add('active', 'market-results-mode');
  resultsRoot.classList.remove('loading');
  resultsRoot.innerHTML = `<div class="market-result-head"><span>${state.items.length} clean loaded${sourceStat}</span><small>Source-hosted images · source-attributed inventory</small></div>${cards ? `<div class="ebay-result-grid">${cards}</div>` : '<div class="marketplace-empty">No listings met the UltraHype clean-result requirements in the scanned range.</div>'}${loadMore}`;
  resultsRoot.querySelectorAll('.ebay-card-media img').forEach((img) => {
    img.addEventListener('error', () => {
      img.closest('.ebay-card-media')?.classList.add('image-missing');
      img.remove();
    }, { once: true });
  });
  document.getElementById('marketplace-load-more')?.addEventListener('click', () => performSearch({ append: true }));
}

function mergeUnique(existing, incoming) {
  const map = new Map();
  for (const item of [...existing, ...incoming]) {
    if (item?.id && !map.has(String(item.id))) map.set(String(item.id), item);
  }
  return [...map.values()];
}

async function performSearch({ append = false } = {}) {
  if (state.loading || !resultsRoot) return;
  if (!append && !state.query && !state.categoryId && !state.seller) return;

  state.loading = true;
  if (!append) {
    state.items = [];
    state.nextOffset = 0;
    state.hasMore = false;
    state.candidatesScanned = 0;
    state.filteredOut = 0;
    state.sourceTotal = null;
    state.retrievableTotal = null;
    resultsRoot.classList.add('loading');
    resultsRoot.innerHTML = '<span>Scanning</span><p>Finding source inventory and keeping only records clean enough for the UltraHype item experience…</p>';
  } else {
    renderResults();
  }

  try {
    const params = new URLSearchParams({ limit: String(CLEAN_BATCH_SIZE), offset: String(append ? (state.nextOffset || 0) : 0) });
    if (state.query) params.set('q', state.query);
    if (state.categoryId) params.set('category_id', state.categoryId);
    if (state.seller) params.set('seller', state.seller);
    const payload = await apiFetch(`${ebay.searchPath || '/api/commerce/ebay/search'}?${params.toString()}`);
    const incoming = Array.isArray(payload.items) ? payload.items : [];
    state.items = append ? mergeUnique(state.items, incoming) : incoming;
    state.nextOffset = payload.nextOffset ?? null;
    state.hasMore = Boolean(payload.hasMore && payload.nextOffset != null);
    state.candidatesScanned += Number(payload.candidatesChecked || 0);
    state.filteredOut += Number(payload.filteredOut || 0);
    state.sourceTotal = payload.total ?? state.sourceTotal;
    state.retrievableTotal = payload.retrievableTotal ?? state.retrievableTotal;
    state.loading = false;
    renderResults();
  } catch (error) {
    state.loading = false;
    if (append && state.items.length) {
      renderResults();
      showToast(`Could not load the next clean batch: ${error.message}`);
    } else {
      resultsRoot.classList.remove('loading');
      resultsRoot.innerHTML = `<span>Connector unavailable</span><p>${escapeHtml(error.message)}</p>`;
    }
  }
}

function startQuerySearch(query) {
  const value = String(query || '').trim();
  if (!value) return;
  state.query = value;
  state.categoryId = '';
  state.categoryName = '';
  state.seller = '';
  if (searchInput) searchInput.value = value;
  if (resultsTitle) resultsTitle.textContent = `Search: ${value}`;
  if (resultsCopy) resultsCopy.textContent = 'Specific search stays direct: scan the source, reject incomplete records, and keep loading clean listings.';
  sendActivity('search', { query: value });
  performSearch();
  document.getElementById('connected')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function startCategorySearch(category) {
  state.query = '';
  state.categoryId = String(category.id || '');
  state.categoryName = String(category.name || 'Category');
  state.seller = '';
  if (searchInput) searchInput.value = '';
  if (resultsTitle) resultsTitle.textContent = state.categoryName;
  if (resultsCopy) resultsCopy.textContent = 'Browsing a connected marketplace category through the same clean-result filter used by specific search.';
  sendActivity('category_view', { categoryId: state.categoryId, categoryName: state.categoryName });
  performSearch();
  document.getElementById('connected')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function startSellerSearch(seller) {
  const value = String(seller || '').trim();
  if (!value) return;
  state.query = '';
  state.categoryId = '';
  state.categoryName = '';
  state.seller = value;
  if (searchInput) searchInput.value = '';
  if (resultsTitle) resultsTitle.textContent = `Seller: ${value}`;
  if (resultsCopy) resultsCopy.textContent = 'Connected items from this seller, filtered through the same UltraHype clean-inventory policy.';
  performSearch();
  document.getElementById('connected')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadStatus() {
  try {
    const payload = await apiFetch('/api/commerce/ebay/status');
    if (providerLabel) providerLabel.textContent = `eBay · ${payload.marketplace || 'connected marketplace'}`;
    if (environmentLabel) environmentLabel.textContent = String(payload.environment || ebay.environment || 'sandbox').toUpperCase();
  } catch {
    if (environmentLabel) environmentLabel.textContent = String(ebay.environment || 'sandbox').toUpperCase();
  }
}

async function loadCategories() {
  if (!categoriesRoot) return;
  try {
    const payload = await apiFetch('/api/commerce/ebay/categories');
    const categories = Array.isArray(payload.categories) ? payload.categories : [];
    if (!categories.length) throw new Error('No categories returned');
    categoriesRoot.innerHTML = categories.map((category, index) => `<button class="marketplace-category" type="button" data-category-id="${escapeHtml(category.id)}" data-category-name="${escapeHtml(category.name)}"><small>CATEGORY ${String(index + 1).padStart(2, '0')}</small><strong>${escapeHtml(category.name)}</strong><span>Browse connected inventory</span></button>`).join('');
    categoriesRoot.querySelectorAll('.marketplace-category').forEach((button) => {
      button.addEventListener('click', () => startCategorySearch({ id: button.dataset.categoryId, name: button.dataset.categoryName }));
    });
  } catch (error) {
    const fallback = ['Tools', 'Cars', 'Shoes', 'Electronics', 'Collectibles', 'Home & Garden', 'Business & Industrial', 'Computers'];
    categoriesRoot.innerHTML = fallback.map((name, index) => `<button class="marketplace-category" type="button" data-fallback-query="${escapeHtml(name)}"><small>DISCOVERY LANE ${String(index + 1).padStart(2, '0')}</small><strong>${escapeHtml(name)}</strong><span>Taxonomy unavailable · use connected search</span></button>`).join('');
    categoriesRoot.querySelectorAll('[data-fallback-query]').forEach((button) => button.addEventListener('click', () => startQuerySearch(button.dataset.fallbackQuery)));
  }
}

async function loadTrending() {
  if (!trendingRoot) return;
  try {
    const payload = await apiFetch('/api/commerce/activity/trending?window_minutes=1440&limit=12');
    const items = Array.isArray(payload.items) ? payload.items : [];
    trendingRoot.innerHTML = items.length
      ? items.map((item) => signalCard(item, 'TRENDING ON ULTRAHYPE')).join('')
      : '<div class="marketplace-empty">No item has enough UltraHype activity yet to call it trending. Open connected products and this rail will begin filling with real signal.</div>';
  } catch {
    trendingRoot.innerHTML = '<div class="marketplace-empty">The UltraHype trend signal is temporarily unavailable.</div>';
  }
}

async function loadLive() {
  if (!liveRoot) return;
  try {
    const payload = await apiFetch('/api/commerce/activity/live?window_minutes=15&limit=12');
    const items = Array.isArray(payload.items) ? payload.items : [];
    liveRoot.innerHTML = items.length
      ? items.map((item) => signalCard(item, 'VIEWED RECENTLY')).join('')
      : '<div class="marketplace-empty">No connected-item views in the recent window yet. This becomes a real pulse as people browse UltraHype.</div>';
  } catch {
    liveRoot.innerHTML = '<div class="marketplace-empty">Recent-view activity is temporarily unavailable.</div>';
  }
}

async function loadSellers() {
  if (!sellerRoot) return;
  try {
    const payload = await apiFetch('/api/commerce/activity/sellers?window_minutes=1440&limit=9');
    const sellers = Array.isArray(payload.sellers) ? payload.sellers : [];
    sellerRoot.innerHTML = sellers.length ? sellers.map((seller) => {
      const thumbs = (seller.recentItems || []).map((item) => safeExternalUrl(item.imageUrl) ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || seller.seller)}" loading="lazy" />` : '').join('');
      return `<article class="seller-card">
        <div class="seller-card-top"><div><small>SELLER ATTENTION</small><h3>${escapeHtml(seller.seller)}</h3></div><span class="seller-card-count">${seller.viewers} viewer${seller.viewers === 1 ? '' : 's'}</span></div>
        <div class="seller-card-stats"><span>${seller.views} item views</span><span>${seller.itemCount} explored item${seller.itemCount === 1 ? '' : 's'}</span></div>
        <div class="seller-card-items">${thumbs || '<span class="marketplace-empty">Recent items</span>'}</div>
        <button type="button" data-seller="${escapeHtml(seller.seller)}">Explore seller inventory →</button>
      </article>`;
    }).join('') : '<div class="marketplace-empty">Seller spotlight will populate from real UltraHype item exploration.</div>';
    sellerRoot.querySelectorAll('[data-seller]').forEach((button) => button.addEventListener('click', () => startSellerSearch(button.dataset.seller)));
  } catch {
    sellerRoot.innerHTML = '<div class="marketplace-empty">Seller attention is temporarily unavailable.</div>';
  }
}

async function loadFreshDiscoveries() {
  if (!freshRoot) return;
  const seeds = ['tools', 'cars', 'shoes'];
  try {
    const payloads = await Promise.all(seeds.map(async (query) => {
      const params = new URLSearchParams({ q: query, limit: '4', offset: '0' });
      const payload = await apiFetch(`${ebay.searchPath || '/api/commerce/ebay/search'}?${params.toString()}`);
      return (Array.isArray(payload.items) ? payload.items : []).slice(0, 4).map((item) => ({ ...item, seedQuery: query }));
    }));
    const map = new Map();
    for (const item of payloads.flat()) if (item?.id && !map.has(item.id)) map.set(item.id, item);
    const items = [...map.values()].slice(0, 12);
    items.forEach(cacheItem);
    freshRoot.innerHTML = items.length
      ? items.map((item) => signalCard({ itemId: item.id, title: item.title, imageUrl: item.imageUrl || item.image, price: item.price, condition: item.condition, seller: item.seller?.username || null, query: item.seedQuery }, 'FRESH DISCOVERY')).join('')
      : '<div class="marketplace-empty">No clean fresh discoveries were returned from the connected Sandbox mix.</div>';
  } catch {
    freshRoot.innerHTML = '<div class="marketplace-empty">Fresh connected discovery is temporarily unavailable.</div>';
  }
}

if (searchButton) searchButton.addEventListener('click', () => startQuerySearch(searchInput?.value));
if (searchInput) searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') startQuerySearch(searchInput.value);
});

Promise.allSettled([
  loadStatus(),
  loadCategories(),
  loadTrending(),
  loadLive(),
  loadSellers(),
  loadFreshDiscoveries()
]);
