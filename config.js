window.ULTRAHYPE_CONFIG = Object.freeze({
  version: "1.2.0",
  environment: "launch",
  apiBase: "https://api.ultrahype.store",
  integrations: {
    ebay: {
      enabled: false,
      environment: "sandbox",
      searchPath: "/api/commerce/ebay/search",
      intelligencePath: "/api/commerce/intelligence/discovery"
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
      enabled: false,
      catalogPath: "/api/catalog/shebavonova"
    }
  }
});
