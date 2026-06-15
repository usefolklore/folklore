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
    priceIds: {
      tee: "",
      stickers: "",
      pin: "",
      "commons-print": "",
      "hero-print": "",
      "graph-poster": ""
    }
  },
  lore: {
    // $LORE SPL token mint address from bags.fm at launch. Empty = "not launched yet".
    mint: "",
    chain: "solana"
  }
};
