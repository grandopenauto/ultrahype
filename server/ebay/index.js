import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '128kb' }));

const PORT = Number(process.env.PORT || 4317);
const EBAY_ENV = (process.env.EBAY_ENV || 'sandbox').toLowerCase();
const APP_ID = process.env.APP_ID || '';
const CERT_ID = process.env.CERT_ID || '';
const EBAY_SCOPE = process.env.EBAY_SCOPE || 'https://api.ebay.com/oauth/api_scope';
const MARKETPLACE = process.env.EBAY_MARKETPLACE_ID || 'EBAY_US';
const CACHE_SECONDS = Math.max(30, Number(process.env.CACHE_SECONDS || 300));
const DETAIL_CACHE_SECONDS = Math.max(60, Number(process.env.DETAIL_CACHE_SECONDS || 900));
const RATE_LIMIT_PER_MINUTE = Math.max(1, Number(process.env.RATE_LIMIT_PER_MINUTE || 60));
const INTELLIGENCE_DIR = process.env.UH_INTELLIGENCE_DIR || path.resolve('..', 'data', 'ebay');
const ACTIVITY_DIR = process.env.UH_ACTIVITY_DIR || path.resolve('..', 'data', 'activity');
const ACTIVITY_FILE = path.join(ACTIVITY_DIR, 'events.ndjson');
const SOURCE_PAGE_SIZE = 50;
const MAX_SCAN_PAGES_PER_REQUEST = 4;
const EBAY_SEARCH_WINDOW = 10_000;
const ACTIVITY_MEMORY_LIMIT = 5000;
const ACTIVITY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CATEGORY_CACHE_MS = 6 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || 'https://ultrahype.store')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
);

const isSandbox = EBAY_ENV !== 'production';
const API_BASE = isSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
const TOKEN_URL = `${API_BASE}/identity/v1/oauth2/token`;
const BROWSE_URL = `${API_BASE}/buy/browse/v1/item_summary/search`;
const ITEM_URL = `${API_BASE}/buy/browse/v1/item`;
const TAXONOMY_DEFAULT_URL = `${API_BASE}/commerce/taxonomy/v1/get_default_category_tree_id`;
const TAXONOMY_TREE_URL = `${API_BASE}/commerce/taxonomy/v1/category_tree`;

let tokenCache = { token: null, expiresAt: 0 };
const searchCache = new Map();
const sourcePageCache = new Map();
const detailCache = new Map();
const rateBuckets = new Map();
let categoryCache = { payload: null, expiresAt: 0 };
let activityLoaded = false;
let activityEvents = [];

function requireConfig() {
  const missing = [];
  if (!APP_ID) missing.push('APP_ID');
  if (!CERT_ID) missing.push('CERT_ID');
  if (missing.length) {
    const err = new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
    err.status = 500;
    throw err;
  }
}

function applyCors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const bucket = rateBuckets.get(key) || { startedAt: now, count: 0 };
  if (now - bucket.startedAt >= 60_000) {
    bucket.startedAt = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > RATE_LIMIT_PER_MINUTE) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  next();
}

app.use(applyCors);
app.use(rateLimit);

async function getApplicationToken() {
  requireConfig();
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.expiresAt - 60_000) return tokenCache.token;

  const basic = Buffer.from(`${APP_ID}:${CERT_ID}`, 'utf8').toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: EBAY_SCOPE });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body,
    signal: AbortSignal.timeout(15_000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const err = new Error(payload.error_description || payload.error || `eBay OAuth failed (${response.status})`);
    err.status = 502;
    throw err;
  }

  tokenCache = {
    token: payload.access_token,
    expiresAt: now + Number(payload.expires_in || 7200) * 1000
  };
  return tokenCache.token;
}

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172) {
    const second = Number(private172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function normalizePublicHttpsUrl(value, { upgradeEbayImage = false } = {}) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (
      upgradeEbayImage &&
      url.protocol === 'http:' &&
      (url.hostname === 'i.ebayimg.com' || url.hostname.endsWith('.ebayimg.com'))
    ) {
      url.protocol = 'https:';
    }
    if (url.protocol !== 'https:' || isPrivateHostname(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function normalizeImageUrl(value) {
  return normalizePublicHttpsUrl(value, { upgradeEbayImage: true });
}

function imageCandidates(item) {
  const candidates = [
    item?.image?.imageUrl,
    item?.primaryItemGroup?.itemGroupImage?.imageUrl,
    ...(Array.isArray(item?.additionalImages) ? item.additionalImages.map((x) => x?.imageUrl) : []),
    ...(Array.isArray(item?.primaryItemGroup?.itemGroupAdditionalImages)
      ? item.primaryItemGroup.itemGroupAdditionalImages.map((x) => x?.imageUrl)
      : [])
  ];
  return [...new Set(candidates.map(normalizeImageUrl).filter(Boolean))];
}

function isExpired(item) {
  if (!item?.itemEndDate) return false;
  const end = Date.parse(item.itemEndDate);
  return Number.isFinite(end) && end <= Date.now();
}

function isUnavailable(item) {
  const values = Array.isArray(item?.estimatedAvailabilities) ? item.estimatedAvailabilities : [];
  const statuses = values
    .map((x) => String(x?.estimatedAvailabilityStatus || '').toUpperCase())
    .filter(Boolean);
  return statuses.length > 0 && statuses.every((status) => status !== 'IN_STOCK');
}

function hasCoreQuality(item) {
  const price = Number(item?.price?.value);
  return Boolean(
    item?.id &&
    String(item.title || '').trim() &&
    item.image &&
    item.itemWebUrl &&
    Number.isFinite(price) &&
    price >= 0 &&
    item.price?.currency &&
    item.condition &&
    Array.isArray(item.buyingOptions) &&
    item.buyingOptions.length
  );
}

function normalizeItem(item) {
  const images = imageCandidates(item);
  const location = item?.itemLocation || {};
  const normalized = {
    id: item.itemId || null,
    title: item.title || null,
    shortDescription: item.shortDescription || null,
    price: item.price ? { value: item.price.value ?? null, currency: item.price.currency ?? null } : null,
    image: images[0] || null,
    imageUrl: images[0] || null,
    imageAlternates: images.slice(1, 5),
    condition: item.condition || null,
    itemWebUrl: normalizePublicHttpsUrl(item.itemWebUrl),
    itemEndDate: item.itemEndDate || null,
    buyingOptions: item.buyingOptions || [],
    categoryId: item.categoryId || item.category?.categoryId || null,
    categoryPath: item.categoryPath || null,
    itemLocation: {
      city: location.city || null,
      stateOrProvince: location.stateOrProvince || null,
      country: location.country || null
    },
    seller: item.seller ? {
      username: item.seller.username || null,
      feedbackPercentage: item.seller.feedbackPercentage ?? null,
      feedbackScore: item.seller.feedbackScore ?? null
    } : null
  };
  normalized.quality = {
    coreComplete: hasCoreQuality(normalized),
    imageCount: images.length,
    hasSeller: Boolean(normalized.seller?.username),
    hasEndDate: Boolean(normalized.itemEndDate)
  };
  return normalized;
}

function needsDetailEnrichment(item) {
  return !hasCoreQuality(normalizeItem(item || {}));
}

async function getItemDetail(itemId, token) {
  if (!itemId) return null;
  const cached = detailCache.get(itemId);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  try {
    const response = await fetch(`${ITEM_URL}/${encodeURIComponent(itemId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) {
      detailCache.set(itemId, { payload: null, expiresAt: Date.now() + 60_000 });
      return null;
    }
    const payload = await response.json().catch(() => null);
    detailCache.set(itemId, { payload, expiresAt: Date.now() + DETAIL_CACHE_SECONDS * 1000 });
    return payload;
  } catch {
    detailCache.set(itemId, { payload: null, expiresAt: Date.now() + 60_000 });
    return null;
  }
}

async function enrichSummary(summary, token) {
  if (!summary || isExpired(summary)) return null;
  let source = summary;
  if (needsDetailEnrichment(summary) && summary.itemId) {
    const detail = await getItemDetail(summary.itemId, token);
    if (detail) source = { ...summary, ...detail };
  }
  if (isExpired(source) || isUnavailable(source)) return null;
  const normalized = normalizeItem(source);
  if (!hasCoreQuality(normalized)) return null;
  normalized.quality.coreComplete = true;
  return normalized;
}

function cleanLimit(raw) {
  const n = Number(raw || 12);
  if (!Number.isFinite(n)) return 12;
  return Math.min(48, Math.max(1, Math.trunc(n)));
}

function cleanOffset(raw) {
  const n = Number(raw || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(EBAY_SEARCH_WINDOW - 1, Math.max(0, Math.trunc(n)));
}

function alignedPageOffset(cursor) {
  return Math.floor(cursor / SOURCE_PAGE_SIZE) * SOURCE_PAGE_SIZE;
}

function safeText(value, max = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function cleanSeller(value) {
  return safeText(value, 100).replace(/[{}|,]/g, '');
}

function searchDescriptor({ q = '', categoryId = '', seller = '' } = {}) {
  return `${safeText(q, 160).toLowerCase()}|${safeText(categoryId, 40)}|${cleanSeller(seller).toLowerCase()}`;
}

async function fetchSearchPage({ q = '', categoryId = '', seller = '' }, token, offset) {
  const pageOffset = alignedPageOffset(offset);
  const descriptor = searchDescriptor({ q, categoryId, seller });
  const cacheKey = `${EBAY_ENV}|${MARKETPLACE}|${descriptor}|${pageOffset}|${SOURCE_PAGE_SIZE}`;
  const cached = sourcePageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  const url = new URL(BROWSE_URL);
  if (q) url.searchParams.set('q', q);
  if (categoryId) url.searchParams.set('category_ids', categoryId);
  url.searchParams.set('limit', String(SOURCE_PAGE_SIZE));
  url.searchParams.set('offset', String(pageOffset));

  const filters = [];
  if (!isSandbox) filters.push(`itemEndDate:[${new Date().toISOString()}]`);
  if (seller) filters.push(`sellers:{${cleanSeller(seller)}}`);
  if (filters.length) url.searchParams.set('filter', filters.join(','));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(20_000)
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const upstream = raw.errors?.[0];
    const message = upstream?.message || raw.message || `eBay Browse failed (${response.status})`;
    const err = new Error(message);
    err.status = 502;
    err.upstreamStatus = response.status;
    err.upstreamErrorId = upstream?.errorId ?? null;
    throw err;
  }

  sourcePageCache.set(cacheKey, { payload: raw, expiresAt: Date.now() + CACHE_SECONDS * 1000 });
  return raw;
}

async function ebayGetJson(url, token, timeoutMs = 30_000) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.errors?.[0]?.message || payload.message || `eBay request failed (${response.status})`;
    const err = new Error(message);
    err.status = 502;
    throw err;
  }
  return payload;
}

async function getTopCategories() {
  if (categoryCache.payload && categoryCache.expiresAt > Date.now()) return categoryCache.payload;
  const token = await getApplicationToken();
  const defaultUrl = new URL(TAXONOMY_DEFAULT_URL);
  defaultUrl.searchParams.set('marketplace_id', MARKETPLACE);
  const treeInfo = await ebayGetJson(defaultUrl, token);
  const treeId = String(treeInfo.categoryTreeId || '');
  if (!treeId) throw new Error('eBay category tree unavailable');
  const tree = await ebayGetJson(`${TAXONOMY_TREE_URL}/${encodeURIComponent(treeId)}`, token, 45_000);
  const children = Array.isArray(tree?.rootCategoryNode?.childCategoryTreeNodes)
    ? tree.rootCategoryNode.childCategoryTreeNodes
    : [];
  const categories = children
    .map((node) => ({
      id: String(node?.category?.categoryId || ''),
      name: safeText(node?.category?.categoryName, 100),
      leaf: Boolean(node?.leafCategoryTreeNode)
    }))
    .filter((item) => item.id && item.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  const payload = {
    provider: 'ebay',
    environment: EBAY_ENV,
    marketplace: MARKETPLACE,
    categoryTreeId: treeId,
    categoryTreeVersion: String(tree.categoryTreeVersion || treeInfo.categoryTreeVersion || ''),
    categories,
    fetchedAt: new Date().toISOString()
  };
  categoryCache = { payload, expiresAt: Date.now() + CATEGORY_CACHE_MS };
  return payload;
}

async function loadActivityEvents() {
  if (activityLoaded) return;
  activityLoaded = true;
  await fs.mkdir(ACTIVITY_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(ACTIVITY_FILE, 'utf8');
    const cutoff = Date.now() - ACTIVITY_RETENTION_MS;
    activityEvents = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-ACTIVITY_MEMORY_LIMIT)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter((event) => event && Date.parse(event.at || '') >= cutoff);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function appendActivityEvent(event) {
  await loadActivityEvents();
  const record = { ...event, at: new Date().toISOString() };
  activityEvents.push(record);
  if (activityEvents.length > ACTIVITY_MEMORY_LIMIT) {
    activityEvents = activityEvents.slice(-ACTIVITY_MEMORY_LIMIT);
  }
  await fs.appendFile(ACTIVITY_FILE, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

function activityWindow(raw, fallback = 1440, max = 10080) {
  const n = Number(raw || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(n)));
}

function activityLimit(raw, fallback = 12, max = 30) {
  const n = Number(raw || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(n)));
}

async function recentActivity(type, windowMinutes) {
  await loadActivityEvents();
  const cutoff = Date.now() - windowMinutes * 60_000;
  return activityEvents.filter((event) => event.type === type && Date.parse(event.at || '') >= cutoff);
}

async function aggregateItemViews(windowMinutes, limit) {
  const events = await recentActivity('item_view', windowMinutes);
  const map = new Map();
  for (const event of events) {
    if (!event.itemId) continue;
    const key = String(event.itemId);
    const entry = map.get(key) || {
      itemId: key,
      title: event.title || 'Connected item',
      imageUrl: event.imageUrl || null,
      price: event.price || null,
      condition: event.condition || null,
      seller: event.seller || null,
      query: event.query || null,
      views: 0,
      sessions: new Set(),
      lastViewedAt: event.at
    };
    entry.views += 1;
    if (event.sessionId) entry.sessions.add(event.sessionId);
    if (Date.parse(event.at) > Date.parse(entry.lastViewedAt)) entry.lastViewedAt = event.at;
    if (!entry.imageUrl && event.imageUrl) entry.imageUrl = event.imageUrl;
    if (!entry.seller && event.seller) entry.seller = event.seller;
    map.set(key, entry);
  }
  return [...map.values()]
    .map((entry) => ({
      itemId: entry.itemId,
      title: entry.title,
      imageUrl: entry.imageUrl,
      price: entry.price,
      condition: entry.condition,
      seller: entry.seller,
      query: entry.query,
      views: entry.views,
      viewers: entry.sessions.size,
      lastViewedAt: entry.lastViewedAt
    }))
    .sort((a, b) => b.viewers - a.viewers || b.views - a.views || Date.parse(b.lastViewedAt) - Date.parse(a.lastViewedAt))
    .slice(0, limit);
}

async function aggregateSellers(windowMinutes, limit) {
  const events = await recentActivity('item_view', windowMinutes);
  const map = new Map();
  for (const event of events) {
    const seller = safeText(event.seller, 100);
    if (!seller) continue;
    const key = seller.toLowerCase();
    const entry = map.get(key) || {
      seller,
      views: 0,
      sessions: new Set(),
      items: new Map(),
      lastViewedAt: event.at
    };
    entry.views += 1;
    if (event.sessionId) entry.sessions.add(event.sessionId);
    if (event.itemId && !entry.items.has(event.itemId)) {
      entry.items.set(event.itemId, {
        itemId: event.itemId,
        title: event.title || 'Connected item',
        imageUrl: event.imageUrl || null,
        query: event.query || null
      });
    }
    if (Date.parse(event.at) > Date.parse(entry.lastViewedAt)) entry.lastViewedAt = event.at;
    map.set(key, entry);
  }
  return [...map.values()]
    .map((entry) => ({
      seller: entry.seller,
      views: entry.views,
      viewers: entry.sessions.size,
      itemCount: entry.items.size,
      recentItems: [...entry.items.values()].slice(-4).reverse(),
      lastViewedAt: entry.lastViewedAt
    }))
    .sort((a, b) => b.viewers - a.viewers || b.views - a.views || Date.parse(b.lastViewedAt) - Date.parse(a.lastViewedAt))
    .slice(0, limit);
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ultrahype-ebay-gateway',
    version: '0.5.0',
    environment: EBAY_ENV,
    marketplace: MARKETPLACE
  });
});

app.get('/api/commerce/ebay/status', async (_req, res) => {
  try {
    const token = await getApplicationToken();
    res.json({
      ok: true,
      environment: EBAY_ENV,
      marketplace: MARKETPLACE,
      tokenValid: Boolean(token),
      tokenExpiresAt: new Date(tokenCache.expiresAt).toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message });
  }
});

app.get('/api/commerce/ebay/categories', async (_req, res) => {
  try {
    res.json(await getTopCategories());
  } catch (error) {
    res.status(error.status || 500).json({ error: 'category_gateway_error', message: error.message });
  }
});

app.get('/api/commerce/ebay/item/:itemId', async (req, res) => {
  try {
    const itemId = safeText(req.params.itemId, 220);
    if (!itemId) return res.status(400).json({ error: 'missing_item_id' });
    const token = await getApplicationToken();
    const detail = await getItemDetail(itemId, token);
    if (!detail || isExpired(detail) || isUnavailable(detail)) {
      return res.status(404).json({ error: 'item_unavailable' });
    }
    const item = normalizeItem(detail);
    if (!item.id) return res.status(404).json({ error: 'item_unavailable' });
    res.json({ provider: 'ebay', environment: EBAY_ENV, marketplace: MARKETPLACE, item });
  } catch (error) {
    res.status(error.status || 500).json({ error: 'item_gateway_error', message: error.message });
  }
});

app.get('/api/commerce/ebay/search', async (req, res) => {
  try {
    const q = safeText(req.query.q, 160);
    const categoryId = safeText(req.query.category_id, 40).replace(/[^0-9]/g, '');
    const seller = cleanSeller(req.query.seller);
    if (!q && !categoryId && !seller) return res.status(400).json({ error: 'missing_search_input' });

    const limit = cleanLimit(req.query.limit);
    const startOffset = cleanOffset(req.query.offset);
    const descriptor = searchDescriptor({ q, categoryId, seller });
    const cacheKey = `${MARKETPLACE}|${descriptor}|${startOffset}|${limit}|clean-v4`;
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return res.json({ ...cached.payload, cached: true });

    const token = await getApplicationToken();
    const items = [];
    const seen = new Set();
    let sourceOffset = startOffset;
    let sourceTotal = null;
    let candidatesChecked = 0;
    let filteredOut = 0;
    let duplicatesSkipped = 0;
    let pagesScanned = 0;
    let exhausted = false;

    while (
      items.length < limit &&
      pagesScanned < MAX_SCAN_PAGES_PER_REQUEST &&
      sourceOffset < EBAY_SEARCH_WINDOW &&
      !exhausted
    ) {
      const pageOffset = alignedPageOffset(sourceOffset);
      const skipWithinPage = sourceOffset - pageOffset;
      const raw = await fetchSearchPage({ q, categoryId, seller }, token, pageOffset);
      const pageSummaries = Array.isArray(raw.itemSummaries) ? raw.itemSummaries : [];
      pagesScanned += 1;

      if (sourceTotal == null) {
        const parsedTotal = Number(raw.total);
        sourceTotal = Number.isFinite(parsedTotal) ? Math.max(0, parsedTotal) : null;
      }

      if (!pageSummaries.length) {
        exhausted = true;
        break;
      }

      const retrievableTotal = sourceTotal == null ? EBAY_SEARCH_WINDOW : Math.min(sourceTotal, EBAY_SEARCH_WINDOW);
      if (sourceOffset >= retrievableTotal) {
        exhausted = true;
        break;
      }

      if (skipWithinPage >= pageSummaries.length) {
        const pageEnd = pageOffset + pageSummaries.length;
        if (pageSummaries.length < SOURCE_PAGE_SIZE || pageEnd <= sourceOffset) {
          exhausted = true;
          break;
        }
        sourceOffset = pageEnd;
        continue;
      }

      const summaries = pageSummaries.slice(skipWithinPage);
      const enriched = await Promise.all(summaries.map((summary) => enrichSummary(summary, token)));
      let consumed = 0;

      for (let index = 0; index < enriched.length; index += 1) {
        const candidate = enriched[index];
        consumed = index + 1;
        candidatesChecked += 1;
        if (!candidate) {
          filteredOut += 1;
          continue;
        }
        if (seen.has(candidate.id)) {
          duplicatesSkipped += 1;
          continue;
        }
        seen.add(candidate.id);
        items.push(candidate);
        if (items.length >= limit) break;
      }

      sourceOffset += consumed;
      if (items.length >= limit) break;
      if (!consumed) {
        exhausted = true;
        break;
      }
      if (sourceOffset >= retrievableTotal) {
        exhausted = true;
        break;
      }
      if (pageSummaries.length < SOURCE_PAGE_SIZE && sourceOffset >= pageOffset + pageSummaries.length) {
        exhausted = true;
      }
    }

    const retrievableTotal = sourceTotal == null ? EBAY_SEARCH_WINDOW : Math.min(sourceTotal, EBAY_SEARCH_WINDOW);
    const hasMore = !exhausted && sourceOffset < retrievableTotal && sourceOffset < EBAY_SEARCH_WINDOW;
    const payload = {
      provider: 'ebay',
      environment: EBAY_ENV,
      marketplace: MARKETPLACE,
      query: q || null,
      categoryId: categoryId || null,
      seller: seller || null,
      count: items.length,
      total: sourceTotal ?? items.length,
      retrievableTotal,
      startOffset,
      nextOffset: hasMore ? sourceOffset : null,
      hasMore,
      sourcePageSize: SOURCE_PAGE_SIZE,
      cursorMode: 'source-index-over-aligned-pages',
      pagesScanned,
      candidatesChecked,
      filteredOut,
      duplicatesSkipped,
      qualityPolicy: 'active + public HTTPS image + source URL + price + currency + condition + buying option',
      items,
      cached: false,
      fetchedAt: new Date().toISOString()
    };
    searchCache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_SECONDS * 1000 });
    res.json(payload);
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'ebay_gateway_error',
      message: error.message,
      upstreamStatus: error.upstreamStatus ?? null,
      upstreamErrorId: error.upstreamErrorId ?? null
    });
  }
});

app.post('/api/commerce/activity/event', async (req, res) => {
  try {
    const type = safeText(req.body?.type, 40);
    if (!['item_view', 'search', 'category_view'].includes(type)) {
      return res.status(400).json({ error: 'unsupported_activity_type' });
    }
    const rawPrice = req.body?.price;
    const record = {
      type,
      sessionId: safeText(req.body?.sessionId, 128),
      itemId: safeText(req.body?.itemId, 220) || null,
      title: safeText(req.body?.title, 240) || null,
      imageUrl: normalizeImageUrl(req.body?.imageUrl) || null,
      condition: safeText(req.body?.condition, 100) || null,
      seller: cleanSeller(req.body?.seller) || null,
      query: safeText(req.body?.query, 160) || null,
      categoryId: safeText(req.body?.categoryId, 40) || null,
      categoryName: safeText(req.body?.categoryName, 120) || null,
      price: rawPrice && Number.isFinite(Number(rawPrice.value))
        ? { value: Number(rawPrice.value), currency: safeText(rawPrice.currency, 8) || 'USD' }
        : null
    };
    if (type === 'item_view' && !record.itemId) return res.status(400).json({ error: 'missing_item_id' });
    await appendActivityEvent(record);
    res.status(202).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'activity_write_error', message: error.message });
  }
});

app.get('/api/commerce/activity/trending', async (req, res) => {
  try {
    const windowMinutes = activityWindow(req.query.window_minutes, 1440);
    const limit = activityLimit(req.query.limit, 12);
    const items = await aggregateItemViews(windowMinutes, limit);
    res.json({ signal: 'ultrahype_item_views', windowMinutes, count: items.length, items, generatedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'activity_read_error', message: error.message });
  }
});

app.get('/api/commerce/activity/live', async (req, res) => {
  try {
    const windowMinutes = activityWindow(req.query.window_minutes, 15, 120);
    const limit = activityLimit(req.query.limit, 12);
    const items = await aggregateItemViews(windowMinutes, limit);
    res.json({ signal: 'ultrahype_recent_viewers', windowMinutes, count: items.length, items, generatedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'activity_read_error', message: error.message });
  }
});

app.get('/api/commerce/activity/sellers', async (req, res) => {
  try {
    const windowMinutes = activityWindow(req.query.window_minutes, 1440);
    const limit = activityLimit(req.query.limit, 8);
    const sellers = await aggregateSellers(windowMinutes, limit);
    res.json({ signal: 'ultrahype_seller_attention', windowMinutes, count: sellers.length, sellers, generatedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'activity_read_error', message: error.message });
  }
});

app.get('/api/commerce/intelligence/discovery', async (_req, res) => {
  try {
    const snapshotPath = path.join(INTELLIGENCE_DIR, 'discovery-snapshot.json');
    const raw = await fs.readFile(snapshotPath, 'utf8');
    const payload = JSON.parse(raw);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(payload);
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: 'intelligence_snapshot_not_ready' });
    res.status(500).json({ error: 'intelligence_read_error', message: error.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`UltraHype eBay gateway listening on http://127.0.0.1:${PORT} (${EBAY_ENV})`);
});
