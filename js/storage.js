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
    subjects: [],     // { id, name, color, weeklyGoalHours, createdAt }
    studySessions: [],// { id, subjectId, description, date, startedAt, durationSec, source: "timer"|"pomodoro"|"manual" }
    goals: [],        // { id, title, description, category, horizon, targetDate, progress, status, createdAt, completedAt }
    expenses: [],     // { id, amount, category, date, description, createdAt }
    activeSession: null, // the running study stopwatch (see study.js)
    pomodoro: null,      // the Pomodoro timer state (see pomodoro.js)
    links: [          // { id, name, url, category }
      { id: "default-google", name: "Google", url: "https://www.google.com", category: "tools" },
      { id: "default-youtube", name: "YouTube", url: "https://www.youtube.com", category: "entertainment" },
      { id: "default-gmail", name: "Gmail", url: "https://mail.google.com", category: "tools" },
    ],
    quickNote: "",
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
      // Which dashboard widgets are shown (Settings → Dashboard)
      dashboardWidgets: { stats: true, tasks: true, habits: true, study: true, upcoming: true, week: true, weather: true, note: true, links: true },
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
    links: (l) => ({ category: "other", ...l }),
    goals: (g) => ({
      description: "", category: "personal", horizon: "monthly", targetDate: null, status: "active",
      createdAt: null, completedAt: null,
      ...g,
      progress: Math.min(100, Math.max(0, Math.round(Number(g.progress) || 0))),
    }),
    expenses: (e) => ({
      category: "other", description: "", createdAt: null,
      ...e,
      amount: Math.max(0, Math.round((Number(e.amount) || 0) * 1000) / 1000), // up to 3 decimals (millimes)
      date: typeof e.date === "string" ? e.date : UI.dateKey(),
    }),
    subjects: (s) => ({ name: "Subject", color: "#22d3ee", weeklyGoalHours: 0, createdAt: null, ...s }),
    studySessions: (s) => ({
      subjectId: "", description: "", source: "manual", startedAt: null,
      ...s,
      durationSec: Math.max(0, Math.round(Number(s.durationSec) || 0)),
      date: typeof s.date === "string" ? s.date : UI.dateKey(),
    }),
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
      if (name === "settings") {
        value = { ...this.DEFAULTS.settings, ...value };
        value.dashboardWidgets = { ...this.DEFAULTS.settings.dashboardWidgets, ...(value.dashboardWidgets || {}) };
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

  // The lists that go into a backup file
  BACKUP_LISTS: ["tasks", "habits", "events", "notes", "subjects", "studySessions", "goals", "expenses", "links"],

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
    for (const name of this.BACKUP_LISTS) {
      const list = file.data[name];
      if (list === undefined) { data[name] = structuredClone(this.DEFAULTS[name]); continue; } // older backups
      if (!Array.isArray(list)) return { ok: false, error: `“${name}” should be a list.` };
      if (list.length > 100000) return { ok: false, error: `“${name}” is suspiciously large.` };
      const bad = list.find((item) => !item || typeof item !== "object" || Array.isArray(item) || typeof item.id !== "string" || !item.id);
      if (bad !== undefined) return { ok: false, error: `“${name}” contains an invalid entry (every item needs an id).` };
      if (new Set(list.map((item) => item.id)).size !== list.length) return { ok: false, error: `“${name}” contains duplicate ids.` };
      data[name] = list.map(this.NORMALIZE[name]);
      summary.push(`${list.length} ${name.replace(/([A-Z])/g, " $1").toLowerCase()}`);
    }

    const note = file.data.quickNote;
    if (note !== undefined && typeof note !== "string") return { ok: false, error: "The quick note should be text." };
    data.quickNote = note || "";

    // Settings: keep only known options with sensible values
    const s = file.data.settings && typeof file.data.settings === "object" ? file.data.settings : {};
    const d = this.DEFAULTS.settings;
    const num = (v, min, max, fallback) => (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : fallback);
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
      dashboardWidgets: { ...d.dashboardWidgets, ...(s.dashboardWidgets && typeof s.dashboardWidgets === "object" ? s.dashboardWidgets : {}) },
    };

    return { ok: true, data, summary, exportedAt: file.exportedAt };
  },

  // Replace everything with validated backup data
  importAll(data) {
    for (const name of [...this.BACKUP_LISTS, "quickNote", "settings"]) this.set(name, data[name]);
    this.set("activeSession", null); // running timers can't be restored from a backup
    this.set("pomodoro", null);
  },

  // Delete all saved data (used by Settings → Delete all data)
  clearAll() {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(this.PREFIX) || ["todos", "habits", "links", "notes", "weatherCity", "theme"].includes(key))
        .forEach((key) => localStorage.removeItem(key));
      localStorage.setItem(this.PREFIX + "version", String(this.VERSION)); // don't re-run the version 1 migration
    } catch {}
    this.cache = {};
  },

  // Roughly how much browser storage the app uses
  usageBytes() {
    try {
      return Object.keys(localStorage)
        .filter((key) => key.startsWith(this.PREFIX))
        .reduce((sum, key) => sum + (key.length + (localStorage.getItem(key) || "").length) * 2, 0);
    } catch {
      return 0;
    }
  },

  // Everything in one object, used for the backup file
  exportAll() {
    return {
      app: "PersonalDashboard",
      version: this.VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        ...Object.fromEntries(this.BACKUP_LISTS.map((name) => [name, this.get(name)])),
        quickNote: this.get("quickNote"),
        settings: this.get("settings"),
      },
    };
  },
};
