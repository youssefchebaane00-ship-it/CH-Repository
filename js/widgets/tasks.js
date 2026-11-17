// =========================================================
// TASKS widget
// mode "today" (dashboard): unfinished tasks + tasks finished today
// mode "all"   (Tasks page): every task
// =========================================================

const Tasks = {
  render(container, { mode = "all" } = {}) {
    const isToday = mode === "today";

    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon">${icon("list-todo")}</span>${isToday ? "Today's tasks" : "All tasks"}</h3>
        <span class="badge accent" data-stat="tasksLeft"></span>
        ${isToday ? `<a class="card-link" href="#/tasks">View all ${icon("chevron-right")}</a>` : ""}
      </div>
      <form class="add-form" data-add-form>
        <input class="input" type="text" placeholder="Add a task and press Enter…" maxlength="200"
               aria-label="New task" autocomplete="off">
        <button class="btn btn-primary" type="submit" aria-label="Add task">${icon("plus")}</button>
      </form>
      <ul class="item-list" data-list></ul>
      <div data-empty></div>`;

    const list = container.querySelector("[data-list]");
    const empty = container.querySelector("[data-empty]");
    const emptyHtml = isToday
      ? UI.emptyState("circle-check", "Nothing left for today", "Add a task above, or enjoy your free time.")
      : UI.emptyState("inbox", "No tasks yet", "Write your first task above and press Enter.");
    const updateEmpty = () => { empty.innerHTML = list.children.length ? "" : emptyHtml; };

    // Which tasks to show
    const today = UI.dateKey();
    const visible = Store.get("tasks").filter((t) =>
      !isToday || !t.done || (t.completedAt && UI.dateKey(new Date(t.completedAt)) === today));
    visible.forEach((task) => list.appendChild(this.createRow(task, updateEmpty)));
    updateEmpty();

    container.querySelector("[data-add-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.target.querySelector("input");
      const task = this.add(input.value);
      if (!task) return;
      const row = this.createRow(task, updateEmpty);
      row.classList.add("entering");
      list.appendChild(row);
      updateEmpty();
      input.value = "";
    });
  },

  // Create and save a task. Returns the task, or null if the title is empty.
  add(title) {
    const clean = String(title).trim().slice(0, 200);
    if (!clean) return null;
    const task = { id: Store.newId(), title: clean, done: false, createdAt: new Date().toISOString(), completedAt: null };
    Store.set("tasks", [...Store.get("tasks"), task]);
    return task;
  },

  // Build ONE row. Only this row changes when you tick or delete it.
  createRow(task, updateEmpty) {
    const row = UI.html(`
      <li class="item${task.done ? " done" : ""}" data-id="${UI.escape(task.id)}">
        <input type="checkbox" ${task.done ? "checked" : ""} aria-label="Mark “${UI.escape(task.title)}” as done">
        <span class="item-text"><span class="item-label">${UI.escape(task.title)}</span></span>
        <div class="item-actions">
          <button class="btn-icon small danger" type="button" aria-label="Delete task" title="Delete">${icon("trash-2")}</button>
        </div>
      </li>`);

    const checkbox = row.querySelector("input");
    checkbox.addEventListener("change", () => {
      const done = checkbox.checked;
      const tasks = Store.get("tasks").map((t) =>
        t.id === task.id ? { ...t, done, completedAt: done ? new Date().toISOString() : null } : t);
      Store.set("tasks", tasks);
      row.classList.toggle("done", done);

      if (done) {
        UI.replayAnimation(checkbox, "pop");
        if (tasks.every((t) => t.done)) {
          UI.confetti();
          UI.toast("All tasks done. Amazing! 🎉");
        }
      }
    });

    const deleteButton = row.querySelector("button");
    deleteButton.addEventListener("click", () => {
      deleteButton.disabled = true;
      UI.removeWithAnimation(row, () => {
        // Read the list AFTER the animation, in case something else changed meanwhile
        const tasks = Store.get("tasks");
        const index = tasks.findIndex((t) => t.id === task.id);
        const removed = tasks[index];
        row.remove();
        Store.set("tasks", tasks.filter((t) => t.id !== task.id));
        updateEmpty();

        // Undo puts the task back where it was
        UI.toast("Task deleted", {
          actionLabel: "Undo",
          onAction: () => {
            const current = [...Store.get("tasks")];
            current.splice(index, 0, removed);
            Store.set("tasks", current);
            Router.refresh();
          },
        });
      });
    });

    return row;
  },
};
