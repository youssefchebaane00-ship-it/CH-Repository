// =========================================================
// BACKUPS: automatic daily snapshots + backup reminders.
//
// Once a day, a full copy of your data (the same format as Export JSON)
// is saved in IndexedDB, a second, much larger storage area in the browser.
// The last 7 daily snapshots are kept, so if something goes wrong you can
// go back to yesterday (Settings → Your data → Snapshots).
//
// Why IndexedDB and not localStorage? localStorage holds only about 5 MB,
// and 7 copies there would fill it up 7 times faster. IndexedDB is
// "asynchronous" (answers arrive later, like fetch), which is fine for
// snapshots because nothing has to wait for them.
// =========================================================

const Backups = {
  DB_NAME: "personal-dashboard",
  STORE: "snapshots",
  KEEP_DAILY: 7,
  KEEP_BEFORE_RESTORE: 3,
  REMIND_AFTER_DAYS: 14,
  available: null, // true / false once we know if IndexedDB works here

  // Open (or create) the database. Returns a Promise of the database.
  open() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB is not available"));
      const request = indexedDB.open(this.DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.STORE)) db.createObjectStore(this.STORE, { keyPath: "id" });
      };
      request.onsuccess = () => { this.available = true; resolve(request.result); };
      request.onerror = () => { this.available = false; reject(request.error); };
      request.onblocked = () => { this.available = false; reject(new Error("IndexedDB is blocked")); };
    });
    this.dbPromise.catch(() => { this.available = false; });
    return this.dbPromise;
  },

  // Run one IndexedDB request inside a transaction and wait for its result
  async request(mode, makeRequest) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, mode);
      const req = makeRequest(tx.objectStore(this.STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  // All snapshots, newest first, WITHOUT the (large) data, for listing
  async list() {
    const all = await this.request("readonly", (store) => store.getAll());
    return all.map(({ data, ...meta }) => meta).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id) {
    return this.request("readonly", (store) => store.get(id));
  },

  // Save a snapshot of everything right now
  async create(reason = "daily") {
    const backup = Store.exportAll();
    const text = JSON.stringify(backup);
    const now = new Date();
    const record = {
      id: `${now.toISOString()}-${reason}`,
      createdAt: now.toISOString(),
      date: UI.dateKey(now),
      reason,                       // "daily" | "before-restore"
      sizeBytes: text.length,
      summary: this.summarize(backup.data),
      data: text,
    };
    await this.request("readwrite", (store) => store.put(record));
    await this.prune();
    return record;
  },

  summarize(data) {
    const count = (name) => (Array.isArray(data[name]) ? data[name].length : 0);
    return `${count("tasks")} tasks, ${count("habits")} habits, ${count("notes")} notes, ${count("studySessions")} study sessions, ${count("expenses")} expenses`;
  },

  // Keep only the newest snapshots of each kind
  async prune() {
    const all = await this.list();
    const remove = [
      ...all.filter((s) => s.reason === "daily").slice(this.KEEP_DAILY),
      ...all.filter((s) => s.reason === "before-restore").slice(this.KEEP_BEFORE_RESTORE),
    ];
    for (const s of remove) await this.request("readwrite", (store) => store.delete(s.id));
  },

  // Called at start-up and at midnight: one daily snapshot per day
  async snapshotDaily() {
    try {
      const all = await this.list();
      if (all.some((s) => s.reason === "daily" && s.date === UI.dateKey())) return null;
      return await this.create("daily");
    } catch (error) {
      console.warn("Snapshots are unavailable in this browser:", error);
      return null;
    }
  },

  // Go back to a snapshot. The current state is saved first ("before-restore"),
  // so even a restore can be undone.
  async restore(id, { reload = true } = {}) {
    const record = await this.get(id);
    if (!record) throw new Error("That snapshot no longer exists.");
    const result = Store.validateBackup(record.data);
    if (!result.ok) throw new Error(result.error);
    await this.create("before-restore");
    Store.importAll(result.data);
    if (reload) location.reload();
    return result;
  },

  // Save a snapshot as a normal backup file
  async download(id) {
    const record = await this.get(id);
    if (!record) return;
    const blob = new Blob([record.data], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `personal-dashboard-snapshot-${record.date}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  },

  // Is there anything worth backing up yet?
  hasUserData() {
    const lists = ["tasks", "habits", "events", "notes", "subjects", "studySessions", "goals", "expenses"];
    return lists.some((name) => name in Store.DEFAULTS && Store.get(name).length > 0) || Boolean(Store.get("quickNote").trim());
  },

  daysSinceExport() {
    const last = Store.get("settings").lastExportAt;
    if (!last) return null;
    return Math.floor((Date.now() - new Date(last)) / 86400000);
  },
};

// The backup reminders are a small module of their own
Modules.register({
  id: "backups",
  order: 95,
  notifications() {
    const items = [];
    const days = Backups.daysSinceExport();
    if (Backups.hasUserData() && (days === null || days >= Backups.REMIND_AFTER_DAYS)) {
      items.push({
        tone: "amber", icon: "download", text: "Back up your data",
        sub: days === null ? "You haven't downloaded a backup file yet" : `Last backup file: ${days} days ago`,
        page: "settings", id: "your-data",
      });
    }
    const used = Store.usageBytes() / Store.QUOTA_BYTES;
    if (used >= 0.7) {
      items.push({
        tone: "danger", icon: "database", text: `Browser storage ${Math.round(used * 100)}% full`,
        sub: "Download a backup and consider deleting old data", page: "settings", id: "your-data", urgent: used >= 0.9,
      });
    }
    return items;
  },
  commands: [
    { label: "Open snapshots (restore an earlier day)", icon: "history", keywords: "snapshot restore undo recover backup", run: () => Router.go("settings", "snapshots") },
  ],
});
