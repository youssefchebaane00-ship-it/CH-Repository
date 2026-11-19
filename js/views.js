// =========================================================
// VIEWS: the two built-in pages, Dashboard and Settings.
// Every other page belongs to its module (see js/modules.js).
// =========================================================

const Views = {
  // The dashboard shows every widget that modules register (unless hidden in Settings)
  dashboard(container) {
    const shown = Store.get("settings").dashboardWidgets;
    const widgets = Modules.widgets().filter((w) => shown[w.id] !== false);

    container.innerHTML = `
      <div class="dashboard">
        <section class="card welcome" data-welcome></section>
        ${shown.stats !== false ? `<section class="stats-grid" data-stats></section>` : ""}
        <div class="widget-grid">
          ${widgets.map((w) => `<section class="card span-${w.span}" data-widget="${w.id}" data-${w.id}></section>`).join("")}
        </div>
        ${widgets.length ? "" : `<section class="card">${UI.emptyState("layout-dashboard", "All widgets are hidden", "Choose which widgets to show in Settings → Dashboard.")}</section>`}
      </div>`;

    Welcome.render(container.querySelector("[data-welcome]"));
    if (shown.stats !== false) Stats.renderCards(container.querySelector("[data-stats]"));
    // One broken widget must not take the whole dashboard down
    widgets.forEach((w) => {
      const el = container.querySelector(`[data-widget="${w.id}"]`);
      try {
        w.render(el);
      } catch (error) {
        console.error(`Widget "${w.id}" failed:`, error);
        el.innerHTML = UI.emptyState("triangle-alert", `${w.label} couldn't load`, "Try refreshing the page. Your data is safe.");
      }
    });
  },

  settings(container) {
    const settings = Store.get("settings");
    container.innerHTML = `
      ${this.pageHeader("Settings", "Personalize your dashboard.")}
      <div class="settings">

        <section class="card">
          <div class="card-header"><h3 class="card-title"><span class="card-icon">${icon("sun")}</span>Appearance</h3></div>
          <div class="setting-row">
            <div class="setting-text"><strong>Theme</strong><span>Dark is the default. Also available from the top bar.</span></div>
            <div class="segmented" role="group" aria-label="Theme" data-theme-choice>
              <button type="button" data-value="dark">${icon("moon")}Dark</button>
              <button type="button" data-value="light">${icon("sun")}Light</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-text"><strong>Accent color</strong><span>Buttons, highlights and charts.</span></div>
            <div class="accent-choices" role="radiogroup" aria-label="Accent color" data-accent-choice>
              ${Object.entries(this.ACCENTS).map(([id, a]) => `
                <button type="button" role="radio" class="accent-swatch" data-value="${id}" style="--swatch:${a.color}"
                        aria-checked="${settings.accent === id}" aria-label="${a.label}" title="${a.label}"></button>`).join("")}
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-header"><h3 class="card-title"><span class="card-icon sky">${icon("layout-dashboard")}</span>Dashboard</h3></div>
          <p class="muted small">Choose what appears on your dashboard. The welcome banner is always shown.</p>
          <div class="widget-toggles" data-widget-toggles>
            ${[{ id: "stats", label: "Statistics cards" }, ...Modules.widgets()].map((w) => `
              <label class="toggle-row">
                <input type="checkbox" data-widget="${w.id}" ${settings.dashboardWidgets[w.id] !== false ? "checked" : ""}>
                <span>${UI.escape(w.label)}</span>
              </label>`).join("")}
          </div>
        </section>

        <section class="card">
          <div class="card-header"><h3 class="card-title"><span class="card-icon violet">${icon("user")}</span>Profile</h3></div>
          <form class="setting-row" data-name-form>
            <div class="setting-text"><strong>Your name</strong><span>Used in the greeting and the sidebar.</span></div>
            <div class="setting-control">
              <input class="input" name="name" type="text" maxlength="40" placeholder="e.g. Alex" aria-label="Your name"
                     value="${UI.escape(settings.profileName)}" autocomplete="off">
              <button class="btn btn-secondary" type="submit">Save</button>
            </div>
          </form>
        </section>

        <section class="card">
          <div class="card-header"><h3 class="card-title"><span class="card-icon sky">${icon("cloud-sun")}</span>Weather</h3></div>
          <form class="setting-row" data-city-form>
            <div class="setting-text"><strong>Default city</strong><span>Shown on the dashboard. Searching another city also updates this.</span></div>
            <div class="setting-control">
              <input class="input" name="city" type="text" maxlength="80" aria-label="Default city"
                     value="${UI.escape(settings.weatherCity)}" autocomplete="off">
              <button class="btn btn-secondary" type="submit">Save</button>
            </div>
          </form>
        </section>

        <section class="card">
          <div class="card-header"><h3 class="card-title"><span class="card-icon rose">${icon("timer")}</span>Pomodoro</h3></div>
          <form data-pomo-form novalidate>
            <div class="pomo-settings">
              ${[["pomodoroFocus", "Focus (min)", 1, 120], ["pomodoroShort", "Short break (min)", 1, 60],
                 ["pomodoroLong", "Long break (min)", 1, 90], ["pomodoroLongEvery", "Long break every … focus sessions", 2, 10]]
                .map(([key, label, min, max]) => `
                  <label class="field">
                    <span>${label}</span>
                    <input class="input" type="number" name="${key}" min="${min}" max="${max}" step="1" value="${settings[key]}" required>
                  </label>`).join("")}
            </div>
            <div class="setting-row">
              <div class="setting-text"><strong>Sound when a period ends</strong><span>A short chime made by your browser.</span></div>
              <div class="setting-control">
                <select class="input" name="pomodoroSound" aria-label="Sound">
                  <option value="on"${settings.pomodoroSound ? " selected" : ""}>On</option>
                  <option value="off"${settings.pomodoroSound ? "" : " selected"}>Off</option>
                </select>
                <button class="btn btn-secondary" type="button" data-test-sound>${icon("volume-2")}Test</button>
              </div>
            </div>
            <div class="setting-row end">
              <button class="btn btn-secondary" type="button" data-pomo-defaults>Reset to 25 / 5 / 15</button>
              <button class="btn btn-primary" type="submit">Save Pomodoro settings</button>
            </div>
          </form>
        </section>

        <section class="card">
          <div class="card-header"><h3 class="card-title"><span class="card-icon amber">${icon("wallet")}</span>Money</h3></div>
          <form class="setting-row" data-currency-form>
            <div class="setting-text"><strong>Currency</strong><span>Used to display expenses. Amounts are not converted.</span></div>
            <div class="setting-control">
              <select class="input" name="currency" aria-label="Currency">
                ${Expenses.CURRENCIES.map((c) => `<option value="${c}"${c === settings.currency ? " selected" : ""}>${c}${c === "TND" ? " (Tunisian dinar)" : ""}</option>`).join("")}
              </select>
              <button class="btn btn-secondary" type="submit">Save</button>
            </div>
          </form>
          <div class="setting-row">
            <div class="setting-text"><strong>Monthly budget</strong><span data-budget-text>${settings.monthlyBudget ? Expenses.format(settings.monthlyBudget) : "No budget set"}</span></div>
            <button class="btn btn-secondary" type="button" data-budget>${icon("piggy-bank")}Change budget</button>
          </div>
        </section>

        <section class="card" data-id="your-data">
          <div class="card-header">
            <h3 class="card-title"><span class="card-icon emerald">${icon("database")}</span>Your data</h3>
            <span class="badge" title="Approximate space used in this browser">${(Store.usageBytes() / 1024).toFixed(1)} KB used</span>
          </div>
          <div class="storage-meter">
            <div class="daily-progress-info">
              <span>Browser storage</span>
              <strong>${Math.max(0.1, (Store.usageBytes() / Store.QUOTA_BYTES) * 100).toFixed(1)}% of about 5 MB</strong>
            </div>
            <div class="progress-track thin"><div class="progress-bar" style="width:${Math.min(100, (Store.usageBytes() / Store.QUOTA_BYTES) * 100)}%"></div></div>
          </div>
          <div class="setting-row">
            <div class="setting-text">
              <strong>Download a backup</strong>
              <span data-last-export>${this.lastExportText()}</span>
            </div>
            <button class="btn btn-secondary" type="button" data-export>${icon("download")}Export JSON</button>
          </div>
          <div class="setting-row snapshots-row" data-id="snapshots">
            <div class="setting-text">
              <strong>Automatic snapshots</strong>
              <span>A copy of everything is saved in this browser once a day (the last 7 days are kept). Use one to go back if something goes wrong.</span>
            </div>
            <ul class="snapshot-list" data-snapshots><li class="muted small">Loading…</li></ul>
          </div>
          <div class="setting-row">
            <div class="setting-text">
              <strong>Restore from a backup</strong>
              <span>Replaces all current data with a backup file. The file is checked first, and your current data is downloaded as a safety copy before anything changes.</span>
            </div>
            <label class="btn btn-secondary file-button">
              ${icon("upload")}Import JSON
              <input type="file" accept="application/json,.json" data-import class="sr-only">
            </label>
          </div>
          <div class="setting-row">
            <div class="setting-text">
              <strong>Delete all data</strong>
              <span>Removes everything from this browser. This can't be undone.</span>
            </div>
            <button class="btn btn-secondary danger-text" type="button" data-delete-all>${icon("trash-2")}Delete all…</button>
          </div>
        </section>
      </div>`;

    // Theme buttons
    const themeGroup = container.querySelector("[data-theme-choice]");
    const markTheme = () => themeGroup.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.value === Store.get("settings").theme));
    });
    themeGroup.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      Shell.setTheme(button.dataset.value);
      markTheme();
    });
    markTheme();

    container.querySelector("[data-name-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      Store.setSetting("profileName", event.target.elements.name.value.trim().slice(0, 40));
      Shell.renderProfile();
      UI.toast("Name saved");
    });

    container.querySelector("[data-city-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const city = event.target.elements.city.value.trim();
      if (!city) {
        UI.toast("Please enter a city name.", { type: "error" });
        return;
      }
      Store.setSetting("weatherCity", city);
      UI.toast(`Default city set to ${city}`);
    });

    // Pomodoro settings
    const pomoForm = container.querySelector("[data-pomo-form]");
    pomoForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const numbers = ["pomodoroFocus", "pomodoroShort", "pomodoroLong", "pomodoroLongEvery"];
      for (const key of numbers) {
        const input = pomoForm.elements[key];
        const value = Number(input.value);
        const valid = Number.isInteger(value) && value >= Number(input.min) && value <= Number(input.max);
        input.classList.toggle("invalid", !valid);
        if (!valid) {
          UI.toast(`Please enter a whole number from ${input.min} to ${input.max}.`, { type: "error" });
          input.focus();
          return;
        }
      }
      const current = Store.get("settings");
      const next = { ...current, pomodoroSound: pomoForm.elements.pomodoroSound.value === "on" };
      numbers.forEach((key) => { next[key] = Number(pomoForm.elements[key].value); });
      Store.set("settings", next);
      // A timer that isn't running picks up the new length right away
      if (Pomodoro.state().status === "idle") Pomodoro.reset();
      UI.toast("Pomodoro settings saved");
    });
    container.querySelector("[data-pomo-defaults]").addEventListener("click", () => {
      Object.entries({ pomodoroFocus: 25, pomodoroShort: 5, pomodoroLong: 15, pomodoroLongEvery: 4 })
        .forEach(([key, value]) => { pomoForm.elements[key].value = value; });
    });
    container.querySelector("[data-test-sound]").addEventListener("click", () => Sound.chime());

    // Money settings
    const budgetText = container.querySelector("[data-budget-text]");
    container.querySelector("[data-currency-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const currency = event.target.elements.currency.value;
      if (!Expenses.CURRENCIES.includes(currency)) return;
      Store.setSetting("currency", currency);
      const budget = Store.get("settings").monthlyBudget;
      budgetText.textContent = budget ? Expenses.format(budget) : "No budget set";
      UI.toast(`Currency set to ${currency}`);
    });
    container.querySelector("[data-budget]").addEventListener("click", async () => {
      if (await Expenses.openBudgetEditor()) {
        const budget = Store.get("settings").monthlyBudget;
        budgetText.textContent = budget ? Expenses.format(budget) : "No budget set";
      }
    });

    // Accent color
    const accentGroup = container.querySelector("[data-accent-choice]");
    accentGroup.addEventListener("click", (event) => {
      const swatch = event.target.closest("[data-value]");
      if (!swatch) return;
      Shell.setAccent(swatch.dataset.value);
      accentGroup.querySelectorAll("[data-value]").forEach((b) => b.setAttribute("aria-checked", String(b === swatch)));
    });

    // Dashboard widgets
    container.querySelector("[data-widget-toggles]").addEventListener("change", (event) => {
      const box = event.target.closest("[data-widget]");
      if (!box) return;
      const widgets = { ...Store.get("settings").dashboardWidgets, [box.dataset.widget]: box.checked };
      Store.setSetting("dashboardWidgets", widgets);
      UI.toast(`${box.checked ? "Shown" : "Hidden"} on the dashboard`, { type: "info", duration: 2000 });
    });

    // Data: export, import, delete
    container.querySelector("[data-export]").addEventListener("click", () => {
      this.downloadBackup();
      container.querySelector("[data-last-export]").textContent = this.lastExportText();
      UI.toast("Backup downloaded");
    });

    // Snapshots (loaded from IndexedDB, so they arrive a moment later)
    const snapshotList = container.querySelector("[data-snapshots]");
    const drawSnapshots = async () => {
      try {
        const snapshots = await Backups.list();
        snapshotList.innerHTML = snapshots.length ? snapshots.map((s) => `
          <li class="snapshot" data-snapshot="${UI.escape(s.id)}">
            <span class="snapshot-text">
              <strong>${UI.escape(UI.relativeDay(s.date))} · ${new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                ${s.reason === "before-restore" ? `<span class="badge">before a restore</span>` : ""}</strong>
              <span>${UI.escape(s.summary)} · ${(s.sizeBytes / 1024).toFixed(1)} KB</span>
            </span>
            <button class="btn-icon small" type="button" data-download-snapshot aria-label="Download this snapshot" title="Download">${icon("download")}</button>
            <button class="btn btn-secondary compact" type="button" data-restore-snapshot>${icon("rotate-ccw")}Restore</button>
          </li>`).join("")
          : `<li class="muted small">No snapshots yet. The first one is made automatically today.</li>`;
      } catch {
        snapshotList.innerHTML = `<li class="muted small">Snapshots aren't available in this browser. Use Export JSON instead.</li>`;
      }
    };
    snapshotList.addEventListener("click", async (event) => {
      const row = event.target.closest("[data-snapshot]");
      if (!row) return;
      if (event.target.closest("[data-download-snapshot]")) {
        Backups.download(row.dataset.snapshot);
        return;
      }
      if (!event.target.closest("[data-restore-snapshot]")) return;
      const ok = await UI.confirm({
        title: "Go back to this snapshot?",
        message: `All current data will be replaced by this snapshot (${row.querySelector(".snapshot-text span").textContent}). Your current data is saved as a snapshot first, so you can undo this.`,
        confirmLabel: "Restore snapshot",
      });
      if (!ok) return;
      try {
        await Backups.restore(row.dataset.snapshot, { reload: false });
        UI.toast("Snapshot restored. Reloading…", { type: "info" });
        setTimeout(() => location.reload(), 900);
      } catch (error) {
        UI.toast(`Couldn't restore: ${error.message} Nothing was changed.`, { type: "error", duration: 7000 });
      }
    });
    drawSnapshots();

    container.querySelector("[data-import]").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      event.target.value = ""; // so choosing the same file again still works
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        UI.toast("That file is too large to be a backup.", { type: "error" });
        return;
      }
      const result = Store.validateBackup(await file.text());
      if (!result.ok) {
        UI.toast(`Import cancelled: ${result.error} Nothing was changed.`, { type: "error", duration: 7000 });
        return;
      }
      const when = result.exportedAt ? ` from ${new Date(result.exportedAt).toLocaleString()}` : "";
      const ok = await UI.confirm({
        title: "Replace all data with this backup?",
        message: `The backup${when} contains ${result.summary.join(", ")}. All your current data will be replaced. A safety copy of your current data will be downloaded first.`,
        confirmLabel: "Replace my data",
      });
      if (!ok) return;
      this.downloadBackup("before-import");
      try { await Backups.create("before-restore"); } catch {} // a second safety copy, inside the browser
      Store.importAll(result.data);
      UI.toast("Backup restored. Reloading…", { type: "info" });
      setTimeout(() => location.reload(), 900); // start fresh with the restored data
    });

    container.querySelector("[data-delete-all]").addEventListener("click", async () => {
      const values = await UI.form({
        title: "Delete all data?",
        submitLabel: "Delete everything",
        fields: [{ name: "confirm", label: "This removes all tasks, habits, notes, study sessions, goals, expenses and settings from this browser. Type DELETE to confirm.",
          placeholder: "DELETE", validate: (v) => (v === "DELETE" ? "" : "Type DELETE in capital letters.") }],
      });
      if (!values) return;
      Store.clearAll();
      UI.toast("All data deleted. Reloading…", { type: "info" });
      setTimeout(() => location.reload(), 900);
    });
  },

  lastExportText() {
    const days = Backups.daysSinceExport();
    if (days === null) return "You haven't downloaded a backup file yet. Your data only lives in this browser.";
    return `Last backup file: ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}. A reminder appears after ${Backups.REMIND_AFTER_DAYS} days.`;
  },

  ACCENTS: {
    cyan: { label: "Cyan", color: "#22d3ee" },
    violet: { label: "Violet", color: "#a78bfa" },
    emerald: { label: "Emerald", color: "#34d399" },
    amber: { label: "Amber", color: "#fbbf24" },
    rose: { label: "Rose", color: "#fb7185" },
    blue: { label: "Blue", color: "#60a5fa" },
  },

  // Save all data to a .json file: we build the file in memory and
  // "click" a hidden download link.
  downloadBackup(suffix = "") {
    Store.setSetting("lastExportAt", new Date().toISOString()); // remembered for the backup reminder
    const blob = new Blob([JSON.stringify(Store.exportAll(), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `personal-dashboard-backup-${UI.dateKey()}${suffix ? "-" + suffix : ""}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000); // free the memory
  },

  pageHeader(title, subtitle) {
    return `
      <div class="page-header">
        <div><h2>${UI.escape(title)}</h2><p>${UI.escape(subtitle)}</p></div>
      </div>`;
  },
};

// The two built-in pages register like any other module
Modules.register({ id: "dashboard", order: 10, nav: { label: "Dashboard", icon: "layout-dashboard" }, page: (container) => Views.dashboard(container) });
Modules.register({ id: "settings", order: 100, nav: { label: "Settings", icon: "settings" }, page: (container) => Views.settings(container) });
