window.ULTRAHYPE_CONFIG = Object.freeze({
  version: "1.0.0",
  environment: "launch",
  apiBase: "",
  integrations: {
    ebay: {
      enabled: false,
      searchPath: "/api/commerce/ebay/search"
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
