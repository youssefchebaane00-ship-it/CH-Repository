// @real-time 40000 @serve   (runs from http://localhost so the service worker can work)
// Automated test for Stage C: installable app (manifest + service worker + offline cache)
(async () => {
  const out = [];
  const setTitle = (text) => { Router.pageTitle = text; document.title = text; };
  const ok = (name, cond, extra = "") => {
    out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra !== "" ? "  (" + extra + ")" : ""}`);
    setTitle(`TEST-PROGRESS ${out.length} checks, last: ${name}`);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (cond, ms = 15000) => { for (let i = 0; i < ms / 200 && !(await cond()); i++) await wait(200); return cond(); };

  try {
    await wait(500);
    ok("opened from a web address", location.protocol === "http:");
    ok("PWA supported here", PWA.supported());

    // Manifest
    const manifestLink = document.querySelector('link[rel="manifest"]');
    const manifest = await (await fetch(manifestLink.href)).json();
    ok("manifest: name, standalone, colors", manifest.name === "PersonalDashboard" && manifest.display === "standalone" && manifest.theme_color === "#0a1020");
    const iconsOk = await Promise.all(manifest.icons.map(async (i) => (await fetch(i.src)).ok));
    ok("manifest icons exist (192, 512, maskable)", manifest.icons.length === 3 && iconsOk.every(Boolean) && manifest.icons.some((i) => i.purpose === "maskable"));

    // Service worker
    const registration = await Promise.race([navigator.serviceWorker.ready, wait(15000).then(() => null)]);
    ok("service worker installed and active", !!registration && !!registration.active);
    ok("page is controlled by the service worker", await until(() => Boolean(navigator.serviceWorker.controller)));

    // Every file the page loads is in the offline cache
    const names = await caches.keys();
    ok("offline cache created", names.includes("personal-dashboard-v1"), names.join(","));
    const cache = await caches.open("personal-dashboard-v1");
    const needed = [
      ...[...document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src")),
      ...[...document.querySelectorAll('link[rel="stylesheet"][href]:not([href^="http"])')].map((l) => l.getAttribute("href")),
      "manifest.webmanifest", "icons/icon-192.png", "index.html",
    ];
    const missing = [];
    for (const path of needed) if (!(await cache.match(new URL(path, location.href).href))) missing.push(path);
    ok(`all ${needed.length} app files cached for offline use`, missing.length === 0, missing.join(", "));
    ok("new modules are picked up automatically (read from index.html)", needed.includes("js/widgets/achievements.js") && !missing.includes("js/widgets/achievements.js"));

    // Answers come from the cache
    const cached = await cache.match(new URL("js/app.js", location.href).href);
    ok("cached copy is the real file", cached && /Store\.migrate\(\)/.test(await cached.text()));
    ok("weather is never cached", !(await cache.keys()).some((r) => r.url.includes("open-meteo")));

    // Settings explains the state
    location.hash = "/settings"; await wait(300);
    ok("settings: works offline", /Works offline/.test(document.querySelector("[data-pwa-status]").textContent), document.querySelector("[data-pwa-status]").textContent);
    ok("install command in the palette", Shell.commands().some((c) => c.label === "Install as an app"));
  } catch (e) {
    out.push("CRASH  " + e.message);
  }

  const passed = out.filter((l) => l.startsWith("PASS")).length;
  const failures = out.filter((l) => l.startsWith("FAIL") || l.startsWith("CRASH"));
  if (window.__errors.length) failures.push("JS ERRORS: " + window.__errors.join(" | "));
  setTitle(`TEST-DONE ${passed} ${failures.length}${failures.map((f) => " || " + f.replace(/\s+/g, " ").slice(0, 300)).join("")}`);
})();
