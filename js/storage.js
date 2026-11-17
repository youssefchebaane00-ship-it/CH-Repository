// =========================================================
// STORAGE: the one place that reads and writes saved data.
//
// Every collection lives in localStorage under a "pd." key:
//   pd.tasks, pd.habits, pd.links, pd.quickNote, pd.settings
// Other files never touch localStorage directly. They call
// Store.get("tasks") and Store.set("tasks", newList).
// =========================================================

const Store = {
  PREFIX: "pd.",
  VERSION: 2,

  // What each collection looks like when nothing is saved yet
  DEFAULTS: {
    tasks: [],        // { id, title, description, priority, dueDate, category, tags, done, createdAt, completedAt }
    habits: [],       // { id, name, frequency: "daily"|"weekly", weeklyTarget, doneDays: ["2026-11-17", ...], createdAt }
    events: [],       // { id, title, description, date, startTime, endTime, type }
    notes: [],        // { id, title, content, category, tags, pinned, createdAt, updatedAt }
    links: [          // { id, name, url }
      { id: "default-google", name: "Google", url: "https://www.google.com" },
      { id: "default-youtube", name: "YouTube", url: "https://www.youtube.com" },
      { id: "default-gmail", name: "Gmail", url: "https://mail.google.com" },
    ],
    quickNote: "",
    settings: {
      theme: "dark",
      weatherCity: "Tunis",
      profileName: "",
      sidebarCollapsed: false,
    },
  },

  // Fill in fields that older saved items don't have yet. This runs every
  // time a list is loaded, so old data always matches the newest format.
  NORMALIZE: {
    tasks: (t) => ({
      description: "", priority: "medium", dueDate: null, category: "other",
      done: false, createdAt: null, completedAt: null,
      ...t,
      tags: Array.isArray(t.tags) ? t.tags : [],
    }),
    habits: (h) => ({
      frequency: "daily", weeklyTarget: 3, createdAt: null,
      ...h,
      doneDays: Array.isArray(h.doneDays) ? h.doneDays.filter((d) => typeof d === "string") : [],
    }),
    events: (e) => ({ description: "", startTime: "", endTime: "", type: "event", ...e }),
    notes: (n) => ({
      title: "", content: "", category: "personal", pinned: false, createdAt: null, updatedAt: null,
      ...n,
      tags: Array.isArray(n.tags) ? n.tags : [],
    }),
    links: (l) => ({ ...l }),
  },

  cache: {},          // data already read, so we don't parse JSON every time
  listeners: [],

  // Read a collection (returns the saved value, or a copy of the default)
  get(name) {
    if (!(name in this.cache)) {
      let value;
      try {
        const saved = localStorage.getItem(this.PREFIX + name);
        value = saved === null ? undefined : JSON.parse(saved);
      } catch {
        value = undefined; // storage blocked or broken data: use the default
      }
      if (value === undefined) value = structuredClone(this.DEFAULTS[name]);

      // Lists: drop broken entries and fill in missing fields
      if (this.NORMALIZE[name]) {
        if (!Array.isArray(value)) value = structuredClone(this.DEFAULTS[name]);
        value = value.filter((item) => item && typeof item === "object" && item.id).map(this.NORMALIZE[name]);
      }

      // Settings: fill in any option added in a newer version
      if (name === "settings") value = { ...this.DEFAULTS.settings, ...value };
      this.cache[name] = value;
    }
    return this.cache[name];
  },

  // Save a collection, then tell listeners (e.g. statistics) that data changed
  set(name, value) {
    if (this.NORMALIZE[name] && Array.isArray(value)) value = value.map(this.NORMALIZE[name]);
    this.cache[name] = value;
    try {
      localStorage.setItem(this.PREFIX + name, JSON.stringify(value));
    } catch {
      if (typeof UI !== "undefined") {
        UI.toast("Couldn't save. Your browser's storage may be full or blocked.", { type: "error" });
      }
    }
    this.listeners.forEach((listener) => listener(name));
  },

  // Change one setting, e.g. Store.setSetting("theme", "light")
  setSetting(key, value) {
    this.set("settings", { ...this.get("settings"), [key]: value });
  },

  // Run `listener(name)` every time something is saved
  onChange(listener) {
    this.listeners.push(listener);
  },

  // A unique id for a new item, e.g. "lzx8k2f-4h1q"
  newId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  },

  // ---------------------------------------------------------
  // MIGRATION from version 1 (the original single-page dashboard).
  // Version 1 used the keys: todos, habits, links, notes, weatherCity, theme.
  // We COPY that data into the new format. The old keys are left untouched
  // as a backup, so nothing can be lost.
  // ---------------------------------------------------------
  migrate() {
    let version = 0;
    try {
      version = Number(localStorage.getItem(this.PREFIX + "version")) || 0;
    } catch {
      return; // storage blocked: nothing to migrate
    }
    if (version >= this.VERSION) return;

    const readOld = (key) => {
      try {
        const saved = localStorage.getItem(key);
        return saved === null ? undefined : JSON.parse(saved);
      } catch {
        return undefined;
      }
    };
    const now = new Date().toISOString();

    const oldTodos = readOld("todos");
    if (Array.isArray(oldTodos)) {
      this.set("tasks", oldTodos
        .filter((t) => t && typeof t.text === "string")
        .map((t) => ({
          id: this.newId(),
          title: t.text,
          done: Boolean(t.done),
          createdAt: now,
          completedAt: null, // version 1 didn't record WHEN a task was finished
        })));
    }

    const oldHabits = readOld("habits");
    if (Array.isArray(oldHabits)) {
      this.set("habits", oldHabits
        .filter((h) => h && typeof h.name === "string")
        .map((h) => ({
          id: this.newId(),
          name: h.name,
          doneDays: Array.isArray(h.doneDays) ? h.doneDays.filter((d) => typeof d === "string") : [],
          createdAt: null, // unknown in version 1
        })));
    }

    const oldLinks = readOld("links");
    if (Array.isArray(oldLinks)) {
      this.set("links", oldLinks
        .filter((l) => l && typeof l.name === "string" && typeof l.url === "string")
        .map((l) => ({ id: this.newId(), name: l.name, url: l.url })));
    }

    const oldNotes = readOld("notes");
    if (typeof oldNotes === "string") this.set("quickNote", oldNotes);

    const settings = { ...this.get("settings") };
    const oldTheme = readOld("theme");
    if (oldTheme === "light" || oldTheme === "dark") settings.theme = oldTheme;
    const oldCity = readOld("weatherCity");
    if (typeof oldCity === "string" && oldCity.trim()) settings.weatherCity = oldCity;
    this.set("settings", settings);

    try {
      localStorage.setItem(this.PREFIX + "version", String(this.VERSION));
    } catch {}
  },

  // Everything in one object, used for the backup file
  exportAll() {
    return {
      app: "PersonalDashboard",
      version: this.VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        tasks: this.get("tasks"),
        habits: this.get("habits"),
        events: this.get("events"),
        notes: this.get("notes"),
        links: this.get("links"),
        quickNote: this.get("quickNote"),
        settings: this.get("settings"),
      },
    };
  },
};
