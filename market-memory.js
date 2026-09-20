(() => {
  const config = window.ULTRAHYPE_CONFIG || {};
  const apiBase = String(config.apiBase || '').replace(/\/$/, '');
  const ebay = config.integrations?.ebay || {};
  const root = document.getElementById('market-memory-results');
  const categoryName = String(document.body?.dataset?.categoryName || '').trim();
  if (!root || !apiBase || !categoryName) return;

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const safeUrl = (value) => {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  };

  const money = (price) => {
    const value = Number(price?.value);
    const currency = String(price?.currency || 'USD').toUpperCase();
    if (!Number.isFinite(value)) return 'Price unavailable';
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value); }
    catch { return `${currency} ${value.toFixed(2)}`; }
  };

  const slug = (value) => String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  function detailUrl(item) {
    const params = new URLSearchParams({ id: String(item.id || '') });
    if (categoryName) params.set('category_name', categoryName);
    if (item.categoryId) params.set('category_id', String(item.categoryId));
    return `../../../market-item.html?${params.toString()}`;
  }

  function card(item) {
    const image = safeUrl(item.imageUrl || item.image);
    const href = detailUrl(item);
    const environment = String(ebay.environment || 'sandbox').toLowerCase();
    return `<article class="ebay-card">
      <a class="ebay-card-media ${image ? '' : 'image-missing'}" href="${escapeHtml(href)}">
        <span class="ebay-source-chip">${environment === 'production' ? 'EBAY' : 'EBAY SANDBOX'}</span>
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.title || categoryName)}" loading="lazy" referrerpolicy="no-referrer" />` : ''}
      </a>
      <div class="ebay-card-body">
        <div class="ebay-card-meta"><span>${escapeHtml(item.condition || 'Condition unavailable')}</span><span class="ebay-card-price">${escapeHtml(money(item.price))}</span></div>
        <h4><a href="${escapeHtml(href)}">${escapeHtml(item.title || 'Connected item')}</a></h4>
        <div class="ebay-card-sub">${escapeHtml(item.seller?.username ? `Seller: ${item.seller.username}` : categoryName)}</div>
        <div class="ebay-card-actions"><a href="${escapeHtml(href)}">Open details →</a><a class="intel-link" href="${escapeHtml(href)}#opportunity">UltraHype it</a></div>
      </div>
    </article>`;
  }

  async function getJson(path) {
    const response = await fetch(`${apiBase}${path}`, { headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `Request failed (${response.status})`);
    return payload;
  }

  async function init() {
    try {
      const cats = await getJson('/api/commerce/ebay/categories');
      const categories = Array.isArray(cats.categories) ? cats.categories : [];
      const target = categories.find((entry) => slug(entry.name) === slug(categoryName));
      const params = new URLSearchParams({ limit: '12', offset: '0' });
      if (target?.id) params.set('category_id', String(target.id));
      else params.set('q', categoryName);
      const payload = await getJson(`${ebay.searchPath || '/api/commerce/ebay/search'}?${params.toString()}`);
      const items = Array.isArray(payload.items) ? payload.items : [];
      items.forEach((item) => {
        try { sessionStorage.setItem(`ultrahype.market-item.${item.id}`, JSON.stringify({ item, savedAt: Date.now() })); } catch {}
      });
      root.classList.add('active', 'market-results-mode');
      root.innerHTML = items.length
        ? `<div class="market-result-head"><span>${items.length} current clean listings</span><small>Source data refreshed at request time</small></div><div class="ebay-result-grid">${items.map(card).join('')}</div>`
        : '<span>No clean listings</span><p>This durable page remains available even when the current connected source has no qualifying inventory.</p>';
    } catch (error) {
      root.innerHTML = `<span>Market memory online</span><p>Current connected inventory is temporarily unavailable. The durable category page remains intact. ${escapeHtml(error.message)}</p>`;
    }
  }

  init();
})();
