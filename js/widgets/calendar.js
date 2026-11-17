// =========================================================
// CALENDAR: events (with types), month view, week view, day agenda,
// and the "Upcoming" widget on the dashboard.
// Tasks with a due date also appear on their day.
// =========================================================

const Calendar = {
  TYPES: {
    event: { label: "Event", color: "accent", icon: "calendar" },
    deadline: { label: "Deadline", color: "rose", icon: "alarm-clock" },
    exam: { label: "Exam", color: "violet", icon: "graduation-cap" },
    personal: { label: "Personal", color: "emerald", icon: "user" },
  },

  // What the calendar page is showing
  state: { view: "month", cursor: null, selected: null },

  // ---------- Data helpers ----------
  all() {
    return Store.get("events");
  },

  byTime(a, b) {
    return (a.startTime || "").localeCompare(b.startTime || "") || a.title.localeCompare(b.title);
  },

  eventsOn(key) {
    return this.all().filter((e) => e.date === key).sort(this.byTime);
  },

  tasksOn(key) {
    return Tasks.all().filter((t) => t.dueDate === key);
  },

  timeLabel(event) {
    if (!event.startTime) return "All day";
    return event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime;
  },

  // Events that haven't finished yet, soonest first
  upcoming(limit = 5) {
    const today = UI.dateKey();
    const now = new Date().toTimeString().slice(0, 5); // "14:05"
    return this.all()
      .filter((e) => e.date > today || (e.date === today && (!(e.endTime || e.startTime) || (e.endTime || e.startTime) >= now)))
      .sort((a, b) => a.date.localeCompare(b.date) || this.byTime(a, b))
      .slice(0, limit);
  },

  // ---------- Create / edit dialog ----------
  async openEditor(event = null, defaults = {}, { quiet = false } = {}) {
    const e = event || { title: "", description: "", date: UI.dateKey(), startTime: "", endTime: "", type: "event", ...defaults };
    const values = await UI.form({
      title: event ? "Edit event" : "New event",
      submitLabel: event ? "Save changes" : "Add event",
      deleteLabel: event ? "Delete" : null,
      fields: [
        { name: "title", label: "Title", value: e.title, required: true, placeholder: "e.g. Physics exam",
          validate: (v) => (v.length > 120 ? "Keep it under 120 characters." : "") },
        { name: "type", label: "Type", type: "select", half: true, value: e.type,
          options: Object.entries(this.TYPES).map(([value, t]) => ({ value, label: t.label })) },
        { name: "date", label: "Date", type: "date", half: true, value: e.date, required: true,
          validate: (v) => (UI.isDateKey(v) ? "" : "Please pick a valid date.") },
        { name: "startTime", label: "Start time (optional)", type: "time", half: true, value: e.startTime },
        { name: "endTime", label: "End time (optional)", type: "time", half: true, value: e.endTime },
        { name: "description", label: "Description (optional)", type: "textarea", value: e.description, placeholder: "Room, notes, what to bring…" },
      ],
    });

    if (values === null) return null;
    if (values === "delete") {
      const ok = await UI.confirm({ title: "Delete this event?", message: `“${event.title}” will be removed from your calendar.` });
      if (!ok) return null;
      Store.set("events", this.all().filter((x) => x.id !== event.id));
      UI.toast("Event deleted");
      return "deleted";
    }

    // Time problems: show a message and reopen the dialog with what was typed
    const timeError = values.endTime && !values.startTime ? "Add a start time, or clear the end time."
      : values.startTime && values.endTime && values.endTime < values.startTime ? "The end time must be after the start time."
      : "";
    if (timeError) {
      UI.toast(timeError, { type: "error" });
      return event ? this.openEditor({ ...event, ...values }) : this.openEditor(null, values, { quiet });
    }

    const data = {
      title: values.title.slice(0, 120),
      type: values.type in this.TYPES ? values.type : "event",
      date: values.date,
      startTime: values.startTime,
      endTime: values.endTime,
      description: values.description.slice(0, 2000),
    };

    if (event) {
      Store.set("events", this.all().map((x) => (x.id === event.id ? { ...x, ...data } : x)));
      UI.toast("Event updated");
      return { ...event, ...data };
    }
    const created = { id: Store.newId(), ...data };
    Store.set("events", [...this.all(), created]);
    if (!quiet) UI.toast("Event added");
    return created;
  },

  // ---------- Small pieces of HTML ----------
  chipHtml(event) {
    const type = this.TYPES[event.type] || this.TYPES.event;
    return `<button type="button" class="cal-chip ${type.color}" data-event="${UI.escape(event.id)}" title="${UI.escape(this.timeLabel(event) + " · " + event.title)}">
      ${event.startTime ? `<span class="cal-chip-time">${event.startTime}</span>` : ""}<span class="cal-chip-text">${UI.escape(event.title)}</span></button>`;
  },

  taskChipHtml(task) {
    return `<button type="button" class="cal-chip task${task.done ? " done" : ""}" data-task="${UI.escape(task.id)}" title="Task: ${UI.escape(task.title)}">
      ${icon(task.done ? "circle-check" : "circle")}<span class="cal-chip-text">${UI.escape(task.title)}</span></button>`;
  },

  agendaEventHtml(event) {
    const type = this.TYPES[event.type] || this.TYPES.event;
    return `
      <li class="agenda-item" data-id="${UI.escape(event.id)}">
        <button type="button" class="agenda-main" data-event="${UI.escape(event.id)}">
          <span class="agenda-time">${UI.escape(this.timeLabel(event))}</span>
          <span class="agenda-bar ${type.color}"></span>
          <span class="agenda-text">
            <strong>${UI.escape(event.title)}</strong>
            ${event.description ? `<span>${UI.escape(event.description)}</span>` : ""}
          </span>
          <span class="badge type-${type.color}">${icon(type.icon)}${type.label}</span>
        </button>
      </li>`;
  },

  // ---------- Dashboard widget ----------
  renderWidget(container) {
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon violet">${icon("calendar-clock")}</span>Upcoming events</h3>
        <button class="btn-icon small" type="button" data-new aria-label="Add event" title="Add event">${icon("plus")}</button>
        <a class="card-link" href="#/calendar">Calendar ${icon("chevron-right")}</a>
      </div>
      <ul class="upcoming-list" data-list></ul>`;

    const list = container.querySelector("[data-list]");
    const draw = () => {
      const events = this.upcoming(5);
      list.innerHTML = events.length ? events.map((e) => {
        const type = this.TYPES[e.type] || this.TYPES.event;
        const day = UI.parseKey(e.date);
        return `
          <li>
            <button type="button" class="upcoming-item" data-event="${UI.escape(e.id)}" data-id="${UI.escape(e.id)}">
              <span class="date-tile ${type.color}">
                <small>${day.toLocaleDateString(undefined, { month: "short" })}</small>${day.getDate()}
              </span>
              <span class="upcoming-text">
                <strong>${UI.escape(e.title)}</strong>
                <span>${UI.escape(UI.relativeDay(e.date))} · ${UI.escape(this.timeLabel(e))} · ${type.label}</span>
              </span>
            </button>
          </li>`;
      }).join("")
        : `<li>${UI.emptyState("calendar", "Nothing planned", "Add events, exams and deadlines to see them here.")}</li>`;
    };

    list.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-event]");
      if (!button) return;
      const found = this.all().find((e) => e.id === button.dataset.event);
      if (found && (await this.openEditor(found))) draw();
    });
    container.querySelector("[data-new]").addEventListener("click", async () => {
      if (await this.openEditor()) draw();
    });

    draw();
  },

  // ---------- Calendar page ----------
  renderPage(container) {
    const today = UI.dateKey();
    if (!this.state.cursor) this.state.cursor = today;
    if (!this.state.selected) this.state.selected = today;

    container.innerHTML = `
      <div class="page-header">
        <div><h2>Calendar</h2><p>Events, exams, deadlines and task due dates.</p></div>
        <button class="btn btn-primary" type="button" data-new>${icon("plus")}New event</button>
      </div>
      <div class="calendar-layout">
        <section class="card calendar-card">
          <div class="toolbar cal-toolbar">
            <div class="cal-nav">
              <button class="btn-icon" type="button" data-prev aria-label="Previous">${icon("chevron-left")}</button>
              <button class="btn btn-secondary compact" type="button" data-today>Today</button>
              <button class="btn-icon" type="button" data-next aria-label="Next">${icon("chevron-right")}</button>
              <h3 class="cal-title" data-title aria-live="polite"></h3>
            </div>
            <div class="segmented" role="group" aria-label="Calendar view" data-views>
              <button type="button" data-value="month">${icon("calendar-days")}Month</button>
              <button type="button" data-value="week">${icon("calendar-range")}Week</button>
            </div>
          </div>
          <div data-grid></div>
        </section>

        <section class="card agenda-card">
          <div class="card-header">
            <h3 class="card-title"><span class="card-icon">${icon("calendar-check")}</span><span data-agenda-title></span></h3>
            <button class="btn-icon small" type="button" data-add-here aria-label="Add event on this day" title="Add event on this day">${icon("plus")}</button>
          </div>
          <div data-agenda></div>
        </section>
      </div>`;

    const grid = container.querySelector("[data-grid]");
    const agenda = container.querySelector("[data-agenda]");
    const weekdayNames = Array.from({ length: 7 }, (_, i) =>
      UI.parseKey(UI.addDays("2024-01-01", i)).toLocaleDateString(undefined, { weekday: "short" })); // 2024-01-01 was a Monday

    const drawMonth = () => {
      const cursor = UI.parseKey(this.state.cursor);
      const firstOfMonth = UI.dateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
      const start = UI.startOfWeek(firstOfMonth);
      container.querySelector("[data-title]").textContent = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

      let cells = "";
      for (let i = 0; i < 42; i++) {   // always 6 weeks, so the grid never jumps in height
        const key = UI.addDays(start, i);
        const date = UI.parseKey(key);
        const items = [...this.eventsOn(key).map((e) => this.chipHtml(e)), ...this.tasksOn(key).map((t) => this.taskChipHtml(t))];
        const classes = ["cal-cell"];
        if (date.getMonth() !== cursor.getMonth()) classes.push("other-month");
        if (key === today) classes.push("today");
        if (key === this.state.selected) classes.push("selected");
        cells += `
          <div class="${classes.join(" ")}" data-day="${key}" role="gridcell">
            <button type="button" class="cal-day-number" data-select="${key}" aria-label="${UI.formatDay(key, { weekday: "long", day: "numeric", month: "long" })}">${date.getDate()}</button>
            <div class="cal-items">${items.slice(0, 3).join("")}${items.length > 3 ? `<button type="button" class="cal-more" data-select="${key}">+${items.length - 3} more</button>` : ""}</div>
            ${items.length ? `<span class="cal-dot" aria-hidden="true"></span>` : ""}
          </div>`;
      }
      grid.innerHTML = `
        <div class="cal-month" role="grid">
          ${weekdayNames.map((n) => `<div class="cal-weekday">${n}</div>`).join("")}
          ${cells}
        </div>`;
    };

    const drawWeek = () => {
      const start = UI.startOfWeek(this.state.cursor);
      const end = UI.addDays(start, 6);
      container.querySelector("[data-title]").textContent =
        `${UI.formatDay(start, { day: "numeric", month: "short" })} – ${UI.formatDay(end, { day: "numeric", month: "short", year: "numeric" })}`;

      let columns = "";
      for (let i = 0; i < 7; i++) {
        const key = UI.addDays(start, i);
        const items = [...this.eventsOn(key).map((e) => this.chipHtml(e)), ...this.tasksOn(key).map((t) => this.taskChipHtml(t))];
        const classes = ["cal-week-day"];
        if (key === today) classes.push("today");
        if (key === this.state.selected) classes.push("selected");
        columns += `
          <div class="${classes.join(" ")}" data-day="${key}">
            <button type="button" class="cal-week-head" data-select="${key}">
              <span>${weekdayNames[i]}</span><strong>${UI.parseKey(key).getDate()}</strong>
            </button>
            <div class="cal-items">${items.join("") || `<span class="cal-free">Free</span>`}</div>
          </div>`;
      }
      grid.innerHTML = `<div class="cal-week">${columns}</div>`;
    };

    const drawAgenda = () => {
      const key = this.state.selected;
      container.querySelector("[data-agenda-title]").textContent =
        `${UI.relativeDay(key) === UI.formatDay(key) ? "" : UI.relativeDay(key) + " · "}${UI.formatDay(key, { weekday: "long", day: "numeric", month: "long" })}`;
      const events = this.eventsOn(key);
      const tasks = this.tasksOn(key);

      agenda.innerHTML = `
        ${events.length ? `<ul class="agenda-list">${events.map((e) => this.agendaEventHtml(e)).join("")}</ul>` : ""}
        ${tasks.length ? `
          <p class="agenda-section">Tasks due</p>
          <ul class="item-list" data-agenda-tasks></ul>` : ""}
        ${!events.length && !tasks.length ? UI.emptyState("calendar", "Nothing on this day", "Click + to add an event, or give a task this due date.") : ""}`;

      const taskList = agenda.querySelector("[data-agenda-tasks]");
      // Ticking a task only redraws the grid; editing/deleting redraws the agenda too
      if (taskList) tasks.forEach((t) => taskList.appendChild(Tasks.createRow(t, (changed) => (changed === undefined ? drawGrid() : drawAll()))));
    };

    const drawGrid = () => (this.state.view === "month" ? drawMonth() : drawWeek());
    const drawAll = () => {
      container.querySelectorAll("[data-views] button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === this.state.view)));
      drawGrid();
      drawAgenda();
    };

    const move = (direction) => {
      if (this.state.view === "month") {
        const c = UI.parseKey(this.state.cursor);
        this.state.cursor = UI.dateKey(new Date(c.getFullYear(), c.getMonth() + direction, 1));
      } else {
        this.state.cursor = UI.addDays(this.state.cursor, 7 * direction);
      }
      drawGrid();
    };

    container.querySelector("[data-prev]").addEventListener("click", () => move(-1));
    container.querySelector("[data-next]").addEventListener("click", () => move(1));
    container.querySelector("[data-today]").addEventListener("click", () => {
      this.state.cursor = UI.dateKey();
      this.state.selected = UI.dateKey();
      drawAll();
    });
    container.querySelector("[data-views]").addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      this.state.view = button.dataset.value;
      this.state.cursor = this.state.selected; // keep the selected day in view
      drawAll();
    });

    const openEvent = async (id) => {
      const found = this.all().find((e) => e.id === id);
      if (found && (await this.openEditor(found))) drawAll();
    };
    const openTask = async (id) => {
      const found = Tasks.all().find((t) => t.id === id);
      if (found && (await Tasks.openEditor(found))) drawAll();
    };
    const addEvent = async (date) => {
      const created = await this.openEditor(null, { date });
      if (created) {
        this.state.selected = created.date;
        this.state.cursor = created.date;
        drawAll();
      }
    };

    // One click listener for the whole grid ("event delegation"):
    // we look at what was clicked instead of adding a listener to every cell.
    grid.addEventListener("click", (event) => {
      const eventChip = event.target.closest("[data-event]");
      const taskChip = event.target.closest("[data-task]");
      const select = event.target.closest("[data-select]");
      const cell = event.target.closest("[data-day]");
      if (eventChip) return openEvent(eventChip.dataset.event);
      if (taskChip) return openTask(taskChip.dataset.task);
      const key = select ? select.dataset.select : cell?.dataset.day;
      if (!key) return;
      this.state.selected = key;
      drawGrid();
      drawAgenda();
    });
    grid.addEventListener("dblclick", (event) => {
      const cell = event.target.closest("[data-day]");
      if (cell && !event.target.closest("[data-event], [data-task]")) addEvent(cell.dataset.day);
    });
    agenda.addEventListener("click", (event) => {
      const eventButton = event.target.closest("[data-event]");
      if (eventButton) openEvent(eventButton.dataset.event);
    });

    container.querySelector("[data-new]").addEventListener("click", () => addEvent(this.state.selected));
    container.querySelector("[data-add-here]").addEventListener("click", () => addEvent(this.state.selected));

    drawAll();
  },
};
