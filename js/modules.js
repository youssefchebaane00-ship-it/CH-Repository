// =========================================================
// MODULE REGISTRY
// Each feature (Tasks, Calendar, Habits…) describes itself ONCE by calling
// Modules.register({...}) at the bottom of its own file. The shared parts of
// the app (sidebar, router, search, notifications, quick add, dashboard,
// backups) simply ask the registry what exists.
//
// Result: a new module plugs in without editing any shared file.
//
// A module can declare any of these (all optional except id):
//
// {
//   id: "tasks",                       unique name, also the page address (#/tasks)
//   order: 20,                         position in menus and lists (smaller = first)
//   nav: { label, icon },              a sidebar entry (needs `page`)
//   page: (container) => {...},        draws the module's page
//   collections: {                     data it saves (see storage.js)
//     tasks: { default: [], normalize: (item) => item, backup: true },
//   },
//   search: (query, has) => group,     search results: { label, items: [...] }
//                                      item: { text, icon, hint, page, id, url, before() }
//   notifications: () => [items],      reminders for the bell
//                                      item: { tone, icon, text, sub, page, id, urgent, before() }
//   quickAdd: [{ id, label, icon, key, order, run }],
//                                      run() returns { created, page, label, onDashboard }
//                                      or nothing if it handled everything itself
//   widgets: [{ id, label, span, order, render }],   dashboard widgets
//   commands: [{ label, icon, keywords, run }],      extra command palette entries
// }
// =========================================================

const Modules = {
  list: [],

  register(module) {
    if (!module || typeof module.id !== "string" || !module.id) throw new Error("A module needs an id.");
    if (this.list.some((m) => m.id === module.id)) throw new Error(`Module "${module.id}" is registered twice.`);
    if (module.nav && typeof module.page !== "function") throw new Error(`Module "${module.id}" has a menu entry but no page.`);

    // Tell the storage about the module's data
    Object.entries(module.collections || {}).forEach(([name, def]) => Store.defineCollection(name, def));

    this.list.push({ order: 500, ...module });
    this.list.sort((a, b) => a.order - b.order);
  },

  get(id) {
    return this.list.find((m) => m.id === id) || null;
  },

  // Sidebar entries, in order
  navItems() {
    return this.list.filter((m) => m.nav).map((m) => ({ id: m.id, label: m.nav.label, icon: m.nav.icon }));
  },

  // Ask every module for search results. One module failing never breaks search.
  search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const has = (text) => String(text ?? "").toLowerCase().includes(q);
    return this.collect("search", (m) => m.search(q, has))
      .flat()
      .filter((group) => group && group.items && group.items.length);
  },

  // Every reminder from every module; urgent ones first, otherwise module order
  notifications() {
    const items = this.collect("notifications", (m) => m.notifications()).flat().filter(Boolean);
    return [...items.filter((i) => i.urgent), ...items.filter((i) => !i.urgent)];
  },

  quickActions() {
    return this.list.flatMap((m) => m.quickAdd || []).sort((a, b) => (a.order ?? 500) - (b.order ?? 500));
  },

  widgets() {
    return this.list.flatMap((m) => m.widgets || []).sort((a, b) => (a.order ?? 500) - (b.order ?? 500));
  },

  commands() {
    return this.list.flatMap((m) => m.commands || []);
  },

  // Run `fn` for each module that has `key`, skipping (and reporting) any that throw
  collect(key, fn) {
    const results = [];
    for (const module of this.list) {
      if (typeof module[key] !== "function") continue;
      try {
        results.push(fn(module));
      } catch (error) {
        console.error(`Module "${module.id}" failed in ${key}:`, error);
      }
    }
    return results;
  },
};
