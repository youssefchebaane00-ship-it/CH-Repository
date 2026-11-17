// =========================================================
// STATISTICS: numbers calculated from your real data.
// Any element with data-stat="name" is filled in automatically,
// and refreshed every time data is saved (see app.js).
// =========================================================

const Stats = {
  compute() {
    const today = UI.dateKey();
    const tasks = Store.get("tasks");
    const habits = Store.get("habits");

    const doneToday = tasks.filter((t) => Tasks.completedToday(t)).length;
    const remaining = tasks.filter((t) => !t.done).length;
    const overdue = tasks.filter((t) => Tasks.isOverdue(t)).length;
    const focusOpen = tasks.filter((t) => !t.done && Tasks.isFocus(t)).length; // on today's list
    const habitsDone = habits.filter((h) => Habits.doneForToday(h)).length;
    const bestHabit = habits.reduce((best, h) => {
      const n = Habits.countStreak(h);
      return n > best.n ? { n, habit: h } : best;
    }, { n: 0, habit: null });

    // 7-day consistency (daily habits): of all the check-ins that were possible
    // in the last 7 days, how many did you do? A habit only counts from the
    // day it was created, so new habits don't drag the number down.
    let possible = 0;
    let checked = 0;
    for (const habit of habits.filter((h) => !Habits.isWeekly(h))) {
      const firstDay = Habits.firstDay(habit);
      for (let i = 0; i < 7; i++) {
        const day = UI.daysAgoKey(i);
        if (day < firstDay) continue; // "2026-11-10" < "2026-11-12" works for this date format
        possible++;
        if (habit.doneDays.includes(day)) checked++;
      }
    }
    const consistency = possible ? Math.round((checked / possible) * 100) : null;

    // Today's progress = (tasks finished today + habits done today)
    // out of (that + tasks still on today's list + habits still to do)
    const dailyTotal = doneToday + focusOpen + habits.length;
    const dailyDone = doneToday + habitsDone;
    const dailyPercent = dailyTotal ? Math.round((dailyDone / dailyTotal) * 100) : 0;

    return { tasks, habits, doneToday, remaining, overdue, focusOpen, habitsDone, bestHabit, consistency, dailyTotal, dailyDone, dailyPercent };
  },

  // The 4 summary cards on the dashboard
  renderCards(container) {
    const card = (iconName, color, label, valueKey, subKey) => `
      <div class="card stat-card hoverable">
        <div class="stat-top">
          <span>${label}</span>
          <span class="card-icon ${color}">${icon(iconName)}</span>
        </div>
        <div class="stat-value" data-stat="${valueKey}">–</div>
        <div class="stat-sub" data-stat="${subKey}"></div>
      </div>`;

    container.innerHTML =
      card("circle-check", "emerald", "Completed today", "doneToday", "doneTodaySub") +
      card("list-todo", "sky", "Remaining tasks", "remaining", "remainingSub") +
      card("flame", "amber", "Habits today", "habitsToday", "habitsSub") +
      card("chart-column", "violet", "7-day consistency", "consistency", "consistencySub");

    this.refresh();
  },

  // Fill every data-stat element currently on the page
  refresh() {
    const s = this.compute();
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

    const values = {
      doneToday: s.doneToday,
      doneTodaySub: s.doneToday ? "Nice work, keep going!" : "No tasks finished yet today",
      remaining: s.remaining,
      remainingSub: s.overdue ? `⚠ ${s.overdue} overdue` : `${plural(s.tasks.length, "task")} in total`,
      tasksLeft: `${s.focusOpen} left`,
      habitsToday: s.habits.length ? `${s.habitsDone}/${s.habits.length}` : "0",
      habitsSub: s.bestHabit.n ? `Best current streak: ${Habits.unit(s.bestHabit.habit, s.bestHabit.n)}` : "Tick a habit to start a streak",
      consistency: s.consistency === null ? "–" : `${s.consistency}%`,
      consistencySub: s.consistency === null ? "Add daily habits to measure this" : "Daily habit check-ins, last 7 days",
      dailyPercent: `${s.dailyPercent}%`,
      dailySub: s.dailyTotal ? `${s.dailyDone} of ${s.dailyTotal} done` : "add a task or habit",
    };

    document.querySelectorAll("[data-stat]").forEach((el) => {
      const key = el.dataset.stat;
      if (key in values) el.textContent = values[key];
    });

    document.querySelectorAll('[data-stat-bar="daily"]').forEach((bar) => {
      bar.style.width = `${s.dailyPercent}%`;
      bar.classList.toggle("complete", s.dailyTotal > 0 && s.dailyPercent === 100);
    });
  },
};
