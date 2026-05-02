/* Public-site bridge: fetches /site-settings.json on every page load and
   replaces marked elements with current values. Invisible to visitors. */

(function () {
  fetch("/site-settings.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => {
      if (!s) return;

      // For any element with [data-config="key"], replace its text content.
      document.querySelectorAll("[data-config]").forEach((el) => {
        const key = el.getAttribute("data-config");
        if (s[key] !== undefined && s[key] !== "") {
          el.textContent = s[key];
        }
      });

      // For [data-config-href="key"], replace href.
      document.querySelectorAll("[data-config-href]").forEach((el) => {
        const key = el.getAttribute("data-config-href");
        if (s[key]) el.setAttribute("href", s[key]);
      });

      // Visitor analytics: load GoatCounter if URL is set.
      if (s.goatcounter_url) {
        const sc = document.createElement("script");
        sc.async = true;
        sc.src = "//gc.zgo.at/count.js";
        sc.dataset.goatcounter = s.goatcounter_url.replace(/\/$/, "") + "/count";
        document.head.appendChild(sc);
      }
    })
    .catch(() => {});
})();
