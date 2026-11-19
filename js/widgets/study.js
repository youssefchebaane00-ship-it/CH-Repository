// =========================================================
// STUDY TRACKER: subjects, study sessions, the study stopwatch,
// statistics, the Study page and the dashboard widget.
//
// The stopwatch saves WHEN it started (runningSince) plus time from
// earlier runs (accumulatedMs), so it stays correct across refreshes.
// =========================================================

const Study = {
  COLORS: [
    { value: "#22d3ee", label: "Cyan" },
    { value: "#a78bfa", label: "Violet" },
    { value: "#fbbf24", label: "Amber" },
    { value: "#fb7185", label: "Rose" },
    { value: "#34d399", label: "Emerald" },
    { value: "#60a5fa", label: "Blue" },
    { value: "#fb923c", label: "Orange" },
    { value: "#f472b6", label: "Pink" },
  ],
  SOURCES: {
    timer: { label: "Stopwatch", icon: "hourglass" },
    pomodoro: { label: "Pomodoro", icon: "timer" },
    manual: { label: "Added manually", icon: "pencil" },
  },

  draft: { subjectId: "", description: "" }, // what's typed in the stopwatch before starting
  ui: { chartPeriod: "week", historyLimit: 15 },

  // ---------- Data helpers ----------
  subjects() {
    return Store.get("subjects");
  },

  subject(id) {
    return this.subjects().find((s) => s.id === id) || null;
  },

  sessions() {
    return Store.get("studySessions");
  },

  // Seconds studied between two date keys (inclusive), optionally for one subject
  secondsBetween(from, to, subjectId = null) {
    return this.sessions()
      .filter((s) => s.date >= from && s.date <= to && (!subjectId || s.subjectId === subjectId))
      .reduce((sum, s) => sum + s.durationSec, 0);
  },

  periods() {
    const today = UI.dateKey();
    return {
      today: [today, today],
      week: [UI.startOfWeek(today), today],
      month: [today.slice(0, 8) + "01", today],
      all: ["0000-00-00", "9999-99-99"],
    };
  },

  totals() {
    const p = this.periods();
    return {
      today: this.secondsBetween(...p.today),
      week: this.secondsBetween(...p.week),
      month: this.secondsBetween(...p.month),
      all: this.secondsBetween(...p.all),
      weeklyGoalSec: this.subjects().reduce((sum, s) => sum + (Number(s.weeklyGoalHours) || 0) * 3600, 0),
    };
  },

  // ---------- Subjects ----------
  async openSubjectEditor(subject = null) {
    const s = subject || { name: "", color: this.COLORS[this.subjects().length % this.COLORS.length].value, weeklyGoalHours: 0 };
    const values = await UI.form({
      title: subject ? "Edit subject" : "New subject",
      submitLabel: subject ? "Save changes" : "Add subject",
      deleteLabel: subject ? "Delete" : null,
      fields: [
        { name: "name", label: "Subject / module", value: s.name, required: true, placeholder: "e.g. Mathematics",
          validate: (v) => (v.length > 50 ? "Keep it under 50 characters."
            : this.subjects().some((x) => x.name.toLowerCase() === v.toLowerCase() && x.id !== subject?.id) ? "You already have a subject with this name." : "") },
        { name: "color", label: "Color", type: "select", half: true, value: s.color, options: this.COLORS },
        { name: "weeklyGoalHours", label: "Weekly goal (hours, 0 = none)", half: true, value: String(s.weeklyGoalHours),
          validate: (v) => (/^\d{1,2}(\.\d)?$/.test(v) && Number(v) <= 80 ? "" : "Enter hours from 0 to 80, e.g. 5 or 2.5") },
      ],
    });
    if (values === null) return null;
    if (values === "delete") return (await this.deleteSubject(subject)) ? "deleted" : null;

    const data = { name: values.name, color: this.COLORS.some((c) => c.value === values.color) ? values.color : this.COLORS[0].value, weeklyGoalHours: Number(values.weeklyGoalHours) };
    if (subject) {
      Store.set("subjects", this.subjects().map((x) => (x.id === subject.id ? { ...x, ...data } : x)));
      UI.toast("Subject updated");
      return this.subject(subject.id);
    }
    const created = { id: Store.newId(), ...data, createdAt: new Date().toISOString() };
    Store.set("subjects", [...this.subjects(), created]);
    UI.toast(`${created.name} added`);
    return created;
  },

  async deleteSubject(subject) {
    const count = this.sessions().filter((s) => s.subjectId === subject.id).length;
    const active = this.activeSession();
    const ok = await UI.confirm({
      title: `Delete ${subject.name}?`,
      message: count
        ? `This also deletes its ${count} study session${count === 1 ? "" : "s"} (${UI.formatDuration(this.secondsBetween(...this.periods().all, subject.id))}). This can't be undone. Tip: export a backup in Settings first.`
        : "This subject has no study sessions yet.",
    });
    if (!ok) return false;
    Store.set("subjects", this.subjects().filter((s) => s.id !== subject.id));
    Store.set("studySessions", this.sessions().filter((s) => s.subjectId !== subject.id));
    if (active && active.subjectId === subject.id) Store.set("activeSession", null);
    if (Pomodoro.state().subjectId === subject.id) Pomodoro.setSubject("");
    if (this.draft.subjectId === subject.id) this.draft.subjectId = "";
    UI.toast("Subject deleted");
    return true;
  },

  // ---------- Sessions ----------
  addSession({ subjectId, description = "", durationSec, startedAt = null, date = null, source = "manual" }) {
    const start = startedAt ? new Date(startedAt) : new Date();
    const session = {
      id: Store.newId(),
      subjectId,
      description: String(description).slice(0, 200),
      durationSec: Math.round(durationSec),
      startedAt: start.toISOString(),
      date: date || UI.dateKey(start),
      source,
    };
    Store.set("studySessions", [...this.sessions(), session]);
    return session;
  },

  deleteSession(id) {
    const sessions = this.sessions();
    const index = sessions.findIndex((s) => s.id === id);
    if (index === -1) return;
    const removed = sessions[index];
    Store.set("studySessions", sessions.filter((s) => s.id !== id));
    UI.toast("Session deleted", {
      actionLabel: "Undo",
      onAction: () => {
        const current = [...this.sessions()];
        current.splice(index, 0, removed);
        Store.set("studySessions", current);
        Router.refresh();
      },
    });
  },

  subjectOptions() {
    return this.subjects().map((s) => ({ value: s.id, label: s.name }));
  },

  // Add a past session by hand, or edit one
  async openSessionEditor(session = null) {
    if (!this.subjects().length) {
      UI.toast("Create a subject first.", { type: "info" });
      return null;
    }
    const s = session || { subjectId: this.draft.subjectId || this.subjects()[0].id, date: UI.dateKey(), durationSec: 3600, description: "" };
    const values = await UI.form({
      title: session ? "Edit study session" : "Log a study session",
      submitLabel: session ? "Save changes" : "Add session",
      deleteLabel: session ? "Delete" : null,
      fields: [
        { name: "subjectId", label: "Subject", type: "select", value: s.subjectId, options: this.subjectOptions() },
        { name: "date", label: "Date", type: "date", half: true, value: s.date,
          validate: (v) => (!UI.isDateKey(v) ? "Pick a valid date." : v > UI.dateKey() ? "The date can't be in the future." : "") },
        { name: "minutes", label: "Duration (minutes)", type: "number", half: true, min: 1, max: 1440, value: String(Math.max(1, Math.round(s.durationSec / 60))),
          validate: (v) => (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1440 ? "" : "Enter 1 to 1440 minutes.") },
        { name: "description", label: "What did you study? (optional)", value: s.description, placeholder: "e.g. Chapter 4 exercises" },
      ],
    });
    if (values === null) return null;
    if (values === "delete") {
      this.deleteSession(session.id);
      return "deleted";
    }
    const data = { subjectId: values.subjectId, date: values.date, durationSec: Number(values.minutes) * 60, description: values.description.slice(0, 200) };
    if (session) {
      Store.set("studySessions", this.sessions().map((x) => (x.id === session.id ? { ...x, ...data } : x)));
      UI.toast("Session updated");
      return data;
    }
    const created = this.addSession({ ...data, startedAt: new Date(UI.parseKey(values.date).setHours(12)).toISOString(), source: "manual" });
    UI.toast(`${UI.formatDuration(created.durationSec)} added to ${this.subject(created.subjectId).name}`);
    return created;
  },

  // ---------- Stopwatch ----------
  activeSession() {
    return Store.get("activeSession");
  },

  activeElapsedMs() {
    const a = this.activeSession();
    if (!a) return 0;
    return a.accumulatedMs + (a.runningSince ? Date.now() - a.runningSince : 0);
  },

  startTimer(subjectId, description = "") {
    if (!this.subject(subjectId)) {
      UI.toast("Choose a subject first.", { type: "info" });
      return false;
    }
    if (Pomodoro.isRunning() && Pomodoro.state().mode === "focus") {
      UI.toast("A Pomodoro focus session is running. Pause it first, so time isn't counted twice.", { type: "info" });
      return false;
    }
    Sound.unlock();
    Store.set("activeSession", { subjectId, description: description.slice(0, 200), startedAt: new Date().toISOString(), runningSince: Date.now(), accumulatedMs: 0 });
    return true;
  },

  pauseTimer() {
    const a = this.activeSession();
    if (!a || !a.runningSince) return;
    Store.set("activeSession", { ...a, accumulatedMs: a.accumulatedMs + (Date.now() - a.runningSince), runningSince: null });
  },

  resumeTimer() {
    const a = this.activeSession();
    if (!a || a.runningSince) return;
    if (Pomodoro.isRunning() && Pomodoro.state().mode === "focus") {
      UI.toast("Pause the Pomodoro focus session first.", { type: "info" });
      return;
    }
    Store.set("activeSession", { ...a, runningSince: Date.now() });
  },

  // Stop: show a dialog to check the duration (handy if you forgot the timer), then save
  async stopTimer() {
    const a = this.activeSession();
    if (!a) return null;
    this.pauseTimer();
    const elapsed = this.activeElapsedMs();
    const subject = this.subject(a.subjectId);
    const values = await UI.form({
      title: "Save study session",
      submitLabel: "Save session",
      fields: [
        { name: "subjectId", label: "Subject", type: "select", value: a.subjectId, options: this.subjectOptions() },
        { name: "minutes", label: `Duration in minutes (timer: ${UI.formatClock(elapsed, true)})`, type: "number", min: 1, max: 1440,
          value: String(Math.max(1, Math.round(elapsed / 60000))),
          validate: (v) => (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1440 ? "" : "Enter 1 to 1440 minutes.") },
        { name: "description", label: "What did you study? (optional)", value: a.description, placeholder: "e.g. Chapter 4 exercises" },
      ],
    });
    if (values === null) {
      UI.toast("The timer is paused. Resume it, or stop again to save.", { type: "info" });
      return null;
    }
    const session = this.addSession({ subjectId: values.subjectId, description: values.description, durationSec: Number(values.minutes) * 60, startedAt: a.startedAt, source: "timer" });
    Store.set("activeSession", null);
    UI.toast(`${UI.formatDuration(session.durationSec)} of ${(this.subject(values.subjectId) || subject).name} saved`);
    return session;
  },

  async discardTimer() {
    const ok = await UI.confirm({ title: "Discard this session?", message: `${UI.formatClock(this.activeElapsedMs(), true)} of study time will not be saved.`, confirmLabel: "Discard" });
    if (!ok) return false;
    Store.set("activeSession", null);
    UI.toast("Session discarded", { type: "info" });
    return true;
  },

  // ---------- Live displays (called every second by app.js) ----------
  tick() {
    const a = this.activeSession();
    const elapsed = this.activeElapsedMs();
    const clock = UI.formatClock(Math.floor(elapsed / 1000) * 1000, true);
    document.querySelectorAll("[data-study-clock]").forEach((el) => { el.textContent = clock; });

    // Top bar pill + browser tab title while a timer runs
    const pill = document.getElementById("timer-pill");
    const pomo = Pomodoro.state();
    let pillText = "";
    if (a) {
      const subject = this.subject(a.subjectId);
      pillText = `${clock} · ${subject ? subject.name : "Study"}${a.runningSince ? "" : " (paused)"}`;
    } else if (pomo.status !== "idle") {
      pillText = `${UI.formatClock(Pomodoro.remainingMs(pomo))} · ${Pomodoro.MODES[pomo.mode].label}${pomo.status === "paused" ? " (paused)" : ""}`;
    }
    pill.hidden = !pillText;
    if (pillText) {
      pill.querySelector("[data-pill-text]").textContent = pillText;
      pill.classList.toggle("paused", (a && !a.runningSince) || (!a && pomo.status === "paused"));
    }
    const running = (a && a.runningSince) || pomo.status === "running";
    const title = running ? `${pillText.split(" · ")[0]} · ${Router.pageTitle}` : Router.pageTitle;
    if (document.title !== title) document.title = title;

    Pomodoro.updateDisplays();
  },

  // ---------- Stopwatch card (Study page + dashboard) ----------
  renderStopwatch(container, { compact = false } = {}) {
    const draw = () => {
      const a = this.activeSession();
      const subjects = this.subjects();

      if (!subjects.length) {
        container.innerHTML = `
          ${compact ? "" : `<div class="card-header"><h3 class="card-title"><span class="card-icon">${icon("hourglass")}</span>Study session</h3></div>`}
          ${UI.emptyState("graduation-cap", "Add your first subject", "Subjects are your modules, like Mathematics or Physics.")}
          <div class="center"><button class="btn btn-primary" type="button" data-new-subject>${icon("plus")}New subject</button></div>`;
        container.querySelector("[data-new-subject]").addEventListener("click", async () => {
          if (await this.openSubjectEditor()) Router.refresh();
        });
        return;
      }

      if (!this.subject(this.draft.subjectId)) this.draft.subjectId = subjects[0].id;
      const status = !a ? "" : a.runningSince ? `<span class="badge live">${icon("circle")}Running</span>` : `<span class="badge">Paused</span>`;
      const button = (action, label, iconName, cls = "btn-secondary") =>
        `<button class="btn ${cls}" type="button" data-action="${action}">${icon(iconName)}${label}</button>`;

      container.innerHTML = `
        ${compact ? "" : `<div class="card-header"><h3 class="card-title"><span class="card-icon">${icon("hourglass")}</span>Study session</h3>${status}</div>`}
        <div class="stopwatch-fields">
          <select class="input" data-subject aria-label="Subject" ${a ? "disabled" : ""}>
            ${subjects.map((s) => `<option value="${UI.escape(s.id)}"${s.id === (a ? a.subjectId : this.draft.subjectId) ? " selected" : ""}>${UI.escape(s.name)}</option>`).join("")}
          </select>
          ${compact ? "" : `<input class="input" data-description maxlength="200" placeholder="What are you studying? (optional)" aria-label="Session description" value="${UI.escape(a ? a.description : this.draft.description)}">`}
        </div>
        <div class="stopwatch-clock${a && !a.runningSince ? " paused" : ""}" data-study-clock>${UI.formatClock(Math.floor(this.activeElapsedMs() / 1000) * 1000, true)}</div>
        <div class="timer-controls">
          ${!a ? button("start", "Start", "play", "btn-primary")
            : (a.runningSince ? button("pause", "Pause", "pause") : button("resume", "Resume", "play", "btn-primary")) +
              button("stop", "Stop & save", "square", a.runningSince ? "btn-primary" : "btn-secondary") +
              `<button class="btn-icon danger" type="button" data-action="discard" aria-label="Discard session" title="Discard">${icon("trash-2")}</button>`}
        </div>`;

      const subjectSelect = container.querySelector("[data-subject]");
      subjectSelect.addEventListener("change", () => { this.draft.subjectId = subjectSelect.value; });
      const description = container.querySelector("[data-description]");
      if (description) {
        description.addEventListener("input", () => {
          const current = this.activeSession();
          if (current) Store.set("activeSession", { ...current, description: description.value.slice(0, 200) });
          else this.draft.description = description.value;
        });
      }
    };

    container.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "start") {
        if (this.startTimer(this.draft.subjectId, this.draft.description)) this.draft.description = "";
      }
      if (action === "pause") this.pauseTimer();
      if (action === "resume") this.resumeTimer();
      if (action === "stop" && (await this.stopTimer())) { Router.refresh(); return; }
      if (action === "discard") await this.discardTimer();
      draw();
    });

    draw();
  },

  // ---------- Study page ----------
  renderPage(container) {
    const t = this.totals();
    const goalPct = t.weeklyGoalSec ? Math.round((t.week / t.weeklyGoalSec) * 100) : null;
    const card = (iconName, color, label, value, sub) => `
      <div class="card stat-card">
        <div class="stat-top"><span>${label}</span><span class="card-icon ${color}">${icon(iconName)}</span></div>
        <div class="stat-value">${value}</div>
        <div class="stat-sub">${UI.escape(sub)}</div>
      </div>`;

    container.innerHTML = `
      <div class="page-header">
        <div><h2>Study Tracker</h2><p>Time your study sessions and see where your hours go.</p></div>
        <div class="header-actions">
          <button class="btn btn-secondary" type="button" data-log>${icon("pencil")}Log session</button>
          <button class="btn btn-primary" type="button" data-new-subject>${icon("plus")}New subject</button>
        </div>
      </div>
      <section class="stats-grid">
        ${card("clock", "", "Today", UI.formatDuration(t.today), `${this.sessions().filter((s) => s.date === UI.dateKey()).length} sessions`)}
        ${card("calendar-range", "sky", "This week", UI.formatDuration(t.week), goalPct === null ? "Set weekly goals on your subjects" : `${goalPct}% of ${UI.formatDuration(t.weeklyGoalSec)} goal`)}
        ${card("calendar-days", "violet", "This month", UI.formatDuration(t.month), `All time: ${UI.formatDuration(t.all)}`)}
        ${card("timer", "rose", "Pomodoros today", Pomodoro.state().count, `${Store.get("settings").pomodoroFocus} min focus each`)}
      </section>
      <div class="study-timers">
        <section class="card" data-stopwatch></section>
        <section class="card" data-pomodoro></section>
      </div>
      <div class="study-grid">
        <section class="card" data-subjects></section>
        <section class="card" data-week-chart></section>
      </div>
      <div class="study-grid">
        <section class="card" data-per-subject></section>
        <section class="card" data-history></section>
      </div>`;

    this.renderStopwatch(container.querySelector("[data-stopwatch]"));
    Pomodoro.renderCard(container.querySelector("[data-pomodoro]"));
    this.renderSubjects(container.querySelector("[data-subjects]"));
    this.renderWeekChart(container.querySelector("[data-week-chart]"));
    this.renderPerSubject(container.querySelector("[data-per-subject]"));
    this.renderHistory(container.querySelector("[data-history]"));

    container.querySelector("[data-new-subject]").addEventListener("click", async () => {
      const created = await this.openSubjectEditor();
      if (created) Router.refresh(created.id);
    });
    container.querySelector("[data-log]").addEventListener("click", async () => {
      const created = await this.openSessionEditor();
      if (created) Router.refresh(created.id);
    });
  },

  renderSubjects(container) {
    const [weekFrom, weekTo] = this.periods().week;
    const subjects = this.subjects();
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon violet">${icon("book-open")}</span>Subjects</h3>
        <span class="muted small">This week vs goal</span>
      </div>
      ${subjects.length ? `<ul class="subject-list">${subjects.map((s) => {
        const week = this.secondsBetween(weekFrom, weekTo, s.id);
        const goal = (Number(s.weeklyGoalHours) || 0) * 3600;
        const pct = goal ? Math.min(100, Math.round((week / goal) * 100)) : 0;
        return `
          <li class="subject-row" data-id="${UI.escape(s.id)}" style="--subject:${UI.escape(s.color)}">
            <span class="subject-dot"></span>
            <div class="subject-main">
              <div class="subject-top">
                <strong>${UI.escape(s.name)}</strong>
                <span>${UI.formatDuration(week)}${goal ? ` / ${UI.formatDuration(goal)}` : ""}</span>
              </div>
              ${goal ? `<div class="progress-track thin"><div class="progress-bar subject-bar${pct >= 100 ? " complete" : ""}" style="width:${pct}%"></div></div>` : `<span class="muted small">No weekly goal</span>`}
              <span class="muted small">Total: ${UI.formatDuration(this.secondsBetween(...this.periods().all, s.id))}</span>
            </div>
            <div class="item-actions">
              <button class="btn-icon small" type="button" data-edit aria-label="Edit ${UI.escape(s.name)}" title="Edit">${icon("pencil")}</button>
            </div>
          </li>`;
      }).join("")}</ul>`
      : UI.emptyState("book-open", "No subjects yet", "Click “New subject” and add your modules, e.g. Mathematics, Physics, Programming.")}`;

    container.addEventListener("click", async (event) => {
      const row = event.target.closest(".subject-row");
      if (!row || !event.target.closest("[data-edit]")) return;
      if (await this.openSubjectEditor(this.subject(row.dataset.id))) Router.refresh();
    });
  },

  // Bar chart: study time on each of the last 7 days, split by subject color
  renderWeekChart(container) {
    const days = Array.from({ length: 7 }, (_, i) => UI.daysAgoKey(6 - i));
    const perDay = days.map((day) => {
      const sessions = this.sessions().filter((s) => s.date === day);
      const bySubject = {};
      sessions.forEach((s) => { bySubject[s.subjectId] = (bySubject[s.subjectId] || 0) + s.durationSec; });
      return { day, total: sessions.reduce((n, s) => n + s.durationSec, 0), bySubject };
    });
    const max = Math.max(3600, ...perDay.map((d) => d.total)); // at least a 1-hour scale
    const total = perDay.reduce((n, d) => n + d.total, 0);

    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon sky">${icon("chart-column")}</span>Last 7 days</h3>
        <span class="badge accent">${UI.formatDuration(total)}</span>
      </div>
      ${total ? `
        <div class="bar-chart" role="img" aria-label="Study time for each of the last 7 days">
          ${perDay.map((d) => `
            <div class="bar-col${d.day === UI.dateKey() ? " today" : ""}" title="${UI.formatDay(d.day)}: ${UI.formatDuration(d.total)}">
              <span class="bar-value">${d.total ? UI.formatDuration(d.total) : ""}</span>
              <div class="bar-stack" style="height:${(d.total / max) * 100}%">
                ${Object.entries(d.bySubject).map(([id, sec]) => `<span style="flex:${sec};background:${UI.escape(this.subject(id)?.color || "#64748b")}"></span>`).join("")}
              </div>
              <span class="bar-label">${UI.formatDay(d.day, { weekday: "short" })}</span>
            </div>`).join("")}
        </div>`
      : UI.emptyState("chart-column", "No study time this week", "Start the stopwatch or a Pomodoro, and your hours will show up here.")}`;
  },

  // Horizontal bars: time per subject for the chosen period
  renderPerSubject(container) {
    const draw = () => {
      const period = this.ui.chartPeriod;
      const [from, to] = this.periods()[period];
      const rows = this.subjects().map((s) => ({ s, sec: this.secondsBetween(from, to, s.id) })).sort((a, b) => b.sec - a.sec);
      const max = Math.max(1, ...rows.map((r) => r.sec));
      const total = rows.reduce((n, r) => n + r.sec, 0);

      container.innerHTML = `
        <div class="card-header">
          <h3 class="card-title"><span class="card-icon emerald">${icon("palette")}</span>Time per subject</h3>
          <div class="segmented small-seg" role="group" aria-label="Period" data-periods>
            ${[["week", "Week"], ["month", "Month"], ["all", "All"]].map(([v, l]) => `<button type="button" data-value="${v}" aria-pressed="${v === period}">${l}</button>`).join("")}
          </div>
        </div>
        ${total ? `<ul class="hbar-list">${rows.map((r) => `
          <li>
            <div class="hbar-top"><span><span class="subject-dot" style="--subject:${UI.escape(r.s.color)}"></span>${UI.escape(r.s.name)}</span>
              <strong>${UI.formatDuration(r.sec)} <span class="muted">${Math.round((r.sec / total) * 100)}%</span></strong></div>
            <div class="progress-track thin"><div class="progress-bar" style="width:${(r.sec / max) * 100}%;background:${UI.escape(r.s.color)}"></div></div>
          </li>`).join("")}</ul>`
        : UI.emptyState("palette", "Nothing to show yet", period === "week" ? "No study time recorded this week." : "No study time recorded in this period.")}`;
    };

    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-periods] button");
      if (!button) return;
      this.ui.chartPeriod = button.dataset.value;
      draw();
    });
    draw();
  },

  renderHistory(container) {
    const draw = () => {
      const sorted = [...this.sessions()].sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt || "").localeCompare(a.startedAt || ""));
      const shown = sorted.slice(0, this.ui.historyLimit);
      let lastDay = "";
      let rows = "";
      for (const s of shown) {
        if (s.date !== lastDay) {
          const dayTotal = sorted.filter((x) => x.date === s.date).reduce((n, x) => n + x.durationSec, 0);
          rows += `<li class="history-day"><span>${UI.escape(UI.relativeDay(s.date))}</span><span>${UI.formatDuration(dayTotal)}</span></li>`;
          lastDay = s.date;
        }
        const subject = this.subject(s.subjectId);
        const source = this.SOURCES[s.source] || this.SOURCES.manual;
        rows += `
          <li class="history-item" data-id="${UI.escape(s.id)}" style="--subject:${UI.escape(subject?.color || "#64748b")}">
            <span class="subject-dot"></span>
            <div class="history-text">
              <strong>${UI.escape(subject?.name || "Deleted subject")}</strong>
              <span>${UI.escape(s.description || source.label)}</span>
            </div>
            <span class="history-source" title="${source.label}">${icon(source.icon)}</span>
            <strong class="history-duration">${UI.formatDuration(s.durationSec)}</strong>
            <div class="item-actions">
              <button class="btn-icon small" type="button" data-edit aria-label="Edit session" title="Edit">${icon("pencil")}</button>
              <button class="btn-icon small danger" type="button" data-delete aria-label="Delete session" title="Delete">${icon("trash-2")}</button>
            </div>
          </li>`;
      }

      container.innerHTML = `
        <div class="card-header">
          <h3 class="card-title"><span class="card-icon amber">${icon("history")}</span>Session history</h3>
          <span class="muted small">${sorted.length} total</span>
        </div>
        ${sorted.length ? `<ul class="history-list">${rows}</ul>
          ${sorted.length > shown.length ? `<button class="btn btn-secondary full" type="button" data-more>Show more</button>` : ""}`
        : UI.emptyState("history", "No sessions yet", "Your finished study sessions will be listed here.")}`;
    };

    container.addEventListener("click", async (event) => {
      if (event.target.closest("[data-more]")) { this.ui.historyLimit += 15; draw(); return; }
      const item = event.target.closest(".history-item");
      if (!item) return;
      const session = this.sessions().find((s) => s.id === item.dataset.id);
      if (!session) return;
      if (event.target.closest("[data-delete]")) {
        UI.removeWithAnimation(item, () => { this.deleteSession(session.id); Router.refresh(); });
      } else if (event.target.closest("[data-edit]")) {
        if (await this.openSessionEditor(session)) Router.refresh();
      }
    });
    draw();
  },

  // ---------- Dashboard widget ----------
  renderWidget(container) {
    const t = this.totals();
    const today = UI.dateKey();
    const todayBySubject = this.subjects()
      .map((s) => ({ s, sec: this.secondsBetween(today, today, s.id) }))
      .filter((r) => r.sec > 0)
      .sort((a, b) => b.sec - a.sec)
      .slice(0, 3);
    const goalPct = t.weeklyGoalSec ? Math.min(100, Math.round((t.week / t.weeklyGoalSec) * 100)) : null;
    const pomo = Pomodoro.state();

    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon">${icon("graduation-cap")}</span>Study</h3>
        <a class="card-link" href="#/study">Open ${icon("chevron-right")}</a>
      </div>
      <div class="study-summary">
        <div><span class="muted small">Today</span><strong>${UI.formatDuration(t.today)}</strong></div>
        <div><span class="muted small">This week</span><strong>${UI.formatDuration(t.week)}</strong></div>
      </div>
      ${goalPct !== null ? `
        <div class="daily-progress-info"><span>Weekly goal · ${UI.formatDuration(t.weeklyGoalSec)}</span><strong>${goalPct}%</strong></div>
        <div class="progress-track"><div class="progress-bar${goalPct >= 100 ? " complete" : ""}" style="width:${goalPct}%"></div></div>` : ""}
      ${pomo.status !== "idle" ? `
        <a class="pomo-mini" href="#/study">${icon("timer")}<span>${Pomodoro.MODES[pomo.mode].label}${pomo.status === "paused" ? " · paused" : ""}</span><strong data-pomo-time></strong></a>` : ""}
      <div class="widget-stopwatch" data-stopwatch></div>
      ${todayBySubject.length ? `<ul class="hbar-list compact">${todayBySubject.map((r) => `
        <li><div class="hbar-top"><span><span class="subject-dot" style="--subject:${UI.escape(r.s.color)}"></span>${UI.escape(r.s.name)}</span><strong>${UI.formatDuration(r.sec)}</strong></div></li>`).join("")}</ul>` : ""}`;

    this.renderStopwatch(container.querySelector("[data-stopwatch]"), { compact: true });
  },
};

// ---------------------------------------------------------
// Register the Study Tracker module (see js/modules.js).
// It also owns the Pomodoro's saved state.
// ---------------------------------------------------------
Modules.register({
  id: "study",
  order: 50,
  nav: { label: "Study Tracker", icon: "graduation-cap" },
  page: (container) => Study.renderPage(container),

  collections: {
    // { id, name, color, weeklyGoalHours, createdAt }
    subjects: {
      default: [],
      backup: true,
      normalize: (s) => ({ name: "Subject", color: "#22d3ee", weeklyGoalHours: 0, createdAt: null, ...s }),
    },
    // { id, subjectId, description, date, startedAt, durationSec, source: "timer"|"pomodoro"|"manual" }
    studySessions: {
      default: [],
      backup: true,
      normalize: (s) => ({
        subjectId: "", description: "", source: "manual", startedAt: null,
        ...s,
        durationSec: Math.max(0, Math.round(Number(s.durationSec) || 0)),
        date: typeof s.date === "string" ? s.date : UI.dateKey(),
      }),
    },
    // Running timers: not in backups, and cleared when a backup is restored
    activeSession: { default: null, resetOnImport: true },
    pomodoro: { default: null, resetOnImport: true },
  },

  search(q, has) {
    return {
      label: "Subjects",
      items: Study.subjects().filter((s) => has(s.name)).slice(0, 6).map((s) => ({
        text: s.name, icon: "graduation-cap", page: "study", id: s.id,
        hint: `This week: ${UI.formatDuration(Study.secondsBetween(...Study.periods().week, s.id))}`,
      })),
    };
  },

  // Running timers (not urgent, just a reminder they're on)
  notifications() {
    const items = [];
    const active = Study.activeSession();
    if (active) items.push({
      tone: "accent", icon: "hourglass", text: `Study session ${active.runningSince ? "running" : "paused"}`,
      sub: `${Study.subject(active.subjectId)?.name || "Study"} · ${UI.formatDuration(Study.activeElapsedMs() / 1000)} so far`, page: "study",
    });
    const pomo = Pomodoro.state();
    if (pomo.status !== "idle") items.push({
      tone: "rose", icon: "timer", text: `Pomodoro ${pomo.status === "paused" ? "paused" : "running"}`,
      sub: `${Pomodoro.MODES[pomo.mode].label} · ${UI.formatClock(Pomodoro.remainingMs(pomo))} left`, page: "study",
    });
    return items;
  },

  quickAdd: [{
    id: "study", label: "Start study session", icon: "hourglass", key: "S", order: 40,
    async run() {
      if (Study.activeSession()) {
        UI.toast("A study session is already running.", { type: "info", actionLabel: "Open", onAction: () => Router.go("study") });
        return;
      }
      if (!Study.subjects().length) {
        UI.toast("First, add a subject (e.g. Mathematics).", { type: "info" });
        if (!(await Study.openSubjectEditor())) return;
      }
      const values = await UI.form({
        title: "Start a study session", submitLabel: "Start",
        fields: [
          { name: "subjectId", label: "Subject", type: "select", value: Study.draft.subjectId || Study.subjects()[0].id, options: Study.subjectOptions() },
          { name: "description", label: "What are you studying? (optional)", placeholder: "e.g. Chapter 4 exercises" },
        ],
      });
      if (values && Study.startTimer(values.subjectId, values.description)) {
        Study.draft.subjectId = values.subjectId;
        UI.toast(`Timer started for ${Study.subject(values.subjectId).name}`, { actionLabel: "Open", onAction: () => Router.go("study") });
        if (["study", "dashboard"].includes(Router.currentId())) Router.refresh();
      }
    },
  }],

  widgets: [{ id: "study", label: "Study", span: 4, order: 30, render: (el) => Study.renderWidget(el) }],

  commands: [
    { label: "Start Pomodoro focus", icon: "timer", keywords: "pomodoro timer focus begin", run: () => { Pomodoro.start(); Router.go("study"); } },
    { label: "Pause Pomodoro", icon: "pause", keywords: "pomodoro timer stop", run: () => Pomodoro.pause() },
  ],
});
