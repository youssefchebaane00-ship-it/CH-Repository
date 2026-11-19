// =========================================================
// ROUTER: switches pages without reloading.
// The page name lives in the address after "#", e.g. index.html#/tasks.
// Changing it fires a "hashchange" event, and we draw the matching page.
// The back/forward buttons work for free.
// =========================================================

const Router = {
  highlightId: null, // an item to highlight after the page is drawn (from search)
  pageTitle: "PersonalDashboard",

  start() {
    window.addEventListener("hashchange", () => this.render());
    this.render();
  },

  // The page in the address, if a module with a page has that name
  currentId() {
    const id = location.hash.replace(/^#\/?/, "");
    return Modules.get(id)?.page ? id : "dashboard";
  },

  // Go to a page, optionally highlighting one item on it
  go(id, highlightId = null) {
    this.highlightId = highlightId;
    if (this.currentId() === id && location.hash) this.render();
    else location.hash = "/" + id;
  },

  // Redraw the current page (e.g. after "Undo" or a quick add)
  refresh(highlightId = null) {
    this.highlightId = highlightId;
    this.render({ animate: false });
  },

  render({ animate = true } = {}) {
    const id = this.currentId();
    const module = Modules.get(id);
    const label = module.nav?.label || id;
    const view = document.getElementById("view");

    // Draw the page. Replacing the content also removes the old page's
    // elements and their event listeners, so nothing piles up in memory.
    view.innerHTML = "";
    try {
      module.page(view);
    } catch (error) {
      // A bug in one page must not freeze the whole app
      console.error(`Page "${id}" failed:`, error);
      view.innerHTML = `<section class="card">${UI.emptyState("triangle-alert", "This page couldn't load", "Your data is safe. Try another page or refresh.")}</section>`;
    }

    if (animate) UI.replayAnimation(view, "view-enter");
    document.getElementById("page-title").textContent = label;
    this.pageTitle = `${label} · PersonalDashboard`; // study.js adds a running timer in front
    document.title = this.pageTitle;
    Shell.setActive(id);
    Shell.closeMobileNav();
    Stats.refresh();

    if (this.highlightId) {
      const target = view.querySelector(`[data-id="${CSS.escape(this.highlightId)}"]`);
      if (target) UI.highlight(target);
      this.highlightId = null;
    } else if (animate) {
      window.scrollTo(0, 0);
    }
  },
};
