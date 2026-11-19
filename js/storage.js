// =========================================================
// STORAGE: the one place that reads and writes saved data.
//
// Each piece of data ("collection") lives in localStorage under a "pd." key,
// e.g. pd.tasks or pd.settings. Other files never touch localStorage directly:
// they call Store.get("tasks") and Store.set("tasks", newList).
//
// Modules declare their own collections (default value, how to repair old
// items, whether it goes into backups) through js/modules.js, which calls
// Store.defineCollection(). Only the settings are defined here.
// =========================================================

const Store = {
  PREFIX: "pd.",

  // Settings shared by the whole app
  DEFAULTS: {
    settings: {
      theme: "dark",
      weatherCity: "Tunis",
      profileName: "",
      sidebarCollapsed: false,
      pomodoroFocus: 25,      // minutes
      pomodoroShort: 5,
      pomodoroLong: 15,
      pomodoroLongEvery: 4,   // a long break after every 4 focus sessions
      pomodoroSound: true,
      currency: "TND",
      monthlyBudget: 0,       // 0 = no budget
      accent: "cyan",
      lastExportAt: null,     // when a backup file was last downloaded
      plannerDayStart: "08:00", // the planner suggests time blocks between these hours
      plannerDayEnd: "20:00",
      gamification: true,     // levels, XP, achievements and challenges
      celebrations: true,     // confetti + a message for a new level or achievement
      // Which dashboard widgets are shown (Settings → Dashboard). Missing = shown.
      dashboardWidgets: {},
    },
  },

  NORMALIZE: {},      // name → function that repairs one item of a list
  collections: {},    // name → { backup, resetOnImport }
  cache: {},          // data already read, so we don't parse JSON every time
  listeners: [],

  // Called by Modules.register() for each collection a module declares
  defineCollection(name, { default: defaultValue, normalize = null, backup = false, resetOnImport = false }) {
    if (name in this.collections || name === "settings") throw new Error(`Collection "${name}" is defined twice.`);
    this.DEFAULTS[name] = defaultValue;
    if (normalize) this.NORMALIZE[name] = normalize;
    this.collections[name] = { backup, resetOnImport };
  },

  // Names of the collections that go into backup files, in definition order
  backupNames() {
    return Object.keys(this.collections).filter((name) => this.collections[name].backup);
  },

  // Read a collection (returns the saved value, or a copy of the default)
  get(name) {
    if (!(name in this.cache)) {
      if (!(name in this.DEFAULTS)) throw new Error(`Unknown collection "${name}".`);
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
      if (name === "settings") {
        value = { ...this.DEFAULTS.settings, ...value };
        value.dashboardWidgets = { ...(value.dashboardWidgets || {}) };
      }
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
  // MIGRATIONS: numbered upgrade steps for saved data.
  // pd.version remembers the last step that ran. On start, every newer
  // step runs once, in order. To change the data format in the future,
  // ADD a step at the end; never edit an old one.
  // Steps copy and repair data; they never delete the user's data.
  // ---------------------------------------------------------
  MIGRATIONS: [
    {
      to: 2,
      about: "Version 1 (single page) → 2.0: copy todos, habits, links, notes and settings into the new format",
      run(store) {
        const readOld = (key) => {
          try {
            const saved = localStorage.getItem(key);
            return saved === null ? undefined : JSON.parse(saved);
          } catch {
            return undefined;
          }
        };
        const now = new Date().toISOString();

        // The old keys are left untouched as a backup, so nothing can be lost.
        const oldTodos = readOld("todos");
        if (Array.isArray(oldTodos)) {
          store.set("tasks", oldTodos.filter((t) => t && typeof t.text === "string").map((t) => ({
            id: store.newId(), title: t.text, done: Boolean(t.done),
            createdAt: now, completedAt: null, // version 1 didn't record WHEN a task was finished
          })));
        }
        const oldHabits = readOld("habits");
        if (Array.isArray(oldHabits)) {
          store.set("habits", oldHabits.filter((h) => h && typeof h.name === "string").map((h) => ({
            id: store.newId(), name: h.name,
            doneDays: Array.isArray(h.doneDays) ? h.doneDays.filter((d) => typeof d === "string") : [],
            createdAt: null, // unknown in version 1
          })));
        }
        const oldLinks = readOld("links");
        if (Array.isArray(oldLinks)) {
          store.set("links", oldLinks.filter((l) => l && typeof l.name === "string" && typeof l.url === "string")
            .map((l) => ({ id: store.newId(), name: l.name, url: l.url })));
        }
        const oldNotes = readOld("notes");
        if (typeof oldNotes === "string") store.set("quickNote", oldNotes);

        const settings = { ...store.get("settings") };
        const oldTheme = readOld("theme");
        if (oldTheme === "light" || oldTheme === "dark") settings.theme = oldTheme;
        const oldCity = readOld("weatherCity");
        if (typeof oldCity === "string" && oldCity.trim()) settings.weatherCity = oldCity;
        store.set("settings", settings);
      },
    },
  ],

  // The current data version = the number of the last step
  get VERSION() {
    return this.MIGRATIONS[this.MIGRATIONS.length - 1].to;
  },

  migrate() {
    let version;
    try {
      version = Number(localStorage.getItem(this.PREFIX + "version")) || 0;
    } catch {
      return; // storage blocked: nothing to migrate
    }
    for (const step of this.MIGRATIONS) {
      if (version >= step.to) continue;
      step.run(this);
      version = step.to;
      try {
        localStorage.setItem(this.PREFIX + "version", String(version)); // remember after EACH step
      } catch {}
    }
  },

  // ---------------------------------------------------------
  // IMPORT: check a backup file thoroughly BEFORE replacing anything.
  // Returns { ok: true, data, summary } or { ok: false, error }.
  // ---------------------------------------------------------
  validateBackup(text) {
    let file;
    try {
      file = JSON.parse(text);
    } catch {
      return { ok: false, error: "This file isn't valid JSON." };
    }
    if (!file || typeof file !== "object" || file.app !== "PersonalDashboard" || !file.data || typeof file.data !== "object") {
      return { ok: false, error: "This isn't a PersonalDashboard backup file." };
    }
    if (typeof file.version !== "number" || file.version > this.VERSION) {
      return { ok: false, error: "This backup comes from a newer version of the app." };
    }

    const data = {};
    const summary = [];
    for (const name of this.backupNames()) {
      const value = file.data[name];
      const defaultValue = this.DEFAULTS[name];
      if (value === undefined) { data[name] = structuredClone(defaultValue); continue; } // older backups

      if (typeof defaultValue === "string") {
        if (typeof value !== "string") return { ok: false, error: `“${name}” should be text.` };
        data[name] = value.slice(0, 1000000);
        continue;
      }

      if (!Array.isArray(value)) return { ok: false, error: `“${name}” should be a list.` };
      if (value.length > 100000) return { ok: false, error: `“${name}” is suspiciously large.` };
      const bad = value.find((item) => !item || typeof item !== "object" || Array.isArray(item) || typeof item.id !== "string" || !item.id);
      if (bad !== undefined) return { ok: false, error: `“${name}” contains an invalid entry (every item needs an id).` };
      if (new Set(value.map((item) => item.id)).size !== value.length) return { ok: false, error: `“${name}” contains duplicate ids.` };
      data[name] = this.NORMALIZE[name] ? value.map(this.NORMALIZE[name]) : value;
      summary.push(`${value.length} ${name.replace(/([A-Z])/g, " $1").toLowerCase()}`);
    }

    // Settings: keep only known options with sensible values
    const s = file.data.settings && typeof file.data.settings === "object" ? file.data.settings : {};
    const d = this.DEFAULTS.settings;
    const num = (v, min, max, fallback) => (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : fallback);
    const widgets = s.dashboardWidgets && typeof s.dashboardWidgets === "object" ? s.dashboardWidgets : {};
    data.settings = {
      ...d,
      theme: s.theme === "light" ? "light" : "dark",
      weatherCity: typeof s.weatherCity === "string" && s.weatherCity.trim() ? s.weatherCity.slice(0, 80) : d.weatherCity,
      profileName: typeof s.profileName === "string" ? s.profileName.slice(0, 40) : "",
      sidebarCollapsed: Boolean(s.sidebarCollapsed),
      pomodoroFocus: num(s.pomodoroFocus, 1, 120, d.pomodoroFocus),
      pomodoroShort: num(s.pomodoroShort, 1, 60, d.pomodoroShort),
      pomodoroLong: num(s.pomodoroLong, 1, 90, d.pomodoroLong),
      pomodoroLongEvery: num(s.pomodoroLongEvery, 2, 10, d.pomodoroLongEvery),
      pomodoroSound: s.pomodoroSound !== false,
      currency: typeof s.currency === "string" && /^[A-Z]{3}$/.test(s.currency) ? s.currency : d.currency,
      monthlyBudget: num(s.monthlyBudget, 0, 10000000, 0),
      accent: typeof s.accent === "string" && /^[a-z]{3,10}$/.test(s.accent) ? s.accent : d.accent,
      lastExportAt: typeof s.lastExportAt === "string" ? s.lastExportAt : null,
      gamification: s.gamification !== false,
      celebrations: s.celebrations !== false,
      plannerDayStart: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.plannerDayStart) ? s.plannerDayStart : d.plannerDayStart,
      plannerDayEnd: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.plannerDayEnd) && s.plannerDayEnd > (s.plannerDayStart || "") ? s.plannerDayEnd : d.plannerDayEnd,
      // only true/false values for widget names
      dashboardWidgets: Object.fromEntries(Object.entries(widgets).filter(([k, v]) => /^[a-z]{2,20}$/.test(k) && typeof v === "boolean")),
    };

    // The planning day must end after it starts
    if (data.settings.plannerDayEnd <= data.settings.plannerDayStart) {
      data.settings.plannerDayStart = d.plannerDayStart;
      data.settings.plannerDayEnd = d.plannerDayEnd;
    }

    return { ok: true, data, summary, exportedAt: file.exportedAt };
  },

  // Replace everything with validated backup data
  importAll(data) {
    for (const name of [...this.backupNames(), "settings"]) this.set(name, data[name]);
    // Things that can't be restored from a backup (e.g. running timers) go back to empty
    Object.keys(this.collections)
      .filter((name) => this.collections[name].resetOnImport)
      .forEach((name) => this.set(name, structuredClone(this.DEFAULTS[name])));
  },

  // Delete all saved data (used by Settings → Delete all data)
  clearAll() {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(this.PREFIX) || ["todos", "habits", "links", "notes", "weatherCity", "theme"].includes(key))
        .forEach((key) => localStorage.removeItem(key));
      localStorage.setItem(this.PREFIX + "version", String(this.VERSION)); // don't re-run old upgrade steps
    } catch {}
    this.cache = {};
  },

  // Roughly how much browser storage the app uses (localStorage counts 2 bytes per character)
  usageBytes() {
    try {
      return Object.keys(localStorage)
        .filter((key) => key.startsWith(this.PREFIX))
        .reduce((sum, key) => sum + (key.length + (localStorage.getItem(key) || "").length) * 2, 0);
    } catch {
      return 0;
    }
  },

  // Browsers give each site about 5 MB of localStorage
  QUOTA_BYTES: 5 * 1024 * 1024,

  // Everything in one object, used for backup files and snapshots
  exportAll() {
    return {
      app: "PersonalDashboard",
      version: this.VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        ...Object.fromEntries(this.backupNames().map((name) => [name, this.get(name)])),
        settings: this.get("settings"),
      },
    };
  },
};
