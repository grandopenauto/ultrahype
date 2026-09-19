import 'dotenv/config';
import express from 'express';

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
const RATE_LIMIT_PER_MINUTE = Math.max(1, Number(process.env.RATE_LIMIT_PER_MINUTE || 60));
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

let tokenCache = { token: null, expiresAt: 0 };
const searchCache = new Map();
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
    body
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

function normalizeItem(item) {
  return {
    id: item.itemId || null,
    title: item.title || null,
    price: item.price ? {
      value: item.price.value ?? null,
      currency: item.price.currency ?? null
    } : null,
    image: item.image?.imageUrl || null,
    condition: item.condition || null,
    itemWebUrl: item.itemWebUrl || null,
    buyingOptions: item.buyingOptions || [],
    seller: item.seller ? {
      username: item.seller.username || null,
      feedbackPercentage: item.seller.feedbackPercentage ?? null,
      feedbackScore: item.seller.feedbackScore ?? null
    } : null
  };
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
    version: '0.1.0',
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
    const cacheKey = `${MARKETPLACE}|${q.toLowerCase()}|${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ ...cached.payload, cached: true });
    }

    const token = await getApplicationToken();
    const url = new URL(BROWSE_URL);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(limit));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
        Accept: 'application/json'
      }
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = raw.errors?.[0]?.message || raw.message || `eBay Browse failed (${response.status})`;
      const err = new Error(message);
      err.status = 502;
      throw err;
    }

    const items = Array.isArray(raw.itemSummaries) ? raw.itemSummaries.map(normalizeItem) : [];
    const payload = {
      provider: 'ebay',
      environment: EBAY_ENV,
      marketplace: MARKETPLACE,
      query: q,
      count: items.length,
      total: Number(raw.total || items.length),
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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`UltraHype eBay gateway listening on http://127.0.0.1:${PORT} (${EBAY_ENV})`);
});
