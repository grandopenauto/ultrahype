window.ULTRAHYPE_CONFIG = Object.freeze({
  version: "2.3.0",
  environment: "launch",
  apiBase: "https://api.ultrahype.store",
  marketplacePath: "marketplace.html",
  integrations: {
    ebay: {
      enabled: true,
      environment: "sandbox",
      searchPath: "/api/commerce/ebay/search",
      itemPath: "/api/commerce/ebay/item",
      categoriesPath: "/api/commerce/ebay/categories",
      intelligencePath: "/api/commerce/intelligence/discovery"
    },
    activity: {
      enabled: true,
      eventPath: "/api/commerce/activity/event",
      trendingPath: "/api/commerce/activity/trending",
      livePath: "/api/commerce/activity/live",
      sellersPath: "/api/commerce/activity/sellers"
    },
    hdpPay: {
      enabled: false,
      checkoutPath: "/api/commerce/checkout"
    },
    agentForSell: {
      enabled: false,
      catalogPath: "/api/catalog/agentforsell"
    },
    fsHack: {
      enabled: false,
      catalogPath: "/api/catalog/fshack"
    },
    shebavonova: {
      enabled: true,
      catalogPath: "/catalog/shebavonova"
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('#site-nav.site-nav');
  if (!nav || nav.querySelector('[data-ultrahype-marketplace-entry]')) return;
  const link = document.createElement('a');
  link.href = window.ULTRAHYPE_CONFIG.marketplacePath;
  link.textContent = 'Marketplace';
  link.dataset.ultrahypeMarketplaceEntry = 'true';
  const pill = nav.querySelector('.nav-pill');
  if (pill) nav.insertBefore(link, pill);
  else nav.appendChild(link);
});
