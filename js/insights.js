// =========================================================
// INSIGHTS: short observations written from your real data.
//
// Rules for every insight:
//   • it only uses data that is saved in the app (nothing estimated or invented)
//   • it only appears when there is enough data to say something meaningful
//   • it shows the numbers it is based on, so you can check it
//   • comparisons are fair (e.g. this week so far vs the SAME days last week)
//   • a projection is always called a projection
// =========================================================

const Insights = {
  // Each rule returns an insight { id, icon, tone, title, detail, page } or null
  RULES: [
    // Study: this week so far vs the same days last week
    function studyThisWeek() {
      const today = UI.dateKey();
      const weekStart = UI.startOfWeek(today);
      const daysSoFar = UI.diffDays(weekStart, today);
      const lastStart = UI.addDays(weekStart, -7);
      const now = Study.secondsBetween(weekStart, today);
      const before = Study.secondsBetween(lastStart, UI.addDays(lastStart, daysSoFar));
      if (Math.max(now, before) < 30 * 60) return null; // under 30 min both weeks: too little to compare
      const dayName = UI.formatDay(today, { weekday: "long" });
      if (!before) return { id: "study-week", icon: "graduation-cap", tone: "emerald", page: "study",
        title: `${UI.formatDuration(now)} of study so far this week`, detail: `Last week you had none by ${dayName}.` };
      const pct = Math.round(((now - before) / before) * 100);
      return {
        id: "study-week", icon: pct >= 0 ? "trending-up" : "trending-down", tone: pct >= 0 ? "emerald" : "amber", page: "study",
        title: pct === 0 ? `Same study time as last week (${UI.formatDuration(now)})`
          : `${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} study time than last week`,
        detail: `${UI.formatDuration(now)} from Monday to ${dayName}, vs ${UI.formatDuration(before)} over the same days last week.`,
      };
    },

    // Study: strongest weekday over the last 4 weeks
    function bestStudyDay() {
      const from = UI.addDays(UI.dateKey(), -27);
      const sessions = Study.sessions().filter((s) => s.date >= from);
      const days = new Set(sessions.map((s) => s.date));
      if (sessions.length < 5 || days.size < 3) return null;
      const byWeekday = Array(7).fill(0);
      sessions.forEach((s) => { byWeekday[UI.parseKey(s.date).getDay()] += s.durationSec; });
      const best = byWeekday.indexOf(Math.max(...byWeekday));
      const name = UI.parseKey(UI.addDays("2024-01-07", best)).toLocaleDateString(undefined, { weekday: "long" }); // 2024-01-07 was a Sunday
      return {
        id: "study-day", icon: "calendar-days", tone: "sky", page: "study",
        title: `${name} is your strongest study day`,
        detail: `${UI.formatDuration(byWeekday[best] / 4)} per ${name} on average over the last 4 weeks (${sessions.length} sessions in total).`,
      };
    },

    // Tasks: how many of the recently created tasks are done
    function taskCompletion() {
      const from = UI.addDays(UI.dateKey(), -13);
      const created = Tasks.all().filter((t) => t.createdAt && UI.dateKey(new Date(t.createdAt)) >= from);
      if (created.length < 5) return null;
      const done = created.filter((t) => t.done).length;
      const pct = Math.round((done / created.length) * 100);
      return {
        id: "task-rate", icon: "circle-check", tone: pct >= 60 ? "emerald" : "amber", page: "tasks",
        title: `${pct}% of your recent tasks are done`,
        detail: `Of the ${created.length} tasks you created in the last 14 days, ${done} ${done === 1 ? "is" : "are"} finished.`,
      };
    },

    // Tasks: overdue
    function overdueTasks() {
      const overdue = Tasks.all().filter((t) => Tasks.isOverdue(t)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      if (!overdue.length) return null;
      const days = UI.diffDays(overdue[0].dueDate, UI.dateKey());
      return {
        id: "overdue", icon: "triangle-alert", tone: "rose", page: "tasks",
        title: `${overdue.length} task${overdue.length === 1 ? " is" : "s are"} overdue`,
        detail: `The oldest, “${overdue[0].title}”, was due ${days} day${days === 1 ? "" : "s"} ago. The Planner can help you find time for ${overdue.length === 1 ? "it" : "them"}.`,
      };
    },

    // Planner: tasks due soon with no time planned
    function unplannedDeadlines() {
      if (typeof Planner === "undefined") return null;
      const today = UI.dateKey();
      const tomorrow = UI.addDays(today, 1);
      const planned = new Set(Planner.all().filter((b) => b.taskId && b.date >= today).map((b) => b.taskId));
      const due = Tasks.all().filter((t) => !t.done && t.dueDate && t.dueDate >= today && t.dueDate <= tomorrow && !planned.has(t.id));
      if (!due.length) return null;
      return {
        id: "unplanned", icon: "calendar-clock", tone: "violet", page: "planner",
        title: `${due.length} task${due.length === 1 ? "" : "s"} due by tomorrow ${due.length === 1 ? "has" : "have"} no time planned`,
        detail: `${due.slice(0, 3).map((t) => `“${t.title}”`).join(", ")}${due.length > 3 ? "…" : ""}. Try “Suggest a plan” in the Planner.`,
      };
    },

    // Habits: most and least consistent (30 days)
    function habitConsistency() {
      const weekAgo = UI.addDays(UI.dateKey(), -6);
      const rated = Habits.all()
        .filter((h) => Habits.firstDay(h) <= weekAgo)               // at least a week of history
        .map((h) => ({ h, rate: Habits.completionRate(h) }))
        .filter((x) => x.rate !== null)
        .sort((a, b) => b.rate - a.rate);
      if (rated.length < 2 || rated[0].rate - rated[rated.length - 1].rate < 15) return null;
      const best = rated[0], weak = rated[rated.length - 1];
      return {
        id: "habit-consistency", icon: "flame", tone: "amber", page: "habits",
        title: `“${best.h.name}” is your most consistent habit`,
        detail: `${best.rate}% vs ${weak.rate}% for “${weak.h.name}” (${Habits.isWeekly(weak.h) ? "weekly target met, last 4 weeks" : "days done, last 30 days"}).`,
      };
    },

    // Habits: a streak that ends tonight (from 17:00)
    function streakAtRisk() {
      if (new Date().getHours() < 17) return null;
      const today = UI.dateKey();
      const atRisk = Habits.all()
        .filter((h) => !Habits.isWeekly(h) && !h.doneDays.includes(today))
        .map((h) => ({ h, streak: Habits.countStreak(h) }))
        .filter((x) => x.streak >= 3)
        .sort((a, b) => b.streak - a.streak)[0];
      if (!atRisk) return null;
      return {
        id: "streak-risk", icon: "flame", tone: "rose", page: "habits",
        title: `Your ${atRisk.streak}-day “${atRisk.h.name}” streak ends tonight`,
        detail: "It's not ticked yet today. Tick it before midnight to keep it going.",
      };
    },

    // Goals: due soon but far from done
    function goalsAtRisk() {
      const today = UI.dateKey();
      const soon = UI.addDays(today, 7);
      const risky = Goals.all().filter((g) => g.status === "active" && g.targetDate && g.targetDate >= today && g.targetDate <= soon && g.progress < 50)
        .sort((a, b) => a.targetDate.localeCompare(b.targetDate));
      if (!risky.length) return null;
      const g = risky[0];
      const days = UI.diffDays(today, g.targetDate);
      return {
        id: "goal-risk", icon: "target", tone: "violet", page: "goals",
        title: `“${g.title}” is due ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`} and ${g.progress}% done`,
        detail: risky.length > 1 ? `${risky.length - 1} other goal${risky.length === 2 ? " is" : "s are"} also due within a week and under 50%.` : "It's the only goal due this week that's under 50%.",
      };
    },

    // Money: this month so far vs the same days last month
    function spendingPace() {
      const today = UI.dateKey();
      const day = UI.parseKey(today).getDate();
      const month = today.slice(0, 7);
      const lastMonth = Expenses.shiftMonth(month, -1);
      const [ly, lm] = lastMonth.split("-").map(Number);
      const lastDay = Math.min(day, new Date(ly, lm, 0).getDate());
      const now = Expenses.sum(Expenses.all().filter((e) => e.date >= `${month}-01` && e.date <= today));
      const before = Expenses.sum(Expenses.all().filter((e) => e.date >= `${lastMonth}-01` && e.date <= `${lastMonth}-${String(lastDay).padStart(2, "0")}`));
      if (!now || !before) return null;
      const pct = Math.round(((now - before) / before) * 100);
      return {
        id: "spending", icon: pct > 0 ? "trending-up" : "trending-down", tone: pct > 10 ? "rose" : "emerald", page: "expenses",
        title: pct === 0 ? "Spending exactly like last month" : `${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} spending than last month so far`,
        detail: `${Expenses.format(now)} from the 1st to the ${day}th, vs ${Expenses.format(before)} over the same days last month.`,
      };
    },

    // Money: projection against the budget (clearly labelled as a projection)
    function budgetProjection() {
      const budget = Number(Store.get("settings").monthlyBudget) || 0;
      const today = UI.dateKey();
      const day = UI.parseKey(today).getDate();
      if (!budget || day < 5) return null; // too early in the month to project
      const month = today.slice(0, 7);
      const [y, m] = month.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const spent = Expenses.sum(Expenses.inMonth(month));
      if (!spent) return null;
      const projected = (spent / day) * daysInMonth;
      if (projected <= budget) return null;
      return {
        id: "budget-projection", icon: "piggy-bank", tone: "amber", page: "expenses",
        title: "At this pace you'd go over your budget",
        detail: `Projection: ${Expenses.format(Math.round(projected))} by the end of the month (${Expenses.format(spent)} in ${day} days, same daily average), vs a ${Expenses.format(budget)} budget.`,
      };
    },

    // Tasks: when in the day you finish things (last 30 days)
    function timeOfDay() {
      const from = UI.addDays(UI.dateKey(), -29);
      const done = Tasks.all().filter((t) => t.done && t.completedAt && UI.dateKey(new Date(t.completedAt)) >= from);
      if (done.length < 10) return null;
      const parts = { morning: 0, afternoon: 0, evening: 0, night: 0 };
      done.forEach((t) => {
        const h = new Date(t.completedAt).getHours();
        parts[h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 22 ? "evening" : "night"]++;
      });
      const [best, count] = Object.entries(parts).sort((a, b) => b[1] - a[1])[0];
      return {
        id: "time-of-day", icon: "clock", tone: "sky", page: "analytics",
        title: `You finish most tasks in the ${best}`,
        detail: `${count} of the ${done.length} tasks completed in the last 30 days (${Math.round((count / done.length) * 100)}%).`,
      };
    },
  ],

  // All insights that apply right now. A rule that fails is skipped, never shown wrong.
  collect() {
    const results = [];
    for (const rule of this.RULES) {
      try {
        const insight = rule();
        if (insight) results.push(insight);
      } catch (error) {
        console.error(`Insight rule "${rule.name}" failed:`, error);
      }
    }
    return results;
  },

  listHtml(insights) {
    return `<ul class="insight-list">${insights.map((i) => `
      <li class="insight" data-insight="${i.id}">
        <span class="card-icon ${i.tone === "rose" ? "rose" : i.tone}">${icon(i.icon)}</span>
        <span class="insight-text">
          <strong>${UI.escape(i.title)}</strong>
          <span>${UI.escape(i.detail)}</span>
        </span>
        ${i.page ? `<a class="card-link" href="#/${i.page}" aria-label="Open ${i.page}">${icon("chevron-right")}</a>` : ""}
      </li>`).join("")}</ul>`;
  },

  // A full card (Analytics page)
  renderCard(container) {
    const insights = this.collect();
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon amber">${icon("lightbulb")}</span>Observations</h3>
        <span class="muted small">From your own data · each shows the numbers behind it</span>
      </div>
      ${insights.length ? this.listHtml(insights)
        : UI.emptyState("lightbulb", "Not enough data yet", "Observations appear once there's enough history, e.g. a few study sessions, tasks or expenses.")}`;
  },

  // Dashboard widget: the first 3
  renderWidget(container) {
    const insights = this.collect().slice(0, 3);
    container.innerHTML = `
      <div class="card-header">
        <h3 class="card-title"><span class="card-icon amber">${icon("lightbulb")}</span>Insights</h3>
        <a class="card-link" href="#/analytics">All ${icon("chevron-right")}</a>
      </div>
      ${insights.length ? this.listHtml(insights)
        : UI.emptyState("lightbulb", "Not enough data yet", "Keep using the app; observations appear when there's enough history.")}`;
  },
};

Modules.register({
  id: "insights",
  order: 92,
  widgets: [{ id: "insights", label: "Insights", span: 4, order: 65, render: (el) => Insights.renderWidget(el) }],
});
