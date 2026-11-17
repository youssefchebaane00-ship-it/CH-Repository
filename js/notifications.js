// =========================================================
// NOTIFICATIONS: the bell in the top bar.
// These are live reminders built from your data (not stored messages),
// so they disappear by themselves once you deal with them.
// =========================================================

const Notifications = {
  collect() {
    const today = UI.dateKey();
    const tomorrow = UI.addDays(today, 1);
    const items = [];

    const overdue = Tasks.all().filter((t) => Tasks.isOverdue(t)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    overdue.slice(0, 5).forEach((t) => items.push({
      tone: "danger", icon: "triangle-alert", text: t.title, sub: `Overdue · was due ${UI.relativeDay(t.dueDate).toLowerCase()}`, page: "tasks", id: t.id, urgent: true,
    }));
    if (overdue.length > 5) items.push({ tone: "danger", icon: "triangle-alert", text: `${overdue.length - 5} more overdue tasks`, sub: "Open the Overdue tab", page: "tasks", filter: "overdue", urgent: true });

    Tasks.all().filter((t) => !t.done && t.dueDate === today).forEach((t) => items.push({
      tone: "accent", icon: "list-todo", text: t.title, sub: "Task due today", page: "tasks", id: t.id, urgent: true,
    }));

    Calendar.upcoming(50).filter((e) => e.date === today).forEach((e) => items.push({
      tone: "violet", icon: Calendar.TYPES[e.type]?.icon || "calendar", text: e.title, sub: `Today · ${Calendar.timeLabel(e)}`, page: "calendar", id: e.id, date: e.date, urgent: true,
    }));
    Calendar.all().filter((e) => e.date === tomorrow).sort(Calendar.byTime).forEach((e) => items.push({
      tone: "sky", icon: Calendar.TYPES[e.type]?.icon || "calendar", text: e.title, sub: `Tomorrow · ${Calendar.timeLabel(e)}`, page: "calendar", id: e.id, date: e.date,
    }));

    // Running timers (not urgent, just a reminder they're on)
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

    const habitsLeft = Habits.all().filter((h) => !Habits.doneForToday(h));
    if (habitsLeft.length) items.push({
      tone: "amber", icon: "flame", text: `${habitsLeft.length} habit${habitsLeft.length === 1 ? "" : "s"} left today`,
      sub: habitsLeft.slice(0, 3).map((h) => h.name).join(", "), page: "habits",
    });

    return items;
  },

  init() {
    const button = document.getElementById("notifications-button");
    const panel = document.getElementById("notifications-panel");

    button.addEventListener("click", () => {
      const open = panel.hidden;
      if (open) this.renderPanel();
      panel.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
    });

    panel.addEventListener("click", (event) => {
      const item = event.target.closest("[data-index]");
      if (!item) return;
      const target = this.lastItems[Number(item.dataset.index)];
      this.close();
      if (target.page === "tasks") {
        Tasks.state.filter = target.filter || "all";
        Tasks.state.category = "all";
      }
      if (target.page === "calendar" && target.date) {
        Calendar.state.selected = target.date;
        Calendar.state.cursor = target.date;
      }
      Router.go(target.page, target.id || null);
    });

    this.refresh();
  },

  lastItems: [],

  // Update the red counter on the bell (urgent items only)
  refresh() {
    const items = this.collect();
    const urgent = items.filter((i) => i.urgent).length;
    const button = document.getElementById("notifications-button");
    button.innerHTML = `${icon("bell")}${urgent ? `<span class="bell-count">${urgent > 9 ? "9+" : urgent}</span>` : ""}`;
    const label = urgent ? `Notifications: ${urgent} need attention` : "Notifications";
    button.setAttribute("aria-label", label);
    button.title = label;
    if (!document.getElementById("notifications-panel").hidden) this.renderPanel();
  },

  renderPanel() {
    const items = this.collect();
    this.lastItems = items;
    document.getElementById("notifications-panel").innerHTML = `
      <div class="dropdown-title">Notifications</div>
      ${items.length ? items.map((item, i) => `
        <button class="menu-item notification" type="button" data-index="${i}">
          <span class="card-icon ${item.tone === "danger" ? "rose" : item.tone === "accent" ? "" : item.tone}">${icon(item.icon)}</span>
          <span class="notification-text">
            <strong>${UI.escape(item.text)}</strong>
            <span>${UI.escape(item.sub)}</span>
          </span>
        </button>`).join("")
      : `<div class="search-empty">${icon("circle-check")} You're all caught up!</div>`}`;
  },

  close() {
    document.getElementById("notifications-panel").hidden = true;
    document.getElementById("notifications-button").setAttribute("aria-expanded", "false");
  },
};
