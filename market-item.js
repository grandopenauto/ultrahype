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

function browseContextKey(query) {
  return `ultrahype.market-browse.${String(query || '').trim().toLowerCase()}`;
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

function readBrowseContext(query) {
  if (!query) return null;
  try {
    const raw = sessionStorage.getItem(browseContextKey(query));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const age = Date.now() - Number(parsed?.savedAt || 0);
    if (!parsed || !Array.isArray(parsed.items) || (Number.isFinite(age) && age > 30 * 60 * 1000)) {
      sessionStorage.removeItem(browseContextKey(query));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeBrowseContext(query, items) {
  if (!query || !Array.isArray(items) || !items.length) return null;
  const cleanItems = items.filter((item) => item?.id);
  cleanItems.forEach(writeCachedItem);
  const context = {
    query,
    items: cleanItems.map((item) => ({
      id: String(item.id),
      title: item.title || 'Connected item'
    })),
    savedAt: Date.now()
  };
  try {
    sessionStorage.setItem(browseContextKey(query), JSON.stringify(context));
  } catch {}
  return context;
}

function detailUrl(id, query = sourceQuery) {
  const nextParams = new URLSearchParams({ id: String(id) });
  if (query) nextParams.set('q', query);
  return `market-item.html?${nextParams.toString()}`;
}

async function fetchSearchItems(query, limit = 8) {
  const ebay = config.integrations?.ebay;
  const apiBase = String(config.apiBase || '').replace(/\/$/, '');
  if (!query || !ebay?.enabled || !apiBase || !ebay.searchPath) return [];

  const url = new URL(`${apiBase}${ebay.searchPath}`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

async function recoverFromSearch(id, query) {
  const items = await fetchSearchItems(query, 8);
  if (!items.length) return null;
  writeBrowseContext(query, items);
  return items.find((candidate) => String(candidate.id) === id) || null;
}

async function ensureBrowseContext(query) {
  if (!query) return null;
  const cached = readBrowseContext(query);
  if (cached?.items?.some((item) => item.id === itemId)) return cached;
  try {
    const items = await fetchSearchItems(query, 8);
    if (!items.length) return cached;
    return writeBrowseContext(query, items);
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
    <div class="hero-actions"><a class="button primary" href="index.html#ebay">Back to connected inventory</a></div>
  </section>`;
}

function renderSequenceControls(sequence) {
  if (!sequence || sequence.index < 0 || sequence.total < 2) return '';

  const previous = sequence.previous;
  const next = sequence.next;
  const previousHref = previous ? detailUrl(previous.id) : '';
  const nextHref = next ? detailUrl(next.id) : '';

  return `<nav class="market-sequence" aria-label="Browse connected search results">
    ${previous
      ? `<a class="market-sequence-link prev" href="${escapeHtml(previousHref)}" title="${escapeHtml(previous.title)}"><span class="market-sequence-arrow">←</span><span><small>PREVIOUS</small><strong>${escapeHtml(previous.title)}</strong></span></a>`
      : '<span class="market-sequence-link prev disabled" aria-disabled="true"><span class="market-sequence-arrow">←</span><span><small>PREVIOUS</small><strong>Start of results</strong></span></span>'}
    <div class="market-sequence-count"><strong>${sequence.index + 1}</strong><span>/</span><strong>${sequence.total}</strong><small>${sourceQuery ? escapeHtml(sourceQuery) : 'CONNECTED RESULTS'}</small></div>
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

  root.innerHTML = `<a class="market-item-back" href="index.html#ebay">← Back to connected inventory</a>
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
      if (event.key === 'ArrowLeft' && sequence.previous) {
        window.location.href = detailUrl(sequence.previous.id);
      }
      if (event.key === 'ArrowRight' && sequence.next) {
        window.location.href = detailUrl(sequence.next.id);
      }
    }, { once: false });
  }
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

  let browseContext = readBrowseContext(sourceQuery);
  if (sourceQuery && (!browseContext || !browseContext.items?.some((candidate) => candidate.id === String(item.id)))) {
    browseContext = await ensureBrowseContext(sourceQuery);
  }

  renderItem(item, browseContext);
}

init();
