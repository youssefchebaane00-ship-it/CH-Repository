// =========================================================
// INSTALLABLE APP (PWA): registers the service worker (sw.js) and
// offers an "Install app" button when the browser allows it.
//
// This only works when the app is opened from a web address
// (http://localhost:… or https://…). Opened by double-clicking
// index.html, nothing changes: the app works exactly as before.
// =========================================================

const PWA = {
  installPrompt: null, // the browser's install offer, saved for when you click "Install"

  supported() {
    return "serviceWorker" in navigator && location.protocol.startsWith("http");
  },

  installed() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  },

  init() {
    // Chrome/Edge offer installation through this event; we keep it for our own button
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.installPrompt = event;
      document.querySelectorAll("[data-install-app]").forEach((b) => { b.hidden = false; });
    });
    window.addEventListener("appinstalled", () => {
      this.installPrompt = null;
      UI.toast("PersonalDashboard is installed. Find it with your other apps.");
    });

    if (!this.supported()) return;
    navigator.serviceWorker.register("sw.js").catch((error) => console.warn("Offline mode unavailable:", error));
    // A newer version took over: offer a reload
    let reloading = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      UI.toast("A new version of the app is ready.", { type: "info", duration: 10000, actionLabel: "Reload", onAction: () => { reloading = true; location.reload(); } });
    });
  },

  async install() {
    if (!this.installPrompt) {
      UI.toast(this.supported()
        ? "Your browser doesn't offer installing right now. In Chrome or Edge, look for the install icon in the address bar."
        : "Installing needs the app to be opened from a web address. See README → “Install as an app”.", { type: "info", duration: 7000 });
      return;
    }
    this.installPrompt.prompt();
    const choice = await this.installPrompt.userChoice;
    if (choice.outcome !== "accepted") UI.toast("Installation cancelled", { type: "info" });
    this.installPrompt = null;
    document.querySelectorAll("[data-install-app]").forEach((b) => { b.hidden = true; });
  },

  statusText() {
    if (this.installed()) return "Installed. You're using it as an app.";
    if (!this.supported()) return "Opened as a file. Install and offline mode need a web address (see README → “Install as an app”).";
    return navigator.serviceWorker.controller ? "Works offline. You can install it as an app." : "Preparing offline mode…";
  },
};

Modules.register({
  id: "pwa",
  order: 96,
  commands: [{ label: "Install as an app", icon: "smartphone", keywords: "install pwa app offline desktop phone", run: () => PWA.install() }],
});
