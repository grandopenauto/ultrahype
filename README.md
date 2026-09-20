# UltraHype

UltraHype is an AI-native commerce, marketplace, and capability-discovery layer connecting original products, external inventory, software, services, intelligent discovery, and channel routing.

## V2 status

UltraHype V2 is committed to `main` with a mixed catalog and reusable product-page engine.

### Live in the V2 front end

- Responsive customer-facing marketplace
- Real Shebavonova product records and imagery
- Reactive reusable product-detail renderer
- Six Digital Cross Dock product lanes
- HypeStacks capability-discovery surface
- FSHackability / collection-intelligence interface scaffold with honest unscored states
- Protected eBay Sandbox discovery/search lane
- UltraHype MarketplaceOS B2B sales page
- Runtime feature flags through `config.js`
- No marketplace or payment secrets in the browser

## Product families currently represented

### Shebavonova

- Italian Strap High-Top
- Spike Fashion Low-Top

### Digital Cross Dock

- Intake Lane
- API & Event Lane
- Agent Workload Lane
- Partner Integration Lane
- Legacy Shield
- Managed Dock

## HypeStacks

HypeStacks are capability-oriented product groupings that can combine physical products with software, AI, workflows, services, and BusinessOS components.

Initial concept stacks include:

- 3D Printing Business — machine + CATIAAgent + ManufacturingOS + quoting + customer acquisition
- Window Cleaning Business — tools + Voice Agent + SEO Agent + scheduling + BusinessOS
- Smart Lab — lab equipment + ChemistryOS + LabOS + experiment logging + analysis
- Robotics Cell — robot hardware + robotics AI + vision/ML + automation workflows

## FSHack intelligence direction

The V2 interface is prepared for product-level opportunity intelligence without publishing unsupported scores. Future signals can include:

- FSHackability
- resale / value-add paths
- collection relationships and set-completion potential
- HypeStack compatibility
- business-launch potential
- complementary hardware/software relationships

Scores should only be displayed when backed by real marketplace and operating data.

## B2B architecture

- **UltraHype MarketplaceOS** — marketplace-focused package: catalog, product pages, connected inventory, discovery, seller/product intake, intelligence surfaces, and channel routing.
- **UltraHype eCommerceOS** — broader commerce stack that can extend MarketplaceOS with checkout, customer acquisition, SEO, operations, fulfillment, analytics, and automation.
- **ultrahype.store** — live reference deployment and customer marketplace.

## Runtime architecture

- **GitHub Pages** — public storefront, product pages, discovery, and B2B sales surfaces
- **Protected HDP backend** — privileged marketplace, payment, seller, order, inventory, and automation services
- **eBay adapter** — protected Browse integration; currently Sandbox
- **HDPPay** — future owned checkout lane
- **FSHack / AgentForSell / other HDP systems** — future catalog and intelligence feeders
- **Digital Cross Dock** — bounded intake, staging, manifesting, routing, and controlled delivery pattern

## Important security rule

No eBay client secret, OAuth refresh token, seller token, HDPPay secret, private customer/seller data, or privileged connector credential belongs in this public repository. All privileged calls terminate at the protected backend.

## Commerce principle

Create the product once, then route it to the channels and capability paths that make sense:

`Product record → UltraHype → product page / HypeStack / FSHack intelligence / HDPPay / eBay / future channels`

UltraHype remains useful even when any one external marketplace is unavailable.
