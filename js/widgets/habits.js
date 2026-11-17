// =========================================================
// HABITS: daily or weekly habits, streaks, statistics, heatmaps.
// A habit's history is the list of days it was done (doneDays),
// so a new day never erases anything; it just starts unticked.
//   daily habit:  streak = days in a row
//   weekly habit: done N times per week; streak = weeks in a row the target was met
// =========================================================

const Habits = {
  state: { selectedId: null }, // habit shown in the detail panel (Habits page)

  // ---------- Data helpers ----------
  all() {
    return Store.get("habits");
  },

  isWeekly(habit) {
    return habit.frequency === "weekly";
  },

  target(habit) {
    return Math.min(7, Math.max(1, Number(habit.weeklyTarget) || 3));
  },

  // First day the habit "existed" (so earlier days don't count as missed)
  firstDay(habit) {
    if (habit.createdAt) return UI.dateKey(new Date(habit.createdAt));
    return [...habit.doneDays].sort()[0] || UI.dateKey();
  },

  // How many check-ins in the week starting on `weekStart` (a Monday)
  weekCount(habit, weekStart) {
    const end = UI.addDays(weekStart, 6);
    return habit.doneDays.filter((d) => d >= weekStart && d <= end).length;
  },

  // Is this habit "taken care of" today? Daily: ticked today.
  // Weekly: ticked today, or this week's target is already reached.
  doneForToday(habit) {
    const today = UI.dateKey();
    if (habit.doneDays.includes(today)) return true;
    return this.isWeekly(habit) && this.weekCount(habit, UI.startOfWeek(today)) >= this.target(habit);
  },

  countStreak(habit) {
    const today = UI.dateKey();
    if (this.isWeekly(habit)) {
      let week = UI.startOfWeek(today);
      // This week isn't over yet: if the target isn't reached, start counting from last week
      if (this.weekCount(habit, week) < this.target(habit)) week = UI.addDays(week, -7);
      let streak = 0;
      while (this.weekCount(habit, week) >= this.target(habit)) {
        streak++;
        week = UI.addDays(week, -7);
      }
      return streak;
    }
    const days = new Set(habit.doneDays);
    let day = days.has(today) ? today : UI.addDays(today, -1); // can continue from yesterday
    let streak = 0;
    while (days.has(day)) {
      streak++;
      day = UI.addDays(day, -1);
    }
    return streak;
  },

  longestStreak(habit) {
    if (!habit.doneDays.length) return 0;
    if (this.isWeekly(habit)) {
      let week = UI.startOfWeek([...habit.doneDays].sort()[0]);
      const lastWeek = UI.startOfWeek(UI.dateKey());
      let best = 0, run = 0;
      while (week <= lastWeek) {
        run = this.weekCount(habit, week) >= this.target(habit) ? run + 1 : 0;
        best = Math.max(best, run);
        week = UI.addDays(week, 7);
      }
      return best;
    }
    const days = [...new Set(habit.doneDays)].sort();
    let best = 1, run = 1;
    for (let i = 1; i < days.length; i++) {
      run = UI.diffDays(days[i - 1], days[i]) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    return best;
  },

  // Completion rate in % (null if there's nothing to measure yet)
  //   daily:  days done out of the last 30 days (since the habit started)
  //   weekly: weeks the target was met, out of the last 4 finished weeks
  completionRate(habit) {
    const today = UI.dateKey();
    const first = this.firstDay(habit);
    if (this.isWeekly(habit)) {
      let possible = 0, met = 0;
      for (let i = 1; i <= 4; i++) {
        const week = UI.addDays(UI.startOfWeek(today), -7 * i);
        if (UI.addDays(week, 6) < first) continue;
        possible++;
        if (this.weekCount(habit, week) >= this.target(habit)) met++;
      }
      return possible ? Math.round((met / possible) * 100) : null;
    }
    let possible = 0, done = 0;
    for (let i = 0; i < 30; i++) {
      const day = UI.addDays(today, -i);
      if (day < first) break;
      possible++;
      if (habit.doneDays.includes(day)) done++;
    }
    return possible ? Math.round((done / possible) * 100) : null;
  },

  countBetween(habit, from, to) {
    return habit.doneDays.filter((d) => d >= from && d <= to).length;
  },

  unit(habit, n) {
    const word = this.isWeekly(habit) ? "week" : "day";
    return `${n} ${word}${n === 1 ? "" : "s"}`;
  },

  // ---------- Saving ----------
  add(name, extra = {}) {
    const clean = String(name).trim().slice(0, 80);
    if (!clean) return null;
    const habit = Store.NORMALIZE.habits({ id: Store.newId(), name: clean, doneDays: [], createdAt: new Date().toISOString(), ...extra });
    Store.set("habits", [...this.all(), habit]);
    return habit;
  },

  update(id, changes) {
    Store.set("habits", this.all().map((h) => (h.id === id ? { ...h, ...changes } : h)));
    return this.all().find((h) => h.id === id);
  },

  setDoneToday(id, done) {
    const today = UI.dateKey();
    const habit = this.all().find((h) => h.id === id);
    if (!habit) return null;
    const doneDays = done ? [...new Set([...habit.doneDays, today])] : habit.doneDays.filter((d) => d !== today);
    return this.update(id, { doneDays });
  },

  async confirmDelete(habit) {
    const ok = await UI.confirm({
      title: "Delete this habit?",
      message: `“${habit.name}” and its entire check-in history (${habit.doneDays.length} check-ins) will be deleted. This can't be undone.`,
    });
    if (!ok) return false;
    Store.set("habits", this.all().filter((h) => h.id !== habit.id));
    if (this.state.selectedId === habit.id) this.state.selectedId = null;
    UI.toast("Habit deleted");
    return true;
  },

  // Returns the saved habit, "deleted", or null
  async openEditor(habit = null, { quiet = false } = {}) {
    const h = habit || { name: "", frequency: "daily", weeklyTarget: 3 };
    const values = await UI.form({
      title: habit ? "Edit habit" : "New habit",
      submitLabel: habit ? "Save changes" : "Add habit",
      deleteLabel: habit ? "Delete" : null,
      fields: [
        { name: "name", label: "Habit", value: h.name, required: true, placeholder: "e.g. Read 10 pages",
          validate: (v) => (v.length > 80 ? "Keep it under 80 characters." : "") },
        { name: "frequency", label: "How often", type: "select", half: true, value: h.frequency,
          options: [{ value: "daily", label: "Every day" }, { value: "weekly", label: "Some days per week" }] },
        { name: "weeklyTarget", label: "Times per week (weekly only)", type: "number", half: true, min: 1, max: 7, value: h.weeklyTarget,
          validate: (v) => (/^[1-7]$/.test(v) ? "" : "Enter a number from 1 to 7.") },
      ],
    });
    if (values === null) return null;
    if (values === "delete") return (await this.confirmDelete(habit)) ? "deleted" : null;

    const data = { name: values.name, frequency: values.frequency === "weekly" ? "weekly" : "daily", weeklyTarget: Number(values.weeklyTarget) };
    if (habit) {
      UI.toast("Habit updated");
      return this.update(habit.id, data);
    }
    if (!quiet) UI.toast("Habit added");
    return this.add(data.name, data);
  },

  // ---------- Small pieces of HTML ----------
  streakBadge(habit) {
    const n = this.countStreak(habit);
    const [lvl1, lvl2] = this.isWeekly(habit) ? [2, 4] : [3, 7]; // when the flame grows
    const level = n >= lvl2 ? 2 : n >= lvl1 ? 1 : 0;
    return { n, level, html: `<span class="flame">${icon("flame")}</span>${this.unit(habit, n)}` };
  },

  metaText(habit) {
    if (!this.isWeekly(habit)) return "Every day";
    const count = this.weekCount(habit, UI.startOfWeek(UI.dateKey()));
    return `${this.target(habit)}× per week · ${Math.min(count, 7)}/${this.target(habit)} this week`;
  },

  weekDotsHtml(habit) {
    let html = "";
    for (let i = 6; i >= 0; i--) {
      const key = UI.daysAgoKey(i);
      const on = habit.doneDays.includes(key);
      html += `<span class="week-dot${on ? " on" : ""}${i === 0 ? " today" : ""}" title="${UI.formatDay(key)}${on ? ": done" : ""}"></span>`;
    }
    return html;
  },

  // A GitHub-style grid: one column per week, one square per day.
  // valueFor(key) returns a level 0–4, or null for "before the habit existed".
  heatmapHtml(valueFor, weeks = 26) {
    const today = UI.dateKey();
    const start = UI.addDays(UI.startOfWeek(today), -(weeks - 1) * 7);
    let months = "", cells = "", lastMonth = -1, lastLabelColumn = -10;

    for (let w = 0; w < weeks; w++) {
      const weekStart = UI.addDays(start, w * 7);
      const month = UI.parseKey(weekStart).getMonth();
      // Label each month where it starts, but skip a label that would sit
      // too close to the previous one (labels need ~3 columns of space)
      const nextMonthSoon = UI.parseKey(UI.addDays(weekStart, 14)).getMonth() !== month;
      if (month !== lastMonth && w - lastLabelColumn >= 3 && !(w === 0 && nextMonthSoon)) {
        months += `<span style="grid-column:${w + 1}">${UI.formatDay(weekStart, { month: "short" })}</span>`;
        lastLabelColumn = w;
      }
      lastMonth = month;
      for (let d = 0; d < 7; d++) {
        const key = UI.addDays(weekStart, d);
        if (key > today) { cells += `<span class="hm future"></span>`; continue; }
        const level = valueFor(key);
        cells += `<span class="hm ${level === null ? "before" : "l" + level}" title="${UI.formatDay(key, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}"></span>`;
      }
    }
    return `
      <div class="heatmap-scroll">
        <div class="heatmap-wrap" style="--weeks:${weeks}">
          <div class="heatmap-months">${months}</div>
          <div class="heatmap">${cells}</div>
        </div>
      </div>
      <div class="heatmap-legend">Less <span class="hm l0"></span><span class="hm l1"></span><span class="hm l2"></span><span class="hm l3"></span><span class="hm l4"></span> More</div>`;
  },

  // ---------- One habit row ----------
  createRow(habit, { page = false, onChange = () => {} } = {}) {
    const doneToday = habit.doneDays.includes(UI.dateKey());
    const streak = this.streakBadge(habit);
    const row = UI.html(`
      <li class="item habit-item${doneToday ? " done" : ""}${page && this.state.selectedId === habit.id ? " selected" : ""}" data-id="${UI.escape(habit.id)}">
        <input type="checkbox" ${doneToday ? "checked" : ""} aria-label="Done “${UI.escape(habit.name)}” today">
        <button class="item-main" type="button" title="${page ? "Show statistics" : "Edit habit"}">
          <span class="item-label">${UI.escape(habit.name)}</span>
          <span class="item-desc" data-meta>${UI.escape(this.metaText(habit))}</span>
        </button>
        ${page ? `<span class="week-dots" aria-hidden="true">${this.weekDotsHtml(habit)}</span>` : ""}
        <span class="streak" data-level="${streak.level}" title="Current streak">${streak.html}</span>
        <div class="item-actions">
          <button class="btn-icon small" type="button" data-edit aria-label="Edit habit" title="Edit">${icon("pencil")}</button>
          <button class="btn-icon small danger" type="button" data-delete aria-label="Delete habit" title="Delete">${icon("trash-2")}</button>
        </div>
      </li>`);

    const checkbox = row.querySelector("input");
    const badge = row.querySelector(".streak");

    checkbox.addEventListener("change", () => {
      const before = this.countStreak(this.all().find((h) => h.id === habit.id));
      const saved = this.setDoneToday(habit.id, checkbox.checked);
      if (!saved) return;
      row.classList.toggle("done", checkbox.checked);

      const next = this.streakBadge(saved);
      badge.innerHTML = next.html;
      badge.dataset.level = next.level;
      if (next.n > before) UI.replayAnimation(badge, "bump");
      row.querySelector("[data-meta]").textContent = this.metaText(saved);
      const dots = row.querySelector(".week-dots");
      if (dots) dots.innerHTML = this.weekDotsHtml(saved);
      if (checkbox.checked) UI.replayAnimation(checkbox, "pop");

      onChange();
      if (checkbox.checked && this.all().length && this.all().every((h) => this.doneForToday(h))) {
        UI.confetti();
      }
    });

    const edit = async () => {
      const current = this.all().find((h) => h.id === habit.id);
      if (current && (await this.openEditor(current))) onChange("edited");
    };
    row.querySelector("[data-edit]").addEventListener("click", edit);
    row.querySelector(".item-main").addEventListener("click", () => {
      if (page) { this.state.selectedId = habit.id; onChange("selected"); }
      else edit();
    });

    row.querySelector("[data-delete]").addEventListener("click", async () => {
      const current = this.all().find((h) => h.id === habit.id);
      if (current && (await this.confirmDelete(current))) {
        UI.removeWithAnimation(row, () => { row.remove(); onChange("deleted"); });
      }
    });

    return row;
  },

  // "Today 2 / 3" progress bar. Returns true when everything is done for today.
  updateProgress(container) {
    const habits = this.all();
    const done = habits.filter((h) => this.doneForToday(h)).length;
    const allDone = habits.length > 0 && done === habits.length;

    container.querySelector("[data-progress]").hidden = habits.length === 0;
    const bar = container.querySelector("[data-progress-bar]");
    bar.style.width = habits.length ? `${(done / habits.length) * 100}%` : "0%";
    bar.classList.toggle("complete", allDone);
    const text = container.querySelector("[data-progress-text]");
    text.textContent = allDone ? `🎉 ${done} / ${habits.length}, all done!` : `${done} / ${habits.length}`;
    text.classList.toggle("complete-text", allDone);
    return allDone;
  },

  progressHtml() {
    return `
      <div class="habit-progress" data-progress>
        <div class="habit-progress-info"><span>Today</span><span data-progress-text></span></div>
        <div class="progress-track"><div class="progress-bar" data-progress-bar></div></div>
      </div>`;
  },

  // ---------- Dashboard widget ----------
  renderWidget(container) {
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon amber">${icon("flame")}</span>Habits</h3>
        <a class="card-link" href="#/habits">Open ${icon("chevron-right")}</a>
      </div>
      ${this.progressHtml()}
      <form class="add-form" data-add-form>
        <input class="input" type="text" placeholder="New daily habit, e.g. Read 10 pages" maxlength="80"
               aria-label="New habit" autocomplete="off">
        <button class="btn btn-primary" type="submit" aria-label="Add habit">${icon("plus")}</button>
      </form>
      <ul class="item-list" data-list></ul>
      <div data-empty></div>`;

    const list = container.querySelector("[data-list]");
    const empty = container.querySelector("[data-empty]");
    const refresh = () => {
      empty.innerHTML = list.children.length ? "" : UI.emptyState("flame", "No habits yet", "Add something you want to do regularly and build a streak.");
      this.updateProgress(container);
    };
    const draw = () => {
      list.innerHTML = "";
      this.all().forEach((h) => list.appendChild(this.createRow(h, { onChange })));
      refresh();
    };
    const onChange = (what) => (what === "edited" ? draw() : refresh());

    container.querySelector("[data-add-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.target.querySelector("input");
      const habit = this.add(input.value);
      if (!habit) return;
      const row = this.createRow(habit, { onChange });
      row.classList.add("entering");
      list.appendChild(row);
      refresh();
      input.value = "";
    });

    draw();
  },

  // ---------- Habits page ----------
  renderPage(container) {
    container.innerHTML = `
      <div class="page-header">
        <div><h2>Habits</h2><p>Tick habits as you do them. Your full history is kept.</p></div>
        <button class="btn btn-primary" type="button" data-new>${icon("plus")}New habit</button>
      </div>
      <section class="stats-grid" data-stats></section>
      <div class="habits-layout">
        <section class="card habits-list-card">
          <div class="card-header">
            <h3 class="card-title"><span class="card-icon amber">${icon("flame")}</span>Your habits</h3>
            <span class="muted small">Squares = last 7 days</span>
          </div>
          ${this.progressHtml()}
          <ul class="item-list" data-list></ul>
          <div data-empty></div>
        </section>
        <section class="card" data-detail></section>
      </div>
      <section class="card">
        <div class="card-header">
          <h3 class="card-title"><span class="card-icon emerald">${icon("calendar-days")}</span>All habits · last 6 months</h3>
        </div>
        <div data-heatmap></div>
      </section>`;

    const list = container.querySelector("[data-list]");
    const listCard = container.querySelector(".habits-list-card");

    const drawStats = () => {
      const habits = this.all();
      const today = UI.dateKey();
      const thisWeek = UI.startOfWeek(today);
      const lastWeek = UI.addDays(thisWeek, -7);
      const monthStart = today.slice(0, 8) + "01";
      const sum = (fn) => habits.reduce((n, h) => n + fn(h), 0);
      const weekNow = sum((h) => this.countBetween(h, thisWeek, today));
      const weekBefore = sum((h) => this.countBetween(h, lastWeek, UI.addDays(thisWeek, -1)));
      let best = { n: 0, name: "" };
      habits.forEach((h) => { const n = this.longestStreak(h); if (n > best.n) best = { n, name: h.name, habit: h }; });
      const done = habits.filter((h) => this.doneForToday(h)).length;

      const card = (iconName, color, label, value, sub) => `
        <div class="card stat-card">
          <div class="stat-top"><span>${label}</span><span class="card-icon ${color}">${icon(iconName)}</span></div>
          <div class="stat-value">${value}</div>
          <div class="stat-sub">${UI.escape(sub)}</div>
        </div>`;
      container.querySelector("[data-stats]").innerHTML =
        card("circle-check", "emerald", "Done today", habits.length ? `${done}/${habits.length}` : "0", habits.length ? "Weekly habits count once their target is met" : "Add a habit to start") +
        card("calendar-range", "sky", "Check-ins this week", weekNow, `Last week: ${weekBefore}`) +
        card("calendar-days", "violet", "Check-ins this month", sum((h) => this.countBetween(h, monthStart, today)), `Total ever: ${sum((h) => h.doneDays.length)}`) +
        card("trophy", "amber", "Longest streak", best.n ? this.unit(best.habit, best.n) : "–", best.n ? best.name : "No streaks yet");
    };

    const drawHeatmap = () => {
      const habits = this.all();
      container.querySelector("[data-heatmap]").innerHTML = habits.length
        ? this.heatmapHtml((key) => {
            const existing = habits.filter((h) => this.firstDay(h) <= key);
            if (!existing.length) return null;
            const ratio = existing.filter((h) => h.doneDays.includes(key)).length / existing.length;
            return ratio === 0 ? 0 : ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4;
          })
        : UI.emptyState("calendar-days", "No history yet", "Your check-ins will light up this calendar.");
    };

    const drawDetail = () => {
      const detail = container.querySelector("[data-detail]");
      const habits = this.all();
      const habit = habits.find((h) => h.id === this.state.selectedId) || habits[0];
      if (!habit) {
        detail.innerHTML = UI.emptyState("chart-column", "Statistics appear here", "Add a habit, then click it to see its streaks and history.");
        return;
      }
      this.state.selectedId = habit.id;
      list.querySelectorAll(".habit-item").forEach((r) => r.classList.toggle("selected", r.dataset.id === habit.id));

      const today = UI.dateKey();
      const rate = this.completionRate(habit);
      const weekStart = UI.startOfWeek(today);
      const monthStart = today.slice(0, 8) + "01";
      const stat = (label, value) => `<div class="mini-stat"><span>${label}</span><strong>${value}</strong></div>`;

      detail.innerHTML = `
        <div class="card-header">
          <h3 class="card-title"><span class="card-icon">${icon("chart-column")}</span>${UI.escape(habit.name)}</h3>
          <span class="badge">${icon("repeat")}${this.isWeekly(habit) ? `${this.target(habit)}× / week` : "Daily"}</span>
        </div>
        <div class="mini-stats">
          ${stat("Current streak", this.unit(habit, this.countStreak(habit)))}
          ${stat("Longest streak", this.unit(habit, this.longestStreak(habit)))}
          ${stat(this.isWeekly(habit) ? "Target met (4 wks)" : "Last 30 days", rate === null ? "–" : rate + "%")}
          ${stat("This week", `${this.countBetween(habit, weekStart, today)}${this.isWeekly(habit) ? " / " + this.target(habit) : ""}`)}
          ${stat("This month", this.countBetween(habit, monthStart, today))}
          ${stat("Total check-ins", habit.doneDays.length)}
        </div>
        ${rate !== null ? `<div class="progress-track"><div class="progress-bar" style="width:${rate}%"></div></div>` : ""}
        <p class="agenda-section">History · last 6 months</p>
        ${this.heatmapHtml((key) => (key < this.firstDay(habit) && !habit.doneDays.includes(key) ? null : habit.doneDays.includes(key) ? 4 : 0))}`;
    };

    const refresh = () => {
      container.querySelector("[data-empty]").innerHTML = list.children.length ? ""
        : UI.emptyState("flame", "No habits yet", "Click “New habit”. Try Reading, Programming, Exercise or Drinking water.");
      this.updateProgress(listCard);
      drawStats();
      drawDetail();
      drawHeatmap();
    };
    const draw = () => {
      list.innerHTML = "";
      this.all().forEach((h) => list.appendChild(this.createRow(h, { page: true, onChange })));
      refresh();
    };
    const onChange = (what) => (what === "edited" ? draw() : refresh());

    container.querySelector("[data-new]").addEventListener("click", async () => {
      const habit = await this.openEditor();
      if (habit) {
        this.state.selectedId = habit.id;
        draw();
        const row = list.querySelector(`[data-id="${CSS.escape(habit.id)}"]`);
        if (row) UI.highlight(row);
      }
    });

    // Opening from search selects that habit
    if (Router.highlightId && this.all().some((h) => h.id === Router.highlightId)) this.state.selectedId = Router.highlightId;
    draw();
  },
};
