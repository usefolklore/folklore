/* Folklore store — Paddle.js checkout wiring.
   Buttons carry data-price="<key>"; key maps to a Paddle price id in config.js.
   Until a token + price id exist, buttons stay an inert "Coming soon". */
(function () {
  var cfg = ((window.FOLKLORE || {}).paddle) || {};
  var btns = Array.prototype.slice.call(document.querySelectorAll("[data-price]"));
  if (!btns.length) return;

  function coming(b) {
    b.setAttribute("aria-disabled", "true");
    b.textContent = "Coming soon";
  }

  if (!cfg.token || typeof window.Paddle === "undefined") {
    btns.forEach(coming);
    return;
  }

  try {
    if (cfg.environment === "sandbox" && window.Paddle.Environment) {
      window.Paddle.Environment.set("sandbox");
    }
    window.Paddle.Initialize({ token: cfg.token });
  } catch (e) {
    btns.forEach(coming);
    return;
  }

  var prices = cfg.priceIds || {};
  btns.forEach(function (b) {
    var pri = prices[b.dataset.price];
    if (!pri) { coming(b); return; }
    b.removeAttribute("aria-disabled");
    b.textContent = "Buy";
    b.addEventListener("click", function (e) {
      e.preventDefault();
      window.Paddle.Checkout.open({
        settings: { displayMode: "overlay", theme: "light" },
        items: [{ priceId: pri, quantity: 1 }]
      });
    });
  });
})();
