const config = window.ULTRAHYPE_CONFIG || {};
const root = document.getElementById('market-item-root');
const params = new URLSearchParams(window.location.search);
const itemId = params.get('id') || '';
const sourceQuery = params.get('q') || '';

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

function cacheKey(id) {
  return `ultrahype.market-item.${id}`;
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

async function recoverFromSearch(id, query) {
  const ebay = config.integrations?.ebay;
  const apiBase = String(config.apiBase || '').replace(/\/$/, '');
  if (!id || !query || !ebay?.enabled || !apiBase || !ebay.searchPath) return null;

  const url = new URL(`${apiBase}${ebay.searchPath}`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '24');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  const payload = await response.json();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const item = items.find((candidate) => String(candidate.id) === id) || null;
  if (item) writeCachedItem(item);
  return item;
}

function renderError(title, message) {
  if (!root) return;
  root.innerHTML = `<section class="market-item-error">
    <span class="kicker">CONNECTED ITEM</span>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <div class="hero-actions"><a class="button primary" href="index.html#ebay">Back to connected inventory</a></div>
  </section>`;
}

function renderItem(item) {
  if (!root) return;
  const production = String(config.integrations?.ebay?.environment || 'sandbox').toLowerCase() === 'production';
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

  root.innerHTML = `<a class="market-item-back" href="index.html#ebay">← Back to connected inventory</a>
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
}

async function init() {
  if (!itemId) {
    renderError('Item reference missing.', 'Return to connected inventory and open an item from the UltraHype search results.');
    return;
  }

  let item = readCachedItem(itemId);
  if (!item && sourceQuery) {
    try {
      item = await recoverFromSearch(itemId, sourceQuery);
    } catch {}
  }

  if (!item) {
    renderError('This source item could not be resolved.', 'The source listing may have changed, ended, or the local item cache may have expired. Return to connected inventory and run the search again.');
    return;
  }

  renderItem(item);
}

init();
