$ErrorActionPreference = 'Stop'

$path = 'C:\HDP\UltraHype\ebay\index.js'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$backup = "$path.bak-marketing-$stamp"
Copy-Item $path $backup -Force

$s = Get-Content $path -Raw
$nl = [Environment]::NewLine

if ($s -notmatch 'MARKETING_URL') {
  $needle = "const TAXONOMY_TREE_URL = `${API_BASE}/commerce/taxonomy/v1/category_tree`;"
  $insert = $needle + $nl + "const MARKETING_URL = `${API_BASE}/buy/marketing/v1`;"
  $s = $s.Replace($needle, $insert)
}

if ($s -notmatch 'marketingTokenCache') {
  $needle = "let tokenCache = { token: null, expiresAt: 0 };"
  $insert = $needle + $nl + "let marketingTokenCache = { token: null, expiresAt: 0 };"
  $s = $s.Replace($needle, $insert)
}

if ($s -notmatch 'async function getMarketingToken') {
  $marker = 'function isPrivateHostname(hostname) {'
  $helper = @'
async function getMarketingToken() {
  requireConfig();
  const now = Date.now();
  if (marketingTokenCache.token && now < marketingTokenCache.expiresAt - 60_000) return marketingTokenCache.token;

  const basic = Buffer.from(`${APP_ID}:${CERT_ID}`, 'utf8').toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope/buy.marketing'
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
    const err = new Error(payload.error_description || payload.error || `eBay Marketing OAuth failed (${response.status})`);
    err.status = 502;
    err.upstreamStatus = response.status;
    throw err;
  }

  marketingTokenCache = {
    token: payload.access_token,
    expiresAt: now + Number(payload.expires_in || 7200) * 1000
  };
  return marketingTokenCache.token;
}

'@
  $s = $s.Replace($marker, $helper + $marker)
}

if ($s -notmatch 'async function marketingGetJson') {
  $marker = 'async function getTopCategories() {'
  $helper = @'
async function marketingGetJson(url, token, timeoutMs = 20_000) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const upstream = payload.errors?.[0];
    const err = new Error(upstream?.message || payload.message || `eBay Marketing failed (${response.status})`);
    err.status = 502;
    err.upstreamStatus = response.status;
    err.upstreamErrorId = upstream?.errorId ?? null;
    throw err;
  }
  return payload;
}

function cleanMarketingLimit(raw, fallback = 8, max = 24) {
  const n = Number(raw || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(n)));
}

function normalizeMarketPriceDetails(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((entry) => ({
    conditionGroup: safeText(entry?.conditionGroup, 80) || null,
    conditionIds: Array.isArray(entry?.conditionIds) ? entry.conditionIds.slice(0, 20).map((v) => safeText(v, 40)) : [],
    estimatedStartPrice: entry?.estimatedStartPrice ? {
      value: entry.estimatedStartPrice.value ?? null,
      currency: entry.estimatedStartPrice.currency ?? null
    } : null
  }));
}

'@
  $s = $s.Replace($marker, $helper + $marker)
}

if ($s -notmatch "app.get\('/api/commerce/ebay/best-selling'") {
  $marker = "app.get('/api/commerce/ebay/item/:itemId'"
  $routes = @'
app.get('/api/commerce/ebay/best-selling', async (req, res) => {
  try {
    const categoryId = safeText(req.query.category_id, 40).replace(/[^0-9]/g, '');
    if (!categoryId) return res.status(400).json({ error: 'missing_category_id' });
    const limit = cleanMarketingLimit(req.query.limit, 8, 24);
    const url = new URL(`${MARKETING_URL}/merchandised_product`);
    url.searchParams.set('category_id', categoryId);
    url.searchParams.set('metric_name', 'BEST_SELLING');
    url.searchParams.set('limit', String(limit));
    const aspectFilter = safeText(req.query.aspect_filter, 240);
    if (aspectFilter) url.searchParams.set('aspect_filter', aspectFilter);

    const token = await getMarketingToken();
    const raw = await marketingGetJson(url, token);
    const products = (Array.isArray(raw.merchandisedProducts) ? raw.merchandisedProducts : []).map((product, index) => ({
      rank: index + 1,
      epid: safeText(product?.epid, 80) || null,
      title: safeText(product?.title, 240) || null,
      imageUrl: normalizeImageUrl(product?.image?.imageUrl) || null,
      averageRating: product?.averageRating ?? null,
      ratingCount: product?.ratingCount ?? null,
      reviewCount: product?.reviewCount ?? null,
      marketPriceDetails: normalizeMarketPriceDetails(product?.marketPriceDetails)
    })).filter((product) => product.epid && product.title);

    res.setHeader('Cache-Control', 'public, max-age=180, stale-while-revalidate=600');
    res.json({
      provider: 'ebay',
      signal: 'BEST_SELLING',
      environment: EBAY_ENV,
      marketplace: MARKETPLACE,
      categoryId,
      count: products.length,
      products,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'ebay_marketing_gateway_error',
      message: error.message,
      upstreamStatus: error.upstreamStatus ?? null,
      upstreamErrorId: error.upstreamErrorId ?? null
    });
  }
});

app.get('/api/commerce/ebay/most-watched', async (req, res) => {
  try {
    const categoryId = safeText(req.query.category_id, 40).replace(/[^0-9]/g, '');
    if (!categoryId) return res.status(400).json({ error: 'missing_category_id' });
    const limit = cleanMarketingLimit(req.query.limit, 12, 50);
    const url = new URL(`${MARKETING_URL}/most_watched_items`);
    url.searchParams.set('category_id', categoryId);
    url.searchParams.set('max_results', String(limit));

    const token = await getMarketingToken();
    const raw = await marketingGetJson(url, token);
    const items = (Array.isArray(raw.mostWatchedItems) ? raw.mostWatchedItems : []).map((item, index) => ({
      rank: index + 1,
      itemId: safeText(item?.itemId, 220) || null,
      title: safeText(item?.title, 240) || null,
      imageUrl: normalizeImageUrl(item?.image?.imageUrl) || null,
      price: item?.price ? { value: item.price.value ?? null, currency: item.price.currency ?? null } : null,
      watchCount: item?.watchCount ?? null,
      buyingOptions: Array.isArray(item?.buyingOptions) ? item.buyingOptions.slice(0, 10) : [],
      categories: Array.isArray(item?.categories) ? item.categories.slice(0, 8).map((c) => ({ categoryId: safeText(c?.categoryId, 40), categoryName: safeText(c?.categoryName, 120) })) : []
    })).filter((item) => item.itemId && item.title);

    res.setHeader('Cache-Control', 'public, max-age=180, stale-while-revalidate=600');
    res.json({
      provider: 'ebay',
      signal: 'MOST_WATCHED',
      environment: EBAY_ENV,
      marketplace: MARKETPLACE,
      categoryId,
      count: items.length,
      items,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: 'ebay_marketing_gateway_error',
      message: error.message,
      upstreamStatus: error.upstreamStatus ?? null,
      upstreamErrorId: error.upstreamErrorId ?? null
    });
  }
});

'@
  $s = $s.Replace($marker, $routes + $marker)
}

$s = $s.Replace("version: '0.5.0'", "version: '0.6.0'")
Set-Content -Path $path -Value $s -Encoding UTF8

& node --check $path
if ($LASTEXITCODE -ne 0) {
  Copy-Item $backup $path -Force
  throw 'Node syntax check failed; restored backup'
}

& nssm restart HDP-UltraHype-eBay | Out-Null
Start-Sleep -Seconds 4

$health = Invoke-RestMethod 'http://127.0.0.1:4317/health' -TimeoutSec 20
Write-Output ('HEALTH_OK=' + [bool]$health.ok)
Write-Output ('VERSION=' + [string]$health.version)
Write-Output ('ENV=' + [string]$health.environment)

function Probe-Marketing([string]$name, [string]$url) {
  try {
    $r = Invoke-RestMethod $url -TimeoutSec 45
    Write-Output ($name + '_OK=True')
    Write-Output ($name + '_COUNT=' + [string]$r.count)
    if ($name -eq 'BEST_SELLING' -and @($r.products).Count -gt 0) {
      Write-Output ('BEST_SELLING_SAMPLE=' + [string]$r.products[0].title)
    }
    if ($name -eq 'MOST_WATCHED' -and @($r.items).Count -gt 0) {
      Write-Output ('MOST_WATCHED_SAMPLE=' + [string]$r.items[0].title)
      Write-Output ('MOST_WATCHED_SAMPLE_WATCHES=' + [string]$r.items[0].watchCount)
    }
  } catch {
    $response = $_.Exception.Response
    $status = if ($response) { [int]$response.StatusCode } else { 0 }
    Write-Output ($name + '_OK=False')
    Write-Output ($name + '_HTTP=' + [string]$status)
    Write-Output ($name + '_ERROR=' + $_.Exception.Message)
  }
}

Probe-Marketing 'BEST_SELLING' 'http://127.0.0.1:4317/api/commerce/ebay/best-selling?category_id=31388&limit=3'
Probe-Marketing 'MOST_WATCHED' 'http://127.0.0.1:4317/api/commerce/ebay/most-watched?category_id=31388&limit=3'
Write-Output ('BACKUP=' + $backup)
Write-Output 'UH_EBAY_MARKETING_SIGNAL_PATCH_DONE'
