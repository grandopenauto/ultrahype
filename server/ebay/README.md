# UltraHype eBay Gateway

Small protected Node gateway for eBay OAuth and Browse API calls.

## VPS location

Recommended runtime folder:

`C:\HDP\UltraHype\ebay`

Keep the real `.env` only on the VPS. Never commit it.

## Required `.env`

```env
EBAY_ENV=sandbox
APP_ID=<sandbox App ID / Client ID>
DEV_ID=<sandbox Dev ID>
CERT_ID=<sandbox Cert ID / Client Secret>
EBAY_SCOPE=https://api.ebay.com/oauth/api_scope
EBAY_MARKETPLACE_ID=EBAY_US
PORT=4317
ALLOWED_ORIGINS=https://ultrahype.store,https://www.ultrahype.store
CACHE_SECONDS=300
RATE_LIMIT_PER_MINUTE=60
```

`DEV_ID` is retained for eBay compatibility but is not required by the first REST OAuth/Browse flow.

## Install

From PowerShell:

```powershell
cd C:\HDP\UltraHype\ebay
npm install
node .\index.js
```

Expected startup line:

```text
UltraHype eBay gateway listening on http://127.0.0.1:4317 (sandbox)
```

## Smoke tests

### 1. Health

```powershell
Invoke-RestMethod http://127.0.0.1:4317/health
```

Expected: `ok = True` and `environment = sandbox`.

### 2. OAuth credential test

```powershell
Invoke-RestMethod http://127.0.0.1:4317/api/commerce/ebay/status
```

Expected: `ok = True` and `tokenValid = True`.

The endpoint never returns the access token itself.

### 3. Browse search

```powershell
Invoke-RestMethod "http://127.0.0.1:4317/api/commerce/ebay/search?q=sneakers&limit=5" | ConvertTo-Json -Depth 8
```

Sandbox inventory is not the production marketplace, so the amount and usefulness of returned inventory can differ from production. Authentication success is best verified with the status endpoint first.

## Production promotion

Do not change to production until:

1. Sandbox OAuth succeeds.
2. Browse calls succeed.
3. Error and empty-result handling have been tested.
4. eBay production application access/compliance is confirmed.
5. A protected HTTPS route is configured in IIS/ARR.

Then use the Production keyset in the VPS `.env` and set:

```env
EBAY_ENV=production
```

The code automatically switches from `api.sandbox.ebay.com` to `api.ebay.com`.

## UltraHype front-end activation

After an HTTPS API hostname/routes exists, update the root `config.js`:

```js
apiBase: "https://<your-api-host>",
...
ebay: {
  enabled: true,
  searchPath: "/api/commerce/ebay/search"
}
```

Do not point the GitHub Pages front end directly at eBay.
