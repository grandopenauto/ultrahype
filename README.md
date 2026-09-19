# UltraHype

AI-native commerce and marketplace platform connecting owned products, external inventory, intelligent discovery, automated distribution, and direct checkout.

## V1 architecture

- GitHub Pages: public storefront and discovery experience
- HDP backend: payment, seller, order, inventory, and automation services
- eBay adapter: Browse + seller inventory/distribution integration (credentials remain server-side)
- HDPPay: owned checkout lane
- AgentForSell / FSHack / Shebavonova: catalog and marketplace feeders
- AIAutoTester: release and commerce-flow validation

No secrets belong in this repository. Runtime service URLs and production integrations should be configured through the protected backend.
