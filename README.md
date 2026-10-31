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
- Protected eBay discovery/search lane (front-end configured for production; verify live backend at runtime)
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
- **eBay adapter** — protected Browse integration; environment is reported by the backend and must be verified at runtime
- **HDPPay** — future owned checkout lane
- **FSHack / AgentForSell / other HDP systems** — future catalog and intelligence feeders
- **Digital Cross Dock** — bounded intake, staging, manifesting, routing, and controlled delivery pattern

## Important security rule

No eBay client secret, OAuth refresh token, seller token, HDPPay secret, private customer/seller data, or privileged connector credential belongs in this public repository. All privileged calls terminate at the protected backend.

## Commerce principle

Create the product once, then route it to the channels and capability paths that make sense:

`Product record → UltraHype → product page / HypeStack / FSHack intelligence / HDPPay / eBay / future channels`

UltraHype remains useful even when any one external marketplace is unavailable.

## UH moment buyer guides (draft)

The discovery guide pages at `discover/ps5/`, `discover/pokemon/`, and `discover/refurbished-iphone/` are editorial buying guides. They compare decision factors and explain possible HypeStack uses, then deep-link to `marketplace.html?q=...` to request current connected inventory. They do not invent prices, rankings, sales volumes, or first-hand testing. Product or pricing claims require source evidence and backend verification. The homepage features these guides, and the sitemap includes their canonical routes. The pages carry an affiliate disclosure.

## Product-to-business opportunities (UH? Build That)

The `build/` route is a static, browser-side blueprint generator, not a connected deployment API. Four starter kits: PS5 creator studio, Pokémon live-selling setup with known inventory, Pokémon card shop and collection tracker, and a **free, non-transactional** digital-reveal demo with fictitious assets.

Buttons generate a project brief with equipment, proposed systems (BuildThisMedia, HobbyShopOS, LinkStream, FSHack, UltraHype and VPSBridge), tasks, revenue hypotheses, constraints and approvals. Copy and JSON export happen locally; no brief is sent to the VPS. Later BuildThisMedia integration requires a reviewed schema, authentication, explicit authorization, a dry-run preview, approval gates, audit trail and confirmed deployment results.

The PS5 guide includes a fail-closed sample comparison. It checks `/api/commerce/ebay/status` for `ok:true`, `tokenValid:true` and `environment:"production"` before running three source searches. It displays only filtered matched console listings with numeric listing prices, labels shipping/taxes as potentially extra, and never invents sample prices when the source is unavailable. It routes visitors to UltraHype product detail for seller review and purchase routing.

Pokémon policy constraints: eBay Live requires eligibility. eBay chance-listing rules restrict raffles, paid random chance and pack/case breaks; breaks are allowed only for pre-approved sellers under applicable conditions. No paid randomized digital pulls, real stakes, prizes or redemption are implemented.

### Release validation
1. Verify custom-domain deployment, page layout on iPhone and canonical routes.
2. Verify protected eBay API status, CORS, production listings, image URLs and price normalization.
3. Confirm the final checkout/outbound link has a correct ePN tracking URL (the backend normalizes `itemWebUrl`; do not assume commissions without verifying it) and appropriate disclosure.
4. Check guide accuracy and add original product demonstrations with verifiable results.
5. Validate privacy-respecting analytics for page views, kit generation, item detail and outbound affiliate clicks.
6. Only then design a secure BuildThisMedia brief endpoint and user-authorized VPSBridge deployment workflow. No private automation credentials in public JS.

## Sponsor-ready Pokémon 3 + 9 showcase (draft)

The Pokémon guide's `showcase.js` obtains current eBay inventory from the protected production adapter only when a token-valid production status is confirmed. Three **featured** positions are reserved for actual, approved time-bounded sponsored or promotional-partner listings, falling back to clearly marked editorial/eligible affiliate picks when empty; up to nine distinct non-featured items are randomized from Pokémon-specific source queries.

- No live sponsorships exist in the source registry yet: `discover/pokemon/featured-placements.json` is deliberately empty.
- Future manual placements must use `{kind, approved, itemId, sellerUsername, startsAt, endsAt}`, where kind is `sponsored` or `partner`, approved is `true`, and dates are valid ISO strings. The source verifies current eBay item data, the seller, and listing quality before labeling it. **Never set approved without a genuine agreement and documented approval.**
- Sponsored means paid; partner means an actual promotional arrangement (including in-kind arrangements). Affiliate picks must not be called sponsors. All eBay links may produce commissions; prominent disclosures appear beside the shelf. The final outbound source link uses `rel="sponsored"`.
- The unfeatured nine are shuffled deterministically per UTC day and can be reshuffled using the button. Unrelated, broken, parts-only, unverified, nonphysical or mystery-pull listings are filtered. Results are not a quality rank or the cheapest deals.
- Placement promises should not be sold until the full buyer experience and source availability have been measured. If a promoted listing expires or no longer matches its specified seller, the slot automatically falls back to an editorial selection.
- Before revenue claims, verify the EPN URL and click attribution end-to-end, as well as eBay approval for promotion method, disclosures and compliant seller eligibility.

No backend keys or partner personal contact data are stored in the public registry.
