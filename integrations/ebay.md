# UltraHype ↔ eBay integration contract

UltraHype treats eBay as a connected marketplace lane, not as the public application's credential boundary.

## Security boundary

The GitHub Pages storefront must never contain:

- eBay client secrets
- OAuth refresh tokens
- seller access tokens
- HDPPay secrets
- private seller/customer data

All eBay calls are made by the protected HDP backend. The browser only calls normalized UltraHype endpoints.

## V1 browser contract

Configured in `config.js`:

```js
apiBase: "https://<protected-api-host>",
integrations: {
  ebay: {
    enabled: true,
    searchPath: "/api/commerce/ebay/search"
  }
}
```

### GET /api/commerce/ebay/search?q=<query>

Expected normalized response:

```json
{
  "provider": "ebay",
  "query": "sneakers",
  "count": 1,
  "items": [
    {
      "id": "provider-item-id",
      "title": "Item title",
      "price": { "value": "0.00", "currency": "USD" },
      "image": "https://...",
      "condition": "New",
      "sourceUrl": "https://...",
      "seller": null
    }
  ]
}
```

The public UI should render normalized fields rather than depending directly on eBay response shapes.

## Backend lanes

### Browse lane

1. Receive a user query from UltraHype.
2. Validate / rate-limit the request.
3. Obtain or reuse the required server-side authorization.
4. Call the eBay Browse API.
5. Normalize results to the UltraHype catalog schema.
6. Log source, query, result IDs, and outbound clicks.
7. Return only public-safe fields to the browser.

### Seller publishing lane

1. Start from an approved UltraHype product record.
2. Validate title, media, price, quantity, condition, policies, and channel eligibility.
3. Map the product to the eBay inventory model.
4. Create/update inventory item.
5. Create/update offer.
6. Publish only after explicit channel approval.
7. Persist provider listing ID and status back to the product record.

## Shared product record

UltraHype should eventually maintain one canonical product object that can route to multiple channels:

```json
{
  "productId": "uhp_...",
  "brand": "Shebavonova",
  "title": "...",
  "description": "...",
  "media": [],
  "price": { "value": "...", "currency": "USD" },
  "inventory": { "available": 0 },
  "channels": {
    "ultrahype": { "enabled": true },
    "hdppay": { "enabled": false },
    "ebay": { "enabled": false, "listingId": null }
  }
}
```

## Launch sequence

1. Keep `ebay.enabled = false` while the storefront deploys.
2. Create the protected backend adapter and verify sandbox/test credentials.
3. Confirm search normalization.
4. Set `apiBase` and enable the eBay flag.
5. Test with AIAutoTester before exposing production traffic.
6. Add seller publishing only after the browse lane is stable.

This keeps UltraHype useful even if eBay is unavailable and makes the eBay account a distribution asset rather than a single point of failure.
