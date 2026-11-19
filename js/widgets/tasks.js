// =========================================================
// TASKS: data helpers, the edit dialog, the dashboard widget
// ("Today's tasks") and the full Tasks page with filters and sorting.
// =========================================================

const Tasks = {
  PRIORITIES: {
    high: { label: "High", rank: 0 },
    medium: { label: "Medium", rank: 1 },
    low: { label: "Low", rank: 2 },
  },
  CATEGORIES: { university: "University", personal: "Personal", projects: "Projects", other: "Other" },
  FILTERS: [
    { id: "all", label: "All" },
    { id: "today", label: "Today" },
    { id: "upcoming", label: "Upcoming" },
    { id: "overdue", label: "Overdue" },
    { id: "completed", label: "Completed" },
  ],
  SORTS: { priority: "Priority", due: "Due date", created: "Newest first" },

  // What the Tasks page is showing (kept while the app is open)
  state: { filter: "all", sort: "priority", category: "all" },

  // ---------- Data helpers ----------
  all() {
    return Store.get("tasks");
  },

  isOverdue(task) {
    return !task.done && Boolean(task.dueDate) && task.dueDate < UI.dateKey();
  },

  isDueToday(task) {
    return task.dueDate === UI.dateKey();
  },

  completedToday(task) {
    return task.done && Boolean(task.completedAt) && UI.dateKey(new Date(task.completedAt)) === UI.dateKey();
  },

  // "Focus" = what belongs on today's list: overdue, due today, or no date
  isFocus(task) {
    return !task.dueDate || task.dueDate <= UI.dateKey();
  },

  matchesFilter(task, filter) {
    const today = UI.dateKey();
    switch (filter) {
      case "today": return !task.done && task.dueDate === today;
      case "upcoming": return !task.done && Boolean(task.dueDate) && task.dueDate > today;
      case "overdue": return this.isOverdue(task);
      case "completed": return task.done;
      default: return true;
    }
  },

  sort(list, by) {
    const priority = (t) => (this.PRIORITIES[t.priority] || this.PRIORITIES.medium).rank;
    const due = (t) => t.dueDate || "9999-99-99"; // no date = last
    const created = (t) => t.createdAt || "";
    const compare = {
      priority: (a, b) => priority(a) - priority(b) || due(a).localeCompare(due(b)),
      due: (a, b) => due(a).localeCompare(due(b)) || priority(a) - priority(b),
      created: (a, b) => created(b).localeCompare(created(a)),
    }[by];
    // Unfinished tasks first, then sort inside each group
    return [...list].sort((a, b) => Number(a.done) - Number(b.done) || compare(a, b));
  },

  add(title, extra = {}) {
    const clean = String(title).trim().slice(0, 200);
    if (!clean) return null;
    const task = Store.NORMALIZE.tasks({
      id: Store.newId(), title: clean, done: false,
      createdAt: new Date().toISOString(), completedAt: null,
      ...extra,
    });
    Store.set("tasks", [...this.all(), task]);
    return task;
  },

  update(id, changes) {
    Store.set("tasks", this.all().map((t) => (t.id === id ? { ...t, ...changes } : t)));
    return this.all().find((t) => t.id === id);
  },

  setDone(id, done) {
    // The Kanban column follows: done ↔ "Done" column
    const current = this.all().find((t) => t.id === id);
    const status = done ? "done" : current && current.status === "done" ? "todo" : current?.status || "todo";
    const task = this.update(id, { done, status, completedAt: done ? new Date().toISOString() : null });
    if (done && this.all().every((t) => t.done)) {
      UI.confetti();
      UI.toast("All tasks done. Amazing! 🎉");
    }
    return task;
  },

  // ---------- Dependencies ("blocked by") ----------
  // Unfinished tasks this task is waiting for (missing or finished ones don't block)
  blockers(task) {
    return task.blockedBy.map((id) => this.all().find((t) => t.id === id)).filter((t) => t && !t.done);
  },

  isBlocked(task) {
    return !task.done && this.blockers(task).length > 0;
  },

  // Would "task waits for blocker" create a loop (A waits for B, B waits for A)?
  // We follow blocker's own dependencies; if we ever reach task, it's a loop.
  createsCycle(taskId, blockerId) {
    const seen = new Set();
    const stack = [blockerId];
    while (stack.length) {
      const id = stack.pop();
      if (id === taskId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const t = this.all().find((x) => x.id === id);
      if (t) stack.push(...t.blockedBy);
    }
    return false;
  },

  // Delete with an "Undo" toast. The task goes back where it was.
  remove(id) {
    const tasks = this.all();
    const index = tasks.findIndex((t) => t.id === id);
    if (index === -1) return;
    const removed = tasks[index];
    Store.set("tasks", tasks.filter((t) => t.id !== id));
    UI.toast("Task deleted", {
      actionLabel: "Undo",
      onAction: () => {
        const current = [...this.all()];
        current.splice(index, 0, removed);
        Store.set("tasks", current);
        Router.refresh(removed.id);
      },
    });
  },

  // ---------- Edit dialog (also used to create) ----------
  // Returns the saved task, "deleted", or null if cancelled.
  async openEditor(task = null, defaults = {}, { quiet = false } = {}) {
    const t = task || { title: "", description: "", priority: "medium", category: "other", dueDate: "", tags: [], projectId: null, estimateMinutes: null, blockedBy: [], ...defaults };
    const options = (obj, getLabel) => Object.entries(obj).map(([value, v]) => ({ value, label: getLabel(v) }));

    // Projects you can put the task in, and tasks it can wait for (never itself, never a loop)
    const projectOptions = [{ value: "", label: "No project" },
      ...(typeof Projects === "undefined" ? [] : Projects.all().filter((p) => p.status !== "archived" || p.id === t.projectId)
        .map((p) => ({ value: p.id, label: p.name })))];
    const blockerOptions = [{ value: "", label: "Nothing (can start any time)" },
      ...this.all().filter((x) => !x.done && x.id !== task?.id && !(task && this.createsCycle(task.id, x.id)))
        .map((x) => ({ value: x.id, label: x.title.slice(0, 60) }))];

    const values = await UI.form({
      title: task ? "Edit task" : "New task",
      submitLabel: task ? "Save changes" : "Add task",
      deleteLabel: task ? "Delete" : null,
      fields: [
        { name: "title", label: "Title", value: t.title, required: true, placeholder: "What do you need to do?",
          validate: (v) => (v.length > 200 ? "Keep it under 200 characters." : "") },
        { name: "description", label: "Description (optional)", type: "textarea", value: t.description, placeholder: "Details, links, steps…" },
        { name: "priority", label: "Priority", type: "select", half: true, value: t.priority, options: options(this.PRIORITIES, (p) => p.label) },
        { name: "category", label: "Category", type: "select", half: true, value: t.category, options: options(this.CATEGORIES, (c) => c) },
        { name: "dueDate", label: "Due date (optional)", type: "date", half: true, value: t.dueDate || "",
          validate: (v) => (v && !UI.isDateKey(v) ? "Please pick a valid date." : "") },
        { name: "tags", label: "Tags (comma separated)", half: true, value: (t.tags || []).join(", "), placeholder: "exam, math" },
        { name: "projectId", label: "Project", type: "select", half: true, value: t.projectId || "", options: projectOptions },
        { name: "estimateMinutes", label: "Estimated time (minutes, optional)", type: "number", half: true, min: 5, max: 1440,
          value: t.estimateMinutes ? String(t.estimateMinutes) : "",
          validate: (v) => (!v || (/^\d+$/.test(v) && Number(v) >= 5 && Number(v) <= 1440) ? "" : "Enter 5 to 1440 minutes, or leave empty.") },
        { name: "blockedBy", label: "Waits for (must be finished first)", type: "select", value: t.blockedBy?.[0] || "", options: blockerOptions },
      ],
    });

    if (values === null) return null;
    if (values === "delete") {
      this.remove(task.id);
      return "deleted";
    }

    const data = {
      title: values.title.slice(0, 200),
      description: values.description.slice(0, 2000),
      priority: values.priority in this.PRIORITIES ? values.priority : "medium",
      category: values.category in this.CATEGORIES ? values.category : "other",
      dueDate: values.dueDate || null,
      tags: UI.parseTags(values.tags),
      projectId: values.projectId && typeof Projects !== "undefined" && Projects.get(values.projectId) ? values.projectId : null,
      estimateMinutes: values.estimateMinutes ? Number(values.estimateMinutes) : null,
      // Double-check the loop rule (the list could be stale if something changed meanwhile)
      blockedBy: values.blockedBy && !(task && this.createsCycle(task.id, values.blockedBy)) ? [values.blockedBy] : [],
    };
    if (task) {
      const saved = this.update(task.id, data);
      UI.toast("Task updated");
      return saved;
    }
    const created = this.add(data.title, data);
    if (!quiet) UI.toast("Task added");
    return created;
  },

  // ---------- One task row ----------
  metaHtml(task) {
    const parts = [];
    const p = this.PRIORITIES[task.priority] ? task.priority : "medium";
    parts.push(`<span class="badge priority-${p}">${icon("flag")}${this.PRIORITIES[p].label}</span>`);

    if (task.dueDate && UI.isDateKey(task.dueDate)) {
      const overdue = this.isOverdue(task);
      const today = this.isDueToday(task) && !task.done;
      const label = overdue ? `Overdue · ${UI.relativeDay(task.dueDate)}` : UI.relativeDay(task.dueDate);
      parts.push(`<span class="badge${overdue ? " overdue" : today ? " accent" : ""}">${icon(overdue ? "triangle-alert" : "calendar")}${UI.escape(label)}</span>`);
    }
    const project = typeof Projects !== "undefined" && task.projectId ? Projects.get(task.projectId) : null;
    if (project) {
      parts.push(`<span class="badge project-badge" style="--subject:${UI.escape(project.color)}"><span class="subject-dot"></span>${UI.escape(project.name)}</span>`);
    }
    if (this.isBlocked(task)) {
      parts.push(`<span class="badge blocked" title="Finish this first">${icon("lock")}Waits for: ${UI.escape(this.blockers(task)[0].title.slice(0, 40))}</span>`);
    }
    if (task.estimateMinutes) {
      parts.push(`<span class="badge">${icon("hourglass")}${UI.escape(UI.formatDuration(task.estimateMinutes * 60))}</span>`);
    }
    if (task.category && task.category !== "other") {
      parts.push(`<span class="badge">${icon("folder")}${UI.escape(this.CATEGORIES[task.category] || task.category)}</span>`);
    }
    task.tags.slice(0, 3).forEach((tag) => parts.push(`<span class="badge tag">#${UI.escape(tag)}</span>`));
    return parts.join("");
  },

  // onChange() is called after a change, so the page can update its counters
  createRow(task, onChange = () => {}) {
    const row = UI.html(`
      <li class="item task-item${task.done ? " done" : ""}${this.isOverdue(task) ? " is-overdue" : ""}" data-id="${UI.escape(task.id)}">
        <input type="checkbox" ${task.done ? "checked" : ""} aria-label="Mark “${UI.escape(task.title)}” as done">
        <button class="item-main" type="button" title="Edit task">
          <span class="item-label">${UI.escape(task.title)}</span>
          ${task.description ? `<span class="item-desc">${UI.escape(task.description)}</span>` : ""}
          <span class="item-meta">${this.metaHtml(task)}</span>
        </button>
        <div class="item-actions">
          <button class="btn-icon small" type="button" data-edit aria-label="Edit task" title="Edit">${icon("pencil")}</button>
          <button class="btn-icon small danger" type="button" data-delete aria-label="Delete task" title="Delete">${icon("trash-2")}</button>
        </div>
      </li>`);

    const checkbox = row.querySelector("input");
    checkbox.addEventListener("change", () => {
      const saved = this.setDone(task.id, checkbox.checked);
      row.classList.toggle("done", checkbox.checked);
      row.classList.toggle("is-overdue", this.isOverdue(saved));
      row.querySelector(".item-meta").innerHTML = this.metaHtml(saved);
      if (checkbox.checked) UI.replayAnimation(checkbox, "pop");
      onChange();
    });

    const edit = async () => {
      const current = this.all().find((t) => t.id === task.id);
      if (!current) return;
      const result = await this.openEditor(current);
      if (result) onChange(result === "deleted" ? null : result);
    };
    row.querySelector(".item-main").addEventListener("click", edit);
    row.querySelector("[data-edit]").addEventListener("click", edit);

    const deleteButton = row.querySelector("[data-delete]");
    deleteButton.addEventListener("click", () => {
      deleteButton.disabled = true;
      UI.removeWithAnimation(row, () => {
        row.remove();
        this.remove(task.id);
        onChange(null);
      });
    });

    return row;
  },

  // ---------- Dashboard widget: Today's tasks ----------
  renderWidget(container) {
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon">${icon("list-todo")}</span>Today's tasks</h3>
        <span class="badge accent" data-stat="tasksLeft"></span>
        <a class="card-link" href="#/tasks">View all ${icon("chevron-right")}</a>
      </div>
      <form class="add-form" data-add-form>
        <input class="input" type="text" placeholder="Add a task for today and press Enter…" maxlength="200"
               aria-label="New task" autocomplete="off">
        <button class="btn btn-primary" type="submit" aria-label="Add task">${icon("plus")}</button>
      </form>
      <ul class="item-list" data-list></ul>
      <div data-empty></div>`;

    const list = container.querySelector("[data-list]");
    const empty = container.querySelector("[data-empty]");

    const draw = () => {
      const visible = this.sort(this.all().filter((t) => (!t.done && this.isFocus(t)) || this.completedToday(t)), "priority");
      list.innerHTML = "";
      visible.forEach((t) => list.appendChild(this.createRow(t, onChange)));
      updateEmpty();
    };
    const updateEmpty = () => {
      empty.innerHTML = list.children.length ? ""
        : UI.emptyState("circle-check", "Nothing left for today", "Add a task above, or enjoy your free time.");
    };
    // After an edit the task may no longer belong here (e.g. moved to next week), so redraw
    const onChange = (changed) => { if (changed === undefined) updateEmpty(); else draw(); };

    container.querySelector("[data-add-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.target.querySelector("input");
      const task = this.add(input.value, { dueDate: UI.dateKey() });
      if (!task) return;
      const row = this.createRow(task, onChange);
      row.classList.add("entering");
      list.prepend(row);
      updateEmpty();
      input.value = "";
    });

    draw();
  },

  // ---------- Full Tasks page ----------
  renderPage(container) {
    container.innerHTML = `
      <div class="page-header">
        <div><h2>Tasks</h2><p>Plan, prioritize and finish what matters.</p></div>
        <button class="btn btn-primary" type="button" data-new>${icon("plus")}New task</button>
      </div>

      <section class="card task-summary">
        <div class="task-summary-text">
          <strong data-summary-title></strong>
          <span class="muted" data-summary-sub></span>
        </div>
        <div class="progress-track"><div class="progress-bar" data-summary-bar></div></div>
      </section>

      <section class="card">
        <div class="toolbar">
          <div class="filter-tabs" role="tablist" aria-label="Filter tasks" data-filters></div>
          <div class="toolbar-right">
            <label class="select-wrap" title="Category">
              ${icon("folder")}
              <select class="input compact" data-category aria-label="Filter by category">
                <option value="all">All categories</option>
                ${Object.entries(this.CATEGORIES).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
              </select>
            </label>
            <label class="select-wrap" title="Sort">
              ${icon("arrow-up-down")}
              <select class="input compact" data-sort aria-label="Sort tasks">
                ${Object.entries(this.SORTS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
              </select>
            </label>
          </div>
        </div>
        <form class="add-form" data-add-form>
          <input class="input" type="text" placeholder="Quick add: type a task and press Enter (open “New task” for details)"
                 maxlength="200" aria-label="New task" autocomplete="off">
          <button class="btn btn-primary" type="submit" aria-label="Add task">${icon("plus")}</button>
        </form>
        <ul class="item-list" data-list></ul>
        <div data-empty></div>
      </section>`;

    const list = container.querySelector("[data-list]");
    const empty = container.querySelector("[data-empty]");
    const filters = container.querySelector("[data-filters]");
    const categorySelect = container.querySelector("[data-category]");
    const sortSelect = container.querySelector("[data-sort]");
    categorySelect.value = this.state.category;
    sortSelect.value = this.state.sort;

    const inCategory = (t) => this.state.category === "all" || t.category === this.state.category;

    // Filter tabs with live counts
    const drawFilters = () => {
      filters.innerHTML = this.FILTERS.map((f) => {
        const count = this.all().filter((t) => inCategory(t) && this.matchesFilter(t, f.id)).length;
        const selected = f.id === this.state.filter;
        return `<button type="button" role="tab" aria-selected="${selected}" data-filter="${f.id}"
                  class="${f.id === "overdue" && count ? "has-overdue" : ""}">${f.label}<span class="count">${count}</span></button>`;
      }).join("");
    };

    const drawSummary = () => {
      const tasks = this.all();
      const done = tasks.filter((t) => t.done).length;
      const overdue = tasks.filter((t) => this.isOverdue(t)).length;
      const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
      container.querySelector("[data-summary-title]").textContent =
        tasks.length ? `${done} of ${tasks.length} tasks completed (${percent}%)` : "No tasks yet";
      container.querySelector("[data-summary-sub]").textContent =
        overdue ? `${overdue} overdue: check the Overdue tab` : tasks.length ? "Nothing overdue. Nice!" : "Create your first task to get started.";
      const bar = container.querySelector("[data-summary-bar]");
      bar.style.width = `${percent}%`;
      bar.classList.toggle("complete", tasks.length > 0 && percent === 100);
    };

    const emptyMessages = {
      all: ["inbox", "No tasks yet", "Click “New task” or type one above."],
      today: ["circle-check", "Nothing due today", "Tasks with today's due date appear here."],
      upcoming: ["calendar", "Nothing upcoming", "Tasks with a future due date appear here."],
      overdue: ["circle-check", "Nothing overdue", "You're on top of things!"],
      completed: ["list-todo", "No completed tasks yet", "Tick a task to see it here."],
    };

    const drawList = () => {
      const visible = this.sort(this.all().filter((t) => inCategory(t) && this.matchesFilter(t, this.state.filter)), this.state.sort);
      list.innerHTML = "";
      visible.forEach((t) => list.appendChild(this.createRow(t, onChange)));
      updateEmpty();
    };
    const updateEmpty = () => {
      empty.innerHTML = list.children.length ? "" : UI.emptyState(...emptyMessages[this.state.filter]);
    };
    // Ticking only updates the counters (the row stays visible until you switch tabs);
    // an edit or delete redraws the list so it matches the filter.
    const onChange = (changed) => {
      drawFilters();
      drawSummary();
      if (changed === undefined) updateEmpty();
      else drawList();
    };
    const drawAll = () => { drawFilters(); drawSummary(); drawList(); };

    filters.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-filter]");
      if (!tab) return;
      this.state.filter = tab.dataset.filter;
      drawFilters();
      drawList();
    });
    categorySelect.addEventListener("change", () => { this.state.category = categorySelect.value; drawAll(); });
    sortSelect.addEventListener("change", () => { this.state.sort = sortSelect.value; drawList(); });

    container.querySelector("[data-new]").addEventListener("click", async () => {
      const defaults = this.state.filter === "today" ? { dueDate: UI.dateKey() } : {};
      if (this.state.category !== "all") defaults.category = this.state.category;
      const task = await this.openEditor(null, defaults);
      if (task) {
        drawAll();
        const row = list.querySelector(`[data-id="${CSS.escape(task.id)}"]`);
        if (row) UI.highlight(row);
      }
    });

    container.querySelector("[data-add-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.target.querySelector("input");
      const extra = {};
      if (this.state.filter === "today") extra.dueDate = UI.dateKey();
      if (this.state.category !== "all") extra.category = this.state.category;
      const task = this.add(input.value, extra);
      if (!task) return;
      input.value = "";
      if (!this.matchesFilter(task, this.state.filter)) this.state.filter = "all"; // make sure you can see it
      drawAll();
      const row = list.querySelector(`[data-id="${CSS.escape(task.id)}"]`);
      if (row) UI.replayAnimation(row, "entering");
    });

    drawAll();
  },
};

// ---------------------------------------------------------
// Register the Tasks module (see js/modules.js)
// ---------------------------------------------------------
Modules.register({
  id: "tasks",
  order: 20,
  nav: { label: "Tasks", icon: "square-check-big" },
  page: (container) => Tasks.renderPage(container),

  collections: {
    // { id, title, description, priority, dueDate, category, tags, done, createdAt, completedAt }
    tasks: {
      default: [],
      backup: true,
      normalize: (t) => ({
        description: "", priority: "medium", dueDate: null, category: "other",
        done: false, createdAt: null, completedAt: null,
        projectId: null, estimateMinutes: null,
        ...t,
        tags: Array.isArray(t.tags) ? t.tags : [],
        blockedBy: Array.isArray(t.blockedBy) ? t.blockedBy.filter((id) => typeof id === "string") : [],
        // Kanban column: always "done" for finished tasks; otherwise "todo" or "doing"
        status: t.done ? "done" : t.status === "doing" ? "doing" : "todo",
      }),
    },
  },

  search(q, has) {
    const tasks = Tasks.all().filter((t) => has(t.title) || has(t.description) || t.tags.some(has)).slice(0, 6);
    return {
      label: "Tasks",
      items: tasks.map((t) => ({
        text: t.title, icon: t.done ? "circle-check" : "square-check-big", page: "tasks", id: t.id,
        hint: t.done ? "Done" : t.dueDate ? UI.relativeDay(t.dueDate) : "",
        before: () => { Tasks.state.filter = "all"; Tasks.state.category = "all"; }, // make sure it's visible
      })),
    };
  },

  notifications() {
    const today = UI.dateKey();
    const items = [];
    const overdue = Tasks.all().filter((t) => Tasks.isOverdue(t)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const showAll = () => { Tasks.state.filter = "all"; Tasks.state.category = "all"; };
    overdue.slice(0, 5).forEach((t) => items.push({
      tone: "danger", icon: "triangle-alert", text: t.title, sub: `Overdue · was due ${UI.relativeDay(t.dueDate).toLowerCase()}`,
      page: "tasks", id: t.id, urgent: true, before: showAll,
    }));
    if (overdue.length > 5) items.push({
      tone: "danger", icon: "triangle-alert", text: `${overdue.length - 5} more overdue tasks`, sub: "Open the Overdue tab",
      page: "tasks", urgent: true, before: () => { Tasks.state.filter = "overdue"; Tasks.state.category = "all"; },
    });
    Tasks.all().filter((t) => !t.done && t.dueDate === today).forEach((t) => items.push({
      tone: "accent", icon: "list-todo", text: t.title, sub: "Task due today", page: "tasks", id: t.id, urgent: true, before: showAll,
    }));
    return items;
  },

  quickAdd: [{
    id: "task", label: "New task", icon: "square-check-big", key: "T", order: 10,
    async run() {
      const created = await Tasks.openEditor(null, {}, { quiet: true });
      if (created && typeof created === "object") { Tasks.state.filter = "all"; Tasks.state.category = "all"; }
      return { created, page: "tasks", label: "Task", onDashboard: true };
    },
  }],

  widgets: [{ id: "tasks", label: "Today's tasks", span: 7, order: 10, render: (el) => Tasks.renderWidget(el) }],
});
