// =========================================================
// VIEWS: one function per page. Each draws its page into `container`.
// NAV lists the pages in the sidebar. Sections with a `phase` are
// planned for a later phase and show an honest "coming soon" page.
// =========================================================

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { id: "tasks", label: "Tasks", icon: "square-check-big" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "habits", label: "Habits", icon: "flame" },
  { id: "study", label: "Study Tracker", icon: "graduation-cap" },
  { id: "notes", label: "Notes", icon: "notebook-pen" },
  { id: "goals", label: "Goals", icon: "target" },
  { id: "expenses", label: "Expenses", icon: "wallet" },
  { id: "analytics", label: "Analytics", icon: "chart-column", phase: 5,
    plans: ["Tasks completed over time", "Study hours and habit completion charts", "Daily, weekly and monthly views"] },
  { id: "settings", label: "Settings", icon: "settings" },
];

const Views = {
  dashboard(container) {
    container.innerHTML = `
      <div class="dashboard">
        <section class="card welcome" data-welcome></section>
        <section class="stats-grid" data-stats></section>
        <div class="widget-grid">
          <section class="card span-7" data-tasks></section>
          <section class="card span-5" data-habits></section>
          <section class="card span-4" data-study></section>
          <section class="card span-4" data-upcoming></section>
          <section class="card span-4" data-weather></section>
          <section class="card span-5" data-note></section>
          <section class="card span-7" data-links></section>
        </div>
      </div>`;

    Welcome.render(container.querySelector("[data-welcome]"));
    Stats.renderCards(container.querySelector("[data-stats]"));
    Tasks.renderWidget(container.querySelector("[data-tasks]"));
    Habits.renderWidget(container.querySelector("[data-habits]"));
    Study.renderWidget(container.querySelector("[data-study]"));
    Calendar.renderWidget(container.querySelector("[data-upcoming]"));
    Weather.render(container.querySelector("[data-weather]"));
    QuickNote.render(container.querySelector("[data-note]"));
    Links.render(container.querySelector("[data-links]"));
  },

  tasks(container) {
    Tasks.renderPage(container);
  },

  calendar(container) {
    Calendar.renderPage(container);
  },

  habits(container) {
    Habits.renderPage(container);
  },

  study(container) {
    Study.renderPage(container);
  },

  goals(container) {
    Goals.renderPage(container);
  },

  expenses(container) {
    Expenses.renderPage(container);
  },

  notes(container) {
    Notes.renderPage(container);
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

        <section class="card">
          <div class="card-header"><h3 class="card-title"><span class="card-icon emerald">${icon("download")}</span>Your data</h3></div>
          <div class="setting-row">
            <div class="setting-text">
              <strong>Download a backup</strong>
              <span>Everything is stored only in this browser. Save a backup file now and then (importing it back comes in Phase 5).</span>
            </div>
            <button class="btn btn-secondary" type="button" data-export>${icon("download")}Export JSON</button>
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

    container.querySelector("[data-export]").addEventListener("click", () => {
      // Turn the data into a file and "click" a hidden download link
      const blob = new Blob([JSON.stringify(Store.exportAll(), null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `personal-dashboard-backup-${UI.dateKey()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000); // free the memory
      UI.toast("Backup downloaded");
    });
  },

  // Honest placeholder for sections planned in a later phase
  comingSoon(container, item) {
    container.innerHTML = `
      <section class="card coming-soon">
        <div class="card-icon">${icon(item.icon)}</div>
        <h2>${UI.escape(item.label)} is coming in Phase ${item.phase}</h2>
        <p class="muted">This section isn't built yet. Here's what it will include:</p>
        <ul>${item.plans.map((p) => `<li>${icon("check")}${UI.escape(p)}</li>`).join("")}</ul>
      </section>`;
  },

  pageHeader(title, subtitle) {
    return `
      <div class="page-header">
        <div><h2>${UI.escape(title)}</h2><p>${UI.escape(subtitle)}</p></div>
      </div>`;
  },
};
