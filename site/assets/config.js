/* Folklore — runtime config. Fill these in to go live.
   Safe to commit: Paddle client-side tokens (live_/test_) and a public token mint
   are designed to be exposed in frontend code. NEVER put a Paddle API key here. */
window.FOLKLORE = {
  paddle: {
    // Paddle.js client-side token (starts with live_ or test_). Empty = checkout disabled ("coming soon").
    token: "",
    // "production" for live_ tokens, "sandbox" for test_ tokens.
    environment: "production",
    // Map each store product to its Paddle price id (starts with pri_).
    // Empty string = checkout stays "Coming soon" for that product.
    // PAYMENT PLAN (decided): DIGITAL-FIRST. Paddle's AUP forbids physical
    // goods — it's a Merchant of Record for digital only. At launch fill
    // pri_ ids for the DIGITAL SKUs ONLY (wallpaper-pack, texture-pack,
    // lore-badge, commons-zine, numbered-edition); leave every physical SKU
    // empty so it stays "Coming soon" (physical → a separate POD checkout
    // later). Stripe/Link is unavailable to Israel-based sellers.
    priceIds: {
      // hero bundle
      "commons-kit": "",
      // apparel
      tee: "",
      "mouth-ear-tee": "",
      hoodie: "",
      "nbw-longsleeve": "",
      cap: "",
      crewneck: "",
      // prints & posters
      "commons-print": "",
      "mouth-ear-print": "",
      "graph-poster": "",
      "hearth-riso": "",
      "nbw-poster": "",
      "swallow-fish-diptych": "",
      // stickers & pins
      stickers: "",
      "hearth-pin": "",
      "lore-medallion-pin": "",
      "holofoil-sticker": "",
      "node-magnets": "",
      "peers-first-sticker": "",
      "founders-pin": "",
      // digital & collectibles
      "wallpaper-pack": "",
      "texture-pack": "",
      "lore-badge": "",
      "commons-zine": "",
      "numbered-edition": "",
      "phygital-print": ""
    }
  },
  lore: {
    // $LORE SPL token mint address from bags.fm at launch. Empty = "not launched yet".
    mint: "",
    chain: "solana"
  }
};
