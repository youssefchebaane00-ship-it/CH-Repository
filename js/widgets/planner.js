// =========================================================
// PLANNER: time blocking. Put tasks into your day ("Thursday 14:00–15:30:
// physics report"), next to your calendar events.
//
// A time block is { id, date, start: "14:00", end: "15:30", taskId, title }.
// Moving or deleting a block never changes the task itself.
//
// "Suggest a plan" uses simple, visible rules (no AI):
//   1. overdue tasks first, then the nearest due date, then priority
//   2. each task takes its estimated time (1 hour if it has none)
//   3. it goes into the first free slot that fits, inside your planning
//      hours, around events and existing blocks
// Nothing is added until you accept it.
// =========================================================

const Planner = {
  SLOT: 15,          // minutes: blocks snap to quarter hours
  HOUR_PX: 56,       // height of one hour in the day grid
  DEFAULT_MINUTES: 60,

  state: { date: null, suggestion: null },

  // ---------- Time helpers ("14:30" ↔ 870 minutes) ----------
  toMinutes(hhmm) {
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + m;
  },

  toTime(minutes) {
    const m = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  },

  isTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) || value === "24:00";
  },

  dayHours() {
    const s = Store.get("settings");
    return { start: this.toMinutes(s.plannerDayStart), end: this.toMinutes(s.plannerDayEnd) };
  },

  // ---------- Data ----------
  all() {
    return Store.get("timeBlocks");
  },

  blocksOn(date) {
    return this.all().filter((b) => b.date === date).sort((a, b) => a.start.localeCompare(b.start));
  },

  // Everything with a time on a day: events with a start time + blocks
  timedItems(date) {
    const events = Calendar.eventsOn(date).filter((e) => e.startTime).map((e) => ({
      kind: "event", id: e.id, title: e.title, start: this.toMinutes(e.startTime),
      end: e.endTime ? this.toMinutes(e.endTime) : this.toMinutes(e.startTime) + 60, // no end time = 1 hour
      type: e.type,
    }));
    const blocks = this.blocksOn(date).map((b) => ({ kind: "block", id: b.id, title: this.blockTitle(b), start: this.toMinutes(b.start), end: this.toMinutes(b.end), taskId: b.taskId }));
    return [...events, ...blocks].sort((a, b) => a.start - b.start);
  },

  blockTitle(block) {
    const task = block.taskId ? Tasks.all().find((t) => t.id === block.taskId) : null;
    return task ? task.title : block.title || "Time block";
  },

  // Pairs of items on a day whose times overlap
  conflicts(date) {
    const items = this.timedItems(date);
    const pairs = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].start < items[i].end && items[i].start < items[j].end) pairs.push([items[i], items[j]]);
      }
    }
    return pairs;
  },

  // Free gaps on a day inside [from, to], as [{ start, end }] in minutes
  freeSlots(date, items = this.timedItems(date)) {
    let { start: from, end: to } = this.dayHours();
    if (date === UI.dateKey()) {
      const now = new Date();
      const nowMin = Math.ceil((now.getHours() * 60 + now.getMinutes()) / this.SLOT) * this.SLOT;
      from = Math.max(from, nowMin); // never plan in the past
    }
    const slots = [];
    let cursor = from;
    for (const item of [...items].sort((a, b) => a.start - b.start)) {
      if (item.end <= cursor) continue;
      if (item.start > cursor) slots.push({ start: cursor, end: Math.min(item.start, to) });
      cursor = Math.max(cursor, item.end);
      if (cursor >= to) break;
    }
    if (cursor < to) slots.push({ start: cursor, end: to });
    return slots.filter((s) => s.end - s.start >= this.SLOT);
  },

  // First free slot of at least `minutes` on a day, or null
  firstFit(date, minutes, items) {
    const slot = this.freeSlots(date, items).find((s) => s.end - s.start >= minutes);
    return slot ? { start: slot.start, end: slot.start + minutes } : null;
  },

  // Tasks that still need time: open, and not already planned today or later
  candidates(date) {
    const today = UI.dateKey();
    const planned = new Set(this.all().filter((b) => b.taskId && b.date >= today).map((b) => b.taskId));
    const priority = (t) => (Tasks.PRIORITIES[t.priority] || Tasks.PRIORITIES.medium).rank;
    return Tasks.all()
      .filter((t) => !t.done && !planned.has(t.id))
      .sort((a, b) =>
        Number(Boolean(b.dueDate && b.dueDate < date)) - Number(Boolean(a.dueDate && a.dueDate < date)) || // overdue first
        (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||                                         // nearest deadline
        priority(a) - priority(b));                                                                         // then priority
  },

  // Build (but don't save) a plan for a day
  suggest(date) {
    let items = this.timedItems(date);
    const placed = [];
    const skipped = [];
    for (const task of this.candidates(date)) {
      if (Tasks.isBlocked(task)) { skipped.push({ task, reason: `waits for “${Tasks.blockers(task)[0].title}”` }); continue; }
      const minutes = task.estimateMinutes || this.DEFAULT_MINUTES;
      const slot = this.firstFit(date, minutes, items);
      if (!slot) {
        skipped.push({ task, reason: `no free ${UI.formatDuration(minutes * 60)} slot left${task.dueDate && task.dueDate <= date ? " (due by this day!)" : ""}` });
        continue;
      }
      placed.push({ task, start: slot.start, end: slot.end, estimated: Boolean(task.estimateMinutes) });
      items = [...items, { kind: "block", start: slot.start, end: slot.end }];
    }
    return { date, placed, skipped };
  },

  // Why a suggestion came back empty, in plain words
  emptySuggestionReason(date) {
    const { start, end } = this.dayHours();
    if (date < UI.dateKey()) return "This day is in the past. Pick today or a later day to plan.";
    if (date === UI.dateKey()) {
      const now = new Date();
      if (now.getHours() * 60 + now.getMinutes() >= end - this.SLOT) {
        return `Your planning hours (${this.toTime(start)}–${this.toTime(end)}) are over for today. Try planning tomorrow, or change the hours in Settings.`;
      }
    }
    if (!this.freeSlots(date).length) return "This day is already full between your planning hours.";
    return "None of the remaining tasks fit into the free time on this day.";
  },

  addBlock({ date, start, end, taskId = null, title = "" }) {
    const block = { id: Store.newId(), date, start, end, taskId, title: String(title).slice(0, 80), createdAt: new Date().toISOString() };
    Store.set("timeBlocks", [...this.all(), block]);
    return block;
  },

  updateBlock(id, changes) {
    Store.set("timeBlocks", this.all().map((b) => (b.id === id ? { ...b, ...changes } : b)));
    return this.all().find((b) => b.id === id);
  },

  removeBlock(id) {
    const removed = this.all().find((b) => b.id === id);
    Store.set("timeBlocks", this.all().filter((b) => b.id !== id));
    if (removed) UI.toast("Time block removed", {
      actionLabel: "Undo",
      onAction: () => { Store.set("timeBlocks", [...this.all(), removed]); Router.refresh(); },
    });
  },

  // ---------- Dialog: create or edit a block ----------
  async openBlockEditor(block = null, defaults = {}) {
    const date = block?.date || defaults.date || this.state.date || UI.dateKey();
    const task = (block?.taskId || defaults.taskId) ? Tasks.all().find((t) => t.id === (block?.taskId || defaults.taskId)) : null;
    const minutes = block ? this.toMinutes(block.end) - this.toMinutes(block.start) : task?.estimateMinutes || defaults.minutes || this.DEFAULT_MINUTES;
    const suggestedStart = block?.start || defaults.start || this.toTime(this.firstFit(date, minutes)?.start ?? this.dayHours().start);
    const values = await UI.form({
      title: block ? "Edit time block" : task ? `Schedule “${task.title.slice(0, 40)}”` : "New time block",
      submitLabel: block ? "Save changes" : "Add to plan",
      deleteLabel: block ? "Remove" : null,
      fields: [
        ...(task ? [] : [{ name: "title", label: "What will you do?", value: block?.title || "", required: true, placeholder: "e.g. Revise chapter 3" }]),
        { name: "date", label: "Day", type: "date", value: date, validate: (v) => (UI.isDateKey(v) ? "" : "Pick a valid date.") },
        { name: "start", label: "Start", type: "time", half: true, value: suggestedStart, validate: (v) => (this.isTime(v) ? "" : "Pick a start time.") },
        { name: "minutes", label: "Duration (minutes)", type: "number", half: true, min: 15, max: 720, value: String(minutes),
          validate: (v) => (/^\d+$/.test(v) && Number(v) >= 15 && Number(v) <= 720 ? "" : "Enter 15 to 720 minutes.") },
      ],
    });
    if (values === null) return null;
    if (values === "delete") { this.removeBlock(block.id); return "deleted"; }

    const end = this.toMinutes(values.start) + Number(values.minutes);
    if (end > 24 * 60) {
      UI.toast("That block would go past midnight. Choose an earlier start or a shorter duration.", { type: "error" });
      return null;
    }
    const data = { date: values.date, start: values.start, end: this.toTime(end) };
    if (!task) data.title = values.title;
    const saved = block ? this.updateBlock(block.id, data) : this.addBlock({ ...data, taskId: task?.id || null });
    const clashes = this.conflicts(saved.date).filter(([a, b]) => a.id === saved.id || b.id === saved.id);
    UI.toast(clashes.length ? `Saved, but it overlaps “${clashes[0].find((x) => x.id !== saved.id).title}”` : block ? "Time block updated" : "Added to your plan",
      { type: clashes.length ? "info" : "success" });
    return saved;
  },

  // ---------- Page ----------
  renderPage(container) {
    if (!this.state.date) this.state.date = UI.dateKey();
    container.innerHTML = `
      <div class="page-header">
        <div><h2>Planner</h2><p>Block time for your tasks around your events. Suggestions are only added when you accept them.</p></div>
        <div class="header-actions">
          <button class="btn btn-secondary" type="button" data-add-block>${icon("calendar-plus")}Add block</button>
          <button class="btn btn-primary" type="button" data-suggest>${icon("wand-sparkles")}Suggest a plan</button>
        </div>
      </div>
      <div class="month-nav">
        <button class="btn-icon" type="button" data-prev aria-label="Previous day">${icon("chevron-left")}</button>
        <h3 data-day-title aria-live="polite"></h3>
        <button class="btn-icon" type="button" data-next aria-label="Next day">${icon("chevron-right")}</button>
        <button class="btn btn-secondary compact" type="button" data-today>Today</button>
      </div>
      <div class="planner-week" data-week></div>
      <div data-suggestion></div>
      <div data-conflicts></div>
      <div class="planner-layout">
        <section class="card planner-tasks">
          <div class="card-header">
            <h3 class="card-title"><span class="card-icon">${icon("list-todo")}</span>To schedule</h3>
          </div>
          <p class="muted small">Drag a task onto the day, or press Schedule. Overdue first, then by due date.</p>
          <ul class="planner-task-list" data-candidates></ul>
        </section>
        <section class="card planner-day">
          <div data-all-day></div>
          <div class="day-grid" data-grid></div>
        </section>
      </div>`;

    const grid = container.querySelector("[data-grid]");

    const drawWeek = () => {
      const start = UI.startOfWeek(this.state.date);
      container.querySelector("[data-week]").innerHTML = Array.from({ length: 7 }, (_, i) => {
        const day = UI.addDays(start, i);
        const minutes = this.blocksOn(day).reduce((n, b) => n + this.toMinutes(b.end) - this.toMinutes(b.start), 0);
        const events = Calendar.eventsOn(day).length;
        const clash = this.conflicts(day).length;
        const classes = ["week-day-pill", day === this.state.date ? "selected" : "", day === UI.dateKey() ? "today" : ""].join(" ");
        return `
          <button type="button" class="${classes}" data-day="${day}" aria-pressed="${day === this.state.date}">
            <span>${UI.formatDay(day, { weekday: "short" })} ${UI.parseKey(day).getDate()}</span>
            <strong>${minutes ? UI.formatDuration(minutes * 60) : "–"}</strong>
            <small>${events ? `${events} event${events === 1 ? "" : "s"}` : "&nbsp;"}${clash ? ` · <span class="clash">${icon("triangle-alert")}${clash}</span>` : ""}</small>
          </button>`;
      }).join("");
    };

    const drawCandidates = () => {
      const list = this.candidates(this.state.date);
      container.querySelector("[data-candidates]").innerHTML = list.length ? list.slice(0, 30).map((t) => `
        <li class="planner-task${Tasks.isBlocked(t) ? " is-blocked" : ""}" draggable="true" data-task="${UI.escape(t.id)}">
          <span class="planner-task-grip">${icon("grip-vertical")}</span>
          <span class="planner-task-main">
            <strong>${UI.escape(t.title)}</strong>
            <span class="item-meta">${Tasks.metaHtml(t)}</span>
            ${Tasks.isOverdue(t) ? `<button type="button" class="link-button" data-due-today>${icon("calendar")}Move due date to today</button>` : ""}
          </span>
          <button class="btn btn-secondary compact" type="button" data-schedule>${icon("calendar-plus")}Schedule</button>
        </li>`).join("")
        : `<li>${UI.emptyState("circle-check", "Nothing left to schedule", "Every open task already has time planned.")}</li>`;
    };

    const drawDay = () => {
      const date = this.state.date;
      const label = UI.relativeDay(date);
      container.querySelector("[data-day-title]").textContent =
        `${label === UI.formatDay(date) ? "" : label + " · "}${UI.formatDay(date, { weekday: "long", day: "numeric", month: "long" })}`;

      const allDay = Calendar.eventsOn(date).filter((e) => !e.startTime);
      container.querySelector("[data-all-day]").innerHTML = allDay.length ? `
        <div class="all-day">${allDay.map((e) => `<span class="badge type-${(Calendar.TYPES[e.type] || Calendar.TYPES.event).color}">${icon(Calendar.TYPES[e.type]?.icon || "calendar")}All day · ${UI.escape(e.title)}</span>`).join("")}</div>` : "";

      // The visible hours: your planning hours, stretched to fit anything outside them
      const items = this.timedItems(date);
      const ghosts = this.state.suggestion?.date === date ? this.state.suggestion.placed.filter((p) => p.accept !== false) : [];
      const hours = this.dayHours();
      const first = Math.floor(Math.min(hours.start, ...items.map((i) => i.start), ...ghosts.map((g) => g.start)) / 60) * 60;
      const last = Math.ceil(Math.max(hours.end, ...items.map((i) => i.end), ...ghosts.map((g) => g.end)) / 60) * 60;
      const y = (min) => ((min - first) / 60) * this.HOUR_PX;
      const clashIds = new Set(this.conflicts(date).flat().map((i) => i.id));

      // Overlapping items sit side by side. Items are split into groups that
      // overlap each other; only those share the width, everything else is full width.
      const laneOf = new Map();
      const lanesIn = new Map(); // item id → number of lanes in its group
      let group = [], lanes = [], groupEnd = -1;
      const closeGroup = () => group.forEach((id) => lanesIn.set(id, Math.max(1, lanes.length)));
      items.forEach((item) => {
        if (item.start >= groupEnd) { closeGroup(); group = []; lanes = []; } // a new, separate group starts
        let lane = lanes.findIndex((end) => end <= item.start);
        if (lane === -1) { lane = lanes.length; lanes.push(0); }
        lanes[lane] = item.end;
        laneOf.set(item.id, lane);
        group.push(item.id);
        groupEnd = Math.max(groupEnd, item.end);
      });
      closeGroup();

      let html = `<div class="day-grid-inner" style="height:${y(last)}px" data-first="${first}">`;
      for (let m = first; m < last; m += 60) {
        html += `<div class="hour-row" style="top:${y(m)}px;height:${this.HOUR_PX}px"><span class="hour-label">${this.toTime(m)}</span></div>`;
      }
      if (date === UI.dateKey()) {
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        if (nowMin >= first && nowMin <= last) html += `<div class="now-line" style="top:${y(nowMin)}px" title="Now"></div>`;
      }
      html += items.map((item) => {
        const lane = laneOf.get(item.id);
        const laneCount = lanesIn.get(item.id);
        const style = `top:${y(item.start)}px;height:${Math.max(22, y(item.end) - y(item.start) - 2)}px;left:calc(56px + (100% - 60px) * ${lane / laneCount});width:calc((100% - 60px) / ${laneCount} - 4px)`;
        const time = `${this.toTime(item.start)}–${this.toTime(item.end)}`;
        if (item.kind === "event") {
          const type = Calendar.TYPES[item.type] || Calendar.TYPES.event;
          return `<div class="day-item event ${type.color}${clashIds.has(item.id) ? " clash" : ""}" style="${style}" data-event="${UI.escape(item.id)}" title="${UI.escape(time + " · " + item.title)}">
            <span class="day-item-time">${time}</span><strong>${UI.escape(item.title)}</strong></div>`;
        }
        const task = item.taskId ? Tasks.all().find((t) => t.id === item.taskId) : null;
        return `<div class="day-item block${task?.done ? " done" : ""}${clashIds.has(item.id) ? " clash" : ""}" style="${style}" draggable="true" data-block="${UI.escape(item.id)}" data-id="${UI.escape(item.id)}" title="${UI.escape(time + " · " + item.title)}">
          <span class="day-item-time">${time}${task ? "" : " · block"}</span><strong>${UI.escape(item.title)}</strong>
          <span class="day-item-actions">
            ${task && !task.done ? `<button class="btn-icon small" type="button" data-complete aria-label="Mark task done" title="Done">${icon("check")}</button>` : ""}
            <button class="btn-icon small" type="button" data-tomorrow aria-label="Move to the next day" title="Move to next day">${icon("arrow-right")}</button>
            <button class="btn-icon small" type="button" data-edit-block aria-label="Edit block" title="Edit">${icon("pencil")}</button>
          </span>
        </div>`;
      }).join("");
      html += ghosts.map((g) => `
        <div class="day-item ghost" style="top:${y(g.start)}px;height:${Math.max(22, y(g.end) - y(g.start) - 2)}px;left:56px;width:calc(100% - 64px)">
          <span class="day-item-time">${this.toTime(g.start)}–${this.toTime(g.end)} · suggested</span><strong>${UI.escape(g.task.title)}</strong></div>`).join("");
      html += `</div>`;
      grid.innerHTML = html;

      const clashes = this.conflicts(date);
      container.querySelector("[data-conflicts]").innerHTML = clashes.length ? `
        <div class="conflict-banner" role="alert">
          ${icon("triangle-alert")}
          <div><strong>${clashes.length} time conflict${clashes.length === 1 ? "" : "s"} on this day</strong>
            <ul>${clashes.map(([a, b]) => `<li>${UI.escape(a.title)} (${this.toTime(a.start)}–${this.toTime(a.end)}) overlaps ${UI.escape(b.title)} (${this.toTime(b.start)}–${this.toTime(b.end)})</li>`).join("")}</ul>
          </div>
        </div>` : "";
    };

    const drawSuggestion = () => {
      const s = this.state.suggestion;
      const box = container.querySelector("[data-suggestion]");
      if (!s || s.date !== this.state.date) { box.innerHTML = ""; return; }
      box.innerHTML = `
        <section class="card suggestion-card">
          <div class="card-header">
            <h3 class="card-title"><span class="card-icon violet">${icon("wand-sparkles")}</span>Suggested plan for ${UI.escape(UI.relativeDay(s.date).toLowerCase())}</h3>
          </div>
          <p class="muted small">Rules: overdue first, then nearest due date, then priority. Each task gets its estimated time (1h if none) in the first free slot between ${this.toTime(this.dayHours().start)} and ${this.toTime(this.dayHours().end)}. Untick anything you don't want.</p>
          ${s.placed.length ? `<ul class="suggestion-list">${s.placed.map((p, i) => `
            <li><label class="toggle-row">
              <input type="checkbox" data-accept="${i}" ${p.accept !== false ? "checked" : ""}>
              <span><strong>${this.toTime(p.start)}–${this.toTime(p.end)}</strong> ${UI.escape(p.task.title)}
                <span class="muted small">${p.estimated ? "" : "(1h, no estimate)"}${p.task.dueDate ? ` · due ${UI.escape(UI.relativeDay(p.task.dueDate).toLowerCase())}` : ""}</span></span>
            </label></li>`).join("")}</ul>` : `<p>${this.emptySuggestionReason(s.date)}</p>`}
          ${s.skipped.length ? `<details class="skipped"><summary>${s.skipped.length} task${s.skipped.length === 1 ? "" : "s"} not placed</summary>
            <ul>${s.skipped.map((k) => `<li>${UI.escape(k.task.title)}: ${UI.escape(k.reason)}</li>`).join("")}</ul></details>` : ""}
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" data-cancel-suggestion>Cancel</button>
            <button class="btn btn-primary" type="button" data-accept-suggestion ${s.placed.length ? "" : "disabled"}>${icon("check")}Add selected to plan</button>
          </div>
        </section>`;
    };

    const drawAll = () => { drawWeek(); drawSuggestion(); drawDay(); drawCandidates(); };
    const goTo = (date) => { this.state.date = date; if (this.state.suggestion?.date !== date) this.state.suggestion = null; drawAll(); };

    container.querySelector("[data-prev]").addEventListener("click", () => goTo(UI.addDays(this.state.date, -1)));
    container.querySelector("[data-next]").addEventListener("click", () => goTo(UI.addDays(this.state.date, 1)));
    container.querySelector("[data-today]").addEventListener("click", () => goTo(UI.dateKey()));
    container.querySelector("[data-week]").addEventListener("click", (event) => {
      const day = event.target.closest("[data-day]");
      if (day) goTo(day.dataset.day);
    });
    container.querySelector("[data-add-block]").addEventListener("click", async () => {
      if (await this.openBlockEditor(null, { date: this.state.date })) drawAll();
    });
    container.querySelector("[data-suggest]").addEventListener("click", () => {
      this.state.suggestion = this.suggest(this.state.date);
      if (!this.state.suggestion.placed.length && !this.state.suggestion.skipped.length) UI.toast("No open tasks to plan. Nice!", { type: "info" });
      drawSuggestion(); drawDay();
    });

    container.querySelector("[data-suggestion]").addEventListener("change", (event) => {
      const box = event.target.closest("[data-accept]");
      if (!box) return;
      this.state.suggestion.placed[Number(box.dataset.accept)].accept = box.checked;
      drawDay();
    });
    container.querySelector("[data-suggestion]").addEventListener("click", (event) => {
      if (event.target.closest("[data-cancel-suggestion]")) { this.state.suggestion = null; drawAll(); return; }
      if (!event.target.closest("[data-accept-suggestion]")) return;
      const chosen = this.state.suggestion.placed.filter((p) => p.accept !== false);
      chosen.forEach((p) => this.addBlock({ date: this.state.suggestion.date, start: this.toTime(p.start), end: this.toTime(p.end), taskId: p.task.id }));
      UI.toast(`${chosen.length} block${chosen.length === 1 ? "" : "s"} added to your plan`);
      this.state.suggestion = null;
      drawAll();
    });

    container.querySelector("[data-candidates]").addEventListener("click", async (event) => {
      const row = event.target.closest("[data-task]");
      if (!row) return;
      if (event.target.closest("[data-schedule]")) {
        if (await this.openBlockEditor(null, { date: this.state.date, taskId: row.dataset.task })) drawAll();
      } else if (event.target.closest("[data-due-today]")) {
        Tasks.update(row.dataset.task, { dueDate: UI.dateKey() });
        UI.toast("Due date moved to today");
        drawAll();
      }
    });

    grid.addEventListener("click", async (event) => {
      const blockEl = event.target.closest("[data-block]");
      const eventEl = event.target.closest("[data-event]");
      if (eventEl) {
        const found = Calendar.all().find((e) => e.id === eventEl.dataset.event);
        if (found && (await Calendar.openEditor(found))) drawAll();
        return;
      }
      if (!blockEl) return;
      const block = this.all().find((b) => b.id === blockEl.dataset.block);
      if (!block) return;
      if (event.target.closest("[data-complete]")) {
        Tasks.setDone(block.taskId, true);
        UI.toast("Task done ✓");
      } else if (event.target.closest("[data-tomorrow]")) {
        this.updateBlock(block.id, { date: UI.addDays(block.date, 1) });
        UI.toast("Moved to the next day");
      } else if (event.target.closest("[data-edit-block]") || !event.target.closest("button")) {
        await this.openBlockEditor(block);
      } else return;
      drawAll();
    });

    // Drag a task (from the list) or a block (on the grid) to a time
    const minuteAt = (event) => {
      const inner = grid.querySelector(".day-grid-inner");
      const rect = inner.getBoundingClientRect();
      const raw = Number(inner.dataset.first) + ((event.clientY - rect.top) / this.HOUR_PX) * 60;
      return Math.max(0, Math.min(24 * 60 - this.SLOT, Math.round(raw / this.SLOT) * this.SLOT));
    };
    container.addEventListener("dragstart", (event) => {
      const task = event.target.closest?.("[data-task]");
      const block = event.target.closest?.("[data-block]");
      if (!task && !block) return;
      event.dataTransfer.setData("text/plain", task ? `task:${task.dataset.task}` : `block:${block.dataset.block}`);
      event.dataTransfer.effectAllowed = "move";
    });
    grid.addEventListener("dragover", (event) => { event.preventDefault(); grid.classList.add("drop-target"); });
    grid.addEventListener("dragleave", (event) => { if (!grid.contains(event.relatedTarget)) grid.classList.remove("drop-target"); });
    grid.addEventListener("drop", (event) => {
      event.preventDefault();
      grid.classList.remove("drop-target");
      const [kind, id] = event.dataTransfer.getData("text/plain").split(":");
      const start = minuteAt(event);
      if (kind === "task") {
        const task = Tasks.all().find((t) => t.id === id);
        if (!task) return;
        const minutes = task.estimateMinutes || this.DEFAULT_MINUTES;
        this.addBlock({ date: this.state.date, start: this.toTime(start), end: this.toTime(Math.min(24 * 60, start + minutes)), taskId: id });
        UI.toast(`Planned at ${this.toTime(start)}`);
      } else if (kind === "block") {
        const block = this.all().find((b) => b.id === id);
        if (!block) return;
        const length = this.toMinutes(block.end) - this.toMinutes(block.start);
        this.updateBlock(id, { date: this.state.date, start: this.toTime(start), end: this.toTime(Math.min(24 * 60, start + length)) });
      }
      drawAll();
    });

    drawAll();
  },

  // ---------- Dashboard widget: today's plan ----------
  renderWidget(container) {
    const today = UI.dateKey();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const items = this.timedItems(today).filter((i) => i.end > nowMin).slice(0, 5);
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon">${icon("calendar-clock")}</span>Today's plan</h3>
        <a class="card-link" href="#/planner">Planner ${icon("chevron-right")}</a>
      </div>
      ${items.length ? `<ul class="plan-list">${items.map((i) => `
        <li class="${i.start <= nowMin ? "now" : ""}">
          <span class="plan-time">${this.toTime(i.start)}</span>
          <span class="plan-bar ${i.kind === "event" ? (Calendar.TYPES[i.type] || Calendar.TYPES.event).color : "accent"}"></span>
          <span class="plan-text"><strong>${UI.escape(i.title)}</strong><span>${i.start <= nowMin ? "Now · until " + this.toTime(i.end) : `${UI.formatDuration((i.end - i.start) * 60)}`}${i.kind === "event" ? " · event" : ""}</span></span>
        </li>`).join("")}</ul>`
      : UI.emptyState("calendar-clock", "Nothing planned for the rest of today", "Open the Planner to block time for your tasks.")}
      ${this.conflicts(today).length ? `<p class="plan-warning">${icon("triangle-alert")}${this.conflicts(today).length} time conflict(s) today</p>` : ""}`;
  },
};

// ---------------------------------------------------------
// Register the Planner module (see js/modules.js)
// ---------------------------------------------------------
Modules.register({
  id: "planner",
  order: 35,
  nav: { label: "Planner", icon: "calendar-clock" },
  page: (container) => Planner.renderPage(container),

  collections: {
    // { id, date, start: "HH:MM", end: "HH:MM", taskId, title, createdAt }
    timeBlocks: {
      default: [],
      backup: true,
      normalize: (b) => ({
        taskId: null, title: "", createdAt: null,
        ...b,
        date: UI.isDateKey(b.date) ? b.date : UI.dateKey(),
        start: Planner.isTime(b.start) ? b.start : "09:00",
        end: Planner.isTime(b.end) && b.end > (Planner.isTime(b.start) ? b.start : "09:00") ? b.end : "10:00",
      }),
    },
  },

  notifications() {
    const today = UI.dateKey();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const items = [];
    const openDay = () => { Planner.state.date = today; };
    const next = Planner.timedItems(today).find((i) => i.kind === "block" && i.start >= nowMin && i.start - nowMin <= 15);
    if (next) items.push({ tone: "accent", icon: "alarm-clock", text: `Starting soon: ${next.title}`, sub: `At ${Planner.toTime(next.start)} (time block)`, page: "planner", before: openDay, urgent: true });
    const clashes = Planner.conflicts(today).length;
    if (clashes) items.push({ tone: "amber", icon: "triangle-alert", text: `${clashes} time conflict${clashes === 1 ? "" : "s"} today`, sub: "Two things are planned at the same time", page: "planner", before: openDay });
    return items;
  },

  quickAdd: [{
    id: "block", label: "Plan a time block", icon: "calendar-plus", key: "B", order: 45,
    async run() {
      const created = await Planner.openBlockEditor(null, { date: UI.dateKey() });
      if (created && typeof created === "object") Planner.state.date = created.date;
      return { created, page: "planner", label: "Time block", onDashboard: true };
    },
  }],

  widgets: [{ id: "plan", label: "Today's plan", span: 4, order: 35, render: (el) => Planner.renderWidget(el) }],

  commands: [
    { label: "Suggest a plan for today", icon: "wand-sparkles", keywords: "planner schedule suggest plan day", run: () => { Planner.state.date = UI.dateKey(); Router.go("planner"); setTimeout(() => document.querySelector("[data-suggest]")?.click(), 50); } },
  ],
});
