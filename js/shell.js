// =========================================================
// SHELL: everything around the pages: sidebar, mobile menu,
// theme toggle, the search / command palette and the quick-add menu.
// These parts never get redrawn, so their listeners are set up once.
// What appears in menus and search comes from the modules (js/modules.js).
// =========================================================

const Shell = {
  app: document.getElementById("app"),
  lastResults: [], // what the search panel currently shows (used when you click one)

  init() {
    this.renderNav();
    this.renderProfile();
    document.documentElement.dataset.accent = Store.get("settings").accent; // also set early in index.html
    this.setupSidebar();
    this.setupTheme();
    this.setupSearch();
    this.setupQuickAdd();
    this.setupKeyboard();

    // Clicking anywhere else closes open menus
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".search")) this.closeSearch();
      if (!event.target.closest(".quick-add")) this.closeQuickAdd();
      if (!event.target.closest(".notifications")) Notifications.close();
    });
  },

  // ===== Sidebar =====
  renderNav() {
    document.getElementById("sidebar-nav").innerHTML = Modules.navItems().map((item) => `
      <a class="nav-link" href="#/${item.id}" data-nav="${item.id}" title="${UI.escape(item.label)}">
        ${icon(item.icon)}
        <span class="nav-label">${UI.escape(item.label)}</span>
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
    this.applyCollapsed = (collapsed) => {
      this.app.classList.toggle("sidebar-collapsed", collapsed);
      collapseButton.innerHTML = icon(collapsed ? "panel-left-open" : "panel-left-close");
      const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
      collapseButton.setAttribute("aria-label", label);
      collapseButton.title = label;
    };
    this.applyCollapsed(Store.get("settings").sidebarCollapsed);
    collapseButton.addEventListener("click", () => this.toggleSidebar());

    // Phones/tablets: the menu button opens the sidebar as a drawer
    const menuButton = document.getElementById("menu-button");
    menuButton.innerHTML = icon("menu");
    menuButton.addEventListener("click", () => {
      this.app.classList.add("nav-open");
      document.querySelector(".nav-link").focus();
    });
    document.getElementById("sidebar-overlay").addEventListener("click", () => this.closeMobileNav());
  },

  toggleSidebar() {
    const collapsed = !this.app.classList.contains("sidebar-collapsed");
    Store.setSetting("sidebarCollapsed", collapsed);
    this.applyCollapsed(collapsed);
  },

  closeMobileNav() {
    this.app.classList.remove("nav-open");
  },

  // ===== Theme =====
  setupTheme() {
    document.getElementById("theme-button").addEventListener("click", () => this.toggleTheme());
    this.updateThemeButton();
  },

  toggleTheme() {
    this.setTheme(Store.get("settings").theme === "dark" ? "light" : "dark");
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

  setAccent(accent) {
    const value = accent in Views.ACCENTS ? accent : "cyan";
    Store.setSetting("accent", value);
    document.documentElement.dataset.accent = value; // css/base.css picks the colors
  },

  updateThemeButton() {
    const dark = Store.get("settings").theme === "dark";
    const button = document.getElementById("theme-button");
    button.innerHTML = icon(dark ? "sun" : "moon");
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.title = label;
  },

  // ===== Search + command palette =====
  setupSearch() {
    const input = document.getElementById("search-input");
    const results = document.getElementById("search-results");
    document.getElementById("search-icon").innerHTML = icon("search");

    input.addEventListener("input", () => this.showResults(input.value));
    input.addEventListener("focus", () => this.showResults(input.value));

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
      const button = event.target.closest(".menu-item");
      if (!button) return;
      const item = this.lastResults[Number(button.dataset.index)];
      this.closeSearch();
      input.value = "";
      input.blur();
      if (!item) return;
      if (item.run) return item.run();                                       // a command
      if (item.url) return window.open(item.url, "_blank", "noopener");     // a link
      item.before?.();                                                      // e.g. reset a filter so it's visible
      Router.go(item.page, item.id || null);
    });
  },

  // Everything the palette can DO (not data): pages, quick actions, app commands
  commands() {
    const list = [
      ...Modules.navItems().map((n) => ({ label: `Go to ${n.label}`, icon: n.icon, keywords: `open page ${n.id}`, run: () => Router.go(n.id) })),
      ...Modules.quickActions().map((a) => ({ label: a.label, icon: a.icon, keywords: "add create new quick", hint: a.key, run: () => this.runQuickAction(a) })),
      { label: Store.get("settings").theme === "dark" ? "Switch to light theme" : "Switch to dark theme", icon: "sun", keywords: "theme dark light mode appearance", run: () => this.toggleTheme() },
      { label: "Collapse or expand sidebar", icon: "panel-left-close", keywords: "sidebar menu hide show", run: () => this.toggleSidebar() },
      { label: "Download a backup (Export JSON)", icon: "download", keywords: "backup export save data json", run: () => { Views.downloadBackup(); UI.toast("Backup downloaded"); } },
      { label: "Show keyboard shortcuts", icon: "keyboard", keywords: "help keys shortcuts", run: () => this.showShortcuts() },
      ...Modules.commands(),
    ];
    return list;
  },

  // Commands whose name or keywords contain every word typed
  matchCommands(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.commands().filter((c) => {
      const text = `${c.label} ${c.keywords || ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  },

  showResults(raw) {
    const results = document.getElementById("search-results");
    const commandMode = raw.trimStart().startsWith(">");
    const q = (commandMode ? raw.trimStart().slice(1) : raw).trim();

    // Highlight the matching part of the text with <mark>
    const mark = (text) => {
      const safe = UI.escape(text);
      if (!q) return safe;
      const pattern = new RegExp(UI.escape(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      return safe.replace(pattern, (m) => `<mark>${m}</mark>`);
    };

    // Empty box or ">": list commands. Otherwise: your data first, then matching commands.
    let groups;
    if (!q) groups = [{ label: "Commands", items: this.commands() }];
    else if (commandMode) groups = [{ label: "Commands", items: this.matchCommands(q) }];
    else groups = [...Modules.search(q), { label: "Commands", items: this.matchCommands(q).slice(0, 4) }];
    groups = groups.filter((g) => g.items.length);

    this.lastResults = groups.flatMap((g) => g.items);
    let index = 0;
    results.innerHTML = groups.length
      ? groups.map((g) => `
          <div class="search-group">${UI.escape(g.label)}</div>
          ${g.items.map((item) => `
            <button class="menu-item" type="button" data-index="${index++}" ${item.run ? "data-command" : `data-page="${UI.escape(item.page || "")}"`}>
              ${icon(item.icon)}<span class="result-text">${mark(item.text || item.label)}</span>${item.hint ? `<small>${UI.escape(item.hint)}</small>` : ""}
            </button>`).join("")}`).join("")
        + (!q ? `<div class="search-tip">Type to search your data · start with <kbd>&gt;</kbd> for commands only</div>` : "")
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

    const actions = Modules.quickActions();
    menu.innerHTML = actions.map((a) => `
      <button class="menu-item" type="button" role="menuitem" data-action="${a.id}">${icon(a.icon)}${UI.escape(a.label)}<small>${a.key}</small></button>`).join("");

    // While the menu is open, a letter key picks the action (the letter shown on the right)
    menu.addEventListener("keydown", (event) => {
      const action = actions.find((a) => a.key === event.key.toUpperCase());
      if (action) {
        event.preventDefault();
        this.runQuickAction(action);
      }
    });

    button.addEventListener("click", () => {
      const open = menu.hidden;
      menu.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      if (open) menu.querySelector(".menu-item").focus();
    });

    menu.addEventListener("click", (event) => {
      const item = event.target.closest("[data-action]");
      if (!item) return;
      this.runQuickAction(actions.find((a) => a.id === item.dataset.action));
    });
  },

  closeQuickAdd() {
    document.getElementById("quick-add-menu").hidden = true;
    document.getElementById("quick-add-button").setAttribute("aria-expanded", "false");
  },

  // Run a module's quick action. If it created something, show it:
  // redraw and highlight it if it's visible here, otherwise offer a "View" button.
  async runQuickAction(action) {
    this.closeQuickAdd();
    if (!action) return;
    const result = await action.run();
    if (!result || !result.created || typeof result.created !== "object") return; // cancelled, or handled by the module

    const { created, page, label, onDashboard } = result;
    const current = Router.currentId();
    if (current === page || (current === "dashboard" && onDashboard)) {
      Router.refresh(created.id);
      UI.toast(`${label} added`);
    } else {
      UI.toast(`${label} added`, { actionLabel: "View", onAction: () => Router.go(page, created.id) });
    }
  },

  // ===== Keyboard shortcuts =====
  showShortcuts() {
    const actions = Modules.quickActions();
    const rows = [
      ["Ctrl + K  or  /", "Search everything, or run a command"],
      [">", "In the search box: show commands only"],
      ["Q", "Open quick add"],
      [actions.map((a) => a.key).join("  "), `In quick add: ${actions.map((a) => a.label.toLowerCase()).join(", ")}`],
      ["↑  ↓  Enter", "Move through results and open one"],
      ["Esc", "Close a menu, dialog or search"],
      ["Tab", "Move between buttons and fields"],
      ["?", "Show this list"],
    ];
    UI.openModal(`
      <h2>${icon("keyboard")} Keyboard shortcuts</h2>
      <dl class="shortcut-list">
        ${rows.map(([keys, what]) => `<dt>${keys.split("  ").map((k) => `<kbd>${UI.escape(k)}</kbd>`).join(" ")}</dt><dd>${UI.escape(what)}</dd>`).join("")}
      </dl>
      <div class="modal-actions"><button class="btn btn-primary" type="button" data-close>Got it</button></div>`,
      (modal, close) => {
        modal.querySelector("[data-close]").addEventListener("click", close);
        modal.querySelector("[data-close]").focus();
        return close;
      });
  },

  setupKeyboard() {
    document.addEventListener("keydown", (event) => {
      // Are we typing in a field? (The key can also come from the page itself, which isn't an element.)
      const typing = event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]");

      // Ctrl+K (or ⌘K) or "/" opens the search / command palette
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        const input = document.getElementById("search-input");
        input.focus();
        this.showResults(input.value);
      }

      const modalOpen = document.querySelector(".modal-backdrop");
      // "?" shows the list of shortcuts
      if (event.key === "?" && !typing && !modalOpen) {
        event.preventDefault();
        this.showShortcuts();
      }
      // "q" opens the quick add menu
      if (event.key === "q" && !typing && !modalOpen && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        document.getElementById("quick-add-button").click();
      }

      if (event.key === "Escape" && !modalOpen) {
        this.closeSearch();
        this.closeQuickAdd();
        Notifications.close();
        this.closeMobileNav();
        if (event.target.id === "search-input") event.target.blur();
      }
    });
  },
};
