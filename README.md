# UltraHype

UltraHype is an AI-native commerce and marketplace layer connecting owned products, external inventory, intelligent discovery, automated distribution, and direct checkout.

## V1 status

The public storefront shell is built and committed to `main`.

### Live in the V1 front end

- Responsive UltraHype landing / marketplace experience
- Shebavonova featured launch lane
- AgentForSell and FSHack feeder lanes
- Commerce-network visualization
- eBay discovery/search UI with protected-backend gating
- Runtime feature flags through `config.js`
- Mobile navigation, animated discovery surfaces, and accessible fallbacks
- No marketplace or payment secrets in the browser

## Architecture

- **GitHub Pages** — public storefront and discovery experience
- **Protected HDP backend** — payment, seller, order, inventory, and automation services
- **eBay adapter** — Browse + seller inventory/distribution integration
- **HDPPay** — owned checkout lane
- **AgentForSell / FSHack / Shebavonova** — catalog and marketplace feeders
- **AIAutoTester** — release and commerce-flow validation

## Activation checklist

1. Enable GitHub Pages from the `main` branch / repository root if it is not already enabled.
2. Add a `CNAME` file containing the exact UltraHype custom domain used in DNS.
3. Copy the real Shebavonova product media into an `assets/shebavonova/` directory and replace the CSS launch artwork with the actual catalog imagery.
4. Create the protected eBay adapter described in `integrations/ebay.md`.
5. Set `apiBase` in `config.js` and change `integrations.ebay.enabled` to `true` only after backend testing passes.
6. Connect the canonical product record to HDPPay checkout.
7. Run AIAutoTester across mobile, desktop, search, checkout, failure-state, and channel-publishing flows before production promotion.

## Important security rule

No eBay client secret, OAuth refresh token, seller token, HDPPay secret, or private customer/seller data belongs in this public repository. All privileged calls terminate at the protected backend.

## Commerce principle

Create the product once, then route it to the channels that make sense:

`Product record → UltraHype → HDPPay / eBay / future channels`

UltraHype remains useful even when an external marketplace is unavailable.
