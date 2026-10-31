'use strict';
/**
 * UH 3+9 shelf. Three pinned commercial/editorial discovery positions,
 * followed by up to nine daily-shuffled marketplace listings.
 * Paid partner slots require explicit, reviewed configuration and
 * a fresh marketplace verification. No fabricated listings or deals.
 */
(() => {
  const root = document.getElementById('uh-pokemon-shelf');
  if (!root) return;
  const featuredRoot = document.getElementById('uh-featured-grid');
  const freshRoot = document.getElementById('uh-fresh-grid');
  const notice = document.getElementById('uh-shelf-status');
  const refreshButton = document.getElementById('uh-refresh-discoveries');
  const featuredCount = document.getElementById('uh-featured-count');
  const freshCount = document.getElementById('uh-fresh-count');

  const sources = Object.freeze([
    { label: 'Singles', query: 'Pokemon TCG single card' },
    { label: 'Graded', query: 'Pokemon PSA graded card' },
    { label: 'Sealed', query: 'Pokemon TCG sealed booster box' }
  ]);
  const config = window.ULTRAHYPE_CONFIG || {};
  const base = String(config.apiBase || '').replace(/\/$/, '');
  let reserved = new Set();
  let discoveryPool = [];
  let refreshIndex = 0;
  let verified = false;
  let loadGeneration = 0;

  const e = (tag, cls, txt) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (txt != null) el.textContent = String(txt);
    return el;
  };
  const validHttps = value => {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  };
  const isPokemon = item => {
    const name = String(item?.title || '');
    return /\bpok[eé]mon\b/i.test(name)
      && !/\b(proxy|replica|custom card|digital code|code card|empty box|box only|fake|unofficial|fan art|mystery|random pull|lottery|break spot|read description)\b/i.test(name);
  };
  const isValid = item => {
    const n = Number(item?.price?.value);
    return Boolean(
      item?.id && isPokemon(item) && item?.seller?.username &&
      Number.isFinite(n) && n > 0 && n < 100000 &&
      validHttps(item.imageUrl || item.image) && validHttps(item.itemWebUrl)
    );
  };
  const dedup = items => {
    const found = new Set();
    return items.filter(x => { const id = String(x.id); if (found.has(id)) return false; found.add(id); return true; });
  };
  const safeFetch = async (url, ms = 13000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetch(url, { headers: {Accept:'application/json'}, signal: controller.signal });
      if (!response.ok) throw new Error('Source unavailable');
      return await response.json();
    } finally { clearTimeout(timeout); }
  };
  const currency = price => {
    try { return new Intl.NumberFormat('en-US', {style:'currency', currency:String(price.currency || 'USD')}).format(Number(price.value)); }
    catch { return String(price.value) + ' ' + String(price.currency || 'USD'); }
  };
  const itemLink = (item, query) => '../../market-item.html?' + new URLSearchParams({id:String(item.id), q:query});

  // No implied payment: only approved, date-scoped and seller-matched registry entries can be labeled Sponsored or Partner.
  const activePlacements = async () => {
    try {
      const documentData = await safeFetch('./featured-placements.json', 7000);
      const entries = Array.isArray(documentData?.placements) ? documentData.placements : [];
      const now = Date.now();
      return entries.filter(p =>
        p && p.approved === true && ['sponsored', 'partner'].includes(p.kind)
        && typeof p.itemId === 'string' && p.itemId.length < 160
        && typeof p.sellerUsername === 'string' && p.sellerUsername.trim().length > 0
        && Number.isFinite(Date.parse(p.startsAt)) && Number.isFinite(Date.parse(p.endsAt))
        && now >= Date.parse(p.startsAt) && now < Date.parse(p.endsAt)
      ).slice(0, 3);
    } catch { return []; }
  };
  const verifyPartnerItem = async placement => {
    try {
      const info = await safeFetch(base + '/api/commerce/ebay/item/' + encodeURIComponent(placement.itemId));
      const item = info?.item;
      if (String(info?.environment || '').toLowerCase() !== 'production' || !isValid(item)) return null;
      if (String(item.id) !== placement.itemId) return null;
      if (String(item.seller.username).toLowerCase() !== String(placement.sellerUsername).toLowerCase()) return null;
      return { item, label: placement.kind === 'sponsored' ? 'Sponsored' : 'Promotional partner',
        note: placement.kind === 'sponsored' ? 'Paid placement' : 'Promotional partnership',
        query: 'Pokemon trading cards' };
    } catch { return null; }
  };
  function card({item, label, note, query}, index) {
    const card = e('article', 'uh-merch-card');
    const media = e('a', 'uh-merch-media');
    media.href = itemLink(item, query);
    media.setAttribute('aria-label', 'View details: ' + item.title);
    const img = e('img');
    img.src = validHttps(item.imageUrl || item.image);
    img.alt = String(item.title || 'Pokémon trading-card listing');
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove(), {once:true});
    media.appendChild(img);
    const details = e('div', 'uh-merch-details');
    const type = e('span', 'uh-merch-type', label);
    details.appendChild(type);
    const title = e('h4', '', item.title);
    details.appendChild(title);
    details.appendChild(e('p', 'uh-merch-price', currency(item.price)));
    details.appendChild(e('p', 'uh-merch-meta', 'Seller: ' + item.seller.username + ' · ' + (item.condition || 'Check condition')));
    details.appendChild(e('p', 'uh-merch-note', note));
    const link = e('a', 'uh-merch-link', 'Review item ↗');
    link.href = itemLink(item, query);
    details.appendChild(link);
    card.append(media,details);
    card.dataset.position = String(index + 1);
    return card;
  }
  function seedInt(s) {
    let h = 2166136261;
    for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seededShuffle(items, seedString) {
    const result = [...items];
    let state = seedInt(seedString) || 1;
    const next = () => {state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296;};
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i+1)); [result[i],result[j]]=[result[j],result[i]];
    }
    return result;
  }
  function refreshFresh() {
    if (!verified) return;
    const date = new Date().toISOString().slice(0,10);
    const rotated = seededShuffle(discoveryPool, date + '|pokemon|' + refreshIndex);
    const selected = rotated.slice(0,9);
    freshRoot.replaceChildren();
    selected.forEach((x,i) => freshRoot.appendChild(card({item:x.item, label:'Marketplace discovery', note:'Rotating source listing · not independently reviewed', query:x.query},i + 3)));
    freshCount.textContent = String(selected.length);
    notice.textContent = selected.length ? 'Fresh discoveries are randomly rotated within real, Pokémon-related eBay results. No paid ordering applies to this section.' : 'No verified fresh listings met our product filters right now.';
    refreshButton.disabled = rotated.length <= 1;
  }
  async function load() {
    if (!base || !validHttps(base)) { notice.textContent = 'Marketplace API is not configured.'; return; }
    const generation = ++loadGeneration;
    featuredRoot.replaceChildren();freshRoot.replaceChildren();
    featuredCount.textContent='0';freshCount.textContent='0';
    verified = false;refreshButton.disabled=true;
    notice.textContent='Verifying the live marketplace before showing any listings…';
    try {
      const status = await safeFetch(base + '/api/commerce/ebay/status');
      if (!(status?.ok && status?.tokenValid && String(status.environment).toLowerCase() === 'production'))
        throw new Error('Verified production marketplace inventory is unavailable.');
      const [configured, searchResponses] = await Promise.all([
        activePlacements(),
        Promise.allSettled(sources.map(async src => {
          const params = new URLSearchParams({q:src.query, limit:'16', offset:'0'});
          const response = await safeFetch(base + '/api/commerce/ebay/search?' + params.toString(), 22000);
          if (String(response.environment || '').toLowerCase() !== 'production') throw new Error('Source is not production');
          return {source:src, items:(Array.isArray(response.items)?response.items:[]).filter(isValid)};
        }))
      ]);
      if (generation !== loadGeneration) return;
      const successes = searchResponses.filter(x => x.status === 'fulfilled').map(x => x.value);
      if (!successes.length) throw new Error('Live Pokémon marketplace searches are temporarily unavailable.');
      const pool = dedup(successes.flatMap(g => g.items.map(item=>({...item, _uhQuery:g.source.query, _uhCategory:g.source.label}))));
      let picks = [];
      const configs = await Promise.all(configured.map(verifyPartnerItem));
      for (const matched of configs) {
        if (!matched || picks.some(x => String(x.item.id) === String(matched.item.id))) continue;
        picks.push(matched);
        if (picks.length === 3) break;
      }
      for (const group of successes) {
        const item = group.items.find(x => !picks.some(p => String(p.item.id) === String(x.id)));
        if (item && picks.length < 3) picks.push({item,label:validHttps(item.affiliateWebUrl) ? 'Featured affiliate pick' : 'Featured editorial pick',note:'Editorial selection · UltraHype may receive commission from qualifying purchases',query:group.source.query});
      }
      for (const item of pool) {
        if (picks.length >= 3) break;
        if (!picks.some(x => String(x.item.id) === String(item.id)))
          picks.push({item,label:validHttps(item.affiliateWebUrl) ? 'Featured affiliate pick' : 'Featured editorial pick',note:'Editorial selection · UltraHype may receive commission from qualifying purchases',query:item._uhQuery});
      }
      reserved = new Set(picks.map(x => String(x.item.id)));
      featuredRoot.replaceChildren();
      picks.forEach((x,i) => featuredRoot.appendChild(card(x,i)));
      featuredCount.textContent = String(picks.length);
      discoveryPool = pool.filter(item => !reserved.has(String(item.id))).map(item => ({item,query:item._uhQuery}));
      verified = true;
      refreshIndex = 0;
      refreshFresh();
      if (!picks.length) notice.textContent = 'No qualifying listings were returned. No placeholder products were inserted.';
    } catch(err) {
      if (generation !== loadGeneration) return;
      featuredRoot.replaceChildren();freshRoot.replaceChildren();
      featuredCount.textContent='0';freshCount.textContent='0';
      notice.textContent = (err?.name === 'AbortError') ? 'Marketplace timed out. Open the full marketplace to try again.' : String(err?.message || 'Marketplace unavailable. No example prices are shown.');
    }
  }
  refreshButton?.addEventListener('click', () => {refreshIndex += 1;refreshFresh();});
  document.getElementById('uh-retry-shelf')?.addEventListener('click',load);
  load();
})();
