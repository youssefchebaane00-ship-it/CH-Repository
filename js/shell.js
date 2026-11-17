// =========================================================
// SHELL: everything around the pages: sidebar, mobile menu,
// theme toggle, global search and the quick-add menu.
// These parts never get redrawn, so their listeners are set up once.
// =========================================================

const Shell = {
  app: document.getElementById("app"),

  init() {
    this.renderNav();
    this.renderProfile();
    this.setupSidebar();
    this.setupTheme();
    this.setupSearch();
    this.setupQuickAdd();
    this.setupKeyboard();

    // Clicking anywhere else closes open menus
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".search")) this.closeSearch();
      if (!event.target.closest(".quick-add")) this.closeQuickAdd();
    });
  },

  // ===== Sidebar =====
  renderNav() {
    document.getElementById("sidebar-nav").innerHTML = NAV.map((item) => `
      <a class="nav-link" href="#/${item.id}" data-nav="${item.id}" title="${UI.escape(item.label)}">
        ${icon(item.icon)}
        <span class="nav-label">${UI.escape(item.label)}</span>
        ${item.phase ? `<span class="nav-badge">Soon</span>` : ""}
      </a>`).join("");
  },

  setActive(id) {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.dataset.nav === id) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  },

  renderProfile() {
    const name = Store.get("settings").profileName.trim();
    document.getElementById("profile").innerHTML = `
      <span class="avatar">${name ? UI.escape(name.charAt(0).toUpperCase()) : icon("user")}</span>
      <span class="profile-text">
        <span class="profile-name">${name ? UI.escape(name) : "Your profile"}</span>
        <span class="profile-sub">${name ? "Settings" : "Add your name"}</span>
      </span>`;
    document.getElementById("profile").title = "Settings";
  },

  setupSidebar() {
    const collapseButton = document.getElementById("collapse-button");
    const applyCollapsed = (collapsed) => {
      this.app.classList.toggle("sidebar-collapsed", collapsed);
      collapseButton.innerHTML = icon(collapsed ? "panel-left-open" : "panel-left-close");
      const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
      collapseButton.setAttribute("aria-label", label);
      collapseButton.title = label;
    };
    applyCollapsed(Store.get("settings").sidebarCollapsed);

    collapseButton.addEventListener("click", () => {
      const collapsed = !this.app.classList.contains("sidebar-collapsed");
      Store.setSetting("sidebarCollapsed", collapsed);
      applyCollapsed(collapsed);
    });

    // Phones/tablets: the menu button opens the sidebar as a drawer
    const menuButton = document.getElementById("menu-button");
    menuButton.innerHTML = icon("menu");
    menuButton.addEventListener("click", () => {
      this.app.classList.add("nav-open");
      document.querySelector(".nav-link").focus();
    });
    document.getElementById("sidebar-overlay").addEventListener("click", () => this.closeMobileNav());
  },

  closeMobileNav() {
    this.app.classList.remove("nav-open");
  },

  // ===== Theme =====
  setupTheme() {
    document.getElementById("theme-button").addEventListener("click", () => {
      this.setTheme(Store.get("settings").theme === "dark" ? "light" : "dark");
    });
    this.updateThemeButton();
  },

  setTheme(theme) {
    Store.setSetting("theme", theme); // save right away (the visual switch below may happen a moment later)
    const apply = () => {
      document.documentElement.dataset.theme = theme;
      this.updateThemeButton();
    };
    // Cross-fade between themes where the browser supports it.
    // If you click again while a cross-fade is still running, the browser
    // cancels the old one and reports that as an error; .catch() tells it
    // we expected that, so the console stays clean.
    if (document.startViewTransition && !UI.reduceMotion.matches) {
      const transition = document.startViewTransition(apply);
      transition.ready.catch(() => {});
      transition.finished.catch(() => {});
    } else {
      apply();
    }
  },

  updateThemeButton() {
    const dark = Store.get("settings").theme === "dark";
    const button = document.getElementById("theme-button");
    button.innerHTML = icon(dark ? "sun" : "moon");
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.title = label;
  },

  // ===== Global search =====
  setupSearch() {
    const input = document.getElementById("search-input");
    const results = document.getElementById("search-results");
    document.getElementById("search-icon").innerHTML = icon("search");

    input.addEventListener("input", () => this.showResults(input.value));
    input.addEventListener("focus", () => { if (input.value.trim()) this.showResults(input.value); });

    // Arrow keys move through results, Enter opens one
    input.addEventListener("keydown", (event) => {
      const items = [...results.querySelectorAll(".menu-item")];
      if (!items.length) return;
      let index = items.findIndex((el) => el.classList.contains("active"));

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        index = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle("active", i === index));
        items[index].scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter") {
        event.preventDefault();
        (items[index] || items[0]).click();
      }
    });

    results.addEventListener("click", (event) => {
      const item = event.target.closest(".menu-item");
      if (!item) return;
      this.closeSearch();
      input.value = "";
      input.blur();
      if (item.dataset.url) window.open(item.dataset.url, "_blank", "noopener");
      else Router.go(item.dataset.page, item.dataset.id || null);
    });
  },

  // Find matching tasks, habits, notes and links
  search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const has = (text) => String(text).toLowerCase().includes(q);
    const groups = [];

    const tasks = Store.get("tasks").filter((t) => has(t.title)).slice(0, 6);
    if (tasks.length) groups.push({ label: "Tasks", items: tasks.map((t) => ({ text: t.title, icon: t.done ? "circle-check" : "square-check-big", page: "tasks", id: t.id, hint: t.done ? "Done" : "" })) });

    const habits = Store.get("habits").filter((h) => has(h.name)).slice(0, 6);
    if (habits.length) groups.push({ label: "Habits", items: habits.map((h) => ({ text: h.name, icon: "flame", page: "habits", id: h.id })) });

    const note = Store.get("quickNote");
    const at = note.toLowerCase().indexOf(q);
    if (at !== -1) {
      const snippet = (at > 20 ? "…" : "") + note.slice(Math.max(0, at - 20), at + q.length + 40).replace(/\s+/g, " ");
      groups.push({ label: "Notes", items: [{ text: snippet, icon: "notebook-pen", page: "notes" }] });
    }

    const links = Store.get("links").filter((l) => has(l.name) || has(l.url)).slice(0, 6);
    if (links.length) groups.push({ label: "Links", items: links.map((l) => ({ text: l.name, icon: "external-link", url: Links.normalizeUrl(l.url), hint: "Opens in new tab" })) });

    return groups;
  },

  showResults(query) {
    const results = document.getElementById("search-results");
    if (!query.trim()) return this.closeSearch();

    // Highlight the matching part of the text with <mark>
    const q = query.trim();
    const mark = (text) => {
      const safe = UI.escape(text);
      const pattern = new RegExp(UI.escape(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      return safe.replace(pattern, (m) => `<mark>${m}</mark>`);
    };

    const groups = this.search(query);
    results.innerHTML = groups.length
      ? groups.map((g) => `
          <div class="search-group">${g.label}</div>
          ${g.items.map((item) => `
            <button class="menu-item" type="button" data-page="${item.page || ""}" data-id="${UI.escape(item.id || "")}"
                    ${item.url ? `data-url="${UI.escape(item.url)}"` : ""}>
              ${icon(item.icon)}<span class="result-text">${mark(item.text)}</span>${item.hint ? `<small>${item.hint}</small>` : ""}
            </button>`).join("")}`).join("")
      : `<div class="search-empty">No results for “${UI.escape(q)}”</div>`;
    results.hidden = false;
  },

  closeSearch() {
    document.getElementById("search-results").hidden = true;
  },

  // ===== Quick add =====
  setupQuickAdd() {
    const button = document.getElementById("quick-add-button");
    const menu = document.getElementById("quick-add-menu");
    button.innerHTML = `${icon("plus")}<span class="quick-add-label">Quick add</span>`;
    button.setAttribute("aria-label", "Quick add");

    const actions = [
      { id: "task", label: "New task", icon: "square-check-big" },
      { id: "habit", label: "New habit", icon: "flame" },
      { id: "link", label: "New favorite link", icon: "link" },
      { id: "note", label: "Write in quick note", icon: "notebook-pen" },
    ];
    menu.innerHTML = actions.map((a) => `
      <button class="menu-item" type="button" role="menuitem" data-action="${a.id}">${icon(a.icon)}${a.label}</button>`).join("");

    button.addEventListener("click", () => {
      const open = menu.hidden;
      menu.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      if (open) menu.querySelector(".menu-item").focus();
    });

    menu.addEventListener("click", (event) => {
      const item = event.target.closest("[data-action]");
      if (!item) return;
      this.closeQuickAdd();
      this.quickAdd(item.dataset.action);
    });
  },

  closeQuickAdd() {
    document.getElementById("quick-add-menu").hidden = true;
    document.getElementById("quick-add-button").setAttribute("aria-expanded", "false");
  },

  async quickAdd(type) {
    if (type === "note") {
      Router.go("notes");
      setTimeout(() => document.querySelector("[data-note-input]")?.focus(), 50);
      return;
    }

    let created = null;
    let page = "";

    if (type === "task") {
      const values = await UI.form({ title: "New task", submitLabel: "Add task",
        fields: [{ name: "title", label: "Task", placeholder: "What do you need to do?", required: true }] });
      if (values) { created = Tasks.add(values.title); page = "tasks"; }
    }

    if (type === "habit") {
      const values = await UI.form({ title: "New habit", submitLabel: "Add habit",
        fields: [{ name: "name", label: "Habit", placeholder: "e.g. Drink 2L of water", required: true }] });
      if (values) { created = Habits.add(values.name); page = "habits"; }
    }

    if (type === "link") {
      const values = await UI.form({ title: "New favorite link", submitLabel: "Add link",
        fields: [
          { name: "name", label: "Name", placeholder: "e.g. GitHub", required: true },
          { name: "url", label: "Address", placeholder: "e.g. github.com", required: true,
            validate: (v) => (Links.normalizeUrl(v) ? "" : "Enter a valid web address, like github.com") },
        ] });
      if (values) { created = Links.add(values.name, Links.normalizeUrl(values.url)); page = "dashboard"; }
    }

    if (!created) return; // cancelled

    // If the new item is visible on the current page, redraw and highlight it.
    // Otherwise offer a button to go and see it.
    const current = Router.currentId();
    const label = { task: "Task", habit: "Habit", link: "Link" }[type];
    if (current === page || current === "dashboard") {
      Router.refresh(created.id);
      UI.toast(`${label} added`);
    } else {
      UI.toast(`${label} added`, { actionLabel: "View", onAction: () => Router.go(page, created.id) });
    }
  },

  // ===== Keyboard shortcuts =====
  setupKeyboard() {
    document.addEventListener("keydown", (event) => {
      const typing = event.target.closest("input, textarea, select, [contenteditable]");

      // Ctrl+K (or ⌘K) or "/" focuses the search box
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        document.getElementById("search-input").focus();
      }

      if (event.key === "Escape" && !document.querySelector(".modal-backdrop")) {
        this.closeSearch();
        this.closeQuickAdd();
        this.closeMobileNav();
        if (event.target.id === "search-input") event.target.blur();
      }
    });
  },
};
