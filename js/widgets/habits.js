// =========================================================
// HABITS widget: daily check-ins, streaks, progress bar.
// On the Habits page (page: true) each habit also shows its last 7 days.
// =========================================================

const Habits = {
  // How many days in a row was this habit done (ending today or yesterday)?
  countStreak(doneDays) {
    const day = new Date();
    // Not done yet today? The streak can still continue from yesterday.
    if (!doneDays.includes(UI.dateKey(day))) day.setDate(day.getDate() - 1);

    let streak = 0;
    while (doneDays.includes(UI.dateKey(day))) {
      streak++;
      day.setDate(day.getDate() - 1);
    }
    return streak;
  },

  render(container, { page = false } = {}) {
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon amber">${icon("flame")}</span>${page ? "Your habits" : "Habits"}</h3>
        ${page ? "" : `<a class="card-link" href="#/habits">Open ${icon("chevron-right")}</a>`}
      </div>
      <div class="habit-progress" data-progress>
        <div class="habit-progress-info"><span>Today</span><span data-progress-text></span></div>
        <div class="progress-track"><div class="progress-bar" data-progress-bar></div></div>
      </div>
      <form class="add-form" data-add-form>
        <input class="input" type="text" placeholder="New habit, e.g. Read 10 pages" maxlength="80"
               aria-label="New habit" autocomplete="off">
        <button class="btn btn-primary" type="submit" aria-label="Add habit">${icon("plus")}</button>
      </form>
      <ul class="item-list" data-list></ul>
      <div data-empty></div>`;

    const list = container.querySelector("[data-list]");
    const empty = container.querySelector("[data-empty]");
    const refresh = () => {
      empty.innerHTML = list.children.length ? "" : UI.emptyState("flame", "No habits yet", "Add a habit you want to do every day and build a streak.");
      this.updateProgress(container);
    };

    Store.get("habits").forEach((habit) => list.appendChild(this.createRow(habit, page, refresh)));
    refresh();

    container.querySelector("[data-add-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.target.querySelector("input");
      const habit = this.add(input.value);
      if (!habit) return;
      const row = this.createRow(habit, page, refresh);
      row.classList.add("entering");
      list.appendChild(row);
      refresh();
      input.value = "";
    });
  },

  add(name) {
    const clean = String(name).trim().slice(0, 80);
    if (!clean) return null;
    const habit = { id: Store.newId(), name: clean, doneDays: [], createdAt: new Date().toISOString() };
    Store.set("habits", [...Store.get("habits"), habit]);
    return habit;
  },

  // "Today 2 / 3" bar. Returns true when every habit is done today.
  updateProgress(container) {
    const today = UI.dateKey();
    const habits = Store.get("habits");
    const done = habits.filter((h) => h.doneDays.includes(today)).length;
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

  // Streak badge: the flame grows at 3 days (level 1) and 7 days (level 2)
  streakBadge(doneDays) {
    const days = this.countStreak(doneDays);
    const level = days >= 7 ? 2 : days >= 3 ? 1 : 0;
    return { days, html: `<span class="flame">${icon("flame")}</span>${days} day${days === 1 ? "" : "s"}`, level };
  },

  // Last 7 days as small squares, oldest first
  weekDotsHtml(doneDays) {
    let html = "";
    for (let i = 6; i >= 0; i--) {
      const key = UI.daysAgoKey(i);
      const on = doneDays.includes(key);
      html += `<span class="week-dot${on ? " on" : ""}${i === 0 ? " today" : ""}" title="${key}${on ? ": done" : ""}"></span>`;
    }
    return html;
  },

  createRow(habit, page, refresh) {
    const doneToday = habit.doneDays.includes(UI.dateKey());
    const streak = this.streakBadge(habit.doneDays);

    const row = UI.html(`
      <li class="item${doneToday ? " done" : ""}" data-id="${UI.escape(habit.id)}">
        <input type="checkbox" ${doneToday ? "checked" : ""} aria-label="Done “${UI.escape(habit.name)}” today">
        <span class="item-text"><span class="item-label">${UI.escape(habit.name)}</span></span>
        ${page ? `<span class="week-dots" aria-hidden="true">${this.weekDotsHtml(habit.doneDays)}</span>` : ""}
        <span class="streak" data-level="${streak.level}" title="Current streak">${streak.html}</span>
        <div class="item-actions">
          <button class="btn-icon small danger" type="button" aria-label="Delete habit" title="Delete">${icon("trash-2")}</button>
        </div>
      </li>`);

    const checkbox = row.querySelector("input");
    const badge = row.querySelector(".streak");

    checkbox.addEventListener("change", () => {
      const today = UI.dateKey();
      const current = Store.get("habits").find((h) => h.id === habit.id);
      if (!current) return;

      const before = this.countStreak(current.doneDays.filter((d) => d !== today));
      const doneDays = checkbox.checked
        ? [...new Set([...current.doneDays, today])]       // Set = no duplicates
        : current.doneDays.filter((d) => d !== today);

      Store.set("habits", Store.get("habits").map((h) => (h.id === habit.id ? { ...h, doneDays } : h)));
      row.classList.toggle("done", checkbox.checked);

      // Update just this row's badge (and dots), bounce if the streak grew
      const next = this.streakBadge(doneDays);
      badge.innerHTML = next.html;
      badge.dataset.level = next.level;
      if (next.days > before) UI.replayAnimation(badge, "bump");
      const dots = row.querySelector(".week-dots");
      if (dots) dots.innerHTML = this.weekDotsHtml(doneDays);

      if (checkbox.checked) UI.replayAnimation(checkbox, "pop");
      const allDone = this.updateProgress(row.closest(".card"));
      if (checkbox.checked && allDone) UI.confetti();
    });

    const deleteButton = row.querySelector(".item-actions button");
    deleteButton.addEventListener("click", async () => {
      // Deleting a habit also deletes its whole history, so we ask first
      const ok = await UI.confirm({
        title: "Delete this habit?",
        message: `“${habit.name}” and its entire check-in history will be deleted. This can't be undone.`,
      });
      if (!ok) return;

      UI.removeWithAnimation(row, () => {
        row.remove();
        Store.set("habits", Store.get("habits").filter((h) => h.id !== habit.id));
        refresh();
        UI.toast("Habit deleted");
      });
    });

    return row;
  },
};
