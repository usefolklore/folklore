/* Folklore — live $LORE worth via DexScreener public API (no key, CORS-open).
   Renders into #lore-worth. Graceful pre-launch + error states. Polls every 30s. */
(function () {
  var cfg = ((window.FOLKLORE || {}).lore) || {};
  var el = document.getElementById("lore-worth");
  if (!el) return;

  function fmt(n) {
    n = Number(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toFixed(0);
  }
  function pre(msg) { el.innerHTML = '<span class="lw-pre">' + msg + "</span>"; }

  if (!cfg.mint) { pre("$LORE — not launched yet"); return; }

  function render(p) {
    var price = Number(p.priceUsd);
    var mc = p.marketCap || p.fdv || 0;
    var ch = (p.priceChange && p.priceChange.h24) || 0;
    var dir = ch >= 0 ? "up" : "dn";
    el.innerHTML =
      '<div class="lw-mc">$' + fmt(mc) + '</div>' +
      '<div class="lw-lbl">the bag’s worth</div>' +
      '<div class="lw-row"><span class="lw-price">$' + (price ? price.toPrecision(4) : "0") + '</span>' +
      '<span class="lw-ch ' + dir + '">' + (ch >= 0 ? "+" : "") + ch.toFixed(1) + '% 24h</span></div>';
  }

  function load() {
    fetch("https://api.dexscreener.com/latest/dex/tokens/" + encodeURIComponent(cfg.mint))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var pairs = (j.pairs || []).filter(function (p) { return p.chainId === (cfg.chain || "solana"); });
        if (!pairs.length) { pre("$LORE — indexing… check back soon"); return; }
        pairs.sort(function (a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
        render(pairs[0]);
      })
      .catch(function () { pre("$LORE — worth unavailable right now"); });
  }
  load();
  setInterval(load, 30000);
})();
