// =========================================================
// GOALS: daily, weekly, monthly and long-term goals with a
// progress you update yourself (0–100%). Reaching 100% completes it.
// =========================================================

const Goals = {
  HORIZONS: {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    long: "Long-term",
  },
  CATEGORIES: {
    university: "University",
    personal: "Personal",
    health: "Health",
    career: "Career",
    finance: "Finance",
    other: "Other",
  },
  CATEGORY_ICONS: { university: "graduation-cap", personal: "user", health: "heart-pulse", career: "briefcase", finance: "piggy-bank", other: "target" },

  state: { horizon: "all", category: "all" },

  // ---------- Data helpers ----------
  all() {
    return Store.get("goals");
  },

  isOverdue(goal) {
    return goal.status === "active" && Boolean(goal.targetDate) && goal.targetDate < UI.dateKey();
  },

  update(id, changes) {
    Store.set("goals", this.all().map((g) => (g.id === id ? { ...g, ...changes } : g)));
    return this.all().find((g) => g.id === id);
  },

  // Set progress; reaching 100% completes the goal (with a celebration)
  setProgress(id, progress) {
    const value = Math.min(100, Math.max(0, Math.round(progress)));
    const goal = this.all().find((g) => g.id === id);
    if (!goal) return null;
    if (value === 100 && goal.status !== "completed") return this.complete(id);
    return this.update(id, { progress: value });
  },

  complete(id) {
    const goal = this.update(id, { progress: 100, status: "completed", completedAt: new Date().toISOString() });
    UI.confetti();
    UI.toast(`Goal completed: ${goal.title} 🎉`);
    return goal;
  },

  reopen(id) {
    const goal = this.all().find((g) => g.id === id);
    // Back to active, just below 100% so it doesn't complete again straight away
    return this.update(id, { status: "active", completedAt: null, progress: Math.min(goal.progress, 90) });
  },

  async remove(goal) {
    const ok = await UI.confirm({ title: "Delete this goal?", message: `“${goal.title}” will be permanently deleted.` });
    if (!ok) return false;
    Store.set("goals", this.all().filter((g) => g.id !== goal.id));
    UI.toast("Goal deleted");
    return true;
  },

  // Returns the saved goal, "deleted", or null
  async openEditor(goal = null, defaults = {}, { quiet = false } = {}) {
    const g = goal || { title: "", description: "", category: "personal", horizon: "monthly", targetDate: "", progress: 0, ...defaults };
    const toOptions = (obj) => Object.entries(obj).map(([value, label]) => ({ value, label }));
    const values = await UI.form({
      title: goal ? "Edit goal" : "New goal",
      submitLabel: goal ? "Save changes" : "Add goal",
      deleteLabel: goal ? "Delete" : null,
      fields: [
        { name: "title", label: "Goal", value: g.title, required: true, placeholder: "e.g. Pass the physics exam with 15/20",
          validate: (v) => (v.length > 120 ? "Keep it under 120 characters." : "") },
        { name: "description", label: "Description (optional)", type: "textarea", value: g.description, placeholder: "Why it matters, how you'll get there…" },
        { name: "horizon", label: "Type", type: "select", half: true, value: g.horizon, options: toOptions(this.HORIZONS) },
        { name: "category", label: "Category", type: "select", half: true, value: g.category, options: toOptions(this.CATEGORIES) },
        { name: "targetDate", label: "Target date (optional)", type: "date", half: true, value: g.targetDate || "",
          validate: (v) => (v && !UI.isDateKey(v) ? "Pick a valid date." : "") },
        { name: "progress", label: "Progress (%)", type: "number", half: true, min: 0, max: 100, value: String(g.progress),
          validate: (v) => (/^\d+$/.test(v) && Number(v) <= 100 ? "" : "Enter a number from 0 to 100.") },
      ],
    });
    if (values === null) return null;
    if (values === "delete") return (await this.remove(goal)) ? "deleted" : null;

    const data = {
      title: values.title.slice(0, 120),
      description: values.description.slice(0, 1000),
      horizon: values.horizon in this.HORIZONS ? values.horizon : "monthly",
      category: values.category in this.CATEGORIES ? values.category : "other",
      targetDate: values.targetDate || null,
    };
    const progress = Number(values.progress);

    if (goal) {
      this.update(goal.id, data);
      if (progress === 100 && goal.status !== "completed") return this.complete(goal.id);
      // Lowering progress on a completed goal reopens it
      if (progress < 100 && goal.status === "completed") this.update(goal.id, { status: "active", completedAt: null });
      const saved = this.update(goal.id, { progress });
      UI.toast("Goal updated");
      return saved;
    }

    const created = Store.NORMALIZE.goals({ id: Store.newId(), ...data, progress: Math.min(progress, 99), status: "active", createdAt: new Date().toISOString() });
    Store.set("goals", [created, ...this.all()]);
    if (progress === 100) return this.complete(created.id);
    if (!quiet) UI.toast("Goal added");
    return created;
  },

  // ---------- One goal card ----------
  cardHtml(goal) {
    const overdue = this.isOverdue(goal);
    const done = goal.status === "completed";
    return `
      <article class="card goal-card${done ? " is-done" : ""}${overdue ? " is-overdue" : ""}" data-id="${UI.escape(goal.id)}">
        <div class="goal-top">
          <span class="badge accent">${UI.escape(this.HORIZONS[goal.horizon] || "Goal")}</span>
          <span class="badge">${icon(this.CATEGORY_ICONS[goal.category] || "target")}${UI.escape(this.CATEGORIES[goal.category] || "Other")}</span>
          <div class="goal-actions">
            <button class="btn-icon small" type="button" data-edit aria-label="Edit goal" title="Edit">${icon("pencil")}</button>
          </div>
        </div>
        <h3 class="goal-title">${UI.escape(goal.title)}</h3>
        ${goal.description ? `<p class="goal-desc">${UI.escape(goal.description)}</p>` : ""}
        <div class="goal-progress">
          <div class="goal-progress-info">
            <span>${done ? `Completed ${UI.escape(UI.relativeDay(UI.dateKey(new Date(goal.completedAt))).toLowerCase())}` : "Progress"}</span>
            <strong data-percent>${goal.progress}%</strong>
          </div>
          ${done
            ? `<div class="progress-track"><div class="progress-bar complete" style="width:100%"></div></div>`
            : `<input class="goal-slider" type="range" min="0" max="100" step="5" value="${goal.progress}"
                      aria-label="Progress of ${UI.escape(goal.title)}" style="--value:${goal.progress}%">`}
        </div>
        <div class="goal-footer">
          ${goal.targetDate ? `<span class="goal-date${overdue ? " overdue" : ""}">${icon(overdue ? "triangle-alert" : "calendar")}${overdue ? "Overdue · " : ""}${UI.escape(UI.relativeDay(goal.targetDate))}</span>` : `<span class="goal-date muted">No target date</span>`}
          ${done
            ? `<button class="btn btn-secondary compact" type="button" data-reopen>${icon("rotate-ccw")}Reopen</button>`
            : `<div class="goal-buttons">
                 <button class="btn-icon small" type="button" data-step="-10" aria-label="Decrease progress by 10%" title="−10%">${icon("minus")}</button>
                 <button class="btn-icon small" type="button" data-step="10" aria-label="Increase progress by 10%" title="+10%">${icon("plus")}</button>
                 <button class="btn btn-secondary compact" type="button" data-complete>${icon("check")}Done</button>
               </div>`}
        </div>
      </article>`;
  },

  // ---------- Goals page ----------
  renderPage(container) {
    container.innerHTML = `
      <div class="page-header">
        <div><h2>Goals</h2><p>Set goals, track your progress and celebrate when you get there.</p></div>
        <button class="btn btn-primary" type="button" data-new>${icon("plus")}New goal</button>
      </div>
      <section class="stats-grid" data-stats></section>
      <section class="card goals-toolbar">
        <div class="toolbar">
          <div class="filter-tabs" role="tablist" aria-label="Goal type" data-filters></div>
          <label class="select-wrap" title="Category">
            ${icon("folder")}
            <select class="input compact" data-category aria-label="Filter by category">
              <option value="all">All categories</option>
              ${Object.entries(this.CATEGORIES).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
            </select>
          </label>
        </div>
      </section>
      <h3 class="section-title">Active goals</h3>
      <div class="goal-grid" data-active></div>
      <h3 class="section-title">Recently completed</h3>
      <div class="goal-grid" data-completed></div>`;

    const categorySelect = container.querySelector("[data-category]");
    categorySelect.value = this.state.category;
    const matches = (g) => (this.state.horizon === "all" || g.horizon === this.state.horizon) && (this.state.category === "all" || g.category === this.state.category);

    const drawStats = () => {
      const goals = this.all();
      const active = goals.filter((g) => g.status === "active");
      const monthStart = UI.dateKey().slice(0, 8) + "01";
      const doneThisMonth = goals.filter((g) => g.status === "completed" && g.completedAt && UI.dateKey(new Date(g.completedAt)) >= monthStart).length;
      const avg = active.length ? Math.round(active.reduce((n, g) => n + g.progress, 0) / active.length) : null;
      const weekEnd = UI.addDays(UI.dateKey(), 7);
      const dueSoon = active.filter((g) => g.targetDate && g.targetDate <= weekEnd).length;
      const overdue = active.filter((g) => this.isOverdue(g)).length;
      const card = (iconName, color, label, value, sub) => `
        <div class="card stat-card">
          <div class="stat-top"><span>${label}</span><span class="card-icon ${color}">${icon(iconName)}</span></div>
          <div class="stat-value">${value}</div>
          <div class="stat-sub">${UI.escape(sub)}</div>
        </div>`;
      container.querySelector("[data-stats]").innerHTML =
        card("target", "", "Active goals", active.length, `${goals.length} in total`) +
        card("trophy", "amber", "Completed this month", doneThisMonth, `${goals.filter((g) => g.status === "completed").length} completed overall`) +
        card("trending-up", "emerald", "Average progress", avg === null ? "–" : `${avg}%`, "Across active goals") +
        card("calendar-clock", overdue ? "rose" : "violet", "Due within 7 days", dueSoon, overdue ? `⚠ ${overdue} overdue` : "Nothing overdue");
    };

    const drawFilters = () => {
      const tabs = [["all", "All"], ...Object.entries(this.HORIZONS)];
      container.querySelector("[data-filters]").innerHTML = tabs.map(([id, label]) => {
        const count = this.all().filter((g) => g.status === "active" && (id === "all" || g.horizon === id) && (this.state.category === "all" || g.category === this.state.category)).length;
        return `<button type="button" role="tab" aria-selected="${id === this.state.horizon}" data-filter="${id}">${label}<span class="count">${count}</span></button>`;
      }).join("");
    };

    const drawGoals = () => {
      const active = this.all().filter((g) => g.status === "active" && matches(g))
        .sort((a, b) => (a.targetDate || "9999").localeCompare(b.targetDate || "9999") || b.progress - a.progress);
      const completed = this.all().filter((g) => g.status === "completed" && matches(g))
        .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || "")).slice(0, 6);
      container.querySelector("[data-active]").innerHTML = active.length ? active.map((g) => this.cardHtml(g)).join("")
        : `<div class="card">${this.all().some((g) => g.status === "active")
            ? UI.emptyState("search", "No goals match this filter", "Try another type or category.")
            : UI.emptyState("target", "No active goals", "Click “New goal”. Try one daily, one weekly and one long-term goal.")}</div>`;
      container.querySelector("[data-completed]").innerHTML = completed.length ? completed.map((g) => this.cardHtml(g)).join("")
        : `<div class="card">${UI.emptyState("trophy", "Nothing completed yet", "Finished goals will appear here.")}</div>`;
    };

    const drawAll = () => { drawStats(); drawFilters(); drawGoals(); };

    container.querySelector("[data-filters]").addEventListener("click", (event) => {
      const tab = event.target.closest("[data-filter]");
      if (!tab) return;
      this.state.horizon = tab.dataset.filter;
      drawFilters();
      drawGoals();
    });
    categorySelect.addEventListener("change", () => { this.state.category = categorySelect.value; drawAll(); });

    container.querySelector("[data-new]").addEventListener("click", async () => {
      const defaults = {};
      if (this.state.horizon !== "all") defaults.horizon = this.state.horizon;
      if (this.state.category !== "all") defaults.category = this.state.category;
      const goal = await this.openEditor(null, defaults);
      if (goal && typeof goal === "object") {
        drawAll();
        const card = container.querySelector(`[data-id="${CSS.escape(goal.id)}"]`);
        if (card) UI.highlight(card);
      }
    });

    // The slider: update the number while dragging, save when released
    container.addEventListener("input", (event) => {
      const slider = event.target.closest(".goal-slider");
      if (!slider) return;
      slider.style.setProperty("--value", `${slider.value}%`);
      slider.closest(".goal-card").querySelector("[data-percent]").textContent = `${slider.value}%`;
    });
    container.addEventListener("change", (event) => {
      const slider = event.target.closest(".goal-slider");
      if (!slider) return;
      const goal = this.setProgress(slider.closest(".goal-card").dataset.id, Number(slider.value));
      if (goal?.status === "completed") drawAll();
      else drawStats();
    });

    // One click listener for all goal buttons (event delegation)
    container.addEventListener("click", async (event) => {
      const card = event.target.closest(".goal-card");
      if (!card) return;
      const goal = this.all().find((g) => g.id === card.dataset.id);
      if (!goal) return;

      const step = event.target.closest("[data-step]");
      if (step) {
        const saved = this.setProgress(goal.id, goal.progress + Number(step.dataset.step));
        if (saved.status === "completed") return drawAll();
        const slider = card.querySelector(".goal-slider");
        slider.value = saved.progress;
        slider.style.setProperty("--value", `${saved.progress}%`);
        card.querySelector("[data-percent]").textContent = `${saved.progress}%`;
        drawStats();
      } else if (event.target.closest("[data-complete]")) {
        this.complete(goal.id);
        drawAll();
      } else if (event.target.closest("[data-reopen]")) {
        this.reopen(goal.id);
        UI.toast("Goal reopened", { type: "info" });
        drawAll();
      } else if (event.target.closest("[data-edit]")) {
        if (await this.openEditor(goal)) drawAll();
      }
    });

    drawAll();
  },
};

// ---------------------------------------------------------
// Register the Goals module (see js/modules.js)
// ---------------------------------------------------------
Modules.register({
  id: "goals",
  order: 70,
  nav: { label: "Goals", icon: "target" },
  page: (container) => Goals.renderPage(container),

  collections: {
    // { id, title, description, category, horizon, targetDate, progress, status, createdAt, completedAt }
    goals: {
      default: [],
      backup: true,
      normalize: (g) => ({
        description: "", category: "personal", horizon: "monthly", targetDate: null, status: "active",
        createdAt: null, completedAt: null,
        ...g,
        progress: Math.min(100, Math.max(0, Math.round(Number(g.progress) || 0))),
      }),
    },
  },

  search(q, has) {
    const showAll = () => { Goals.state.horizon = "all"; Goals.state.category = "all"; };
    return {
      label: "Goals",
      items: Goals.all().filter((g) => has(g.title) || has(g.description)).slice(0, 6).map((g) => ({
        text: g.title, icon: g.status === "completed" ? "trophy" : "target", page: "goals", id: g.id,
        hint: g.status === "completed" ? "Completed" : `${g.progress}%`, before: showAll,
      })),
    };
  },

  // Goals whose target date is today or has passed
  notifications() {
    const today = UI.dateKey();
    const showAll = () => { Goals.state.horizon = "all"; Goals.state.category = "all"; };
    return Goals.all().filter((g) => g.status === "active" && g.targetDate && g.targetDate <= today)
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate)).slice(0, 3)
      .map((g) => ({
        tone: g.targetDate < today ? "danger" : "violet", icon: "target", text: g.title,
        sub: `Goal ${g.targetDate < today ? "overdue" : "due today"} · ${g.progress}% done`, page: "goals", id: g.id, before: showAll,
      }));
  },

  quickAdd: [{
    id: "goal", label: "New goal", icon: "target", key: "G", order: 60,
    async run() {
      const created = await Goals.openEditor(null, {}, { quiet: true });
      if (created && typeof created === "object") { Goals.state.horizon = "all"; Goals.state.category = "all"; }
      return { created, page: "goals", label: "Goal", onDashboard: false };
    },
  }],
});
