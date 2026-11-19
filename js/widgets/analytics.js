// =========================================================
// ANALYTICS: statistics from every section, over days, weeks or months.
// Every number is calculated from your saved data. Nothing is estimated.
// =========================================================

const Analytics = {
  state: { view: "weekly" },

  // ---------- Data, for one date range [from, to] ----------
  tasksCompleted(from, to) {
    return Tasks.all().filter((t) => t.done && t.completedAt && (() => { const d = UI.dateKey(new Date(t.completedAt)); return d >= from && d <= to; })()).length;
  },

  habitCheckins(from, to) {
    return Habits.all().reduce((n, h) => n + Habits.countBetween(h, from, to), 0);
  },

  // Completion rate of one habit inside the range, in % (null = nothing to measure)
  habitRate(habit, from, to) {
    const start = Habits.firstDay(habit) > from ? Habits.firstDay(habit) : from;
    if (start > to) return null;
    const days = UI.diffDays(start, to) + 1;
    const done = Habits.countBetween(habit, start, to);
    if (Habits.isWeekly(habit)) {
      const expected = Math.max(1, Math.round((days / 7) * Habits.target(habit)));
      return Math.min(100, Math.round((done / expected) * 100));
    }
    return Math.round((done / days) * 100);
  },

  goalsCompleted(from, to) {
    return Goals.all().filter((g) => g.status === "completed" && g.completedAt && (() => { const d = UI.dateKey(new Date(g.completedAt)); return d >= from && d <= to; })()).length;
  },

  spent(from, to, category = null) {
    return Expenses.sum(Expenses.all().filter((e) => e.date >= from && e.date <= to && (!category || e.category === category)));
  },

  // ---------- Page ----------
  renderPage(container) {
    container.innerHTML = `
      <div class="page-header">
        <div><h2>Analytics</h2><p>How you're doing across tasks, study, habits, goals and money.</p></div>
        <div class="segmented" role="group" aria-label="Time period" data-views>
          ${Object.entries(Charts.VIEWS).map(([id, v]) => `<button type="button" data-value="${id}">${v.label}</button>`).join("")}
        </div>
      </div>
      <p class="muted small analytics-range" data-range></p>
      <section class="stats-grid" data-summary></section>
      <section class="card insights-card" data-insights></section>
      <div class="study-grid">
        <section class="card" data-tasks></section>
        <section class="card" data-study></section>
      </div>
      <div class="study-grid">
        <section class="card" data-subjects></section>
        <section class="card" data-habits></section>
      </div>
      <div class="study-grid">
        <section class="card" data-goals></section>
        <section class="card" data-money></section>
      </div>`;

    const draw = () => {
      const view = this.state.view;
      const buckets = Charts.buckets(view);
      const previous = Charts.buckets(view, 1);
      const { from, to } = Charts.range(buckets);
      const prev = Charts.range(previous);
      const today = UI.dateKey();
      const highlight = (b) => b.from <= today && b.to >= today;

      container.querySelectorAll("[data-views] button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === view)));
      container.querySelector("[data-range]").textContent =
        `${Charts.VIEWS[view].hint[0].toUpperCase() + Charts.VIEWS[view].hint.slice(1)}: ${UI.formatDay(from, { day: "numeric", month: "short", year: "numeric" })} – ${UI.formatDay(to, { day: "numeric", month: "short", year: "numeric" })}. Changes compare with the period before.`;

      // ----- Summary cards (this period vs the one before) -----
      const tasksNow = this.tasksCompleted(from, to), tasksBefore = this.tasksCompleted(prev.from, prev.to);
      const studyNow = Study.secondsBetween(from, to), studyBefore = Study.secondsBetween(prev.from, prev.to);
      const habitsNow = this.habitCheckins(from, to), habitsBefore = this.habitCheckins(prev.from, prev.to);
      const goalsNow = this.goalsCompleted(from, to), goalsBefore = this.goalsCompleted(prev.from, prev.to);
      const spentNow = this.spent(from, to), spentBefore = this.spent(prev.from, prev.to);
      const card = (iconName, color, label, value, sub) => `
        <div class="card stat-card">
          <div class="stat-top"><span>${label}</span><span class="card-icon ${color}">${icon(iconName)}</span></div>
          <div class="stat-value">${value}</div>
          <div class="stat-sub">${UI.escape(sub)}</div>
        </div>`;
      container.querySelector("[data-summary]").innerHTML =
        card("circle-check", "emerald", "Tasks completed", tasksNow, Charts.change(tasksNow, tasksBefore)) +
        card("graduation-cap", "", "Study time", UI.formatDuration(studyNow), Charts.change(studyNow, studyBefore)) +
        card("flame", "amber", "Habit check-ins", habitsNow, Charts.change(habitsNow, habitsBefore)) +
        card("trophy", "violet", "Goals completed", goalsNow, Charts.change(goalsNow, goalsBefore)) +
        card("wallet", "rose", "Spent", Expenses.format(spentNow), Charts.change(spentNow, spentBefore));

      // ----- Tasks completed over time -----
      const undated = Tasks.all().filter((t) => t.done && !t.completedAt).length;
      container.querySelector("[data-tasks]").innerHTML = `
        <div class="card-header"><h3 class="card-title"><span class="card-icon emerald">${icon("circle-check")}</span>Tasks completed</h3>
          <span class="badge accent">${tasksNow}</span></div>
        ${Charts.barChart(buckets.map((b) => ({ label: b.label, title: b.title, highlight: highlight(b),
          segments: [{ value: this.tasksCompleted(b.from, b.to), color: "var(--emerald)" }] })), { emptyText: "No tasks completed in this period" })}
        ${undated ? `<p class="chart-note">${undated} task${undated === 1 ? "" : "s"} finished before version 2.0 ha${undated === 1 ? "s" : "ve"} no completion date and ${undated === 1 ? "isn't" : "aren't"} counted.</p>` : ""}`;

      // ----- Study time over time (stacked by subject) -----
      const subjects = Study.subjects();
      container.querySelector("[data-study]").innerHTML = `
        <div class="card-header"><h3 class="card-title"><span class="card-icon">${icon("chart-column")}</span>Study time</h3>
          <span class="badge accent">${UI.formatDuration(studyNow)}</span></div>
        ${Charts.barChart(buckets.map((b) => ({ label: b.label, title: b.title, highlight: highlight(b),
          segments: subjects.map((s) => ({ value: Study.secondsBetween(b.from, b.to, s.id), color: s.color })) })),
          { format: (v) => UI.formatDuration(v), emptyText: "No study time in this period" })}
        ${subjects.length && studyNow ? Charts.legend(subjects.filter((s) => Study.secondsBetween(from, to, s.id) > 0).map((s) => ({ label: s.name, color: s.color }))) : ""}`;

      // ----- Study by subject -----
      container.querySelector("[data-subjects]").innerHTML = `
        <div class="card-header"><h3 class="card-title"><span class="card-icon violet">${icon("book-open")}</span>Study by subject</h3></div>
        ${Charts.hbars(subjects.map((s) => {
          const sec = Study.secondsBetween(from, to, s.id);
          return { label: s.name, value: sec, color: s.color, valueText: `${UI.formatDuration(sec)} <span class="muted">${studyNow ? Math.round((sec / studyNow) * 100) : 0}%</span>` };
        }).sort((a, b) => b.value - a.value), { emptyText: subjects.length ? "No study time in this period" : "Add subjects in the Study Tracker" })}`;

      // ----- Habits: rate + streaks -----
      const habits = Habits.all();
      container.querySelector("[data-habits]").innerHTML = `
        <div class="card-header"><h3 class="card-title"><span class="card-icon amber">${icon("flame")}</span>Habits</h3>
          <span class="muted small">Completion in this period</span></div>
        ${habits.length ? `
          <ul class="habit-stats">
            ${habits.map((h) => {
              const rate = this.habitRate(h, from, to);
              return `
                <li>
                  <div class="hbar-top"><span>${UI.escape(h.name)}</span><strong>${rate === null ? "–" : rate + "%"}</strong></div>
                  <div class="progress-track thin"><div class="progress-bar" style="width:${rate || 0}%"></div></div>
                  <div class="habit-streaks">
                    <span>${icon("flame")}Current: ${Habits.unit(h, Habits.countStreak(h))}</span>
                    <span>${icon("trophy")}Longest: ${Habits.unit(h, Habits.longestStreak(h))}</span>
                  </div>
                </li>`;
            }).join("")}
          </ul>`
        : `<div class="chart-empty">Add habits to see completion rates and streaks</div>`}`;

      // ----- Goals -----
      const goals = Goals.all();
      const active = goals.filter((g) => g.status === "active").length;
      const completed = goals.filter((g) => g.status === "completed").length;
      container.querySelector("[data-goals]").innerHTML = `
        <div class="card-header"><h3 class="card-title"><span class="card-icon violet">${icon("target")}</span>Goals</h3>
          <span class="badge">${completed} of ${goals.length} completed overall</span></div>
        ${Charts.barChart(buckets.map((b) => ({ label: b.label, title: b.title, highlight: highlight(b),
          segments: [{ value: this.goalsCompleted(b.from, b.to), color: "var(--violet)" }] })), { height: 150, emptyText: "No goals completed in this period" })}
        <div class="mini-stats goal-mini">
          <div class="mini-stat"><span>Active</span><strong>${active}</strong></div>
          <div class="mini-stat"><span>Completed</span><strong>${completed}</strong></div>
          <div class="mini-stat"><span>Completion rate</span><strong>${goals.length ? Math.round((completed / goals.length) * 100) + "%" : "–"}</strong></div>
        </div>`;

      // ----- Money -----
      const cats = Object.entries(Expenses.CATEGORIES);
      container.querySelector("[data-money]").innerHTML = `
        <div class="card-header"><h3 class="card-title"><span class="card-icon rose">${icon("wallet")}</span>Spending</h3>
          <span class="badge accent">${Expenses.format(spentNow)}</span></div>
        ${Charts.barChart(buckets.map((b) => ({ label: b.label, title: b.title, highlight: highlight(b),
          segments: cats.map(([id, c]) => ({ value: this.spent(b.from, b.to, id), color: c.color })) })),
          { height: 150, format: (v) => Expenses.formatShort(v), emptyText: "No expenses in this period" })}
        ${Charts.hbars(cats.map(([id, c]) => {
          const sum = this.spent(from, to, id);
          return { label: c.label, value: sum, color: c.color, valueText: `${Expenses.format(sum)} <span class="muted">${spentNow ? Math.round((sum / spentNow) * 100) : 0}%</span>` };
        }).sort((a, b) => b.value - a.value), { emptyText: "" })}`;
    };

    container.querySelector("[data-views]").addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (!button) return;
      this.state.view = button.dataset.value;
      draw();
    });
    draw();
    Insights.renderCard(container.querySelector("[data-insights]")); // observations don't depend on the period
  },

  // ---------- Dashboard widget: this week (Mon–Sun) at a glance ----------
  renderWeekWidget(container) {
    const start = UI.startOfWeek(UI.dateKey());
    const days = Array.from({ length: 7 }, (_, i) => UI.addDays(start, i));
    const today = UI.dateKey();
    const rows = [
      { label: "Tasks done", color: "var(--emerald)", values: days.map((d) => this.tasksCompleted(d, d)), format: (v) => String(v) },
      { label: "Habit check-ins", color: "var(--amber)", values: days.map((d) => this.habitCheckins(d, d)), format: (v) => String(v) },
      { label: "Study time", color: "var(--accent)", values: days.map((d) => Study.secondsBetween(d, d)), format: (v) => UI.formatDuration(v) },
    ];

    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon emerald">${icon("trending-up")}</span>This week</h3>
        <a class="card-link" href="#/analytics">Analytics ${icon("chevron-right")}</a>
      </div>
      <div class="week-rows">
        ${rows.map((r) => {
          const max = Math.max(...r.values, 0);
          const total = r.values.reduce((n, v) => n + v, 0);
          return `
            <div class="week-row">
              <div class="week-row-top"><span>${r.label}</span><strong>${r.format(total)}</strong></div>
              <div class="week-strip" role="img" aria-label="${r.label} per day this week: ${r.values.map(r.format).join(", ")}">
                ${r.values.map((v, i) => `
                  <span class="week-cell${days[i] === today ? " today" : ""}${days[i] > today ? " future" : ""}" title="${UI.formatDay(days[i])}: ${r.format(v)}">
                    <span style="height:${max ? Math.max(v ? 12 : 0, (v / max) * 100) : 0}%;background:${r.color}"></span>
                  </span>`).join("")}
              </div>
            </div>`;
        }).join("")}
        <div class="week-days">${days.map((d) => `<span class="${d === today ? "today" : ""}">${UI.formatDay(d, { weekday: "narrow" })}</span>`).join("")}</div>
      </div>`;
  },
};

// ---------------------------------------------------------
// Register the Analytics module (see js/modules.js)
// ---------------------------------------------------------
Modules.register({
  id: "analytics",
  order: 90,
  nav: { label: "Analytics", icon: "chart-column" },
  page: (container) => Analytics.renderPage(container),
  widgets: [{ id: "week", label: "This week (productivity)", span: 4, order: 60, render: (el) => Analytics.renderWeekWidget(el) }],
});
