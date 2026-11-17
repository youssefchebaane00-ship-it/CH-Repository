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
  { id: "study", label: "Study Tracker", icon: "graduation-cap", phase: 3,
    plans: ["Subjects with colors and weekly goals", "Study sessions with start, pause and stop", "Pomodoro timer connected to your subjects"] },
  { id: "notes", label: "Notes", icon: "notebook-pen" },
  { id: "goals", label: "Goals", icon: "target", phase: 4,
    plans: ["Daily, weekly, monthly and long-term goals", "Progress tracking and target dates", "Active and recently completed goals"] },
  { id: "expenses", label: "Expenses", icon: "wallet", phase: 4,
    plans: ["Expenses in TND (changeable)", "Spending by category and month", "Optional monthly budget"] },
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
          <section class="card span-4" data-upcoming></section>
          <section class="card span-4" data-weather></section>
          <section class="card span-4" data-note></section>
          <section class="card span-12" data-links></section>
        </div>
      </div>`;

    Welcome.render(container.querySelector("[data-welcome]"));
    Stats.renderCards(container.querySelector("[data-stats]"));
    Tasks.renderWidget(container.querySelector("[data-tasks]"));
    Habits.renderWidget(container.querySelector("[data-habits]"));
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
