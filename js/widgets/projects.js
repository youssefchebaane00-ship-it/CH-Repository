// =========================================================
// PROJECTS: group tasks into projects, with a Kanban board
// (To do → Doing → Done), milestones, notes and resource links.
//
// A project's tasks are ordinary tasks with a projectId, so they also
// appear on the Tasks page, the calendar, the planner and in analytics.
// =========================================================

const Projects = {
  STATUSES: { active: "Active", completed: "Completed", archived: "Archived" },
  COLUMNS: [
    { id: "todo", label: "To do", icon: "circle" },
    { id: "doing", label: "Doing", icon: "hourglass" },
    { id: "done", label: "Done", icon: "circle-check" },
  ],

  state: { selectedId: null, tab: "board", filter: "active" },

  // ---------- Data helpers ----------
  all() {
    return Store.get("projects");
  },

  get(id) {
    return this.all().find((p) => p.id === id) || null;
  },

  tasksOf(projectId) {
    return Tasks.all().filter((t) => t.projectId === projectId);
  },

  progress(project) {
    const tasks = this.tasksOf(project.id);
    const done = tasks.filter((t) => t.done).length;
    return { done, total: tasks.length, percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  },

  isOverdue(project) {
    return project.status === "active" && Boolean(project.deadline) && project.deadline < UI.dateKey();
  },

  update(id, changes) {
    Store.set("projects", this.all().map((p) => (p.id === id ? { ...p, ...changes } : p)));
    return this.get(id);
  },

  // ---------- Create / edit / delete ----------
  async openEditor(project = null, { quiet = false } = {}) {
    const p = project || { name: "", description: "", color: Study.COLORS[this.all().length % Study.COLORS.length].value, status: "active", deadline: "" };
    const values = await UI.form({
      title: project ? "Edit project" : "New project",
      submitLabel: project ? "Save changes" : "Create project",
      deleteLabel: project ? "Delete" : null,
      fields: [
        { name: "name", label: "Project name", value: p.name, required: true, placeholder: "e.g. Final year project",
          validate: (v) => (v.length > 60 ? "Keep it under 60 characters." : "") },
        { name: "description", label: "Description (optional)", type: "textarea", value: p.description, placeholder: "What is this project about?" },
        { name: "color", label: "Color", type: "select", half: true, value: p.color, options: Study.COLORS },
        { name: "deadline", label: "Deadline (optional)", type: "date", half: true, value: p.deadline || "",
          validate: (v) => (v && !UI.isDateKey(v) ? "Pick a valid date." : "") },
        ...(project ? [{ name: "status", label: "Status", type: "select", value: p.status,
          options: Object.entries(this.STATUSES).map(([value, label]) => ({ value, label })) }] : []),
      ],
    });
    if (values === null) return null;
    if (values === "delete") return (await this.remove(project)) ? "deleted" : null;

    const data = {
      name: values.name.slice(0, 60),
      description: values.description.slice(0, 1000),
      color: Study.COLORS.some((c) => c.value === values.color) ? values.color : Study.COLORS[0].value,
      deadline: values.deadline || null,
    };
    if (project) {
      const status = values.status in this.STATUSES ? values.status : project.status;
      UI.toast("Project updated");
      return this.update(project.id, { ...data, status });
    }
    const created = Store.NORMALIZE.projects({ id: Store.newId(), ...data, status: "active", createdAt: new Date().toISOString() });
    Store.set("projects", [...this.all(), created]);
    if (!quiet) UI.toast(`Project “${created.name}” created`);
    return created;
  },

  // Deleting a project keeps its tasks and notes (they just lose the project)
  async remove(project) {
    const tasks = this.tasksOf(project.id).length;
    const notes = Notes.all().filter((n) => n.projectId === project.id).length;
    const ok = await UI.confirm({
      title: `Delete “${project.name}”?`,
      message: `The project, its milestones and resource links are deleted. Its ${tasks} task${tasks === 1 ? "" : "s"} and ${notes} note${notes === 1 ? "" : "s"} are kept, just without a project.`,
    });
    if (!ok) return false;
    Store.set("tasks", Tasks.all().map((t) => (t.projectId === project.id ? { ...t, projectId: null } : t)));
    Store.set("notes", Notes.all().map((n) => (n.projectId === project.id ? { ...n, projectId: null } : n)));
    Store.set("projects", this.all().filter((p) => p.id !== project.id));
    if (this.state.selectedId === project.id) this.state.selectedId = null;
    UI.toast("Project deleted");
    return true;
  },

  // ---------- Kanban ----------
  columnOf(task) {
    return task.done ? "done" : task.status === "doing" ? "doing" : "todo";
  },

  // Move a task to a column. "Done" really completes it (and leaving Done reopens it).
  moveTask(taskId, column) {
    const task = Tasks.all().find((t) => t.id === taskId);
    if (!task || this.columnOf(task) === column) return;
    if (column !== "todo" && Tasks.isBlocked(task)) {
      UI.toast(`Heads up: “${task.title}” is waiting for “${Tasks.blockers(task)[0].title}”.`, { type: "info" });
    }
    if (column === "done") Tasks.setDone(taskId, true);
    else {
      if (task.done) Tasks.setDone(taskId, false);
      Tasks.update(taskId, { status: column });
    }
  },

  // ---------- Small pieces of HTML ----------
  cardHtml(project) {
    const prog = this.progress(project);
    const milestones = project.milestones;
    const overdue = this.isOverdue(project);
    const counts = this.COLUMNS.map((c) => this.tasksOf(project.id).filter((t) => this.columnOf(t) === c.id).length);
    return `
      <article class="card project-card hoverable${overdue ? " is-overdue" : ""}" data-id="${UI.escape(project.id)}" style="--subject:${UI.escape(project.color)}" tabindex="0" role="button" aria-label="Open ${UI.escape(project.name)}">
        <div class="project-color"></div>
        <div class="goal-top">
          <span class="badge">${this.STATUSES[project.status]}</span>
          ${project.deadline ? `<span class="badge${overdue ? " overdue" : ""}">${icon(overdue ? "triangle-alert" : "calendar")}${UI.escape(UI.relativeDay(project.deadline))}</span>` : ""}
        </div>
        <h3 class="goal-title">${UI.escape(project.name)}</h3>
        ${project.description ? `<p class="goal-desc">${UI.escape(project.description)}</p>` : ""}
        <div class="goal-progress">
          <div class="goal-progress-info"><span>${prog.total ? `${prog.done} of ${prog.total} tasks done` : "No tasks yet"}</span><strong>${prog.percent}%</strong></div>
          <div class="progress-track thin"><div class="progress-bar subject-bar${prog.total && prog.percent === 100 ? " complete" : ""}" style="width:${prog.percent}%"></div></div>
        </div>
        <div class="project-stats">
          ${this.COLUMNS.map((c, i) => `<span title="${c.label}">${icon(c.icon)}${counts[i]}</span>`).join("")}
          <span title="Milestones">${icon("milestone")}${milestones.filter((m) => m.done).length}/${milestones.length}</span>
        </div>
      </article>`;
  },

  boardCardHtml(task) {
    const col = this.columnOf(task);
    const index = this.COLUMNS.findIndex((c) => c.id === col);
    return `
      <li class="kanban-card${Tasks.isBlocked(task) ? " is-blocked" : ""}${Tasks.isOverdue(task) ? " is-overdue" : ""}" draggable="true" data-id="${UI.escape(task.id)}" data-task="${UI.escape(task.id)}">
        <button type="button" class="kanban-title" data-edit-task>${UI.escape(task.title)}</button>
        <div class="item-meta">${Tasks.metaHtml(task)}</div>
        <div class="kanban-moves">
          <button class="btn-icon small" type="button" data-move="${this.COLUMNS[index - 1]?.id || ""}" ${index === 0 ? "disabled" : ""}
                  aria-label="Move to ${this.COLUMNS[index - 1]?.label || ""}" title="Move left">${icon("arrow-left")}</button>
          <button class="btn-icon small" type="button" data-move="${this.COLUMNS[index + 1]?.id || ""}" ${index === this.COLUMNS.length - 1 ? "disabled" : ""}
                  aria-label="Move to ${this.COLUMNS[index + 1]?.label || ""}" title="Move right">${icon("arrow-right")}</button>
        </div>
      </li>`;
  },

  // ---------- Page ----------
  renderPage(container) {
    // Opening a project from search / notifications
    if (Router.highlightId && this.get(Router.highlightId)) this.state.selectedId = Router.highlightId;
    const project = this.get(this.state.selectedId);
    if (project) this.renderDetail(container, project);
    else this.renderList(container);
  },

  renderList(container) {
    this.state.selectedId = null;
    container.innerHTML = `
      <div class="page-header">
        <div><h2>Projects</h2><p>Organize bigger work into projects with a board, milestones, notes and resources.</p></div>
        <button class="btn btn-primary" type="button" data-new>${icon("plus")}New project</button>
      </div>
      <section class="card goals-toolbar">
        <div class="filter-tabs" role="tablist" aria-label="Project status" data-filters></div>
      </section>
      <div class="goal-grid project-grid" data-grid></div>`;

    const draw = () => {
      container.querySelector("[data-filters]").innerHTML = Object.entries(this.STATUSES).map(([id, label]) =>
        `<button type="button" role="tab" aria-selected="${id === this.state.filter}" data-filter="${id}">${label}<span class="count">${this.all().filter((p) => p.status === id).length}</span></button>`).join("");
      const list = this.all().filter((p) => p.status === this.state.filter)
        .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999") || a.name.localeCompare(b.name));
      container.querySelector("[data-grid]").innerHTML = list.length ? list.map((p) => this.cardHtml(p)).join("")
        : `<div class="card">${this.all().length
            ? UI.emptyState("folder-kanban", `No ${this.STATUSES[this.state.filter].toLowerCase()} projects`, "Try another tab.")
            : UI.emptyState("folder-kanban", "No projects yet", "Click “New project”, e.g. your final year project, a website, or a club event.")}</div>`;
    };

    container.querySelector("[data-filters]").addEventListener("click", (event) => {
      const tab = event.target.closest("[data-filter]");
      if (!tab) return;
      this.state.filter = tab.dataset.filter;
      draw();
    });
    const open = (card) => { this.state.selectedId = card.dataset.id; this.state.tab = "board"; Router.refresh(); };
    container.querySelector("[data-grid]").addEventListener("click", (event) => {
      const card = event.target.closest(".project-card");
      if (card) open(card);
    });
    container.querySelector("[data-grid]").addEventListener("keydown", (event) => {
      const card = event.target.closest(".project-card");
      if (card && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(card); }
    });
    container.querySelector("[data-new]").addEventListener("click", async () => {
      const created = await this.openEditor();
      if (created && typeof created === "object") { this.state.selectedId = created.id; this.state.tab = "board"; Router.refresh(); }
    });

    draw();
  },

  renderDetail(container, project) {
    const tabs = [["board", "Board", "square-kanban"], ["milestones", "Milestones", "milestone"], ["notes", "Notes", "notebook-pen"], ["resources", "Resources", "link"]];
    container.innerHTML = `
      <div class="page-header project-header" style="--subject:${UI.escape(project.color)}">
        <div>
          <button class="btn btn-secondary compact" type="button" data-back>${icon("chevron-left")}All projects</button>
          <h2><span class="subject-dot"></span>${UI.escape(project.name)}</h2>
          <p>${project.description ? UI.escape(project.description) : "&nbsp;"}</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" type="button" data-edit-project>${icon("pencil")}Edit</button>
        </div>
      </div>
      <section class="card project-summary" data-summary></section>
      <div class="filter-tabs project-tabs" role="tablist" aria-label="Project sections" data-tabs>
        ${tabs.map(([id, label, ic]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === this.state.tab}">${icon(ic)}${label}</button>`).join("")}
      </div>
      <div data-tab-body></div>`;

    const body = container.querySelector("[data-tab-body]");
    const current = () => this.get(project.id);

    const drawSummary = () => {
      const p = current();
      const prog = this.progress(p);
      const overdue = this.isOverdue(p);
      container.querySelector("[data-summary]").innerHTML = `
        <div class="project-summary-row">
          <span class="badge">${this.STATUSES[p.status]}</span>
          ${p.deadline ? `<span class="badge${overdue ? " overdue" : ""}">${icon(overdue ? "triangle-alert" : "calendar")}Deadline: ${UI.escape(UI.formatDay(p.deadline, { day: "numeric", month: "short", year: "numeric" }))} (${UI.escape(UI.relativeDay(p.deadline))})</span>` : `<span class="badge">No deadline</span>`}
          <span class="badge">${icon("milestone")}${p.milestones.filter((m) => m.done).length}/${p.milestones.length} milestones</span>
          <strong class="project-percent">${prog.percent}%</strong>
        </div>
        <div class="progress-track"><div class="progress-bar subject-bar${prog.total && prog.percent === 100 ? " complete" : ""}" style="width:${prog.percent}%"></div></div>
        <p class="muted small">${prog.total ? `${prog.done} of ${prog.total} tasks done` : "Add tasks on the board to track progress."}</p>`;
    };

    const drawBoard = () => {
      const tasks = Tasks.sort(this.tasksOf(project.id), "priority");
      body.innerHTML = `
        <div class="kanban">
          ${this.COLUMNS.map((c) => {
            const list = tasks.filter((t) => this.columnOf(t) === c.id);
            return `
              <section class="kanban-column" data-column="${c.id}">
                <header class="kanban-head">${icon(c.icon)}<span>${c.label}</span><span class="count">${list.length}</span></header>
                ${c.id === "todo" ? `
                  <form class="add-form kanban-add" data-add-form>
                    <input class="input compact" type="text" maxlength="200" placeholder="Add a task…" aria-label="New task in this project" autocomplete="off">
                    <button class="btn btn-primary compact" type="submit" aria-label="Add task">${icon("plus")}</button>
                  </form>` : ""}
                <ul class="kanban-list" data-drop="${c.id}">
                  ${list.map((t) => this.boardCardHtml(t)).join("") || `<li class="kanban-empty">Drop tasks here</li>`}
                </ul>
              </section>`;
          }).join("")}
        </div>
        <p class="muted small kanban-tip">Drag cards between columns, or use the arrows. Moving a card to Done completes the task.</p>`;
    };

    const drawMilestones = () => {
      const p = current();
      const list = [...p.milestones].sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
      body.innerHTML = `
        <section class="card">
          <form class="link-form" data-milestone-form novalidate>
            <input class="input" name="title" maxlength="80" placeholder="Milestone, e.g. First prototype" aria-label="Milestone title" autocomplete="off">
            <input class="input" name="dueDate" type="date" aria-label="Milestone date">
            <button class="btn btn-primary" type="submit">${icon("plus")}Add</button>
          </form>
          <ul class="item-list">
            ${list.map((m) => {
              const overdue = !m.done && m.dueDate && m.dueDate < UI.dateKey();
              return `
                <li class="item${m.done ? " done" : ""}" data-milestone="${UI.escape(m.id)}">
                  <input type="checkbox" ${m.done ? "checked" : ""} aria-label="Milestone “${UI.escape(m.title)}” reached">
                  <span class="item-main"><span class="item-label">${UI.escape(m.title)}</span>
                    ${m.dueDate ? `<span class="item-meta"><span class="badge${overdue ? " overdue" : ""}">${icon(overdue ? "triangle-alert" : "calendar")}${UI.escape(UI.relativeDay(m.dueDate))}</span></span>` : ""}</span>
                  <div class="item-actions"><button class="btn-icon small danger" type="button" data-delete-milestone aria-label="Delete milestone" title="Delete">${icon("trash-2")}</button></div>
                </li>`;
            }).join("")}
          </ul>
          ${list.length ? "" : UI.emptyState("milestone", "No milestones yet", "Milestones are the big checkpoints of a project, like “Design done” or “Report submitted”.")}
        </section>`;
    };

    const drawNotes = () => {
      const notes = Notes.sorted(Notes.all().filter((n) => n.projectId === project.id));
      body.innerHTML = `
        <section class="card">
          <div class="card-header">
            <h3 class="card-title"><span class="card-icon violet">${icon("notebook-pen")}</span>Project notes</h3>
            <button class="btn btn-primary compact" type="button" data-new-note>${icon("plus")}New note</button>
          </div>
          ${notes.length ? `<ul class="recent-notes project-notes">${notes.map((n) => `
            <li><a href="#/notes" data-open-note="${UI.escape(n.id)}">${icon(n.pinned ? "pin" : "file-text")}<span>${UI.escape(Notes.titleOf(n))}</span><small>${UI.escape(Notes.timeAgo(n.updatedAt))}</small></a></li>`).join("")}</ul>`
          : UI.emptyState("notebook-pen", "No notes for this project", "Create one here, or choose this project in any note's toolbar.")}
        </section>`;
    };

    const drawResources = () => {
      const p = current();
      body.innerHTML = `
        <section class="card">
          <form class="link-form" data-resource-form novalidate>
            <input class="input" name="title" maxlength="60" placeholder="Name, e.g. Design mockups" aria-label="Resource name" autocomplete="off">
            <input class="input" name="url" placeholder="Address, e.g. figma.com/…" aria-label="Resource address" autocomplete="off">
            <button class="btn btn-primary" type="submit">${icon("plus")}Add</button>
          </form>
          ${p.resources.length ? `<ul class="item-list">${p.resources.map((r) => `
            <li class="item" data-resource="${UI.escape(r.id)}">
              ${icon("external-link")}
              <a class="item-main" href="${UI.escape(Links.normalizeUrl(r.url) || "#")}" target="_blank" rel="noopener noreferrer">
                <span class="item-label">${UI.escape(r.title)}</span><span class="item-desc">${UI.escape(r.url)}</span></a>
              <div class="item-actions"><button class="btn-icon small danger" type="button" data-delete-resource aria-label="Remove resource" title="Remove">${icon("x")}</button></div>
            </li>`).join("")}</ul>`
          : UI.emptyState("link", "No resources yet", "Keep the links you need for this project here: documents, repositories, designs…")}
        </section>`;
    };

    const draw = () => {
      drawSummary();
      container.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === this.state.tab)));
      ({ board: drawBoard, milestones: drawMilestones, notes: drawNotes, resources: drawResources })[this.state.tab]();
    };

    // ----- Events (one listener per kind, for the whole page) -----
    container.querySelector("[data-back]").addEventListener("click", () => { this.state.selectedId = null; Router.refresh(); });
    container.querySelector("[data-edit-project]").addEventListener("click", async () => {
      const result = await this.openEditor(current());
      if (result === "deleted") Router.refresh();
      else if (result) Router.refresh();
    });
    container.querySelector("[data-tabs]").addEventListener("click", (event) => {
      const tab = event.target.closest("[data-tab]");
      if (!tab) return;
      this.state.tab = tab.dataset.tab;
      draw();
    });

    body.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.target;
      if (form.matches("[data-add-form]")) {
        const input = form.querySelector("input");
        if (Tasks.add(input.value, { projectId: project.id })) { input.value = ""; drawBoard(); drawSummary(); body.querySelector("[data-add-form] input").focus(); }
      }
      if (form.matches("[data-milestone-form]")) {
        const title = form.elements.title.value.trim();
        const dueDate = form.elements.dueDate.value;
        if (!title) return form.elements.title.focus();
        if (dueDate && !UI.isDateKey(dueDate)) return UI.toast("Pick a valid date.", { type: "error" });
        this.update(project.id, { milestones: [...current().milestones, { id: Store.newId(), title: title.slice(0, 80), dueDate: dueDate || null, done: false }] });
        drawMilestones(); drawSummary();
      }
      if (form.matches("[data-resource-form]")) {
        const title = form.elements.title.value.trim();
        const url = Links.normalizeUrl(form.elements.url.value);
        if (!title) return form.elements.title.focus();
        if (!url) return UI.toast("That doesn't look like a web address.", { type: "error" });
        this.update(project.id, { resources: [...current().resources, { id: Store.newId(), title: title.slice(0, 60), url }] });
        drawResources();
      }
    });

    body.addEventListener("click", async (event) => {
      const card = event.target.closest("[data-task]");
      const move = event.target.closest("[data-move]");
      if (card && move && move.dataset.move) {
        this.moveTask(card.dataset.task, move.dataset.move);
        drawBoard(); drawSummary();
        return;
      }
      if (card && event.target.closest("[data-edit-task]")) {
        const task = Tasks.all().find((t) => t.id === card.dataset.task);
        if (task && (await Tasks.openEditor(task))) { drawBoard(); drawSummary(); }
        return;
      }
      const milestone = event.target.closest("[data-milestone]");
      if (milestone && event.target.closest("[data-delete-milestone]")) {
        this.update(project.id, { milestones: current().milestones.filter((m) => m.id !== milestone.dataset.milestone) });
        drawMilestones(); drawSummary();
        return;
      }
      const resource = event.target.closest("[data-resource]");
      if (resource && event.target.closest("[data-delete-resource]")) {
        this.update(project.id, { resources: current().resources.filter((r) => r.id !== resource.dataset.resource) });
        drawResources();
        return;
      }
      if (event.target.closest("[data-new-note]")) {
        const note = Notes.create({ projectId: project.id, category: "projects" });
        Notes.state.query = ""; Notes.state.category = "all";
        Router.go("notes", note.id);
        return;
      }
      const noteLink = event.target.closest("[data-open-note]");
      if (noteLink) { event.preventDefault(); Router.go("notes", noteLink.dataset.openNote); }
    });

    body.addEventListener("change", (event) => {
      const milestone = event.target.closest("[data-milestone]");
      if (!milestone || event.target.type !== "checkbox") return;
      const done = event.target.checked;
      this.update(project.id, { milestones: current().milestones.map((m) => (m.id === milestone.dataset.milestone ? { ...m, done, doneAt: done ? new Date().toISOString() : null } : m)) });
      if (done) { UI.confetti(); UI.toast("Milestone reached! 🎉"); }
      drawMilestones(); drawSummary();
    });

    // Drag and drop between columns (mouse); the arrow buttons do the same for keyboard/touch
    body.addEventListener("dragstart", (event) => {
      const card = event.target.closest("[data-task]");
      if (!card) return;
      event.dataTransfer.setData("text/plain", card.dataset.task);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    body.addEventListener("dragend", (event) => event.target.closest?.("[data-task]")?.classList.remove("dragging"));
    body.addEventListener("dragover", (event) => {
      const list = event.target.closest("[data-drop]");
      if (!list) return;
      event.preventDefault(); // allows dropping here
      body.querySelectorAll(".drop-target").forEach((el) => el !== list && el.classList.remove("drop-target"));
      list.classList.add("drop-target");
    });
    body.addEventListener("dragleave", (event) => {
      const list = event.target.closest("[data-drop]");
      if (list && !list.contains(event.relatedTarget)) list.classList.remove("drop-target");
    });
    body.addEventListener("drop", (event) => {
      const list = event.target.closest("[data-drop]");
      if (!list) return;
      event.preventDefault();
      const taskId = event.dataTransfer.getData("text/plain");
      if (taskId) { this.moveTask(taskId, list.dataset.drop); drawBoard(); drawSummary(); }
    });

    draw();
  },

  // ---------- Dashboard widget ----------
  renderWidget(container) {
    const active = this.all().filter((p) => p.status === "active")
      .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999")).slice(0, 4);
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon violet">${icon("folder-kanban")}</span>Projects</h3>
        <a class="card-link" href="#/projects">Open ${icon("chevron-right")}</a>
      </div>
      ${active.length ? `<ul class="hbar-list">${active.map((p) => {
        const prog = this.progress(p);
        return `
          <li>
            <a class="project-widget-row" href="#/projects" data-open-project="${UI.escape(p.id)}">
              <div class="hbar-top"><span><span class="subject-dot" style="--subject:${UI.escape(p.color)}"></span>${UI.escape(p.name)}</span>
                <strong>${prog.percent}% <span class="muted">${p.deadline ? UI.escape(UI.relativeDay(p.deadline)) : ""}</span></strong></div>
              <div class="progress-track thin"><div class="progress-bar" style="width:${prog.percent}%;background:${UI.escape(p.color)}"></div></div>
            </a>
          </li>`;
      }).join("")}</ul>`
      : UI.emptyState("folder-kanban", "No active projects", "Group bigger work into a project with its own board.")}`;
    container.addEventListener("click", (event) => {
      const row = event.target.closest("[data-open-project]");
      if (!row) return;
      event.preventDefault();
      Router.go("projects", row.dataset.openProject);
    });
  },
};

// ---------------------------------------------------------
// Register the Projects module (see js/modules.js)
// ---------------------------------------------------------
Modules.register({
  id: "projects",
  order: 25,
  nav: { label: "Projects", icon: "folder-kanban" },
  page: (container) => Projects.renderPage(container),

  collections: {
    // { id, name, description, color, status, deadline, createdAt, milestones: [{id,title,dueDate,done}], resources: [{id,title,url}] }
    projects: {
      default: [],
      backup: true,
      normalize: (p) => ({
        name: "Project", description: "", color: "#22d3ee", status: "active", deadline: null, createdAt: null,
        ...p,
        milestones: Array.isArray(p.milestones) ? p.milestones.filter((m) => m && m.id && typeof m.title === "string") : [],
        resources: Array.isArray(p.resources) ? p.resources.filter((r) => r && r.id && typeof r.url === "string") : [],
      }),
    },
  },

  search(q, has) {
    return {
      label: "Projects",
      items: Projects.all().filter((p) => has(p.name) || has(p.description)).slice(0, 6).map((p) => ({
        text: p.name, icon: "folder-kanban", page: "projects", id: p.id,
        hint: `${Projects.progress(p).percent}% · ${Projects.STATUSES[p.status]}`,
        before: () => { Projects.state.tab = "board"; },
      })),
    };
  },

  notifications() {
    const today = UI.dateKey();
    const items = [];
    Projects.all().filter((p) => p.status === "active").forEach((p) => {
      if (p.deadline && p.deadline <= today) items.push({
        tone: p.deadline < today ? "danger" : "violet", icon: "folder-kanban", text: p.name,
        sub: `Project ${p.deadline < today ? "deadline passed" : "due today"} · ${Projects.progress(p).percent}% done`,
        page: "projects", id: p.id, urgent: p.deadline === today, before: () => { Projects.state.tab = "board"; },
      });
      p.milestones.filter((m) => !m.done && m.dueDate && m.dueDate <= today).forEach((m) => items.push({
        tone: m.dueDate < today ? "danger" : "amber", icon: "milestone", text: m.title,
        sub: `Milestone of ${p.name} · ${m.dueDate < today ? "overdue" : "due today"}`,
        page: "projects", id: p.id, before: () => { Projects.state.tab = "milestones"; },
      }));
    });
    return items;
  },

  quickAdd: [{
    id: "project", label: "New project", icon: "folder-kanban", key: "P", order: 55,
    async run() {
      const created = await Projects.openEditor(null, { quiet: true });
      if (created && typeof created === "object") { Projects.state.selectedId = created.id; Projects.state.tab = "board"; }
      return { created, page: "projects", label: "Project", onDashboard: false };
    },
  }],

  widgets: [{ id: "projects", label: "Projects", span: 4, order: 75, render: (el) => Projects.renderWidget(el) }],
});
