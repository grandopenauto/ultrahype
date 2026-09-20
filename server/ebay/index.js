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

let tokenCache = { token: null, expiresAt: 0 };
const searchCache = new Map();
const detailCache = new Map();
const rateBuckets = new Map();

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: EBAY_SCOPE
  });

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

function normalizeImageUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol === 'http:' && (url.hostname === 'i.ebayimg.com' || url.hostname.endsWith('.ebayimg.com'))) {
      url.protocol = 'https:';
    }
    if (url.protocol !== 'https:' || isPrivateHostname(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
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

function normalizeItem(item) {
  const images = imageCandidates(item);
  return {
    id: item.itemId || null,
    title: item.title || null,
    price: item.price ? {
      value: item.price.value ?? null,
      currency: item.price.currency ?? null
    } : null,
    image: images[0] || null,
    imageUrl: images[0] || null,
    imageAlternates: images.slice(1, 5),
    condition: item.condition || null,
    itemWebUrl: item.itemWebUrl || null,
    itemEndDate: item.itemEndDate || null,
    buyingOptions: item.buyingOptions || [],
    seller: item.seller ? {
      username: item.seller.username || null,
      feedbackPercentage: item.seller.feedbackPercentage ?? null,
      feedbackScore: item.seller.feedbackScore ?? null
    } : null
  };
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
    detailCache.set(itemId, {
      payload,
      expiresAt: Date.now() + DETAIL_CACHE_SECONDS * 1000
    });
    return payload;
  } catch {
    detailCache.set(itemId, { payload: null, expiresAt: Date.now() + 60_000 });
    return null;
  }
}

async function enrichSummary(summary, token) {
  if (!summary || isExpired(summary)) return null;

  let source = summary;
  if (imageCandidates(summary).length === 0 && summary.itemId) {
    const detail = await getItemDetail(summary.itemId, token);
    if (detail) source = { ...summary, ...detail };
  }

  if (isExpired(source) || isUnavailable(source)) return null;
  if (imageCandidates(source).length === 0) return null;
  return normalizeItem(source);
}

function cleanLimit(raw) {
  const n = Number(raw || 12);
  if (!Number.isFinite(n)) return 12;
  return Math.min(50, Math.max(1, Math.trunc(n)));
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ultrahype-ebay-gateway',
    version: '0.3.2',
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

app.get('/api/commerce/ebay/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'missing_query' });

    const limit = cleanLimit(req.query.limit);
    const candidateLimit = Math.min(50, Math.max(limit, limit + 4));
    const cacheKey = `${MARKETPLACE}|${q.toLowerCase()}|${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ ...cached.payload, cached: true });
    }

    const token = await getApplicationToken();
    const url = new URL(BROWSE_URL);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(candidateLimit));

    if (!isSandbox) {
      url.searchParams.set('filter', `itemEndDate:[${new Date().toISOString()}]`);
    }

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
      const message = raw.errors?.[0]?.message || raw.message || `eBay Browse failed (${response.status})`;
      const err = new Error(message);
      err.status = 502;
      throw err;
    }

    const summaries = Array.isArray(raw.itemSummaries) ? raw.itemSummaries : [];
    const enriched = await Promise.all(summaries.map((item) => enrichSummary(item, token)));
    const validItems = enriched.filter(Boolean);
    const items = validItems.slice(0, limit);

    const payload = {
      provider: 'ebay',
      environment: EBAY_ENV,
      marketplace: MARKETPLACE,
      query: q,
      count: items.length,
      total: Number(raw.total || items.length),
      candidatesChecked: summaries.length,
      filteredOut: Math.max(0, summaries.length - validItems.length),
      items,
      cached: false,
      fetchedAt: new Date().toISOString()
    };

    searchCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + CACHE_SECONDS * 1000
    });

    res.json(payload);
  } catch (error) {
    res.status(error.status || 500).json({ error: 'ebay_gateway_error', message: error.message });
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
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'intelligence_snapshot_not_ready' });
    }
    res.status(500).json({ error: 'intelligence_read_error', message: error.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`UltraHype eBay gateway listening on http://127.0.0.1:${PORT} (${EBAY_ENV})`);
});
