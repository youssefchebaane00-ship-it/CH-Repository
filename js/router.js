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

  currentId() {
    const id = location.hash.replace(/^#\/?/, "");
    return NAV.some((item) => item.id === id) ? id : "dashboard";
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
    const item = NAV.find((n) => n.id === id);
    const view = document.getElementById("view");

    // Draw the page. Replacing the content also removes the old page's
    // elements and their event listeners, so nothing piles up in memory.
    view.innerHTML = "";
    Views[id](view);

    if (animate) UI.replayAnimation(view, "view-enter");
    document.getElementById("page-title").textContent = item.label;
    this.pageTitle = `${item.label} · PersonalDashboard`; // study.js adds a running timer in front
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
