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
    document.getElementById("sidebar-nav").innerHTML = NAV.map((item) => `
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
      if (item.dataset.url) return window.open(item.dataset.url, "_blank", "noopener");
      // Make sure the item will be visible on its page
      if (item.dataset.page === "tasks") { Tasks.state.filter = "all"; Tasks.state.category = "all"; }
      if (item.dataset.page === "notes") { Notes.state.query = ""; Notes.state.category = "all"; }
      if (item.dataset.page === "goals") { Goals.state.horizon = "all"; Goals.state.category = "all"; }
      if (item.dataset.date) { Calendar.state.selected = item.dataset.date; Calendar.state.cursor = item.dataset.date; }
      Router.go(item.dataset.page, item.dataset.id || null);
    });
  },

  // Find matching tasks, habits, notes and links
  search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const has = (text) => String(text).toLowerCase().includes(q);
    const groups = [];

    const tasks = Tasks.all().filter((t) => has(t.title) || has(t.description) || t.tags.some(has)).slice(0, 6);
    if (tasks.length) groups.push({ label: "Tasks", items: tasks.map((t) => ({
      text: t.title, icon: t.done ? "circle-check" : "square-check-big", page: "tasks", id: t.id,
      hint: t.done ? "Done" : t.dueDate ? UI.relativeDay(t.dueDate) : "" })) });

    const events = Calendar.all().filter((e) => has(e.title) || has(e.description))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    if (events.length) groups.push({ label: "Events", items: events.map((e) => ({
      text: e.title, icon: Calendar.TYPES[e.type]?.icon || "calendar", page: "calendar", id: e.id, date: e.date, hint: UI.formatDay(e.date) })) });

    const subjects = Study.subjects().filter((s) => has(s.name)).slice(0, 6);
    if (subjects.length) groups.push({ label: "Subjects", items: subjects.map((s) => ({
      text: s.name, icon: "graduation-cap", page: "study", id: s.id, hint: `This week: ${UI.formatDuration(Study.secondsBetween(...Study.periods().week, s.id))}` })) });

    const habits = Habits.all().filter((h) => has(h.name)).slice(0, 6);
    if (habits.length) groups.push({ label: "Habits", items: habits.map((h) => ({ text: h.name, icon: "flame", page: "habits", id: h.id })) });

    const notes = Notes.sorted(Notes.all().filter((n) => Notes.matches(n, q))).slice(0, 6);
    const noteItems = notes.map((n) => ({ text: Notes.titleOf(n), icon: n.pinned ? "pin" : "file-text", page: "notes", id: n.id, hint: Notes.CATEGORIES[n.category] }));
    const quick = Store.get("quickNote");
    const at = quick.toLowerCase().indexOf(q);
    if (at !== -1) {
      const snippet = (at > 20 ? "…" : "") + quick.slice(Math.max(0, at - 20), at + q.length + 40).replace(/\s+/g, " ");
      noteItems.push({ text: snippet, icon: "notebook-pen", page: "dashboard", hint: "Quick note" });
    }
    if (noteItems.length) groups.push({ label: "Notes", items: noteItems });

    const goals = Goals.all().filter((g) => has(g.title) || has(g.description)).slice(0, 6);
    if (goals.length) groups.push({ label: "Goals", items: goals.map((g) => ({
      text: g.title, icon: g.status === "completed" ? "trophy" : "target", page: "goals", id: g.id, hint: g.status === "completed" ? "Completed" : `${g.progress}%` })) });

    const expenses = Expenses.all()
      .filter((e) => has(e.description) || has(Expenses.CATEGORIES[e.category]?.label || ""))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    if (expenses.length) groups.push({ label: "Expenses", items: expenses.map((e) => ({
      text: e.description || Expenses.CATEGORIES[e.category].label, icon: Expenses.CATEGORIES[e.category]?.icon || "receipt",
      page: "expenses", id: e.id, hint: `${Expenses.format(e.amount)} · ${UI.formatDay(e.date)}` })) });

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
            <button class="menu-item" type="button" data-page="${item.page || ""}" data-id="${UI.escape(item.id || "")}" data-date="${item.date || ""}"
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
      { id: "task", label: "New task", icon: "square-check-big", key: "T" },
      { id: "event", label: "New event", icon: "calendar", key: "E" },
      { id: "note", label: "New note", icon: "file-text", key: "N" },
      { id: "study", label: "Start study session", icon: "hourglass", key: "S" },
      { id: "expense", label: "Add expense", icon: "wallet", key: "X" },
      { id: "goal", label: "New goal", icon: "target", key: "G" },
      { id: "habit", label: "New habit", icon: "flame", key: "H" },
      { id: "link", label: "New favorite link", icon: "link", key: "L" },
    ];
    menu.innerHTML = actions.map((a) => `
      <button class="menu-item" type="button" role="menuitem" data-action="${a.id}">${icon(a.icon)}${a.label}<small>${a.key}</small></button>`).join("");

    // While the menu is open, a letter key picks the action (the letter shown on the right)
    menu.addEventListener("keydown", (event) => {
      const action = actions.find((a) => a.key === event.key.toUpperCase());
      if (action) {
        event.preventDefault();
        this.closeQuickAdd();
        this.quickAdd(action.id);
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
      const note = Notes.create({});
      Notes.state.query = "";
      Notes.state.category = "all";
      Router.go("notes", note.id);
      setTimeout(() => document.querySelector('.note-editor [data-field="title"]')?.focus(), 50);
      return;
    }

    if (type === "study") {
      if (Study.activeSession()) {
        UI.toast("A study session is already running.", { type: "info", actionLabel: "Open", onAction: () => Router.go("study") });
        return;
      }
      if (!Study.subjects().length) {
        UI.toast("First, add a subject (e.g. Mathematics).", { type: "info" });
        if (!(await Study.openSubjectEditor())) return;
      }
      const values = await UI.form({
        title: "Start a study session", submitLabel: "Start",
        fields: [
          { name: "subjectId", label: "Subject", type: "select", value: Study.draft.subjectId || Study.subjects()[0].id, options: Study.subjectOptions() },
          { name: "description", label: "What are you studying? (optional)", placeholder: "e.g. Chapter 4 exercises" },
        ],
      });
      if (values && Study.startTimer(values.subjectId, values.description)) {
        Study.draft.subjectId = values.subjectId;
        UI.toast(`Timer started for ${Study.subject(values.subjectId).name}`, { actionLabel: "Open", onAction: () => Router.go("study") });
        if (["study", "dashboard"].includes(Router.currentId())) Router.refresh();
      }
      return;
    }

    let created = null;
    let page = "";
    const quiet = { quiet: true }; // we show our own toast below

    if (type === "task") {
      created = await Tasks.openEditor(null, {}, quiet);
      page = "tasks";
      if (created) { Tasks.state.filter = "all"; Tasks.state.category = "all"; }
    }

    if (type === "event") {
      created = await Calendar.openEditor(null, {}, quiet);
      page = "calendar";
      if (created) { Calendar.state.selected = created.date; Calendar.state.cursor = created.date; }
    }

    if (type === "habit") {
      created = await Habits.openEditor(null, quiet);
      page = "habits";
    }

    if (type === "link") {
      created = await Links.openEditor(null, quiet);
      page = "dashboard";
    }

    if (type === "goal") {
      created = await Goals.openEditor(null, {}, quiet);
      page = "goals";
      if (created) { Goals.state.horizon = "all"; Goals.state.category = "all"; }
    }

    if (type === "expense") {
      created = await Expenses.openEditor(null, {}, quiet);
      page = "expenses";
      if (created && typeof created === "object") { Expenses.state.month = Expenses.monthKey(created.date); Expenses.state.category = "all"; }
    }

    if (!created || typeof created !== "object") return; // cancelled

    // If the new item is visible on the current page, redraw and highlight it.
    // Otherwise offer a button to go and see it.
    const current = Router.currentId();
    const label = { task: "Task", event: "Event", habit: "Habit", link: "Link", goal: "Goal", expense: "Expense" }[type];
    const onDashboard = ["tasks", "habits", "calendar", "dashboard"].includes(page); // goals/expenses aren't shown there
    if (current === page || (current === "dashboard" && onDashboard)) {
      Router.refresh(created.id);
      UI.toast(`${label} added`);
    } else {
      UI.toast(`${label} added`, { actionLabel: "View", onAction: () => Router.go(page, created.id) });
    }
  },

  // ===== Keyboard shortcuts =====
  showShortcuts() {
    const rows = [
      ["Ctrl + K  or  /", "Search everything"],
      ["Q", "Open quick add"],
      ["T  E  N  S  X  G  H  L", "In quick add: task, event, note, study session, expense, goal, habit, link"],
      ["↑  ↓  Enter", "Move through search results and open one"],
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

      // Ctrl+K (or ⌘K) or "/" focuses the search box
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        document.getElementById("search-input").focus();
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

      if (event.key === "Escape" && !document.querySelector(".modal-backdrop")) {
        this.closeSearch();
        this.closeQuickAdd();
        Notifications.close();
        this.closeMobileNav();
        if (event.target.id === "search-input") event.target.blur();
      }
    });
  },
};
