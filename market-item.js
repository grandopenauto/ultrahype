const config = window.ULTRAHYPE_CONFIG || {};
const root = document.getElementById('market-item-root');
const params = new URLSearchParams(window.location.search);
const itemId = params.get('id') || '';
const sourceQuery = params.get('q') || '';
const sourceCategoryId = params.get('category_id') || '';
const sourceCategoryName = params.get('category_name') || '';
const sourceSeller = params.get('seller') || '';
const sourceContextLabel = sourceQuery || sourceCategoryName || sourceSeller || 'connected';
const apiBase = String(config.apiBase || '').replace(/\/$/, '');

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
  const number = Number(price.value);
  if (Number.isFinite(number)) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(number);
    } catch {}
  }
  return `${currency} ${price.value}`;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Source-controlled';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
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

const activitySessionId = getSessionId();

function sendItemView(item) {
  if (!apiBase || !item?.id) return;
  fetch(`${apiBase}/api/commerce/activity/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      type: 'item_view',
      sessionId: activitySessionId,
      itemId: item.id,
      title: item.title || null,
      imageUrl: item.imageUrl || item.image || null,
      price: item.price || null,
      condition: item.condition || null,
      seller: item.seller?.username || null,
      query: sourceQuery || null,
      categoryId: sourceCategoryId || item.categoryId || null,
      categoryName: sourceCategoryName || null
    }),
    keepalive: true
  }).catch(() => {});
}

function cacheKey(id) {
  return `ultrahype.market-item.${id}`;
}

function browseContextKey(label = sourceContextLabel) {
  return `ultrahype.market-browse.${String(label || 'connected').trim().toLowerCase()}`;
}

function readCachedItem(id) {
  try {
    const raw = sessionStorage.getItem(cacheKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.item) return null;
    const age = Date.now() - Number(parsed.savedAt || 0);
    if (Number.isFinite(age) && age > 30 * 60 * 1000) {
      sessionStorage.removeItem(cacheKey(id));
      return null;
    }
    return parsed.item;
  } catch {
    return null;
  }
}

function writeCachedItem(item) {
  if (!item?.id) return;
  try {
    sessionStorage.setItem(cacheKey(item.id), JSON.stringify({ item, savedAt: Date.now() }));
  } catch {}
}

function readBrowseContext(label = sourceContextLabel) {
  try {
    const raw = sessionStorage.getItem(browseContextKey(label));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const age = Date.now() - Number(parsed?.savedAt || 0);
    if (!parsed || !Array.isArray(parsed.items) || (Number.isFinite(age) && age > 30 * 60 * 1000)) {
      sessionStorage.removeItem(browseContextKey(label));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeBrowseContext(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const cleanItems = items.filter((item) => item?.id);
  cleanItems.forEach(writeCachedItem);
  const context = {
    query: sourceQuery,
    categoryId: sourceCategoryId,
    categoryName: sourceCategoryName,
    seller: sourceSeller,
    items: cleanItems.map((item) => ({ id: String(item.id), title: item.title || 'Connected item' })),
    savedAt: Date.now()
  };
  try {
    sessionStorage.setItem(browseContextKey(), JSON.stringify(context));
  } catch {}
  return context;
}

function detailUrl(id) {
  const nextParams = new URLSearchParams({ id: String(id) });
  if (sourceQuery) nextParams.set('q', sourceQuery);
  if (sourceCategoryId) nextParams.set('category_id', sourceCategoryId);
  if (sourceCategoryName) nextParams.set('category_name', sourceCategoryName);
  if (sourceSeller) nextParams.set('seller', sourceSeller);
  return `market-item.html?${nextParams.toString()}`;
}

async function fetchSearchItems(limit = 12) {
  const ebay = config.integrations?.ebay;
  if (!ebay?.enabled || !apiBase || !ebay.searchPath) return [];
  if (!sourceQuery && !sourceCategoryId && !sourceSeller) return [];

  const url = new URL(`${apiBase}${ebay.searchPath}`);
  if (sourceQuery) url.searchParams.set('q', sourceQuery);
  if (sourceCategoryId) url.searchParams.set('category_id', sourceCategoryId);
  if (sourceSeller) url.searchParams.set('seller', sourceSeller);
  url.searchParams.set('limit', String(limit));
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

async function recoverFromBrowse(id) {
  const items = await fetchSearchItems(12);
  if (!items.length) return null;
  writeBrowseContext(items);
  return items.find((candidate) => String(candidate.id) === id) || null;
}

async function recoverFromItemEndpoint(id) {
  if (!apiBase || !id) return null;
  try {
    const response = await fetch(`${apiBase}/api/commerce/ebay/item/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const payload = await response.json();
    const item = payload?.item || null;
    if (item) writeCachedItem(item);
    return item;
  } catch {
    return null;
  }
}

async function ensureBrowseContext() {
  const cached = readBrowseContext();
  if (cached?.items?.some((item) => item.id === itemId)) return cached;
  try {
    const items = await fetchSearchItems(12);
    if (!items.length) return cached;
    return writeBrowseContext(items);
  } catch {
    return cached;
  }
}

function getSequenceState(context, id) {
  const items = Array.isArray(context?.items) ? context.items : [];
  const index = items.findIndex((item) => String(item.id) === String(id));
  if (index < 0) return { index: -1, total: items.length, previous: null, next: null };
  return {
    index,
    total: items.length,
    previous: index > 0 ? items[index - 1] : null,
    next: index < items.length - 1 ? items[index + 1] : null
  };
}

function renderError(title, message) {
  if (!root) return;
  root.innerHTML = `<section class="market-item-error">
    <span class="kicker">CONNECTED ITEM</span>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <div class="hero-actions"><a class="button primary" href="marketplace.html#connected">Back to marketplace</a></div>
  </section>`;
}

function renderSequenceControls(sequence) {
  if (!sequence || sequence.index < 0 || sequence.total < 2) return '';
  const previous = sequence.previous;
  const next = sequence.next;
  const previousHref = previous ? detailUrl(previous.id) : '';
  const nextHref = next ? detailUrl(next.id) : '';
  const contextName = sourceQuery || sourceCategoryName || sourceSeller || 'CONNECTED RESULTS';

  return `<nav class="market-sequence" aria-label="Browse connected search results">
    ${previous
      ? `<a class="market-sequence-link prev" href="${escapeHtml(previousHref)}" title="${escapeHtml(previous.title)}"><span class="market-sequence-arrow">←</span><span><small>PREVIOUS</small><strong>${escapeHtml(previous.title)}</strong></span></a>`
      : '<span class="market-sequence-link prev disabled" aria-disabled="true"><span class="market-sequence-arrow">←</span><span><small>PREVIOUS</small><strong>Start of results</strong></span></span>'}
    <div class="market-sequence-count"><strong>${sequence.index + 1}</strong><span>/</span><strong>${sequence.total}</strong><small>${escapeHtml(contextName)}</small></div>
    ${next
      ? `<a class="market-sequence-link next" href="${escapeHtml(nextHref)}" title="${escapeHtml(next.title)}"><span><small>NEXT</small><strong>${escapeHtml(next.title)}</strong></span><span class="market-sequence-arrow">→</span></a>`
      : '<span class="market-sequence-link next disabled" aria-disabled="true"><span><small>NEXT</small><strong>End of results</strong></span><span class="market-sequence-arrow">→</span></span>'}
  </nav>
  ${previous ? `<a class="market-edge-arrow left" href="${escapeHtml(previousHref)}" aria-label="Previous item" title="Previous: ${escapeHtml(previous.title)}">←</a>` : ''}
  ${next ? `<a class="market-edge-arrow right" href="${escapeHtml(nextHref)}" aria-label="Next item" title="Next: ${escapeHtml(next.title)}">→</a>` : ''}`;
}

function renderItem(item, browseContext = null) {
  if (!root) return;
  const production = String(config.integrations?.ebay?.environment || 'sandbox').toLowerCase() === 'production';
  const sequence = getSequenceState(browseContext, item.id);
  const images = [...new Set([
    item.imageUrl,
    item.image,
    ...(Array.isArray(item.imageAlternates) ? item.imageAlternates : [])
  ].map(safeExternalUrl).filter(Boolean))];
  const mainImage = images[0] || '';
  const itemUrl = safeExternalUrl(item.itemWebUrl);
  const sellerName = item.seller?.username || 'Source seller';
  const feedback = item.seller?.feedbackPercentage != null
    ? `${item.seller.feedbackPercentage}% positive`
    : (item.seller?.feedbackScore != null ? `${item.seller.feedbackScore} feedback` : 'Seller details source-controlled');
  const buyingOptions = Array.isArray(item.buyingOptions) && item.buyingOptions.length
    ? item.buyingOptions.map((value) => String(value).replaceAll('_', ' ')).join(', ')
    : 'Source-controlled';
  const sourceLabel = production ? 'EBAY CONNECTED' : 'EBAY SANDBOX';
  const sourceButton = production ? 'View original listing on eBay ↗' : 'View test listing on eBay ↗';
  const condition = item.condition || 'Condition not supplied';
  const summary = production
    ? 'Connected marketplace inventory shown inside the UltraHype discovery layer before the transaction continues at the source listing.'
    : 'Sandbox test inventory shown inside the UltraHype discovery layer. This is not production eBay inventory.';

  document.title = `${item.title || 'Connected Item'} — UltraHype`;

  const thumbs = images.length > 1
    ? `<div class="market-gallery-thumbs">${images.map((src, index) => `<button class="market-gallery-thumb ${index === 0 ? 'active' : ''}" type="button" data-image="${escapeHtml(src)}" aria-label="View image ${index + 1}"><img src="${escapeHtml(src)}" alt="${escapeHtml(item.title || 'Connected item')} image ${index + 1}" loading="lazy" /></button>`).join('')}</div>`
    : '';

  root.innerHTML = `<a class="market-item-back" href="marketplace.html#connected">← Back to marketplace</a>
    ${renderSequenceControls(sequence)}
    <section class="market-item-shell">
      <div class="market-gallery">
        <div class="market-gallery-main">
          <span class="market-gallery-chip">${sourceLabel}</span>
          ${mainImage ? `<img id="market-main-image" src="${escapeHtml(mainImage)}" alt="${escapeHtml(item.title || 'Connected marketplace item')}" />` : ''}
        </div>
        ${thumbs}
      </div>

      <aside class="market-item-panel">
        <div class="market-item-source-line"><span>CONNECTED MARKETPLACE ITEM</span><span class="market-item-status">${production ? 'LIVE SOURCE' : 'SANDBOX'}</span></div>
        <h1>${escapeHtml(item.title || 'Untitled marketplace item')}</h1>
        <div class="market-item-price">${escapeHtml(formatMoney(item.price))}</div>
        <p class="market-item-summary">${escapeHtml(summary)}</p>

        <div class="market-item-facts">
          <div class="market-item-fact"><span>Condition</span><strong>${escapeHtml(condition)}</strong></div>
          <div class="market-item-fact"><span>Seller</span><strong>${escapeHtml(sellerName)} · ${escapeHtml(feedback)}</strong></div>
          <div class="market-item-fact"><span>Buying mode</span><strong>${escapeHtml(buyingOptions)}</strong></div>
          <div class="market-item-fact"><span>Listing end</span><strong>${escapeHtml(formatDate(item.itemEndDate))}</strong></div>
          <div class="market-item-fact"><span>Source ID</span><strong>${escapeHtml(item.id || 'Not supplied')}</strong></div>
        </div>

        <div class="market-item-actions">
          ${itemUrl ? `<a class="source" href="${escapeHtml(itemUrl)}" target="_blank" rel="noopener noreferrer">${sourceButton}</a>` : '<button class="source" type="button" disabled>Source listing unavailable</button>'}
          <a class="secondary" href="#opportunity">Explore opportunity layer ↓</a>
        </div>
        <p class="market-item-caution">Price, availability, condition and source details remain controlled by the marketplace listing. Confirm the source listing before transacting.</p>
      </aside>
    </section>

    <section id="opportunity" class="market-opportunity">
      <div class="market-opportunity-head">
        <div><span class="kicker">ULTRAHYPE OPPORTUNITY LAYER</span><h2>What else can this item become?</h2></div>
        <p>This is the bridge between ordinary marketplace discovery and the relationship intelligence we are building around products. Scores stay unpublished until backed by real methodology and data.</p>
      </div>
      <div class="market-opportunity-grid">
        <article class="market-opportunity-card"><small>FSHACKABILITY</small><strong>Not scored yet</strong><span>Future signals can evaluate demand, spread, competition, fees, prep burden and liquidity.</span></article>
        <article class="market-opportunity-card"><small>COLLECTION POTENTIAL</small><strong>Not scored yet</strong><span>Future collection intelligence can detect related pieces, missing items and potential set-completion value.</span></article>
        <article class="market-opportunity-card"><small>HYPESTACK FIT</small><strong>Relationship mapping next</strong><span>Connect this product to complementary hardware, software, AI, accessories and workflows.</span></article>
        <article class="market-opportunity-card"><small>BUSINESS LAUNCH</small><strong>Relationship mapping next</strong><span>Identify whether the item can anchor a practical service, resale or operating capability.</span></article>
      </div>
      <div class="market-source-note"><strong>Source-first architecture:</strong> UltraHype is not copying or storing the marketplace image. The detail view references the source-hosted image URL and keeps the original listing one click away.</div>
    </section>`;

  const main = document.getElementById('market-main-image');
  root.querySelectorAll('.market-gallery-thumb').forEach((button) => {
    button.addEventListener('click', () => {
      const src = safeExternalUrl(button.dataset.image);
      if (!src || !main) return;
      main.src = src;
      root.querySelectorAll('.market-gallery-thumb').forEach((thumb) => thumb.classList.remove('active'));
      button.classList.add('active');
    });
  });

  root.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => {
      if (img.id === 'market-main-image') img.style.opacity = '.12';
      else img.closest('.market-gallery-thumb')?.remove();
    }, { once: true });
  });

  if (sequence.index >= 0 && sequence.total > 1) {
    window.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
      if (event.key === 'ArrowLeft' && sequence.previous) window.location.href = detailUrl(sequence.previous.id);
      if (event.key === 'ArrowRight' && sequence.next) window.location.href = detailUrl(sequence.next.id);
    }, { once: false });
  }

  sendItemView(item);
}

async function init() {
  if (!itemId) {
    renderError('Item reference missing.', 'Return to the marketplace and open an item from connected inventory.');
    return;
  }

  let item = readCachedItem(itemId);
  if (!item && (sourceQuery || sourceCategoryId || sourceSeller)) {
    try { item = await recoverFromBrowse(itemId); } catch {}
  }
  if (!item) item = await recoverFromItemEndpoint(itemId);

  if (!item) {
    renderError('This source item could not be resolved.', 'The source listing may have changed, ended, or become unavailable. Return to the marketplace and browse again.');
    return;
  }

  let browseContext = readBrowseContext();
  if ((sourceQuery || sourceCategoryId || sourceSeller) && (!browseContext || !browseContext.items?.some((candidate) => candidate.id === String(item.id)))) {
    browseContext = await ensureBrowseContext();
  }

  renderItem(item, browseContext);
}

init();
