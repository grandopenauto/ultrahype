const ULTRAHYPE_EBAY_TOP_CATEGORIES = Object.freeze([
  { id: "20081", name: "Antiques" },
  { id: "550", name: "Art" },
  { id: "2984", name: "Baby" },
  { id: "267", name: "Books & Magazines" },
  { id: "12576", name: "Business & Industrial" },
  { id: "625", name: "Cameras & Photo" },
  { id: "15032", name: "Cell Phones & Accessories" },
  { id: "11450", name: "Clothing, Shoes & Accessories" },
  { id: "11116", name: "Coins & Paper Money" },
  { id: "1", name: "Collectibles" },
  { id: "58058", name: "Computers/Tablets & Networking" },
  { id: "293", name: "Consumer Electronics" },
  { id: "14339", name: "Crafts" },
  { id: "237", name: "Dolls & Bears" },
  { id: "45100", name: "Entertainment Memorabilia" },
  { id: "99", name: "Everything Else" },
  { id: "172008", name: "Gift Cards & Coupons" },
  { id: "26395", name: "Health & Beauty" },
  { id: "11700", name: "Home & Garden" },
  { id: "281", name: "Jewelry & Watches" },
  { id: "11232", name: "Movies & TV" },
  { id: "11233", name: "Music" },
  { id: "619", name: "Musical Instruments & Gear" },
  { id: "1281", name: "Pet Supplies" },
  { id: "870", name: "Pottery & Glass" },
  { id: "10542", name: "Real Estate" },
  { id: "316", name: "Specialty Services" },
  { id: "888", name: "Sporting Goods" },
  { id: "64482", name: "Sports Mem, Cards & Fan Shop" },
  { id: "260", name: "Stamps" },
  { id: "1305", name: "Tickets & Experiences" },
  { id: "220", name: "Toys & Hobbies" },
  { id: "3252", name: "Travel" },
  { id: "1249", name: "Video Games & Consoles" }
]);

window.ULTRAHYPE_CONFIG = Object.freeze({
  version: "2.4.0",
  environment: "launch",
  apiBase: "https://api.ultrahype.store",
  marketplacePath: "marketplace.html",
  integrations: {
    ebay: {
      enabled: true,
      environment: "production",
      searchPath: "/api/commerce/ebay/search",
      itemPath: "/api/commerce/ebay/item",
      categoriesPath: "/api/commerce/ebay/categories",
      intelligencePath: "/api/commerce/intelligence/discovery",
      fallbackCategories: ULTRAHYPE_EBAY_TOP_CATEGORIES
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

(() => {
  const nativeFetch = window.fetch.bind(window);
  const apiBase = String(window.ULTRAHYPE_CONFIG.apiBase || '').replace(/\/$/, '');
  const apiOrigin = (() => {
    try { return new URL(apiBase).origin; } catch { return ''; }
  })();
  const taxonomyPath = '/api/commerce/ebay/categories';
  const taxonomyCacheKey = 'ultrahype.ebay.taxonomy.production';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function requestInfo(input, init = {}) {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    try {
      const url = new URL(rawUrl, window.location.href);
      return { url, method, isUltraHypeApi: Boolean(apiOrigin && url.origin === apiOrigin) };
    } catch {
      return { url: null, method, isUltraHypeApi: false };
    }
  }

  function cachedTaxonomy() {
    try {
      const cached = JSON.parse(localStorage.getItem(taxonomyCacheKey) || 'null');
      if (Array.isArray(cached?.categories) && cached.categories.length >= 20) return cached.categories;
    } catch {}
    return ULTRAHYPE_EBAY_TOP_CATEGORIES;
  }

  function taxonomyResponse() {
    return new Response(JSON.stringify({
      provider: 'ebay',
      environment: 'production',
      marketplace: 'EBAY_US',
      categoryTreeVersion: '134-static-fallback',
      fallback: true,
      categories: cachedTaxonomy()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-UltraHype-Fallback': 'taxonomy' }
    });
  }

  window.fetch = async function ultrahypeResilientFetch(input, init = {}) {
    const info = requestInfo(input, init);
    if (!info.isUltraHypeApi || !['GET', 'HEAD'].includes(info.method)) {
      return nativeFetch(input, init);
    }

    let lastResponse = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await nativeFetch(input, init);
        if (response.ok || response.status < 500) {
          if (info.url?.pathname === taxonomyPath && response.ok) {
            response.clone().json().then((payload) => {
              if (Array.isArray(payload?.categories) && payload.categories.length >= 20) {
                try {
                  localStorage.setItem(taxonomyCacheKey, JSON.stringify({
                    categories: payload.categories,
                    categoryTreeVersion: payload.categoryTreeVersion || null,
                    savedAt: Date.now()
                  }));
                } catch {}
              }
            }).catch(() => {});
          }
          return response;
        }
        lastResponse = response;
      } catch (error) {
        lastError = error;
      }
      if (attempt < 2) await sleep(350 * (attempt + 1));
    }

    if (info.url?.pathname === taxonomyPath) return taxonomyResponse();
    if (lastResponse) return lastResponse;
    throw new Error('UltraHype connector temporarily unavailable. Please try again in a moment.', { cause: lastError });
  };
})();

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
